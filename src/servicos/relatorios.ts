/**
 * RELATÓRIOS E INSIGHTS DO COTADOR (docs/cotador/SPEC-insights-cotacao.md).
 *
 * Elias, 22/10/2026: "metrificar todo o processo — quanto tempo leva, onde
 * tem gargalo"; "ligar os dados de cada vendedor: quantidade de peças,
 * quais as mais compradas — insights inteligentes para complementar as
 * tarefas da empresa"; "se eu precisar tirar um relatório, não existe".
 *
 * Três fontes, todas do banco e por período:
 *   - as cotações (`cotacoes_do_periodo`): o começo do funil e a demanda;
 *   - as solicitações ao comprador (`solicitacoes_do_periodo`);
 *   - a jornada de cada encomenda (`jornada_das_encomendas`).
 * Aqui só se conta. A tela desenha; a planilha exporta o mesmo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { numeros, type SituacaoDaEncomenda } from './encomendas';
import { hojeEmBrasilia } from './apuracaoDoDia';

// ------------------------------------------------------------
// OS DADOS
// ------------------------------------------------------------

export interface CotacaoDoPeriodo {
  colaborador_id: string;
  nome: string | null;
  loja: string | null;
  codigo: string;
  dia: string; // AAAA-MM-DD
  vezes: number;
  situacao: 'SP' | 'FORA DO ESTADO' | 'SEM ESTOQUE';
  fornecedor: string | null;
  venda: number | null;
  similares: number | null;
  ultima: string;
}

export interface SolicitacaoDoPeriodo {
  id: string;
  codigo: string;
  pedida_por: string | null;
  nome: string | null;
  loja: string | null;
  situacao: 'aberta' | 'respondida' | 'nao_encontrada';
  criada_em: string;
  respondida_em: string | null;
  nome_de_quem_respondeu: string | null;
  opcoes: number;
}

export interface JornadaDaEncomenda {
  id: string;
  vendedor_id: string | null;
  nome_do_vendedor: string | null;
  loja: string | null;
  codigo: string;
  codigo_cotado: string;
  origem: 'b2b' | 'comprador';
  fornecedor_nome: string;
  marca: string | null;
  quantidade: number;
  venda: number | null;
  custo: number | null;
  situacao: SituacaoDaEncomenda;
  cotada_em: string | null;
  solicitada_em: string | null;
  respondida_em: string | null;
  encomendada_em: string;
  pedido_em: string | null;
  conferencia_em: string | null;
  recebida_em: string | null;
  cancelada_em: string | null;
  cancelada_pelo_vendedor: boolean | null;
  /** A peça na mão do cliente (SPEC-comunicacao-recebimento); ausente no banco antigo */
  entregue_em?: string | null;
  /** Voltou ao fornecedor (SPEC-comunicacao-recebimento); ausente no banco antigo */
  devolvida_em?: string | null;
  motivo_devolucao?: MotivoDaDevolucao | null;
  /** O frete por peça, congelado com o custo; nulo para quem não vê custo */
  frete?: number | null;
}

export interface DadosDoRelatorio {
  cotacoes: CotacaoDoPeriodo[];
  solicitacoes: SolicitacaoDoPeriodo[];
  encomendas: JornadaDaEncomenda[];
  /** O período passou do teto de leitura (cotador-relatorios.sql): os números saem parciais */
  incompleto?: boolean;
}

/** A API entrega até 1000 linhas por vez (config.toml, max_rows): o relatório lê em páginas */
export const LINHAS_POR_PAGINA = 1000;
/** O teto de cada função no banco (limit em cotador-relatorios.sql e jornada_das_encomendas) */
export const TETO_DE_LINHAS = { cotacoes: 20_000, solicitacoes: 20_000, encomendas: 5_000 } as const;

/**
 * Todas as linhas de uma função, página por página. Sem isto, a API devolvia
 * só as primeiras 1000 — e o relatório saía cortado como se estivesse completo.
 */
export const lerEmPaginas = async <T,>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>, teto: number): Promise<T[]> => {
  const todas: T[] = [];
  for (let de = 0; de < teto; de += LINHAS_POR_PAGINA) {
    const { data, error } = await pagina(de, Math.min(de + LINHAS_POR_PAGINA, teto) - 1);
    if (error) throw error;
    const linhas = (data ?? []) as T[];
    todas.push(...linhas);
    if (linhas.length < LINHAS_POR_PAGINA) break;
  }
  return todas;
};

// ------------------------------------------------------------
// O PERÍODO (no horário de Brasília)
// ------------------------------------------------------------

export type IdDoPeriodo = 'hoje' | '7dias' | '30dias' | 'mes' | 'mes_anterior' | 'personalizado';
export const PERIODOS: { id: IdDoPeriodo; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: '7 dias' },
  { id: '30dias', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_anterior', rotulo: 'Mês passado' },
  { id: 'personalizado', rotulo: 'Datas' },
];

/** O dia de Brasília (AAAA-MM-DD) de um instante. */
export const diaSP = (d: Date | string): string => hojeEmBrasilia(new Date(d));
/** Meia-noite de Brasília de um dia AAAA-MM-DD (Brasília não tem horário de verão desde 2019). */
const meiaNoite = (dia: string) => new Date(`${dia}T00:00:00-03:00`);
const maisDias = (dia: string, n: number) => diaSP(new Date(meiaNoite(dia).getTime() + n * 86_400_000 + 3_600_000));

/** O intervalo [de, até) de um período; "personalizado" usa as datas digitadas (até inclusive). */
export const intervaloDoPeriodo = (p: IdDoPeriodo, agora: Date = new Date(), datas?: { de: string; ate: string }): { de: Date; ate: Date } => {
  const hoje = diaSP(agora);
  const [ano, mes] = hoje.split('-').map(Number);
  const primeiro = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}-01`;
  switch (p) {
    case 'hoje':
      return { de: meiaNoite(hoje), ate: meiaNoite(maisDias(hoje, 1)) };
    case '7dias':
      return { de: meiaNoite(maisDias(hoje, -6)), ate: meiaNoite(maisDias(hoje, 1)) };
    case '30dias':
      return { de: meiaNoite(maisDias(hoje, -29)), ate: meiaNoite(maisDias(hoje, 1)) };
    case 'mes':
      return { de: meiaNoite(primeiro(ano, mes)), ate: meiaNoite(maisDias(hoje, 1)) };
    case 'mes_anterior': {
      const [a, m] = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
      return { de: meiaNoite(primeiro(a, m)), ate: meiaNoite(primeiro(ano, mes)) };
    }
    case 'personalizado': {
      const de = datas?.de || hoje;
      const ate = datas?.ate && datas.ate >= de ? datas.ate : de;
      return { de: meiaNoite(de), ate: meiaNoite(maisDias(ate, 1)) };
    }
  }
};

// ------------------------------------------------------------
// TEMPO: mediana, "9 em 10" e o jeito de escrever
// ------------------------------------------------------------

const horas = (de: string | null, ate: string | null): number | null =>
  de && ate ? Math.max(0, (new Date(ate).getTime() - new Date(de).getTime()) / 3_600_000) : null;

export const percentil = (valores: number[], p: number): number | null => {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const i = (o.length - 1) * p;
  const baixo = Math.floor(i);
  return o[baixo] + (o[Math.ceil(i)] - o[baixo]) * (i - baixo);
};
export const mediana = (v: number[]) => percentil(v, 0.5);

/** "25 min", "3 h 10 min", "1,5 dia" — o tempo do jeito que se fala na loja. */
export const escreverTempo = (h: number | null): string => {
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) {
    const inteiras = Math.floor(h);
    const min = Math.round((h - inteiras) * 60);
    return min ? `${inteiras} h ${min} min` : `${inteiras} h`;
  }
  const dias = h / 24;
  return `${dias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${dias < 1.95 ? 'dia' : 'dias'}`;
};

// ------------------------------------------------------------
// O RELATÓRIO
// ------------------------------------------------------------

export interface FiltrosDoRelatorio {
  loja?: string | null;
  vendedor?: string | null;
  fornecedor?: string | null;
}

export type IdDaEtapa = 'decisao' | 'resposta' | 'pedido' | 'entrega' | 'retirada';
export interface Etapa {
  id: IdDaEtapa;
  nome: string;
  quem: string;
  /** Em horas */
  mediana: number | null;
  p90: number | null;
  n: number;
  /** Quantas estão AGORA paradas nesta etapa há mais que o limite */
  paradas: number;
}

export interface LinhaDoVendedor {
  id: string;
  nome: string;
  loja: string | null;
  cotacoes: number;
  encomendas: number;
  pecas: number;
  valor: number;
  conversao: number | null;
  canceladas: number;
  solicitacoes: number;
  retirada: number | null;
}

export interface LinhaDaPeca {
  codigo: string;
  marca: string | null;
  encomendas: number;
  pecas: number;
  valor: number;
  vendedores: number;
  fornecedores: string[];
  /** Encomendada 3+ vezes no período: candidata a estoque */
  recorrente: boolean;
}

export interface LinhaDaDemanda {
  codigo: string;
  /** Vezes que alguém cotou (vendedor e dia distintos) */
  procuras: number;
  vendedores: number;
  semEstoqueNosB2B: number;
  pedidaAoComprador: number;
  comprador: 'encontrou' | 'nao_encontrou' | 'aberta' | null;
}

export interface LinhaDoFornecedor {
  nome: string;
  encomendas: number;
  pecas: number;
  valor: number;
  custo: number | null;
  entrega: number | null;
  canceladasPorCompras: number;
  /** As que chegaram a ser pedidas ao fornecedor: a base da taxa de devolução */
  pedidas: number;
  /** Voltaram ao fornecedor: troca, devolvida, ou cliente que desistiu e Compras devolveu */
  devolvidas: number;
  /** devolvidas ÷ pedidas; nula sem pedido no período */
  taxaDeDevolucao: number | null;
  motivosDaDevolucao: Partial<Record<MotivoDaDevolucao, number>>;
}

export type MotivoDaDevolucao = 'errada' | 'faltou' | 'avariada' | 'preco' | 'outro' | 'desistencia';
export const ROTULO_DO_MOTIVO: Record<MotivoDaDevolucao, string> = {
  errada: 'peça errada',
  faltou: 'faltou peça',
  avariada: 'avariada',
  preco: 'preço',
  outro: 'outro',
  desistencia: 'cliente desistiu',
};

export interface LinhaDaLoja {
  loja: string;
  cotacoes: number;
  encomendas: number;
  valor: number;
}

export type TomDoInsight = 'gargalo' | 'estoque' | 'demanda' | 'fornecedor' | 'atencao' | 'positivo';
export interface Insight {
  tom: TomDoInsight;
  titulo: string;
  texto: string;
  /** Para onde levar quem quer agir */
  acao?: { rotulo: string; destino: 'pedidos_montar' | 'pedidos_chegada' | 'pedidos_conferencia' | 'solicitacoes' | 'historico' };
}

export interface EventoDaLinhaDoTempo {
  quando: string;
  tipo: 'cotacao' | 'solicitacao' | 'resposta' | 'encomenda' | 'pedido' | 'chegada' | 'recebida' | 'cancelada';
  texto: string;
}

export interface Relatorio {
  numeros: {
    cotacoes: number;
    pecasCotadas: number;
    encomendas: number;
    pecasEncomendadas: number;
    valor: number;
    custo: number | null;
    margem: number | null;
    conversao: number | null;
    canceladas: number;
    canceladasPeloVendedor: number;
    solicitacoes: number;
    naoEncontradas: number;
    total: number | null;
  };
  funil: { rotulo: string; n: number }[];
  etapas: Etapa[];
  gargalo: Etapa | null;
  vendedores: LinhaDoVendedor[];
  pecas: LinhaDaPeca[];
  demanda: LinhaDaDemanda[];
  fornecedores: LinhaDoFornecedor[];
  lojas: LinhaDaLoja[];
  insights: Insight[];
  linhaDoTempo: EventoDaLinhaDoTempo[];
  /** As opções dos filtros, do que veio no período */
  opcoes: { lojas: string[]; vendedores: { id: string; nome: string }[]; fornecedores: string[] };
}

/** Os limites de "parado": acima disto a peça está esperando demais (em horas). */
export const LIMITE_PARADA: Record<'pedido' | 'entrega' | 'retirada', number> = { pedido: 24, entrega: 5 * 24, retirada: 48 };

const somar = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;
const chaveCotacao = (vendedor: string | null, codigo: string, dia: string) => `${vendedor}|${codigo}|${dia}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * OS FILTROS, num lugar só (o relatório, a série por dia e a comparação usam
 * o mesmo recorte — os números sempre batem entre os widgets). Com filtro de
 * fornecedor, cotação e pedido ao comprador saem: não têm fornecedor escolhido.
 */
export const filtrarDados = (dados: DadosDoRelatorio, filtros: FiltrosDoRelatorio): DadosDoRelatorio => {
  const passa = (loja: string | null, vendedor: string | null) =>
    (!filtros.loja || loja === filtros.loja) && (!filtros.vendedor || vendedor === filtros.vendedor);
  return {
    cotacoes: dados.cotacoes.filter((c) => passa(c.loja, c.colaborador_id) && !filtros.fornecedor),
    solicitacoes: dados.solicitacoes.filter((s) => passa(s.loja, s.pedida_por) && !filtros.fornecedor),
    encomendas: dados.encomendas.filter((e) => passa(e.loja, e.vendedor_id) && (!filtros.fornecedor || e.fornecedor_nome === filtros.fornecedor)),
  };
};

/** O mesmo intervalo, logo antes: a base do "▲ 12% vs período anterior". */
export const intervaloAnterior = ({ de, ate }: { de: Date; ate: Date }): { de: Date; ate: Date } => ({
  de: new Date(de.getTime() - (ate.getTime() - de.getTime())),
  ate: de,
});

/** Um dia do período: o que alimenta o gráfico de colunas e os mini-gráficos dos números. */
export interface DiaDaSerie {
  dia: string; // AAAA-MM-DD
  cotacoes: number;
  encomendas: number;
  pecas: number;
  valor: number;
  canceladas: number;
}

/** Todos os dias do período, inclusive os vazios (um buraco no gráfico é informação: ninguém encomendou). */
export const serieDiaria = (dados: DadosDoRelatorio, filtros: FiltrosDoRelatorio, intervalo: { de: Date; ate: Date }): DiaDaSerie[] => {
  const { cotacoes, encomendas } = filtrarDados(dados, filtros);
  const dias: DiaDaSerie[] = [];
  for (let d = diaSP(intervalo.de); meiaNoite(d) < intervalo.ate; d = maisDias(d, 1)) {
    dias.push({ dia: d, cotacoes: 0, encomendas: 0, pecas: 0, valor: 0, canceladas: 0 });
  }
  const porDia = new Map(dias.map((x) => [x.dia, x]));
  for (const c of cotacoes) {
    const x = porDia.get(c.dia);
    if (x) x.cotacoes += 1;
  }
  for (const e of encomendas) {
    const x = porDia.get(diaSP(e.encomendada_em));
    if (!x) continue;
    if (e.situacao === 'cancelada') {
      x.canceladas += 1;
      continue;
    }
    x.encomendas += 1;
    x.pecas += e.quantidade;
    x.valor = Math.round((x.valor + (e.venda ?? 0) * e.quantidade) * 100) / 100;
  }
  return dias;
};

/**
 * A VARIAÇÃO contra o período anterior, já dizendo se é boa ou ruim: mais
 * valor é bom; mais tempo é ruim. Sem base (zero ou sem dado), não há
 * variação — mostrar "+∞%" engana.
 */
export interface Variacao {
  /** Fração: 0,12 = +12% */
  valor: number | null;
  sentido: 'sobe' | 'desce' | 'igual';
  bom: boolean | null;
}
export const variacao = (atual: number | null, anterior: number | null, maisEhMelhor: boolean): Variacao => {
  if (atual == null || anterior == null || anterior === 0) return { valor: null, sentido: 'igual', bom: null };
  const v = (atual - anterior) / Math.abs(anterior);
  if (Math.abs(v) < 0.005) return { valor: 0, sentido: 'igual', bom: null };
  const sentido = v > 0 ? 'sobe' : 'desce';
  return { valor: v, sentido, bom: (sentido === 'sobe') === maisEhMelhor };
};

/**
 * O custo da encomenda: (custo + frete) × quantidade (Elias, 26/10/2026: "a margem deve ser
 * multiplicada pelo total da peça + frete"). A venda já é (custo + frete) × fator: sem o frete
 * aqui, a margem saía maior que a real.
 */
export const custoDe = (e: Pick<JornadaDaEncomenda, 'custo' | 'frete' | 'quantidade'>): number => ((e.custo ?? 0) + (e.frete ?? 0)) * e.quantidade;

export const montarRelatorio = (dados: DadosDoRelatorio, filtros: FiltrosDoRelatorio = {}, agora: Date = new Date()): Relatorio => {
  // As opções dos filtros saem de TUDO o que veio (filtrar não some com as outras opções)
  const opcoes = {
    lojas: [...new Set([...dados.cotacoes.map((c) => c.loja), ...dados.encomendas.map((e) => e.loja)].filter(Boolean) as string[])].sort(),
    vendedores: [
      ...new Map(
        [
          ...dados.cotacoes.map((c) => [c.colaborador_id, c.nome ?? c.colaborador_id] as const),
          ...dados.encomendas.filter((e) => e.vendedor_id).map((e) => [e.vendedor_id!, e.nome_do_vendedor ?? e.vendedor_id!] as const),
        ]
      ).entries(),
    ]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    fornecedores: [...new Set(dados.encomendas.map((e) => e.fornecedor_nome))].sort(),
  };

  const { cotacoes, solicitacoes, encomendas } = filtrarDados(dados, filtros);
  // Com filtro de fornecedor, a cotação não tem fornecedor escolhido: as contas de cotação ficam de fora
  const comCotacoes = !filtros.fornecedor;

  const validas = encomendas.filter((e) => e.situacao !== 'cancelada');
  const canceladas = encomendas.filter((e) => e.situacao === 'cancelada');
  const valorDe = (e: JornadaDaEncomenda) => (e.venda ?? 0) * e.quantidade;
  const comCusto = validas.every((e) => e.custo != null) && validas.length > 0;

  // A conversão: das cotações (vendedor, peça, dia), quantas viraram encomenda do mesmo vendedor no mesmo dia
  const encomendadasNoDia = new Set(encomendas.map((e) => chaveCotacao(e.vendedor_id, e.codigo_cotado, diaSP(e.encomendada_em))));
  const convertidas = cotacoes.filter((c) => encomendadasNoDia.has(chaveCotacao(c.colaborador_id, c.codigo, c.dia))).length;

  // ---- O tempo de cada etapa ----
  const tempos = (f: (e: JornadaDaEncomenda) => number | null) => validas.map(f).filter((x): x is number => x != null);
  const t = {
    decisao: tempos((e) => (e.origem === 'b2b' ? horas(e.cotada_em, e.encomendada_em) : horas(e.respondida_em, e.encomendada_em))),
    resposta: solicitacoes.map((s) => horas(s.criada_em, s.respondida_em)).filter((x): x is number => x != null),
    pedido: tempos((e) => horas(e.encomendada_em, e.pedido_em)),
    entrega: tempos((e) => horas(e.pedido_em, e.conferencia_em)),
    retirada: tempos((e) => horas(e.conferencia_em, e.recebida_em)),
  };
  const agoraIso = agora.toISOString();
  const paradas = {
    pedido: validas.filter((e) => e.situacao === 'encomendada' && (horas(e.encomendada_em, agoraIso) ?? 0) > LIMITE_PARADA.pedido).length,
    entrega: validas.filter((e) => e.situacao === 'pedido_realizado' && (horas(e.pedido_em, agoraIso) ?? 0) > LIMITE_PARADA.entrega).length,
    retirada: validas.filter((e) => e.situacao === 'em_conferencia' && (horas(e.conferencia_em, agoraIso) ?? 0) > LIMITE_PARADA.retirada).length,
  };
  const etapa = (id: IdDaEtapa, nome: string, quem: string, v: number[], parada = 0): Etapa => ({
    id, nome, quem, mediana: mediana(v), p90: percentil(v, 0.9), n: v.length, paradas: parada,
  });
  const etapas: Etapa[] = [
    etapa('decisao', 'Da cotação à encomenda', 'vendedor decide com o cliente', t.decisao),
    etapa('resposta', 'Resposta do comprador', 'Compras cota fora do B2B', t.resposta),
    etapa('pedido', 'Espera pelo pedido', 'Compras fecha o pedido', t.pedido, paradas.pedido),
    etapa('entrega', 'Entrega do fornecedor', 'do pedido à chegada', t.entrega, paradas.entrega),
    etapa('retirada', 'Retirada pelo vendedor', 'da chegada ao "Recebi"', t.retirada, paradas.retirada),
  ];
  // O gargalo: a etapa operacional mais lenta (a decisão é do cliente, não do processo)
  const gargalo =
    etapas.filter((e) => e.id !== 'decisao' && e.mediana != null && e.n >= 1).sort((a, b) => (b.mediana ?? 0) - (a.mediana ?? 0))[0] ?? null;
  const totais = tempos((e) => horas(e.cotada_em ?? e.solicitada_em, e.recebida_em));

  // ---- Vendedores ----
  const porVendedor = new Map<string, LinhaDoVendedor>();
  const vendedor = (id: string | null, nome: string | null, loja: string | null) => {
    const chave = id ?? '—';
    if (!porVendedor.has(chave)) {
      porVendedor.set(chave, { id: chave, nome: nome ?? chave, loja, cotacoes: 0, encomendas: 0, pecas: 0, valor: 0, conversao: null, canceladas: 0, solicitacoes: 0, retirada: null });
    }
    return porVendedor.get(chave)!;
  };
  for (const c of cotacoes) vendedor(c.colaborador_id, c.nome, c.loja).cotacoes += 1;
  for (const s of solicitacoes) vendedor(s.pedida_por, s.nome, s.loja).solicitacoes += 1;
  for (const e of encomendas) {
    const v = vendedor(e.vendedor_id, e.nome_do_vendedor, e.loja);
    if (e.situacao === 'cancelada') {
      v.canceladas += 1;
      continue;
    }
    v.encomendas += 1;
    v.pecas += e.quantidade;
    v.valor = somar([v.valor, valorDe(e)]);
  }
  for (const v of porVendedor.values()) {
    const minhas = cotacoes.filter((c) => c.colaborador_id === v.id);
    v.conversao = comCotacoes && minhas.length ? minhas.filter((c) => encomendadasNoDia.has(chaveCotacao(c.colaborador_id, c.codigo, c.dia))).length / minhas.length : null;
    v.retirada = mediana(validas.filter((e) => e.vendedor_id === v.id).map((e) => horas(e.conferencia_em, e.recebida_em)).filter((x): x is number => x != null));
  }
  const vendedores = [...porVendedor.values()].sort((a, b) => b.valor - a.valor || b.encomendas - a.encomendas || b.cotacoes - a.cotacoes);

  // ---- Peças mais encomendadas ----
  const porPeca = new Map<string, { e: JornadaDaEncomenda[] }>();
  for (const e of validas) porPeca.set(e.codigo, { e: [...(porPeca.get(e.codigo)?.e ?? []), e] });
  const pecas: LinhaDaPeca[] = [...porPeca.entries()]
    .map(([codigo, { e }]) => ({
      codigo,
      marca: e.find((x) => x.marca)?.marca ?? null,
      encomendas: e.length,
      pecas: e.reduce((s, x) => s + x.quantidade, 0),
      valor: somar(e.map(valorDe)),
      vendedores: new Set(e.map((x) => x.vendedor_id)).size,
      fornecedores: [...new Set(e.map((x) => x.fornecedor_nome))],
      recorrente: e.length >= 3,
    }))
    .sort((a, b) => b.pecas - a.pecas || b.encomendas - a.encomendas);

  // ---- Demanda que não virou encomenda ----
  const codigosEncomendados = new Set(encomendas.map((e) => e.codigo_cotado));
  const porProcura = new Map<string, LinhaDaDemanda & { quem: Set<string> }>();
  const procura = (codigo: string) => {
    if (!porProcura.has(codigo)) porProcura.set(codigo, { codigo, procuras: 0, vendedores: 0, semEstoqueNosB2B: 0, pedidaAoComprador: 0, comprador: null, quem: new Set() });
    return porProcura.get(codigo)!;
  };
  for (const c of cotacoes) {
    if (codigosEncomendados.has(c.codigo)) continue;
    const d = procura(c.codigo);
    d.procuras += 1;
    d.quem.add(c.colaborador_id);
    if (c.situacao === 'SEM ESTOQUE') d.semEstoqueNosB2B += 1;
  }
  for (const s of solicitacoes) {
    if (codigosEncomendados.has(s.codigo)) continue;
    const d = procura(s.codigo);
    d.pedidaAoComprador += 1;
    if (s.pedida_por) d.quem.add(s.pedida_por);
    d.comprador = s.situacao === 'respondida' ? 'encontrou' : s.situacao === 'nao_encontrada' ? 'nao_encontrou' : 'aberta';
  }
  const demanda: LinhaDaDemanda[] = comCotacoes
    ? [...porProcura.values()]
        .map(({ quem, ...d }) => ({ ...d, vendedores: quem.size }))
        .sort((a, b) => b.procuras + b.pedidaAoComprador - (a.procuras + a.pedidaAoComprador) || b.vendedores - a.vendedores)
    : [];

  // ---- Fornecedores ----
  const porFornecedor = new Map<string, JornadaDaEncomenda[]>();
  for (const e of encomendas) porFornecedor.set(e.fornecedor_nome, [...(porFornecedor.get(e.fornecedor_nome) ?? []), e]);
  const fornecedores: LinhaDoFornecedor[] = [...porFornecedor.entries()]
    .map(([nome, lista]) => {
      const ok = lista.filter((e) => e.situacao !== 'cancelada');
      const devolvidas = lista.filter((e) => e.devolvida_em);
      return {
        nome,
        encomendas: ok.length,
        pecas: ok.reduce((s, e) => s + e.quantidade, 0),
        valor: somar(ok.map(valorDe)),
        custo: ok.length && ok.every((e) => e.custo != null) ? somar(ok.map(custoDe)) : null,
        entrega: mediana(ok.map((e) => horas(e.pedido_em, e.conferencia_em)).filter((x): x is number => x != null)),
        canceladasPorCompras: lista.filter((e) => e.situacao === 'cancelada' && e.cancelada_pelo_vendedor === false).length,
        // A devolução conta mesmo quando a encomenda terminou cancelada (devolvida sem reposição)
        pedidas: lista.filter((e) => e.pedido_em).length,
        devolvidas: devolvidas.length,
        taxaDeDevolucao: lista.some((e) => e.pedido_em) ? devolvidas.length / lista.filter((e) => e.pedido_em).length : null,
        motivosDaDevolucao: devolvidas.reduce<Partial<Record<MotivoDaDevolucao, number>>>((m, e) => {
          const k = e.motivo_devolucao ?? 'outro';
          return { ...m, [k]: (m[k] ?? 0) + 1 };
        }, {}),
      };
    })
    .sort((a, b) => b.valor - a.valor);

  // ---- Lojas ----
  const porLoja = new Map<string, LinhaDaLoja>();
  const loja = (l: string | null) => {
    const k = l ?? 'Sem loja';
    if (!porLoja.has(k)) porLoja.set(k, { loja: k, cotacoes: 0, encomendas: 0, valor: 0 });
    return porLoja.get(k)!;
  };
  for (const c of cotacoes) loja(c.loja).cotacoes += 1;
  for (const e of validas) {
    const l = loja(e.loja);
    l.encomendas += 1;
    l.valor = somar([l.valor, valorDe(e)]);
  }
  const lojas = [...porLoja.values()].sort((a, b) => b.valor - a.valor || b.cotacoes - a.cotacoes);

  // ---- Os números ----
  const valor = somar(validas.map(valorDe));
  const custo = comCusto ? somar(validas.map(custoDe)) : null;
  const numeros = {
    cotacoes: cotacoes.length,
    pecasCotadas: new Set(cotacoes.map((c) => c.codigo)).size,
    encomendas: validas.length,
    pecasEncomendadas: validas.reduce((s, e) => s + e.quantidade, 0),
    valor,
    custo,
    margem: custo == null ? null : somar([valor, -custo]),
    conversao: comCotacoes && cotacoes.length ? convertidas / cotacoes.length : null,
    canceladas: canceladas.length,
    canceladasPeloVendedor: canceladas.filter((e) => e.cancelada_pelo_vendedor).length,
    solicitacoes: solicitacoes.length,
    naoEncontradas: solicitacoes.filter((s) => s.situacao === 'nao_encontrada').length,
    total: mediana(totais),
  };

  const funil = [
    ...(comCotacoes ? [{ rotulo: 'Cotadas', n: cotacoes.length }] : []),
    { rotulo: 'Encomendadas', n: validas.length },
    { rotulo: 'Pedidas ao fornecedor', n: validas.filter((e) => e.pedido_em).length },
    { rotulo: 'Chegaram', n: validas.filter((e) => e.conferencia_em).length },
    { rotulo: 'Recebidas pelo vendedor', n: validas.filter((e) => e.recebida_em).length },
    // O fim do caminho (SPEC-comunicacao-recebimento): a peça na mão do cliente
    { rotulo: 'Entregues ao cliente', n: validas.filter((e) => e.entregue_em).length },
  ];

  // ---- O que os números dizem ----
  const insights: Insight[] = [];
  if (gargalo && gargalo.mediana != null) {
    const somaMedianas = etapas.filter((e) => e.id !== 'decisao').reduce((s, e) => s + (e.mediana ?? 0), 0);
    const parte = somaMedianas ? gargalo.mediana / somaMedianas : 0;
    insights.push({
      tom: 'gargalo',
      titulo: `Gargalo: ${gargalo.nome.toLowerCase()}`,
      texto: `Leva ${escreverTempo(gargalo.mediana)} (mediana)${parte >= 0.34 ? `, ${pct(parte)} do caminho da peça` : ''}; 9 em 10 levam até ${escreverTempo(gargalo.p90)}.`,
      acao:
        gargalo.id === 'pedido'
          ? { rotulo: 'Montar pedidos', destino: 'pedidos_montar' }
          : gargalo.id === 'entrega'
            ? { rotulo: 'Aguardando chegada', destino: 'pedidos_chegada' }
            : gargalo.id === 'retirada'
              ? { rotulo: 'Em conferência', destino: 'pedidos_conferencia' }
              : { rotulo: 'Solicitações', destino: 'solicitacoes' },
    });
  }
  if (paradas.retirada) {
    insights.push({
      tom: 'atencao',
      titulo: `${paradas.retirada} ${paradas.retirada === 1 ? 'peça chegou e não foi retirada' : 'peças chegaram e não foram retiradas'}`,
      texto: `Estão em conferência há mais de ${LIMITE_PARADA.retirada / 24} dias esperando o "Recebi" do vendedor.`,
      acao: { rotulo: 'Em conferência', destino: 'pedidos_conferencia' },
    });
  }
  if (paradas.pedido) {
    insights.push({
      tom: 'atencao',
      titulo: `${paradas.pedido} ${paradas.pedido === 1 ? 'encomenda espera' : 'encomendas esperam'} pedido há mais de 1 dia`,
      texto: 'Pode ser o pedido mínimo do fornecedor segurando; vale conferir se compensa fechar abaixo do mínimo.',
      acao: { rotulo: 'Montar pedidos', destino: 'pedidos_montar' },
    });
  }
  for (const p of pecas.filter((x) => x.recorrente).slice(0, 2)) {
    insights.push({
      tom: 'estoque',
      titulo: `${p.codigo}${p.marca ? ` ${p.marca}` : ''}: candidata a estoque`,
      texto: `Encomendada ${p.encomendas} vezes (${p.pecas} peças) por ${p.vendedores} ${p.vendedores === 1 ? 'vendedor' : 'vendedores'} no período. Ter em estoque evita a espera do cliente.`,
    });
  }
  for (const d of demanda.filter((x) => x.procuras + x.pedidaAoComprador >= 2).slice(0, 2)) {
    insights.push({
      tom: 'demanda',
      titulo: `${d.codigo}: procurada ${d.procuras + d.pedidaAoComprador} vezes, nenhuma encomenda`,
      texto: `${d.vendedores} ${d.vendedores === 1 ? 'vendedor procurou' : 'vendedores procuraram'}${d.semEstoqueNosB2B ? `; sem estoque nos B2Bs em ${d.semEstoqueNosB2B}` : ''}${d.comprador === 'nao_encontrou' ? '; nem o comprador encontrou' : ''}. Venda que pode estar escapando.`,
    });
  }
  const geralEntrega = mediana(t.entrega);
  const lento = fornecedores.filter((f) => f.entrega != null && f.encomendas >= 2).sort((a, b) => (b.entrega ?? 0) - (a.entrega ?? 0))[0];
  if (lento && geralEntrega != null && lento.entrega! > geralEntrega * 1.5 && fornecedores.length > 1) {
    insights.push({
      tom: 'fornecedor',
      titulo: `${lento.nome} entrega mais devagar`,
      texto: `${escreverTempo(lento.entrega)} do pedido à chegada, contra ${escreverTempo(geralEntrega)} no geral.`,
    });
  }
  const totalEncomendas = encomendas.length;
  if (totalEncomendas >= 5 && canceladas.length / totalEncomendas >= 0.15) {
    insights.push({
      tom: 'atencao',
      titulo: `${pct(canceladas.length / totalEncomendas)} das encomendas foram canceladas`,
      texto: `${numeros.canceladasPeloVendedor} pelo vendedor e ${canceladas.length - numeros.canceladasPeloVendedor} por Compras. Cancelamento depois de encomendar costuma ser cliente que desistiu na espera.`,
    });
  }
  const tempoResposta = mediana(t.resposta);
  if (tempoResposta != null) {
    insights.push({
      tom: tempoResposta > 4 ? 'atencao' : 'positivo',
      titulo: `Compras responde em ${escreverTempo(tempoResposta)}`,
      texto: `Mediana das ${t.resposta.length} solicitações respondidas${numeros.naoEncontradas ? `; ${numeros.naoEncontradas} sem fornecedor encontrado` : ''}.`,
      acao: { rotulo: 'Solicitações', destino: 'solicitacoes' },
    });
  }
  const comConversao = vendedores.filter((v) => v.conversao != null && v.cotacoes >= 5);
  const melhor = [...comConversao].sort((a, b) => (b.conversao ?? 0) - (a.conversao ?? 0))[0];
  // Só quando alguém se destaca de verdade: elogiar a média não diz nada
  if (comConversao.length >= 2 && numeros.conversao != null && (melhor.conversao ?? 0) >= numeros.conversao * 1.2 && (melhor.conversao ?? 0) > 0) {
    insights.push({
      tom: 'positivo',
      titulo: `${melhor.nome} converte ${pct(melhor.conversao!)} das cotações`,
      texto: `A maior taxa entre quem cotou 5 vezes ou mais no período (média geral ${numeros.conversao != null ? pct(numeros.conversao) : '—'}).`,
    });
  }

  // ---- A linha do tempo do período ----
  const linhaDoTempo: EventoDaLinhaDoTempo[] = [];
  const peca = (e: JornadaDaEncomenda) => `${e.quantidade}× ${e.codigo} · ${e.fornecedor_nome}`;
  const quem = (e: JornadaDaEncomenda) => e.nome_do_vendedor ?? 'Vendedor';
  for (const e of encomendas) {
    linhaDoTempo.push({ quando: e.encomendada_em, tipo: 'encomenda', texto: `${quem(e)} encomendou ${peca(e)}` });
    if (e.pedido_em) linhaDoTempo.push({ quando: e.pedido_em, tipo: 'pedido', texto: `Pedido realizado: ${peca(e)}` });
    if (e.conferencia_em) linhaDoTempo.push({ quando: e.conferencia_em, tipo: 'chegada', texto: `Chegou: ${peca(e)}` });
    if (e.recebida_em) linhaDoTempo.push({ quando: e.recebida_em, tipo: 'recebida', texto: `${quem(e)} recebeu ${peca(e)}` });
    if (e.cancelada_em) {
      linhaDoTempo.push({
        quando: e.cancelada_em,
        tipo: 'cancelada',
        texto: e.cancelada_pelo_vendedor ? `${quem(e)} cancelou ${peca(e)}` : `Compras cancelou ${peca(e)}`,
      });
    }
  }
  for (const s of solicitacoes) {
    linhaDoTempo.push({ quando: s.criada_em, tipo: 'solicitacao', texto: `${s.nome ?? 'Vendedor'} pediu ao comprador: ${s.codigo}` });
    if (s.respondida_em) {
      linhaDoTempo.push({
        quando: s.respondida_em,
        tipo: 'resposta',
        texto: s.situacao === 'nao_encontrada' ? `${s.nome_de_quem_respondeu ?? 'Compras'} não encontrou ${s.codigo}` : `${s.nome_de_quem_respondeu ?? 'Compras'} respondeu ${s.codigo} (${s.opcoes} ${s.opcoes === 1 ? 'opção' : 'opções'})`,
      });
    }
  }
  linhaDoTempo.sort((a, b) => b.quando.localeCompare(a.quando));

  return { numeros, funil, etapas, gargalo, vendedores, pecas, demanda, fornecedores, lojas, insights, linhaDoTempo, opcoes };
};

// ------------------------------------------------------------
// A PLANILHA (Excel): as mesmas tabelas da tela, e a jornada de cada encomenda
// ------------------------------------------------------------

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const h1 = (de: string | null, ate: string | null) => {
  const v = horas(de, ate);
  return v == null ? '' : Math.round(v * 10) / 10;
};

/** As abas da planilha, como linhas (a primeira é o cabeçalho). Sem dependência: a tela gera o .xlsx. */
/** "2 avariada · 1 cliente desistiu": do mais frequente */
export const motivosEmTexto = (m: Partial<Record<MotivoDaDevolucao, number>>): string =>
  (Object.entries(m) as [MotivoDaDevolucao, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${ROTULO_DO_MOTIVO[k]}`)
    .join(' · ');

export const abasDaPlanilha = (r: Relatorio, dados: DadosDoRelatorio, mostraCusto: boolean, periodo: string): Record<string, (string | number)[][]> => ({
  Resumo: [
    ['Relatório do cotador', periodo],
    [],
    ['Cotações', r.numeros.cotacoes],
    ['Peças diferentes cotadas', r.numeros.pecasCotadas],
    ['Encomendas', r.numeros.encomendas],
    ['Peças encomendadas', r.numeros.pecasEncomendadas],
    ['Valor de venda encomendado (R$)', r.numeros.valor],
    ...(mostraCusto && r.numeros.custo != null ? [['Custo (R$)', r.numeros.custo], ['Margem bruta (R$)', r.numeros.margem ?? '']] : []),
    ['Conversão (cotação → encomenda)', r.numeros.conversao == null ? '' : `${Math.round(r.numeros.conversao * 100)}%`],
    ['Canceladas', r.numeros.canceladas],
    ['Solicitações ao comprador', r.numeros.solicitacoes],
    ['Não encontradas pelo comprador', r.numeros.naoEncontradas],
    ['Tempo total, da cotação à entrega (mediana)', escreverTempo(r.numeros.total)],
    [],
    ['O que os números dizem'],
    ...r.insights.map((i) => [i.titulo, i.texto]),
  ],
  Etapas: [
    ['Etapa', 'Quem', 'Mediana', '9 em 10 até', 'Encomendas medidas', 'Paradas agora'],
    ...r.etapas.map((e) => [e.nome, e.quem, escreverTempo(e.mediana), escreverTempo(e.p90), e.n, e.paradas]),
  ],
  Vendedores: [
    ['Vendedor', 'Loja', 'Cotações', 'Encomendas', 'Peças', 'Valor (R$)', 'Conversão', 'Canceladas', 'Pedidos ao comprador', 'Retirada (mediana)'],
    ...r.vendedores.map((v) => [v.nome, v.loja ?? '', v.cotacoes, v.encomendas, v.pecas, v.valor, v.conversao == null ? '' : `${Math.round(v.conversao * 100)}%`, v.canceladas, v.solicitacoes, escreverTempo(v.retirada)]),
  ],
  'Peças encomendadas': [
    ['Código', 'Marca', 'Encomendas', 'Peças', 'Valor (R$)', 'Vendedores', 'Fornecedores', 'Candidata a estoque'],
    ...r.pecas.map((p) => [p.codigo, p.marca ?? '', p.encomendas, p.pecas, p.valor, p.vendedores, p.fornecedores.join(', '), p.recorrente ? 'sim' : '']),
  ],
  'Procuradas sem encomenda': [
    ['Código', 'Cotações', 'Vendedores', 'Sem estoque nos B2Bs', 'Pedidas ao comprador', 'Comprador'],
    ...r.demanda.map((d) => [d.codigo, d.procuras, d.vendedores, d.semEstoqueNosB2B, d.pedidaAoComprador, d.comprador === 'nao_encontrou' ? 'não encontrou' : d.comprador ?? '']),
  ],
  Fornecedores: [
    ['Fornecedor', 'Encomendas', 'Peças', 'Valor (R$)', ...(mostraCusto ? ['Custo (R$)'] : []), 'Entrega (mediana)', 'Canceladas por Compras', 'Pedidas', 'Devolvidas', 'Taxa de devolução', 'Motivos'],
    ...r.fornecedores.map((f) => [f.nome, f.encomendas, f.pecas, f.valor, ...(mostraCusto ? [f.custo ?? ''] : []), escreverTempo(f.entrega), f.canceladasPorCompras,
      f.pedidas, f.devolvidas, f.taxaDeDevolucao == null ? '' : Math.round(f.taxaDeDevolucao * 1000) / 10 + '%', motivosEmTexto(f.motivosDaDevolucao)]),
  ],
  Lojas: [['Loja', 'Cotações', 'Encomendas', 'Valor (R$)'], ...r.lojas.map((l) => [l.loja, l.cotacoes, l.encomendas, l.valor])],
  'Jornada das encomendas': [
    [
      'Vendedor', 'Loja', 'Peça', 'Cotada como', 'Origem', 'Fornecedor', 'Marca', 'Qtd', 'Venda (R$)', ...(mostraCusto ? ['Custo (R$)'] : []), 'Situação',
      'Cotada em', 'Pedida ao comprador em', 'Respondida em', 'Encomendada em', 'Pedido em', 'Chegou em', 'Recebida em', 'Cancelada em', 'Cancelada por',
      'Decisão (h)', 'Espera pelo pedido (h)', 'Entrega do fornecedor (h)', 'Retirada (h)', 'Total (h)',
    ],
    ...dados.encomendas.map((e) => [
      e.nome_do_vendedor ?? '', e.loja ?? '', e.codigo, e.codigo_cotado, e.origem === 'b2b' ? 'B2B' : 'Comprador', e.fornecedor_nome, e.marca ?? '', e.quantidade,
      e.venda ?? '', ...(mostraCusto ? [e.custo ?? ''] : []), e.situacao.replace('_', ' '),
      dataHora(e.cotada_em), dataHora(e.solicitada_em), dataHora(e.respondida_em), dataHora(e.encomendada_em), dataHora(e.pedido_em), dataHora(e.conferencia_em),
      dataHora(e.recebida_em), dataHora(e.cancelada_em), e.cancelada_em ? (e.cancelada_pelo_vendedor ? 'vendedor' : 'Compras') : '',
      h1(e.origem === 'b2b' ? e.cotada_em : e.respondida_em, e.encomendada_em), h1(e.encomendada_em, e.pedido_em), h1(e.pedido_em, e.conferencia_em),
      h1(e.conferencia_em, e.recebida_em), h1(e.cotada_em ?? e.solicitada_em, e.recebida_em),
    ]),
  ],
  Cotações: [
    ['Dia', 'Vendedor', 'Loja', 'Código', 'Vezes no dia', 'Resultado', 'Melhor fornecedor', 'Venda (R$)', 'Similares'],
    ...dados.cotacoes.map((c) => [c.dia.split('-').reverse().join('/'), c.nome ?? '', c.loja ?? '', c.codigo, c.vezes, c.situacao, c.fornecedor ?? '', c.venda ?? '', c.similares ?? '']),
  ],
  'Pedidos ao comprador': [
    ['Pedida em', 'Vendedor', 'Loja', 'Código', 'Situação', 'Respondida em', 'Por', 'Opções', 'Tempo de resposta (h)'],
    ...dados.solicitacoes.map((s) => [dataHora(s.criada_em), s.nome ?? '', s.loja ?? '', s.codigo, s.situacao.replace('_', ' '), dataHora(s.respondida_em), s.nome_de_quem_respondeu ?? '', s.opcoes, h1(s.criada_em, s.respondida_em)]),
  ],
});

export const relatoriosPeloSupabase = (supabase: SupabaseClient) => ({
  async carregar(de: Date, ate: Date): Promise<DadosDoRelatorio> {
    const p = { de: de.toISOString(), ate: ate.toISOString() };
    const ler = <T,>(funcao: string, teto: number) => lerEmPaginas<T>((de, ate) => supabase.rpc(funcao, p).range(de, ate), teto);
    const [c, s, e] = await Promise.all([
      ler<CotacaoDoPeriodo>('cotacoes_do_periodo', TETO_DE_LINHAS.cotacoes),
      ler<SolicitacaoDoPeriodo>('solicitacoes_do_periodo', TETO_DE_LINHAS.solicitacoes),
      ler<JornadaDaEncomenda>('jornada_das_encomendas', TETO_DE_LINHAS.encomendas),
    ]);
    return {
      cotacoes: numeros(c, ['venda', 'vezes', 'similares']),
      solicitacoes: s,
      encomendas: numeros(e, ['venda', 'custo', 'frete', 'quantidade']),
      incompleto: c.length >= TETO_DE_LINHAS.cotacoes || s.length >= TETO_DE_LINHAS.solicitacoes || e.length >= TETO_DE_LINHAS.encomendas,
    };
  },
});

