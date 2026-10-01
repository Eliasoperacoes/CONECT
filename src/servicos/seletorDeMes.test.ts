/**
 * O MÊS DO ESPELHO, NUM TOQUE.
 *
 * No dia 1º de outubro o espelho do RH abria num período de um dia, e
 * ver setembro pedia redigitar as duas datas — "não existe a opção de
 * selecionar o espelho do mês passado" (Elias).
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { periodoDoMesNaLista, mesDoPeriodo } from '../componentes/SeletorDeMes';

const HOJE = '2026-10-01';

test('o mês passado vem inteiro, do dia 1 ao último', () => {
  expect(periodoDoMesNaLista('2026-09', HOJE)).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
  expect(periodoDoMesNaLista('2026-02', HOJE)).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
});

test('o mês corrente vai só até hoje: o resto ainda não aconteceu', () => {
  expect(periodoDoMesNaLista('2026-10', HOJE)).toEqual({ inicio: '2026-10-01', fim: '2026-10-01' });
});

test('as datas de um mês cheio marcam o mês; as outras, "personalizado"', () => {
  expect(mesDoPeriodo('2026-09-01', '2026-09-30', HOJE)).toBe('2026-09');
  // O período com que a tela nasce no dia 1º é o mês corrente
  expect(mesDoPeriodo('2026-10-01', '2026-10-01', HOJE)).toBe('2026-10');
  expect(mesDoPeriodo('2026-09-10', '2026-09-30', HOJE)).toBe('');
  expect(mesDoPeriodo('2026-08-01', '2026-09-30', HOJE)).toBe('');
});

test('o espelho do RH e a Equipe e ponto usam o mesmo seletor', () => {
  const ler = (arq: string) => readFileSync(join(import.meta.dir, '../componentes', arq), 'utf8');
  for (const tela of ['BancoDeHoras.tsx', 'PainelGestao.tsx']) {
    const fonte = ler(tela);
    expect(`${tela}: ${fonte.includes('<SeletorDeMes')}`).toBe(`${tela}: true`);
  }
});
