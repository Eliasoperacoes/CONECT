/**
 * O SINO DO TOPO — o que espera por você, num lugar só (computador).
 *
 * Aprovado pelo Elias (05/10/2026): ele não traz aviso novo nenhum. Reúne
 * os números que já existem — decisões do ponto, comunicados não lidos,
 * documentos do Meu RH —, cada um com o que é e a tela onde se resolve.
 * Item sem nada não aparece; sem nada em todos, a frase diz que está em dia.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Clock, Megaphone, FileText, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { TelaWeb } from '../servicos/telasPorAssunto';

export interface ItemDoSino {
  id: string;
  quantidade: number;
  /** "decisões de ponto esperam por você" — completa a frase depois do número. */
  texto: (quantidade: number) => string;
  tela: TelaWeb;
  tipo: 'ponto' | 'central' | 'documentos';
}

const ICONE = { ponto: Clock, central: Megaphone, documentos: FileText } as const;

export const SinoWeb: React.FC<{ itens: ItemDoSino[]; aoIrPara: (tela: TelaWeb) => void }> = ({ itens, aoIrPara }) => {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const comAlgo = itens.filter((i) => i.quantidade > 0);
  const total = comAlgo.reduce((s, i) => s + i.quantidade, 0);

  // Clique fora fecha, como em qualquer menu
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        id="sino-web"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-label={total ? `${total} ${total === 1 ? 'pendência' : 'pendências'} para você` : 'Nada esperando por você'}
        className="relative w-10 h-10 rounded-xl flex items-center justify-center text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)] transition-colors"
      >
        <Bell className="w-5 h-5" />
        {total > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ring-2 ring-[var(--c-superficie)]">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-80 p-2 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)]"
        >
          <p className="px-2 pt-1 pb-2 text-xs font-bold text-[var(--c-texto)]">O que espera por você</p>
          {comAlgo.length === 0 ? (
            <p className="px-2 py-4 flex items-center gap-2 text-xs text-[var(--c-texto-3)]">
              <CheckCircle2 className="w-4 h-4 text-[var(--c-ok)]" />
              Tudo em dia. O que chegar aparece aqui.
            </p>
          ) : (
            comAlgo.map((item) => {
              const Icone = ICONE[item.tipo];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAberto(false);
                    aoIrPara(item.tela);
                  }}
                  className="w-full px-2 py-2.5 rounded-xl flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)]"
                >
                  <span className="w-8 h-8 rounded-lg bg-[var(--c-acento-suave)] text-[var(--c-acento)] flex items-center justify-center flex-shrink-0">
                    <Icone className="w-4 h-4" />
                  </span>
                  <span className="flex-1 text-sm text-[var(--c-texto)]">
                    <strong className="tabular-nums">{item.quantidade}</strong> {item.texto(item.quantidade)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)]" />
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
