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
  // Como no Supabase (privilégio padrão, que vale ANTES do delta): toda
  // tabela e função nova alcança o logado, e quem decide é a regra (RLS) ou
  // o `revoke` do próprio delta
  await banco.db.exec(`
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant execute on functions to authenticated;
  `);
  await banco.db.exec(lerSql('cotador-banco.sql'));
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

// ------------------------------------------------------------
// Fila: a estação pega o próximo
// ------------------------------------------------------------

type Pegado = { id: string; codigo: string; situacao: string; estacao: string | null; pegada_por: string | null };

const pegar = (uid: string) => como<Pegado>(uid, "select * from public.pegar_proxima_cotacao('compras-matriz')");

test('pegar: o mais antigo primeiro, um de cada vez, e marca quem pegou', async () => {
  await banco.db.exec('delete from public.cotacoes_b2b');
  await pedir(uidDe('Balcão', 1), ['PRIMEIRO1']);
  await pedir(uidDe('Balcão', 1), ['SEGUNDO2']);

  const [a] = (await pegar(uidDe('Compras', 1))) as Pegado[];
  const [b] = (await pegar(uidDe('Compras', 2))) as Pegado[];
  expect([a.codigo, b.codigo]).toEqual(['PRIMEIRO1', 'SEGUNDO2']);
  expect(a).toMatchObject({ situacao: 'cotando', estacao: 'compras-matriz', pegada_por: `c-${uidDe('Compras', 1)}` });
  // Fila vazia: não devolve nada
  expect(await pegar(uidDe('Compras', 1))).toEqual([]);
});

test('pegar: pedido parado em "cotando" há mais de 5 minutos volta para a fila', async () => {
  await banco.db.exec("update public.cotacoes_b2b set pegada_em = now() - interval '6 minutes' where codigo = 'PRIMEIRO1'");
  await banco.db.exec("update public.cotacoes_b2b set pegada_em = now() - interval '4 minutes' where codigo = 'SEGUNDO2'");
  const r = (await pegar(uidDe('TI', 5))) as Pegado[];
  expect(r.map((x) => x.codigo)).toEqual(['PRIMEIRO1']);
  expect(await pegar(uidDe('TI', 5))).toEqual([]);
});

test('pegar: só quem atende a fila', async () => {
  await pedir(uidDe('Balcão', 1), ['TERCEIRO3']);
  for (const uid of [uidDe('Balcão', 1), uidDe('Gerência', 4), uidDe('Callcenter', 1)]) {
    expect(await pegar(uid)).toContain('Compras ou TI');
  }
});

test('pegar: duas estações ao mesmo tempo nunca levam o mesmo pedido (skip locked)', () => {
  const sql = lerSql('cotador-banco.sql').replace(/--.*$/gm, '');
  const funcao = sql.slice(sql.indexOf('function public.pegar_proxima_cotacao'));
  expect(funcao.slice(0, funcao.indexOf('$$;'))).toMatch(/for update skip locked/);
});

// ------------------------------------------------------------
// Gravar o que a estação cotou
// ------------------------------------------------------------

const RESULTADO_OC90 = [
  {
    fornecedor: 'dpk',
    peca: { codigo: 'OC90', marca: 'MAHLE METAL LEVE', descricao: 'FILTRO OLEO', grupo: 'FILTRO' },
    ofertas: [
      { local: 'RIB PRETO', emSP: true, preco: 9.65, quantidade: 228, disponivel: true, proximidade: 1 },
      { local: 'P PRUDENTE', emSP: true, preco: 9.65, quantidade: 279, disponivel: true, proximidade: 4 },
      { local: 'LIMOEIRO', emSP: false, preco: 7.6, quantidade: 1, disponivel: true, proximidade: 9 },
      { local: 'HUB CPS', emSP: true, preco: null, quantidade: 0, disponivel: false, proximidade: 2 },
    ],
    similares: [{ codigo: 'w-712/2', marca: 'MANN' }],
    erro: null,
  },
  { fornecedor: 'roles', peca: null, ofertas: [], similares: [], erro: null },
  { fornecedor: 'pellegrino', peca: null, ofertas: [], erro: 'sessão vencida' },
];

/** Pede, pega e grava como a estação; devolve o id do pedido e a resposta. */
const cotarDeVerdade = async (codigo: string, resultados: unknown) => {
  await banco.db.exec('delete from public.cotacoes_b2b');
  const [p] = (await pedir(uidDe('Balcão', 1), [codigo], false, true)) as Pedido[];
  await pegar(uidDe('Compras', 1));
  const r = await como<{ g: string }>(
    uidDe('Compras', 1),
    `select public.gravar_cotacao('${p.cotacao_id}', '${JSON.stringify(resultados)}'::jsonb) as g`
  );
  return { id: p.cotacao_id!, resposta: r };
};

test('gravar: o gerente vê o preço, o histórico fica com o menor de SP e o pedido fica pronto', async () => {
  await banco.db.exec("delete from public.precos_b2b where codigo = 'OC90'; delete from public.historico_precos_b2b where codigo = 'OC90'");
  const { id, resposta } = await cotarDeVerdade('OC90', RESULTADO_OC90);
  expect(resposta).toEqual([{ g: 'pronta' }]);

  expect(await como(uidDe('Gerência', 3), "select local, custo::float as custo from public.precos_b2b where codigo = 'OC90' order by local")).toEqual([
    { local: 'HUB CPS', custo: null },
    { local: 'LIMOEIRO', custo: 7.6 },
    { local: 'P PRUDENTE', custo: 9.65 },
    { local: 'RIB PRETO', custo: 9.65 },
  ]);
  // LIMOEIRO é mais barato, mas fora de SP: o melhor do dia é o de SP mais perto
  expect(
    await como(uidDe('Gerência', 3), "select fornecedor, local, custo::float as custo, situacao from public.historico_precos_b2b where codigo = 'OC90' order by fornecedor")
  ).toEqual([
    { fornecedor: 'dpk', local: 'RIB PRETO', custo: 9.65, situacao: 'SP' },
    { fornecedor: 'roles', local: null, custo: null, situacao: 'SEM ESTOQUE' },
  ]);
  expect(await como(uidDe('Gerência', 3), "select codigo_similar, marca_similar from public.similares_b2b where codigo = 'OC90'")).toEqual([
    { codigo_similar: 'W7122', marca_similar: 'MANN' },
  ]);
  // Pellegrino deu erro: o pedido fica pronto, com o aviso guardado
  expect(await como(uidDe('Balcão', 1), `select situacao, erro from public.cotacoes_b2b where id = '${id}'`)).toEqual([
    { situacao: 'pronta', erro: 'pellegrino: sessão vencida' },
  ]);
  // E "já tem preço de hoje?" responde por fornecedor
  expect(await como(uidDe('Balcão', 1), "select * from public.preco_de_hoje('OC90')")).toEqual([
    { fornecedor: 'roles', tem_preco: true },
    { fornecedor: 'pellegrino', tem_preco: false },
    { fornecedor: 'dpk', tem_preco: true },
  ]);
  // O Balcão, mesmo depois de gravado, continua sem ver custo
  expect(await como(uidDe('Balcão', 1), "select * from public.precos_b2b where codigo = 'OC90'")).toEqual([]);
});

test('gravar: cotar de novo troca o preço do dia, não acumula', async () => {
  const novo = [{ ...RESULTADO_OC90[0], ofertas: [{ local: 'BH', emSP: false, preco: 8.95, quantidade: 12, disponivel: true, proximidade: 8 }] }];
  await cotarDeVerdade('OC90', novo);
  expect(await como(uidDe('Gerência', 3), "select local from public.precos_b2b where codigo = 'OC90' and fornecedor = 'dpk'")).toEqual([
    { local: 'BH' },
  ]);
  expect(
    await como(uidDe('Gerência', 3), "select situacao, custo::float as custo from public.historico_precos_b2b where codigo = 'OC90' and fornecedor = 'dpk'")
  ).toEqual([{ situacao: 'FORA DO ESTADO', custo: 8.95 }]);
});

test('gravar: todos os fornecedores com erro = pedido em erro, e o preço anterior fica', async () => {
  const { id, resposta } = await cotarDeVerdade('OC90', [{ fornecedor: 'dpk', peca: null, ofertas: [], erro: 'fora do ar' }]);
  expect(resposta).toEqual([{ g: 'erro' }]);
  expect(await como(uidDe('Gerência', 3), `select situacao from public.cotacoes_b2b where id = '${id}'`)).toEqual([{ situacao: 'erro' }]);
  expect(await como(uidDe('Gerência', 3), "select local from public.precos_b2b where codigo = 'OC90' and fornecedor = 'dpk'")).toEqual([
    { local: 'BH' },
  ]);
});

test('gravar: só quem atende a fila, e só pedido que está sendo cotado', async () => {
  await banco.db.exec('delete from public.cotacoes_b2b');
  const [p] = (await pedir(uidDe('Balcão', 1), ['ZZ1'], false, true)) as Pedido[];
  const gravar = (uid: string) => como(uid, `select public.gravar_cotacao('${p.cotacao_id}', '[]'::jsonb)`);
  expect(await gravar(uidDe('Compras', 1))).toContain('não está sendo cotada');
  await pegar(uidDe('Compras', 1));
  expect(await gravar(uidDe('Gerência', 3))).toContain('Compras ou TI');
  expect(await gravar(uidDe('Balcão', 1))).toContain('Compras ou TI');
});

// ------------------------------------------------------------
// Similares com preço (SPEC-estacao, aprovado 20/10)
// ------------------------------------------------------------

test('similar que vem com ofertas ganha preço com o próprio código', async () => {
  await banco.db.exec("delete from public.precos_b2b where codigo in ('KL1', 'W7122'); delete from public.historico_precos_b2b where codigo in ('KL1', 'W7122')");
  const resultados = [
    {
      fornecedor: 'roles',
      peca: { codigo: 'KL1', marca: 'X', descricao: 'FILTRO', grupo: null },
      ofertas: [{ local: 'GOIANIA', emSP: false, preco: 30, quantidade: 2, disponivel: true, proximidade: 9 }],
      similares: [
        {
          codigo: 'W-712/2', marca: 'MANN', descricao: 'FILTRO OLEO',
          ofertas: [{ local: 'RIB PRETO', emSP: true, preco: 21.5, quantidade: 7, disponivel: true, proximidade: 1 }],
        },
        { codigo: 'PSL55', marca: 'TECFIL' }, // sem ofertas: só o vínculo
        { codigo: 'kl-1', marca: 'X' }, // a própria peça não é similar dela mesma
      ],
      erro: null,
    },
  ];
  await cotarDeVerdade('KL1', resultados);

  const gil = uidDe('Gerência', 3);
  expect(await como(gil, "select codigo_similar from public.similares_b2b where fornecedor = 'roles' and codigo = 'KL1' order by 1")).toEqual([
    { codigo_similar: 'PSL55' },
    { codigo_similar: 'W7122' },
  ]);
  expect(await como(gil, "select local, custo::float as custo, marca from public.precos_b2b where fornecedor = 'roles' and codigo = 'W7122'")).toEqual([
    { local: 'RIB PRETO', custo: 21.5, marca: 'MANN' },
  ]);
  expect(await como(gil, "select situacao from public.historico_precos_b2b where fornecedor = 'roles' and codigo = 'W7122'")).toEqual([
    { situacao: 'SP' },
  ]);
  // O similar sem ofertas não inventa preço nem "SEM ESTOQUE"
  expect(await como(gil, "select * from public.historico_precos_b2b where codigo = 'PSL55'")).toEqual([]);
});

test('a função interna de gravar ofertas não é chamável por quem está logado', async () => {
  const r = await banco.db.query<{ pode: boolean }>(
    "select has_function_privilege('authenticated', 'public.gravar_ofertas(text, text, jsonb, jsonb)', 'execute') as pode"
  );
  expect(r.rows[0].pode).toBe(false);
});

test('preço zero não é o melhor do dia, mesmo marcado como disponível (WEGA WO130, 20/10)', async () => {
  const comZero = (ofertas: unknown[]) => [{ fornecedor: 'dpk', peca: { codigo: 'WO130', marca: 'WEGA' }, ofertas, erro: null }];
  const zeroEmSP = { local: 'HUB CPS', emSP: true, preco: 0, quantidade: 50, disponivel: true, proximidade: 2 };

  await cotarDeVerdade('WO130', comZero([zeroEmSP, { local: 'BH', emSP: false, preco: 12.4, quantidade: 3, disponivel: true, proximidade: 8 }]));
  const historico = () =>
    como(uidDe('Gerência', 3), "select local, custo::float as custo, situacao from public.historico_precos_b2b where codigo = 'WO130'");
  expect(await historico()).toEqual([{ local: 'BH', custo: 12.4, situacao: 'FORA DO ESTADO' }]);

  await cotarDeVerdade('WO130', comZero([zeroEmSP]));
  expect(await historico()).toEqual([{ local: null, custo: null, situacao: 'SEM ESTOQUE' }]);
});
