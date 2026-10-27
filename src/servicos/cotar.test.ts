/**
 * A TELA DE COTAR, sem tela: separar os códigos, montar os cartões na ordem
 * da tela e acompanhar o andamento até ficar pronto (SPEC-cotar).
 */
import { test, expect } from 'bun:test';
import { separarCodigos, montarCartao, acompanhar, comFatorDoVendedor, type LinhaDoResultado, type Andamento } from './cotar';

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

// ------------------------------------------------------------
// O widget por fornecedor (Elias, 21/10/2026: "com 10 é horrível")
// ------------------------------------------------------------

test('um bloco por fornecedor, com a peça e os similares DELE, do mais barato', async () => {
  const { blocosPorFornecedor } = await import('./cotar');
  const c = montarCartao('OC90', [
    linha({ fornecedor: 'dpk', venda: 35.9 }),
    linha({ fornecedor: 'roles', venda: 16.9 }),
    linha({ fornecedor: 'pellegrino', venda: null, em_sp: null }),
    linha({ tipo: 'similar', codigo_peca: 'W7122', fornecedor: 'roles', marca: 'Mann', venda: 17.9 }),
    linha({ tipo: 'similar', codigo_peca: 'PSL619', fornecedor: 'roles', marca: 'Tecfil', venda: 15.9 }),
    linha({ tipo: 'similar', codigo_peca: 'W7122', fornecedor: 'pellegrino', marca: 'Mann', venda: 18.9 }),
  ]);
  const b = blocosPorFornecedor(c);
  // Com a peça primeiro (pela venda); a Pellegrino só tem similar
  expect(b.map((x) => x.fornecedor)).toEqual(['roles', 'dpk', 'pellegrino']);
  expect(b[0].similares.map((s) => s.codigo)).toEqual(['PSL619', 'W7122']);
  expect(b[0].similarMaisBarato).toBe(15.9);
  expect(b[1].similares).toEqual([]);
  expect(b[2].peca?.venda).toBeNull();
  expect(b[2].similares.map((s) => `${s.codigo} ${s.oferta.venda}`)).toEqual(['W7122 18.9']);
});

test('ordem: SP antes de fora; por prazo quando pedido; sem estoque e sem similar no fim', async () => {
  const { blocosPorFornecedor } = await import('./cotar');
  const c = montarCartao('X1', [
    linha({ codigo_peca: 'X1', fornecedor: 'fora', venda: 10, em_sp: false, prazo: '7–10 dias' }),
    linha({ codigo_peca: 'X1', fornecedor: 'caro', venda: 30, prazo: '2–3 dias' }),
    linha({ codigo_peca: 'X1', fornecedor: 'barato', venda: 20, prazo: '3–4 dias' }),
    linha({ codigo_peca: 'X1', fornecedor: 'nada', venda: null, em_sp: null, prazo: null }),
  ]);
  expect(blocosPorFornecedor(c, 'preco').map((x) => x.fornecedor)).toEqual(['barato', 'caro', 'fora', 'nada']);
  expect(blocosPorFornecedor(c, 'prazo').map((x) => x.fornecedor)).toEqual(['caro', 'barato', 'fora', 'nada']);
});

test('cotada hoje: até o "sem estoque" conta; cartão vazio é peça que ninguém cotou hoje', async () => {
  const { foiCotadaHoje } = await import('./cotar');
  expect(foiCotadaHoje(montarCartao('OC90', []))).toBe(false);
  expect(foiCotadaHoje(montarCartao('OC90', [linha({ venda: null, em_sp: null, situacao: 'SEM ESTOQUE' })]))).toBe(true);
  expect(foiCotadaHoje(montarCartao('OC90', [linha({ tipo: 'similar', codigo_peca: 'W7122' })]))).toBe(true);
});

test('"com a peça": quem só tem similar não conta como disponível (o caso da DPK)', async () => {
  const { blocosPorFornecedor, comAPeca } = await import('./cotar');
  const c = montarCartao('TR6B10', [
    linha({ codigo_peca: 'TR6B10', fornecedor: 'roles', venda: 39.9 }),
    linha({ codigo_peca: 'TR6B10', fornecedor: 'dpk', venda: null, em_sp: null, situacao: 'SEM ESTOQUE' }),
    linha({ tipo: 'similar', codigo_peca: 'TR6B11', fornecedor: 'dpk', venda: 35.9 }),
    linha({ tipo: 'similar', codigo_peca: 'TR6B11', fornecedor: 'pellegrino', venda: 36.9 }),
  ]);
  expect(comAPeca(blocosPorFornecedor(c)).map((b) => b.fornecedor)).toEqual(['roles']);
});

test('o resumo do topo: a melhor em SP, quantos têm, e o similar mais barato de todos', async () => {
  const { blocosPorFornecedor, resumoDoCartao } = await import('./cotar');
  const c = montarCartao('OC90', [
    linha({ fornecedor: 'fora', venda: 9.9, em_sp: false }),
    linha({ fornecedor: 'dpk', venda: 35.9 }),
    linha({ fornecedor: 'roles', venda: 16.9 }),
    linha({ fornecedor: 'nada', venda: null, em_sp: null }),
    linha({ tipo: 'similar', codigo_peca: 'PSL619', fornecedor: 'dpk', venda: 14.9 }),
  ]);
  const r = resumoDoCartao(blocosPorFornecedor(c));
  // A de fora é mais barata, mas a melhor é a de SP
  expect([r.melhor?.fornecedor, r.comEstoque, r.fornecedores]).toEqual(['roles', 3, 4]);
  expect([r.similarMaisBarato?.fornecedor, r.similarMaisBarato?.similar.codigo]).toEqual(['dpk', 'PSL619']);
});

test('Callcenter: sem fator, a base (custo + frete) em ordem; com fator, a base × fator para cima em ,90', () => {
  const c = montarCartao('OC90', [
    // Pela venda da marca a DPK vem antes; pela base, a Roles (fator da marca não conta mais)
    linha({ fornecedor: 'dpk', venda: 18.9, custo: 10.5, frete: 0.8, fator: 1.8 }),
    linha({ fornecedor: 'roles', venda: 19.9, custo: 7.98, frete: 0, fator: 2.4 }),
    linha({ fornecedor: 'semestoque', venda: null, em_sp: null, situacao: 'SEM ESTOQUE' }),
    // Marca com preço por tipo: um fator só, um preço só
    linha({ fornecedor: 'isapa', venda: 30.9, custo: 12, fator: 2.55, variante: 'PISTÃO', variantes: 2 }),
    linha({ fornecedor: 'isapa', venda: 23.9, custo: 12, fator: 1.97, variante: 'SAPATA', variantes: 2 }),
    linha({ tipo: 'similar', codigo_peca: 'PSL619', fornecedor: 'roles', venda: 15.9, custo: 8.74, frete: 0.5 }),
  ]);

  const base = comFatorDoVendedor(c, null);
  expect(base.ofertas.map((o) => [o.fornecedor, o.venda])).toEqual([['roles', 7.98], ['dpk', 11.3], ['isapa', 12], ['semestoque', null]]);
  expect(base.ofertas.find((o) => o.fornecedor === 'isapa')!.tipos).toEqual([]);
  expect(base.similares[0].ofertas[0].venda).toBe(9.24);

  // 7,98 × 1,60 = 12,768 → 12,77 → 12,90 · 11,30 × 1,60 = 18,08 → 18,90 · 12 × 1,60 = 19,20 → 19,90
  const com = comFatorDoVendedor(c, 1.6);
  expect(com.ofertas.map((o) => [o.fornecedor, o.venda])).toEqual([['roles', 12.9], ['dpk', 18.9], ['isapa', 19.9], ['semestoque', null]]);
  // 9,24 × 1,60 = 14,784 → 14,78 → 14,90
  expect(com.similares[0].ofertas[0].venda).toBe(14.9);
  // O cartão de origem não muda (a tela troca o fator e volta)
  expect(c.ofertas.find((o) => o.fornecedor === 'dpk')!.venda).toBe(18.9);
});
