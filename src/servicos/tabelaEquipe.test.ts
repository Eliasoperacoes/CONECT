/**
 * Verificação do BANCO DE HORAS DA EQUIPE — CONECTA
 *
 * O que motivou: a aba tinha duas listas longas empilhadas — o ciclo
 * semanal e a equipe inteira, esta em cartões de uns 90 pixels cada.
 * Num gerente com 23 pessoas davam mais de dois metros de rolagem, e o
 * cartão não dizia nada que uma linha não diga.
 *
 * O risco de compactar é perder o que fazia o cartão útil. É disso que
 * este arquivo cuida: os avisos que decidem a ação do gestor — quem não
 * bateu, quem tem dia em aberto, quanto está esperando decisão — têm
 * que sobreviver à mudança de forma.
 */
import { test, expect } from 'bun:test';

const lerTabela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/TabelaEquipe.tsx', import.meta.url)).text();

const lerCiclo = async (): Promise<string> =>
  Bun.file(new URL('../componentes/CicloSemanal.tsx', import.meta.url)).text();

const lerPainel = async (): Promise<string> =>
  Bun.file(new URL('../componentes/PainelGestao.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('A EQUIPE É TABELA, e não uma pilha de cartões', async () => {
  /**
   * Coluna alinhada COMPARA — que é o que o gestor faz de verdade ali:
   * procurar quem está fora da curva. Trinta cartões empilhados não se
   * comparam entre si; trinta linhas, sim.
   */
  const tabela = semComentarios(await lerTabela());

  expect(tabela).toContain('<table');
  expect(tabela).toContain('<thead>');
  expect(tabela).toContain('tabular-nums');

  // E o painel usa a tabela, em vez da lista antiga
  const painel = semComentarios(await lerPainel());
  expect(painel).toContain('<TabelaEquipe');
  expect(painel).toContain('linhas={exibidos}');
});

test('NENHUM AVISO SE PERDEU NA COMPACTAÇÃO', async () => {
  /**
   * O cartão tinha três avisos, e os três decidem o que o gestor faz:
   *
   *  - quem não bateu hoje — é a cobrança do dia;
   *  - quantos dias ficaram em aberto — é o que trava o fechamento;
   *  - quanto saldo está esperando decisão dele — é a fila dele.
   *
   * Em tabela, o que não está numa coluna some. Estes três entraram na
   * linha da pessoa de propósito.
   */
  const tabela = semComentarios(await lerTabela());

  expect(tabela).toContain('!r.registrouHoje');
  expect(tabela).toContain('r.diasComPendencia > 0');
  expect(tabela).toContain('servicoPonto.obterSaldoPendente(c.id)');
  expect(tabela).toContain('esperando');

  // E os três botões da linha continuam lá
  expect(tabela).toContain('aoAbrirFicha(c)');
  expect(tabela).toContain('aoAbrirEspelho(c.id)');
  expect(tabela).toContain('aoAbrirConversa(c.id)');
});

test('AGRUPADO POR UNIDADE, com o resumo no cabeçalho', async () => {
  /**
   * Quem responde por mais de uma loja não lê 23 nomes seguidos — lê a
   * loja que tem problema. Recolhido, o bloco continua respondendo
   * "preciso olhar aqui?": quantos são, o saldo somado e quantos estão
   * devendo batida.
   *
   * Sem esses números no cabeçalho, recolher esconderia justamente o
   * que faz alguém abrir.
   */
  const tabela = semComentarios(await lerTabela());

  expect(tabela).toContain('const porLoja = new Map<string, ResumoPontoColaborador[]>()');
  expect(tabela).toContain('saldo: pessoas.reduce((t, p) => t + p.saldoAcumuladoMinutos, 0)');
  expect(tabela).toContain('semBater: pessoas.filter((p) => !p.registrouHoje).length');
  expect(tabela).toContain('emAberto: pessoas.filter((p) => p.diasComPendencia > 0).length');
});

test('TUDO NASCE RECOLHIDO', async () => {
  /**
   * A REGRA MUDOU, a pedido do dono do sistema.
   *
   * A primeira versão abria a unidade de quem entra, para poupar um
   * clique. Mas o pedido era tela limpa, e a unidade de quem entra é
   * justamente a maior — abrir nela é abrir com a rolagem que esta tela
   * veio tirar.
   *
   * Recolhido não é vazio: o cabeçalho de cada bloco continua dizendo
   * quantos são, o saldo somado e quem está devendo batida.
   */
  const tabela = semComentarios(await lerTabela());

  expect(tabela).toContain('useState<Set<string>>(() => new Set())');
  expect(tabela).toContain('const aberto = abertos.has(grupo.loja);');

  // Nada abre por conta própria
  expect(tabela).not.toContain('loja !== colaboradorAtual.loja');
});

test('a unidade de quem abre continua vindo PRIMEIRO', async () => {
  /**
   * Recolhida como as outras, mas no topo: é a que ele olha todo dia, e
   * empurrá-la para baixo por ordem alfabética obrigaria a procurar a
   * própria loja no meio das cinco.
   */
  const tabela = semComentarios(await lerTabela());
  expect(tabela).toContain('if (a.loja === colaboradorAtual.loja) return -1;');
});

test('GUARDA OS ABERTOS, e não os fechados', async () => {
  /**
   * O conjunto guardado tem que ser o PEQUENO — agora os abertos, que
   * nascem vazios. Guardar os fechados exigiria listar todas as lojas
   * na montagem, e uma loja que aparecesse depois cairia no estado
   * errado: apareceria aberta num painel que deve nascer todo fechado.
   */
  const tabela = semComentarios(await lerTabela());

  expect(tabela).toContain('const [abertos, setAbertos] = useState<Set<string>>');
  expect(tabela).toContain('const tudoFechado = grupos.every((g) => !abertos.has(g.loja));');
});

test('dá para recolher e expandir TUDO de uma vez', async () => {
  /**
   * Com cinco unidades, recolher uma a uma é cinco cliques para chegar
   * à tela limpa que se pediu.
   */
  const tabela = semComentarios(await lerTabela());

  expect(tabela).toContain('const alternarTudo =');
  expect(tabela).toContain('Expandir tudo');
  expect(tabela).toContain('Recolher tudo');

  // Com um grupo só, o botão geral não aparece: o do grupo já basta
  expect(tabela).toContain('{grupos.length > 1 && (');
});

test('NO CICLO, A LISTA RECOLHE MAS OS NÚMEROS FICAM', async () => {
  /**
   * Era a segunda lista longa da tela. Mas recolher o cartão inteiro
   * esconderia "sem bater: 4", que é justamente o aviso que faz alguém
   * abrir — então só os nomes somem.
   */
  const ciclo = semComentarios(await lerCiclo());

  // E nasce RECOLHIDA, como os blocos da equipe
  expect(ciclo).toContain('const [listaAberta, setListaAberta] = useState(false)');
  expect(ciclo).toContain('!listaAberta ? null : (');

  /**
   * O cabeçalho conta quantos são mesmo recolhido. Conferido sem a
   * quebra de linha: o arquivo é CRLF no Windows, e casar o texto com
   * `\n` no meio produz um teste que falha por espaço em branco em vez
   * de por defeito.
   */
  const semEspacos = ciclo.replace(/\s+/g, ' ');
  expect(semEspacos).toContain("'pessoa precisa' : 'pessoas precisam'");
  expect(semEspacos).toContain('de você');

  /**
   * E os três números ficam FORA do que recolhe: eles são desenhados
   * antes do botão que recolhe, e o botão só esconde o que vem depois.
   *
   * Comparado contra o CLIQUE, e não contra a declaração do estado —
   * ela mora lá em cima, no meio dos outros `useState`, e compará-la
   * daria um teste que passa com os números em qualquer lugar.
   */
  const numeros = ciclo.indexOf('Sem bater');
  const botaoDeRecolher = ciclo.indexOf('setListaAberta((v) => !v)');

  expect(numeros).toBeGreaterThan(-1);
  expect(botaoDeRecolher).toBeGreaterThan(-1);
  expect(numeros).toBeLessThan(botaoDeRecolher);
});
