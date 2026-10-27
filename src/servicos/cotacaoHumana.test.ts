/**
 * COTAÇÃO HUMANA, sem tela: juntar as respostas, ler o valor digitado, a
 * mensagem do chat (que nunca leva o custo) e o que merece aviso.
 */
import { test, expect } from 'bun:test';
import { juntarSolicitacoes, soAsMinhas, daVezPorCodigo, mesclarSolicitacoes, lerValor, interpretarMudanca, type LinhaDaSolicitacao } from './cotacaoHumana';

const linha = (o: Partial<LinhaDaSolicitacao>): LinhaDaSolicitacao => ({
  id: 's1', codigo_peca: 'HG5170', veiculo: 'Gol 1.0 2012', observacao: null, situacao: 'respondida', motivo: null,
  pedida_por: 'bia', nome_de_quem_pediu: 'Bia', loja: 'Pirassununga', criada_em: '2026-10-21T10:00:00Z',
  respondida_por: 'caio', nome_de_quem_respondeu: 'Caio', respondida_em: '2026-10-21T10:05:00Z', vista_em: null,
  fornecedor: null, marca: null, venda: null, custo: null, prazo: null, observacao_da_resposta: null, resposta_id: null, ...o,
});

test('as linhas do banco viram uma solicitação com as opções da mais barata à mais cara', () => {
  const [s, outra] = juntarSolicitacoes([
    linha({ fornecedor: 'Disape', venda: 95.9, prazo: 'amanhã' }),
    linha({ fornecedor: 'Barros', venda: 89.9, prazo: '2 dias' }),
    linha({ id: 's2', codigo_peca: 'AB1', situacao: 'aberta' }),
  ]);
  expect(s.opcoes.map((o) => o.fornecedor)).toEqual(['Barros', 'Disape']);
  // Sem resposta ainda: a solicitação aparece, sem opções
  expect([outra.codigo, outra.situacao, outra.opcoes]).toEqual(['AB1', 'aberta', []]);
});

test('o valor digitado: R$, vírgula, milhar; zero ou texto não', () => {
  expect(['89,90', 'R$ 89,90', '89.9', '1.250,00', '1250'].map(lerValor)).toEqual([89.9, 89.9, 89.9, 1250, 1250]);
  expect(['0', '', 'abc', '-5'].map(lerValor)).toEqual([null, null, null, null]);
});

test('aviso: solicitação nova e resposta; a marca de "vista" vem separada (não é resposta nova, mas baixa o número)', () => {
  expect(interpretarMudanca('INSERT', { codigo: 'HG5170', situacao: 'aberta', pedida_por: 'bia' })).toEqual({
    tipo: 'nova', codigo: 'HG5170', pedidaPor: 'bia',
  });
  expect(interpretarMudanca('UPDATE', { codigo: 'HG5170', situacao: 'respondida', pedida_por: 'bia', vista_em: null })).toEqual({
    tipo: 'respondida', codigo: 'HG5170', pedidaPor: 'bia',
  });
  expect(interpretarMudanca('UPDATE', { codigo: 'HG5170', situacao: 'respondida', vista_em: '2026-10-21T10:06:00Z' })?.tipo).toBe('vista');
  expect(interpretarMudanca('UPDATE', { codigo: 'HG5170', situacao: 'aberta' })).toBeNull();
});

test('o número na aba: abertas para o comprador; respostas não vistas para o vendedor', async () => {
  const { pendenciasDoCotador } = await import('./cotacaoHumana');
  const s = (situacao: 'aberta' | 'respondida' | 'nao_encontrada', pedidaPor: string, vistaEm: string | null = null) =>
    ({ situacao, pedidaPor, vistaEm }) as never;
  const lista = [s('aberta', 'bia'), s('aberta', 'duda'), s('respondida', 'bia'), s('nao_encontrada', 'bia', '2026-10-21'), s('respondida', 'duda')];
  expect(pendenciasDoCotador(lista, 'caio', true)).toEqual({ solicitacoes: 2, respostas: 0 });
  // A Bia não é comprador: não conta as abertas; conta a resposta dela ainda não vista (a vista não)
  expect(pendenciasDoCotador(lista, 'bia', false)).toEqual({ solicitacoes: 0, respostas: 1 });
});

test('na tela de cotar, só as solicitações de quem cota — mesmo para Compras, que recebe todas', () => {
  const de = (id: string, pedidaPor: string | null) => ({ ...juntarSolicitacoes([])[0], id, pedidaPor }) as ReturnType<typeof juntarSolicitacoes>[number];
  const todas = [de('a', 'bia'), de('b', 'gil'), de('c', null)];
  expect(soAsMinhas(todas, 'bia').map((s) => s.id)).toEqual(['a']);
  expect(soAsMinhas(todas, 'caio')).toEqual([]);
});

test('a solicitação do cartão: a minha aberta primeiro; senão a mais recente; nunca a de outro', () => {
  const de = (id: string, pedidaPor: string, situacao: 'aberta' | 'respondida', criadaEm: string) =>
    ({ ...juntarSolicitacoes([])[0], id, codigo: 'OC90', pedidaPor, situacao, criadaEm }) as ReturnType<typeof juntarSolicitacoes>[number];
  // Como o banco devolve: abertas primeiro, depois por criada_em crescente
  const lista = [de('outro', 'gil', 'aberta', '2026-10-26T12:00:00Z'), de('aberta', 'bia', 'aberta', '2026-10-26T09:00:00Z'), de('velha', 'bia', 'respondida', '2026-10-20T09:00:00Z'), de('nova', 'bia', 'respondida', '2026-10-25T09:00:00Z')];
  expect(daVezPorCodigo(lista, 'bia').OC90.id).toBe('aberta');
  expect(daVezPorCodigo(lista.filter((s) => s.id !== 'aberta'), 'bia').OC90.id).toBe('nova');
  expect(daVezPorCodigo(lista, 'caio')).toEqual({});
  // A mais recente vence mesmo fora de ordem
  expect(daVezPorCodigo([...lista].reverse().filter((s) => s.id !== 'aberta'), 'bia').OC90.id).toBe('nova');
});

test('ao reler, a solicitação antiga aberta pelo Histórico continua no cartão; a relida vence', () => {
  const de = (id: string, codigo: string) => ({ ...juntarSolicitacoes([])[0], id, codigo }) as ReturnType<typeof juntarSolicitacoes>[number];
  const anteriores = { OC90: de('antiga', 'OC90'), HG1: de('velha', 'HG1') };
  const relidas = { HG1: de('nova', 'HG1') };
  const r = mesclarSolicitacoes(anteriores, relidas);
  expect([r.OC90.id, r.HG1.id]).toEqual(['antiga', 'nova']);
});
