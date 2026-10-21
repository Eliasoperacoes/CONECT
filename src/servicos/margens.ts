/**
 * MARGENS POR MARCA DO COTADOR (docs/cotador/SPEC-precificacao.md)
 *
 * Venda = custo × fator da marca, arredondada para cima em ,90. A conta, a
 * validação e o "como o B2B escreve a marca" moram no banco
 * (supabase/cotador-precificacao.sql); aqui só se lê e se pede para gravar,
 * para nenhuma regra existir duas vezes.
 *
 * Quem mexe: Gerente para cima (nível ≥ 3), a mesma regra do banco.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NIVEL_GERENTE } from '../tipos';

export const MARCA_PADRAO = '(PADRÃO)';
export const FATOR_MINIMO = 1;
export const FATOR_MAXIMO = 5;

export interface FatorDaMarca {
  marca: string;
  /** O tipo de peça, quando a mesma marca tem fatores diferentes (ISAPA: PISTÃO). Vazio quando não tem. */
  variante: string;
  fator: number;
  atualizado_em: string;
}

export interface MarcaSemMargem {
  marca: string;
  vezes: number;
}

export interface Apelido {
  apelido: string;
  marca: string;
}

/** Cuida das margens? Par de `meu_nivel() >= 3` nas regras de escrita do banco. */
export const cuidaDasMargens = (c: { nivel: number }): boolean => c.nivel >= NIVEL_GERENTE;

/** "1,83" ou "1.83" → 1.83; fora de 1,00 a 5,00 ou ilegível → null. */
export const lerFator = (texto: string): number | null => {
  const limpo = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const n = Number(limpo);
  return n >= FATOR_MINIMO && n <= FATOR_MAXIMO ? n : null;
};

/** 1.8 → "1,80" */
export const mostrarFator = (fator: number): string => fator.toFixed(2).replace('.', ',');

export const margensPeloSupabase = (supabase: SupabaseClient) => ({
  async listar(): Promise<FatorDaMarca[]> {
    const { data, error } = await supabase
      .from('margens_por_marca')
      .select('marca, variante, fator, atualizado_em')
      .order('marca')
      .order('variante');
    if (error) throw error;
    return (data ?? []).map((m) => ({ ...m, fator: Number(m.fator) })) as FatorDaMarca[];
  },
  async apelidos(): Promise<Apelido[]> {
    const { data, error } = await supabase.from('apelidos_de_marca').select('apelido, marca').order('apelido');
    if (error) throw error;
    return (data ?? []) as Apelido[];
  },
  async semMargem(): Promise<MarcaSemMargem[]> {
    const { data, error } = await supabase.rpc('marcas_sem_margem');
    if (error) throw error;
    return ((data ?? []) as { marca: string; vezes: number }[]).map((m) => ({ marca: m.marca, vezes: Number(m.vezes) }));
  },
  async salvar(marca: string, variante: string, fator: number): Promise<void> {
    const { error } = await supabase.rpc('salvar_fator', { marca, variante, fator });
    if (error) throw error;
  },
  async apontarApelido(marcaDoB2b: string, marca: string): Promise<void> {
    const { error } = await supabase.rpc('apontar_apelido', { marca_do_b2b: marcaDoB2b, marca });
    if (error) throw error;
  },
  async removerApelido(apelido: string): Promise<void> {
    const { error } = await supabase.from('apelidos_de_marca').delete().eq('apelido', apelido);
    if (error) throw error;
  },
});
