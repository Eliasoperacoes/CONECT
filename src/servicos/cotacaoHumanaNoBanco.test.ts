/**
 * COTAÇÃO HUMANA NO BANCO (docs/cotador/SPEC-cotacao-humana.md): o vendedor
 * pede ao comprador, o comprador responde com a venda (e o custo, opcional),
 * e o custo só chega a quem vê custo. Banco de verdade (PGlite), entrando
 * como cada pessoa.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const BIA = '00000000-0000-0000-0000-0000000000c1'; // Balcão, Pirassununga
const DUDA = '00000000-0000-0000-0000-0000000000c2'; // Balcão, Descalvado
const CAIO = '00000000-0000-0000-0000-0000000000c3'; // Compras
const GIL = '00000000-0000-0000-0000-0000000000c4'; // Gerência (cota e vê custo, não responde)
const EDU = '00000000-0000-0000-0000-0000000000c5'; // Estoque

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant execute on functions to authenticated;
  `);
  await banco.db.exec(lerSql('cotador-banco.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${BIA}'), ('${DUDA}'), ('${CAIO}'), ('${GIL}'), ('${EDU}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('duda', '${DUDA}', 'Duda', 'duda', 'Balcão', 'Descalvado', 1, true),
      ('caio', '${CAIO}', 'Caio', 'caio', 'Compras', 'Pirassununga', 1, true),
      ('gil', '${GIL}', 'Gil', 'gil', 'Gerência', 'Pirassununga', 3, true),
      ('edu', '${EDU}', 'Edu', 'edu', 'Estoque', 'Pirassununga', 1, true);
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

const pedir = async (uid: string, codigo: string) =>
  ((await como<{ id: string }>(uid, `select public.pedir_ao_comprador('${codigo}', 'Gol 1.0 2012', 'cliente não quer o similar') as id`)) as {
    id: string;
  }[])[0].id;

type Linha = { codigo_peca: string; situacao: string; nome_de_quem_pediu: string; fornecedor: string | null; venda: number | null; custo: number | null; prazo: string | null };
const ver = (uid: string, codigo?: string) =>
  como<Linha>(
    uid,
    `select codigo_peca, situacao, nome_de_quem_pediu, fornecedor, venda::float as venda, custo::float as custo, prazo
       from public.solicitacoes_de_cotacao(${codigo ? `'${codigo}'` : 'null'})`
  );

let daBia = '';

test('quem cota pede ao comprador, com o código normalizado; o Estoque não pede', async () => {
  daBia = await pedir(BIA, 'hg-5170');
  const r = await banco.db.query<{ codigo: string; veiculo: string; loja: string; situacao: string }>(
    `select codigo, veiculo, loja, situacao from public.solicitacoes_cotacao where id = '${daBia}'`
  );
  expect(r.rows[0]).toEqual({ codigo: 'HG5170', veiculo: 'Gol 1.0 2012', loja: 'Pirassununga', situacao: 'aberta' });
  expect(await como(EDU, "select public.pedir_ao_comprador('X1', '', '')")).toContain('cotam');
});

test('o vendedor vê as próprias; outro vendedor não; Compras vê todas', async () => {
  expect(((await ver(BIA)) as Linha[]).map((l) => l.codigo_peca)).toEqual(['HG5170']);
  expect(await ver(DUDA)).toEqual([]);
  expect(((await ver(CAIO)) as Linha[]).map((l) => `${l.codigo_peca} ${l.nome_de_quem_pediu}`)).toEqual(['HG5170 Bia']);
  // Direto na tabela, a Duda não alcança a da Bia
  expect(await como(DUDA, 'select id from public.solicitacoes_cotacao')).toEqual([]);
});

test('só Compras e TI respondem; o gerente e o vendedor não', async () => {
  const opcoes = `'[{"fornecedor":"Barros","venda":89.9,"custo":45,"prazo":"2 dias"}]'::jsonb`;
  expect(await como(GIL, `select public.responder_solicitacao('${daBia}', ${opcoes}, false, null)`)).toContain('Compras ou TI');
  expect(await como(BIA, `select public.responder_solicitacao('${daBia}', ${opcoes}, false, null)`)).toContain('Compras ou TI');
  expect(await como(CAIO, `select public.responder_solicitacao('${daBia}', '[]'::jsonb, false, null)`)).toContain('ao menos uma opção');
  expect(
    await como(
      CAIO,
      `select public.responder_solicitacao('${daBia}', '[{"fornecedor":"Barros","venda":89.9,"custo":45,"prazo":"2 dias"},{"fornecedor":"Disape","venda":95.9,"prazo":"amanhã"}]'::jsonb, false, null)`
    )
  ).not.toBeTypeOf('string');
});

test('a Bia vê a venda e o prazo, sem o custo; as respostas não se leem direto da tabela', async () => {
  expect(await ver(BIA, 'HG5170')).toEqual([
    { codigo_peca: 'HG5170', situacao: 'respondida', nome_de_quem_pediu: 'Bia', fornecedor: 'Barros', venda: 89.9, custo: null, prazo: '2 dias' },
    { codigo_peca: 'HG5170', situacao: 'respondida', nome_de_quem_pediu: 'Bia', fornecedor: 'Disape', venda: 95.9, custo: null, prazo: 'amanhã' },
  ]);
  expect(await como(BIA, 'select * from public.respostas_cotacao')).toEqual([]);
});

test('quem vê custo (o gerente, na solicitação dele) recebe o custo', async () => {
  const doGil = await pedir(GIL, 'ZZ77');
  await como(CAIO, `select public.responder_solicitacao('${doGil}', '[{"fornecedor":"Barros","venda":50.9,"custo":25,"prazo":"2 dias"}]'::jsonb, false, null)`);
  expect(((await ver(GIL, 'ZZ77')) as Linha[]).map((l) => [l.venda, l.custo])).toEqual([[50.9, 25]]);
});

test('"não encontrei" com o motivo, e a marca de "vista" só pelo vendedor dela', async () => {
  const outra = await pedir(BIA, 'AB123');
  await como(CAIO, `select public.responder_solicitacao('${outra}', null, true, 'nenhum fornecedor tem')`);
  const r = await banco.db.query<{ situacao: string; motivo: string; respondida_por: string }>(
    `select situacao, motivo, respondida_por from public.solicitacoes_cotacao where id = '${outra}'`
  );
  expect(r.rows[0]).toEqual({ situacao: 'nao_encontrada', motivo: 'nenhum fornecedor tem', respondida_por: 'caio' });

  const vista = async () =>
    (await banco.db.query<{ v: boolean }>(`select vista_em is not null as v from public.solicitacoes_cotacao where id = '${outra}'`)).rows[0].v;
  await como(DUDA, `select public.marcar_solicitacao_vista('${outra}')`);
  expect(await vista()).toBe(false);
  await como(BIA, `select public.marcar_solicitacao_vista('${outra}')`);
  expect(await vista()).toBe(true);
});
