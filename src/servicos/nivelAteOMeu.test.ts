/**
 * NINGUÉM DÁ UM NÍVEL ACIMA DO PRÓPRIO (nivel-ate-o-meu.sql, 15/10/2026).
 *
 * O RH ganhou a tela Colaboradores, e as políticas de `colaboradores` não
 * olhavam o nível gravado: a Dani (4) criaria uma conta nível 5.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { niveisQuePossoDar } from '../tipos';

let banco: BancoLocal;
const RH = '00000000-0000-0000-0000-0000000000c1';
const TI = '00000000-0000-0000-0000-0000000000c2';
const ANA = '00000000-0000-0000-0000-0000000000c3';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('nivel-ate-o-meu.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${RH}'), ('${TI}'), ('${ANA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true),
      ('ti', '${TI}', 'Elias', 'elias', 'TI', 'Pirassununga', 5, true),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 3, true);
  `);
}, 120_000);

/** Roda como a pessoa; devolve null se o banco aceitou */
const como = async (uid: string, sql: string): Promise<string | null> => {
  await banco.como(uid);
  try {
    await banco.db.query(sql);
    return null;
  } catch (e: any) {
    return e.message;
  } finally {
    await banco.como(null);
  }
};

const criar = (id: string, nivel: number) =>
  `insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo)
   values ('${id}', '${id}', '${id}', 'Balcão', 'Pirassununga', ${nivel}, true)`;

test('o RH cria até o próprio nível, e não uma conta de TI', async () => {
  expect(await como(RH, criar('novo1', 1))).toBeNull();
  expect(await como(RH, criar('novo4', 4))).toBeNull();
  expect(await como(RH, criar('novo5', 5))).toContain('acima do seu');
});

test('o RH não promove ninguém ao 5; o TI promove', async () => {
  expect(await como(RH, `update public.colaboradores set nivel = 5 where id = 'novo1'`)).toContain('acima do seu');
  expect(await como(TI, `update public.colaboradores set nivel = 5 where id = 'novo1'`)).toBeNull();
});

test('quem foi rebaixado e salva a foto com o nível velho em cache não é recusado', async () => {
  // A Ana não cuida de pessoas: o gatilho do organograma devolve o nível antigo
  expect(await como(ANA, `update public.colaboradores set nivel = 5, foto = 'x' where id = 'ana'`)).toBeNull();
  const r = await banco.db.query<{ nivel: number; foto: string }>(`select nivel, foto from public.colaboradores where id = 'ana'`);
  expect(r.rows[0]).toEqual({ nivel: 3, foto: 'x' });
});

test('a tela oferece o mesmo que o banco aceita', () => {
  expect(niveisQuePossoDar({ nivel: 4 })).toEqual([1, 2, 3, 4]);
  expect(niveisQuePossoDar({ nivel: 2 })).toEqual([1, 2]);
  expect(niveisQuePossoDar({ nivel: 5 })).toEqual([1, 2, 3, 4, 5]);
});
