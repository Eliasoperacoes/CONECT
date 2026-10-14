/**
 * O APLICATIVO PEDINDO TEXTO À IA DA CENTRAL (14/10/2026).
 *
 * Leva o pedido à função de servidor `escrever-com-ia` e traduz a
 * resposta. Quem decide o que a IA faz, recebe e devolve é
 * `src/servidor/escritaComIa.ts`; quem decide quem pode, o banco.
 */
import { supabase, usandoNuvem } from './supabase';
import type { PedidoDeEscrita } from '../servidor/escritaComIa';

/**
 * O QUE NÃO VAI PARA A IA: imagens, links, botões e pessoas citadas.
 *
 * Cada um vira um marcador neutro (⟦1⟧, ⟦2⟧…) antes de sair do
 * aparelho, e volta para o lugar na resposta. Assim:
 *   · a IA não vê o nome nem o código de quem foi citado, nem os
 *     endereços — pedido do Elias: ela "sem acesso a informações";
 *   · "Melhorar" um aviso não apaga a foto, o link do formulário nem a
 *     menção a alguém — a IA não inventa nem perde o que não leu.
 */
const ELEMENTO =
  /!\[[^\]]*\]\([^)]*\)|\[\[[^\]]+\]\]\([^)]*\)|@\[[^\]]*\]\(pessoa:[^)]+\)|\[[^\]]+\]\([^)]*\)|https?:\/\/\S+/g;

export const protegerElementos = (texto: string): { texto: string; elementos: string[] } => {
  const elementos: string[] = [];
  const protegido = texto.replace(ELEMENTO, (achado) => {
    elementos.push(achado);
    return `⟦${elementos.length}⟧`;
  });
  return { texto: protegido, elementos };
};

/**
 * Recoloca cada elemento no marcador dele. O que a IA deixou cair volta
 * no fim, em linha própria — perder a foto do aviso seria pior que vê-la
 * fora do lugar. Marcador que a IA inventou some.
 */
export const devolverElementos = (texto: string, elementos: string[]): string => {
  const usados = new Set<number>();
  let novo = texto.replace(/⟦(\d+)⟧/g, (_, n: string) => {
    const i = Number(n) - 1;
    if (!elementos[i] || usados.has(i)) return '';
    usados.add(i);
    return elementos[i];
  });
  const faltando = elementos.filter((_, i) => !usados.has(i));
  if (faltando.length) novo = `${novo.trimEnd()}\n\n${faltando.join('\n\n')}`;
  return novo.trim();
};

/** No título não cabe imagem nem link: marcador vira nada */
const tituloSemMarcadores = (titulo: string): string => titulo.replace(/⟦\d+⟧/g, '').replace(/\s+/g, ' ').trim();

export type RespostaDaEscrita =
  | { titulo?: string; texto?: string; restantes: number }
  | { erro: string };

export const pedirTextoAIa = async (pedido: PedidoDeEscrita): Promise<RespostaDaEscrita> => {
  if (!supabase || !usandoNuvem()) {
    return { erro: 'A IA de escrita só funciona com o sistema na nuvem.' };
  }
  const { texto: entrada, elementos } = protegerElementos(pedido.entrada);
  try {
    const { data, error } = await supabase.functions.invoke('escrever-com-ia', {
      body: { ...pedido, entrada },
    });
    if (error) {
      // A função sempre explica a recusa no corpo: limite, permissão, IA fora do ar
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return { erro: (corpo as { erro?: string } | null)?.erro || 'A IA não respondeu. Tente de novo.' };
    }
    const r = data as { titulo?: string; texto?: string; restantes?: number };
    if (!r?.titulo && !r?.texto) return { erro: 'A IA não devolveu texto. Tente de novo.' };
    return {
      titulo: r.titulo ? tituloSemMarcadores(r.titulo) : undefined,
      // No título as citações não voltam; no texto, todas voltam
      texto: r.texto !== undefined ? devolverElementos(r.texto, elementos) : undefined,
      restantes: Number(r.restantes ?? 0),
    };
  } catch {
    return { erro: 'Sem conexão com a IA agora. Tente de novo.' };
  }
};
