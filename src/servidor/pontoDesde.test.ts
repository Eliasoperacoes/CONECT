/**
 * "PONTO VALE DESDE" (ponto-desde.sql, 15/10/2026).
 *
 * As 23 pessoas de Pirassununga do Fabio e da Dani batiam no papel, e
 * desde 01/10 cada dia útil sem batida virou falta. Antes do "ponto
 * desde" da ficha não há falta na madrugada, alerta de "não bateu" nem
 * espelho a assinar — a mesma data para os três (`inicioDoPontoDe`).
 */
process.env.TZ = 'UTC';
import { test, expect, beforeAll } from 'bun:test';
import { planejarApuracao } from './apurarPonto';
import { planejarAlertasSemBater } from './semBater';
import { espelhosParaAssinar } from '../servicos/mesesDoEspelho';
import { inicioDoPontoDe } from '../tipos';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

const pessoa = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id, nome: id, login: id, cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel: 1,
    turno: 'A', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '', ...extra,
  }) as any;

// Ninguém bateu nada. A Ana já vale desde sempre; o Abner, só de 19/10
const ANA = pessoa('ana');
const ABNER = pessoa('abner', { pontoDesde: '2026-10-19' });
const dados = { colaboradores: [ANA, ABNER], batidas: [], ausencias: [], feriados: [], ajustes: [], permissoes: null };

test('a data que vale: a mais tarde entre a admissão e o "ponto desde"', () => {
  expect(inicioDoPontoDe({})).toBe('');
  expect(inicioDoPontoDe({ dataAdmissao: '2025-03-01' })).toBe('2025-03-01');
  expect(inicioDoPontoDe({ dataAdmissao: '2025-03-01', pontoDesde: '2026-10-19' })).toBe('2026-10-19');
  // Admitido depois do "ponto desde" de um grupo: vale a admissão
  expect(inicioDoPontoDe({ dataAdmissao: '2026-11-03', pontoDesde: '2026-10-19' })).toBe('2026-11-03');
});

test('a madrugada não cria falta antes do "ponto desde" — e cria depois', () => {
  let n = 0;
  const faltasDe = (hoje: string) =>
    planejarApuracao(dados, { hoje, agora: `${hoje}T06:00:00.000Z`, novoId: () => `n${n++}`, diasParaTras: 7 })
      .gravar.map((a) => `${a.colaboradorId} ${a.data}`);

  // Quinta, 15/10: revisa 08 a 14/10 — a Ana falta nos dias úteis, o Abner não
  const antes = faltasDe('2026-10-15');
  expect(antes.filter((f) => f.startsWith('ana')).length).toBeGreaterThan(0);
  expect(antes.filter((f) => f.startsWith('abner'))).toEqual([]);

  // Quarta, 21/10: 19 e 20/10 já são dele, e viram falta
  const depois = faltasDe('2026-10-21').filter((f) => f.startsWith('abner')).sort();
  expect(depois).toEqual(['abner 2026-10-19', 'abner 2026-10-20']);
});

test('o alerta de "não bateu" só começa no dia em que o ponto vale', () => {
  // Quinta, 15/10, 07:40 de Brasília = 10:40 UTC: passou a entrada das 07:30
  const quem = (data: string) =>
    planejarAlertasSemBater(dados, new Date(`${data}T10:40:07.000Z`)).map((a) => a.colaboradorId);
  expect(quem('2026-10-15')).toEqual(['ana']);
  expect(quem('2026-10-19')).toEqual(['ana', 'abner']);
});

test('não há espelho a assinar de mês em que o ponto ainda não valia', () => {
  const nada = { has: () => false };
  // Em 05/11, o de outubro existe para os dois; o de setembro, só para a Ana
  expect(espelhosParaAssinar(ANA, true, '2026-11-05', nada)).toEqual(['2026-10', '2026-09']);
  expect(espelhosParaAssinar(ABNER, true, '2026-11-05', nada)).toEqual(['2026-10']);
});

// ---------------------------------------------------------------- no banco

let banco: BancoLocal;
const PESSOA = '00000000-0000-0000-0000-0000000000d1';
const RH = '00000000-0000-0000-0000-0000000000d2';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('ponto-desde.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${PESSOA}'), ('${RH}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('p', '${PESSOA}', 'Paulo', 'paulo', 'Balcão', 'Pirassununga', 1, true),
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true);
  `);
}, 120_000);

const como = async (uid: string, sql: string) => {
  await banco.como(uid);
  try {
    return await banco.db.query<any>(sql);
  } finally {
    await banco.como(null);
  }
};

test('no banco: todos leem a data, o RH grava, a pessoa não muda a dela', async () => {
  await como(RH, `update public.colaboradores set ponto_desde = '2026-10-19' where id = 'p'`);
  expect((await como(PESSOA, `select ponto_desde::text as d from public.colaboradores where id = 'p'`)).rows[0].d).toBe('2026-10-19');

  // A pessoa tenta antecipar a própria data: o gatilho devolve a do RH
  await como(PESSOA, `update public.colaboradores set ponto_desde = '2026-12-01', foto = 'nova' where id = 'p'`);
  const linha = (await banco.db.query<any>(`select ponto_desde::text as d, foto from public.colaboradores where id = 'p'`)).rows[0];
  expect(linha).toEqual({ d: '2026-10-19', foto: 'nova' });
});
