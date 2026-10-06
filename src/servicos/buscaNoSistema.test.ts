/**
 * A BUSCA DO COMPUTADOR: pessoas e ferramentas, separadas, e só o que a
 * pessoa alcança.
 */
import { test, expect } from 'bun:test';
import { buscarNoSistema, ferramentasDe, LIMITE_POR_GRUPO } from './buscaNoSistema';
import type { TelaId } from './telasPorAssunto';

const pessoa = (id: string, nome: string, extra: Record<string, unknown> = {}) =>
  ({ id, nome, cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', ativo: true, ...extra }) as any;

const PESSOAS = [
  pessoa('a', 'João Felipe da Silva Baldi'),
  pessoa('b', 'Ana Paula Ribeiro'),
  pessoa('c', 'Fabio Joaquim', { cargo: 'Gerente', setor: 'Gerência', loja: 'Descalvado' }),
  pessoa('d', 'Joana Inativa', { ativo: false }),
];

const DE_TODOS = new Set<TelaId>(['inicio', 'central', 'meus_documentos', 'meu_ponto', 'conversas']);

test('PESSOAS e FERRAMENTAS em grupos separados; sem acento e sem caixa', () => {
  const r = buscarNoSistema('joao', { pessoas: PESSOAS, ferramentas: ferramentasDe(DE_TODOS) });
  expect(r.pessoas.map((c) => c.id)).toEqual(['a']);
  expect(r.ferramentas).toEqual([]);

  const doc = buscarNoSistema('docu', { pessoas: PESSOAS, ferramentas: ferramentasDe(DE_TODOS) });
  expect(doc.pessoas).toEqual([]);
  // Meus documentos pelo nome, primeiro; a Central também tem documentos, e vem depois
  expect(doc.ferramentas.map((f) => f.tela)).toEqual(['meus_documentos', 'central']);
});

test('o nome vem antes do cargo e da loja; inativo não aparece', () => {
  // "jo": João pelo começo do nome, Fabio Joaquim pelo sobrenome; Joana está inativa
  expect(buscarNoSistema('jo', { pessoas: PESSOAS, ferramentas: [] }).pessoas.map((c) => c.id)).toEqual(['a', 'c']);
  // Pela loja também se acha
  expect(buscarNoSistema('descal', { pessoas: PESSOAS, ferramentas: [] }).pessoas.map((c) => c.id)).toEqual(['c']);
});

test('FERRAMENTAS: só as telas da pessoa — a do RH não aparece para o colaborador', () => {
  const doColaborador = ferramentasDe(DE_TODOS);
  expect(doColaborador.map((f) => f.tela)).not.toContain('holerites');
  // O colaborador que procura "holerite" acha Meus documentos, onde está o dele — nunca a tela do RH
  expect(buscarNoSistema('holer', { pessoas: [], ferramentas: doColaborador }).ferramentas.map((f) => f.tela)).toEqual(['meus_documentos']);
  // Para o RH, com a tela, aparece
  const doRH = ferramentasDe(new Set<TelaId>([...DE_TODOS, 'holerites']));
  expect(buscarNoSistema('holer', { pessoas: [], ferramentas: doRH }).ferramentas.map((f) => f.tela)[0]).toBe('holerites');
  // Conversas é o balão, não uma tela
  expect(doColaborador.map((f) => f.tela)).not.toContain('conversas');
});

test('uma letra só não sugere nada; cada grupo tem limite', () => {
  expect(buscarNoSistema('j', { pessoas: PESSOAS, ferramentas: ferramentasDe(DE_TODOS) })).toEqual({ pessoas: [], ferramentas: [] });
  const muitas = Array.from({ length: 20 }, (_, i) => pessoa(`p${i}`, `Maria ${i}`));
  expect(buscarNoSistema('maria', { pessoas: muitas, ferramentas: [] }).pessoas).toHaveLength(LIMITE_POR_GRUPO);
});
