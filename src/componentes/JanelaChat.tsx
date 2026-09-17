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

import React from 'react';
import { Minus, X } from 'lucide-react';
import { Colaborador, Conversa } from '../tipos';
import { TelaConversa } from './TelaConversa';

interface PropsJanelaChat {
  conversa: Conversa;
  colaboradorAtual: Colaborador;
  aoFechar: () => void;
  /**
   * Distância da borda direita, em pixels, no computador.
   *
   * Quem calcula é o App, porque só ele sabe quantas janelas estão abertas e
   * quais estão encolhidas — e é isso que decide onde cada uma cabe sem
   * cobrir a vizinha. Vai por variável de CSS e não por classe do Tailwind
   * porque o valor é calculado em tempo de execução, e classe montada com
   * string não existe na folha de estilo gerada.
   */
  direita?: number;
  /**
   * Encolher tira a janela daqui e a manda para a barra de encolhidas.
   *
   * Esta janela NÃO desenha mais a versão encolhida. Ela desenhava, e o App
   * também posicionava a encolhida por conta própria com uma largura fixa
   * que não batia com a largura real do nome — duas contas para a mesma
   * coisa, discordando. A fila das encolhidas agora é de um lugar só:
   * BarraConversasEncolhidas.
   */
  aoEncolher?: () => void;
  /**
   * No celular só uma janela aparece: não há espaço para lado a lado, e
   * empilhar janelas em tela cheia esconderia umas às outras sem aviso.
   */
  visivelNoCelular?: boolean;
}

export const JanelaChat: React.FC<PropsJanelaChat> = ({
  conversa,
  colaboradorAtual,
  aoFechar,
  direita = 372,
  aoEncolher,
  visivelNoCelular = true,
}) => {
  const estilo = { '--direita': `${direita}px` } as React.CSSProperties;

  return (
    // Cada lado é declarado sozinho de propósito. O atalho `inset-0` define os
    // quatro de uma vez e, no computador, vencia o canto: a janela voltava a
    // ocupar a tela inteira e tampava o RH — exatamente o que ela existe para
    // evitar.
    <div
      id="janela-chat-flutuante"
      style={estilo}
      className={`fixed z-40 top-0 left-0 right-0 bottom-0 w-full h-full md:top-auto md:left-auto md:right-[var(--direita)] md:bottom-0 md:w-[420px] md:h-[580px] md:max-h-[calc(100dvh-96px)] md:flex flex-col bg-[var(--c-canvas)] md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden ${
        visivelNoCelular ? 'flex' : 'hidden'
      }`}
    >
      {/* Barra da janela: só no computador, onde ela é de fato uma janela */}
      <div className="hidden md:flex items-center justify-between gap-2 px-3 py-1.5 bg-[var(--c-superficie-2)] border-b border-[var(--c-borda)] flex-shrink-0">
        <span className="text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider">
          Conversa
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={aoEncolher}
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
