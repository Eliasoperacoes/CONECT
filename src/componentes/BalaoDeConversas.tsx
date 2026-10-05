/**
 * O BALÃO DE CONVERSAS — no canto de baixo à direita, no computador.
 *
 * Pedido do Elias (05/10/2026): "a conversa ainda pra mim faz sentido ter o
 * balão no canto inferior direito". É onde todo sistema de trabalho põe o
 * chat: à mão em qualquer tela, sem ocupar um lugar na navegação. O toque
 * abre o chat em tela cheia (lista à esquerda, conversa à direita); fechar
 * o chat traz o balão de volta.
 *
 * Ele flutua por cima do conteúdo, e por isso a área principal reserva o
 * espaço dele no fim (`pb-24` em ConteudoWeb): o balão antigo cobria o
 * saldo das últimas pessoas da lista em "Equipe e ponto".
 */
import React from 'react';
import { MessageSquare } from 'lucide-react';

export const BalaoDeConversas: React.FC<{ naoLidas: number; aoAbrir: () => void }> = ({ naoLidas, aoAbrir }) => (
  <button
    type="button"
    id="balao-de-conversas"
    onClick={aoAbrir}
    aria-label={naoLidas ? `Conversas — ${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : 'Conversas'}
    title="Conversas e grupos"
    className="hidden md:flex fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full items-center justify-center bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-[var(--s-3)] hover:brightness-110 active:scale-95 transition-all"
  >
    <MessageSquare className="w-6 h-6" />
    {naoLidas > 0 && (
      <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center ring-2 ring-[var(--c-canvas)] tabular-nums">
        {naoLidas > 99 ? '99+' : naoLidas}
      </span>
    )}
  </button>
);
