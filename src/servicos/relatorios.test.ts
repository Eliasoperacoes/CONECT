/**
 * O RELATÓRIO DO COTADOR, sem tela (docs/cotador/SPEC-insights-cotacao.md):
 * o período em Brasília, o tempo de cada etapa e o gargalo, a conversão,
 * os rankings, a demanda que não virou encomenda e os insights escritos.
 */
import { test, expect } from 'bun:test';
import {
  intervaloDoPeriodo,
  escreverTempo,
  mediana,
  percentil,
  montarRelatorio,
  abasDaPlanilha,
  intervaloAnterior,
  serieDiaria,
  variacao,
  motivosEmTexto,
  custoDe,
  lerEmPaginas,
  LINHAS_POR_PAGINA,
  type CotacaoDoPeriodo,
  type JornadaDaEncomenda,
  type SolicitacaoDoPeriodo,
} from './relatorios';

const AGORA = new Date('2026-10-22T15:00:00-03:00');
const h = (horasAtras: number) => new Date(AGORA.getTime() - horasAtras * 3_600_000).toISOString();

const cot = (o: Partial<CotacaoDoPeriodo>): CotacaoDoPeriodo => ({
  colaborador_id: 'bia', nome: 'Bia', loja: 'Pirassununga', codigo: 'OC90', dia: '2026-10-22', vezes: 1,
  situacao: 'SP', fornecedor: 'roles', venda: 16.9, similares: 2, ultima: h(50), ...o,
});
const enc = (o: Partial<JornadaDaEncomenda>): JornadaDaEncomenda => ({
  id: Math.random().toString(36), vendedor_id: 'bia', nome_do_vendedor: 'Bia', loja: 'Pirassununga', codigo: 'OC90', codigo_cotado: 'OC90',
  origem: 'b2b', fornecedor_nome: 'Roles', marca: 'MAHLE', quantidade: 1, venda: 16.9, custo: 9, situacao: 'recebida',
  cotada_em: h(100), solicitada_em: null, respondida_em: null, encomendada_em: h(99), pedido_em: h(75), conferencia_em: h(27), recebida_em: h(26),
  cancelada_em: null, cancelada_pelo_vendedor: null, ...o,
});
const sol = (o: Partial<SolicitacaoDoPeriodo>): SolicitacaoDoPeriodo => ({
  id: Math.random().toString(36), codigo: 'HG5193', pedida_por: 'bia', nome: 'Bia', loja: 'Pirassununga', situacao: 'respondida',
  criada_em: h(10), respondida_em: h(9), nome_de_quem_respondeu: 'Caio', opcoes: 2, ...o,
});

test('o período é o de Brasília: "hoje" começa à meia-noite de SP, "mês passado" pega o mês inteiro', () => {
  const hoje = intervaloDoPeriodo('hoje', AGORA);
  expect([hoje.de.toISOString(), hoje.ate.toISOString()]).toEqual(['2026-10-22T03:00:00.000Z', '2026-10-23T03:00:00.000Z']);
  expect(intervaloDoPeriodo('7dias', AGORA).de.toISOString()).toBe('2026-10-16T03:00:00.000Z');
  const anterior = intervaloDoPeriodo('mes_anterior', AGORA);
  expect([anterior.de.toISOString(), anterior.ate.toISOString()]).toEqual(['2026-09-01T03:00:00.000Z', '2026-10-01T03:00:00.000Z']);
  // Janeiro: o mês passado é dezembro do ano anterior
  expect(intervaloDoPeriodo('mes_anterior', new Date('2027-01-10T12:00:00-03:00')).de.toISOString()).toBe('2026-12-01T03:00:00.000Z');
  // Datas digitadas: o "até" é inclusive; trocadas, vale o "de"
  const datas = intervaloDoPeriodo('personalizado', AGORA, { de: '2026-10-01', ate: '2026-10-05' });
  expect(datas.ate.toISOString()).toBe('2026-10-06T03:00:00.000Z');
});

test('o período anterior tem o mesmo tamanho, logo antes; a série tem TODOS os dias, inclusive os vazios', () => {
  const sete = intervaloDoPeriodo('7dias', AGORA);
  const antes = intervaloAnterior(sete);
  expect([antes.de.toISOString(), antes.ate.toISOString()]).toEqual(['2026-10-09T03:00:00.000Z', '2026-10-16T03:00:00.000Z']);

  const serie = serieDiaria(
    {
      cotacoes: [cot({ dia: '2026-10-20' }), cot({ dia: '2026-10-20', codigo: 'X' }), cot({ dia: '2026-10-01' })],
      solicitacoes: [],
      encomendas: [
        enc({ encomendada_em: '2026-10-20T22:30:00-03:00', quantidade: 2, venda: 10 }), // 01:30 UTC do dia 21: em SP ainda é 20
        enc({ encomendada_em: '2026-10-22T09:00:00-03:00', situacao: 'cancelada', cancelada_em: h(1) }),
      ],
    },
    {},
    sete
  );
  expect(serie.map((d) => d.dia)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  expect(serie.find((d) => d.dia === '2026-10-20')).toEqual({ dia: '2026-10-20', cotacoes: 2, encomendas: 1, pecas: 2, valor: 20, canceladas: 0 });
  expect(serie.find((d) => d.dia === '2026-10-22')?.canceladas).toBe(1);
});

test('a variação diz se é boa: mais valor é bom, mais tempo é ruim; sem base, não inventa porcentagem', () => {
  expect(variacao(112, 100, true)).toEqual({ valor: 0.12, sentido: 'sobe', bom: true });
  expect(variacao(36, 24, false)).toEqual({ valor: 0.5, sentido: 'sobe', bom: false });
  expect(variacao(80, 100, true)).toMatchObject({ sentido: 'desce', bom: false });
  expect(variacao(5, 0, true)).toEqual({ valor: null, sentido: 'igual', bom: null });
  expect(variacao(null, 10, true).valor).toBeNull();
});

test('o tempo do jeito que se fala, e a mediana e o "9 em 10"', () => {
  expect([escreverTempo(0.4), escreverTempo(3.17), escreverTempo(36), escreverTempo(72), escreverTempo(null)]).toEqual(['24 min', '3 h 10 min', '1,5 dia', '3 dias', '—']);
  expect(mediana([5, 1, 3])).toBe(3);
  expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1);
  expect(mediana([])).toBeNull();
});

test('o tempo de cada etapa e o GARGALO: a etapa operacional mais lenta (a decisão do cliente não conta)', () => {
  const r = montarRelatorio(
    {
      cotacoes: [cot({})],
      solicitacoes: [sol({})],
      encomendas: [
        // cotada→encomendada 1 h, espera pedido 24 h, entrega 48 h, retirada 1 h
        enc({}),
        enc({ cotada_em: h(200), encomendada_em: h(100), pedido_em: h(76), conferencia_em: h(28), recebida_em: h(27) }),
      ],
    },
    {},
    AGORA
  );
  const porId = Object.fromEntries(r.etapas.map((e) => [e.id, Math.round(e.mediana ?? -1)]));
  // Decisão: 1 h e 100 h → mediana 50,5 h
  expect(porId).toEqual({ decisao: 51, resposta: 1, pedido: 24, entrega: 48, retirada: 1 });
  expect(r.gargalo?.id).toBe('entrega');
  expect(r.insights[0]).toMatchObject({ tom: 'gargalo', titulo: 'Gargalo: entrega do fornecedor' });
  // Da cotação à entrega: 74 h e 173 h → mediana 123,5 h
  expect(r.numeros.total).toBeCloseTo(123.5);
});

test('conversão: a cotação que virou encomenda do mesmo vendedor no mesmo dia; cancelada não conta como valor', () => {
  const r = montarRelatorio(
    {
      cotacoes: [cot({ codigo: 'OC90' }), cot({ codigo: 'W7122' }), cot({ codigo: 'PSL619', colaborador_id: 'gil', nome: 'Gil' })],
      solicitacoes: [],
      encomendas: [
        enc({ codigo_cotado: 'OC90', encomendada_em: '2026-10-22T10:00:00-03:00', quantidade: 2, venda: 20, custo: 10 }),
        enc({ codigo_cotado: 'W7122', codigo: 'W7122', situacao: 'cancelada', cancelada_em: h(1), cancelada_pelo_vendedor: true, encomendada_em: '2026-10-22T11:00:00-03:00' }),
      ],
    },
    {},
    AGORA
  );
  // 2 das 3 cotações viraram encomenda (a cancelada também foi decisão de encomendar)
  expect(r.numeros.conversao).toBeCloseTo(2 / 3);
  expect([r.numeros.encomendas, r.numeros.pecasEncomendadas, r.numeros.valor, r.numeros.custo, r.numeros.margem]).toEqual([1, 2, 40, 20, 20]);
  expect([r.numeros.canceladas, r.numeros.canceladasPeloVendedor]).toEqual([1, 1]);
  expect(r.vendedores.map((v) => `${v.nome} ${v.encomendas} ${v.canceladas} ${Math.round((v.conversao ?? 0) * 100)}%`)).toEqual(['Bia 1 1 100%', 'Gil 0 0 0%']);
  expect(r.funil.map((f) => `${f.rotulo} ${f.n}`)).toEqual(['Cotadas 3', 'Encomendadas 1', 'Pedidas ao fornecedor 1', 'Chegaram 1', 'Recebidas pelo vendedor 1', 'Entregues ao cliente 0']);
});

test('o elogio de conversão só aparece para quem se destaca (20% acima da média), não para quem é a média', () => {
  const cinco = (vendedor: string, nome: string, comEncomenda: number) => ({
    cotacoes: Array.from({ length: 5 }, (_, i) => cot({ colaborador_id: vendedor, nome, codigo: `P${i}` })),
    encomendas: Array.from({ length: comEncomenda }, (_, i) => enc({ vendedor_id: vendedor, nome_do_vendedor: nome, codigo_cotado: `P${i}`, encomendada_em: '2026-10-22T10:00:00-03:00' })),
  });
  const iguais = [cinco('bia', 'Bia', 1), cinco('gil', 'Gil', 1)];
  const r1 = montarRelatorio({ cotacoes: iguais.flatMap((x) => x.cotacoes), encomendas: iguais.flatMap((x) => x.encomendas), solicitacoes: [] }, {}, AGORA);
  expect(r1.insights.some((i) => i.titulo.includes('converte'))).toBe(false);
  const destaque = [cinco('bia', 'Bia', 3), cinco('gil', 'Gil', 1)];
  const r2 = montarRelatorio({ cotacoes: destaque.flatMap((x) => x.cotacoes), encomendas: destaque.flatMap((x) => x.encomendas), solicitacoes: [] }, {}, AGORA);
  expect(r2.insights.find((i) => i.titulo.includes('converte'))?.titulo).toBe('Bia converte 60% das cotações');
});

test('peças: a mais encomendada no topo; 3 vezes ou mais é candidata a estoque (e vira insight)', () => {
  const r = montarRelatorio(
    {
      cotacoes: [],
      solicitacoes: [],
      encomendas: [
        enc({ codigo: 'OC90', vendedor_id: 'bia' }),
        enc({ codigo: 'OC90', vendedor_id: 'gil', nome_do_vendedor: 'Gil' }),
        enc({ codigo: 'OC90', quantidade: 4, fornecedor_nome: 'DPK' }),
        enc({ codigo: 'N1068', quantidade: 2 }),
      ],
    },
    {},
    AGORA
  );
  expect(r.pecas.map((p) => `${p.codigo} ${p.encomendas}x ${p.pecas}pç ${p.vendedores}v ${p.recorrente}`)).toEqual(['OC90 3x 6pç 2v true', 'N1068 1x 2pç 1v false']);
  expect(r.pecas[0].fornecedores).toEqual(['Roles', 'DPK']);
  expect(r.insights.find((i) => i.tom === 'estoque')?.titulo).toBe('OC90 MAHLE: candidata a estoque');
});

test('demanda: procurada e não encomendada — sem estoque nos B2Bs, nem o comprador encontrou', () => {
  const r = montarRelatorio(
    {
      cotacoes: [
        cot({ codigo: 'HG5193', situacao: 'SEM ESTOQUE', colaborador_id: 'bia' }),
        cot({ codigo: 'HG5193', situacao: 'SEM ESTOQUE', colaborador_id: 'gil', nome: 'Gil' }),
        cot({ codigo: 'OC90' }),
      ],
      solicitacoes: [sol({ codigo: 'HG5193', situacao: 'nao_encontrada' })],
      encomendas: [enc({ codigo_cotado: 'OC90' })],
    },
    {},
    AGORA
  );
  expect(r.demanda).toEqual([{ codigo: 'HG5193', procuras: 2, vendedores: 2, semEstoqueNosB2B: 2, pedidaAoComprador: 1, comprador: 'nao_encontrou' }]);
  expect(r.insights.find((i) => i.tom === 'demanda')?.titulo).toBe('HG5193: procurada 3 vezes, nenhuma encomenda');
});

test('o que está PARADO agora vira alerta: peça chegou e não foi retirada há mais de 2 dias', () => {
  const r = montarRelatorio(
    { cotacoes: [], solicitacoes: [], encomendas: [enc({ situacao: 'em_conferencia', conferencia_em: h(60), recebida_em: null })] },
    {},
    AGORA
  );
  expect(r.etapas.find((e) => e.id === 'retirada')?.paradas).toBe(1);
  expect(r.insights.some((i) => i.titulo === '1 peça chegou e não foi retirada')).toBe(true);
});

test('os filtros: por vendedor e loja; com fornecedor, as contas de cotação saem (cotação não tem fornecedor)', () => {
  const dados = {
    cotacoes: [cot({}), cot({ colaborador_id: 'gil', nome: 'Gil', loja: 'Descalvado' })],
    solicitacoes: [],
    encomendas: [enc({}), enc({ vendedor_id: 'gil', nome_do_vendedor: 'Gil', loja: 'Descalvado', fornecedor_nome: 'DPK' })],
  };
  expect(montarRelatorio(dados, { vendedor: 'gil' }, AGORA).numeros).toMatchObject({ cotacoes: 1, encomendas: 1 });
  expect(montarRelatorio(dados, { loja: 'Pirassununga' }, AGORA).numeros).toMatchObject({ cotacoes: 1, encomendas: 1 });
  const soDpk = montarRelatorio(dados, { fornecedor: 'DPK' }, AGORA);
  expect([soDpk.numeros.encomendas, soDpk.numeros.conversao, soDpk.funil[0].rotulo]).toEqual([1, null, 'Encomendadas']);
  // As opções dos filtros não somem ao filtrar
  expect(montarRelatorio(dados, { vendedor: 'gil' }, AGORA).opcoes.vendedores.map((v) => v.nome)).toEqual(['Bia', 'Gil']);
});

test('a planilha: uma aba por tabela, a jornada com as horas de cada etapa, e o custo só para quem vê custo', () => {
  const dados = { cotacoes: [cot({})], solicitacoes: [sol({})], encomendas: [enc({ custo: 9 })] };
  const r = montarRelatorio(dados, {}, AGORA);
  const comCusto = abasDaPlanilha(r, dados, true, '22/10/2026');
  const semCusto = abasDaPlanilha(r, dados, false, '22/10/2026');
  expect(Object.keys(comCusto)).toEqual([
    'Resumo', 'Etapas', 'Vendedores', 'Peças encomendadas', 'Procuradas sem encomenda', 'Fornecedores', 'Lojas', 'Jornada das encomendas', 'Cotações', 'Pedidos ao comprador',
  ]);
  const jornada = comCusto['Jornada das encomendas'];
  const col = (nome: string) => jornada[0].indexOf(nome);
  expect([jornada[1][col('Espera pelo pedido (h)')], jornada[1][col('Entrega do fornecedor (h)')], jornada[1][col('Total (h)')]]).toEqual([24, 48, 74]);
  expect(JSON.stringify(semCusto)).not.toContain('Custo');
  expect(JSON.stringify(comCusto['Jornada das encomendas'][0])).toContain('Custo (R$)');
});

test('devoluções por fornecedor: devolvidas ÷ pedidas, com os motivos; a não pedida não entra na base', () => {
  const dados = {
    cotacoes: [],
    solicitacoes: [],
    encomendas: [
      enc({ fornecedor_nome: 'Roles' }),
      enc({ fornecedor_nome: 'Roles', devolvida_em: h(20), motivo_devolucao: 'avariada' }),
      enc({ fornecedor_nome: 'Roles', situacao: 'cancelada', devolvida_em: h(20), motivo_devolucao: 'avariada' }),
      enc({ fornecedor_nome: 'Roles', situacao: 'cancelada', devolvida_em: h(20), motivo_devolucao: 'desistencia' }),
      enc({ fornecedor_nome: 'DPK' }),
      // Ainda não pedida: fora da base da taxa
      enc({ fornecedor_nome: 'DPK', situacao: 'encomendada', pedido_em: null, conferencia_em: null, recebida_em: null }),
    ],
  };
  const r = montarRelatorio(dados, {}, AGORA);
  const roles = r.fornecedores.find((f) => f.nome === 'Roles')!;
  const dpk = r.fornecedores.find((f) => f.nome === 'DPK')!;
  expect([roles.pedidas, roles.devolvidas, roles.taxaDeDevolucao]).toEqual([4, 3, 0.75]);
  expect(motivosEmTexto(roles.motivosDaDevolucao)).toBe('2 avariada · 1 cliente desistiu');
  expect([dpk.pedidas, dpk.devolvidas, dpk.taxaDeDevolucao]).toEqual([1, 0, 0]);
  expect(abasDaPlanilha(r, dados, false, 'x').Fornecedores[0]).toContain('Taxa de devolução');
});

test('margem: a venda menos (custo + frete) × quantidade', () => {
  // Custo 100, frete 10, fator 1,5 → venda 165,90; margem 55,90 (e não 65,90)
  expect(custoDe({ custo: 100, frete: 10, quantidade: 2 })).toBe(220);
  const r = montarRelatorio({ cotacoes: [], solicitacoes: [], encomendas: [enc({ venda: 165.9, custo: 100, frete: 10, quantidade: 1 })] }, {}, AGORA);
  expect(r.numeros.custo).toBe(110);
  expect(r.numeros.margem).toBeCloseTo(55.9, 2);
  expect(r.fornecedores[0].custo).toBe(110);
});

test('funil até o cliente: recebida pelo vendedor e entregue ao cliente', () => {
  const r = montarRelatorio({ cotacoes: [], solicitacoes: [], encomendas: [enc({}), enc({ entregue_em: h(2) })] }, {}, AGORA);
  expect(r.funil.slice(-2).map((f) => `${f.rotulo} ${f.n}`)).toEqual(['Recebidas pelo vendedor 2', 'Entregues ao cliente 1']);
});

test('lê em páginas até trazer tudo (a API entrega 1000 por vez), e para no teto', async () => {
  const linhas = Array.from({ length: 2_350 }, (_, i) => i);
  const pedidas: [number, number][] = [];
  const pagina = async (de: number, ate: number) => (pedidas.push([de, ate]), { data: linhas.slice(de, ate + 1), error: null });
  expect((await lerEmPaginas<number>(pagina, 20_000)).length).toBe(2_350);
  expect(pedidas).toEqual([[0, LINHAS_POR_PAGINA - 1], [1000, 1999], [2000, 2999]]);
  // No teto, para — e quem chama marca o relatório como incompleto
  expect((await lerEmPaginas<number>(pagina, 1_500)).length).toBe(1_500);
});
