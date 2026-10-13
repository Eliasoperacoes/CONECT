/**
 * QUEM LEU CADA MENSAGEM: SÓ PARA QUEM VÊ A MENSAGEM
 * (leituras-so-das-minhas-conversas.sql, laudo de 13/10/2026, item 8).
 *
 * No Postgres local, com o próprio delta. A Ana e o Bruno conversam; a
 * Carla não está na conversa. Antes, a Carla via que o Bruno leu a
 * mensagem da Ana; agora não vê — e a Ana e o Bruno continuam vendo, e
 * continuam gravando a própria leitura.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const ANA = '00000000-0000-0000-0000-0000000000f1';
const BRUNO = '00000000-0000-0000-0000-0000000000f2';
const CARLA = '00000000-0000-0000-0000-0000000000f3';

const leiturasQueVe = async (uid: string) => {
  await banco.como(uid);
  const r = await banco.db.query<{ m: string; c: string }>(`select mensagem_id as m, colaborador_id as c from public.leituras_mensagem order by 1, 2`);
  await banco.como(null);
  return r.rows.map((l) => `${l.m}:${l.c}`);
};

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${BRUNO}'), ('${CARLA}');
    alter table auth.users enable trigger all;
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Leme', 1, true),
      ('bruno', '${BRUNO}', 'Bruno', 'bruno', 'Balcão', 'Leme', 1, true),
      ('carla', '${CARLA}', 'Carla', 'carla', 'Balcão', 'Leme', 1, true);
    insert into public.conversas (id, tipo, nome) values ('c-ana-bruno', 'individual', 'Ana e Bruno');
    insert into public.participantes (conversa_id, colaborador_id) values ('c-ana-bruno', 'ana'), ('c-ana-bruno', 'bruno');
    insert into public.mensagens (id, conversa_id, remetente_id, tipo, texto) values ('m1', 'c-ana-bruno', 'ana', 'texto', 'oi');
    insert into public.leituras_mensagem (mensagem_id, colaborador_id) values ('m1', 'bruno');
  `);
}, 120_000);

test('com a regra antiga, a Carla — fora da conversa — via quem leu', async () => {
  // O estado de antes do delta, montado de propósito
  await banco.db.exec(`drop policy if exists leituras_leitura on public.leituras_mensagem;
    create policy leituras_leitura on public.leituras_mensagem for select to authenticated using (true);`);
  expect(await leiturasQueVe(CARLA)).toEqual(['m1:bruno']);
});

test('com o delta, a Carla não vê; a Ana e o Bruno continuam vendo', async () => {
  await banco.db.exec(lerSql('leituras-so-das-minhas-conversas.sql').replace("notify pgrst, 'reload schema';", ''));
  expect(await leiturasQueVe(CARLA)).toEqual([]);
  expect(await leiturasQueVe(ANA)).toEqual(['m1:bruno']);
  expect(await leiturasQueVe(BRUNO)).toEqual(['m1:bruno']);
});

test('a Ana continua gravando a própria leitura, e não consegue gravar a da Carla', async () => {
  await banco.como(ANA);
  await banco.db.exec(`insert into public.leituras_mensagem (mensagem_id, colaborador_id) values ('m1', 'ana')`);
  let erro = '';
  try {
    await banco.db.exec(`insert into public.leituras_mensagem (mensagem_id, colaborador_id) values ('m1', 'carla')`);
  } catch (e) {
    erro = (e as Error).message;
  }
  await banco.como(null);
  expect(erro).toContain('row-level security');
  expect(await leiturasQueVe(ANA)).toEqual(['m1:ana', 'm1:bruno']);
});

test('o esquema.sql traz a mesma regra do delta, uma vez só', async () => {
  const { readFileSync } = await import('node:fs');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const delta = readFileSync('supabase/leituras-so-das-minhas-conversas.sql', 'utf8');
  const regra = (t: string) => t.slice(t.indexOf('create policy leituras_leitura'), t.indexOf(';', t.indexOf('create policy leituras_leitura')) + 1);
  expect(regra(esquema)).toBe(regra(delta));
  expect(esquema.split('create policy leituras_leitura').length - 1).toBe(1);
});
