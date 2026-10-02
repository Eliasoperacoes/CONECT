/**
 * A ABA PENDÊNCIAS (Gerenciar → Equipe e ponto): "Sem bater hoje", "Pontos
 * incompletos" e "Aprovar jornadas" numa aba só, uma parte por vez.
 */
import { test, expect } from 'bun:test';
import type { Colaborador } from '../tipos';

const { agruparPessoas, comecaRecolhida } = await import('../componentes/GruposDePessoas');
const agruparSemBater = (pessoas: Colaborador[]) => {
  const { por, grupos } = agruparPessoas(pessoas, (p) => p);
  return { por, grupos: grupos.map((g) => ({ nome: g.nome, pessoas: g.itens })) };
};
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
  expect(comecaRecolhida(47, 5)).toBe(true);
  // Cabe na tela: aberta
  expect(comecaRecolhida(8, 3)).toBe(false);
  // Um grupo só recolhido seria um toque a mais para nada
  expect(comecaRecolhida(30, 1)).toBe(false);
});

/*
  APROVAR JORNADAS, na mesma organização: uma linha por PESSOA, com o
  resumo do que espera decisão, e os dias dela numa folha.
*/
const { agruparPorPessoa, resumoDasPendencias } = await import('../componentes/AprovacaoJornada');

const ana = pessoa('Ana', 'Pirassununga', 'Balcão');
const bia = pessoa('Bia', 'Pirassununga', 'Balcão');
const dia = (c: Colaborador, data: string, tipo: string, minutos: number) =>
  ({ colaborador: c, ajuste: { id: `${c.id}-${data}`, colaboradorId: c.id, data, tipo, minutos } }) as any;
const ausencia = (c: Colaborador) => ({ colaborador: c, justificativa: { id: `aus-${c.id}`, tipo: 'atestado' } }) as any;

test('os dias da mesma pessoa viram UMA linha, com os dias em ordem', () => {
  const grupos = agruparPorPessoa(
    [dia(ana, '2026-09-23', 'hora_extra', 30), dia(bia, '2026-09-21', 'debito', 20), dia(ana, '2026-09-21', 'hora_extra', 40)],
    [ausencia(bia)]
  );
  expect(grupos.map((g) => [g.colaborador.nome, g.ajustes.length, g.ausencias.length])).toEqual([
    ['Ana', 2, 0],
    ['Bia', 1, 1],
  ]);
  // O mais antigo primeiro, como a fila decide
  expect(grupos[0].ajustes.map((a) => a.ajuste.data)).toEqual(['2026-09-21', '2026-09-23']);
});

test('o resumo da linha diz o que espera decisão, sem abrir a folha', () => {
  expect(
    resumoDasPendencias(
      [dia(ana, '1', 'hora_extra', 30), dia(ana, '2', 'hora_extra', 40), dia(ana, '3', 'debito', 20), dia(ana, '4', 'dia_incompleto', 480)],
      [ausencia(ana)]
    )
  ).toBe('+1h10 extra · −0h20 · 1 dia sem fechar · 1 ausência');
  expect(resumoDasPendencias([dia(ana, '1', 'dia_incompleto', 480), dia(ana, '2', 'dia_incompleto', 480)], [])).toBe(
    '2 dias sem fechar'
  );
});

test('o numero da aba Pendencias e so o que pede decisao, sem o "sem bater"', async () => {
  /*
    No S10 do Fabio (02/10/2026) a mesma fila aparecia como 19 em "Equipe e
    ponto", 9+ na barra e 38 em Pendências — que somava os 19 que ainda não
    tinham batido. Quem não bateu é informação, não decisão do gestor.
  */
  const { contadorDasPendencias } = await import('../componentes/PendenciasDoPonto');
  expect(contadorDasPendencias({ sem_bater: 19, incompletos: 0, aprovar: 19 })).toBe(19);
  expect(contadorDasPendencias({ sem_bater: 5, incompletos: 2, aprovar: 3 })).toBe(5);

  const painel = await Bun.file(new URL('../componentes/PainelGestao.tsx', import.meta.url)).text();
  expect(painel).toContain('contador: contadorDasPendencias(totaisDasPendencias)');
});
