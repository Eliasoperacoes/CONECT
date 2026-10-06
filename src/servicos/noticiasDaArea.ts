/**
 * AS NOTÍCIAS DA ÁREA, do lado do navegador — pede ao servidor
 * (api/noticias.ts) e guarda 30 minutos no aparelho.
 *
 * Separado de `noticias.ts` de propósito: aquele roda também no servidor,
 * e este usa o armazenamento do navegador.
 */
import type { Noticia } from './noticias';

export interface NoticiasDaArea {
  /** "Setor automotivo", "Trabalho e RH"… */
  area: string;
  /** Falso quando o dia não teve nada da área e vieram as de economia. */
  daArea: boolean;
  noticias: Noticia[];
  fonte: string;
  /** Quando o servidor buscou os feeds (ISO) — o Início diz "Atualizado às…". */
  atualizadaEm?: string;
}

const VALIDADE_MS = 30 * 60 * 1000;

export const buscarNoticiasDaArea = async (setor: string): Promise<NoticiasDaArea | null> => {
  const chave = `conecta:noticias:${setor}`;
  try {
    const guardada = JSON.parse(sessionStorage.getItem(chave) || 'null') as { em: number; dados: NoticiasDaArea } | null;
    if (guardada && Date.now() - guardada.em < VALIDADE_MS) return guardada.dados;
  } catch {
    /* sem armazenamento: pede de novo */
  }
  try {
    const resposta = await fetch(`/api/noticias?setor=${encodeURIComponent(setor)}`);
    // Fora da Vercel (o sistema local) a rota não existe e volta a página — não é notícia
    if (!resposta.ok || !resposta.headers.get('content-type')?.includes('application/json')) return null;
    const dados = (await resposta.json()) as NoticiasDaArea;
    if (!Array.isArray(dados?.noticias)) return null;
    try {
      sessionStorage.setItem(chave, JSON.stringify({ em: Date.now(), dados }));
    } catch {
      /* só não guarda */
    }
    return dados;
  } catch {
    return null;
  }
};
