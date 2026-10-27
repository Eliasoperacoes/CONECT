/**
 * OS LEMBRETES DAS ENCOMENDAS: quem lembrar de quê, e uma vez por janela.
 */
import { test, expect } from 'bun:test';
import { naJanela, primeiraRodadaDesde, planejarLembretesDeEncomendas, type EncomendaParaLembrar, type PessoaParaLembrar } from './lembretesEncomendas';

const pessoas: PessoaParaLembrar[] = [
  { id: 'bia', setor: 'Balcão', loja: 'Pirassununga', nivel: 1 },
  { id: 'gil', setor: 'Gerência', loja: 'Pirassununga', nivel: 3 },
  { id: 'rui', setor: 'Gerência', loja: 'Descalvado', nivel: 3 },
  { id: 'caio', setor: 'Compras', loja: 'Pirassununga', nivel: 1 },
  { id: 'ex', setor: 'Balcão', loja: 'Pirassununga', nivel: 1, ativo: false },
];
const enc = (o: Partial<EncomendaParaLembrar>): EncomendaParaLembrar => ({
  id: 'x', codigo: 'OC90', quantidade: 1, situacao: 'em_conferencia', vendedorId: 'bia', loja: 'Pirassununga',
  criadaEm: '2026-10-20T10:00:00-03:00', conferenciaEm: null, recebidaEm: null, previsaoChegada: null,
  problemaAberto: false, desistiuSemDestino: false, ...o,
});
const quem = (l: ReturnType<typeof planejarLembretesDeEncomendas>) => l.map((x) => `${x.colaboradorId}:${x.dados.mensagemId.split('-')[2]}`).sort();

test('a janela: 1 hora depois do prazo, repetida a cada 24 h', () => {
  const desde = '2026-10-26T08:00:00-03:00';
  const em = (h: string) => naJanela(desde, 4, new Date(`2026-10-${h}-03:00`));
  expect([em('26T11:59:00'), em('26T12:00:00'), em('26T12:59:00'), em('26T13:00:00'), em('27T12:30:00'), em('27T13:30:00')])
    .toEqual([false, true, true, false, true, false]);
  expect(naJanela(null, 4, new Date())).toBe(false);
});

test('Recebi esquecido: o vendedor às 4 h; o Gerente da loja às 24 h; quem saiu não é lembrado', () => {
  const lista = [
    enc({ id: 'a', conferenciaEm: '2026-10-26T08:00:00-03:00' }),
    enc({ id: 'b', conferenciaEm: '2026-10-25T12:00:00-03:00' }),
    enc({ id: 'c', vendedorId: 'ex', conferenciaEm: '2026-10-26T08:00:00-03:00' }),
  ];
  // A rodada das 12h de 26/10: a de 8h fez 4 h; a de ontem 12h fez 24 h
  expect(quem(planejarLembretesDeEncomendas(lista, pessoas, new Date('2026-10-26T12:00:20-03:00')))).toEqual(['bia:recebi', 'gil:gerente']);
  // Na rodada das 13h, nenhuma janela: ninguém é lembrado de novo
  expect(planejarLembretesDeEncomendas(lista, pessoas, new Date('2026-10-26T13:00:20-03:00'))).toEqual([]);
});

test('recebida há 7 dias e não entregue: o vendedor, com as peças somadas', () => {
  const lista = [enc({ id: 'a', situacao: 'recebida', recebidaEm: '2026-10-19T10:15:00-03:00' }), enc({ id: 'b', situacao: 'recebida', recebidaEm: '2026-10-19T10:40:00-03:00' })];
  const l = planejarLembretesDeEncomendas(lista, pessoas, new Date('2026-10-26T11:00:20-03:00'));
  expect(quem(l)).toEqual(['bia:entrega']);
  expect(l[0].dados.texto).toStartWith('2 peças recebidas há 7 dias');
  expect(l[0].dados.conversaId).toBe('compras-bia');
});

test('Compras: um resumo às 9h, só com o que existe', () => {
  const lista = [
    enc({ id: 'a', situacao: 'encomendada', criadaEm: '2026-10-22T10:00:00-03:00' }),
    enc({ id: 'b', situacao: 'encomendada', criadaEm: '2026-10-25T10:00:00-03:00' }),
    enc({ id: 'c', situacao: 'pedido_realizado', previsaoChegada: '2026-10-25' }),
    enc({ id: 'd', situacao: 'pedido_realizado', previsaoChegada: '2026-10-26' }),
    enc({ id: 'e', situacao: 'recebida', problemaAberto: true }),
  ];
  const as9 = planejarLembretesDeEncomendas(lista, pessoas, new Date('2026-10-26T09:05:00-03:00'));
  expect(quem(as9)).toEqual(['caio:compras']);
  expect(as9[0].dados.texto).toBe('Encomendas: 1 parada há 3+ dias sem pedido · 1 pedido atrasado · 1 problema para resolver.');
  expect(planejarLembretesDeEncomendas(lista, pessoas, new Date('2026-10-26T10:05:00-03:00'))).toEqual([]);
});

test('o lembrete cai sempre numa rodada do agendamento (7h–19h, seg a sáb)', () => {
  const rodada = (iso: string) => primeiraRodadaDesde(new Date(iso)).toISOString();
  // Conferência às 15h20 + 4 h = 19h20: depois da última rodada → 7h do dia seguinte
  expect(rodada('2026-10-26T19:20:00-03:00')).toBe(new Date('2026-10-27T07:00:00-03:00').toISOString());
  // Sábado à noite → segunda 7h (domingo não roda)
  expect(rodada('2026-10-31T20:00:00-03:00')).toBe(new Date('2026-11-02T07:00:00-03:00').toISOString());
  // Dentro do horário: a próxima hora cheia
  expect(rodada('2026-10-26T10:15:00-03:00')).toBe(new Date('2026-10-26T11:00:00-03:00').toISOString());
  // E o lembrete sai mesmo nessa rodada
  expect(naJanela('2026-10-26T15:20:00-03:00', 4, new Date('2026-10-27T07:00:15-03:00'))).toBe(true);
});
