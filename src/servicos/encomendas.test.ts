/**
 * O PAINEL DE PEDIDOS, sem tela (docs/cotador/SPEC-pedidos-compras.md): a
 * conta de cada coluna contra o pedido mínimo, o prazo de cancelamento e as
 * mensagens do chat — que nunca levam o custo nem o cliente.
 */
import { test, expect } from 'bun:test';
import { colunasPorFornecedor, fornecedoresDoPainel, acoesDoPainel, podeCancelar, avisoDaMensagem, marcadasDaColuna, lerPedidoMinimo, precisaLerDeNovo, ouvirEmRajada, precoVencido, entraAmanha, resumoDoPainel, type EncomendaDeCompras } from './encomendas';

const enc = (o: Partial<EncomendaDeCompras>): EncomendaDeCompras => ({
  id: 'e1', codigo: 'OC90', origem: 'b2b', fornecedor_chave: 'roles', fornecedor_nome: 'Roles', pedido_minimo: 150,
  marca: 'MAHLE', descricao: null, local: null, venda: 16.9, custo: 9, prazo: '2–3 dias', quantidade: 1,
  observacao: 'João 99999-0000', situacao: 'encomendada', vendedor_id: 'bia', nome_do_vendedor: 'Bia', loja: 'Pirassununga',
  criada_em: '2026-10-21T13:00:00Z', pedido_em: null, conferencia_em: null, ...o,
});

test('a coluna: soma de custo × quantidade contra o mínimo — verde quando fecha, vermelho com quanto falta', () => {
  const colunas = colunasPorFornecedor([
    enc({ id: 'r1', custo: 40, quantidade: 2 }), // Roles: 80 + 50 = 130 de 150
    enc({ id: 'r2', custo: 50, criada_em: '2026-10-20T10:00:00Z' }),
    enc({ id: 'd1', fornecedor_chave: 'dpk', fornecedor_nome: 'DPK', custo: 100, quantidade: 2 }), // DPK: 200 de 150
  ]);
  expect(colunas.map((c) => [c.nome, c.total, c.situacao, c.falta])).toEqual([
    ['DPK', 200, 'fecha', 0],
    ['Roles', 130, 'falta', 20],
  ]);
  // A que espera há mais tempo, para nenhuma ficar esquecida
  expect(colunas[1].maisAntiga).toBe('2026-10-20T10:00:00Z');
});

test('fornecedor de fora do B2B agrupa pelo nome e fica neutro; sem custo não entra na conta, mas é contado', () => {
  const colunas = colunasPorFornecedor([
    enc({ id: 'f1', origem: 'comprador', fornecedor_chave: null, fornecedor_nome: 'Cobra', pedido_minimo: null, custo: null }),
    enc({ id: 'f2', origem: 'comprador', fornecedor_chave: null, fornecedor_nome: 'COBRA ', pedido_minimo: null, custo: 30 }),
    enc({ id: 'l1', fornecedor_chave: 'lucios', fornecedor_nome: 'Lucios', pedido_minimo: 0, custo: 10 }),
  ]);
  expect(colunas.map((c) => [c.nome, c.encomendas.length, c.total, c.semCusto, c.situacao])).toEqual([
    ['Cobra', 2, 30, 1, 'sem_minimo'],
    ['Lucios', 1, 10, 0, 'sem_minimo'],
  ]);
});

test('o painel: números de cada etapa, fornecedores prontos, e a atividade de HOJE (de Brasília), do mais recente', () => {
  const agora = new Date('2026-10-22T15:00:00-03:00');
  const r = resumoDoPainel(
    [
      enc({ id: 'a', custo: 100, quantidade: 2, criada_em: '2026-10-22T09:00:00-03:00' }), // Roles: 200 ≥ 150, fecha
      enc({ id: 'b', fornecedor_chave: 'dpk', fornecedor_nome: 'DPK', custo: 50, criada_em: '2026-10-21T17:00:00-03:00' }), // ontem
      // Um pedido de duas peças na Pellegrino, de uma vez: uma linha só
      enc({ id: 'c', situacao: 'pedido_realizado', fornecedor_nome: 'Pellegrino', criada_em: '2026-10-20T10:00:00-03:00', pedido_em: '2026-10-22T11:00:10-03:00' }),
      enc({ id: 'd', situacao: 'pedido_realizado', fornecedor_nome: 'Pellegrino', criada_em: '2026-10-20T10:00:00-03:00', pedido_em: '2026-10-22T11:00:20-03:00' }),
      enc({ id: 'e', situacao: 'em_conferencia', conferencia_em: '2026-10-21T16:00:00-03:00', criada_em: '2026-10-19T10:00:00-03:00' }),
      enc({ id: 'f', situacao: 'cancelada', cancelada_em: '2026-10-22T14:00:00-03:00', cancelada_pelo_vendedor: true, criada_em: '2026-10-21T10:00:00-03:00' }),
      enc({ id: 'g', situacao: 'recebida', recebida_em: '2026-10-22T12:00:00-03:00', criada_em: '2026-10-18T10:00:00-03:00' }),
    ],
    agora
  );
  expect([r.paraPedir, r.custoParaPedir, r.prontos, r.comMinimo, r.aguardandoChegada, r.emConferencia]).toEqual([2, 250, 1, 2, 2, 1]);
  expect(r.pedidoMaisAntigo).toBe('2026-10-22T11:00:10-03:00');
  expect(r.atividade.map((a) => `${a.tipo}: ${a.texto}`)).toEqual([
    'cancelada: Bia cancelou 1× OC90 · Roles',
    'recebida: Bia recebeu 1× OC90 · Roles',
    'pedido: Pedido realizado na Pellegrino: 2 encomendas',
    'encomenda: Bia encomendou 2× OC90 · Roles',
  ]);
});

test('cancelar: só encomendada e até o corte', () => {
  const ate = '2026-10-21T18:59:00Z'; // 15h59 em Brasília
  expect(podeCancelar({ situacao: 'encomendada', cancelavel_ate: ate }, new Date('2026-10-21T18:58:00Z'))).toBe(true);
  expect(podeCancelar({ situacao: 'encomendada', cancelavel_ate: ate }, new Date('2026-10-21T19:00:00Z'))).toBe(false);
  expect(podeCancelar({ situacao: 'pedido_realizado', cancelavel_ate: ate }, new Date('2026-10-21T12:00:00Z'))).toBe(false);
});

test('o chat reconhece cada aviso pelo texto que o BANCO escreve (texto_do_aviso)', async () => {
  // As aberturas moram no SQL; a tela só as reconhece. Mudou lá sem mudar aqui, o Recebi some.
  const sql = await Bun.file('supabase/cotador-encomendas.sql').text();
  const abertura = (aviso: string) => sql.match(new RegExp(`when '${aviso}'\\s+then '([^']+)'`))![1];
  const textos = ['pedido_realizado', 'em_conferencia', 'cancelada'].map((a) => `${abertura(a)}\n1× OC90 · Roles`);
  expect(textos.map(avisoDaMensagem)).toEqual(['pedido_realizado', 'em_conferencia', 'cancelada']);
  expect(avisoDaMensagem('bom dia')).toBeNull();
});

// ------------------------------------------------------------
// O Painel de Compras redesenhado (26/10/2026)
// ------------------------------------------------------------
const ligados = [
  { chave: 'roles', nome: 'Roles', pedido_minimo: 150 },
  { chave: 'dpk', nome: 'DPK', pedido_minimo: 150 },
  { chave: 'barros', nome: 'Barros', pedido_minimo: 0 },
  { chave: 'sky', nome: 'Sky Peças', pedido_minimo: 500 },
];
const idade = () => 'há 20 d';
const reais = (v: number) => `R$ ${v.toFixed(2)}`;

test('fornecedores do painel: quem já pode ser pedido primeiro, depois o que menos falta; os parados na ordem do cadastro', () => {
  const colunas = colunasPorFornecedor([
    enc({ id: 'r', custo: 100 }), // Roles 100 de 150: faltam 50
    enc({ id: 's', fornecedor_chave: 'sky', fornecedor_nome: 'Sky Peças', pedido_minimo: 500, custo: 490 }), // faltam 10
    enc({ id: 'b', fornecedor_chave: 'barros', fornecedor_nome: 'Barros', pedido_minimo: 0, custo: 30 }), // sem mínimo
  ]);
  const { comEncomenda, semEncomenda } = fornecedoresDoPainel(colunas, ligados);
  expect(comEncomenda.map((c) => c.nome)).toEqual(['Barros', 'Sky Peças', 'Roles']);
  expect(semEncomenda.map((f) => f.nome)).toEqual(['DPK']);
});

test('precisa de você agora: o vendedor esperando primeiro, depois o que pode ser pedido, depois a conferência', () => {
  const colunas = colunasPorFornecedor([
    enc({ id: 'r', custo: 200 }), // Roles fecha
    enc({ id: 'b', fornecedor_chave: 'barros', fornecedor_nome: 'Barros', pedido_minimo: 0, custo: 30 }),
    // Falta na Sky, mas há quem já pode ser pedido: não vira ação de "está perto"
    enc({ id: 's', fornecedor_chave: 'sky', fornecedor_nome: 'Sky Peças', pedido_minimo: 500, custo: 490 }),
  ]);
  const acoes = acoesDoPainel({ colunas, emConferencia: 8, conferenciaMaisAntiga: '2026-10-06T10:00:00Z' }, [{ criadaEm: '2026-10-26T10:00:00Z' }], idade, reais);
  expect(acoes.map((a) => [a.tom, a.destino, a.titulo])).toEqual([
    ['atencao', 'solicitacoes', '1 solicitação de cotação esperando'],
    ['ok', 'montar', 'Roles e Barros já podem ser pedidos'],
    ['atencao', 'conferencia', '8 encomendas esperando o “Recebi” do vendedor'],
  ]);
  expect(acoes[1].porque).toBe('Roles fecha o mínimo (R$ 200.00 de R$ 150.00); Barros não tem mínimo.');
});

test('ninguém fecha o mínimo: aponta o mais perto (o print de 26/10: Pellegrino a R$ 33)', () => {
  const colunas = colunasPorFornecedor([
    enc({ id: 'p', fornecedor_chave: 'pellegrino', fornecedor_nome: 'Pellegrino', custo: 117 }),
    enc({ id: 's', fornecedor_chave: 'sky', fornecedor_nome: 'Sky Peças', pedido_minimo: 500, custo: 299.62 }),
  ]);
  const acoes = acoesDoPainel({ colunas, emConferencia: 0, conferenciaMaisAntiga: null }, [], idade, reais);
  expect(acoes).toEqual([
    { tom: 'acento', destino: 'montar', titulo: 'Pellegrino está a R$ 33.00 do mínimo', porque: '2 fornecedores têm encomenda, nenhum fecha o mínimo ainda.' },
  ]);
});

test('nada a fazer: lista vazia (a tela diz "Tudo em dia")', () => {
  expect(acoesDoPainel({ colunas: [], emConferencia: 0, conferenciaMaisAntiga: null }, [], idade, reais)).toEqual([]);
});

test('preço vencido depois de 24 h; encomenda depois do corte entra amanhã', () => {
  const agora = new Date('2026-10-26T15:00:00-03:00');
  expect(precoVencido({ preco_consultado_em: '2026-10-25T15:30:00-03:00' }, agora)).toBe(false);
  expect(precoVencido({ preco_consultado_em: '2026-10-25T14:30:00-03:00' }, agora)).toBe(true);
  expect(precoVencido({ preco_consultado_em: null }, agora)).toBe(false);
  // Corte às 15h59: às 15h entra hoje; às 16h10 o banco dá o corte de amanhã
  expect(entraAmanha('2026-10-26T15:59:00-03:00', agora)).toBe(false);
  expect(entraAmanha('2026-10-27T15:59:00-03:00', new Date('2026-10-26T16:10:00-03:00'))).toBe(true);
  // 22h em Brasília já é outro dia em UTC: a conta é no horário de Brasília
  expect(entraAmanha('2026-10-27T15:59:00-03:00', new Date('2026-10-26T22:30:00-03:00'))).toBe(true);
  expect(entraAmanha('2026-10-26T15:59:00-03:00', new Date('2026-10-26T08:00:00-03:00'))).toBe(false);
});

test('Precisa de você: o que travou primeiro, depois o pedido atrasado e a transferência', () => {
  const vazio = { colunas: [], emConferencia: 0, conferenciaMaisAntiga: null };
  const agora = new Date('2026-10-26T10:00:00-03:00');
  const lista = [
    { situacao: 'recebida' as const, problema: 'avariada' as const, problema_resolvido_em: null, desistiu_em: null, previsao_chegada: null },
    { situacao: 'em_conferencia' as const, problema: null, problema_resolvido_em: null, desistiu_em: '2026-10-25T10:00:00Z', previsao_chegada: null },
    { situacao: 'cancelada' as const, problema: null, problema_resolvido_em: null, desistiu_em: '2026-10-25T10:00:00Z', previsao_chegada: null },
    { situacao: 'pedido_realizado' as const, problema: null, problema_resolvido_em: null, desistiu_em: null, previsao_chegada: '2026-10-25' },
    { situacao: 'pedido_realizado' as const, problema: null, problema_resolvido_em: null, desistiu_em: null, previsao_chegada: '2026-10-26' },
    { situacao: 'em_transferencia' as const, problema: null, problema_resolvido_em: null, desistiu_em: null, previsao_chegada: null },
  ];
  const acoes = acoesDoPainel(vazio, [], () => 'há 1 d', String, lista, agora);
  expect(acoes.map((a) => [a.titulo, a.destino])).toEqual([
    ['2 encomendas para resolver', 'montar'],
    ['1 pedido passou do dia previsto', 'chegada'],
    ['1 peça em transferência para as lojas', 'transferencia'],
  ]);
});

test('uma recarga por rajada: 30 avisos seguidos viram uma só; parar de ouvir cancela a pendente', async () => {
  let vezes = 0;
  let avisar = () => {};
  let parou = false;
  const ouvir = (aoMudar: () => void) => ((avisar = aoMudar), () => void (parou = true));
  const parar = ouvirEmRajada(ouvir, () => vezes++, 20);
  for (let i = 0; i < 30; i++) avisar();
  await Bun.sleep(60);
  expect(vezes).toBe(1);
  // A tela fechou no meio de uma rajada: a releitura pendente não acontece
  avisar();
  parar();
  await Bun.sleep(60);
  expect([vezes, parou]).toEqual([1, true]);
});

test('o cartão do chat lê de novo: outra pessoa, 15 s depois, ou um recado que chegou com a conversa aberta', () => {
  const lida = { eu: 'bia', em: 1_000_000, recados: new Set(['r1', 'r2']) };
  expect(precisaLerDeNovo(null, 'bia', 'r1', 1_000_000)).toBe(true);
  expect(precisaLerDeNovo(lida, 'bia', 'r1', 1_005_000)).toBe(false);
  expect(precisaLerDeNovo(lida, 'gil', 'r1', 1_005_000)).toBe(true);
  expect(precisaLerDeNovo(lida, 'bia', 'r1', 1_016_000)).toBe(true);
  // Abrindo a conversa: os recados montam juntos e aproveitam a mesma leitura
  expect(precisaLerDeNovo(lida, 'bia', 'r3', 1_000_500)).toBe(false);
  // O recado "em conferência" chegou depois, com a conversa aberta: lê de novo
  expect(precisaLerDeNovo(lida, 'bia', 'r3', 1_005_000)).toBe(true);
});

test('pedido mínimo: zero é "sem mínimo" (o que a tela promete); o resto como valor', () => {
  expect(['0', '0,00', 'R$ 0', ' 0.0 ', '150', '1.250,00', 'abc', ''].map(lerPedidoMinimo)).toEqual([0, 0, 0, 0, 150, 1250, null, null]);
});

test('a coluna de Compras: a nova entra marcada; a desmarcada continua desmarcada; a que saiu, sai', () => {
  const vistas = new Set(['a', 'b', 'c']);
  // O comprador desmarcou a "b"; a lista foi relida e chegou a "d"
  const r = marcadasDaColuna(new Set(['a', 'c']), vistas, ['a', 'b', 'c', 'd']);
  expect([...r].sort()).toEqual(['a', 'c', 'd']);
  // A "c" saiu da coluna (pedida por outro comprador): sai das marcadas
  expect([...marcadasDaColuna(r, new Set([...vistas, 'd']), ['a', 'b', 'd'])].sort()).toEqual(['a', 'd']);
});
