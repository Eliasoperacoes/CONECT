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
}

export interface OpcaoDoComprador {
  fornecedor: string;
  marca: string | null;
  venda: number;
  /** Nulo para quem não vê custo (o banco nem manda) ou quando o comprador não informou. */
  custo: number | null;
  prazo: string | null;
  observacao: string | null;
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
      });
    }
  }
  for (const s of porId.values()) s.opcoes.sort((a, b) => a.venda - b.venda);
  return [...porId.values()];
};

/** "89,90" / "R$ 89,90" / "89.9" → 89.9; vazio, zero ou ilegível → null. */
export const lerValor = (texto: string): number | null => {
  const limpo = texto.replace(/R\$|\s/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const n = Number(limpo);
  return n > 0 ? n : null;
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * A MENSAGEM QUE VAI PELO CHAT ao vendedor (o lembrete contra o
 * esquecimento). NUNCA leva o custo: conversa de chat se encaminha.
 */
export const mensagemParaOChat = (s: Pick<Solicitacao, 'codigo' | 'veiculo' | 'situacao' | 'motivo'>, opcoes: Pick<OpcaoDoComprador, 'fornecedor' | 'marca' | 'venda' | 'prazo'>[]): string => {
  const peca = `peça ${s.codigo}${s.veiculo ? ` (${s.veiculo})` : ''}`;
  if (s.situacao === 'nao_encontrada') {
    return `Cotação da ${peca}: não encontrei.${s.motivo ? ` ${s.motivo}` : ''}`;
  }
  const linhas = opcoes.map(
    (o) => `• ${o.fornecedor}${o.marca ? ` (${o.marca})` : ''}: ${brl(o.venda)}${o.prazo ? ` · ${o.prazo}` : ''}`
  );
  return [`Cotação da ${peca}:`, ...linhas, 'Detalhes em Ferramentas › Cotação de peças.'].join('\n');
};

export type RegistroDaSolicitacao = { situacao?: string; codigo?: string; pedida_por?: string | null; vista_em?: string | null };
export type MudancaNaSolicitacao = { tipo: 'nova' | 'respondida'; codigo: string; pedidaPor: string | null };

/**
 * O QUE MERECE AVISO numa mudança do banco: a solicitação nova (para
 * Compras) e a resposta (para o vendedor). Abrir o resultado também muda a
 * linha (a marca de "vista") — e isso NÃO é resposta nova: sem este
 * filtro, o vendedor seria avisado de novo ao ler.
 */
export const interpretarMudanca = (evento: string, nova: RegistroDaSolicitacao): MudancaNaSolicitacao | null => {
  if (!nova.codigo) return null;
  if (evento === 'INSERT') return { tipo: 'nova', codigo: nova.codigo, pedidaPor: nova.pedida_por ?? null };
  if (evento === 'UPDATE' && nova.situacao && nova.situacao !== 'aberta' && !nova.vista_em)
    return { tipo: 'respondida', codigo: nova.codigo, pedidaPor: nova.pedida_por ?? null };
  return null;
};

export const cotacaoHumanaPeloSupabase = (supabase: SupabaseClient) => ({
  async pedir(codigo: string, veiculo: string, observacao: string): Promise<string> {
    const { data, error } = await supabase.rpc('pedir_ao_comprador', { codigo, veiculo, observacao });
    if (error) throw error;
    return data as string;
  },
  /** As da pessoa (vendedor) ou todas (Compras): abertas, e as dos últimos 7 dias. */
  async listar(codigo?: string): Promise<Solicitacao[]> {
    const { data, error } = await supabase.rpc('solicitacoes_de_cotacao', { codigo: codigo ?? null });
    if (error) throw error;
    return juntarSolicitacoes((data ?? []) as LinhaDaSolicitacao[]);
  },
  async responder(solicitacao: string, resposta: { opcoes: OpcaoDoComprador[] } | { naoEncontrei: string }): Promise<void> {
    const naoEncontrei = 'naoEncontrei' in resposta;
    const { error } = await supabase.rpc('responder_solicitacao', {
      solicitacao,
      opcoes: naoEncontrei ? null : resposta.opcoes,
      nao_encontrei: naoEncontrei,
      motivo: naoEncontrei ? resposta.naoEncontrei : null,
    });
    if (error) throw error;
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
