/**
 * O DIA ABONADO CHEGA À LIDERANÇA (dias-abonados-para-a-lideranca.sql, 06/11/2026).
 *
 * O atestado da Beatriz fechou o 04/11 em 0h00 no RH e em −2h30 no espelho
 * da Leigislaine, que não recebe atestado. O banco passa a entregar ao
 * líder só "este dia foi abonado" — sem tipo, anexo nem observação — e o
 * mantém sozinho a cada decisão do RH.
 */
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const RH = '00000000-0000-0000-0000-0000000004a1';
const LIDER = '00000000-0000-0000-0000-0000000004a2';
const ANA = '00000000-0000-0000-0000-0000000004a3';
const BIA = '00000000-0000-0000-0000-0000000004a4';

beforeAll(async () => {
  banco = await montarBancoLocal();
  // O delta roda de novo sobre o esquema: "pode rodar mais de uma vez"
  await banco.db.exec(lerSql('dias-abonados-para-a-lideranca.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${RH}'), ('${LIDER}'), ('${ANA}'), ('${BIA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true),
      ('lider', '${LIDER}', 'Lia', 'lia', 'Estoque', 'Pirassununga', 2, true),
      ('ana', '${ANA}', 'Ana', 'ana', 'Estoque', 'Pirassununga', 1, true),
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Descalvado', 1, true);
    alter table public.colaboradores disable trigger colaboradores_organograma_protegido;
    update public.colaboradores set responsavel_id = 'lider' where id = 'ana';
    alter table public.colaboradores enable trigger colaboradores_organograma_protegido;
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

const pedir = (id: string, quem: string, tipo: string, dia: string) =>
  como(RH, `insert into public.justificativas_ausencia (id, colaborador_id, data_inicio, data_fim, tipo, estado)
            values ('${id}', '${quem}', '${dia}', '${dia}', '${tipo}', 'pendente')`);
const decidir = (id: string, estado: string) =>
  como(RH, `update public.justificativas_ausencia set estado = '${estado}' where id = '${id}'`);
const abonadosDe = async (uid: string) =>
  (await como(uid, 'select id, colaborador_id, data_inicio::text as inicio from public.dias_abonados order by id')).linhas;

test('o atestado aprovado pelo RH vira dia abonado, e o líder o lê — sem ler o atestado', async () => {
  expect((await pedir('at-ana', 'ana', 'atestado', '2026-11-04')).erro).toBeNull();
  // Pendente ainda não abona
  expect(await abonadosDe(LIDER)).toEqual([]);

  expect((await decidir('at-ana', 'aprovada')).erro).toBeNull();
  expect(await abonadosDe(LIDER)).toEqual([{ id: 'at-ana', colaborador_id: 'ana', inicio: '2026-11-04' }]);
  // O atestado continua com o RH
  expect((await como(LIDER, `select id from public.justificativas_ausencia where id = 'at-ana'`)).linhas).toEqual([]);
});

test('a tabela não carrega o tipo, o anexo nem a observação', async () => {
  const colunas = await banco.db.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'dias_abonados' order by 1`
  );
  expect(colunas.rows.map((c) => c.column_name)).toEqual(['colaborador_id', 'data_fim', 'data_inicio', 'id']);
});

test('lêem a pessoa, quem responde por ela e o RH — não a colega de outra loja', async () => {
  expect((await abonadosDe(ANA)).map((l) => l.id)).toEqual(['at-ana']);
  expect((await abonadosDe(RH)).map((l) => l.id)).toEqual(['at-ana']);
  expect(await abonadosDe(BIA)).toEqual([]);
});

test('ninguém grava direto: só o gatilho', async () => {
  const lider = await como(LIDER, `insert into public.dias_abonados values ('x', 'ana', '2026-11-01', '2026-11-01')`);
  expect(lider.erro).not.toBeNull();
  const rh = await como(RH, `insert into public.dias_abonados values ('y', 'ana', '2026-11-01', '2026-11-01')`);
  expect(rh.erro).not.toBeNull();
});

test('a recusa depois da aprovação tira o dia; aprovar de novo devolve', async () => {
  await decidir('at-ana', 'recusada');
  expect(await abonadosDe(LIDER)).toEqual([]);
  await decidir('at-ana', 'aprovada');
  expect((await abonadosDe(LIDER)).map((l) => l.id)).toEqual(['at-ana']);
});

test('a ausência apagada pelo RH tira o dia', async () => {
  await pedir('cp-ana', 'ana', 'comparecimento', '2026-11-05');
  await decidir('cp-ana', 'aprovada');
  expect((await abonadosDe(LIDER)).map((l) => l.id)).toEqual(['at-ana', 'cp-ana']);
  expect((await como(RH, `delete from public.justificativas_ausencia where id = 'cp-ana'`)).erro).toBeNull();
  expect((await abonadosDe(LIDER)).map((l) => l.id)).toEqual(['at-ana']);
});

test('folga e férias ficam de fora: essas o líder já lê inteiras', async () => {
  await pedir('fo-ana', 'ana', 'folga_sabado', '2026-11-07');
  await decidir('fo-ana', 'aprovada');
  expect((await abonadosDe(LIDER)).map((l) => l.id)).toEqual(['at-ana']);
});

test('o esquema.sql traz o mesmo texto do delta', () => {
  const delta = readFileSync('supabase/dias-abonados-para-a-lideranca.sql', 'utf8');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const corpo = delta.slice(delta.indexOf('-- 1. A TABELA'), delta.indexOf("notify pgrst, 'reload schema';")).trim();
  expect(corpo.length).toBeGreaterThan(1000);
  expect(esquema).toContain(corpo);
});
