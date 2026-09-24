/**
 * Verificação da ESCALA DE FÉRIAS — CONECTA
 *
 * O que motivou: férias nasceu como uma aba dentro da escala de folgas de
 * sábado, e as duas se atropelaram — gente lançada de férias aparecia no
 * quadro do sábado, e o botão "Lançar" ficava a um clique do quadro errado.
 *
 * Férias passou a ser uma tela própria, dentro do RH. Este arquivo protege
 * a separação e as regras da tela nova. A escala de sábado tem o arquivo
 * dela, `escalaFolgas.test.ts`, que confere o outro lado da mesma linha.
 */
import { test, expect } from 'bun:test';

const lerFerias = async (): Promise<string> =>
  Bun.file(new URL('../componentes/AbaFerias.tsx', import.meta.url)).text();

const lerPainelRh = async (): Promise<string> =>
  Bun.file(new URL('../componentes/PainelRH.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('FÉRIAS TEM TELA PRÓPRIA, DENTRO DO RH', async () => {
  /**
   * A separação é o pedido. Mas ela não pode custar uma permissão nova:
   * quem abre o RH já é quem cuida de férias. Uma chave própria no
   * catálogo seria uma segunda porta para o mesmo trabalho.
   */
  const painel = await lerPainelRh();

  expect(painel).toContain("id: 'ferias'");
  expect(painel).toContain('<AbaFerias colaboradorAtual={colaboradorAtual} />');

  const ferramentas = await Bun.file('src/servicos/ferramentas.ts').text();
  expect(ferramentas).not.toContain("chave: 'escala_ferias'");
});

test('a tela de ferias NAO escreve a regra de quem pode escalar quem', async () => {
  /**
   * Quem pode escalar quem é a ALÇADA, e ela é uma função só —
   * `podeDecidirSobre`, a mesma da fila de aprovação e da escala de
   * sábado. É ela que faz a separação por loja.
   *
   * A tela pode CHAMÁ-LA. O que não pode é refazer o critério na mão,
   * lendo `liderId`/`gerenteId` por conta própria: foi assim que a
   * alçada divergiu da cadeia da última vez.
   */
  const tela = semComentarios(await lerFerias());

  expect(tela).toContain('.filter((c) => servicoPonto.podeDecidirSobre(c))');

  expect(tela).not.toContain('liderId');
  expect(tela).not.toContain('gerenteId');
  expect(tela).not.toContain('NIVEIS');
});

test('o ano inteiro, e nao o mes', async () => {
  /**
   * Férias não se planejam de mês em mês. A pergunta do gestor é "quem já
   * tirou e quando", e ela só tem resposta olhando os doze — senão ele
   * autoriza julho sem lembrar que o mesmo setor esvaziou em janeiro.
   *
   * A escala de SÁBADO é o contrário, e continua mês a mês: a folga é
   * direito mensal, e o mês seguinte não depende do anterior.
   */
  const tela = await lerFerias();

  expect(tela).toContain('MESES.map');
  expect(tela).toContain("'Dezembro'");

  // E os doze rolam de lado, em vez de empilhar
  expect(tela).toContain('overflow-x-auto');
});

test('O CALENDÁRIO COMEÇA RECOLHIDO', async () => {
  /**
   * Com os doze meses preenchidos, o calendário é a coisa mais alta da
   * tela e empurra para baixo justamente o que se veio fazer: escolher
   * gente e marcar período. Por isso nasce fechado e abre quando se
   * quer — o pedido foi este.
   */
  const tela = await lerFerias();

  expect(tela).toContain('useState(false)');
  expect(tela).toContain('setCalendarioAberto');
  expect(tela).toContain('{calendarioAberto && (');
});

test('OS MESES ALTERNAM O FUNDO, PAR E ÍMPAR', async () => {
  /**
   * Doze colunas de mesma cor lado a lado não deixam ver onde um mês
   * acaba e o outro começa — a queixa foi exatamente esta. A alternância
   * é sutil de propósito: separa sem listrar a tela.
   */
  const tela = semComentarios(await lerFerias());

  expect(tela).toContain('indice % 2 === 0');
});

test('O NOME COMPLETO APARECE AO PASSAR O MOUSE', async () => {
  /**
   * Na janelinha do mês só cabe o primeiro nome, e a rede tem gente de
   * primeiro nome repetido. Sem o nome inteiro, a escala é ambígua.
   *
   * São dois caminhos de propósito: a etiqueta que sobe (desenho) e o
   * `title` do navegador (rede de segurança, e o que sai em toque).
   */
  const tela = await lerFerias();

  expect(tela).toContain('group-hover:block');
  expect(tela).toContain('title={`${nomeCompleto}');
});

test('dá para exportar a escala POR MÊS e POR ANO', async () => {
  /**
   * O ano inteiro é o planejamento; o mês é o que vai para a pasta e
   * para a assinatura. Um só não serve para os dois.
   */
  const tela = await lerFerias();

  // Ano inteiro: `null` no lugar do mês
  expect(tela).toContain('imprimir(null)');
  // E cada mês imprime sozinho, pelo próprio contador
  expect(tela).toContain('imprimir(indice)');
  expect(tela).toContain('const exportarCsv =');

  // A folha sai pelo módulo comum, como todo documento do sistema
  expect(tela).toContain('montarDocumento({');
  expect(tela).toContain('assinaturas(');
  expect(tela).not.toContain('<!doctype html>');
});

test('o periodo vale para VARIOS de uma vez', async () => {
  const tela = await lerFerias();

  expect(tela).toContain('colaboradorIds: selecionados');
  expect(tela).toContain('salvarEscalaDeFerias({');

  /**
   * E o aviso diz QUEM ficou de fora. O lote não é tudo-ou-nada; um
   * "algumas falharam" obrigaria a conferir as doze pessoas na mão.
   */
  expect(tela).toContain('Ficaram de fora');
  expect(tela).toContain('res.falhas');
});

test('o conflito de ferias MOSTRA, e nao trava o botao', async () => {
  /**
   * Dois vendedores fora na mesma semana pode ser tranquilo numa loja e
   * impossível noutra — quem sabe disso é quem está lá. Travar com um
   * limite inventado recusaria férias legítimas.
   */
  const tela = semComentarios(await lerFerias());

  expect(tela).toContain('conflitos.length > 0 &&');

  // O botão depende só de ter gente e período — nunca do conflito
  expect(tela).toContain(
    'const podeSalvar = selecionados.length > 0 && dias > 0 && !salvando;'
  );
  expect(tela).not.toContain('conflitos.length === 0 &&');
});

test('os dias ja lancados no ano ficam a vista na hora de escolher', async () => {
  /**
   * É o número que evita marcar um terceiro período sem perceber. Ele
   * informa e não impede: o direito de cada um depende do período
   * aquisitivo dele, que o sistema não acompanha.
   */
  const tela = await lerFerias();

  expect(tela).toContain('diasDeFeriasNoAno(c.id, ano)');
  expect(tela).toContain('dias em ${ano}');
});

test('a contagem de dias vem do servico, e nao da tela', async () => {
  /**
   * Contar dias corridos tem uma pegadinha só: as DUAS pontas entram.
   * De 01/01 a 10/01 são dez dias, não nove. Escrita duas vezes, uma
   * delas erra — e é a que assina o recibo.
   */
  const tela = semComentarios(await lerFerias());

  expect(tela).toContain('diasCorridos(');
  expect(tela).not.toContain('/ 86400000');
  expect(tela).not.toContain('getTime() -');
});
