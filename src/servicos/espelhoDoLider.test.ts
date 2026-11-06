/**
 * O ESPELHO DO LÍDER FECHA IGUAL AO DO RH (06/11/2026).
 *
 * O 04/11 da Beatriz: entrou 10:21, atestado e comparecimento aprovados
 * pela Dani. No RH o dia fechou em 0h00; na Leigislaine, que não recebe o
 * atestado, em −2h30. O líder recebe só o dia abonado, sem o tipo, e o
 * saldo tem de sair o mesmo.
 */
import { test, expect, beforeEach } from 'bun:test';
import { usarFonteDaApuracao, minutosEmBrasilia, jornadaDoDia } from './apuracaoDoDia';
import { situacaoNaLista, situacaoDoDia, gravarDiasAbonados, type DiaAbonado } from './justificativasCache';
import { ROTULO_SITUACAO } from '../tipos';

const BIA = {
  id: 'bia', nome: 'Beatriz', login: 'bia', cargo: 'Auxiliar de estoque', setor: 'Estoque', loja: 'Pirassununga',
  nivel: 1, turno: 'A', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '',
} as any;
const DIA = '2026-11-04';

let batidas: any[] = [];
let ausencias: any[] = [];
let abonos: DiaAbonado[] = [];

const batida = (tipo: string, hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  const utc = new Date(`${DIA}T00:00:00.000Z`);
  utc.setUTCHours(h + 3, m);
  batidas.push({ id: tipo, colaboradorId: 'bia', data: DIA, tipo, horario: utc.toISOString(), horaFormatada: hora });
};

beforeEach(() => {
  ausencias = [];
  abonos = [];
  batidas = [];
  // O dia do print: 10:21, 11:04, 12:27, 17:14 — 5h30 trabalhadas
  batida('entrada', '10:21');
  batida('saida_almoco', '11:04');
  batida('retorno_almoco', '12:27');
  batida('saida', '17:14');
  usarFonteDaApuracao({
    colaborador: (id) => (id === 'bia' ? BIA : undefined),
    marcacoesDoDia: (id, data) => batidas.filter((b) => b.colaboradorId === id && b.data === data),
    // A pergunta do aparelho: a mesma função, com o que chegou a ele
    situacaoDoDia: (id, data) => situacaoNaLista(ausencias, id, data, [], abonos),
    feriadoEm: () => undefined,
    ajusteDoDia: () => null,
    batePonto: () => true,
    hoje: () => '2026-11-06',
    minutosDoHorario: minutosEmBrasilia,
    tolerancias: () => ({ porMarcacao: 5, diaria: 10 }),
  });
});

const atestadoAprovado = { id: 'at', colaboradorId: 'bia', dataInicio: DIA, dataFim: DIA, tipo: 'atestado', estado: 'aprovada' };
const diaAbonado = { id: 'at', colaboradorId: 'bia', dataInicio: DIA, dataFim: DIA };

test('no RH, com o atestado, o dia fecha em zero', () => {
  ausencias = [atestadoAprovado];
  expect(jornadaDoDia('bia', DIA).saldoMinutos).toBe(0);
});

test('no líder, sem atestado e sem o dia abonado, é o −2h30 do print', () => {
  expect(jornadaDoDia('bia', DIA).saldoMinutos).toBeLessThan(-120);
});

test('no líder, com o dia abonado, fecha em zero — igual ao RH', () => {
  abonos = [diaAbonado];
  expect(jornadaDoDia('bia', DIA).saldoMinutos).toBe(0);
});

test('o líder vê "Abonado"; quem lê a ausência vê o tipo dela', () => {
  expect(ROTULO_SITUACAO[situacaoNaLista([], 'bia', DIA, [], [diaAbonado])]).toBe('Abonado');
  expect(situacaoNaLista([atestadoAprovado] as any, 'bia', DIA, [], [diaAbonado])).toBe('abonado_atestado');
});

test('o aparelho consulta os dias abonados que a sincronização gravou', () => {
  const dados = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, String(v)),
    removeItem: (k: string) => void dados.delete(k),
  };
  expect(situacaoDoDia('bia', DIA)).toBe('normal');
  gravarDiasAbonados([diaAbonado]);
  expect(situacaoDoDia('bia', DIA)).toBe('abonado_outro');
});

test('o dia abonado vale só para a pessoa e o período dele', () => {
  expect(situacaoNaLista([], 'outra', DIA, [], [diaAbonado])).toBe('normal');
  expect(situacaoNaLista([], 'bia', '2026-11-05', [], [diaAbonado])).toBe('normal');
  expect(situacaoNaLista([], 'bia', '2026-11-03', [], [diaAbonado])).toBe('normal');
});
