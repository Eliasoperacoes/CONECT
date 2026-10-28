/**
 * OS HORÁRIOS DAS FILIAIS (Elias, 28/10/2026).
 *
 * Nas outras lojas: entra 08:00 e sai 17:40 (C), ou entra 08:20 e sai
 * 18:00 (D), com 1h30 de almoço às 11:00 ou às 12:30 — conforme a pessoa.
 * O almoço vale pela duração, a partir da saída de verdade: quem é do D e
 * almoça às 11:00 não está 1h30 adiantado.
 */
import { test, expect, beforeEach } from 'bun:test';
import {
  usarFonteDaApuracao,
  minutosEmBrasilia,
  jornadaDoDia,
  horariosEsperadosDoDia,
} from './apuracaoDoDia';
import { acharTurno, minutosDoTurno, compensacaoDoSabadoDe, turnoDe } from '../tipos';

const pessoa = (turno: string) =>
  ({
    id: 'bia', nome: 'Bia', login: 'bia', cargo: 'Balconista', setor: 'Balcão', loja: 'Descalvado',
    nivel: 1, turno, ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '',
  }) as any;

let bia = pessoa('D');
let batidas: any[] = [];

/** Uma batida como o banco devolve: horário em UTC (Brasília + 3h). */
const batida = (data: string, tipo: string, hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  const utc = new Date(`${data}T00:00:00.000Z`);
  utc.setUTCHours(h + 3, m);
  batidas.push({ id: `${data}-${tipo}`, colaboradorId: 'bia', data, tipo, horario: utc.toISOString(), horaFormatada: hora });
};
const dia = (data: string, horas: string[]) =>
  (['entrada', 'saida_almoco', 'retorno_almoco', 'saida'] as const).forEach((t, i) => horas[i] && batida(data, t, horas[i]));

const hora = (m: number | undefined) =>
  m === undefined ? undefined : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

beforeEach(() => {
  bia = pessoa('D');
  batidas = [];
  usarFonteDaApuracao({
    colaborador: (id) => (id === 'bia' ? bia : undefined),
    marcacoesDoDia: (id, data) => batidas.filter((b) => b.colaboradorId === id && b.data === data),
    situacaoDoDia: () => 'normal',
    feriadoEm: () => undefined,
    ajusteDoDia: () => null,
    batePonto: () => true,
    hoje: () => '2026-11-06',
    minutosDoHorario: minutosEmBrasilia,
    tolerancias: () => ({ porMarcacao: 5, diaria: 10 }),
  });
});

test('C e D fecham 8h10 como A e B: 8h da CLT e 10 minutos da compensação do sábado', () => {
  for (const chave of ['C', 'D']) {
    expect(minutosDoTurno(acharTurno(chave))).toBe(490);
    expect(compensacaoDoSabadoDe(pessoa(chave))).toBe(10);
    expect(turnoDe(pessoa(chave)).chave).toBe(chave);
  }
  expect(acharTurno('C')).toMatchObject({ entrada: '08:00', saida: '17:40' });
  expect(acharTurno('D')).toMatchObject({ entrada: '08:20', saida: '18:00' });
});

test('o almoço do D às 11:00 é esperado a partir da saída de verdade, não às 12:30', () => {
  // 05/11/2026 é quinta
  dia('2026-11-05', ['08:20', '11:00', '12:30', '18:00']);
  const esperados = horariosEsperadosDoDia(bia, '2026-11-05')!;
  expect(hora(esperados.entrada)).toBe('08:20');
  expect(hora(esperados.saida_almoco)).toBe('11:00');
  expect(hora(esperados.retorno_almoco)).toBe('12:30');
  expect(hora(esperados.saida)).toBe('18:00');

  const j = jornadaDoDia('bia', '2026-11-05');
  expect(j.minutosTrabalhados).toBe(490);
  expect(j.saldoMinutos).toBe(0);
});

test('o C que almoça às 12:30 também volta no horário às 14:00', () => {
  bia = pessoa('C');
  dia('2026-11-05', ['08:00', '12:30', '14:00', '17:40']);
  const esperados = horariosEsperadosDoDia(bia, '2026-11-05')!;
  expect(hora(esperados.saida_almoco)).toBe('12:30');
  expect(hora(esperados.retorno_almoco)).toBe('14:00');
  expect(jornadaDoDia('bia', '2026-11-05').saldoMinutos).toBe(0);
});

test('o almoço mais longo continua contando: 1h45 fora é 15 minutos a menos', () => {
  dia('2026-11-05', ['08:20', '11:00', '12:45', '18:00']);
  expect(hora(horariosEsperadosDoDia(bia, '2026-11-05')!.retorno_almoco)).toBe('12:30');
  expect(jornadaDoDia('bia', '2026-11-05').saldoMinutos).toBe(-15);
});

test('antes de sair para o almoço, não há hora de almoço a cobrar', () => {
  dia('2026-11-05', ['08:20']);
  const esperados = horariosEsperadosDoDia(bia, '2026-11-05')!;
  expect(esperados.saida_almoco).toBeUndefined();
  expect(esperados.retorno_almoco).toBeUndefined();
  expect(hora(esperados.entrada)).toBe('08:20');
  expect(hora(esperados.saida)).toBe('18:00');
});

test('o B de Pirassununga segue com o almoço fixo das 11:00', () => {
  bia = { ...pessoa('B'), loja: 'Pirassununga' };
  dia('2026-11-05', ['08:20', '12:30', '14:00', '18:00']);
  const esperados = horariosEsperadosDoDia(bia, '2026-11-05')!;
  expect(hora(esperados.saida_almoco)).toBe('11:00');
  expect(hora(esperados.retorno_almoco)).toBe('12:30');
});
