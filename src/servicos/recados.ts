/**
 * OS RECADOS ENTRE O VENDEDOR E COMPRAS (SPEC-comunicacao-recebimento).
 *
 * O banco escreve o recado na mesma transação de cada passo — a cotação
 * pedida e a resposta, cada passo da encomenda, nos dois sentidos —, na
 * conversa do vendedor com Compras (escrever_recado, cotador-banco.sql).
 * Daqui só sai o pedido da notificação no celular: quem fez o passo pede
 * (pedirAvisosDosRecados) e o servidor confere que o recado é dele.
 *
 * Falhar aqui não desfaz nada: o recado já está no chat.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { pedirAvisosDosRecados } from './envioDeAviso';

type Recado = { id: string; texto: string | null };

const pedirAvisos = (recados: Recado[] | null | undefined) => {
  if (recados?.length) pedirAvisosDosRecados(recados);
};

/** Os recados que o passo devolveu (pelo id). */
export const avisarRecados = async (supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<void> => {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unicos.length) return;
  try {
    const { data } = await supabase.from('mensagens').select('id, texto').in('id', unicos);
    pedirAvisos(data as Recado[] | null);
  } catch {
    /* sem notificação; o recado está no chat */
  }
};

/**
 * O recado de um passo que devolve outra coisa (encomendar devolve a
 * encomenda): o último daquele aviso, daquela encomenda.
 */
export const avisarRecadoDaEncomenda = async (supabase: SupabaseClient, encomendaId: string, aviso: string): Promise<void> => {
  try {
    const { data } = await supabase
      .from('mensagens')
      .select('id, texto')
      .eq('encomenda_id', encomendaId)
      .eq('aviso_encomenda', aviso)
      .order('criado_em', { ascending: false })
      .limit(1);
    pedirAvisos(data as Recado[] | null);
  } catch {
    /* sem notificação; o recado está no chat */
  }
};
