/**
 * O AFASTAMENTO NO BANCO (afastamentos.sql, 17/10/2026).
 *
 * Só o RH e o TI registram; leem a pessoa, quem responde por ela e o RH. E
 * quem está afastado não bate ponto — o banco recusa a marcação, venha de
 * onde vier.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const RH = '00000000-0000-0000-0000-0000000003a1';
const LIDER = '00000000-0000-0000-0000-0000000003a2';
const ANA = '00000000-0000-0000-0000-0000000003a3';
const BIA = '00000000-0000-0000-0000-0000000003a4';

beforeAll(async () => {
  banco = await montarBancoLocal();
  // O delta roda de novo sobre o esquema: "pode rodar mais de uma vez"
  await banco.db.exec(lerSql('afastamentos.sql').replace("notify pgrst, 'reload schema';", ''));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${RH}'), ('${LIDER}'), ('${ANA}'), ('${BIA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true),
      ('lider', '${LIDER}', 'Lia', 'lia', 'Balcão', 'Pirassununga', 2, true),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true),
      ('bia', '${BIA}', 'Bia', 'bia', 'Estoque', 'Descalvado', 1, true);
    alter table public.colaboradores disable trigger colaboradores_organograma_protegido;
    update public.colaboradores set responsavel_id = 'lider' where id = 'ana';
    alter table public.colaboradores enable trigger colaboradores_organograma_protegido;
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123')
      on conflict (loja) do update set codigo = excluded.codigo;
  `);
}, 120_000);

const como = async <T = any>(uid: string, sql: string): Promise<{ linhas: T[]; erro: string | null }> => {
  await banco.como(uid);
  try {
    const r = await banco.db.query<T>(sql);
    return { linhas: r.rows, erro: null };
  } catch (e: any) {
    return { linhas: [], erro: e.message };
  } finally {
    await banco.como(null);
  }
};

const afastar = (id: string, quem: string, fim: string | null) =>
  `insert into public.afastamentos (id, colaborador_id, inicio, fim, motivo)
   values ('${id}', '${quem}', current_date - 1, ${fim ? `'${fim}'` : 'null'}, 'doenca')`;

test('só o RH registra; o líder e a própria pessoa não', async () => {
  expect((await como(LIDER, afastar('l1', 'ana', null))).erro).toContain('row-level security');
  expect((await como(ANA, afastar('a1', 'ana', null))).erro).toContain('row-level security');
  expect((await como(RH, afastar('af-ana', 'ana', null))).erro).toBeNull();
  expect((await como(RH, `insert into public.afastamentos (id, colaborador_id, inicio, fim, motivo)
    values ('ruim', 'bia', '2026-10-10', '2026-10-01', 'doenca')`)).erro).toContain('afastamentos_fim_depois_do_inicio');
});

test('leem a pessoa, quem responde por ela e o RH — não o colega de outra loja', async () => {
  expect((await como(ANA, 'select id from public.afastamentos')).linhas.map((l) => l.id)).toEqual(['af-ana']);
  expect((await como(LIDER, 'select id from public.afastamentos')).linhas.map((l) => l.id)).toEqual(['af-ana']);
  expect((await como(RH, 'select id from public.afastamentos')).linhas.map((l) => l.id)).toEqual(['af-ana']);
  expect((await como(BIA, 'select id from public.afastamentos')).linhas).toEqual([]);
});

test('afastado não bate ponto; o colega sem afastamento bate', async () => {
  const ana = await como(ANA, `select public.registrar_marcacao('ABC123', 'Pirassununga', 'entrada') as r`);
  expect(ana.erro).toContain('Há um afastamento registrado para você');
  const original = await banco.db.query(`select 1 from public.marcacoes_originais where colaborador_id = 'ana'`);
  expect(original.rows).toEqual([]);

  // A Bia, de Descalvado, bate no código da loja dela
  await banco.db.exec(`insert into public.codigos_ponto_loja (loja, codigo) values ('Descalvado', 'XYZ789')
    on conflict (loja) do update set codigo = excluded.codigo;`);
  const bia = await como(BIA, `select public.registrar_marcacao('XYZ789', 'Descalvado', 'entrada') as r`);
  expect(bia.erro).toBeNull();
});

test('com a volta registrada, a mensagem diz até quando', async () => {
  await banco.db.exec(`update public.afastamentos set fim = current_date + 10 where id = 'af-ana'`);
  const ana = await como(ANA, `select public.registrar_marcacao('ABC123', 'Pirassununga', 'entrada') as r`);
  expect(ana.erro).toMatch(/Há um afastamento registrado para você até \d{2}\/\d{2}\/\d{4}/);
});
