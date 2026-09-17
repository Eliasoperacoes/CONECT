/**
 * Verificação da tela de conversa — CONECTA
 *
 * Testes de LEITURA DO CÓDIGO, não de comportamento: a tela é React e aqui
 * não há navegador. Servem para prender decisões que já se perderam antes
 * numa refatoração e que só reaparecem como reclamação de quem usa.
 */
import { test, expect } from 'bun:test';

const lerTela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/TelaConversa.tsx', import.meta.url)).text();

/**
 * O navegador abria uma lista com tudo que já foi digitado no campo, POR
 * CIMA da conversa. É o histórico de formulário dele, não uma função nossa,
 * e num campo de conversa não serve para nada: ninguém quer reenviar a
 * mensagem de ontem, e a lista tapa justamente o que se está lendo.
 */
test('o campo de mensagem nao abre a lista de sugestoes do navegador', async () => {
  const tela = await lerTela();

  const inicio = tela.indexOf('id="campo-mensagem-texto"');
  expect(inicio).toBeGreaterThan(-1);
  const campo = tela.slice(inicio, tela.indexOf('/>', inicio));
  expect(campo).toContain('autoComplete="off"');

  // O formulário também precisa dizer: o navegador reabre o histórico por ele
  const abreForm = tela.indexOf('onSubmit={lidarEnvioTexto}');
  expect(abreForm).toBeGreaterThan(-1);
  expect(tela.slice(abreForm, tela.indexOf('>', abreForm))).toContain('autoComplete="off"');
});

/**
 * Tirar print e colar é como se manda uma tela de sistema ou um código de
 * peça no computador. Sem isto era preciso salvar o arquivo, achar a pasta e
 * anexar — três passos para o que devia ser um atalho.
 */
test('Ctrl+V manda o print para a conversa', async () => {
  const tela = await lerTela();

  expect(tela).toContain("window.addEventListener('paste', aoColar)");
  expect(tela).toContain("window.removeEventListener('paste', aoColar)");
  expect(tela).toContain("i.type.startsWith('image/')");

  /**
   * O ouvinte precisa ficar na JANELA, não no campo: quem acaba de apertar
   * PrintScreen não clicou em lugar nenhum, e exigir foco no campo faria o
   * Ctrl+V parecer quebrado metade das vezes.
   */
  expect(tela).not.toContain('onPaste={aoColar}');
});

/**
 * Colar TEXTO continua sendo do campo de texto. Interceptar tudo faria o
 * Ctrl+V de um código de peça parar de funcionar — e essa é a colagem que
 * mais acontece no dia.
 */
test('colar texto continua funcionando como sempre', async () => {
  const tela = await lerTela();

  const inicio = tela.indexOf('const aoColar =');
  const fim = tela.indexOf('window.addEventListener', inicio);
  expect(inicio).toBeGreaterThan(-1);
  const corpo = tela.slice(inicio, fim);

  // Sai sem fazer nada quando não há imagem na área de transferência
  expect(corpo).toContain('if (!daImagem) return;');

  // E o preventDefault só acontece DEPOIS de achar a imagem, senão o texto
  // colado seria engolido
  expect(corpo.indexOf('if (!daImagem) return;')).toBeLessThan(
    corpo.indexOf('evento.preventDefault()')
  );
});

/**
 * Um só caminho para mandar foto.
 *
 * O clipe de anexo e o Ctrl+V precisam chegar no mesmo lugar: se cada um
 * montar a mensagem por conta, um deles vai esquecer a compressão e a foto
 * de celular volta a estourar o navegador.
 */
test('anexar e colar usam o mesmo envio de imagem', async () => {
  const tela = await lerTela();

  const chamadas = (tela.match(/enviarComoImagem\(/g) || []).length;
  // Os dois caminhos: o clipe de anexo e o Ctrl+V
  expect(chamadas).toBe(2);

  const inicio = tela.indexOf('const enviarComoImagem');
  const fim = tela.indexOf('const lidarEnvioArquivo', inicio);
  const corpo = tela.slice(inicio, fim);
  expect(corpo).toContain('await comprimirImagem(arquivo)');
  expect(corpo).toContain("tipo: 'imagem'");
});

/**
 * AVISO DO CELULAR
 *
 * Três defeitos que faziam o aviso parecer "simples demais", e o pior deles
 * era silencioso: o celular não tocava da segunda mensagem em diante.
 */
test('o aviso volta a chamar atencao a cada mensagem da mesma conversa', async () => {
  const avisos = await Bun.file(
    new URL('./notificacoes.ts', import.meta.url)
  ).text();

  /**
   * A `tag` faz o aviso da mesma conversa SUBSTITUIR o anterior, para dez
   * mensagens não virarem dez pilhas. Só que substituir é silencioso por
   * padrão: da segunda mensagem em diante o texto trocava sem vibrar e sem
   * tocar, e quem largou o celular na bancada não ficava sabendo.
   */
  expect(avisos).toContain('renotify: true');
  expect(avisos).toContain('tag: `conecta-${dados.conversaId}`');

  // Na loja, com barulho de oficina, a vibração é o que realmente avisa
  expect(avisos).toContain('vibrate:');
});

test('o aviso leva a conversa junto, para o toque saber o que abrir', async () => {
  const avisos = await Bun.file(
    new URL('./notificacoes.ts', import.meta.url)
  ).text();

  // Sem este dado o trabalhador só trazia a janela para a frente, na tela em
  // que ela estivesse
  expect(avisos).toContain('conversaId: dados.conversaId');

  const trabalhador = await Bun.file(
    new URL('../../public/sw-avisos.js', import.meta.url)
  ).text();

  expect(trabalhador).toContain("tipo: 'conecta:abrir-conversa'");
  // E o recado vai ANTES do foco: a janela pode demorar a responder
  expect(trabalhador.indexOf('janela.postMessage')).toBeLessThan(
    trabalhador.indexOf('return janela.focus()')
  );
  // Sistema fechado: abre já na conversa, pelo endereço
  expect(trabalhador).toContain("destino + '?conversa=' + encodeURIComponent(conversaId)");
});

test('o app ouve o trabalhador e limpa o endereco depois de usar', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  expect(app).toContain("evento.data?.tipo !== 'conecta:abrir-conversa'");
  expect(app).toContain("navigator.serviceWorker?.addEventListener('message'");
  expect(app).toContain("navigator.serviceWorker?.removeEventListener('message'");

  /**
   * O endereço é lido UMA vez e apagado da barra. Sem isso, recarregar a
   * página reabriria a mesma conversa para sempre.
   */
  expect(app).toContain("endereco.searchParams.delete('conversa')");
  expect(app).toContain('window.history.replaceState');

  /**
   * O aviso de jornadas usa um id que não é conversa nenhuma. Abrir uma
   * janela vazia seria pior do que não abrir nada.
   */
  expect(app).toContain('!bancoDados.obterConversaPorId(id)');
});

/**
 * RESPONDER MENSAGEM
 *
 * Pedido do Elias, para melhorar o contexto entre as pessoas: em grupo com
 * dez pessoas falando, "pode ser" não diz a que.
 */
test('a resposta guarda so o id da mensagem citada', async () => {
  const tipos = await Bun.file(new URL('../tipos.ts', import.meta.url)).text();
  expect(tipos).toContain('respondendoA?: string;');

  /**
   * Copiar o texto citado junto pareceria mais simples e criaria uma segunda
   * verdade: original editado, e a citação continuaria mostrando o que já
   * não existe.
   */
  expect(tipos).not.toContain('textoRespondido');
  expect(tipos).not.toContain('respondendoTexto');
});

test('a resposta atravessa o caminho inteiro ate o banco', async () => {
  const servico = await Bun.file(
    new URL('./bancoDados.ts', import.meta.url)
  ).text();
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  // O envio aceita e carrega
  expect(servico).toContain('respondendoA?: string;');
  expect(servico).toContain('respondendoA: conteudo.respondendoA');

  // Sobe e desce do banco. Um lado sem o outro faz a citação sumir ao
  // recarregar a página — e só aparece para quem estava com a aba aberta.
  expect(ponte).toContain('responde_a: m.respondendoA ?? null');
  expect(ponte).toContain('respondendoA: linha.responde_a || undefined');
  expect(ponte).toContain('responde_a: string | null;');
});

test('a coluna da resposta existe no banco e nao apaga em cascata', async () => {
  const sql = await Bun.file(
    new URL('../../supabase/responder-mensagem.sql', import.meta.url)
  ).text();

  expect(sql).toContain('add column if not exists responde_a');

  /**
   * `on delete set null`, nunca cascade: quem apaga a mensagem original não
   * pode apagar as respostas dela. A conversa continua legível e só a
   * citação some — apagar em cascata levaria junto o que as OUTRAS pessoas
   * escreveram.
   */
  expect(sql).toContain('on delete set null');
  expect(sql).not.toContain('on delete cascade');

  // Toda mudança de estrutura precisa avisar o PostgREST, senão a coluna
  // existe no banco e o aplicativo jura que não
  expect(sql).toContain("notify pgrst, 'reload schema'");
});

test('a tela responde, cita e leva ate a mensagem original', async () => {
  const tela = await lerTela();

  // Responder existe nos DOIS caminhos: o hover do computador e o menu do
  // celular. Só um dos dois deixaria metade da rede sem a função.
  expect((tela.match(/responderMensagem\(msg\)/g) || []).length).toBe(2);

  // A citação leva até a original: citação que não leva a lugar nenhum
  // obriga a rolar procurando, que é o trabalho que responder deveria poupar
  expect(tela).toContain('irAteMensagem(citada.id)');
  expect(tela).toContain('destaque-citacao');

  // O texto citado é montado na hora, a partir da mensagem original
  expect(tela).toContain('montarPreviaDaMensagem(citada)');

  // Original apagado: a resposta continua legível, com o aviso no lugar
  expect(tela).toContain("'Mensagem apagada'");
});

test('desistir de citar nao apaga o que ja foi digitado', async () => {
  const tela = await lerTela();

  const inicio = tela.indexOf('const lidarEnvioTexto');
  const fim = tela.indexOf('const responderMensagem', inicio);
  const corpo = tela.slice(inicio, fim);

  /**
   * A citação sai da caixa junto com o texto e VOLTA se o envio falhar.
   * Sem isso a resposta reenviada perderia justamente o contexto que a
   * pessoa quis dar.
   */
  expect(corpo).toContain('const citada = respondendoId');
  expect(corpo).toContain('setRespondendoId(citada)');

  // E o X da barra mexe só na citação, não no texto
  expect(tela).toContain('onClick={() => setRespondendoId(null)}');
});
