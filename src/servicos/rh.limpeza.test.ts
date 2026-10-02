/**
 * LIMPAR OS HOLERITES DE UM MÊS — a carga de teste, ou a que subiu errada.
 *
 * Só o mês pedido, com os arquivos junto, só pelo RH. E a contagem vem do
 * que o banco disse ter apagado, não do que a tela pediu.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

let eu = { id: 'rh', nome: 'Dani', nivel: 2, setor: 'RH' };
const pedidos: Array<{ tabela: string; filtro: [string, string]; colunas: string }> = [];
let linhasApagadas: Array<{ arquivo_caminho: string | null }> = [];
const arquivosApagados: string[] = [];

mock.module('./supabase', () => ({
  usandoNuvem: () => true,
  supabase: {
    from: (tabela: string) => ({
      delete: () => ({
        eq: (coluna: string, valor: string) => ({
          select: async (colunas: string) => {
            pedidos.push({ tabela, filtro: [coluna, valor], colunas });
            return { data: linhasApagadas, error: null };
          },
        }),
      }),
    }),
  },
}));
mock.module('./anexos', () => ({
  enviarDocumento: async () => null,
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

const { removerHoleritesDoMes } = await import('./rh');

beforeEach(() => {
  eu = { id: 'rh', nome: 'Dani', nivel: 2, setor: 'RH' };
  pedidos.length = 0;
  arquivosApagados.length = 0;
  linhasApagadas = [
    { arquivo_caminho: 'holerites/ana/2026-09.pdf' },
    { arquivo_caminho: 'holerites/bia/2026-09.pdf' },
  ];
});

test('apaga só o mês pedido, e os arquivos dele junto', async () => {
  const res = await removerHoleritesDoMes('2026-09');
  expect(res).toEqual({ sucesso: true, removidos: 2 });
  expect(pedidos).toEqual([{ tabela: 'holerites', filtro: ['competencia', '2026-09'], colunas: 'arquivo_caminho' }]);
  expect(arquivosApagados).toEqual(['holerites/ana/2026-09.pdf', 'holerites/bia/2026-09.pdf']);

  // Outro mês, outro filtro: o pedido segue a competência escolhida
  await removerHoleritesDoMes('2026-08');
  expect(pedidos[1].filtro).toEqual(['competencia', '2026-08']);
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
