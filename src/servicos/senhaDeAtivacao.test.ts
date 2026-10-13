/**
 * A SENHA DE PRIMEIRO ACESSO ALEATÓRIA (senha-de-ativacao-aleatoria.sql).
 *
 * Laudo de 13/10/2026, item 1: sem senha individual, qualquer pessoa que
 * soubesse o login de quem ainda não tinha entrado ativava a conta dele
 * com "123456"; e a individual ficava na ficha, que todo logado lê.
 *
 * Tudo aqui roda no Postgres local com o PRÓPRIO delta: a ativação de
 * verdade (a conta criada e o gatilho conferindo), o reset, o sorteio e
 * quem consegue ler as senhas.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;

const RITA = '00000000-0000-0000-0000-00000000a0a1'; // RH: cuida de pessoas
const ANA = '00000000-0000-0000-0000-00000000a0a2'; // balcão, já ativada
const FORMATO = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

const um = async (sql: string) => (await banco.db.query(sql)).rows[0] as any;
const erroDe = async (sql: string): Promise<string | null> => {
  try {
    await banco.db.exec(sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const senhaDe = async (id: string) =>
  (await um(`select senha from public.senhas_de_ativacao where colaborador_id = '${id}'`))?.senha ?? null;

/** O primeiro acesso de verdade: a conta é criada e o gatilho confere a senha. */
const ativar = (uid: string, login: string, senha: string) =>
  erroDe(`insert into auth.users (id, email, raw_user_meta_data)
          values ('${uid}', '${login}@conecta.malachias.local', '{"login": "${login}", "ativacao": "${senha}"}'::jsonb)`);

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${RITA}'), ('${ANA}');
    alter table auth.users enable trigger all;
  `);
  // Antes do delta: a Rita e a Ana JÁ ATIVADAS; o Bruno e a Carla esperando o
  // primeiro acesso — a Carla com a senha individual que o RH definiu
  await banco.db.exec(`
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo, senha_ativacao) values
      ('rita', '${RITA}', 'Rita', 'rita', 'RH', 'Pirassununga', 2, true, null),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true, null),
      ('bruno', null, 'Bruno', 'bruno', 'Balcão', 'Descalvado', 1, true, null),
      ('carla', null, 'Carla', 'carla', 'Balcão', 'Leme', 1, true, 'casa2026');
  `);
  await banco.db.exec(lerSql('senha-de-ativacao-aleatoria.sql').replace("notify pgrst, 'reload schema';", ''));
  // Como no Supabase: a tabela nova já nasce concedida a quem está logado,
  // e quem barra é a RLS — que é o que se testa aqui
  await banco.db.exec(`grant select, insert, update, delete on public.senhas_de_ativacao to authenticated`);
}, 120_000);

test('A CARGA: quem não ativou ganha senha; a individual é preservada; quem já entrou não é tocado', async () => {
  expect(await senhaDe('bruno')).toMatch(FORMATO);
  expect(await senhaDe('carla')).toBe('casa2026');
  expect(await senhaDe('rita')).toBeNull();
  expect(await senhaDe('ana')).toBeNull();
  // E a ficha, que todo logado lê, não guarda senha de ninguém
  expect(Number((await um(`select count(*) n from public.colaboradores where senha_ativacao is not null`)).n)).toBe(0);
});

test('rodar o delta de novo não sorteia outra senha para quem já tem', async () => {
  const antes = await senhaDe('bruno');
  await banco.db.exec(lerSql('senha-de-ativacao-aleatoria.sql').replace("notify pgrst, 'reload schema';", ''));
  expect(await senhaDe('bruno')).toBe(antes);
});

test('"123456" NÃO ATIVA MAIS ninguém; a senha da ficha ativa, e some depois de usada', async () => {
  const recusa = await ativar('00000000-0000-0000-0000-00000000b0b1', 'bruno', '123456');
  expect(recusa).toContain('Senha de primeiro acesso incorreta');
  expect((await um(`select auth_user_id from public.colaboradores where id = 'bruno'`)).auth_user_id).toBeNull();

  const certa = await senhaDe('bruno');
  expect(await ativar('00000000-0000-0000-0000-00000000b0b2', 'bruno', certa)).toBeNull();
  expect((await um(`select auth_user_id from public.colaboradores where id = 'bruno'`)).auth_user_id).toBe('00000000-0000-0000-0000-00000000b0b2');
  expect(await senhaDe('bruno')).toBeNull();
});

test('FICHA NOVA nasce com senha sorteada — e o "123456" que o app antigo manda vale como "sem senha"', async () => {
  await banco.db.exec(`
    insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo, senha_ativacao) values
      ('davi', 'Davi', 'davi', 'Balcão', 'Leme', 1, true, null),
      ('eva', 'Eva', 'eva', 'Balcão', 'Leme', 1, true, '123456'),
      ('fabi', 'Fabi', 'fabi', 'Balcão', 'Leme', 1, true, 'praia2026');
  `);
  expect(await senhaDe('davi')).toMatch(FORMATO);
  expect(await senhaDe('eva')).toMatch(FORMATO);
  expect(await senhaDe('fabi')).toBe('praia2026');
  expect(Number((await um(`select count(*) n from public.colaboradores where senha_ativacao is not null`)).n)).toBe(0);
});

test('o sorteio não repete e usa só o alfabeto sem letras que se confundem', async () => {
  const r = await banco.db.query<{ s: string }>(`select public.senha_aleatoria() as s from generate_series(1, 200)`);
  const senhas = r.rows.map((l) => l.s);
  expect(senhas.every((s) => FORMATO.test(s))).toBe(true);
  expect(new Set(senhas).size).toBe(200);
});

test('SÓ QUEM CUIDA DE PESSOAS lê as senhas; a Ana não vê nem pela tabela nem pelos cupons', async () => {
  await banco.como(ANA);
  const pelaTabela = Number((await um(`select count(*) n from public.senhas_de_ativacao`)).n);
  const pelosCupons = Number((await um(`select count(*) n from public.senhas_para_entregar()`)).n);
  const grava = await erroDe(`insert into public.senhas_de_ativacao (colaborador_id, senha) values ('ana', 'roubada1')`);
  await banco.como(null);
  expect({ pelaTabela, pelosCupons, gravaRecusada: grava !== null }).toEqual({ pelaTabela: 0, pelosCupons: 0, gravaRecusada: true });

  await banco.como(RITA);
  const cupons = (await banco.db.query<any>(`select login, senha from public.senhas_para_entregar()`)).rows;
  await banco.como(null);
  // Só quem ainda não ativou: Carla, Davi, Eva, Fabi (o Bruno já entrou)
  expect(cupons.map((c) => c.login).sort()).toEqual(['carla', 'davi', 'eva', 'fabi']);
});

test('O RESET pelo RH devolve uma senha NOVA e aleatória, e ela é a que ativa', async () => {
  await banco.como(RITA);
  const r = await um(`select * from public.resetar_senha_inicial('ana')`);
  await banco.como(null);
  expect(r.login).toBe('ana');
  expect(r.senha).toMatch(FORMATO);
  expect(r.senha).not.toBe('123456');
  expect(await senhaDe('ana')).toBe(r.senha);
  expect((await um(`select auth_user_id from public.colaboradores where id = 'ana'`)).auth_user_id).toBeNull();
  // A auditoria registra o reset, mas nunca a senha
  const auditoria = await um(`select detalhes from public.auditoria where acao = 'Senha inicial resetada' order by data_hora desc limit 1`);
  expect(auditoria.detalhes).not.toContain(r.senha);

  expect(await ativar('00000000-0000-0000-0000-00000000c0c1', 'ana', '123456')).toContain('incorreta');
  expect(await ativar('00000000-0000-0000-0000-00000000c0c2', 'ana', r.senha)).toBeNull();
});

test('o esquema.sql traz o MESMO texto do delta, e nenhuma senha padrão na ativação', async () => {
  const { readFileSync } = await import('node:fs');
  const delta = readFileSync('supabase/senha-de-ativacao-aleatoria.sql', 'utf8');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const SEP = '-- ------------------------------------------------------------\n';
  const secao = (inicio: string, fim: string) =>
    delta.slice(delta.lastIndexOf(SEP, delta.indexOf(inicio)), delta.lastIndexOf(SEP, delta.indexOf(fim))).trimEnd();
  expect(esquema.includes(secao('-- 1. ONDE A SENHA MORA', '-- 4. A ATIVAÇÃO SÓ ACEITA'))).toBe(true);
  expect(esquema.includes(secao('-- 5. O RESET PELO RH/ADM', '-- 7. A CARGA'))).toBe(true);
  const fn = (t: string) => t.slice(t.indexOf('create or replace function public.criar_colaborador_do_usuario()'), t.indexOf('\n$$;\n', t.indexOf('create or replace function public.criar_colaborador_do_usuario()')));
  expect(fn(esquema)).toBe(fn(delta));
  expect(fn(esquema)).not.toContain('123456');
  for (const peca of ['create or replace function public.criar_colaborador_do_usuario()', 'create or replace function public.resetar_senha_inicial(', 'create table if not exists public.senhas_de_ativacao']) {
    expect({ peca, vezes: esquema.split(peca).length - 1 }).toEqual({ peca, vezes: 1 });
  }
});
