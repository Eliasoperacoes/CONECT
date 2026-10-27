/**
 * PRECIFICAÇÃO DO COTADOR NO BANCO (supabase/cotador-precificacao.sql,
 * docs/cotador/SPEC-precificacao.md).
 *
 * Venda = custo × fator da marca, para cima em ,90. O balconista vende sem
 * ver custo nem fator: o banco é montado de verdade (PGlite) e cada
 * pergunta é feita entrando no papel de uma pessoa.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { precoComFator } from './margens';

let banco: BancoLocal;
const BIA = '00000000-0000-0000-0000-0000000000a1'; // Balcão, nível 1
const GIL = '00000000-0000-0000-0000-0000000000a2'; // Gerência, nível 3
const CAIO = '00000000-0000-0000-0000-0000000000a3'; // Compras, nível 1

beforeAll(async () => {
  banco = await montarBancoLocal();
  // Como no Supabase: o acesso padrão vale antes do delta, e o revoke dele vale depois
  await banco.db.exec(`
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant execute on functions to authenticated;
  `);
  await banco.db.exec(lerSql('cotador-banco.sql'));
  await banco.db.exec(lerSql('cotador-precificacao.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${BIA}'), ('${GIL}'), ('${CAIO}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('gil', '${GIL}', 'Gil', 'gil', 'Gerência', 'Pirassununga', 3, true),
      ('caio', '${CAIO}', 'Caio', 'caio', 'Compras', 'Pirassununga', 1, true);

    insert into public.margens_por_marca (marca, variante, fator) values
      ('TECFIL', '', 1.83), ('METAL LEVE', '', 1.80),
      ('ISAPA', 'MECANISMOS', 1.87), ('ISAPA', 'MOLAS', 1.87), ('ISAPA', 'PISTÃO', 2.55), ('ISAPA', 'SAPATA', 1.97);
    insert into public.apelidos_de_marca (apelido, marca) values ('MAHLEMETALLEVE', 'METAL LEVE');

    -- Estes testes são do FATOR: sem frete, para a conta ficar só custo × fator.
    -- O frete por peça tem os testes dele em cotarNoBanco.test.ts.
    update public.fornecedores_b2b set frete_por_peca = 0;

    -- A OC90 cotada hoje: DPK em SP; Roles sem a peça; similar Tecfil
    insert into public.precos_b2b (fornecedor, codigo, local, em_sp, custo, quantidade, disponivel, proximidade, marca, descricao) values
      ('dpk', 'OC90', 'RIB PRETO', true, 8.69, 228, true, 1, 'MAHLE METAL LEVE', 'FILTRO OLEO LUBRIFICANTE'),
      ('dpk', 'OC90', 'LIMOEIRO', false, 7.60, 1, true, 9, 'MAHLE METAL LEVE', 'FILTRO OLEO LUBRIFICANTE'),
      ('roles', 'PSL619', 'Ribeirao Preto', true, 8.74, 6, true, 1, 'Tecfil', 'FILTRO OLEO'),
      ('dpk', 'P123', 'RIB PRETO', true, 300.00, 2, true, 1, 'ISAPA', 'PISTAO C/ ANEL STD'),
      ('dpk', 'ZZ9', 'RIB PRETO', true, 10.00, 2, true, 1, 'MARCA NOVA SA', 'PECA X');
    insert into public.similares_b2b (fornecedor, codigo, codigo_similar, marca_similar) values ('roles', 'OC90', 'PSL619', 'Tecfil');
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, local, custo, situacao) values
      (public.hoje_brasilia(), 'dpk', 'OC90', 'RIB PRETO', 8.69, 'SP'),
      (public.hoje_brasilia(), 'roles', 'OC90', null, null, 'SEM ESTOQUE'),
      (public.hoje_brasilia(), 'roles', 'PSL619', 'Ribeirao Preto', 8.74, 'SP'),
      (public.hoje_brasilia(), 'dpk', 'P123', 'RIB PRETO', 300, 'SP'),
      (public.hoje_brasilia(), 'dpk', 'ZZ9', 'RIB PRETO', 10, 'SP');
  `);
}, 120_000);

/** Roda uma consulta como a pessoa; devolve as linhas ou a mensagem de erro. */
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

const numeros = (sql: string) => banco.db.query<{ v: number | null }>(sql).then((r) => r.rows.map((x) => (x.v == null ? null : Number(x.v))));

test('venda = custo × fator, para cima em ,90 (R$ 100 × 1,80 = R$ 180,90)', async () => {
  const casos: [number, number][] = [[100, 1.8], [13.42, 1], [13.9, 1], [13.95, 1], [0.5, 1], [8.69, 1.8]];
  const r = await numeros(`select public.preco_de_venda(c, f)::float as v from (values ${casos.map(([c, f]) => `(${c}::numeric, ${f}::numeric)`).join(',')}) t(c, f)`);
  expect(r).toEqual([180.9, 13.9, 13.9, 14.9, 0.9, 15.9]);
  // Sem custo (ou zero) não há venda
  expect(await numeros('select public.preco_de_venda(0, 1.8)::float as v union all select public.preco_de_venda(null, 1.8)::float')).toEqual([null, null]);
});

test('o fator digitado pelo Callcenter: a conta da tela é a do banco, centavo por centavo', async () => {
  // À mão: 11,30 × 1,60 = 18,08 → 18,90 · 7,98 × 1,00 = 7,98 → 8,90 · 18,90 × 1,00 = 18,90 (já em ,90)
  // 0,01 × 5,00 = 0,05 → 0,90 · 12,345 não existe (centavos) · 33,33 × 1,55 = 51,6615 → 51,66 → 51,90
  expect([precoComFator(11.3, 1.6), precoComFator(7.98, 1), precoComFator(18.9, 1), precoComFator(0.01, 5), precoComFator(33.33, 1.55)])
    .toEqual([18.9, 8.9, 18.9, 0.9, 51.9]);
  expect([precoComFator(0, 1.8), precoComFator(10, 0)]).toEqual([null, null]);

  // Lado a lado com preco_de_venda: 3000 pares de centavos quebrados e fatores de 1,00 a 5,00
  let semente = 7;
  const sorteio = (n: number) => ((semente = (semente * 48271) % 2147483647), semente % n);
  const casos = Array.from({ length: 3000 }, () => [(sorteio(500000) + 1) / 100, (100 + sorteio(401)) / 100] as const);
  const doBanco = await numeros(
    `select public.preco_de_venda(c, f)::float as v from (values ${casos.map(([c, f], i) => `(${i}, ${c}::numeric, ${f}::numeric)`).join(',')}) t(i, c, f) order by i`
  );
  const divergentes = casos
    .map(([c, f], i) => ({ c, f, tela: precoComFator(c, f), banco: doBanco[i] }))
    .filter((x) => x.tela !== x.banco)
    .map((x) => `${x.c} × ${x.f}: tela ${x.tela} · banco ${x.banco}`);
  expect(divergentes).toEqual([]);
});

test('o fator da marca: direto, pelo apelido, e marca sem cadastro usa o padrão 1,80', async () => {
  const fatores = (marca: string) =>
    banco.db.query<{ variante: string; fator: number; padrao: boolean }>(
      `select variante, fator::float as fator, padrao from public.fatores_da_marca('${marca}')`
    ).then((r) => r.rows);
  expect(await fatores('Tecfil')).toEqual([{ variante: '', fator: 1.83, padrao: false }]);
  expect(await fatores('Mahle Metal-Leve')).toEqual([{ variante: '', fator: 1.8, padrao: false }]);
  expect(await fatores('Marca Nova SA')).toEqual([{ variante: '', fator: 1.8, padrao: true }]);
  expect((await fatores('isapa')).map((x) => `${x.variante} ${x.fator}`)).toEqual(['MECANISMOS 1.87', 'MOLAS 1.87', 'PISTÃO 2.55', 'SAPATA 1.97']);
});

type Linha = { tipo: string; codigo_peca: string; fornecedor: string; local: string | null; venda: number | null; custo: number | null; fator: number | null; situacao: string; variante: string; variantes: number; variante_provavel: boolean; fator_padrao: boolean };
const resultado = (uid: string, codigo: string) =>
  como<Linha>(uid, `select tipo, codigo_peca, fornecedor, local, venda::float as venda, custo::float as custo, fator::float as fator, situacao, variante, variantes, variante_provavel, fator_padrao from public.resultado_da_cotacao('${codigo}')`);

test('a Bia (Balcão) recebe a venda, sem custo nem fator', async () => {
  const r = (await resultado(BIA, 'OC90')) as Linha[];
  expect(r.map((x) => [x.tipo, x.codigo_peca, x.fornecedor, x.local, x.venda, x.custo, x.fator])).toEqual([
    // Melhor do dia é o de SP (RIB PRETO), não o LIMOEIRO mais barato de fora: 8,69 × 1,80 = 15,64 → 15,90
    ['peca', 'OC90', 'dpk', 'RIB PRETO', 15.9, null, null],
    ['peca', 'OC90', 'roles', null, null, null, null],
    // Similar Tecfil: 8,74 × 1,83 = 15,99 → 16,90
    ['similar', 'PSL619', 'roles', 'Ribeirao Preto', 16.9, null, null],
  ]);
  expect(r[1].situacao).toBe('SEM ESTOQUE');
});

test('o Gil (Gerente) recebe custo, fator e venda', async () => {
  const r = (await resultado(GIL, 'OC90')) as Linha[];
  expect(r[0]).toMatchObject({ venda: 15.9, custo: 8.69, fator: 1.8 });
});

test('marca com fatores por tipo de peça: aviso com todas as possibilidades, a da descrição marcada', async () => {
  const r = (await resultado(BIA, 'P123')) as Linha[];
  expect(r.map((x) => `${x.variante} ${x.venda} ${x.variante_provavel}`)).toEqual([
    'MECANISMOS 561.9 false', // 300 × 1,87 = 561,00 → 561,90
    'MOLAS 561.9 false',
    'SAPATA 591.9 false', // 300 × 1,97 = 591,00 → 591,90
    'PISTÃO 765.9 true', // 300 × 2,55 = 765,00 → 765,90 (a descrição diz PISTAO)
  ]);
  expect(r.every((x) => x.variantes === 4)).toBe(true);
});

test('marca sem cadastro: venda pelo fator padrão, marcada para o gerente cadastrar', async () => {
  const r = (await resultado(BIA, 'ZZ9')) as Linha[];
  expect(r).toMatchObject([{ venda: 18.9, fator_padrao: true }]); // 10 × 1,80 = 18,00 → 18,90
  expect(await como(GIL, 'select marca from public.marcas_sem_margem()')).toEqual([{ marca: 'MARCA NOVA SA' }]);
  expect(await como(BIA, 'select * from public.marcas_sem_margem()')).toContain('Gerente');
});

test('fatores fechados: a Bia não lê nem grava; Compras lê e não grava; o Gerente grava', async () => {
  expect(await como(BIA, 'select * from public.margens_por_marca')).toEqual([]);
  expect(await como(BIA, 'select * from public.apelidos_de_marca')).toEqual([]);
  expect(await como(BIA, "insert into public.margens_por_marca (marca, fator) values ('X', 1.1)")).toContain('row-level security');
  expect(await como(BIA, "select * from public.fatores_da_marca('TECFIL')")).toContain('permission denied');

  expect((await como(CAIO, "select fator::float as f from public.margens_por_marca where marca = 'TECFIL'"))).toEqual([{ f: 1.83 }]);
  expect(await como(CAIO, "update public.margens_por_marca set fator = 1.10 where marca = 'TECFIL' returning marca")).toEqual([]);

  expect(await como(GIL, "update public.margens_por_marca set fator = 1.90 where marca = 'TECFIL' returning fator::float as f")).toEqual([{ f: 1.9 }]);
  // A venda muda na hora: 8,74 × 1,90 = 16,61 → 16,90 (igual por causa do ,90); custo 8,74 × 1,90
  const r = (await resultado(GIL, 'OC90')) as Linha[];
  expect(r.find((x) => x.codigo_peca === 'PSL619')).toMatchObject({ fator: 1.9 });
  await banco.db.exec("update public.margens_por_marca set fator = 1.83 where marca = 'TECFIL'");
});

test('quem não cota não recebe resultado', async () => {
  await banco.db.exec(`
    insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a4');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo)
      values ('estoque', '00000000-0000-0000-0000-0000000000a4', 'Edu', 'edu', 'Estoque', 'Pirassununga', 1, true);
  `);
  expect(await resultado('00000000-0000-0000-0000-0000000000a4', 'OC90')).toContain('permissão');
});

test('a tela grava: o Gerente salva fator e aponta apelido; Compras e Balcão não', async () => {
  const fatorDe = async (marca: string) =>
    (await banco.db.query<{ f: number; padrao: boolean }>(`select fator::float as f, padrao from public.fatores_da_marca('${marca}')`)).rows[0];

  expect(await como(GIL, "select public.salvar_fator(' wix filtros ', '', 1.834)")).not.toBeTypeOf('string');
  expect(await fatorDe('WIX FILTROS')).toEqual({ f: 1.83, padrao: false }); // maiúsculas, sem espaço, 2 casas
  const r = await banco.db.query<{ por: string }>("select atualizado_por as por from public.margens_por_marca where marca = 'WIX FILTROS'");
  expect(r.rows[0].por).toBe('gil');

  // "Wix Filters" do B2B passa a usar o fator da WIX FILTROS
  expect(await fatorDe('Wix Filters')).toMatchObject({ padrao: true });
  expect(await como(GIL, "select public.apontar_apelido('Wix Filters', 'WIX FILTROS')")).not.toBeTypeOf('string');
  expect(await fatorDe('Wix Filters')).toEqual({ f: 1.83, padrao: false });
  expect(await como(GIL, "select public.apontar_apelido('Qualquer', 'MARCA QUE NAO EXISTE')")).toContain('não está na lista');

  expect(await como(CAIO, "select public.salvar_fator('TECFIL', '', 1.10)")).toContain('Gerente');
  expect(await como(BIA, "select public.apontar_apelido('Tecfil SA', 'TECFIL')")).toContain('Gerente');
  expect(await fatorDe('TECFIL')).toEqual({ f: 1.83, padrao: false });
});
