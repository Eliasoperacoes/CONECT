/**
 * A JANELA DO PONTO — CONECTA
 *
 * ===================================================================
 * O QUE MOTIVOU
 * ===================================================================
 *
 * O Elias vai abrir o sistema para as 89 pessoas da rede. Até agora o
 * piloto tinha 8, e o conferidor de prontidão trouxe o retrato:
 *
 *     pessoas_ativas 89 · ja_bateram_ponto 8 · marcacoes 314
 *
 * `sincronizarPonto` baixava TODAS as marcações e as gravava no
 * `localStorage`. Com 314 linhas são 80 KB e funciona. Medido para as
 * 89 pessoas, a 4 batidas por 22 dias úteis:
 *
 *     mês    marcações    localStorage
 *       1        7.832        1,96 MB
 *       3       23.496        5,87 MB   <- estoura o limite de ~5 MB
 *      12       93.984       23,48 MB
 *
 * O navegador guarda ~5 MB. Passado disso `setItem` LANÇA — e
 * `sincronizarPonto` roda DENTRO de `registrarMarcacaoPorCodigo`, antes
 * de cada batida. O terceiro mês de uso derrubaria o bater ponto, com
 * uma exceção subindo até a tela sem nome nem explicação.
 *
 * A RLS poupa a maioria: cada pessoa só enxerga as próprias marcações.
 * Quem carrega a rede inteira é o RH e a gestão — justamente quem abre
 * o Banco de Horas todo dia.
 *
 * E APAGAR NÃO É SAÍDA: marcação de ponto é documento trabalhista e não
 * se apaga em hipótese alguma. O que muda é o quanto o aparelho guarda
 * de cada vez.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  dados = new Map<string, string>();
  /** Zero desliga o limite. Em bytes, como o navegador cobra. */
  limite = 0;
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) {
    if (this.limite > 0 && v.length > this.limite) {
      const erro = new Error('QuotaExceededError');
      erro.name = 'QuotaExceededError';
      throw erro;
    }
    this.dados.set(k, String(v));
  }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

/** O que o cliente falso recebeu no último `select`. */
let filtros: { coluna: string; valor: string; operador: string }[] = [];
let linhasDoBanco: any[] = [];

const consulta = () => {
  const encadeado: any = {
    select: () => encadeado,
    gte: (coluna: string, valor: string) => {
      filtros.push({ coluna, valor, operador: 'gte' });
      return encadeado;
    },
    lte: (coluna: string, valor: string) => {
      filtros.push({ coluna, valor, operador: 'lte' });
      return encadeado;
    },
    order: () => encadeado,
    range: () => Promise.resolve({ data: linhasDoBanco, error: null }),
    limit: () => encadeado,
    then: (f: any) => Promise.resolve({ data: linhasDoBanco, error: null }).then(f),
  };
  return encadeado;
};

mock.module('./supabase', () => ({
  supabase: { from: () => consulta() },
  usandoNuvem: () => true,
  temSessaoViva: () => true,
  /* O `nuvem.ts` importa os quatro; faltando um, o módulo nem carrega */
  loginParaEmailInterno: (login: string) => `${login}@conecta.local`,
  normalizarLogin: (login: string) => login.trim().toLowerCase(),
}));
mock.module('./nuvemComunicacao', () => ({
  nuvemComunicacao: {
    sincronizarConversas: async () => true,
    sincronizarAvisos: async () => true,
    sincronizarConfiguracoes: async () => true,
    sincronizarAuditoria: async () => true,
    assinarAtualizacoes: () => () => {},
  },
}));

const { nuvem } = await import('./nuvem');

const CHAVE = 'conecta_v4_registros_ponto';

/** Uma marcação como o banco a devolve. */
const linha = (i: number) => ({
  id: `ponto-${i}`,
  colaborador_id: `colab-${i % 89}`,
  data: '2026-09-28',
  tipo: 'entrada',
  horario: '2026-09-28T10:30:00.000Z',
  hora_formatada: '07:30',
  metodo: 'qrcode',
  loja: 'Pirassununga',
  criado_em: '2026-09-28T10:30:01.000Z',
});

beforeEach(() => {
  armazenamento.clear();
  armazenamento.limite = 0;
  filtros = [];
  linhasDoBanco = [linha(1), linha(2)];
});

// ===============================================================

test('A BUSCA É RECORTADA POR PERÍODO, e não "tudo"', async () => {
  /**
   * O defeito que este arquivo existe para impedir. Sem o recorte, o
   * aparelho do RH baixa as 94 mil marcações do ano inteiro a cada
   * sincronização — e ela roda antes de cada batida.
   */
  await nuvem.sincronizarPonto();

  const porData = filtros.filter((f) => f.coluna === 'data');
  expect(porData).toHaveLength(2);
  expect(porData.map((f) => f.operador).sort()).toEqual(['gte', 'lte']);
});

test('o recorte é pela coluna DATA, que é a indexada', async () => {
  /**
   * `horario` é timestamp com fuso. Comparar uma data com ele erra a
   * virada do dia — a batida das 21h de um dia cai no seguinte em UTC —
   * e o índice `registros_ponto_por_data` é sobre `data`.
   */
  await nuvem.sincronizarPonto();

  expect(filtros.every((f) => f.coluna === 'data')).toBe(true);
});

test('A JANELA PADRÃO cobre o mês corrente e o anterior', async () => {
  /**
   * É o que a aba Ponto e a apuração da semana precisam ter à mão.
   * Menos que isso faria o histórico do mês passado abrir vazio para
   * quem só quer conferir o próprio ponto.
   */
  /**
   * MÓDULO NOVO, e não o compartilhado.
   *
   * A janela vive na memória do módulo, e os testes abaixo a trocam. Ler
   * o `nuvem` compartilhado aqui faria esta asserção depender da ORDEM
   * do arquivo — passaria hoje e quebraria no dia em que alguém
   * acrescentasse um teste acima, com uma mensagem que não explica nada.
   */
  const { nuvem: recemNascido } = await import('./nuvem?padrao=1' as string);

  const janela = recemNascido.obterJanelaDoPonto();
  const dias =
    (new Date(janela.fim).getTime() - new Date(janela.inicio).getTime()) / 86400000;

  expect(Math.round(dias)).toBe(62);
  expect(janela.fim).toBe(new Date().toISOString().slice(0, 10));
});

test('QUEM PEDE UM PERÍODO recebe aquele período', async () => {
  /**
   * É o Banco de Horas abrindo um mês antigo. Sem isto o espelho sairia
   * VAZIO — e espelho vazio se lê como "esta pessoa não bateu ponto",
   * que é a pior coisa que um documento de ponto pode dizer por engano.
   */
  await nuvem.sincronizarPonto({ inicio: '2026-01-01', fim: '2026-01-31' });

  expect(filtros).toContainEqual({ coluna: 'data', valor: '2026-01-01', operador: 'gte' });
  expect(filtros).toContainEqual({ coluna: 'data', valor: '2026-01-31', operador: 'lte' });
});

test('o período pedido VALE PARA AS PRÓXIMAS sincronizações', async () => {
  /**
   * A sincronização roda sozinha o tempo todo — antes de cada batida, a
   * cada evento de tempo real. Se ela voltasse ao padrão, o espelho que
   * o RH tem aberto seria trocado por outro mês embaixo dele.
   */
  await nuvem.sincronizarPonto({ inicio: '2026-01-01', fim: '2026-01-31' });
  filtros = [];

  await nuvem.sincronizarPonto();

  expect(filtros).toContainEqual({ coluna: 'data', valor: '2026-01-01', operador: 'gte' });
});

test('a janela NÃO sobrevive à sessão', async () => {
  /**
   * Ela vive na memória de propósito. Guardada no aparelho, o mês antigo
   * que o RH abriu uma vez para consultar valeria para sempre naquele
   * computador, e o cache voltaria a crescer sem ninguém pedir.
   */
  await nuvem.sincronizarPonto({ inicio: '2020-01-01', fim: '2020-12-31' });

  const { nuvem: outraSessao } = await import('./nuvem?sessao=2' as string);
  expect(outraSessao.obterJanelaDoPonto().inicio).not.toBe('2020-01-01');
});

// ===============================================================
// O CACHE QUE NÃO COUBE
// ===============================================================

test('CACHE QUE NÃO COUBE NÃO DERRUBA A BATIDA', async () => {
  /**
   * `setItem` LANÇA ao estourar o limite, e `sincronizarPonto` roda
   * dentro de `registrarMarcacaoPorCodigo`. Sem a guarda, o aparelho do
   * RH que passasse do limite deixaria de bater ponto — com uma exceção
   * subindo até a tela, sem nome nem explicação.
   */
  armazenamento.limite = 10;

  const coube = await nuvem.sincronizarPonto();

  expect(coube).toBe(false);
});

test('o que NÃO COUBE não entra pela metade', async () => {
  /**
   * Truncar para caber deixaria o espelho com dias faltando e ninguém
   * saberia. Documento de ponto incompleto é pior do que documento que
   * não abriu: o primeiro se assina sem desconfiar.
   *
   * Então o cache fica como ESTAVA, e a função diz que falhou.
   */
  await nuvem.sincronizarPonto();
  const antes = armazenamento.getItem(CHAVE);
  expect(antes).toBeTruthy();

  armazenamento.limite = 10;
  linhasDoBanco = [linha(3), linha(4), linha(5)];
  const coube = await nuvem.sincronizarPonto();

  expect(coube).toBe(false);
  // Byte a byte igual ao de antes: nada entrou
  expect(armazenamento.getItem(CHAVE)).toBe(antes);
});

test('cabendo, o cache é atualizado e a função confirma', async () => {
  /**
   * A guarda dos dois testes acima: se `sincronizarPonto` passasse a
   * devolver falso sempre, os dois continuariam verdes e o ponto teria
   * parado de sincronizar.
   */
  const coube = await nuvem.sincronizarPonto();

  expect(coube).toBe(true);
  expect(JSON.parse(armazenamento.getItem(CHAVE)!)).toHaveLength(2);
});
