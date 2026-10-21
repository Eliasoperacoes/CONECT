/**
 * FRETE POR PEÇA DOS FORNECEDORES B2B (Elias, 21/10/2026).
 *
 * Venda = (custo + frete) × fator. O frete é um valor fixo por peça para quem
 * não dá frete grátis (partida: DPK e Pellegrino R$ 10; Roles grátis), e
 * Compras altera pela ferramenta "Fretes". A conta mora no banco
 * (resultado_da_cotacao); quem altera e os limites também (alterar_frete).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FreteDoFornecedor {
  chave: string;
  nome: string;
  frete_por_peca: number;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

/** "10", "10,00", "R$ 7,50" → 10 / 7.5; vazio, negativo ou acima de R$ 500 → null. */
export const lerFrete = (texto: string): number | null => {
  const limpo = texto.replace(/R\$|\s/gi, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const n = Number(limpo);
  return n <= 500 ? n : null;
};

export const fretesPeloSupabase = (supabase: SupabaseClient) => ({
  async listar(): Promise<FreteDoFornecedor[]> {
    const { data, error } = await supabase.rpc('fretes_dos_fornecedores');
    if (error) throw error;
    return ((data ?? []) as FreteDoFornecedor[]).map((f) => ({ ...f, frete_por_peca: Number(f.frete_por_peca) }));
  },
  async alterar(fornecedor: string, valor: number): Promise<void> {
    const { error } = await supabase.rpc('alterar_frete', { fornecedor, valor });
    if (error) throw error;
  },
});
