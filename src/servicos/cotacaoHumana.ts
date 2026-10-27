/**
 * COTAÇÃO HUMANA (docs/cotador/SPEC-cotacao-humana.md, Elias 21/10/2026)
 *
 * O B2B não tem a peça, ou o cliente não quer o similar: o vendedor pede ao
 * comprador, que cota por fora e responde com a venda (já com frete e
 * margem), o custo opcional e o prazo. Quem pode pedir, responder e ver o
 * custo mora no banco; aqui se organiza o que chega e se monta a mensagem
 * do chat — que nunca leva o custo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { avisarRecados } from './recados';

/** Uma linha de `solicitacoes_de_cotacao`: a solicitação e uma opção de resposta (ou nenhuma). */
export interface LinhaDaSolicitacao {
  id: string;
  codigo_peca: string;
  veiculo: string | null;
  observacao: string | null;
  situacao: 'aberta' | 'respondida' | 'nao_encontrada';
  motivo: string | null;
  pedida_por: string | null;
  nome_de_quem_pediu: string | null;
  loja: string | null;
  criada_em: string;
  respondida_por: string | null;
  nome_de_quem_respondeu: string | null;
  respondida_em: string | null;
  vista_em: string | null;
  fornecedor: string | null;
  marca: string | null;
  venda: number | null;
  custo: number | null;
  prazo: string | null;
  observacao_da_resposta: string | null;
  resposta_id: string | null;
}

export interface OpcaoDoComprador {
  fornecedor: string;
  marca: string | null;
  venda: number;
  /** Nulo para quem não vê custo (o banco nem manda) ou quando o comprador não informou. */
  custo: number | null;
  prazo: string | null;
  observacao: string | null;
  /** A resposta gravada (o que o vendedor encomenda); ausente no formulário do comprador */
  respostaId?: string;
}

export interface Solicitacao {
  id: string;
  codigo: string;
  veiculo: string | null;
  observacao: string | null;
  situacao: LinhaDaSolicitacao['situacao'];
  motivo: string | null;
  pedidaPor: string | null;
  nomeDeQuemPediu: string | null;
  loja: string | null;
  criadaEm: string;
  nomeDeQuemRespondeu: string | null;
  respondidaEm: string | null;
  vistaEm: string | null;
  /** Da mais barata para a mais cara */
  opcoes: OpcaoDoComprador[];
}

/**
 * Na tela de COTAR, só as solicitações de quem está cotando (Elias,
 * 26/10/2026). Compras e TI recebem todas do banco — é a fila deles —, mas no
 * cartão da peça a de outro vendedor aparecia como "aguardando comprador".
 */
export const soAsMinhas = (solicitacoes: Solicitacao[], eu: string): Solicitacao[] => solicitacoes.filter((s) => s.pedidaPor === eu);

/**
 * A solicitação de cada código que o cartão mostra: a minha ABERTA, se
 * houver (senão o vendedor não vê "aguardando" e pede de novo); senão a
 * mais recente. O banco ordena as abertas primeiro — a última da lista não
 * é a mais nova.
 */
export const daVezPorCodigo = (solicitacoes: Solicitacao[], eu: string): Record<string, Solicitacao> => {
  const porCodigo: Record<string, Solicitacao> = {};
  for (const s of soAsMinhas(solicitacoes, eu)) {
    const atual = porCodigo[s.codigo];
    const melhor =
      !atual ||
      (s.situacao === 'aberta') !== (atual.situacao === 'aberta')
        ? !atual || s.situacao === 'aberta'
        : s.criadaEm > atual.criadaEm;
    if (melhor) porCodigo[s.codigo] = s;
  }
  return porCodigo;
};

/**
 * Ao reler as solicitações (abertas e dos últimos 7 dias), as que a tela
 * abriu pelo Histórico — mais antigas — continuam no cartão: sem isto, o
 * bloco do comprador, com o Encomendar da resposta, sumia na primeira releitura.
 */
export const mesclarSolicitacoes = (
  anteriores: Record<string, Solicitacao>,
  relidas: Record<string, Solicitacao>
): Record<string, Solicitacao> => {
  const ficam = Object.fromEntries(Object.entries(anteriores).filter(([codigo]) => !(codigo in relidas)));
  return { ...ficam, ...relidas };
};

/** As linhas do banco (uma por opção) → uma solicitação com as opções dentro. */
export const juntarSolicitacoes = (linhas: LinhaDaSolicitacao[]): Solicitacao[] => {
  const porId = new Map<string, Solicitacao>();
  for (const l of linhas) {
    let s = porId.get(l.id);
    if (!s) {
      s = {
        id: l.id,
        codigo: l.codigo_peca,
        veiculo: l.veiculo,
        observacao: l.observacao,
        situacao: l.situacao,
        motivo: l.motivo,
        pedidaPor: l.pedida_por,
        nomeDeQuemPediu: l.nome_de_quem_pediu,
        loja: l.loja,
        criadaEm: l.criada_em,
        nomeDeQuemRespondeu: l.nome_de_quem_respondeu,
        respondidaEm: l.respondida_em,
        vistaEm: l.vista_em,
        opcoes: [],
      };
      porId.set(l.id, s);
    }
    if (l.fornecedor && l.venda != null) {
      s.opcoes.push({
        fornecedor: l.fornecedor,
        marca: l.marca,
        venda: Number(l.venda),
        custo: l.custo == null ? null : Number(l.custo),
        prazo: l.prazo,
        observacao: l.observacao_da_resposta,
        ...(l.resposta_id ? { respostaId: l.resposta_id } : {}),
      });
    }
  }
  for (const s of porId.values()) s.opcoes.sort((a, b) => a.venda - b.venda);
  return [...porId.values()];
};

/**
 * O NÚMERO NA ABA E NO BLOCO: o que espera esta pessoa.
 *   · comprador: as solicitações abertas (de qualquer vendedor);
 *   · vendedor: as respostas às dele que ele ainda não viu.
 */
export const pendenciasDoCotador = (lista: Solicitacao[], eu: string, comprador: boolean) => ({
  solicitacoes: comprador ? lista.filter((s) => s.situacao === 'aberta').length : 0,
  respostas: lista.filter((s) => s.pedidaPor === eu && s.situacao !== 'aberta' && !s.vistaEm).length,
});

/** "89,90" / "R$ 89,90" / "89.9" → 89.9; vazio, zero ou ilegível → null. */
export const lerValor = (texto: string): number | null => {
  const limpo = texto.replace(/R\$|\s/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const n = Number(limpo);
  return n > 0 ? n : null;
};

export type RegistroDaSolicitacao = { situacao?: string; codigo?: string; pedida_por?: string | null; vista_em?: string | null };
export type MudancaNaSolicitacao = { tipo: 'nova' | 'respondida' | 'vista'; codigo: string; pedidaPor: string | null };

/**
 * O QUE MERECE AVISO numa mudança do banco: a solicitação nova (para
 * Compras) e a resposta (para o vendedor). Abrir o resultado também muda a
 * linha (a marca de "vista") — e isso NÃO é resposta nova: sem este
 * filtro, o vendedor seria avisado de novo ao ler. Ela vem como "vista",
 * para os números das abas baixarem.
 */
export const interpretarMudanca = (evento: string, nova: RegistroDaSolicitacao): MudancaNaSolicitacao | null => {
  if (!nova.codigo) return null;
  if (evento === 'INSERT') return { tipo: 'nova', codigo: nova.codigo, pedidaPor: nova.pedida_por ?? null };
  if (evento === 'UPDATE' && nova.situacao && nova.situacao !== 'aberta' && !nova.vista_em)
    return { tipo: 'respondida', codigo: nova.codigo, pedidaPor: nova.pedida_por ?? null };
  if (evento === 'UPDATE' && nova.vista_em) return { tipo: 'vista', codigo: nova.codigo, pedidaPor: nova.pedida_por ?? null };
  return null;
};

export const cotacaoHumanaPeloSupabase = (supabase: SupabaseClient) => ({
  async pedir(codigo: string, veiculo: string, observacao: string): Promise<string> {
    const { data, error } = await supabase.rpc('pedir_ao_comprador', { codigo, veiculo, observacao });
    if (error) throw error;
    // Compras recebe o recado da cotação pedida: o banco o grava com o id 'rec-' + a solicitação
    void avisarRecados(supabase, [`rec-${data as string}`]);
    return data as string;
  },
  /** As da pessoa (vendedor) ou todas (Compras): abertas, e as dos últimos 7 dias. */
  async listar(codigo?: string): Promise<Solicitacao[]> {
    const { data, error } = await supabase.rpc('solicitacoes_de_cotacao', { codigo: codigo ?? null });
    if (error) throw error;
    return juntarSolicitacoes((data ?? []) as LinhaDaSolicitacao[]);
  },
  /** O banco escreve o recado ao vendedor (com o botão "Abrir cotação"); aqui, a notificação no celular. */
  async responder(solicitacao: string, resposta: { opcoes: OpcaoDoComprador[] } | { naoEncontrei: string }): Promise<void> {
    const naoEncontrei = 'naoEncontrei' in resposta;
    const { data, error } = await supabase.rpc('responder_solicitacao', {
      solicitacao,
      opcoes: naoEncontrei ? null : resposta.opcoes,
      nao_encontrei: naoEncontrei,
      motivo: naoEncontrei ? resposta.naoEncontrei : null,
    });
    if (error) throw error;
    void avisarRecados(supabase, [data as string | null]);
  },
  async marcarVista(solicitacao: string): Promise<void> {
    const { error } = await supabase.rpc('marcar_solicitacao_vista', { solicitacao });
    if (error) throw error;
  },
  /**
   * Avisa a cada solicitação nova ou respondida, em tempo real. A regra de
   * leitura vale: o vendedor só recebe as dele; Compras, todas.
   */
  ouvir(aoMudar: (mudanca: MudancaNaSolicitacao) => void): () => void {
    const canal = supabase
      // Um canal por escuta: a tela Cotar, o painel do comprador e o aviso ouvem ao mesmo tempo
      .channel(`solicitacoes-de-cotacao-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_cotacao' }, (m) => {
        const mudanca = interpretarMudanca(m.eventType, (m.new ?? {}) as RegistroDaSolicitacao);
        if (mudanca) aoMudar(mudanca);
      })
      .subscribe();
    return () => void supabase.removeChannel(canal);
  },
});
