/**
 * O AFASTAMENTO NA APURAÇÃO DA MADRUGADA (afastamentos.sql, 17/10/2026).
 *
 * O dia afastado vira situação do dia: prevê zero, não é falta, e o
 * servidor não põe ninguém na fila por ele. Testado como o servidor roda:
 * em UTC.
 */
process.env.TZ = 'UTC';

import { test, expect } from 'bun:test';
import { planejarApuracao, DadosDaApuracao } from './apurarPonto';
import { planejarAlertasSemBater } from './semBater';
import { situacaoNaLista } from '../servicos/justificativasCache';
import type { Afastamento } from '../tipos';

const pessoa = (id: string, nivel: number) =>
  ({
    id, nome: id, login: id, cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel,
    turno: 'A', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '',
  }) as any;

const ANA = pessoa('ana', 1);
const dados = (afastamentos: Afastamento[] = []): DadosDaApuracao => ({
  colaboradores: [ANA, pessoa('ger', 3)],
  batidas: [],
  ausencias: [],
  feriados: [],
  ajustes: [],
  permissoes: null,
  afastamentos,
});
const opcoes = { hoje: '2026-10-08', agora: '2026-10-08T06:00:00.000Z', novoId: () => 'novo', diasParaTras: 7 };
const AFASTADA: Afastamento = { id: 'af1', colaboradorId: 'ana', inicio: '2026-09-20', motivo: 'doenca' };

test('a semana inteira sem batida vira falta — afastada, nenhuma', () => {
  const semAfastamento = planejarApuracao(dados(), opcoes);
  expect(semAfastamento.gravar.filter((a) => a.colaboradorId === 'ana').length).toBeGreaterThan(0);

  const afastada = planejarApuracao(dados([AFASTADA]), opcoes);
  expect(afastada.gravar.filter((a) => a.colaboradorId === 'ana')).toEqual([]);
  expect(afastada.novosNaFila).toEqual([]);
});

test('com data de volta, os dias depois dela voltam a ser cobrados', () => {
  // Afastada até sábado 03/10: segunda 05/10 em diante é de trabalho de novo
  const plano = planejarApuracao(dados([{ ...AFASTADA, fim: '2026-10-03' }]), opcoes);
  const dias = plano.gravar.filter((a) => a.colaboradorId === 'ana').map((a) => a.data);
  expect(dias.every((d) => d >= '2026-10-05')).toBe(true);
  expect(dias).toContain('2026-10-05');
});

test('afastado vale por cima de férias e atestado, e só no período', () => {
  const ferias = [{ colaboradorId: 'ana', estado: 'aprovada', tipo: 'ferias', dataInicio: '2026-10-01', dataFim: '2026-10-10' }] as any;
  expect(situacaoNaLista(ferias, 'ana', '2026-10-05', [AFASTADA])).toBe('afastado');
  expect(situacaoNaLista(ferias, 'ana', '2026-10-05', [])).toBe('ferias');
  expect(situacaoNaLista([], 'ana', '2026-09-19', [AFASTADA])).toBe('normal');
  expect(situacaoNaLista([], 'bia', '2026-10-05', [AFASTADA])).toBe('normal');
});

test('quem está afastado não recebe o "você ainda não bateu"', () => {
  // Quinta 08/10, 07:38 em Brasília: a entrada das 07:30 acabou de passar da
  // tolerância (o alerta sai numa janela de 5 minutos depois dela)
  const agora = new Date('2026-10-08T10:38:00.000Z');
  const semAfastamento = planejarAlertasSemBater(dados(), agora);
  expect(semAfastamento.map((a) => a.colaboradorId)).toContain('ana');
  expect(planejarAlertasSemBater(dados([AFASTADA]), agora).map((a) => a.colaboradorId)).not.toContain('ana');
});
