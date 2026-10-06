/**
 * O CPF: os dígitos verificadores, a formatação e a máscara.
 */
import { test, expect } from 'bun:test';
import { cpfValido, formatarCpf, limparCpf, cpfMascarado } from './cpf';

test('o CPF válido passa, com ou sem pontuação', () => {
  // CPFs de exemplo gerados pela conta (não pertencem a ninguém conhecido)
  expect(cpfValido('529.982.247-25')).toBe(true);
  expect(cpfValido('52998224725')).toBe(true);
  expect(cpfValido('111.444.777-35')).toBe(true);
});

test('o CPF com dígito errado, curto ou repetido não passa', () => {
  expect(cpfValido('529.982.247-26')).toBe(false); // último dígito errado
  expect(cpfValido('529.982.247-35')).toBe(false); // penúltimo errado
  expect(cpfValido('5299822472')).toBe(false); // dez dígitos
  // Passa na conta e não é de ninguém
  expect(cpfValido('111.111.111-11')).toBe(false);
  expect(cpfValido('000.000.000-00')).toBe(false);
  expect(cpfValido('')).toBe(false);
});

test('a formatação acompanha a digitação, e a máscara esconde o meio', () => {
  expect(formatarCpf('529')).toBe('529');
  expect(formatarCpf('5299')).toBe('529.9');
  expect(formatarCpf('5299822')).toBe('529.982.2');
  expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  // Colado com lixo em volta, ou com dígito a mais: só os onze
  expect(formatarCpf('cpf: 529.982.247-2599')).toBe('529.982.247-25');
  expect(limparCpf('529.982.247-25')).toBe('52998224725');
  expect(cpfMascarado('52998224725')).toBe('529.***.***-25');
});
