/**
 * Verificação das preferências de conversa — CONECTA
 *
 * Decisão do dono do sistema: "excluir conversa" tira da lista de quem
 * clicou, e o histórico fica no banco. O que estes testes prendem é que
 * ocultar nunca vire apagar, e que uma conversa oculta não engula mensagem
 * nova — alguém ser chamado e não ficar sabendo seria pior do que não ter
 * a função.
 */
import { test, expect, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const {
  alternarFixada,
  estaFixada,
  ocultarConversa,
  reexibirConversa,
  deveAparecer,
  aplicarPreferencias,
  contarArquivadas,
  reexibirArquivadas,
  estaRemovida,
  obterPreferencias,
  aplicarPreferenciasDaNuvem,
  removerConversaDaLista,
} = await import('./preferenciasConversa');

const EU = 'colab-elias';
const OUTRO = 'colab-ana';

const conversa = (id: string, atualizadoEm: string) => ({ id, atualizadoEm });

/**
 * Datas RELATIVAS ao agora, nunca fixas.
 *
 * A primeira versao usava '2026-09-16T23:00' como "depois". `ocultarConversa`
 * grava o instante real, entao o teste passava de manha e quebrava depois
 * das 23h UTC — falha que aparece pela HORA do dia, e nao pelo codigo.
 */
const ONTEM = new Date(Date.now() - 48 * 3600e3).toISOString();
const AGORA = new Date(Date.now() - 3600e3).toISOString();
const DEPOIS = new Date(Date.now() + 24 * 3600e3).toISOString();

beforeEach(() => armazenamento.clear());

test('fixar sobe a conversa e não mexe na ordem do resto', () => {
  const lista = [
    conversa('c1', DEPOIS),
    conversa('c2', AGORA),
    conversa('c3', ONTEM),
  ];

  alternarFixada(EU, 'c3');
  expect(aplicarPreferencias(EU, lista).map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
});

test('fixar é reversível', () => {
  expect(alternarFixada(EU, 'c1')).toBe(true);
  expect(estaFixada(EU, 'c1')).toBe(true);
  expect(alternarFixada(EU, 'c1')).toBe(false);
  expect(estaFixada(EU, 'c1')).toBe(false);
});

test('A PREFERÊNCIA É DE CADA PESSOA', () => {
  // O que o gerente fixa não pode aparecer fixado para o colaborador
  alternarFixada(EU, 'c1');
  ocultarConversa(EU, 'c2');

  expect(estaFixada(OUTRO, 'c1')).toBe(false);
  expect(deveAparecer(OUTRO, conversa('c2', AGORA))).toBe(true);
});

// ============================================================
// OCULTAR NÃO É APAGAR
// ============================================================

test('ocultar tira da lista de quem pediu, e só dele', () => {
  const lista = [conversa('c1', AGORA), conversa('c2', AGORA)];

  ocultarConversa(EU, 'c1');
  expect(aplicarPreferencias(EU, lista).map((c) => c.id)).toEqual(['c2']);
  expect(aplicarPreferencias(OUTRO, lista).map((c) => c.id)).toEqual(['c1', 'c2']);
});

test('MENSAGEM NOVA TRAZ A CONVERSA DE VOLTA', () => {
  /**
   * O pior desfecho possível desta função: a pessoa oculta uma conversa,
   * alguém a chama ali, e a mensagem cai num lugar invisível. Ela nunca
   * sabe que foi chamada.
   */
  ocultarConversa(EU, 'c1');

  // Sem novidade, continua oculta
  expect(deveAparecer(EU, conversa('c1', ONTEM))).toBe(false);

  // Mensagem depois de ocultar: volta
  expect(deveAparecer(EU, conversa('c1', DEPOIS))).toBe(true);
});

test('ocultar não apaga: a preferência guarda só a data', () => {
  ocultarConversa(EU, 'c1');
  const pref = obterPreferencias(EU).c1;

  expect(pref.ocultaDesde).toBeTruthy();
  // Nada aqui remove mensagem; quem apaga é a limpeza dos 3 meses no banco
  expect(Object.keys(pref)).not.toContain('mensagens');
});

test('ocultar uma conversa fixada solta o alfinete', () => {
  // Senão ela voltaria grudada no topo assim que chegasse mensagem — a
  // pessoa tirou da frente e a conversa reapareceria em primeiro lugar
  alternarFixada(EU, 'c1');
  ocultarConversa(EU, 'c1');

  expect(estaFixada(EU, 'c1')).toBe(false);
});

test('dá para trazer de volta sem esperar mensagem', () => {
  ocultarConversa(EU, 'c1');
  expect(deveAparecer(EU, conversa('c1', ONTEM))).toBe(false);

  reexibirConversa(EU, 'c1');
  expect(deveAparecer(EU, conversa('c1', ONTEM))).toBe(true);
});

test('a lista sabe quantas estão escondidas', () => {
  const lista = [conversa('c1', ONTEM), conversa('c2', ONTEM), conversa('c3', ONTEM)];
  ocultarConversa(EU, 'c1');
  ocultarConversa(EU, 'c2');

  expect(contarArquivadas(EU, lista)).toBe(2);
  expect(contarArquivadas(OUTRO, lista)).toBe(0);
});

test('data estragada não faz a conversa sumir', () => {
  // Preferência antiga, relógio errado, dado pela metade: na dúvida a
  // conversa APARECE. Sumir é o erro caro; aparecer a mais, não.
  ocultarConversa(EU, 'c1');
  expect(deveAparecer(EU, conversa('c1', 'data-invalida'))).toBe(true);
});

test('conversa sem preferência nenhuma aparece', () => {
  expect(deveAparecer(EU, conversa('nunca-tocada', AGORA))).toBe(true);
  expect(aplicarPreferencias(EU, [conversa('c9', AGORA)]).map((c) => c.id)).toEqual(['c9']);
});

// ============================================================
// AS AÇÕES PRECISAM EXISTIR NAS DUAS LISTAS
// ============================================================

test('fixar e excluir moram no ITEM, não em quem lista', async () => {
  /**
   * O defeito relatado: eu pus o menu no painel flutuante do computador. A
   * barra do celular usa outra lista, montada no App — e ficou sem fixar e
   * sem excluir. A pessoa conseguia apagar MENSAGEM no telefone, mas não a
   * conversa.
   *
   * A correção foi mover as ações para o item, que as duas listas usam. Este
   * teste impede que elas voltem a morar num lado só.
   */
  const item = await Bun.file(
    new URL('../componentes/ItemConversa.tsx', import.meta.url)
  ).text();

  expect(item).toContain('alternarFixada');
  expect(item).toContain('ocultarConversa');
  // Um toque abre — não pode depender de passar o mouse
  expect(item).not.toContain('group-hover');

  // E quem lista não pode ter a própria cópia do menu
  const painel = await Bun.file(
    new URL('../componentes/PainelConversas.tsx', import.meta.url)
  ).text();
  expect(painel).not.toContain('alternarFixada');
  expect(painel).not.toContain('ocultarConversa');
});

test('as duas listas passam pelas preferências', async () => {
  // Fixar no computador tem que refletir no celular: mesma preferência,
  // mesma filtragem. Antes só o painel flutuante aplicava.
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  expect(app).toContain('aplicarPreferencias(colaboradorAtual.id, conversasIndividuais)');
  expect(app).toContain('aplicarPreferencias(colaboradorAtual.id, grupos)');
});

// ============================================================
// AS DUAS VERSÕES CONVERSAM ENTRE SI
// ============================================================

test('a preferência vai para o BANCO, não fica presa no aparelho', async () => {
  /**
   * O pedido: "ambas conversam entre si, MOBILE -> PC". Enquanto fixar e
   * ocultar viviam só no navegador, a mesma pessoa tinha duas listas
   * diferentes — fixava no computador e o celular não sabia.
   *
   * Vive em `participantes`, que já é a linha "esta pessoa nesta conversa".
   */
  const servico = await Bun.file(
    new URL('./preferenciasConversa.ts', import.meta.url)
  ).text();

  // Os QUATRO caminhos sobem: fixar, arquivar, excluir e reexibir. Um que
  // nao suba vale so neste navegador, e a lista do celular da pessoa fica
  // diferente da do computador dela.
  expect((servico.match(/void subirParaONuvem\(/g) || []).length).toBe(4);

  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  expect(ponte).toContain('salvarPreferenciaDeConversa');
  // E a sincronização traz de volta
  expect(ponte).toContain('fixada, oculta_desde');
  expect(ponte).toContain('aplicarPreferenciasDaNuvem');
});

test('UPDATE, nunca upsert, na tabela de participantes', async () => {
  // Terceira vez que essa pedra aparece: upsert vira `on conflict` e esbarra
  // na RLS. A linha de participação já existe — quem não participa não vê a
  // conversa —, então update é o certo.
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  const inicio = ponte.indexOf('async salvarPreferenciaDeConversa');
  const corpo = ponte.slice(inicio, inicio + 1400);

  expect(corpo).toContain(".update(campos)");
  expect(corpo).not.toContain('.upsert(');
});

test('a preferência lida do banco é só a DESTA pessoa', async () => {
  // A linha de participação de outro colaborador diz o que ELE fixou. Não é
  // da conta de ninguém, e aplicá-la à lista de quem lê seria errado.
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  expect(ponte).toContain('p.colaborador_id === meuId');
});

test('o comando "Selecionar" existe num lugar só', async () => {
  // Estava no menu do topo do chat E na própria mensagem. Dois caminhos
  // para a mesma coisa fazem a pessoa procurar qual é o certo.
  const tela = await Bun.file(
    new URL('../componentes/TelaConversa.tsx', import.meta.url)
  ).text();

  /**
   * A busca ignora comentários: a primeira versão deste teste achou a
   * própria explicação, escrita em comentário, e reprovou o código certo.
   * Segunda vez que caio nisso nesta base.
   */
  const semComentarios = tela
    .split('\n')
    .filter((linha) => {
      const limpa = linha.trimStart();
      return !limpa.startsWith('//') && !limpa.startsWith('*') && !limpa.startsWith('{/*');
    })
    .join('\n');

  expect(semComentarios).not.toContain('Selecionar mensagens');
  // E continua existindo na mensagem
  expect(semComentarios).toContain('Selecionar');
});

test('NENHUM HOOK DEPOIS DE UM RETURN CONDICIONAL NO APP', async () => {
  /**
   * Isto derrubou a aplicação inteira — tela branca, sem nada no lugar.
   *
   * Declarei dois `useMemo` no meio do JSX, depois dos `return` que mostram
   * a tela de login e a de verificação de sessão. React conta os hooks a
   * cada render e exige o mesmo número sempre: com o `return` no caminho,
   * eles rodavam numa passada e não rodavam na outra.
   *
   * O compilador não pega — o código é TypeScript válido. O build passa. Só
   * quebra no navegador, e quebra por inteiro.
   */
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  const linhas = app.split('\n');

  const primeiroReturnCondicional = linhas.findIndex((l) =>
    /^  if \((verificandoSessao|!autenticado|precisaTrocarSenha|painelAdminAberto)\)/.test(l)
  );
  expect(primeiroReturnCondicional).toBeGreaterThan(-1);

  const hooksTardios = linhas
    .map((linha, i) => ({ linha: linha.trim(), numero: i + 1, indice: i }))
    .filter(
      ({ linha, indice }) =>
        indice > primeiroReturnCondicional &&
        /\b(useState|useEffect|useMemo|useRef|useCallback)\(/.test(linha)
    )
    .map(({ numero, linha }) => `App.tsx:${numero} ${linha}`);

  expect(hooksTardios).toEqual([]);
});


/**
 * A ESCOLHA QUE ACABOU DE SER FEITA NÃO PODE SER DESFEITA PELA SINCRONIZAÇÃO.
 *
 * Fixar e ocultar respondem na tela na hora e sobem depois. Uma sincronização
 * que já estava a caminho chegava no meio e reescrevia o mapa com o estado
 * ANTIGO do banco: a conversa que a pessoa acabou de tirar da lista voltava
 * sozinha, e a que ela fixou se desfixava.
 *
 * Com 88 pessoas, sincronização chegando no meio não é exceção — é o normal.
 */
test('fixar sobrevive a uma sincronizacao que chega no meio', () => {
  // A pessoa fixa: a subida para o banco começa e ainda não terminou
  alternarFixada(EU, 'conv-1');
  expect(estaFixada(EU, 'conv-1')).toBe(true);

  // O banco responde com o que ele sabia ANTES: nada fixado
  aplicarPreferenciasDaNuvem(EU, {});

  expect(estaFixada(EU, 'conv-1')).toBe(true);
});

test('ocultar sobrevive a uma sincronizacao que chega no meio', () => {
  ocultarConversa(EU, 'conv-2');
  // Mensagem ANTIGA: a conversa oculta não deve reaparecer
  expect(deveAparecer(EU, conversa('conv-2', ONTEM))).toBe(false);

  aplicarPreferenciasDaNuvem(EU, {});

  expect(deveAparecer(EU, conversa('conv-2', ONTEM))).toBe(false);
});

test('o que NAO esta subindo continua vindo do banco', () => {
  // Nada em trânsito para esta conversa: o banco manda, e é isso mesmo —
  // senão uma preferência velha do aparelho sobreviveria para sempre
  aplicarPreferenciasDaNuvem(EU, { 'conv-3': { fixada: true } });
  expect(estaFixada(EU, 'conv-3')).toBe(true);

  aplicarPreferenciasDaNuvem(EU, {});
  expect(estaFixada(EU, 'conv-3')).toBe(false);
});

/**
 * ARQUIVAR E EXCLUIR SÃO COISAS DIFERENTES.
 *
 * O botão chamava-se "Excluir conversa" e não excluía nada: a conversa
 * voltava sozinha assim que o colega escrevesse. Nome que promete outra
 * coisa faz a pessoa evitar o botão certo com medo de perder o histórico.
 *
 * A diferença entre as duas é UMA só, e é ela que justifica existirem duas.
 */
test('arquivada VOLTA sozinha quando chega mensagem nova', () => {
  ocultarConversa(EU, 'conv-arq');

  // Mensagem antiga não traz de volta
  expect(deveAparecer(EU, conversa('conv-arq', ONTEM))).toBe(false);
  // Mensagem nova traz: é o "depois eu vejo"
  expect(deveAparecer(EU, conversa('conv-arq', DEPOIS))).toBe(true);
});

test('excluida NAO volta sozinha, nem com mensagem nova', () => {
  removerConversaDaLista(EU, 'conv-exc');

  expect(deveAparecer(EU, conversa('conv-exc', ONTEM))).toBe(false);
  /**
   * Esta é a linha que separa as duas funções. Se ela virar true, remover e
   * arquivar passam a ser a mesma coisa com dois nomes — duplicação de
   * função, que é o defeito que o Elias já cobrou mais de uma vez.
   */
  expect(deveAparecer(EU, conversa('conv-exc', DEPOIS))).toBe(false);
});

test('chamar o colega de novo traz a conversa excluida de volta', () => {
  removerConversaDaLista(EU, 'conv-volta');
  expect(deveAparecer(EU, conversa('conv-volta', DEPOIS))).toBe(false);

  // Abrir a conversa É o pedido de trazê-la de volta
  reexibirConversa(EU, 'conv-volta');
  expect(deveAparecer(EU, conversa('conv-volta', ONTEM))).toBe(true);
});

test('excluir tira a marca de fixada', () => {
  alternarFixada(EU, 'conv-fix');
  expect(estaFixada(EU, 'conv-fix')).toBe(true);

  // Conversa excluída que volta grudada no topo não faz sentido nenhum
  removerConversaDaLista(EU, 'conv-fix');
  expect(estaFixada(EU, 'conv-fix')).toBe(false);
});

test('a exclusao e de quem pediu: o colega continua vendo a conversa dele', () => {
  removerConversaDaLista(EU, 'conv-minha');

  expect(deveAparecer(EU, conversa('conv-minha', DEPOIS))).toBe(false);
  expect(deveAparecer(OUTRO, conversa('conv-minha', DEPOIS))).toBe(true);
});

test('a marca de excluida sobe e desce do banco', async () => {
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  // Um lado sem o outro faz a exclusão valer só neste navegador
  expect(ponte).toContain('campos.removida = preferencia.removida');
  expect(ponte).toContain("'conversa_id, colaborador_id, fixada, oculta_desde, removida'");
  expect(ponte).toContain('removida: p.removida || undefined');

  const sql = await Bun.file(
    new URL('../../supabase/conversa-removida.sql', import.meta.url)
  ).text();
  expect(sql).toContain('add column if not exists removida boolean not null default false');
  expect(sql).toContain("notify pgrst, 'reload schema'");

  // NENHUMA mensagem é tocada: excluir é sobre a lista de quem pediu
  expect(sql).not.toContain('delete from');
});

/**
 * O BOTÃO "MOSTRAR TODAS" NÃO PODE DESFAZER UMA EXCLUSÃO.
 *
 * O rodapé da lista conta quantas estão fora e devolve todas de uma vez.
 * Se as excluídas entrassem nessa conta, um clique ali desfaria toda
 * exclusão — e a diferença entre arquivar e excluir deixaria de existir na
 * prática, com um botão genérico vencendo a escolha da pessoa.
 */
test('a contagem do rodape ignora as excluidas', () => {
  const lista = [conversa('a', ONTEM), conversa('b', ONTEM), conversa('c', ONTEM)];

  ocultarConversa(EU, 'a');
  removerConversaDaLista(EU, 'b');

  // Só a arquivada é oferecida de volta
  expect(contarArquivadas(EU, lista)).toBe(1);
  expect(estaRemovida(EU, 'b')).toBe(true);
});

test('mostrar todas devolve as arquivadas e deixa as excluidas fora', () => {
  const lista = [conversa('x', ONTEM), conversa('y', ONTEM)];

  ocultarConversa(EU, 'x');
  removerConversaDaLista(EU, 'y');

  reexibirArquivadas(EU, lista);

  expect(deveAparecer(EU, conversa('x', ONTEM))).toBe(true);
  // A excluída continua fora: só volta chamando o colega de novo
  expect(deveAparecer(EU, conversa('y', ONTEM))).toBe(false);
});
