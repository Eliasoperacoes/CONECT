/**
 * A saudação do Início: a parte do dia, o primeiro nome e a data.
 */
import { test, expect } from 'bun:test';
import { saudacaoDaHora, primeiroNome, dataPorExtenso, horaDeBrasilia } from './saudacao';

test('bom dia, boa tarde, boa noite — pelas horas certas', () => {
  expect(saudacaoDaHora(5)).toBe('Bom dia');
  expect(saudacaoDaHora(11)).toBe('Bom dia');
  expect(saudacaoDaHora(12)).toBe('Boa tarde');
  expect(saudacaoDaHora(17)).toBe('Boa tarde');
  expect(saudacaoDaHora(18)).toBe('Boa noite');
  expect(saudacaoDaHora(23)).toBe('Boa noite');
  // Madrugada ainda é noite
  expect(saudacaoDaHora(2)).toBe('Boa noite');
});

test('o primeiro nome, mesmo com a ficha em maiúscula', () => {
  expect(primeiroNome('FERNANDA METZNER CECCARELLI')).toBe('Fernanda');
  expect(primeiroNome('  élias camila ')).toBe('Élias');
});

test('a data e a hora são as de Brasília, não as do aparelho', () => {
  // 02:30 UTC do dia 6 ainda é dia 5, 23h30, em Brasília
  const quando = new Date('2026-10-06T02:30:00Z');
  expect(dataPorExtenso(quando)).toBe('Segunda-feira, 5 de outubro');
  expect(horaDeBrasilia(quando)).toBe(23);
});
