/**
 * Barra das conversas encolhidas — CONECTA / Malachias Autopeças
 *
 * O QUE ESTAVA ERRADO
 *
 * Cada conversa encolhida se posicionava sozinha, por um cálculo feito no
 * App: "começa em 372 e soma 210 por janela". Só que a barra encolhida NÃO
 * tinha 210 de largura — ela crescia com o nome. "Elias" dava uns 120,
 * "Aline Karoline Boldrim De..." passava de 230.
 *
 * O resultado é o da tela: uma menor, outra maior, uma por cima da outra e
 * um vão enorme depois. Dois lugares decidindo a mesma largura, e eles
 * discordavam — o mesmo erro que já custou caro aqui em outras telas.
 *
 * COMO FICOU
 *
 * Uma barra só, que enfileira as conversas encolhidas em linha. Quem decide
 * onde cada uma fica é a própria linha, não uma conta: não há como um item
 * cair por cima do outro, porque ninguém mais calcula posição.
 *
 * Largura fixa para todas, nome cortado com reticências quando não couber.
 * Nome comprido não pode mais empurrar o layout dos outros.
 *
 * No máximo CINCO à vista. O resto entra num botão com a contagem, que abre
 * a lista — conversa aberta não pode simplesmente sumir sem deixar caminho
 * de volta.
 */

import React, { useState } from 'react';
import { MessageSquare, X, ChevronUp } from 'lucide-react';
import { Conversa } from '../tipos';

/** Quantas cabem à vista antes de o resto virar contagem. */
export const MAXIMO_ENCOLHIDAS_A_VISTA = 5;

interface PropsBarra {
  conversas: Conversa[];
  /**
   * Quanto espaço as janelas abertas ocupam à direita, em pixels.
   *
   * A barra encosta à esquerda e para antes delas. Sem este limite ela
   * passaria por baixo das janelas abertas quando houvesse muitas conversas.
   */
  espacoDasAbertas: number;
  aoAbrir: (conversaId: string) => void;
  aoFechar: (conversaId: string) => void;
}

export const BarraConversasEncolhidas: React.FC<PropsBarra> = ({
  conversas,
  espacoDasAbertas,
  aoAbrir,
  aoFechar,
}) => {
  const [listaAberta, setListaAberta] = useState(false);

  if (conversas.length === 0) return null;

  const aVista = conversas.slice(0, MAXIMO_ENCOLHIDAS_A_VISTA);
  const atras = conversas.slice(MAXIMO_ENCOLHIDAS_A_VISTA);

  const estilo = {
    maxWidth: `calc(100vw - ${espacoDasAbertas + 24}px)`,
  } as React.CSSProperties;

  return (
    /*
      Só no computador. No celular não existe "conversa encolhida": a tela é
      pequena demais para duas coisas, e lá a conversa ocupa tudo.
    */
    <div
      id="barra-conversas-encolhidas"
      style={estilo}
      className="hidden md:flex fixed bottom-0 left-3 z-40 items-end gap-2"
    >
      <div className="flex items-end gap-2 overflow-x-auto no-scrollbar">
        {aVista.map((conversa) => (
          <div
            key={conversa.id}
            /*
              Largura FIXA, e é isto que conserta a tela. Antes cada barra
              tinha o tamanho do nome de quem estava do outro lado.
            */
            className="w-[176px] flex-shrink-0 flex items-center gap-1.5 pl-3 pr-1.5 py-2.5 rounded-t-xl bg-[var(--c-superficie)] border border-b-0 border-[var(--c-borda)] shadow-[var(--s-3)]"
          >
            <button
              type="button"
              onClick={() => aoAbrir(conversa.id)}
              className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer hover:brightness-105"
              title={`Abrir conversa com ${conversa.nome}`}
            >
              <MessageSquare className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
              <span className="text-xs font-bold text-[var(--c-texto)] truncate">
                {conversa.nome}
              </span>
            </button>
            <button
              type="button"
              onClick={() => aoFechar(conversa.id)}
              className="p-1 rounded-md hover:bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] flex-shrink-0 cursor-pointer"
              title="Fechar conversa"
              aria-label={`Fechar conversa com ${conversa.nome}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/*
        O QUE FICOU ATRÁS.

        Conversa aberta não pode sumir sem deixar caminho de volta — foi o
        que acontecia antes, quando a mais antiga era simplesmente fechada
        para a nova caber.
      */}
      {atras.length > 0 && (
        <div className="relative flex-shrink-0">
          {listaAberta && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setListaAberta(false)}
              />
              <div className="absolute z-50 bottom-full mb-2 left-0 w-64 max-h-72 overflow-y-auto rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)] py-1">
                <span className="block px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                  Também abertas
                </span>
                {atras.map((conversa) => (
                  <div
                    key={conversa.id}
                    className="flex items-center gap-1 hover:bg-[var(--c-superficie-2)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setListaAberta(false);
                        aoAbrir(conversa.id);
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
                      <span className="text-xs font-semibold text-[var(--c-texto)] truncate">
                        {conversa.nome}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => aoFechar(conversa.id)}
                      className="p-1.5 mr-1.5 rounded-md hover:bg-[var(--c-canvas)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] flex-shrink-0 cursor-pointer"
                      title="Fechar conversa"
                      aria-label={`Fechar conversa com ${conversa.nome}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            id="botao-conversas-atras"
            onClick={() => setListaAberta((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-t-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border border-b-0 border-[var(--c-acento)] shadow-[var(--s-3)] cursor-pointer hover:brightness-110 transition-all"
            title={`Mais ${atras.length} conversa${atras.length > 1 ? 's' : ''} aberta${
              atras.length > 1 ? 's' : ''
            }`}
          >
            <span className="text-xs font-bold">+{atras.length}</span>
            <ChevronUp
              className={`w-3.5 h-3.5 transition-transform ${listaAberta ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      )}
    </div>
  );
};
