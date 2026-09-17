/**
 * Verificação da tela de conversa — CONECTA
 *
 * Testes de LEITURA DO CÓDIGO, não de comportamento: a tela é React e aqui
 * não há navegador. Servem para prender decisões que já se perderam antes
 * numa refatoração e que só reaparecem como reclamação de quem usa.
 */
import { test, expect } from 'bun:test';

/** O trecho do onScroll da lista de mensagens. */
const s_rolagem = (tela: string): string => {
  const i = tela.indexOf('onScroll={');
  return i === -1 ? '' : tela.slice(i, i + 1200);
};

/**
 * O código da tela, SEM os comentários.
 *
 * Três vezes um teste reprovou o código certo porque procurava um texto que
 * só existia no comentário que explicava por que aquele texto tinha saído.
 * Quando a verificação é sobre o que o código FAZ, ela lê só o código.
 */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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

  // Um caminho so, agora que as acoes moram todas no mesmo menu. Dois seria
  // duas listas da mesma coisa, que e como funcoes passam a divergir.
  expect((tela.match(/responderMensagem\(msg\)/g) || []).length).toBe(1);

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

/**
 * AS CONVERSAS QUE NÃO COUBERAM
 *
 * Duas tentativas erradas antes desta, e vale o registro das duas porque a
 * segunda parecia consertar a primeira e repetiu o mesmo estrago.
 *
 * 1ª: o App posicionava cada conversa encolhida somando 210px por barra,
 *     enquanto a barra desenhada crescia com o nome de quem estava do outro
 *     lado. Umas caíam por cima das outras e sobrava vão no fim.
 *
 * 2ª: uma fila de pastilhas de largura fixa, cinco à vista. Com três
 *     conversas abertas ocupando a direita, sobravam uns 230px para a fila:
 *     as pastilhas seguintes ficavam roladas para fora, invisíveis, e sem
 *     barra de rolagem para denunciar que existiam.
 *
 * As duas terminavam no mesmo lugar: conversa aberta que some sem caminho
 * de volta. Agora não há fila nenhuma — há uma contagem.
 */
test('nao existe mais fila de conversas encolhidas se espalhando', async () => {
  const arquivos = [...new Bun.Glob('src/**/*.tsx').scanSync('.')];

  // O componente da fila foi removido, não apenas deixado de usar
  expect(arquivos).not.toContain('src/componentes/BarraConversasEncolhidas.tsx');

  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  expect(app).toContain('<ConversasEmEspera');

  /**
   * Nenhuma conta de posição para conversa encolhida, em lugar nenhum. Era
   * de onde vinham as duas versões do problema.
   */
  expect(app).not.toContain('LARGURA_ENCOLHIDA');
  expect(app).not.toContain('espacoDasAbertas');

  const espera = await Bun.file(
    new URL('../componentes/ConversasEmEspera.tsx', import.meta.url)
  ).text();
  // Posição fixa no canto: não acompanha as janelas, então não escorrega
  expect(espera).toContain('fixed bottom-0 left-3');
  expect(espera).not.toContain('maxWidth');
});

test('so as abertas ganham posicao, e sao no maximo tres', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  const inicio = app.indexOf('const posicoesDasJanelas');
  const fim = app.indexOf('const conversasEncolhidas', inicio);
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  expect(app.slice(inicio, fim)).toContain('.filter((j) => !j.encolhida)');

  expect(app).toContain('MAXIMO_JANELAS_ABERTAS = 3');
});

/**
 * Quem acaba de escolher uma conversa quer VÊ-LA, não procurá-la na ponta
 * esquerda de uma fileira. Antes ela entrava no fim, e escolher da lista
 * abria a conversa no canto mais distante da tela.
 */
test('a conversa escolhida abre no primeiro lugar', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  const inicio = app.indexOf('const abrirJanela');
  const fim = app.indexOf('const fecharJanela', inicio);
  const corpo = app.slice(inicio, fim);

  // A nova vai na frente da lista, e o primeiro lugar é o mais próximo do
  // painel de contatos
  expect(corpo).toContain('[{ id, encolhida: false }, ...outras]');
  expect(corpo).not.toContain('[...atuais, { id, encolhida: false }]');
});

/**
 * Antes a mais antiga era DESCARTADA para a nova caber: a pessoa abria a
 * quarta conversa e perdia a primeira, sem aviso e sem caminho de volta.
 */
test('o que passa de tres encolhe, nunca fecha', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  const inicio = app.indexOf('const abrirJanela');
  const fim = app.indexOf('const fecharJanela', inicio);
  const corpo = app.slice(inicio, fim);

  expect(corpo).not.toContain('atuais.slice(1)');
  expect(corpo).toContain('{ ...j, encolhida: true }');
  expect(corpo).toContain('abertas <= MAXIMO_JANELAS_ABERTAS');
});

test('a contagem abre a lista e nada some sem caminho de volta', async () => {
  const espera = await Bun.file(
    new URL('../componentes/ConversasEmEspera.tsx', import.meta.url)
  ).text();

  // A contagem de TUDO que está em espera, não de um resto
  expect(espera).toContain('const quantas = conversas.length');
  // E a lista inteira para escolher
  expect(espera).toContain('conversas.map((conversa)');
  expect(espera).toContain('aoAbrir(conversa.id)');
});

/**
 * AS AÇÕES DA MENSAGEM FICAM ATRÁS DE UM BOTÃO SÓ.
 *
 * O computador mostrava as seis de uma vez — responder, fixar, encaminhar,
 * selecionar, editar, apagar — numa fileira de ícones sem rótulo a cada
 * passada de mouse. Seis alvos pequenos e parecidos ao lado de cada balão.
 *
 * E eram DOIS menus para o mesmo conjunto: a fileira do computador e o
 * painel do celular. Duas listas da mesma coisa é como funções passam a
 * divergir — já aconteceu aqui com setor, ficha e alçada.
 */
test('as acoes da mensagem nao aparecem todas de uma vez', async () => {
  const tela = await lerTela();

  // A fileira de ícones do computador não existe mais
  expect(tela).not.toContain('hidden md:flex opacity-0 group-hover:opacity-100');

  // O botão de opções vale nos dois aparelhos
  expect(tela).not.toContain('md:hidden w-7 h-7 rounded-full');
  expect(tela).toContain('md:opacity-0 md:group-hover:opacity-100');
});

test('o menu unico oferece as seis acoes, com rotulo em texto', async () => {
  const tela = await lerTela();

  const inicio = tela.indexOf('O MENU DAS AÇÕES');
  expect(inicio).toBeGreaterThan(-1);
  const menu = tela.slice(inicio, inicio + 6000);

  for (const acao of ['Responder', 'Encaminhar', 'Selecionar', 'Editar', 'Apagar']) {
    expect(menu).toContain(acao);
  }
  expect(menu).toContain("msg.fixadaEm ? 'Desafixar' : 'Fixar para todos'");
});

/**
 * O MENU NÃO PODE SER CORTADO NEM MEXER NA ROLAGEM.
 *
 * Ele morava DENTRO da lista de mensagens, posicionado em relação ao balão.
 * A lista tem `overflow`, então perto do topo da conversa o menu aparecia
 * cortado ao meio — e abrir um menu alto ainda atrapalhava a rolagem.
 */
test('o menu de acoes fica fora da lista e ancorado na janela', async () => {
  const tela = await lerTela();

  const inicio = tela.indexOf('O MENU DAS AÇÕES');
  const menu = tela.slice(inicio, inicio + 6000);

  // Posição da JANELA, não do balão: não há borda de lista que o corte
  expect(menu).not.toContain('absolute z-40');
  expect(tela).toContain('id="menu-acoes-mensagem"');
  expect(tela).toContain('className="fixed z-[61]');

  // A âncora vem do botão, medida na hora do clique
  expect(tela).toContain('e.currentTarget.getBoundingClientRect()');
  expect(tela).toContain('setMenuMensagem({ msg, x: r.left, y: r.bottom })');

  // Rolar move o botão para longe da âncora, então rolar fecha — o menu e o
  // painel de emoji, que usam a mesma âncora
  expect(tela).toContain('if (menuMensagem) fecharMenuMensagem();');

  // Cabe embaixo? Senão abre para cima. E nunca passa da lateral.
  expect(tela).toContain('const cabeAbaixo =');
  expect(tela).toContain('window.innerWidth - MENU_LARGURA - 8');
});

/**
 * "A ideia é boa, mas na prática muito ruim" — o menu de 208px de largura
 * com linhas de 44px passava de 260px de altura. Compacto ele dá o mesmo
 * alcance em pouco mais de um terço do espaço.
 */
test('o menu de acoes e compacto', async () => {
  const tela = await lerTela();

  expect(tela).toContain('MENU_LARGURA = 164');
  expect(tela).toContain('MENU_ALTURA_ITEM = 32');

  // As linhas saem de um lugar só: seis cópias da mesma classe é como elas
  // começam a divergir de tamanho entre si
  expect(tela).toContain('const ItemDoMenu');
  expect(tela).toContain("className={`w-full px-3 h-8 flex items-center gap-2.5 text-xs");

  // A largura e a altura antigas não podem voltar
  expect(tela).not.toContain('w-52 rounded-xl');
  expect(tela).not.toContain('px-3 py-3 flex items-center gap-2.5');
});

test('a classe que esconde a barra de rolagem existe de verdade', async () => {
  /**
   * `no-scrollbar` é usada nas etiquetas da câmera — e nunca existiu na
   * folha de estilo. Pedia algo que não estava escrito em lugar nenhum.
   */
  const css = await Bun.file(new URL('../index.css', import.meta.url)).text();
  expect(css).toMatch(/\.no-scrollbar\s*\{[^}]*scrollbar-width:\s*none/);
  expect(css).toMatch(/\.no-scrollbar::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
});

/**
 * O BALÃO NÃO PODE DEFORMAR.
 *
 * O botão de reagir ficava na linha de baixo do balão, junto de "Editada",
 * da hora e do selo de visto. O balão tem a largura do maior filho — com
 * "Editada" no meio, essa linha passava a ser mais larga que o próprio
 * texto, o balão esticava e o emoji ficava colado na borda de dentro, com
 * cara de defeito.
 */
test('a linha de baixo do balao e so informacao, sem botao', async () => {
  const tela = await lerTela();

  const inicio = tela.indexOf('A LINHA DE BAIXO DO BALÃO');
  expect(inicio).toBeGreaterThan(-1);
  const linha = tela.slice(inicio, tela.indexOf('Picker', inicio) + 1 || inicio + 2500);

  // Nenhum botão de reagir aqui dentro
  expect(linha).not.toContain('title="Reagir com emoji"');

  // E ela pode quebrar em vez de transbordar: transbordar é o que produz a
  // aparência de defeito numa janela estreita
  expect(tela).toContain('flex flex-wrap items-center justify-end gap-x-1.5');
});

/**
 * O seletor antigo era `absolute -top-9` DENTRO da mensagem: na primeira
 * mensagem da conversa ele abria para cima e a borda da lista o cortava —
 * o mesmo defeito que o menu de ações tinha antes de sair de lá.
 */
test('o painel de emoji fica fora da lista e ancorado na janela', async () => {
  const tela = await lerTela();

  /**
   * O seletor preso à mensagem some por inteiro, estado incluído.
   *
   * A verificação é pelo ESTADO, e não pelas classes de posição: os
   * comentários do arquivo citam "absolute -top-9" ao contar esta história,
   * e um teste que procurasse o texto reprovaria o código certo por causa da
   * própria explicação.
   */
  expect(tela).not.toContain('mensagemReagindoId');
  expect(tela).toContain('id="painel-emoji-reacao"');
  expect(tela).toContain('className="fixed z-[61] p-2 rounded-xl');

  // Mesmo cálculo do menu: uma segunda conta de "cabe embaixo?" discordaria
  expect(tela).toContain('PAINEL_EMOJI_ALTURA + 12 <= window.innerHeight');
  expect(tela).toContain('window.innerWidth - PAINEL_EMOJI_LARGURA - 8');

  // Rolar fecha os dois: a âncora é um ponto da tela
  const rolagem = s_rolagem(tela);
  expect(rolagem).toContain('if (menuMensagem) fecharMenuMensagem();');
  expect(rolagem).toContain('if (painelReacao) fecharPainelReacao();');
});

test('reagir virou acao do menu, com mais opcoes de emoji', async () => {
  const tela = await lerTela();

  // Reagir é a primeira do menu: é a ação mais leve das sete
  const itens = tela.indexOf('const itens: React.ReactNode[] = []');
  expect(itens).toBeGreaterThan(-1);
  const ondeReagir = tela.indexOf('key="reagir"', itens);
  const ondeResponder = tela.indexOf('key="responder"', itens);
  // As duas precisam EXISTIR antes de comparar: um indexOf que não acha
  // devolve -1, e -1 é menor que qualquer coisa — o teste passaria justo
  // quando a ação tivesse sumido
  expect(ondeReagir).toBeGreaterThan(-1);
  expect(ondeResponder).toBeGreaterThan(-1);
  expect(ondeReagir).toBeLessThan(ondeResponder);

  // Eram quatro emoji. "Mais opções", como foi pedido.
  expect(tela).not.toContain('REACOES_RAPIDAS');
  const lista = tela.slice(
    tela.indexOf('const EMOJIS_DE_REACAO'),
    tela.indexOf('PAINEL_EMOJI_LARGURA')
  );
  expect((lista.match(/'/g) || []).length / 2).toBeGreaterThanOrEqual(32);

  // Uma grade só, sem abas nem busca: escolher é um toque
  expect(tela).toContain('grid grid-cols-8');
});

/**
 * O MENU DA CONVERSA TAMBÉM SAÍA CORTADO.
 *
 * Era `absolute right-2 top-12` dentro do item da lista, e a lista rola e
 * tem `overflow`: nas últimas conversas ele abria para baixo e a borda o
 * cortava. Terceiro menu do sistema com o mesmo defeito — mensagem, emoji e
 * agora este.
 */
test('o menu da conversa fica ancorado na janela', async () => {
  const item = await Bun.file(
    new URL('../componentes/ItemConversa.tsx', import.meta.url)
  ).text();

  /**
   * Verificado pelo que o menu É, e não pelas classes antigas: os
   * comentários deste arquivo citam "absolute right-2 top-12" ao contar
   * esta história, e um teste que procurasse o texto reprovaria o código
   * certo por causa da própria explicação.
   */
  expect(item).toContain('id="menu-item-conversa"');
  expect(item).toContain('className="fixed z-[61]');

  // O mesmo cálculo dos outros dois: cabe embaixo, senão abre para cima
  expect(item).toContain('const cabeAbaixo =');
  expect(item).toContain('window.innerWidth - MENU_LARGURA - 8');
  expect(item).toContain('e.currentTarget.getBoundingClientRect()');
});

test('o menu da conversa oferece Arquivar e Excluir, separados', async () => {
  const item = await Bun.file(
    new URL('../componentes/ItemConversa.tsx', import.meta.url)
  ).text();

  // "Excluir conversa" não excluía nada: arquivava. São duas opções agora,
  // com as duas ações separadas de verdade.
  expect(item).toContain('Arquivar');
  expect(item).toContain('ocultarConversa(colaboradorId, conversa.id)');

  // E a exclusão de verdade, que não volta sozinha
  expect(item).toContain('removerConversaDaLista(colaboradorId, conversa.id)');
});

/**
 * ABRIR UMA CONVERSA CAI NA ÚLTIMA MENSAGEM.
 *
 * Não caía: parava no meio do histórico, ou no começo.
 */
test('abrir a conversa salta para o fim, sem animacao', async () => {
  const tela = await lerTela();

  /**
   * Suave é uma ANIMAÇÃO: leva centenas de milissegundos e é cancelada por
   * qualquer rolagem no meio — inclusive a que o navegador faz ao montar a
   * lista. A conversa parava onde a animação foi interrompida.
   */
  expect(tela).not.toContain("refFimMensagens.current?.scrollIntoView({ behavior: 'smooth' })");
  expect(tela).toContain('lista.scrollTop = lista.scrollHeight');
  expect(tela).toContain('useLayoutEffect');

  /**
   * A outra causa: foto e áudio só ocupam o espaço deles depois de carregar.
   * O evento `load` de <img> não sobe pela árvore, então tem de ser ouvido
   * na CAPTURA — o `true` no fim.
   */
  expect(tela).toContain("lista.addEventListener('load', aoCarregarAlgo, true)");
});

test('quem subiu para ler o passado nao e arrancado de la', async () => {
  const tela = await lerTela();

  // A trava solta quando a pessoa sobe, e volta quando ela desce até o fim
  expect(tela).toContain('grudadoNoFim.current =');
  expect(tela).toContain('el.scrollHeight - el.scrollTop - el.clientHeight <= 80');
  expect(tela).toContain('if (grudadoNoFim.current)');
});

test('abrir uma conversa desfaz a exclusao dela', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  /**
   * Conversa excluída não volta nem com mensagem nova. A única coisa que a
   * traz de volta é a pessoa chamar o colega outra vez — e as DUAS aberturas
   * precisam fazer isso, senão o celular e o computador discordam sobre o
   * que está na lista.
   */
  expect((app.match(/reexibirConversa\(colaboradorAtual\.id, id\)/g) || []).length).toBe(2);
  expect(app).toContain('const abrirConversaEmTelaCheia');
  expect(app).not.toContain('aoClicar={() => setConversaAtivaId(c.id)}');
});

/**
 * A REGRA QUE FALTAVA NO BANCO.
 *
 * `participantes` guarda, por pessoa, o que ela decidiu sobre cada conversa:
 * fixada, arquivada, excluída. A tabela tinha regra de LER, INSERIR e
 * APAGAR — e nenhuma de ATUALIZAR.
 *
 * Com a segurança por linha ligada, um `update` sem regra não dá erro: ele
 * não encontra linha nenhuma e devolve sucesso. Por isso excluir funcionava
 * na tela e a próxima sincronização trazia tudo de volta — a escolha nunca
 * saía do navegador.
 */
test('participantes tem regra de ATUALIZAR, e so da propria linha', async () => {
  const esquema = await Bun.file(
    new URL('../../supabase/esquema.sql', import.meta.url)
  ).text();

  const inicio = esquema.indexOf('create policy participantes_atualizacao');
  expect(inicio).toBeGreaterThan(-1);
  const regra = esquema.slice(inicio, inicio + 400);

  expect(regra).toContain('for update');

  /**
   * Os DOIS lados. O `using` decide quais linhas a pessoa alcança; o
   * `with check` impede que ela entregue a linha para outra pessoa ao
   * gravar. Sem o segundo, daria para mexer na lista do colega.
   */
  expect(regra).toContain('using (colaborador_id = public.meu_colaborador_id())');
  expect(regra).toContain('with check (colaborador_id = public.meu_colaborador_id())');

  // E o arquivo avulso, para rodar sem reexecutar o esquema inteiro
  const avulso = await Bun.file(
    new URL('../../supabase/participantes-atualizacao.sql', import.meta.url)
  ).text();
  expect(avulso).toContain('participantes_atualizacao');
  expect(avulso).toContain("notify pgrst, 'reload schema'");
});

/**
 * Limpar a aba uma a uma, com três toques cada, é o que fez pedir isto:
 * quem volta de férias tem vinte conversas para tirar da frente.
 */
test('da para marcar varias conversas e agir sobre todas', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelConversas.tsx', import.meta.url)
  ).text();

  expect(painel).toContain('const [marcadas, setMarcadas]');
  expect(painel).toContain('const alternarMarcada =');

  /**
   * As duas ações em lote passam pelas MESMAS funções do menu de uma
   * conversa só. Arquivar em lote que divergisse de arquivar uma seria
   * descoberto por reclamação, não por teste.
   */
  expect(painel).toContain('aplicarNasMarcadas(ocultarConversa)');
  expect(painel).toContain('aplicarNasMarcadas(removerConversaDaLista)');
  expect(painel).not.toContain('removida: true');
});

test('em modo de selecao o toque marca, e o menu individual sai de cena', async () => {
  const item = await Bun.file(
    new URL('../componentes/ItemConversa.tsx', import.meta.url)
  ).text();

  expect(item).toContain('onClick={modoSelecao ? aoAlternarMarcada : aoClicar}');

  // Ter os dois caminhos ao mesmo tempo só faz a pessoa errar qual está usando
  expect(item).toContain('const temAcoes = !!colaboradorId && !modoSelecao');
});

/**
 * O BALÃO NÃO PODE SER ESTICADO POR UMA FOTO.
 *
 * Relatado: uma foto de cadastro de peça esticou o balão além da conversa e
 * criou barra de rolagem horizontal na lista inteira. Outras fotos cabiam —
 * a diferença era a largura de origem daquela.
 *
 * Duas causas somadas:
 *
 *  - item de flex NÃO encolhe abaixo do conteúdo dele por padrão
 *    (`min-width: auto`). O balão ignorava o próprio `max-w`;
 *  - a foto pedia largura em rem: `max-w-xs sm:max-w-sm`, ou seja 384px a
 *    partir do `sm:`. E `sm:` responde ao tamanho da JANELA, não ao do
 *    balão — numa conversa flutuante de 420px, a foto pedia 384px dentro de
 *    um balão de 270px.
 */
test('o balao pode encolher, e a foto se ajusta a ele', async () => {
  const tela = await lerTela();

  // O balão volta a respeitar o próprio limite
  expect(tela).toContain("relative max-w-[85%] sm:max-w-[70%] min-w-0 rounded-2xl");
  expect(tela).toContain('flex items-center gap-2 max-w-full min-w-0');

  // A foto pede porcentagem do balão, não uma medida fixa maior que ele
  expect(semComentarios(tela)).not.toContain('min-w-[180px] max-w-xs sm:max-w-sm');
  // O que importa é a largura vir do balão, não o espaçamento — este muda
  // quando o desenho do balão muda, e já mudou uma vez
  expect(tela).toContain('w-full max-w-full min-w-0');
  expect(tela).toContain('w-full max-w-full h-auto max-h-72 object-cover');
});

test('nenhum conteudo do balao exige largura fixa', async () => {
  const tela = await lerTela();

  /**
   * Arquivo e áudio também pediam `min-w-[200px]`. Em janela estreita
   * empurram do mesmo jeito — só ainda não tinham sido notados.
   */
  const codigo = semComentarios(tela);
  expect(codigo).not.toContain('min-w-[200px]');
  expect(codigo).not.toContain('min-w-[180px]');
});

test('a conversa nao rola de lado', async () => {
  const tela = await lerTela();

  /**
   * Garantia final. O conserto de verdade são os `min-w-0`; isto existe
   * para o dia em que alguém acrescentar conteúdo novo ao balão e esquecer:
   * em vez de a conversa inteira ganhar barra horizontal, só aquele
   * conteúdo fica cortado.
   */
  expect(tela).toContain('flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3');
});

/**
 * BALÃO DE FOTO É QUASE SÓ A FOTO.
 *
 * O balão usava o mesmo respiro para tudo: 14px nos lados, 10px em cima e
 * embaixo. Num balão de texto isso é o certo; numa foto vira uma moldura
 * grossa em volta da imagem.
 */
test('o balao de foto aperta, e o de texto nao', async () => {
  const tela = await lerTela();
  const codigo = semComentarios(tela);

  // Um só lugar decide, e ele olha o tipo da mensagem
  expect(codigo).toContain('const balaoDeFoto = ehFoto && !!urlDaFoto');
  expect(codigo).toContain("balaoDeFoto ? 'p-[3px]' : 'px-3.5 py-2.5'");

  // O respiro antigo não pode continuar fixo no balão
  expect(codigo).not.toContain('min-w-0 rounded-2xl px-3.5 py-2.5');
});

test('legenda, hora e citacao recuperam o respiro que o balao perdeu', async () => {
  const tela = await lerTela();
  const codigo = semComentarios(tela);

  /**
   * Apertar o balão sem devolver o respiro a estes três coloca texto
   * encostado na borda — troca uma moldura grossa por outra feiura.
   */
  expect(codigo).toContain("balaoDeFoto ? 'px-2 pb-0.5' : ''");
  expect(codigo).toContain("balaoDeFoto ? 'px-2 pt-1' : ''");
  expect(codigo).toContain("balaoDeFoto ? 'mt-1 mx-1' : ''");

  // E a legenda, que fica colada na foto
  expect(codigo).toContain('px-2 pt-0.5 leading-snug break-words');
});

test('o canto da foto acompanha o canto do balao', async () => {
  const tela = await lerTela();
  const codigo = semComentarios(tela);

  /**
   * Com 3px de respiro, a foto e o balão quase dividem a mesma borda. O
   * canto da foto precisa ser um passo menor que o do balão (16px), senão
   * sobra um bico branco em cada quina.
   */
  expect(codigo).toContain('rounded-[13px] overflow-hidden');
  // E a borda cinza em volta da foto sai: com o balão apertado ela vira
  // um contorno duplo
  expect(codigo).not.toContain('border border-black/5 dark:border-white/10');
});
