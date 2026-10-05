/**
 * HOLERITES PELO RH — limpar o mês e substituir, com o assinado intocado.
 *
 * Limpar: a carga de teste, ou a que subiu errada.
 *
 * Só o mês pedido, com os arquivos junto, só pelo RH. A contagem vem do
 * que o banco disse ter apagado, não do que a tela pediu. E o holerite
 * ASSINADO fica: é a via que o colaborador assinou.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

let eu = { id: 'rh', nome: 'Dani', nivel: 2, setor: 'RH' };
/** Cada pedido ao banco, como a cadeia do supabase-js o montou. */
let pedidos: Array<{ tabela: string; passos: string[] }> = [];
let holeritesDoMes: Array<{ id: string }> = [];
let linhasApagadas: Array<{ arquivo_caminho: string | null }> = [];
let assinados: string[] = [];
const arquivosApagados: string[] = [];

/** Uma cadeia de consulta que anota os passos e responde no fim. */
const cadeia = (tabela: string) => {
  const pedido = { tabela, passos: [] as string[] };
  pedidos.push(pedido);
  const passo = (nome: string) => (...args: unknown[]) => {
    pedido.passos.push(`${nome}(${args.map((a) => JSON.stringify(a)).join(',')})`);
    return construtor;
  };
  const construtor: any = {
    select: passo('select'),
    delete: passo('delete'),
    eq: passo('eq'),
    not: passo('not'),
    then: (pronto: (r: unknown) => void) => {
      const apagando = pedido.passos.some((p) => p.startsWith('delete'));
      pronto({ data: apagando ? linhasApagadas : holeritesDoMes, error: null });
    },
  };
  return construtor;
};

mock.module('./supabase', () => ({ usandoNuvem: () => true, supabase: { from: cadeia } }));
mock.module('./assinatura', () => ({
  listarRecebimentos: async ({ holeriteIds }: { holeriteIds: string[] }) =>
    new Map(holeriteIds.filter((id) => assinados.includes(id)).map((id) => [id, {}])),
  listarAssinaturasDoResponsavel: async () => new Map(),
  imagensDasAssinaturas: async () => new Map(),
  chaveDoResponsavel: (documento: string, referencia: string) => `${documento}#${referencia}`,
}));
const enviados: string[] = [];
mock.module('./anexos', () => ({
  enviarDocumento: async (_conteudo: string, caminho: string) => {
    enviados.push(caminho);
    return null;
  },
  resolverCaminho: async () => null,
  apagarAnexos: async (caminhos: string[]) => {
    arquivosApagados.push(...caminhos);
    return caminhos.length;
  },
}));
mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => eu,
    obterColaboradorPorId: () => undefined,
    registrarAuditoria: () => {},
  },
}));

const { removerHoleritesDoMes, salvarHolerite } = await import('./rh');

const apagou = () => pedidos.find((p) => p.passos.some((s) => s.startsWith('delete')));

beforeEach(() => {
  eu = { id: 'rh', nome: 'Dani', nivel: 2, setor: 'RH' };
  pedidos = [];
  arquivosApagados.length = 0;
  assinados = [];
  holeritesDoMes = [{ id: 'hol-ana-2026-09' }, { id: 'hol-bia-2026-09' }];
  linhasApagadas = [
    { arquivo_caminho: 'holerites/ana/2026-09.pdf' },
    { arquivo_caminho: 'holerites/bia/2026-09.pdf' },
  ];
});

test('apaga só o mês pedido, e os arquivos dele junto', async () => {
  const res = await removerHoleritesDoMes('2026-09');
  expect(res).toEqual({ sucesso: true, removidos: 2, assinadosMantidos: 0 });
  expect(apagou()!.passos).toEqual(['delete()', 'eq("competencia","2026-09")', 'select("arquivo_caminho")']);
  expect(arquivosApagados).toEqual(['holerites/ana/2026-09.pdf', 'holerites/bia/2026-09.pdf']);

  // Outro mês, outro filtro: o pedido segue a competência escolhida
  pedidos = [];
  await removerHoleritesDoMes('2026-08');
  expect(apagou()!.passos).toContain('eq("competencia","2026-08")');
});

test('o holerite assinado fica fora do pedido de apagar', async () => {
  assinados = ['hol-ana-2026-09'];
  linhasApagadas = [{ arquivo_caminho: 'holerites/bia/2026-09.pdf' }];
  const res = await removerHoleritesDoMes('2026-09');
  expect(apagou()!.passos).toContain('not("id","in","(\\"hol-ana-2026-09\\")")');
  expect(res).toEqual({ sucesso: true, removidos: 1, assinadosMantidos: 1 });
});

test('o número vem do banco: sem permissão, zero removidos, não "limpo"', async () => {
  // O delete barrado pela regra do banco responde sucesso com nada apagado
  linhasApagadas = [];
  const res = await removerHoleritesDoMes('2026-09');
  expect(res.removidos).toBe(0);
  expect(arquivosApagados).toEqual([]);
});

test('quem não é do RH não apaga, nem com mês malformado', async () => {
  eu = { id: 'g', nome: 'Gerente', nivel: 2, setor: 'Balcão' };
  expect((await removerHoleritesDoMes('2026-09')).sucesso).toBe(false);
  eu = { id: 'rh', nome: 'Dani', nivel: 2, setor: 'RH' };
  // Sem mês, o filtro vazio apagaria nada — ou, mal escrito, tudo
  expect((await removerHoleritesDoMes('')).sucesso).toBe(false);
  expect(pedidos).toHaveLength(0);
});

test('holerite assinado não é substituído — nem o arquivo chega a subir', async () => {
  enviados.length = 0;
  assinados = ['hol-ana-2026-09'];
  const res = await salvarHolerite({ colaboradorId: 'ana', competencia: '2026-09', conteudo: 'data:', arquivoNome: 'x.pdf' });
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('já foi assinado');
  // O arquivo assinado continua o mesmo: o upload nem foi tentado
  expect(enviados).toEqual([]);

  // O de outra pessoa, não assinado, segue para o envio
  await salvarHolerite({ colaboradorId: 'bia', competencia: '2026-09', conteudo: 'data:', arquivoNome: 'x.pdf' });
  expect(enviados).toEqual(['holerites/bia/2026-09.pdf']);
});
