/**
 * A FILA DE ASSINATURAS DO RH: o que entra no lote do responsável, e o
 * que fica de fora — e por quê. O responsável assina SÓ O ESPELHO; o
 * holerite fica completo com a assinatura do funcionário (Elias, 05/10/2026).
 */
import { test, expect } from 'bun:test';
import { montarFilaDoMes, loteDaFila, descreverLote } from './assinaturasDoRH';

const MES = '2026-09';
const pessoas = [
  { id: 'ana', nome: 'Ana', temEspelho: true },
  { id: 'bia', nome: 'Bia', temEspelho: true },
  { id: 'rh', nome: 'Renata RH', temEspelho: true },
  { id: 'cid', nome: 'Cid', temEspelho: true },
  { id: 'ger', nome: 'Gerente', temEspelho: false },
];
const holerite = (id: string, colaboradorId: string, competencia = MES) =>
  ({ id, colaboradorId, competencia, arquivoCaminho: '', arquivoNome: '', criadoEm: '' }) as any;
const recebido = (assinadoEm = '2026-10-05T10:00:00Z') => ({ assinadoEm }) as any;
const espelho = (confere = true) =>
  ({ imagem: 'x', assinadoEm: '2026-10-05T11:00:00Z', conteudoHash: 'h', confere }) as any;

const fila = (extra: Partial<Parameters<typeof montarFilaDoMes>[0]> = {}) =>
  montarFilaDoMes({
    mes: MES,
    eu: 'rh',
    pessoas,
    holerites: [holerite('h-ana', 'ana'), holerite('h-bia', 'bia'), holerite('h-ago', 'ana', '2026-08')],
    recebimentos: new Map([['h-ana', recebido()]]),
    espelhos: new Map([
      ['ana', espelho()],
      ['bia', espelho(false)],
      ['rh', espelho()],
    ]),
    responsaveis: new Map(),
    cobraEspelho: true,
    ...extra,
  });

const estado = (itens: ReturnType<typeof fila>, chave: string) => itens.find((i) => i.chave === chave)?.estado;

test('cada documento no seu lugar', () => {
  const itens = fila();
  // O holerite assinado pelo funcionário está completo: não espera o RH
  expect(estado(itens, 'holerite#h-ana')).toBe('assinado');
  expect(estado(itens, 'holerite#h-bia')).toBe('falta_colaborador');
  // O espelho assinado pelo colaborador espera o responsável
  expect(estado(itens, 'espelho#ana|2026-09')).toBe('para_assinar');
  // O espelho de quem assina fica para outra pessoa do RH
  expect(estado(itens, 'espelho#rh|2026-09')).toBe('proprio');
  // O espelho mudou depois da assinatura: o responsável não assina por cima
  expect(estado(itens, 'espelho#bia|2026-09')).toBe('alterado');
  // O espelho que ninguém assinou é cobrado de quem tem espelho
  expect(estado(itens, 'espelho#cid|2026-09')).toBe('falta_colaborador');
  // Quem não bate ponto não tem espelho na fila; outro mês não entra
  expect(itens.some((i) => i.chave === 'espelho#ger|2026-09')).toBe(false);
  expect(itens.some((i) => i.referencia === 'h-ago')).toBe(false);
});

test('O LOTE é só de espelhos, e só dos que estão para assinar', () => {
  expect(loteDaFila(fila())).toEqual(['ana|2026-09']);
  expect(descreverLote(loteDaFila(fila()))).toBe('1 espelho de ponto');
  expect(descreverLote(['a', 'b'])).toBe('2 espelhos de ponto');
});

test('espelho assinado pelo responsável sai do lote, com quem e quando', () => {
  const itens = fila({
    responsaveis: new Map([
      ['espelho#ana|2026-09', { responsavelNome: 'Renata RH', assinadoEm: '2026-10-06T12:00:00Z' } as any],
    ]),
  });
  const ana = itens.find((i) => i.chave === 'espelho#ana|2026-09')!;
  expect(ana.estado).toBe('assinado');
  expect(ana.responsavel).toEqual({ nome: 'Renata RH', assinadoEm: '2026-10-06T12:00:00Z' });
  expect(loteDaFila(itens)).toEqual([]);
});

test('mês que ainda não se cobra: só o espelho que alguém assinou aparece', () => {
  const itens = fila({ cobraEspelho: false });
  expect(itens.filter((i) => i.documento === 'espelho').map((i) => i.colaboradorId).sort()).toEqual(['ana', 'bia', 'rh']);
});
