/**
 * HISTÓRICO DE COTAÇÃO (docs/cotador/SPEC-historico.md, Elias 21/10/2026)
 *
 * Tudo o que foi cotado nos B2Bs (a foto do preço da hora) e pedido ao
 * comprador, guardado para sempre. Quem vê de quem, o custo e a foto são do
 * banco (historico_de_cotacao, registrar_consulta); aqui só se pede e se
 * organiza para a tela.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type TipoDaLinha = 'b2b' | 'comprador';

export interface LinhaDoHistorico {
  tipo: TipoDaLinha;
  id: string;
  quando: string;
  codigo: string;
  /** B2B: SP / FORA DO ESTADO / SEM ESTOQUE · comprador: aberta / respondida / nao_encontrada */
  situacao: string;
  fornecedor: string | null;
  venda: number | null;
  /** Nulo para quem não vê custo */
  custo: number | null;
  prazo: string | null;
  similares: number | null;
  /** Quantas opções o comprador deu */
  opcoes: number | null;
  veiculo: string | null;
  observacao: string | null;
  colaboradorId: string | null;
  nome: string | null;
  loja: string | null;
  respondidaPor: string | null;
  respondidaEm: string | null;
}

export interface FiltrosDoHistorico {
  de?: string | null;
  ate?: string | null;
  codigo?: string | null;
  tipo?: TipoDaLinha | null;
  situacao?: string | null;
  vendedor?: string | null;
  loja?: string | null;
}

/** "AAAA-MM-DD" de Brasília, N dias atrás (0 = hoje): os atalhos de período da tela. */
export const diaDeBrasilia = (diasAtras = 0, agora: Date = new Date()): string => {
  const d = new Date(agora.getTime() - diasAtras * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
};

export type Periodo = 'hoje' | '7dias' | '30dias' | 'tudo';
export const filtroDoPeriodo = (p: Periodo, agora: Date = new Date()): Pick<FiltrosDoHistorico, 'de' | 'ate'> =>
  p === 'tudo'
    ? { de: null, ate: null }
    : { de: diaDeBrasilia(p === 'hoje' ? 0 : p === '7dias' ? 6 : 29, agora), ate: diaDeBrasilia(0, agora) };

/** As que ainda esperam alguém: o pedido ao comprador sem resposta. */
export const aguardando = (l: LinhaDoHistorico): boolean => l.tipo === 'comprador' && l.situacao === 'aberta';

type Bruta = {
  tipo_linha: TipoDaLinha; id: string; quando: string; codigo_peca: string; situacao_linha: string;
  fornecedor: string | null; venda: number | string | null; custo: number | string | null; prazo: string | null;
  similares: number | null; opcoes: number | null; veiculo: string | null; observacao: string | null;
  colaborador_id: string | null; nome: string | null; loja_linha: string | null;
  respondida_por: string | null; respondida_em: string | null;
};

const numero = (v: number | string | null): number | null => (v == null ? null : Number(v));

export const historicoPeloSupabase = (supabase: SupabaseClient) => ({
  async listar(f: FiltrosDoHistorico = {}): Promise<LinhaDoHistorico[]> {
    const { data, error } = await supabase.rpc('historico_de_cotacao', {
      de: f.de ?? null,
      ate: f.ate ?? null,
      codigo: f.codigo ?? null,
      tipo: f.tipo ?? null,
      situacao: f.situacao ?? null,
      vendedor: f.vendedor ?? null,
      loja: f.loja ?? null,
    });
    if (error) throw error;
    return ((data ?? []) as Bruta[]).map((b) => ({
      tipo: b.tipo_linha,
      id: b.id,
      quando: b.quando,
      codigo: b.codigo_peca,
      situacao: b.situacao_linha,
      fornecedor: b.fornecedor,
      venda: numero(b.venda),
      custo: numero(b.custo),
      prazo: b.prazo,
      similares: b.similares,
      opcoes: b.opcoes,
      veiculo: b.veiculo,
      observacao: b.observacao,
      colaboradorId: b.colaborador_id,
      nome: b.nome,
      loja: b.loja_linha,
      respondidaPor: b.respondida_por,
      respondidaEm: b.respondida_em,
    }));
  },
  /** A foto do resultado que o vendedor acabou de ver. Falhar não atrapalha a cotação. */
  async registrarConsulta(codigo: string): Promise<void> {
    const { error } = await supabase.rpc('registrar_consulta', { codigo });
    if (error) throw error;
  },
});
