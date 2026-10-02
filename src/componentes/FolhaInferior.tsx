/**
 * A FOLHA QUE SOBE DE BAIXO — o formulário "de aplicativo" do CONECTA.
 *
 * Pedido do Elias: as telas do celular pareciam "as funções do web
 * embrulhadas de qualquer maneira" — formulário sempre aberto no alto da
 * tela, empurrando para baixo o que a pessoa veio ver. No aplicativo, a
 * lista é a tela; a ação abre por cima, numa folha que sobe de baixo, com
 * o botão principal fixo no rodapé, ao alcance do polegar.
 *
 * No computador ela vira uma janela no centro: lá não há polegar, e uma
 * folha colada na borda de um monitor largo fica perdida.
 *
 * O voltar do Android fecha a folha (ou volta um passo, quando há
 * `aoVoltar`), pela mesma pilha de todo modal (`useVoltar`).
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useVoltar } from '../servicos/voltar';

interface Props {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  aoFechar: () => void;
  /** Um passo para trás dentro da folha. Sem ele, o voltar fecha. */
  aoVoltar?: () => void;
  /** A ação principal, fixa no rodapé. */
  rodape?: React.ReactNode;
  children: React.ReactNode;
}

export const FolhaInferior: React.FC<Props> = ({
  aberto,
  titulo,
  subtitulo,
  aoFechar,
  aoVoltar,
  rodape,
  children,
}) => {
  useVoltar(aberto, aoVoltar ?? aoFechar);
  if (!aberto) return null;

  /*
    NO CORPO DA PÁGINA (portal), e não onde foi chamada. Aberta de dentro da
    lista de conversas, a folha ficava presa na camada da lista — e a janela
    da conversa, ao lado, cobria a confirmação de "Sair e apagar" (Elias,
    03/10/2026). Uma folha é sempre a camada de cima.
  */
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/55 folha-fundo"
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="folha-painel w-full md:max-w-lg max-h-[92dvh] md:max-h-[85dvh] flex flex-col bg-[var(--c-superficie)] rounded-t-3xl md:rounded-2xl shadow-[var(--s-3)] overflow-hidden"
      >
        {/* A alça: diz, sem palavra, que isto é uma camada por cima */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <span className="w-10 h-1 rounded-full bg-[var(--c-borda-forte)]" />
        </div>

        <header className="flex items-center gap-2 px-3 pb-2 pt-1 md:pt-3 border-b border-[var(--c-borda)] flex-shrink-0">
          {aoVoltar ? (
            <button
              type="button"
              onClick={aoVoltar}
              aria-label="Voltar"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--c-texto)] active:bg-[var(--c-superficie-2)]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-[var(--c-texto)] truncate">{titulo}</h2>
            {subtitulo && (
              <p className="text-xs text-[var(--c-texto-3)] truncate">{subtitulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--c-texto-2)] active:bg-[var(--c-superficie-2)]"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {rodape && (
          <footer className="flex-shrink-0 border-t border-[var(--c-borda)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-[var(--c-superficie)]">
            {rodape}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};
