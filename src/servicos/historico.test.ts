/**
 * HISTÓRICO, sem tela: os atalhos de período (no dia de Brasília) e o que
 * conta como "aguardando". Quem vê o quê e a foto: historicoNoBanco.test.ts.
 */
import { test, expect } from 'bun:test';
import { diaDeBrasilia, filtroDoPeriodo, aguardando, type LinhaDoHistorico } from './historico';

test('o dia é o de Brasília: 23h30 de Brasília ainda é o mesmo dia (em UTC já viraria)', () => {
  const agora = new Date('2026-10-22T02:30:00Z'); // 21/10 23h30 em Brasília
  expect(diaDeBrasilia(0, agora)).toBe('2026-10-21');
  expect(diaDeBrasilia(1, agora)).toBe('2026-10-20');
});

test('os períodos: hoje, 7 e 30 dias contando hoje, e tudo sem limite', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  expect(filtroDoPeriodo('hoje', agora)).toEqual({ de: '2026-10-21', ate: '2026-10-21' });
  expect(filtroDoPeriodo('7dias', agora)).toEqual({ de: '2026-10-15', ate: '2026-10-21' });
  expect(filtroDoPeriodo('30dias', agora)).toEqual({ de: '2026-09-22', ate: '2026-10-21' });
  expect(filtroDoPeriodo('tudo', agora)).toEqual({ de: null, ate: null });
});

test('aguardando é só o pedido ao comprador ainda sem resposta', () => {
  const l = (tipo: LinhaDoHistorico['tipo'], situacao: string) => ({ tipo, situacao }) as LinhaDoHistorico;
  expect([l('comprador', 'aberta'), l('comprador', 'respondida'), l('b2b', 'SEM ESTOQUE')].map(aguardando)).toEqual([true, false, false]);
});
