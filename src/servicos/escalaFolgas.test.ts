/**
 * Verificação da escala de folgas — CONECTA
 *
 * O que motivou: com 23 pessoas numa loja, a tela em cartões desalinhava e
 * a lista de quem não marcou ocupava mais espaço do que a própria escala. E
 * o documento impresso — que vai para o quadro de avisos da loja — saía com
 * cara de relatório, incluindo a relação de quem NÃO marcou folga.
 */
import { test, expect } from 'bun:test';

const lerTela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/EscalaDeFolgas.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('a escala e uma grade de colunas alinhadas, nao cartoes que quebram', async () => {
  const tela = await lerTela();

  /**
   * Com 23 pessoas escolhendo folga, uns sábados ficam cheios e outros
   * vazios. Em cartões de altura livre a grade desalinha; com a lista
   * rolando DENTRO da coluna, as quatro ficam do mesmo tamanho.
   */
  expect(tela).toContain('max-h-72 overflow-y-auto');
  expect(tela).toContain('xl:grid-cols-4');
  expect(tela).toContain('items-start');
});

test('cada sabado diz quantos FICAM, e nao so quantos saem', async () => {
  const tela = await lerTela();

  /**
   * "3 de folga" sozinho não decide nada. "3 de folga, 20 na loja" decide —
   * é o número que o gestor precisa para autorizar mais uma no mesmo dia.
   */
  expect(tela).toContain('const ficam = Math.max(equipe.length - folgas.length, 0)');
  expect(tela).toContain('{ficam} na loja');

  // E a proporção, para ler de relance
  expect(tela).toContain('const proporcao =');
});

test('a folga recusada nao ocupa lugar na escala', async () => {
  const codigo = semComentarios(await lerTela());

  /**
   * Recusada não vale e não conta para "quantos ficam na loja" — deixá-la
   * na contagem faria o gestor recusar a próxima sem motivo.
   */
  const ocorrencias = (codigo.match(/f\.estado !== 'recusada'/g) || []).length;
  // Uma na tela e uma no documento impresso
  expect(ocorrencias).toBeGreaterThanOrEqual(2);
});

test('a lista de quem nao marcou comeca fechada', async () => {
  const tela = await lerTela();

  /**
   * São 23 nomes numa loja como Pirassununga. Abertos, ocupam mais espaço
   * do que a escala inteira e empurram para baixo o que se veio olhar.
   */
  expect(tela).toContain('useState(false)');
  expect(tela).toContain('setSemFolgaAberta((v) => !v)');
  expect(tela).toContain('{semFolgaAberta && (');

  // O número continua à vista mesmo fechada: é ele que é o aviso
  expect(tela).toContain('{semFolga.length} sem folga marcada em');
});

/**
 * O DOCUMENTO IMPRESSO É UM CARTAZ, e não um relatório.
 *
 * Ele é pregado no quadro de avisos. Quem lê está em pé, de passagem,
 * procurando o próprio nome.
 */
test('o cartaz NAO leva a relacao de quem ficou sem marcar', async () => {
  const codigo = semComentarios(await lerTela());

  const inicio = codigo.indexOf('const montarDocumento');
  const fim = codigo.indexOf('const imprimir', inicio);
  expect(inicio).toBeGreaterThan(-1);
  const documento = codigo.slice(inicio, fim);

  /**
   * Pregar no quadro os nomes de quem não marcou expõe as pessoas sem
   * servir para nada: quem lê quer saber quem folga, não quem faltou
   * marcar. Na tela a lista continua — lá é cobrança do gestor.
   */
  expect(documento).not.toContain('semFolga');

  // E a tela continua com ela
  expect(codigo).toContain('semFolga.map((c) => (');
});

test('o cartaz e feito para ser lido de longe', async () => {
  const codigo = semComentarios(await lerTela());
  const documento = codigo.slice(
    codigo.indexOf('const montarDocumento'),
    codigo.indexOf('const imprimir')
  );

  // Papel definido: sem isto o navegador escolhe margem e orientação
  expect(documento).toContain('@page { size: A4 portrait');

  // O dia em destaque, como num calendário
  expect(documento).toContain('.dia .numero');

  // Um nome por linha, e não separados por vírgula: a pessoa procura o dela
  expect(documento).toContain('<ul class="gente">');

  // As cores precisam sair na impressora, senão o cartaz sai cinza
  expect(documento).toContain('print-color-adjust: exact');
});
