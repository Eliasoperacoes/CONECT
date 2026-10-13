/**
 * NENHUMA FUNÇÃO DO BANCO PARA QUEM NÃO ESTÁ LOGADO
 * (funcoes-sem-acesso-anonimo.sql, laudo de 13/10/2026, item 5).
 *
 * No Postgres local, com o próprio delta: o anônimo deixa de executar
 * qualquer função; quem está logado executa EXATAMENTE o que executava
 * antes; e a ativação da conta (um gatilho, disparado sem login) continua.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
let doLogadoAntes: string[] = [];
let doAnonimoAntes: string[] = [];

const executaveis = async (papel: string) =>
  (await banco.db.query<{ f: string }>(`
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and has_function_privilege('${papel}', p.oid, 'execute')
     order by 1`)).rows.map((l) => l.f);

beforeAll(async () => {
  banco = await montarBancoLocal();
  // O estado do Supabase antes do delta: tudo aberto a PUBLIC (e ao anônimo)
  await banco.db.exec(`grant execute on all functions in schema public to public, anon`);
  // E uma função que o logado só alcança por herança de PUBLIC — é a que
  // perderia, se a permissão não fosse devolvida explicitamente
  await banco.db.exec(`revoke execute on function public.posso_decidir_jornada(text) from authenticated`);
  doLogadoAntes = await executaveis('authenticated');
  doAnonimoAntes = await executaveis('anon');
  await banco.db.exec(lerSql('funcoes-sem-acesso-anonimo.sql').replace("notify pgrst, 'reload schema';", ''));
}, 120_000);

test('antes, o anônimo executava funções — inclusive nomes_em_lista', () => {
  expect(doAnonimoAntes.length).toBeGreaterThan(10);
  expect(doAnonimoAntes).toContain('nomes_em_lista(text[])');
});

test('depois, o anônimo não executa NENHUMA função do banco', async () => {
  expect(await executaveis('anon')).toEqual([]);
  await banco.db.exec(`set role anon`);
  let erro = '';
  try {
    await banco.db.query(`select public.nomes_em_lista(array['ana'])`);
  } catch (e) {
    erro = (e as Error).message;
  }
  await banco.db.exec(`reset role`);
  expect(erro).toContain('permission denied');
});

test('quem está logado executa EXATAMENTE o que executava antes', async () => {
  expect(await executaveis('authenticated')).toEqual(doLogadoAntes);
});

test('função criada DEPOIS também não nasce aberta ao anônimo', async () => {
  await banco.db.exec(`create function public.funcao_nova_de_teste() returns int language sql as $$ select 1 $$`);
  const anonimo = await banco.db.query<{ pode: boolean }>(
    `select has_function_privilege('anon', 'public.funcao_nova_de_teste()', 'execute') as pode`
  );
  expect(anonimo.rows[0].pode).toBe(false);
});

test('a ativação da conta (gatilho disparado sem login) continua funcionando', async () => {
  await banco.db.exec(`
    insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo)
      values ('zeca', 'Zeca', 'zeca', 'Balcão', 'Leme', 1, true);
  `);
  const senha = (await banco.db.query<{ senha: string }>(`select senha from public.senhas_de_ativacao where colaborador_id = 'zeca'`)).rows[0].senha;
  // A conta criada por um papel SEM permissão de executar a função do gatilho
  // (no Supabase quem grava é o serviço de login; o ponto é o mesmo): o
  // gatilho roda assim mesmo, porque o Postgres não confere a permissão de
  // quem dispara
  expect(await executaveis('anon')).not.toContain('criar_colaborador_do_usuario()');
  await banco.db.exec(`grant insert on auth.users to anon; grant usage on schema auth to anon`);
  await banco.db.exec(`set role anon`);
  let erro = '';
  try {
    await banco.db.exec(`insert into auth.users (id, email, raw_user_meta_data)
      values ('00000000-0000-0000-0000-00000000d0d1', 'zeca@conecta.malachias.local', '{"login":"zeca","ativacao":"${senha}"}'::jsonb)`);
  } catch (e) {
    erro = (e as Error).message;
  } finally {
    await banco.db.exec(`reset role`);
  }
  const ficha = await banco.db.query<{ a: string | null }>(`select auth_user_id as a from public.colaboradores where id = 'zeca'`);
  expect(erro).toBe('');
  expect(ficha.rows[0].a).toBe('00000000-0000-0000-0000-00000000d0d1');
});

test('o esquema.sql traz o MESMO texto do delta, no FIM (depois de toda função)', async () => {
  const { readFileSync } = await import('node:fs');
  const delta = readFileSync('supabase/funcoes-sem-acesso-anonimo.sql', 'utf8');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const bloco = delta.slice(delta.indexOf('do $$'), delta.indexOf("notify pgrst, 'reload schema';")).trimEnd();
  expect(esquema.includes(bloco)).toBe(true);
  // Nenhuma função é criada depois do bloco: senão ela nasceria fora dele
  expect(esquema.slice(esquema.indexOf(bloco) + bloco.length)).not.toContain('create or replace function');
});
