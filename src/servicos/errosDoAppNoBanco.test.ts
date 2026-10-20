/**
 * O REGISTRO DE ERROS NO BANCO (erros-do-app.sql, 20/10/2026): qualquer
 * pessoa logada grava o próprio erro, ninguém grava em nome de outro, e só
 * o TI lê.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const TI = '00000000-0000-0000-0000-0000000004a1';
const ANA = '00000000-0000-0000-0000-0000000004a2';
const RH = '00000000-0000-0000-0000-0000000004a3';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('erros-do-app.sql').replace("notify pgrst, 'reload schema';", ''));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${TI}'), ('${ANA}'), ('${RH}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('ti', '${TI}', 'Elias', 'elias', 'TI', 'Pirassununga', 5, true),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true),
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true);
  `);
}, 120_000);

const como = async (uid: string, sql: string) => {
  await banco.como(uid);
  try {
    return { linhas: (await banco.db.query<any>(sql)).rows, erro: null as string | null };
  } catch (e: any) {
    return { linhas: [], erro: e.message as string };
  } finally {
    await banco.como(null);
  }
};

test('a pessoa grava o próprio erro, e o nome sai da sessão', async () => {
  expect((await como(ANA, `insert into public.erros_do_app (tela, mensagem) values ('inicio', 'x is undefined')`)).erro).toBeNull();
  const r = await banco.db.query<{ colaborador_id: string }>(`select colaborador_id from public.erros_do_app`);
  expect(r.rows.map((l) => l.colaborador_id)).toEqual(['ana']);
});

test('ninguém grava erro em nome de outra pessoa', async () => {
  const r = await como(ANA, `insert into public.erros_do_app (colaborador_id, tela, mensagem) values ('ti', 'inicio', 'falso')`);
  expect(r.erro).toContain('row-level security');
});

test('só o TI lê — nem a própria pessoa, nem o RH', async () => {
  expect((await como(ANA, 'select id from public.erros_do_app')).linhas).toEqual([]);
  expect((await como(RH, 'select id from public.erros_do_app')).linhas).toEqual([]);
  expect((await como(TI, 'select id from public.erros_do_app')).linhas).toHaveLength(1);
});

test('ninguém apaga nem altera pela API', async () => {
  await como(TI, `delete from public.erros_do_app`);
  await como(TI, `update public.erros_do_app set mensagem = 'outra'`);
  const r = await banco.db.query<{ mensagem: string }>(`select mensagem from public.erros_do_app`);
  expect(r.rows.map((l) => l.mensagem)).toEqual(['x is undefined']);
});

test('texto gigante é recusado pelo banco', async () => {
  const r = await como(ANA, `insert into public.erros_do_app (tela, mensagem) values ('t', repeat('m', 600))`);
  expect(r.erro).toContain('erros_do_app_tamanhos');
});
