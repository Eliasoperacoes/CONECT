/**
 * COTAÇÃO HUMANA, sem tela: juntar as respostas, ler o valor digitado, a
 * mensagem do chat (que nunca leva o custo) e o que merece aviso.
 */
import { test, expect } from 'bun:test';
import { juntarSolicitacoes, lerValor, mensagemParaOChat, interpretarMudanca, type LinhaDaSolicitacao } from './cotacaoHumana';

const linha = (o: Partial<LinhaDaSolicitacao>): LinhaDaSolicitacao => ({
  id: 's1', codigo_peca: 'HG5170', veiculo: 'Gol 1.0 2012', observacao: null, situacao: 'respondida', motivo: null,
  pedida_por: 'bia', nome_de_quem_pediu: 'Bia', loja: 'Pirassununga', criada_em: '2026-10-21T10:00:00Z',
  respondida_por: 'caio', nome_de_quem_respondeu: 'Caio', respondida_em: '2026-10-21T10:05:00Z', vista_em: null,
  fornecedor: null, marca: null, venda: null, custo: null, prazo: null, observacao_da_resposta: null, ...o,
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

test('A MENSAGEM DO CHAT NUNCA LEVA O CUSTO', () => {
  const s = { codigo: 'HG5170', veiculo: 'Gol 1.0 2012', situacao: 'respondida' as const, motivo: null };
  const opcoes = [
    { fornecedor: 'Barros', marca: 'Nakata', venda: 89.9, prazo: '2 dias', custo: 45 },
    { fornecedor: 'Disape', marca: null, venda: 95.9, prazo: null, custo: 50 },
  ];
  const texto = mensagemParaOChat(s, opcoes);
  expect(texto).toBe(
    'Cotação da peça HG5170 (Gol 1.0 2012):\n• Barros (Nakata): R$ 89,90 · 2 dias\n• Disape: R$ 95,90\nDetalhes em Ferramentas › Cotação de peças.'
  );
  expect(texto).not.toContain('45');
  expect(texto).not.toContain('50');
  expect(mensagemParaOChat({ ...s, situacao: 'nao_encontrada', motivo: 'nenhum fornecedor tem' }, [])).toBe(
    'Cotação da peça HG5170 (Gol 1.0 2012): não encontrei. nenhum fornecedor tem'
  );
});

test('aviso: solicitação nova e resposta, mas não a marca de "vista" (senão avisaria de novo ao ler)', () => {
  expect(interpretarMudanca('INSERT', { codigo: 'HG5170', situacao: 'aberta', pedida_por: 'bia' })).toEqual({
    tipo: 'nova', codigo: 'HG5170', pedidaPor: 'bia',
  });
  expect(interpretarMudanca('UPDATE', { codigo: 'HG5170', situacao: 'respondida', pedida_por: 'bia', vista_em: null })).toEqual({
    tipo: 'respondida', codigo: 'HG5170', pedidaPor: 'bia',
  });
  expect(interpretarMudanca('UPDATE', { codigo: 'HG5170', situacao: 'respondida', vista_em: '2026-10-21T10:06:00Z' })).toBeNull();
  expect(interpretarMudanca('UPDATE', { codigo: 'HG5170', situacao: 'aberta' })).toBeNull();
});
