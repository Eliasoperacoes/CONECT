/**
 * COTADOR B2B NO BANCO (supabase/cotador-banco.sql,
 * docs/cotador/SPEC-banco-cotacao.md).
 *
 * O custo do fornecedor não pode chegar a quem só vende. A tela esconde,
 * mas quem vale é o banco: aqui ele é montado de verdade (PGlite) e cada
 * pergunta é feita entrando no papel de uma pessoa.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { SETORES, NIVEIS_EM_ORDEM, podeCotar, podeVerCusto, podeAtenderFila } from '../tipos';

let banco: BancoLocal;

/** Uma pessoa por setor e nível, com uid previsível. */
const PESSOAS = SETORES.flatMap((setor, s) =>
  NIVEIS_EM_ORDEM.map((nivel) => ({
    setor,
    nivel,
    uid: `00000000-0000-0000-0000-${String(s * 10 + nivel).padStart(12, '0')}`,
  }))
);

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('cotador-banco.sql'));
  // Como no Supabase (privilégio padrão): toda tabela nova alcança o logado,
  // e quem decide é a regra (RLS)
  await banco.db.exec(`
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ${PESSOAS.map((p) => `('${p.uid}')`).join(', ')};
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ${PESSOAS.map((p) => `('c-${p.uid}', '${p.uid}', 'P', 'p${p.uid.slice(-4)}', '${p.setor}', 'Pirassununga', ${p.nivel}, true)`).join(',\n      ')};
  `);
}, 120_000);

const uidDe = (setor: string, nivel: number): string =>
  PESSOAS.find((p) => p.setor === setor && p.nivel === nivel)!.uid;

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

/** Pergunta ao banco como a pessoa. */
const perguntar = async (uid: string, funcao: string): Promise<boolean> => {
  await banco.como(uid);
  try {
    const r = await banco.db.query<{ v: boolean }>(`select public.${funcao}() as v`);
    return r.rows[0].v;
  } finally {
    await banco.como(null);
  }
};

const PARES = [
  ['posso_cotar', podeCotar],
  ['posso_ver_custo', podeVerCusto],
  ['posso_atender_fila', podeAtenderFila],
] as const;

for (const [funcao, regraDaTela] of PARES) {
  test(`${funcao}: a tela e o banco respondem igual para todo setor e nível`, async () => {
    const diferentes: string[] = [];
    for (const p of PESSOAS) {
      const banco = await perguntar(p.uid, funcao);
      if (banco !== regraDaTela(p)) diferentes.push(`${p.setor} nível ${p.nivel}: banco ${banco}`);
    }
    expect(diferentes).toEqual([]);
  });
}

test('a regra é a combinada com o Elias (e não só igual dos dois lados)', () => {
  const balcao = { setor: 'Balcão', nivel: 1 };
  const callcenter = { setor: 'Callcenter', nivel: 1 };
  const compras = { setor: 'Compras', nivel: 1 };
  const gerente = { setor: 'Gerência', nivel: 3 };
  const estoque = { setor: 'Estoque', nivel: 2 };
  const ti = { setor: 'TI', nivel: 5 };

  expect([balcao, callcenter, compras, gerente, estoque, ti].map(podeCotar)).toEqual([true, true, false, true, false, true]);
  // O Balcão cota, mas não vê custo
  expect([balcao, callcenter, compras, gerente, estoque, ti].map(podeVerCusto)).toEqual([false, true, true, true, false, true]);
  // O Gerente não atende a fila: ela é do PC de compras
  expect([balcao, callcenter, compras, gerente, estoque, ti].map(podeAtenderFila)).toEqual([false, false, true, false, false, true]);
});

test('ninguém de fora do login chama as regras', async () => {
  const r = await banco.db.query<{ funcao: string; anon: boolean }>(`
    select p.proname as funcao, has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p
     where p.proname in ('posso_cotar', 'posso_ver_custo', 'posso_atender_fila')
  `);
  expect(r.rows).toHaveLength(3);
  expect(r.rows.filter((x) => x.anon).map((x) => x.funcao)).toEqual([]);
});

// ------------------------------------------------------------
// Fornecedores
// ------------------------------------------------------------

test('fornecedores: quem cota e quem atende a fila leem Roles, Pellegrino e DPK ligados', async () => {
  for (const uid of [uidDe('Balcão', 1), uidDe('Compras', 1), uidDe('Gerência', 3)]) {
    expect(await como(uid, 'select chave from public.fornecedores_b2b where ativo order by ordem')).toEqual([
      { chave: 'roles' },
      { chave: 'pellegrino' },
      { chave: 'dpk' },
    ]);
  }
});

test('fornecedores: quem não cota não lê', async () => {
  expect(await como(uidDe('Estoque', 2), 'select chave from public.fornecedores_b2b')).toEqual([]);
});

test('fornecedores: só o TI liga e desliga', async () => {
  const desligar = "update public.fornecedores_b2b set ativo = false where chave = 'dpk' returning chave";
  expect(await como(uidDe('Gerência', 4), desligar)).toEqual([]);
  expect(await como(uidDe('Compras', 1), desligar)).toEqual([]);
  expect(await como(uidDe('Balcão', 1), "insert into public.fornecedores_b2b (chave, nome) values ('falso', 'X')")).toContain(
    'row-level security'
  );
  expect(await como(uidDe('TI', 5), desligar)).toEqual([{ chave: 'dpk' }]);
  await banco.db.exec("update public.fornecedores_b2b set ativo = true where chave = 'dpk'");
});

// ------------------------------------------------------------
// Preço do dia, similares e histórico: o custo fechado
// ------------------------------------------------------------

const TABELAS_DE_CUSTO = ['precos_b2b', 'similares_b2b', 'historico_precos_b2b'];

const semearPreco = () =>
  banco.db.exec(`
    insert into public.precos_b2b (fornecedor, codigo, local, em_sp, custo, quantidade, disponivel, proximidade)
      values ('dpk', 'OC90', 'RIB PRETO', true, 9.65, 228, true, 1) on conflict do nothing;
    insert into public.similares_b2b (fornecedor, codigo, codigo_similar, marca_similar)
      values ('dpk', 'OC90', 'W7122', 'MANN') on conflict do nothing;
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, local, custo, situacao)
      values ('2026-10-19', 'dpk', 'OC90', 'RIB PRETO', 9.65, 'SP') on conflict do nothing;
  `);

test('custo: o Balcão consulta direto e recebe vazio; quem vê custo recebe as linhas', async () => {
  await semearPreco();
  for (const tabela of TABELAS_DE_CUSTO) {
    expect(await como(uidDe('Balcão', 2), `select * from public.${tabela}`)).toEqual([]);
    expect(await como(uidDe('Estoque', 1), `select * from public.${tabela}`)).toEqual([]);
    for (const uid of [uidDe('Gerência', 3), uidDe('Callcenter', 1), uidDe('Compras', 1)]) {
      expect(await como(uid, `select codigo from public.${tabela}`)).toEqual([{ codigo: 'OC90' }]);
    }
  }
});

test('custo: ninguém grava direto, nem quem atende a fila nem o TI', async () => {
  for (const uid of [uidDe('Compras', 1), uidDe('TI', 5)]) {
    expect(
      await como(uid, "insert into public.precos_b2b (fornecedor, codigo, local, em_sp, disponivel) values ('dpk', 'X1', 'BH', false, true)")
    ).toContain('row-level security');
    expect(await como(uid, "update public.precos_b2b set custo = 0.01 where codigo = 'OC90' returning codigo")).toEqual([]);
    expect(await como(uid, "delete from public.historico_precos_b2b where codigo = 'OC90' returning codigo")).toEqual([]);
  }
});

test('custo: a única regra destas tabelas é a de leitura por posso_ver_custo', async () => {
  const r = await banco.db.query<{ tabela: string; cmd: string; regra: string }>(`
    select tablename as tabela, cmd, coalesce(qual, '') || coalesce(with_check, '') as regra
      from pg_policies where tablename in ('precos_b2b', 'similares_b2b', 'historico_precos_b2b')
     order by tablename
  `);
  expect(r.rows.map((x) => `${x.tabela} ${x.cmd} ${x.regra}`)).toEqual([
    'historico_precos_b2b SELECT posso_ver_custo()',
    'precos_b2b SELECT posso_ver_custo()',
    'similares_b2b SELECT posso_ver_custo()',
  ]);
});

// ------------------------------------------------------------
// Estação: sem login próprio, o sinal vem de quem atende a fila
// ------------------------------------------------------------

const SINAL = `select public.sinal_da_estacao('compras-matriz', '{"roles":"ok","pellegrino":"ok","dpk":"deslogado"}', '0.3.0')`;

test('estação: Compras dá sinal; o Balcão vê a estação no ar e os sites', async () => {
  expect(await como(uidDe('Compras', 1), SINAL)).not.toBeTypeOf('string');
  const vista = await como<{ nome: string; online: boolean; dpk: string; atendida_por: string }>(
    uidDe('Balcão', 1),
    `select nome, public.estacao_online(visto_em) as online, sites->>'dpk' as dpk, atendida_por from public.estacoes_cotacao`
  );
  expect(vista).toEqual([{ nome: 'compras-matriz', online: true, dpk: 'deslogado', atendida_por: `c-${uidDe('Compras', 1)}` }]);
});

test('estação: quem não atende a fila não dá sinal nem grava direto', async () => {
  for (const uid of [uidDe('Balcão', 1), uidDe('Gerência', 4)]) {
    expect(await como(uid, SINAL)).toContain('Compras ou TI');
    expect(await como(uid, "update public.estacoes_cotacao set visto_em = now() returning nome")).toEqual([]);
  }
  expect(await como(uidDe('Estoque', 1), 'select nome from public.estacoes_cotacao')).toEqual([]);
});

test('estação: mais de 3 minutos sem sinal conta como fora', async () => {
  const r = await banco.db.query<{ agora: boolean; dois: boolean; quatro: boolean }>(`
    select public.estacao_online(now()) as agora,
           public.estacao_online(now() - interval '2 minutes') as dois,
           public.estacao_online(now() - interval '4 minutes') as quatro
  `);
  expect(r.rows[0]).toEqual({ agora: true, dois: true, quatro: false });
});

// ------------------------------------------------------------
// Fila: pedir cotação
// ------------------------------------------------------------

type Pedido = { codigo: string; cotacao_id: string | null; ja_tem_preco: boolean };

const pedir = (uid: string, codigos: string[], similares = false, forcar = false) =>
  como<Pedido>(
    uid,
    `select * from public.pedir_cotacao(array[${codigos.map((c) => `'${c}'`).join(',')}]::text[], ${similares}, ${forcar})`
  );

test('fila: o mesmo código digitado de dois jeitos vira um pedido só', async () => {
  const r = (await pedir(uidDe('Balcão', 1), ['oc-90', ' OC 90 '])) as Pedido[];
  expect(r.map((x) => x.codigo)).toEqual(['OC90', 'OC90']);
  expect(r[0].cotacao_id).not.toBeNull();
  expect(r[1].cotacao_id).toBe(r[0].cotacao_id);
  // Outro balconista pedindo depois também reaproveita
  const outro = (await pedir(uidDe('Balcão', 2), ['OC90'])) as Pedido[];
  expect(outro[0].cotacao_id).toBe(r[0].cotacao_id);
  const n = await banco.db.query<{ n: number }>("select count(*)::int as n from public.cotacoes_b2b where codigo = 'OC90'");
  expect(n.rows[0].n).toBe(1);
});

test('fila: pedido de quem pediu similares depois passa a trazê-los', async () => {
  const [a] = (await pedir(uidDe('Balcão', 1), ['LB1'])) as Pedido[];
  await pedir(uidDe('Callcenter', 1), ['LB1'], true);
  const r = await banco.db.query<{ s: boolean }>(`select incluir_similares as s from public.cotacoes_b2b where id = '${a.cotacao_id}'`);
  expect(r.rows[0].s).toBe(true);
});

test('fila: com preço de hoje em todos os fornecedores não entra na fila; com forçar, entra', async () => {
  await banco.db.exec(`
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, situacao)
    select public.hoje_brasilia(), chave, 'HG5170', 'SEM ESTOQUE' from public.fornecedores_b2b
    on conflict do nothing;
  `);
  expect(await pedir(uidDe('Balcão', 1), ['HG5170'])).toEqual([{ codigo: 'HG5170', cotacao_id: null, ja_tem_preco: true }]);
  const [f] = (await pedir(uidDe('Balcão', 1), ['HG5170'], false, true)) as Pedido[];
  expect(f.cotacao_id).not.toBeNull();
});

test('fila: preço de ontem ou de só um fornecedor não conta como pronto', async () => {
  await banco.db.exec(`
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, situacao)
    select public.hoje_brasilia() - 1, chave, 'PSL100', 'SP' from public.fornecedores_b2b;
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, situacao)
    values (public.hoje_brasilia(), 'dpk', 'PSL100', 'SP');
  `);
  expect(await como(uidDe('Balcão', 1), "select * from public.preco_de_hoje('psl-100')")).toEqual([
    { fornecedor: 'roles', tem_preco: false },
    { fornecedor: 'pellegrino', tem_preco: false },
    { fornecedor: 'dpk', tem_preco: true },
  ]);
  const [p] = (await pedir(uidDe('Balcão', 1), ['PSL100'])) as Pedido[];
  expect(p.ja_tem_preco).toBe(false);
  expect(p.cotacao_id).not.toBeNull();
});

test('fila: quem não cota não pede; ninguém grava direto', async () => {
  expect(await pedir(uidDe('Estoque', 1), ['X9'])).toContain('cotam');
  expect(await pedir(uidDe('Compras', 1), ['X9'])).toContain('cotam');
  expect(
    await como(uidDe('Balcão', 1), "insert into public.cotacoes_b2b (codigo, codigo_digitado) values ('X9', 'X9')")
  ).toContain('row-level security');
});

test('fila: o balconista vê o próprio pedido; o gerente e compras veem todos', async () => {
  const [p] = (await pedir(uidDe('Balcão', 3), ['MEUPEDIDO1'])) as Pedido[];
  const ver = (uid: string) => como(uid, `select codigo from public.cotacoes_b2b where id = '${p.cotacao_id}'`);
  expect(await ver(uidDe('Balcão', 3))).toEqual([{ codigo: 'MEUPEDIDO1' }]);
  expect(await ver(uidDe('Balcão', 1))).toEqual([]);
  expect(await ver(uidDe('Gerência', 3))).toEqual([{ codigo: 'MEUPEDIDO1' }]);
  expect(await ver(uidDe('Compras', 1))).toEqual([{ codigo: 'MEUPEDIDO1' }]);
});

test('"hoje" é o dia de Brasília, numa função só', () => {
  const sql = lerSql('cotador-banco.sql').replace(/--.*$/gm, '');
  expect(sql).toContain("(now() at time zone 'America/Sao_Paulo')::date");
  // Nenhum outro "hoje" solto: current_date e now()::date viram o dia em UTC
  expect(sql).not.toMatch(/current_date|now\(\)::date/);
});
