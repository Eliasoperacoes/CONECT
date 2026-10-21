/**
 * A SEÇÃO FERRAMENTAS: um bloco por sistema (o cotador é um só — Elias,
 * 21/10/2026), e dentro dele só as partes que a pessoa pode usar; bloco sem
 * parte não aparece, e sem bloco não há seção.
 */
import { test, expect } from 'bun:test';
import { ferramentasDe, FERRAMENTAS_INTERNAS } from './ferramentasInternas';
import { FERRAMENTAS } from './ferramentas';
import { telasQueVejo, type ContextoDoAcesso } from './telasPorAssunto';
import type { Colaborador } from '../tipos';

const pessoa = (setor: string, nivel: number) => ({ id: 'x', nome: 'X', setor, nivel, loja: 'Pirassununga' }) as unknown as Colaborador;
const tudoLigado = () => true;
/** "bloco: partes" de cada bloco que a pessoa vê */
const vê = (setor: string, nivel: number, pode: (c: string) => boolean = tudoLigado) =>
  ferramentasDe(pessoa(setor, nivel), pode).map((f) => `${f.id}: ${f.partes.map((p) => p.id).join(', ')}`);

test('o cotador é UM bloco só, com as partes de cada pessoa dentro', () => {
  expect(FERRAMENTAS_INTERNAS.map((f) => f.id)).toEqual(['cotador']);
  expect(vê('Balcão', 1)).toEqual(['cotador: cotar']);
  expect(vê('Callcenter', 1)).toEqual(['cotador: cotar']);
  expect(vê('Gerência', 3)).toEqual(['cotador: cotar, margens']);
  // Compras não cota nem cuida das margens, mas cuida do frete (Elias, 21/10/2026)
  expect(vê('Compras', 2)).toEqual(['cotador: solicitacoes, fretes']);
  expect(vê('TI', 5)).toEqual(['cotador: cotar, solicitacoes, fretes, margens']);
  // Sem parte nenhuma, o bloco nem aparece
  expect(vê('Estoque', 1)).toEqual([]);
});

test('desligar a permissão no catálogo tira a parte, mesmo do gerente', () => {
  expect(vê('Gerência', 3, (c) => c !== 'margens_cotador')).toEqual(['cotador: cotar']);
  expect(vê('Gerência', 3, (c) => c !== 'cotar_b2b')).toEqual(['cotador: margens']);
});

test('a seção existe só para quem tem algum bloco (computador)', () => {
  const ctx: ContextoDoAcesso = { pode: tudoLigado, temEquipe: false, batePonto: true };
  expect(telasQueVejo(pessoa('Balcão', 1), ctx).has('ferramentas')).toBe(true);
  expect(telasQueVejo(pessoa('Estoque', 1), ctx).has('ferramentas')).toBe(false);
});

test('toda parte tem a chave no catálogo de permissões (senão nunca apareceria)', () => {
  const chaves = new Set(FERRAMENTAS.map((f) => f.chave));
  const semChave = FERRAMENTAS_INTERNAS.flatMap((f) => f.partes).filter((p) => !chaves.has(p.chave));
  expect(semChave.map((p) => p.id)).toEqual([]);
});

test('o lugar lembrado só abre o que a pessoa alcança', async () => {
  const { lugarParaAbrir, escreverLugar } = await import('./ferramentasInternas');
  const doGerente = ferramentasDe(pessoa('Gerência', 3), tudoLigado);
  expect(lugarParaAbrir(doGerente, ['cotador', 'margens'])).toEqual({ ferramenta: 'cotador', parte: 'margens' });
  // Aba que ele não tem (fretes é de Compras): abre a primeira dele
  expect(lugarParaAbrir(doGerente, ['cotador', 'fretes'])).toEqual({ ferramenta: 'cotador', parte: 'cotar' });
  // Lixo no endereço: a grade
  expect(lugarParaAbrir(doGerente, ['nada'])).toBeNull();
  expect(lugarParaAbrir(doGerente, [])).toBeNull();
  // A Bia, com o endereço das margens colado, não chega às margens
  expect(lugarParaAbrir(ferramentasDe(pessoa('Balcão', 1), tudoLigado), ['cotador', 'margens'])).toEqual({ ferramenta: 'cotador', parte: 'cotar' });
  expect(escreverLugar({ ferramenta: 'cotador', parte: 'fretes' })).toBe('cotador/fretes');
});
