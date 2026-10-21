/**
 * A SEÇÃO FERRAMENTAS (SPEC-cotar): cada bloco aparece só para quem tem a
 * permissão do catálogo E a regra do trabalho; sem bloco, sem seção.
 */
import { test, expect } from 'bun:test';
import { ferramentasDe, FERRAMENTAS_INTERNAS } from './ferramentasInternas';
import { FERRAMENTAS } from './ferramentas';
import { telasQueVejo, type ContextoDoAcesso } from './telasPorAssunto';
import type { Colaborador } from '../tipos';

const pessoa = (setor: string, nivel: number) => ({ id: 'x', nome: 'X', setor, nivel, loja: 'Pirassununga' }) as unknown as Colaborador;
const tudoLigado = () => true;
const blocos = (setor: string, nivel: number, pode: (c: string) => boolean = tudoLigado) =>
  ferramentasDe(pessoa(setor, nivel), pode).map((f) => f.id);

test('cada pessoa vê só os blocos dela', () => {
  expect(blocos('Balcão', 1)).toEqual(['cotar']);
  expect(blocos('Callcenter', 1)).toEqual(['cotar']);
  expect(blocos('Gerência', 3)).toEqual(['cotar', 'margens']);
  // Compras não cota nem cuida das margens, mas cuida do frete (Elias, 21/10/2026)
  expect(blocos('Compras', 2)).toEqual(['fretes']);
  expect(blocos('TI', 5)).toEqual(['cotar', 'margens', 'fretes']);
  expect(blocos('Estoque', 1)).toEqual([]);
});

test('desligar a permissão no catálogo tira o bloco, mesmo do gerente', () => {
  expect(blocos('Gerência', 3, (c) => c !== 'margens_cotador')).toEqual(['cotar']);
  expect(blocos('Gerência', 3, (c) => c !== 'cotar_b2b')).toEqual(['margens']);
});

test('a seção existe só para quem tem algum bloco (computador)', () => {
  const ctx: ContextoDoAcesso = { pode: tudoLigado, temEquipe: false, batePonto: true };
  expect(telasQueVejo(pessoa('Balcão', 1), ctx).has('ferramentas')).toBe(true);
  expect(telasQueVejo(pessoa('Estoque', 1), ctx).has('ferramentas')).toBe(false);
});

test('todo bloco tem a chave no catálogo de permissões (senão nunca apareceria)', () => {
  const chaves = new Set(FERRAMENTAS.map((f) => f.chave));
  expect(FERRAMENTAS_INTERNAS.filter((f) => !chaves.has(f.chave)).map((f) => f.id)).toEqual([]);
});
