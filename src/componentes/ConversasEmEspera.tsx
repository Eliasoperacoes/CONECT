/**
 * Conversas em espera — CONECTA / Malachias Autopeças
 *
 * UM botão com a contagem, e nada mais.
 *
 * A tentativa anterior enfileirava uma pastilha por conversa encolhida, com
 * largura fixa e até cinco à vista. Continuava errado, e por um motivo que
 * só aparece na tela de quem usa: com três conversas abertas ocupando a
 * direita, sobravam uns 230px de largura para a fila. As pastilhas seguintes
 * ficavam fora dessa faixa, roladas para fora — invisíveis, e sem barra de
 * rolagem para denunciar que existiam.
 *
 * Era a mesma doença de antes com outra roupa: conversa aberta que some sem
 * caminho de volta.
 *
 * Agora não há fila. As abertas ficam à direita, em três lugares fixos, e
 * TODO o resto mora aqui dentro — um botão pequeno, no canto, que abre a
 * lista. Nada se espalha para a esquerda porque não há nada para espalhar.
 */

import React, { useState } from 'react';
import { MessageSquare, X, ChevronUp } from 'lucide-react';
import { Conversa } from '../tipos';

interface PropsConversasEmEspera {
  conversas: Conversa[];
  /** Traz a conversa para o primeiro lugar entre as abertas. */
  aoAbrir: (conversaId: string) => void;
  aoFechar: (conversaId: string) => void;
}

export const ConversasEmEspera: React.FC<PropsConversasEmEspera> = ({
  conversas,
  aoAbrir,
  aoFechar,
}) => {
  const [listaAberta, setListaAberta] = useState(false);

  if (conversas.length === 0) return null;

  const quantas = conversas.length;
  /**
   * AS NÃO LIDAS, À VISTA SEM ABRIR A LISTA.
   *
   * O botão dizia só quantas conversas estavam encolhidas. Mensagem nova
   * numa delas não mudava nada no canto da tela — e o Elias perguntou se
   * havia aviso ali. Não havia.
   */
  const naoLidas = conversas.reduce((soma, c) => soma + (c.naoLidas || 0), 0);

  return (
    /*
      Só no computador, e encostado no canto de baixo à esquerda. Posição
      fixa de propósito: não acompanha as janelas abertas, então não há como
      voltar a escorregar para fora da tela quando houver muitas.

      No celular não existe "conversa em espera": a tela é pequena demais
      para duas coisas, e lá a conversa ocupa tudo.
    */
    /*
      Encostado na barra lateral do computador (w-16 até 1024px, w-60
      depois): em `left-3` ele caía em cima do item "Administração".
    */
    <div className="hidden md:block fixed bottom-0 left-[76px] lg:left-[252px] z-40">
      {listaAberta && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setListaAberta(false)} />
          <div className="absolute z-50 bottom-full mb-2 left-0 w-72 max-h-80 overflow-y-auto rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)] py-1">
            <span className="block px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
              Também abertas
            </span>
            {conversas.map((conversa) => (
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
                  title={`Abrir ${conversa.nome}`}
                >
                  <MessageSquare className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
                  <span
                    className={`flex-1 min-w-0 text-xs truncate text-[var(--c-texto)] ${
                      conversa.naoLidas ? 'font-bold' : 'font-semibold'
                    }`}
                  >
                    {conversa.nome}
                  </span>
                  {!!conversa.naoLidas && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                      {conversa.naoLidas > 99 ? '99+' : conversa.naoLidas}
                    </span>
                  )}
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
        id="botao-conversas-em-espera"
        onClick={() => setListaAberta((v) => !v)}
        className="relative z-50 flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border border-b-0 border-[var(--c-acento)] shadow-[var(--s-3)] cursor-pointer hover:brightness-110 transition-all"
        title={`${quantas} conversa${quantas > 1 ? 's' : ''} em espera${
          naoLidas ? ` · ${naoLidas} mensage${naoLidas > 1 ? 'ns' : 'm'} não lida${naoLidas > 1 ? 's' : ''}` : ''
        }`}
      >
        <MessageSquare className="w-4 h-4" />
        <span className="text-xs font-bold">{quantas}</span>
        {naoLidas > 0 && (
          <span
            id="nao-lidas-em-espera"
            className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center ring-2 ring-[var(--c-canvas)]"
          >
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
        <ChevronUp
          className={`w-3.5 h-3.5 transition-transform ${listaAberta ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
};
