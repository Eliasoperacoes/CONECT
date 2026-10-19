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
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ${PESSOAS.map((p) => `('${p.uid}')`).join(', ')};
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ${PESSOAS.map((p) => `('c-${p.uid}', '${p.uid}', 'P', 'p${p.uid.slice(-4)}', '${p.setor}', 'Pirassununga', ${p.nivel}, true)`).join(',\n      ')};
  `);
}, 120_000);

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
