/**
 * A TELA DE COTAR NO BANCO (docs/cotador/SPEC-cotar.md): o prazo pela loja
 * de quem cota, "Minhas cotações do dia" e o andamento que a tela confere a
 * cada 3 s. O banco é montado de verdade (PGlite), entrando como cada pessoa.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const BIA = '00000000-0000-0000-0000-0000000000b1'; // Balcão, Pirassununga
const DUDA = '00000000-0000-0000-0000-0000000000b2'; // Balcão, Descalvado
const CAIO = '00000000-0000-0000-0000-0000000000b3'; // Compras
const EDU = '00000000-0000-0000-0000-0000000000b4'; // Estoque

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant execute on functions to authenticated;
  `);
  await banco.db.exec(lerSql('cotador-banco.sql'));
  await banco.db.exec(lerSql('cotador-precificacao.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${BIA}'), ('${DUDA}'), ('${CAIO}'), ('${EDU}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('duda', '${DUDA}', 'Duda', 'duda', 'Balcão', 'Descalvado', 1, true),
      ('caio', '${CAIO}', 'Caio', 'caio', 'Compras', 'Pirassununga', 1, true),
      ('edu', '${EDU}', 'Edu', 'edu', 'Estoque', 'Pirassununga', 1, true);

    -- A OC90 já cotada hoje nos 3 fornecedores: DPK em SP, Roles só fora, Pellegrino sem
    insert into public.precos_b2b (fornecedor, codigo, local, em_sp, custo, quantidade, disponivel, proximidade, marca) values
      ('dpk', 'OC90', 'RIB PRETO', true, 8.69, 228, true, 1, 'MAHLE METAL LEVE'),
      ('roles', 'OC90', 'GOIANIA', false, 8.00, 5, true, 9, 'Metal Leve');
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, local, custo, situacao) values
      (public.hoje_brasilia(), 'dpk', 'OC90', 'RIB PRETO', 8.69, 'SP'),
      (public.hoje_brasilia(), 'roles', 'OC90', 'GOIANIA', 8.00, 'FORA DO ESTADO'),
      (public.hoje_brasilia(), 'pellegrino', 'OC90', null, null, 'SEM ESTOQUE');
  `);
}, 120_000);

const como = async <T,>(uid: string, sql: string): Promise<T[] | string> => {
  await banco.como(uid);
  try {
    return (await banco.db.query<T>(sql)).rows;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await banco.como(null);
  }
};

test('prazo: SP chega em 2–3 dias na matriz e 3–4 nas outras lojas; fora de SP, 7–10', async () => {
  const r = await banco.db.query<{ p: string | null }>(`
    select public.prazo_de_entrega(true, 'Pirassununga') as p union all
    select public.prazo_de_entrega(true, 'Descalvado') union all
    select public.prazo_de_entrega(false, 'Pirassununga') union all
    select public.prazo_de_entrega(null, 'Pirassununga')`);
  expect(r.rows.map((x) => x.p)).toEqual(['2–3 dias', '3–4 dias', '7–10 dias', null]);
});

test('o resultado traz o prazo pela loja de quem cota', async () => {
  const prazos = (uid: string) =>
    como<{ fornecedor: string; prazo: string | null }>(uid, "select fornecedor, prazo from public.resultado_da_cotacao('OC90') order by fornecedor");
  expect(await prazos(BIA)).toEqual([
    { fornecedor: 'dpk', prazo: '2–3 dias' },
    { fornecedor: 'pellegrino', prazo: null },
    { fornecedor: 'roles', prazo: '7–10 dias' },
  ]);
  expect((await prazos(DUDA))[0]).toEqual({ fornecedor: 'dpk', prazo: '3–4 dias' });
});

test('minhas cotações do dia: cada um vê os próprios, inclusive o que já tinha preço', async () => {
  // OC90 já tem preço de hoje (não gera pedido); X1 entra na fila
  const pedido = (await como<{ codigo: string; ja_tem_preco: boolean }>(
    BIA,
    "select codigo, ja_tem_preco from public.pedir_cotacao(array['oc-90', 'X1'], true, false)"
  )) as { codigo: string; ja_tem_preco: boolean }[];
  expect(pedido).toEqual([
    { codigo: 'OC90', ja_tem_preco: true },
    { codigo: 'X1', ja_tem_preco: false },
  ]);
  const meus = (uid: string) =>
    como<{ codigo: string }>(uid, 'select codigo from public.cotacoes_do_dia where dia = public.hoje_brasilia() order by codigo');
  expect(await meus(BIA)).toEqual([{ codigo: 'OC90' }, { codigo: 'X1' }]);
  expect(await meus(DUDA)).toEqual([]);
  expect(await como(BIA, "insert into public.cotacoes_do_dia (colaborador_id, codigo, dia) values ('duda', 'Z', current_date)")).toContain(
    'row-level security'
  );
});

type Andamento = { codigo: string; situacao: string; erro: string | null; estacao_no_ar: boolean };
const andamento = (uid: string, codigos: string[]) =>
  como<Andamento>(
    uid,
    `select codigo, situacao, erro, estacao_no_ar from public.andamento_da_cotacao(array[${codigos.map((c) => `'${c}'`).join(',')}]) order by codigo`
  );

test('andamento: pronta sem pedido, na fila, e a estação fora do ar', async () => {
  expect(await andamento(BIA, ['OC90', 'x-1', 'NUNCA9'])).toEqual([
    { codigo: 'NUNCA9', situacao: 'sem_pedido', erro: null, estacao_no_ar: false },
    { codigo: 'OC90', situacao: 'pronta', erro: null, estacao_no_ar: false },
    { codigo: 'X1', situacao: 'na_fila', erro: null, estacao_no_ar: false },
  ]);
});

test('andamento: cotando, erro com o motivo, e a estação no ar depois do sinal', async () => {
  await como(CAIO, "select public.sinal_da_estacao('compras', '{}', '0.3.0')");
  await como(CAIO, "select * from public.pegar_proxima_cotacao('compras')");
  expect(await andamento(DUDA, ['X1'])).toEqual([{ codigo: 'X1', situacao: 'cotando', erro: null, estacao_no_ar: true }]);

  const [{ id }] = (await banco.db.query<{ id: string }>("select id from public.cotacoes_b2b where codigo = 'X1'")).rows;
  await como(CAIO, `select public.gravar_cotacao('${id}', '[{"fornecedor":"dpk","peca":null,"ofertas":[],"erro":"fora do ar"}]'::jsonb)`);
  expect(await andamento(BIA, ['X1'])).toEqual([{ codigo: 'X1', situacao: 'erro', erro: 'dpk: fora do ar', estacao_no_ar: true }]);
});

test('quem não cota não pergunta o andamento', async () => {
  expect(await andamento(EDU, ['OC90'])).toContain('permissão');
});

test('minhas cotações do dia, do mais recente, e os nomes dos fornecedores', async () => {
  await banco.db.exec("update public.cotacoes_do_dia set ultima = now() - interval '1 minute' where codigo = 'OC90'");
  expect(await como(BIA, 'select codigo from public.minhas_cotacoes_do_dia()')).toEqual([{ codigo: 'X1' }, { codigo: 'OC90' }]);
  expect(await como(DUDA, 'select codigo from public.minhas_cotacoes_do_dia()')).toEqual([]);
  expect(await como(BIA, 'select chave, nome from public.fornecedores_para_cotar()')).toEqual([
    { chave: 'roles', nome: 'Roles' },
    { chave: 'pellegrino', nome: 'Pellegrino' },
    { chave: 'dpk', nome: 'DPK' },
  ]);
  expect(await como(EDU, 'select chave from public.fornecedores_para_cotar()')).toEqual([]);
});

// ------------------------------------------------------------
// Frete por peça e entrega direta (Elias, 21/10/2026)
// ------------------------------------------------------------

test('o frete de partida: DPK e Pellegrino R$ 10, Roles grátis; a Pellegrino entrega direto em Palmeiras', async () => {
  const r = await banco.db.query<{ chave: string; frete: number; lojas: string[] }>(
    'select chave, frete_por_peca::float as frete, lojas_entrega_direta as lojas from public.fornecedores_b2b order by ordem'
  );
  expect(r.rows).toEqual([
    { chave: 'roles', frete: 0, lojas: ['Pirassununga'] },
    { chave: 'pellegrino', frete: 10, lojas: ['Pirassununga', 'Palmeiras'] },
    { chave: 'dpk', frete: 10, lojas: ['Pirassununga'] },
  ]);
});

test('venda = (custo + frete) × fator: DPK (8,69 + 10) × 1,80 = 33,64 → 33,90; Roles sem frete', async () => {
  const r = (await como<{ fornecedor: string; venda: number | null; frete: number | null }>(
    BIA,
    "select fornecedor, venda::float as venda, frete::float as frete from public.resultado_da_cotacao('OC90') order by fornecedor"
  )) as { fornecedor: string; venda: number | null; frete: number | null }[];
  // Roles: 8,00 × 1,80 (fator padrão) = 14,40 → 14,90, sem frete. Frete não chega à Bia.
  expect(r).toEqual([
    { fornecedor: 'dpk', venda: 33.9, frete: null },
    { fornecedor: 'pellegrino', venda: null, frete: null },
    { fornecedor: 'roles', venda: 14.9, frete: null },
  ]);
});

test('prazo com entrega direta: em Palmeiras a Pellegrino chega em 2–3 dias, a DPK em 3–4', async () => {
  const r = await banco.db.query<{ p: string | null }>(`
    select public.prazo_de_entrega(true, 'Palmeiras', '{Pirassununga,Palmeiras}') as p union all
    select public.prazo_de_entrega(true, 'Palmeiras', '{Pirassununga}') union all
    select public.prazo_de_entrega(true, 'Descalvado', '{Pirassununga,Palmeiras}') union all
    select public.prazo_de_entrega(false, 'Palmeiras', '{Pirassununga,Palmeiras}')`);
  expect(r.rows.map((x) => x.p)).toEqual(['2–3 dias', '3–4 dias', '3–4 dias', '7–10 dias']);
});

test('Compras altera o frete, e a venda muda na hora; Balcão e Gerente não alteram', async () => {
  expect(await como(BIA, "select public.alterar_frete('dpk', 0)")).toContain('Compras ou TI');
  expect(await como(EDU, 'select * from public.fretes_dos_fornecedores()')).toContain('Compras ou TI');
  expect(await como(CAIO, "select public.alterar_frete('dpk', -1)")).toContain('R$ 0,00 a R$ 500,00');
  expect(await como(CAIO, "select public.alterar_frete('nao-existe', 5)")).toContain('desconhecido');

  expect(await como(CAIO, "select public.alterar_frete('dpk', 5)")).not.toBeTypeOf('string');
  const fretes = (await como<{ chave: string; frete_por_peca: number; atualizado_por: string }>(
    CAIO,
    "select chave, frete_por_peca::float as frete_por_peca, atualizado_por from public.fretes_dos_fornecedores() where chave = 'dpk'"
  )) as { chave: string; frete_por_peca: number; atualizado_por: string }[];
  expect(fretes).toEqual([{ chave: 'dpk', frete_por_peca: 5, atualizado_por: 'Caio' }]);
  // (8,69 + 5) × 1,80 = 24,64 → 24,90
  expect(await como(BIA, "select venda::float as v from public.resultado_da_cotacao('OC90') where fornecedor = 'dpk'")).toEqual([{ v: 24.9 }]);

  // Rodar o arquivo de novo não desfaz o frete ajustado por Compras
  await banco.db.exec(lerSql('cotador-banco.sql'));
  expect((await banco.db.query<{ f: number }>("select frete_por_peca::float as f from public.fornecedores_b2b where chave = 'dpk'")).rows[0].f).toBe(5);
  await banco.db.exec("update public.fornecedores_b2b set frete_por_peca = 10 where chave = 'dpk'");
});
