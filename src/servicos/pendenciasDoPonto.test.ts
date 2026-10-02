/**
 * A ABA PENDÊNCIAS (Gerenciar → Equipe e ponto): "Sem bater hoje", "Pontos
 * incompletos" e "Aprovar jornadas" numa aba só, uma parte por vez.
 */
import { test, expect } from 'bun:test';
import type { Colaborador } from '../tipos';

const { agruparSemBater } = await import('../componentes/SemBaterHoje');
const { vistaInicialDasPendencias } = await import('../componentes/PendenciasDoPonto');

const pessoa = (nome: string, loja: string, setor: string) =>
  ({ id: nome, nome, loja, setor, cargo: 'Balconista' }) as Colaborador;

test('abre na primeira parte com alguma coisa, na ordem do dia', () => {
  expect(vistaInicialDasPendencias({ sem_bater: 3, incompletos: 2, aprovar: 5 })).toBe('sem_bater');
  expect(vistaInicialDasPendencias({ sem_bater: 0, incompletos: 2, aprovar: 5 })).toBe('incompletos');
  expect(vistaInicialDasPendencias({ sem_bater: 0, incompletos: 0, aprovar: 5 })).toBe('aprovar');
  // Tudo zerado: a parte que diz "nada para decidir"
  expect(vistaInicialDasPendencias({ sem_bater: 0, incompletos: 0, aprovar: 0 })).toBe('aprovar');
});

test('uma loja só: agrupa por setor; o maior grupo primeiro, nomes em ordem', () => {
  const { por, grupos } = agruparSemBater([
    pessoa('Zeca', 'Pirassununga', 'Balcão'),
    pessoa('Ana', 'Pirassununga', 'Balcão'),
    pessoa('Bia', 'Pirassununga', 'Estoque'),
  ]);
  expect(por).toBe('setor');
  expect(grupos.map((g) => [g.nome, g.pessoas.map((p) => p.nome)])).toEqual([
    ['Balcão', ['Ana', 'Zeca']],
    ['Estoque', ['Bia']],
  ]);
});

test('mais de uma loja: agrupa por loja — é o que o RH reconhece de relance', () => {
  const { por, grupos } = agruparSemBater([
    pessoa('Ana', 'Pirassununga', 'Balcão'),
    pessoa('Carlos', 'Descalvado', 'Balcão'),
    pessoa('Bia', 'Pirassununga', 'Estoque'),
  ]);
  expect(por).toBe('loja');
  expect(grupos.map((g) => g.nome)).toEqual(['Pirassununga', 'Descalvado']);
});

test('ninguém some no agrupamento', () => {
  const todos = ['A', 'B', 'C', 'D', 'E'].map((n, i) => pessoa(n, i % 2 ? 'Descalvado' : 'Pirassununga', ''));
  const { grupos } = agruparSemBater(todos);
  expect(grupos.flatMap((g) => g.pessoas).length).toBe(5);
  // Setor em branco não vira grupo sem nome
  expect(agruparSemBater([pessoa('X', 'Pirassununga', '')]).grupos[0].nome).toBe('Sem setor');
});

test('lista grande abre recolhida, com o resumo por grupo; pequena, ou de um grupo só, aberta', async () => {
  const { comecaRecolhida } = await import('../componentes/SemBaterHoje');
  expect(comecaRecolhida(47, 5)).toBe(true);
  // Cabe na tela: aberta
  expect(comecaRecolhida(8, 3)).toBe(false);
  // Um grupo só recolhido seria um toque a mais para nada
  expect(comecaRecolhida(30, 1)).toBe(false);
});
