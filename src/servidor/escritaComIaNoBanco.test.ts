/**
 * A TRAVA DA IA DE ESCRITA, NO BANCO (escrita-com-ia.sql, 14/10/2026).
 *
 * Quem pode usar é quem pode publicar na Central — a mesma regra, com
 * nome, nas duas portas. E cada pessoa tem 30 usos por dia.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;

const LIDER = '00000000-0000-0000-0000-0000000000a1';
const BALCAO = '00000000-0000-0000-0000-0000000000a2';

beforeAll(async () => {
  banco = await montarBancoLocal();
  // O próprio delta, rodado por cima do esquema: tem de poder rodar de novo
  await banco.db.exec(lerSql('escrita-com-ia.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${LIDER}'), ('${BALCAO}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('lider', '${LIDER}', 'Lia', 'lia', 'Balcão', 'Pirassununga', 2, true),
      ('balcao', '${BALCAO}', 'Beto', 'beto', 'Balcão', 'Pirassununga', 1, true);
  `);
}, 120_000);

/** Chama a função como a pessoa; devolve o que restou, ou o erro do banco */
const usar = async (uid: string): Promise<{ restantes?: number; codigo?: string; mensagem?: string }> => {
  await banco.como(uid);
  try {
    const r = await banco.db.query<{ r: number }>('select public.usar_escrita_com_ia() as r');
    return { restantes: r.rows[0].r };
  } catch (e: any) {
    return { codigo: e.code, mensagem: e.message };
  } finally {
    await banco.como(null);
  }
};

test('a conferência do delta', async () => {
  const r = (await banco.db.query<any>(`
    select
      (select pg_get_expr(polwithcheck, polrelid) like '%posso_publicar_na_central%'
         from pg_policy where polname = 'avisos_insercao' and polrelid = 'public.avisos_rede'::regclass) as publicacao_usa_a_regra,
      not has_table_privilege('authenticated', 'public.usos_da_ia', 'select') as tabela_fechada,
      not has_function_privilege('anon', 'public.usar_escrita_com_ia()', 'execute') as anonimo_nao_usa`)).rows[0];
  expect(r).toEqual({ publicacao_usa_a_regra: true, tabela_fechada: true, anonimo_nao_usa: true });
});

test('quem não publica na Central não usa a IA, e o uso negado não conta', async () => {
  const r = await usar(BALCAO);
  expect(r.codigo).toBe('42501');
  expect(r.mensagem).toContain('quem publica na Central');
  const contagem = (await banco.db.query<{ n: number }>(`select count(*)::int as n from public.usos_da_ia where colaborador_id = 'balcao'`)).rows[0].n;
  expect(contagem).toBe(0);
});

test('o líder usa, cada uso conta, e no 31º do dia o banco recusa', async () => {
  expect((await usar(LIDER)).restantes).toBe(29);
  expect((await usar(LIDER)).restantes).toBe(28);
  for (let i = 0; i < 28; i++) await usar(LIDER);

  const passou = await usar(LIDER);
  expect(passou.codigo).toBe('P0001');
  expect(passou.mensagem).toContain('30 vezes hoje');

  // A recusa não deixa a contagem subir além do limite
  const usos = (await banco.db.query<{ usos: number }>(`select usos from public.usos_da_ia where colaborador_id = 'lider'`)).rows[0].usos;
  expect(usos).toBe(30);
});

/** Publica na Central como a pessoa; devolve o código do erro, ou null se publicou */
const publicar = async (uid: string, id: string, autor: string): Promise<string | null> => {
  await banco.como(uid);
  try {
    await banco.db.query(
      `insert into public.avisos_rede (id, titulo, conteudo, autor_id, autor_nome, autor_cargo)
       values ('${id}', 'Teste', 'Corpo', '${autor}', 'Nome', 'Cargo')`
    );
    return null;
  } catch (e: any) {
    return `${e.code} ${e.message}`;
  } finally {
    await banco.como(null);
  }
};

test('a mesma regra fecha a publicação: o líder publica, o balcão não', async () => {
  expect(await publicar(LIDER, 'do-lider', 'lider')).toBeNull();
  expect(await publicar(BALCAO, 'do-balcao', 'balcao')).toContain('row-level security');
});
