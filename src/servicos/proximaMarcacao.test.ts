/**
 * QUAL QUADRO A PRÓXIMA BATIDA PREENCHE (05/11/2026).
 *
 * A Marília bateu a entrada, esqueceu o almoço, e a batida das 17h de ir
 * embora caiu em "saída para almoço". Com o almoço pendente, a batida
 * mais perto da saída do expediente que da volta do almoço é a saída.
 */
import { test, expect, beforeEach } from 'bun:test';
import { usarFonteDaApuracao, minutosEmBrasilia, proximaMarcacaoDoDia } from './apuracaoDoDia';

const pessoa = (extra: Record<string, unknown> = {}) =>
  ({
    id: 'ana', nome: 'Ana', login: 'ana', cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga',
    nivel: 1, turno: 'A', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '',
    ...extra,
  }) as any;

let ANA = pessoa();
let batidas: any[] = [];

const QUARTA = '2026-11-04';
const h = (hora: string) => {
  const [hh, mm] = hora.split(':').map(Number);
  return hh * 60 + mm;
};
const batida = (tipo: string, hora: string) => {
  const [hh, mm] = hora.split(':').map(Number);
  const utc = new Date(`${QUARTA}T00:00:00.000Z`);
  utc.setUTCHours(hh + 3, mm);
  batidas.push({ id: `${tipo}`, colaboradorId: 'ana', data: QUARTA, tipo, horario: utc.toISOString(), horaFormatada: hora });
};
const proxima = (registradas: string[], agora?: string) =>
  proximaMarcacaoDoDia(ANA, QUARTA, registradas as any, agora === undefined ? undefined : h(agora));

beforeEach(() => {
  ANA = pessoa();
  batidas = [];
  usarFonteDaApuracao({
    colaborador: (id) => (id === 'ana' ? ANA : undefined),
    marcacoesDoDia: (id, data) => batidas.filter((b) => b.colaboradorId === id && b.data === data),
    situacaoDoDia: () => 'normal',
    feriadoEm: () => undefined,
    ajusteDoDia: () => null,
    batePonto: () => true,
    hoje: () => QUARTA,
    minutosDoHorario: minutosEmBrasilia,
    tolerancias: () => ({ porMarcacao: 5, diaria: 10 }),
  });
});

test('o caso da Marília: entrada batida, almoço esquecido, a batida das 17h é a saída', () => {
  expect(proxima(['entrada'], '17:05')).toBe('saida');
});

test('na hora do almoço, a batida depois da entrada continua sendo a saída para o almoço', () => {
  expect(proxima(['entrada'], '12:30')).toBe('saida_almoco');
});

test('o corte é o meio entre a volta do almoço e a saída: turno A, 14:00 e 17:10 → 15:35', () => {
  expect(proxima(['entrada'], '15:34')).toBe('saida_almoco');
  expect(proxima(['entrada'], '15:35')).toBe('saida');
});

test('esqueceu só a volta do almoço: a batida de ir embora é a saída, e a da volta continua volta', () => {
  expect(proxima(['entrada', 'saida_almoco'], '17:10')).toBe('saida');
  expect(proxima(['entrada', 'saida_almoco'], '14:02')).toBe('retorno_almoco');
});

test('sem entrada, a primeira batida é a entrada, a qualquer hora', () => {
  expect(proxima([], '17:05')).toBe('entrada');
});

test('depois da saída não volta para o almoço esquecido', () => {
  expect(proxima(['entrada', 'saida'], '17:30')).toBeNull();
  expect(proxima(['entrada', 'saida'])).toBeNull();
});

test('sem a hora, vale a ordem: o primeiro quadro vazio', () => {
  expect(proxima(['entrada'])).toBe('saida_almoco');
  expect(proxima(['entrada', 'saida_almoco', 'retorno_almoco'])).toBe('saida');
});

test('sem horário conhecido (carga própria que não fecha com o turno), vale a ordem', () => {
  ANA = pessoa({ cargaHorariaDiariaMinutos: 360 });
  expect(proxima(['entrada'], '17:05')).toBe('saida_almoco');
});

test('almoço livre das filiais sem a saída batida: o corte usa o horário do turno', () => {
  // Turno C: almoço 11:00–12:30 no turno, saída 17:40 → corte 15:05
  ANA = pessoa({ turno: 'C', loja: 'Porto Ferreira' });
  expect(proxima(['entrada'], '15:04')).toBe('saida_almoco');
  expect(proxima(['entrada'], '15:05')).toBe('saida');
});

test('almoço livre com a saída batida às 12:30: a volta esperada é 14:00, e o corte 15:50', () => {
  ANA = pessoa({ turno: 'C', loja: 'Porto Ferreira' });
  batida('entrada', '08:00');
  batida('saida_almoco', '12:30');
  expect(proxima(['entrada', 'saida_almoco'], '15:49')).toBe('retorno_almoco');
  expect(proxima(['entrada', 'saida_almoco'], '15:50')).toBe('saida');
});

test('quem bate duas vezes (sábado) segue entrada e saída, sem almoço', () => {
  expect(proximaMarcacaoDoDia(ANA, '2026-11-07', ['entrada'], h('09:00'))).toBe('saida');
});
