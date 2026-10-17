/**
 * O HORÁRIO PRÓPRIO (Elias, 17/10/2026).
 *
 * "Alguns colaboradores têm horários específicos": o RH digita o horário, a
 * ficha fica no turno 'P', e tudo que pergunta a `turnoDe` passa a usá-lo —
 * o espelho, a tolerância de cada batida, o previsto. O sábado segue 08:00
 * às 12:00. E o banco confere o mesmo que a tela.
 */
import { test, expect, beforeAll } from 'bun:test';
import {
  turnoDe,
  minutosDoTurno,
  marcacoesDoTurno,
  problemaNoHorarioProprio,
  TURNO_PROPRIO,
  type Colaborador,
} from '../tipos';
import { horariosEsperadosDoDia, cargaPrevistaEmMinutos, usarFonteDaApuracao, minutosEmBrasilia } from './apuracaoDoDia';
import { deLinhaHorarioProprio, paraLinhaHorarioProprio } from './linhasDoBanco';
import { montarBancoLocal, type BancoLocal } from '../../scripts/bancoLocal';

const HORARIO = { entrada: '09:00', intervaloSaida: '12:00', intervaloRetorno: '13:30', saida: '18:40' };
const pessoa = (extra: Partial<Colaborador> = {}) =>
  ({ id: 'x', nome: 'X', setor: 'Balcão', cargo: 'Balconista', loja: 'Pirassununga', nivel: 1, ativo: true, ...extra }) as Colaborador;

// A fonte do servidor, vazia: aqui só importa o horário de cada um
usarFonteDaApuracao({
  colaborador: () => undefined,
  marcacoesDoDia: () => [],
  situacaoDoDia: () => 'normal',
  feriadoEm: () => undefined,
  ajusteDoDia: () => null,
  batePonto: () => true,
  hoje: () => '2026-10-17',
  minutosDoHorario: minutosEmBrasilia,
  tolerancias: () => ({ porMarcacao: 5, diaria: 10 }),
});

const QUINTA = '2026-10-15';
const SABADO = '2026-10-17';

test('o turno é montado do horário digitado — 09:00 às 18:40 com 1h30 de almoço fecha 8h10, em 4 batidas', () => {
  const t = turnoDe(pessoa({ turno: TURNO_PROPRIO, horarioProprio: HORARIO }));
  expect([t.chave, t.entrada, t.saida, t.intervalo?.saida, t.intervalo?.retorno]).toEqual(['P', '09:00', '18:40', '12:00', '13:30']);
  expect(minutosDoTurno(t)).toBe(490);
  expect(marcacoesDoTurno(t)).toBe(4);
});

test('a tolerância cobra pelo horário digitado, e não pelo do turno A', () => {
  const p = pessoa({ turno: TURNO_PROPRIO, horarioProprio: HORARIO });
  expect(horariosEsperadosDoDia(p, QUINTA)).toEqual({ entrada: 540, saida_almoco: 720, retorno_almoco: 810, saida: 1120 });
  // O mesmo dia no turno A esperaria a entrada às 07:30
  expect(horariosEsperadosDoDia(pessoa({ turno: 'A' }), QUINTA)?.entrada).toBe(450);
});

test('a carga é a mesma do A e do B quando o horário fecha 8h10', () => {
  expect(cargaPrevistaEmMinutos(pessoa({ turno: TURNO_PROPRIO, horarioProprio: HORARIO }), QUINTA)).toBe(
    cargaPrevistaEmMinutos(pessoa({ turno: 'A' }), QUINTA)
  );
});

test('o sábado continua 08:00 às 12:00', () => {
  const p = pessoa({ turno: TURNO_PROPRIO, horarioProprio: HORARIO });
  expect(horariosEsperadosDoDia(p, SABADO)).toEqual({ entrada: 480, saida: 720 });
});

test('sem intervalo, duas batidas; pausa de até 15 minutos não desconta e não se bate', () => {
  const direto = turnoDe(pessoa({ turno: 'P', horarioProprio: { entrada: '10:00', saida: '16:00' } }));
  expect([marcacoesDoTurno(direto), minutosDoTurno(direto)]).toEqual([2, 360]);
  const pausa = turnoDe(pessoa({ turno: 'P', horarioProprio: { entrada: '07:30', intervaloSaida: '10:30', intervaloRetorno: '10:45', saida: '13:30' } }));
  expect([marcacoesDoTurno(pausa), pausa.intervalo?.desconta]).toEqual([2, false]);
});

test('horário incompleto ou fora de ordem é recusado, e a ficha não fica sem turno', () => {
  expect(problemaNoHorarioProprio({ entrada: '09:00' })).toBe('Informe a saída (HH:MM).');
  expect(problemaNoHorarioProprio({ entrada: '09:00', saida: '18:00', intervaloSaida: '12:00' })).toBe(
    'Informe a saída e a volta do intervalo — ou nenhuma das duas.'
  );
  expect(problemaNoHorarioProprio({ entrada: '09:00', intervaloSaida: '13:30', intervaloRetorno: '12:00', saida: '18:00' })).toBe(
    'Os horários têm de seguir a ordem: entrada, saída para o intervalo, volta, saída.'
  );
  expect(problemaNoHorarioProprio({ entrada: '25:00', saida: '18:00' })).toBe('Informe a entrada (HH:MM).');
  expect(problemaNoHorarioProprio(HORARIO)).toBeNull();
  // 'P' sem horário válido cai no padrão do perfil, em vez de um turno vazio
  expect(turnoDe(pessoa({ turno: 'P' })).chave).toBe('A');
});

test('vai e volta do banco sem perder nada', () => {
  expect(deLinhaHorarioProprio(paraLinhaHorarioProprio(HORARIO))).toEqual(HORARIO);
  const direto = { entrada: '10:00', saida: '16:00' };
  expect(deLinhaHorarioProprio(paraLinhaHorarioProprio(direto))).toEqual(direto);
  expect(deLinhaHorarioProprio(null)).toBeUndefined();
});

// ------------------------------------------------------------------
// O BANCO confere o mesmo, e protege o horário como protege o turno
// ------------------------------------------------------------------
let banco: BancoLocal;
const RH = '00000000-0000-0000-0000-0000000002a1';
const LIDER = '00000000-0000-0000-0000-0000000002a2';
const ANA = '00000000-0000-0000-0000-0000000002a3';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${RH}'), ('${LIDER}'), ('${ANA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true),
      ('lider', '${LIDER}', 'Lia', 'lia', 'Balcão', 'Pirassununga', 2, true),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true);
  `);
}, 120_000);

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
const JSON_DO_HORARIO = `'{"entrada":"09:00","intervalo_saida":"12:00","intervalo_retorno":"13:30","saida":"18:40"}'::jsonb`;

test('o banco só aceita P com o horário completo e na ordem', async () => {
  expect(await como(RH, `update public.colaboradores set turno = 'P' where id = 'ana'`)).toContain('colaboradores_horario_proprio_valido');
  expect(
    await como(RH, `update public.colaboradores set turno = 'P', horario_proprio = '{"entrada":"18:00","saida":"09:00"}' where id = 'ana'`)
  ).toContain('colaboradores_horario_proprio_valido');
  expect(await como(RH, `update public.colaboradores set turno = 'P', horario_proprio = ${JSON_DO_HORARIO} where id = 'ana'`)).toBeNull();
});

test('a própria pessoa não muda o horário dela; o líder o enxerga para cobrar a tolerância', async () => {
  await como(ANA, `update public.colaboradores set horario_proprio = '{"entrada":"11:00","saida":"12:00"}' where id = 'ana'`);
  const r = await banco.db.query<{ h: any }>(`select horario_proprio as h from public.colaboradores where id = 'ana'`);
  expect(r.rows[0].h.entrada).toBe('09:00');

  await banco.db.exec(`
    alter table public.colaboradores disable trigger colaboradores_organograma_protegido;
    update public.colaboradores set responsavel_id = 'lider' where id = 'ana';
    alter table public.colaboradores enable trigger colaboradores_organograma_protegido;
  `);
  await banco.como(LIDER);
  try {
    const f = await banco.db.query<{ turno: string; horario_proprio: any }>(
      `select turno, horario_proprio from public.fichas_reservadas() where id = 'ana'`
    );
    expect(f.rows[0].turno).toBe('P');
    expect(f.rows[0].horario_proprio.saida).toBe('18:40');
  } finally {
    await banco.como(null);
  }
});
