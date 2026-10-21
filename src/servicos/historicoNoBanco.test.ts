/**
 * O HISTÓRICO DE COTAÇÃO NO BANCO (docs/cotador/SPEC-historico.md): a foto
 * do preço da hora, guardada para sempre; o vendedor vê o dele, Compras e
 * Gerência veem todos; o custo só para quem vê custo. Banco de verdade
 * (PGlite), entrando como cada pessoa.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { podeVerHistoricoDeTodos, SETORES, NIVEIS_EM_ORDEM } from '../tipos';

let banco: BancoLocal;
const BIA = '00000000-0000-0000-0000-0000000000d1'; // Balcão, Pirassununga
const DUDA = '00000000-0000-0000-0000-0000000000d2'; // Balcão, Descalvado
const CAIO = '00000000-0000-0000-0000-0000000000d3'; // Compras
const GIL = '00000000-0000-0000-0000-0000000000d4'; // Gerência
const LIA = '00000000-0000-0000-0000-0000000000d5'; // Callcenter (vê custo, não vê de todos)

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
    insert into auth.users (id) values ('${BIA}'), ('${DUDA}'), ('${CAIO}'), ('${GIL}'), ('${LIA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('duda', '${DUDA}', 'Duda', 'duda', 'Balcão', 'Descalvado', 1, true),
      ('caio', '${CAIO}', 'Caio', 'caio', 'Compras', 'Pirassununga', 1, true),
      ('gil', '${GIL}', 'Gil', 'gil', 'Gerência', 'Pirassununga', 3, true),
      ('lia', '${LIA}', 'Lia', 'lia', 'Callcenter', 'Pirassununga', 1, true);

    -- A OC90 cotada hoje: DPK em SP 8,69 (+ frete 10) e Roles fora 8,00 (frete grátis)
    insert into public.precos_b2b (fornecedor, codigo, local, em_sp, custo, quantidade, disponivel, proximidade, marca) values
      ('dpk', 'OC90', 'RIB PRETO', true, 8.69, 228, true, 1, 'MAHLE'),
      ('roles', 'OC90', 'GOIANIA', false, 8.00, 5, true, 9, 'Metal Leve');
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, local, custo, situacao) values
      (public.hoje_brasilia(), 'dpk', 'OC90', 'RIB PRETO', 8.69, 'SP'),
      (public.hoje_brasilia(), 'roles', 'OC90', 'GOIANIA', 8.00, 'FORA DO ESTADO'),
      (public.hoje_brasilia(), 'dpk', 'ZERO1', null, null, 'SEM ESTOQUE');
    insert into public.similares_b2b (fornecedor, codigo, codigo_similar) values ('roles', 'OC90', 'W7122'), ('dpk', 'OC90', 'W7122'), ('dpk', 'OC90', 'PSL619');
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

type Linha = { tipo_linha: string; codigo_peca: string; situacao_linha: string; fornecedor: string | null; venda: number | null; custo: number | null; prazo: string | null; similares: number | null; nome: string };
const historico = (uid: string, filtros = '') =>
  como<Linha>(
    uid,
    `select tipo_linha, codigo_peca, situacao_linha, fornecedor, venda::float as venda, custo::float as custo, prazo, similares, nome
       from public.historico_de_cotacao(${filtros})`
  );

test('a regra de quem vê todos é a mesma na tela e no banco: Compras e nível ≥ 3', async () => {
  const diferentes: string[] = [];
  for (const [s, setor] of SETORES.entries()) {
    for (const nivel of NIVEIS_EM_ORDEM) {
      const uid = `00000000-0000-0000-0000-${String(900000 + s * 10 + nivel).padStart(12, '0')}`;
      await banco.db.exec(`
        insert into auth.users (id) values ('${uid}') on conflict do nothing;
        insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo)
        values ('p${uid.slice(-6)}', '${uid}', 'P', 'p${uid.slice(-6)}', '${setor}', 'Pirassununga', ${nivel}, true) on conflict do nothing;
      `);
      const r = (await como<{ v: boolean }>(uid, 'select public.posso_ver_historico_de_todos() as v')) as { v: boolean }[];
      if (r[0].v !== podeVerHistoricoDeTodos({ setor, nivel })) diferentes.push(`${setor} ${nivel}`);
    }
  }
  expect(diferentes).toEqual([]);
});

test('a foto: o melhor em SP pela menor venda, com o custo guardado; reabrir não duplica', async () => {
  await como(BIA, "select public.registrar_consulta('oc-90')");
  await como(BIA, "select public.registrar_consulta('OC90')"); // reabriu o cartão: mesma cotação
  await como(BIA, "select public.registrar_consulta('ZERO1')");
  const fotos = await banco.db.query<{ codigo: string; situacao: string; fornecedor: string | null; venda: number | null; custo: number | null; similares: number }>(
    'select codigo, situacao, fornecedor, venda::float as venda, custo::float as custo, similares from public.consultas_cotacao order by codigo'
  );
  // (8,69 + 10) × 1,80 = 33,64 → 33,90; o Roles é mais barato, mas fora de SP
  expect(fotos.rows).toEqual([
    { codigo: 'OC90', situacao: 'SP', fornecedor: 'dpk', venda: 33.9, custo: 8.69, similares: 2 },
    { codigo: 'ZERO1', situacao: 'SEM ESTOQUE', fornecedor: null, venda: null, custo: null, similares: 0 },
  ]);
});

test('a foto guarda o preço da hora: mudar o fator depois não a muda', async () => {
  await banco.db.exec("insert into public.margens_por_marca (marca, variante, fator) values ('MAHLE', '', 3.00)");
  expect(((await historico(BIA, "codigo => 'OC90'")) as Linha[])[0].venda).toBe(33.9);
  await banco.db.exec("delete from public.margens_por_marca where marca = 'MAHLE'");
});

test('o vendedor vê o dele, sem custo; outro vendedor não; Compras e o Gerente veem todos', async () => {
  const pedido = (await como<{ id: string }>(BIA, "select public.pedir_ao_comprador('HG5170', 'Gol', null) as id")) as { id: string }[];
  await como(CAIO, `select public.responder_solicitacao('${pedido[0].id}', '[{"fornecedor":"Barros","venda":89.9,"custo":45,"prazo":"2 dias"}]'::jsonb, false, null)`);

  const daBia = (await historico(BIA)) as Linha[];
  expect(daBia.map((l) => `${l.tipo_linha} ${l.codigo_peca} ${l.situacao_linha}`).sort()).toEqual([
    'b2b OC90 SP',
    'b2b ZERO1 SEM ESTOQUE',
    'comprador HG5170 respondida',
  ]);
  expect(daBia.every((l) => l.custo === null)).toBe(true);
  expect(await historico(DUDA)).toEqual([]);
  // A Lia vê custo, mas não vê de todos: nada aqui é dela
  expect(await historico(LIA)).toEqual([]);

  for (const uid of [CAIO, GIL]) {
    const r = (await historico(uid)) as Linha[];
    expect(r).toHaveLength(3);
    expect(r.find((l) => l.codigo_peca === 'HG5170')).toMatchObject({ fornecedor: 'Barros', venda: 89.9, custo: 45, nome: 'Bia' });
  }
});

test('os filtros: tipo, situação, vendedor, loja, código e período', async () => {
  const conta = async (filtros: string) => ((await historico(GIL, filtros)) as Linha[]).length;
  expect(await conta("tipo => 'comprador'")).toBe(1);
  expect(await conta("situacao => 'SEM ESTOQUE'")).toBe(1);
  expect(await conta("vendedor => 'bia'")).toBe(3);
  expect(await conta("vendedor => 'duda'")).toBe(0);
  expect(await conta("loja => 'Descalvado'")).toBe(0);
  expect(await conta("codigo => 'hg-5170'")).toBe(1);
  expect(await conta('de => public.hoje_brasilia(), ate => public.hoje_brasilia()')).toBe(3);
  expect(await conta('ate => public.hoje_brasilia() - 1')).toBe(0);
});

test('o que espera o comprador vem primeiro', async () => {
  await como(BIA, "select public.pedir_ao_comprador('AB123', null, null)");
  const r = (await historico(BIA)) as Linha[];
  expect([r[0].codigo_peca, r[0].situacao_linha]).toEqual(['AB123', 'aberta']);
});
