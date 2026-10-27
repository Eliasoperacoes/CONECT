/**
 * RELATÓRIOS NO BANCO (docs/cotador/SPEC-insights-cotacao.md): o que foi
 * cotado e pedido ao comprador no período, para Compras e Gerência — e só
 * para eles. Banco de verdade (PGlite), entrando como cada pessoa.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const BIA = '00000000-0000-0000-0000-0000000000f1'; // Balcão
const CAIO = '00000000-0000-0000-0000-0000000000f2'; // Compras
const GIL = '00000000-0000-0000-0000-0000000000f3'; // Gerência

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant execute on functions to authenticated;
  `);
  for (const f of ['cotador-banco.sql', 'cotador-precificacao.sql', 'cotador-encomendas.sql', 'cotador-relatorios.sql']) await banco.db.exec(lerSql(f));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${BIA}'), ('${CAIO}'), ('${GIL}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('caio', '${CAIO}', 'Caio', 'caio', 'Compras', 'Pirassununga', 1, true),
      ('gil', '${GIL}', 'Gil', 'gil', 'Gerência', 'Pirassununga', 3, true);
    -- A Bia cotou a OC90 três vezes no mesmo dia e a HG5193 uma vez; a W7122 foi há 40 dias
    insert into public.consultas_cotacao (colaborador_id, loja, codigo, criada_em, base_em, situacao, fornecedor, venda) values
      ('bia', 'Pirassununga', 'OC90', now() - interval '3 hours', now() - interval '3 hours', 'SP', 'dpk', 35.9),
      ('bia', 'Pirassununga', 'OC90', now() - interval '2 hours', now() - interval '2 hours', 'SP', 'dpk', 35.9),
      ('bia', 'Pirassununga', 'OC90', now() - interval '1 hours', now() - interval '1 hours', 'SP', 'roles', 16.9),
      ('bia', 'Pirassununga', 'HG5193', now() - interval '1 hours', now() - interval '61 minutes', 'SEM ESTOQUE', null, null),
      ('bia', 'Pirassununga', 'W7122', now() - interval '40 days', now() - interval '40 days', 'SP', 'roles', 20.9);
    insert into public.solicitacoes_cotacao (codigo, pedida_por, loja, situacao, criada_em, respondida_em)
    values ('HG5193', 'bia', 'Pirassununga', 'nao_encontrada', now() - interval '50 minutes', now() - interval '20 minutes');
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

test('as cotações do período: uma linha por vendedor, peça e dia, com quantas vezes e o resultado da última', async () => {
  const linhas = (await como<{ codigo: string; vezes: number; fornecedor: string | null; situacao: string }>(
    GIL,
    "select codigo, vezes, fornecedor, situacao from public.cotacoes_do_periodo(now() - interval '30 days', now()) order by codigo"
  )) as unknown[];
  expect(linhas).toEqual([
    { codigo: 'HG5193', vezes: 1, fornecedor: null, situacao: 'SEM ESTOQUE' },
    { codigo: 'OC90', vezes: 3, fornecedor: 'roles', situacao: 'SP' },
  ]);
  // Sem período, vem tudo (a W7122 de 40 dias atrás também)
  expect(((await como(CAIO, 'select codigo from public.cotacoes_do_periodo(null, null)')) as unknown[]).length).toBe(3);
});

test('as solicitações do período, com o tempo de resposta; só Compras e Gerência leem os relatórios', async () => {
  const s = (await como<{ codigo: string; situacao: string; minutos: number }>(
    CAIO,
    "select codigo, situacao, round(extract(epoch from respondida_em - criada_em) / 60)::int as minutos from public.solicitacoes_do_periodo(now() - interval '1 day', now())"
  )) as unknown[];
  expect(s).toEqual([{ codigo: 'HG5193', situacao: 'nao_encontrada', minutos: 30 }]);
  expect(await como(BIA, 'select * from public.cotacoes_do_periodo(null, null)')).toContain('Compras e Gerência');
  expect(await como(BIA, 'select * from public.solicitacoes_do_periodo(null, null)')).toContain('Compras e Gerência');
});
