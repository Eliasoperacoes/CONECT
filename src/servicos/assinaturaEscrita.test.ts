/**
 * O NOME DA ASSINATURA ESCRITA — o primeiro nome e o último sobrenome,
 * como se assina no papel (pedido do Elias, 05/10/2026).
 */
import { test, expect } from 'bun:test';
import { nomeParaAssinar, ESTILOS_DE_ASSINATURA } from './assinaturaEscrita';

test('primeiro nome e último sobrenome, com maiúscula só no começo', () => {
  expect(nomeParaAssinar('Fernanda Metzner Ceccarelli')).toBe('Fernanda Ceccarelli');
  // A ficha às vezes vem toda em maiúscula
  expect(nomeParaAssinar('FERNANDA METZNER CECCARELLI')).toBe('Fernanda Ceccarelli');
  expect(nomeParaAssinar('  Isaac   André da Silva Rossoni ')).toBe('Isaac Rossoni');
});

test('partícula não é sobrenome: "da Silva" assina "Silva"', () => {
  expect(nomeParaAssinar('Devilin Vinicius Soares da Silva')).toBe('Devilin Silva');
  expect(nomeParaAssinar('Maria dos Santos')).toBe('Maria Santos');
  expect(nomeParaAssinar('João de')).toBe('João');
});

test('acento e cedilha passam inteiros', () => {
  expect(nomeParaAssinar('lyvia aparecida souza gonçalves')).toBe('Lyvia Gonçalves');
  expect(nomeParaAssinar('ÉLIAS')).toBe('Élias');
});

test('nome de uma palavra, ou vazio', () => {
  expect(nomeParaAssinar('Elias')).toBe('Elias');
  expect(nomeParaAssinar('')).toBe('');
});

test('três estilos, cada um numa fonte diferente', () => {
  expect(ESTILOS_DE_ASSINATURA).toHaveLength(3);
  expect(new Set(ESTILOS_DE_ASSINATURA.map((e) => e.familia)).size).toBe(3);
});
