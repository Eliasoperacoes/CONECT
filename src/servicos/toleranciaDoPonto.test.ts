/**
 * A TOLERÂNCIA DO PONTO — a regra pura, caso a caso
 *
 * Cada exemplo do pedido do Elias está aqui com o horário dele. A jornada
 * é a do turno A: 07:30 · 12:30 · 14:00 · 17:10, 8h10 previstas.
 */
import { expect, test } from 'bun:test';
import {
  aplicarTolerancia,
  type HorariosEsperados,
  type LimitesDeTolerancia,
} from './toleranciaDoPonto';

const min = (hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

const TURNO_A: HorariosEsperados = {
  entrada: min('07:30'),
  saida_almoco: min('12:30'),
  retorno_almoco: min('14:00'),
  saida: min('17:10'),
};
const PREVISTO_A = 490;

const LEI: LimitesDeTolerancia = { porMarcacao: 5, diaria: 10, intervalo: 5 };

/** Um dia de quatro batidas, com o almoço do turno se não for dito outro. */
const dia = (
  entrada: string,
  saida: string,
  almoco: [string, string] = ['12:30', '14:00'],
  opcoes: {
    esperados?: HorariosEsperados | null;
    previsto?: number;
    limites?: LimitesDeTolerancia;
    pausa?: number;
  } = {}
) => {
  const e = min(entrada);
  const s = min(saida);
  const sa = min(almoco[0]);
  const ra = min(almoco[1]);
  const trabalhado = s - e - (ra - sa);
  return aplicarTolerancia({
    batidas: { entrada: e, saidaAlmoco: sa, retornoAlmoco: ra, saida: s },
    esperados: opcoes.esperados === undefined ? TURNO_A : opcoes.esperados,
    diferenca: trabalhado - (opcoes.previsto ?? PREVISTO_A),
    pausa: opcoes.pausa ?? 0,
    jornadaFechada: trabalhado > 0,
    limites: opcoes.limites ?? LEI,
  });
};

// ---------------------------------------------------------------
// Entrada e saída: 5 em cada, 10 somadas
// ---------------------------------------------------------------

test('1. entrou 1 min antes e saiu 2 depois: não gera saldo', () => {
  expect(dia('07:29', '17:12').saldoApurado).toBe(0);
});

test('2. entrou 1 min depois e saiu 3 depois: não gera saldo', () => {
  expect(dia('07:31', '17:13').saldoApurado).toBe(0);
});

test('3. entrou 2 min antes e saiu 5 depois (7 no total): não gera saldo', () => {
  expect(dia('07:28', '17:15').saldoApurado).toBe(0);
});

test('4. entrou 4 min depois e saiu 4 depois (8 no total): não gera saldo', () => {
  expect(dia('07:34', '17:14').saldoApurado).toBe(0);
});

test('5. entrou 5 min antes e saiu 1 depois: não gera saldo — o limite é inclusivo', () => {
  expect(dia('07:25', '17:11').saldoApurado).toBe(0);
});

test('6. entrou MAIS de 5 min antes: a variação conta inteira', () => {
  // O exemplo 5 do pedido: 07:24 e 17:10
  const r = dia('07:24', '17:10');
  expect(r.entradaESaida?.tolerado).toBe(false);
  expect(r.saldoApurado).toBe(6);
});

test('7. saiu MAIS de 5 min depois: a variação conta inteira', () => {
  expect(dia('07:30', '17:16').saldoApurado).toBe(6);
});

test('8. somadas, passaram de 10: as DUAS contam inteiras, e não só o excedente', () => {
  /*
   * Com 5 por marcação, duas batidas nunca passam de 10 — o limite do dia
   * só morde quando a rede afrouxa o da marcação. Configurado em 8:
   */
  const frouxo = { ...LEI, porMarcacao: 8 };
  // 7 antes + 4 depois = 11: conta tudo, +11 (Súmula 366: não se desconta a tolerância)
  expect(dia('07:23', '17:14', undefined, { limites: frouxo }).saldoApurado).toBe(11);
  // 5 + 5 = 10: ainda tolerado
  expect(dia('07:25', '17:15', undefined, { limites: frouxo }).saldoApurado).toBe(0);
});

test('9. dentro da tolerância não gera saldo NOS DOIS SENTIDOS', () => {
  // Entrou 4 atrasado, saiu 4 mais cedo: −8 no relógio, zero no saldo
  const r = dia('07:34', '17:06');
  expect(r.saldoApurado).toBe(0);
  expect(r.entradaESaida).toEqual({ efeitoEntrada: -4, efeitoSaida: -4, tolerado: true });
});

// ---------------------------------------------------------------
// Sábado: 4 horas, duas batidas
// ---------------------------------------------------------------

const SABADO: HorariosEsperados = { entrada: min('08:00'), saida: min('12:00') };
const sabado = (entrada: string, saida: string) =>
  aplicarTolerancia({
    batidas: { entrada: min(entrada), saidaAlmoco: null, retornoAlmoco: null, saida: min(saida) },
    esperados: SABADO,
    diferenca: min(saida) - min(entrada) - 240,
    pausa: 0,
    jornadaFechada: true,
    limites: LEI,
  });

test('10. sábado de 4 horas cumprido: saldo zero', () => {
  expect(sabado('08:00', '12:00').saldoApurado).toBe(0);
  // Sem almoço no sábado: nada de intervalo na conta
  expect(sabado('08:00', '12:00').intervalo).toBeUndefined();
});

test('11. sábado com poucos minutos de diferença: a mesma tolerância', () => {
  expect(sabado('07:58', '12:03').saldoApurado).toBe(0);
  // 7 depois numa marcação só: conta
  expect(sabado('08:00', '12:07').saldoApurado).toBe(7);
});

// ---------------------------------------------------------------
// O intervalo de almoço: regra própria
// ---------------------------------------------------------------

/** O exemplo do Elias: intervalo previsto de 12:30 a 13:30. */
const COM_ALMOCO_DE_1H: HorariosEsperados = {
  entrada: min('07:30'),
  saida_almoco: min('12:30'),
  retorno_almoco: min('13:30'),
  saida: min('17:10'),
};
const almoco = (saida: string, retorno: string) =>
  dia('07:30', '17:10', [saida, retorno], { esperados: COM_ALMOCO_DE_1H, previsto: 520 });

test('12. o almoço tem regra própria: até 5 min SOMADOS no início e no fim', () => {
  // Os cinco casos do pedido, na ordem
  expect(almoco('12:31', '13:30').saldoApurado).toBe(0); // 59 min
  expect(almoco('12:30', '13:32').saldoApurado).toBe(0); // 62 min
  expect(almoco('12:32', '13:29').saldoApurado).toBe(0); // 57 min, redução de 3
  expect(almoco('12:32', '13:27').saldoApurado).toBe(0); // 55 min, redução de 5

  // 54 min: redução de 6 — passa da tolerância, conta, e fica apontada
  const reduzido = almoco('12:32', '13:26');
  expect(reduzido.intervalo?.tolerado).toBe(false);
  expect(reduzido.intervalo?.reducaoMinutos).toBe(6);
  expect(reduzido.saldoApurado).toBe(6);
});

test('12b. o almoço NÃO usa os 5 por marcação da entrada/saída', () => {
  // Uma marcação só de 3 e outra de 3 = 6 no total: pela regra da
  // entrada/saída caberia (3 ≤ 5 em cada); pela do almoço, não cabe
  const r = almoco('12:27', '13:33'); // saiu 3 antes, voltou 3 depois: 66 min
  expect(r.intervalo?.variacao).toBe(6);
  expect(r.intervalo?.tolerado).toBe(false);
  expect(r.saldoApurado).toBe(-6);
});

test('12c. o almoço não tem 10 minutos de tolerância', () => {
  expect(almoco('12:30', '13:38').saldoApurado).toBe(-8);
});

test('12d. almoço e entrada/saída não dividem o mesmo limite', () => {
  // 5 + 5 na entrada/saída E 4 no almoço: cada regra no seu limite, nada conta
  const r = dia('07:25', '17:15', ['12:30', '14:04']);
  expect(r.entradaESaida?.tolerado).toBe(true);
  expect(r.intervalo?.tolerado).toBe(true);
  expect(r.saldoApurado).toBe(0);

  // Entrada/saída fora da tolerância não arrasta o almoço tolerado junto
  const fora = dia('07:22', '17:10', ['12:30', '14:03']);
  expect(fora.saldoApurado).toBe(8); // só os 8 da entrada; os 3 do almoço, não
});

// ---------------------------------------------------------------
// Casos de borda
// ---------------------------------------------------------------

test('15. dia sem jornada fechada não tem saldo a apurar', () => {
  const r = aplicarTolerancia({
    batidas: { entrada: min('07:30'), saidaAlmoco: null, retornoAlmoco: null, saida: null },
    esperados: TURNO_A,
    diferenca: -490,
    pausa: 0,
    jornadaFechada: false,
    limites: LEI,
  });
  expect(r).toEqual({ saldoApurado: 0, modo: 'sem_jornada' });
});

test('15b. almoço sem as duas batidas: a entrada/saída ainda é medida, o almoço não', () => {
  const r = aplicarTolerancia({
    batidas: { entrada: min('07:29'), saidaAlmoco: null, retornoAlmoco: null, saida: min('17:12') },
    esperados: TURNO_A,
    // Sem o almoço batido, o relógio conta 9h43 corridas
    diferenca: min('17:12') - min('07:29') - 490,
    pausa: 0,
    jornadaFechada: true,
    limites: LEI,
  });
  expect(r.intervalo).toBeUndefined();
  // Os 3 da entrada/saída saem; o almoço que não foi batido continua na conta
  expect(r.saldoApurado).toBe(90);
});

test('sem horário conhecido (estágio, ficha própria): vale o limite do DIA', () => {
  expect(dia('08:00', '17:07', undefined, { esperados: null, previsto: 450 }).saldoApurado).toBe(0);
  expect(dia('08:00', '17:11', undefined, { esperados: null, previsto: 450 }).saldoApurado).toBe(11);
  expect(dia('08:00', '17:07', undefined, { esperados: null, previsto: 450 }).modo).toBe('dia');
});

test('a pausa paga do estágio não vira crédito de uma variação já perdoada', () => {
  // Turno de 13:00 às 19:15, 6h15 com 15 de pausa paga que não se bate
  const ESTAGIO: HorariosEsperados = { entrada: min('13:00'), saida: min('19:15') };
  const r = aplicarTolerancia({
    // Entrou 13:03: 3 min de atraso, tolerados
    batidas: { entrada: min('13:03'), saidaAlmoco: null, retornoAlmoco: null, saida: min('19:15') },
    esperados: ESTAGIO,
    diferenca: -3,
    pausa: 15,
    jornadaFechada: true,
    limites: LEI,
  });
  // Nem −3 (a tolerância perdoou) nem +3 (a pausa não é crédito)
  expect(r.saldoApurado).toBe(0);
});

// ---------------------------------------------------------------
// Uma regra, um lugar
// ---------------------------------------------------------------

test('a tolerância é aplicada NUM lugar só, e todos leem o saldo dele', async () => {
  /**
   * Antes, `apurarDia` decidia a tolerância por conta própria (saldo
   * líquido contra 10, maior variação contra 5) e o espelho mostrava o
   * saldo sem tolerância nenhuma. Dois números para o mesmo dia.
   */
  const ponto = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();
  const semComentarios = ponto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  expect(semComentarios.match(/aplicarTolerancia\(/g)?.length).toBe(1);

  // A apuração grava o saldo apurado, sem refazer a conta
  const apurar = semComentarios.slice(
    semComentarios.indexOf('async apurarDia('),
    semComentarios.indexOf('async apurarDia(') + 3000
  );
  expect(apurar).toContain('const diferenca = jornada.saldoMinutos;');
  expect(apurar).not.toContain('maiorVariacaoDoDia');
  expect(apurar).not.toContain('obterToleranciaMinutos');
});
