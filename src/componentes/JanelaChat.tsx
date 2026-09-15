/**
 * Conversa em janela flutuante — CONECTA / Malachias Autopeças
 *
 * Serve para falar com alguém SEM sair do que se está fazendo. O caso que
 * motivou isto: no RH, olhando a ficha de um colaborador, mandar uma mensagem
 * para ele exigia voltar para Conversas e abrir o chat — que tomava a tela e
 * fazia perder a consulta pela metade. Agora a conversa abre por cima, e o
 * RH continua atrás, do jeito que estava.
 *
 * No computador é uma janela encostada no canto, que dá para encolher para
 * uma barra quando atrapalhar. No celular não existe "por cima": a tela é
 * pequena demais para duas coisas, então ela ocupa tudo, como sempre foi.
 */

import React, { useState } from 'react';
import { Minus, X, MessageSquare } from 'lucide-react';
import { Colaborador, Conversa } from '../tipos';
import { TelaConversa } from './TelaConversa';

interface PropsJanelaChat {
  conversa: Conversa;
  colaboradorAtual: Colaborador;
  aoFechar: () => void;
}

export const JanelaChat: React.FC<PropsJanelaChat> = ({
  conversa,
  colaboradorAtual,
  aoFechar,
}) => {
  const [encolhida, setEncolhida] = useState(false);

  // Encolhida, vira só uma barra com o nome — o suficiente para lembrar que a
  // conversa está aberta e para voltar a ela com um clique.
  if (encolhida) {
    return (
      <button
        type="button"
        id="janela-chat-encolhida"
        onClick={() => setEncolhida(false)}
        className="hidden md:flex fixed bottom-0 right-6 z-40 items-center gap-2 px-4 py-2.5 rounded-t-xl bg-[var(--c-superficie)] border border-b-0 border-[var(--c-borda)] shadow-[var(--s-3)] hover:brightness-105 transition-all cursor-pointer"
      >
        <MessageSquare className="w-4 h-4 text-[var(--c-acento)]" />
        <span className="text-xs font-bold text-[var(--c-texto)] max-w-[160px] truncate">
          {conversa.nome}
        </span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            aoFechar();
          }}
          className="ml-1 p-0.5 rounded-md hover:bg-[var(--c-superficie-2)] text-[var(--c-texto-3)]"
          aria-label="Fechar conversa"
        >
          <X className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  }

  return (
    // Cada lado é declarado sozinho de propósito. O atalho `inset-0` define os
    // quatro de uma vez e, no computador, vencia o canto: a janela voltava a
    // ocupar a tela inteira e tampava o RH — exatamente o que ela existe para
    // evitar.
    <div
      id="janela-chat-flutuante"
      className="fixed z-40 top-0 left-0 right-0 bottom-0 w-full h-full md:top-auto md:left-auto md:right-6 md:bottom-0 md:w-[420px] md:h-[580px] md:max-h-[calc(100dvh-96px)] flex flex-col bg-[var(--c-canvas)] md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden"
    >
      {/* Barra da janela: só no computador, onde ela é de fato uma janela */}
      <div className="hidden md:flex items-center justify-between gap-2 px-3 py-1.5 bg-[var(--c-superficie-2)] border-b border-[var(--c-borda)] flex-shrink-0">
        <span className="text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider">
          Conversa
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setEncolhida(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--c-superficie)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] transition-colors cursor-pointer"
            aria-label="Encolher conversa"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-lg hover:bg-[var(--c-superficie)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] transition-colors cursor-pointer"
            aria-label="Fechar conversa"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <TelaConversa
          conversa={conversa}
          colaboradorAtual={colaboradorAtual}
          aoVoltar={aoFechar}
        />
      </div>
    </div>
  );
};
