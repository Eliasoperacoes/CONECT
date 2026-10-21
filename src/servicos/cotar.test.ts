/**
 * A TELA DE COTAR, sem tela: separar os códigos, montar os cartões na ordem
 * da tela e acompanhar o andamento até ficar pronto (SPEC-cotar).
 */
import { test, expect } from 'bun:test';
import { separarCodigos, montarCartao, acompanhar, type LinhaDoResultado, type Andamento } from './cotar';

test('os códigos digitados: espaço, vírgula ou Enter; sem repetir; 3 caracteres ou mais', () => {
  expect(separarCodigos('oc-90, hg5170  w712/2\nOC90;ab')).toEqual(['oc-90', 'hg5170', 'w712/2']);
  expect(separarCodigos('   ')).toEqual([]);
});

const linha = (o: Partial<LinhaDoResultado>): LinhaDoResultado => ({
  tipo: 'peca', codigo_peca: 'OC90', fornecedor: 'dpk', marca: 'MAHLE', descricao: 'FILTRO', local: 'RIB PRETO',
  em_sp: true, quantidade: 10, situacao: 'SP', prazo: '2–3 dias', variante: '', variantes: 1, variante_provavel: false,
  fator_padrao: false, venda: 15.9, custo: null, fator: null, frete: null, ...o,
});

test('o cartão: SP pela menor venda, depois fora do estado, depois sem estoque', () => {
  const c = montarCartao('oc-90', [
    linha({ fornecedor: 'semestoque', venda: null, em_sp: null, local: null, situacao: 'SEM ESTOQUE', marca: null, descricao: null }),
    linha({ fornecedor: 'fora', venda: 12.9, em_sp: false, situacao: 'FORA DO ESTADO' }),
    linha({ fornecedor: 'caro', venda: 18.9 }),
    linha({ fornecedor: 'barato', venda: 15.9 }),
  ]);
  expect(c.codigo).toBe('OC90');
  expect(c.marca).toBe('MAHLE');
  // O de fora é mais barato, mas vem depois dos de SP
  expect(c.ofertas.map((o) => o.fornecedor)).toEqual(['barato', 'caro', 'fora', 'semestoque']);
});

test('similares do mais barato ao mais caro, separados da peça', () => {
  const c = montarCartao('OC90', [
    linha({}),
    linha({ tipo: 'similar', codigo_peca: 'W7122', fornecedor: 'roles', venda: 16.9 }),
    linha({ tipo: 'similar', codigo_peca: 'PSL619', fornecedor: 'roles', venda: 14.9 }),
    linha({ tipo: 'similar', codigo_peca: 'WL1', fornecedor: 'roles', venda: null, em_sp: null }),
  ]);
  expect(c.ofertas).toHaveLength(1);
  expect(c.similares.map((s) => s.codigo)).toEqual(['PSL619', 'W7122', 'WL1']);
});

test('A PEÇA APARECE UMA VEZ SÓ (Elias, 21/10): a peça e cada similar no topo, os fornecedores embaixo', () => {
  const c = montarCartao('oc90', [
    // Um fornecedor informa a descrição completa, outro não
    linha({ fornecedor: 'dpk', descricao: 'FILTRO OLEO LUBRIFICANTE - OC90 MAHLE', marca: 'MAHLE METAL LEVE' }),
    linha({ fornecedor: 'roles', descricao: null, marca: 'Metal Leve', venda: 16.9 }),
    // O mesmo similar em três fornecedores
    linha({ tipo: 'similar', codigo_peca: 'W7122', fornecedor: 'roles', marca: 'Mann-filter', venda: 16.9 }),
    linha({ tipo: 'similar', codigo_peca: 'W7122', fornecedor: 'dpk', marca: 'MANN', descricao: 'FILTRO OLEO', venda: 17.9 }),
    linha({ tipo: 'similar', codigo_peca: 'W7122', fornecedor: 'pellegrino', venda: null, em_sp: null }),
    linha({ tipo: 'similar', codigo_peca: 'PSL619', fornecedor: 'roles', marca: 'Tecfil', venda: 15.9 }),
  ]);
  expect([c.codigo, c.marca, c.descricao]).toEqual(['OC90', 'MAHLE METAL LEVE', 'FILTRO OLEO LUBRIFICANTE - OC90 MAHLE']);
  expect(c.ofertas.map((o) => o.fornecedor)).toEqual(['dpk', 'roles']);
  // Dois grupos, não quatro linhas: o W7122 uma vez, com os três fornecedores embaixo
  expect(c.similares.map((s) => s.codigo)).toEqual(['PSL619', 'W7122']);
  const w = c.similares[1];
  expect([w.marca, w.descricao]).toEqual(['Mann-filter', 'FILTRO OLEO']);
  expect(w.ofertas.map((o) => o.fornecedor)).toEqual(['roles', 'dpk', 'pellegrino']);
});

test('marca com fatores por tipo: uma oferta com os preços de cada tipo, e a venda menor na frente', () => {
  const c = montarCartao('P123', [
    linha({ codigo_peca: 'P123', variante: 'PISTÃO', variantes: 2, venda: 765.9, variante_provavel: true }),
    linha({ codigo_peca: 'P123', variante: 'SAPATA', variantes: 2, venda: 591.9 }),
  ]);
  expect(c.ofertas).toHaveLength(1);
  expect(c.ofertas[0].venda).toBe(591.9);
  expect(c.ofertas[0].tipos).toEqual([
    { tipo: 'PISTÃO', venda: 765.9, custo: null, provavel: true },
    { tipo: 'SAPATA', venda: 591.9, custo: null, provavel: false },
  ]);
});

test('acompanhar: confere até todos terminarem, e para quando a tela fecha', async () => {
  const respostas: Andamento[][] = [
    [{ codigo: 'A1', situacao: 'na_fila', erro: null, estacao_no_ar: true }, { codigo: 'B2', situacao: 'pronta', erro: null, estacao_no_ar: true }],
    [{ codigo: 'A1', situacao: 'cotando', erro: null, estacao_no_ar: true }, { codigo: 'B2', situacao: 'pronta', erro: null, estacao_no_ar: true }],
    [{ codigo: 'A1', situacao: 'pronta', erro: null, estacao_no_ar: true }, { codigo: 'B2', situacao: 'pronta', erro: null, estacao_no_ar: true }],
    [{ codigo: 'A1', situacao: 'pronta', erro: null, estacao_no_ar: true }],
  ];
  let perguntas = 0;
  const vistos: string[] = [];
  await new Promise<void>((fim) => {
    acompanhar(
      ['A1', 'B2'],
      async () => respostas[perguntas++],
      (a) => {
        vistos.push(a.map((x) => x.situacao).join('+'));
        if (a.every((x) => x.situacao === 'pronta')) setTimeout(fim, 5);
      },
      // Uma folga de verdade entre as voltas: se o laço não parar, o teste falha em vez de travar
      () => new Promise((r) => setTimeout(r, 0))
    );
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(vistos).toEqual(['na_fila+pronta', 'cotando+pronta', 'pronta+pronta']);
  expect(perguntas).toBe(3); // terminou: não pergunta mais

  // Fechar a tela para de perguntar
  let mais = 0;
  const parar = acompanhar(['A1'], async () => (mais++, [{ codigo: 'A1', situacao: 'na_fila', erro: null, estacao_no_ar: false }]), () => {}, () => new Promise((r) => setTimeout(r, 5)));
  await new Promise((r) => setTimeout(r, 12));
  parar();
  const ate = mais;
  await new Promise((r) => setTimeout(r, 20));
  expect(mais).toBe(ate);
});
