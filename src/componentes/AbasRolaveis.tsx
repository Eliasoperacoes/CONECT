/**
 * AS ABAS QUE DESLIZAM — uma linha só, em qualquer largura.
 *
 * Pedido do Elias sobre o Gerenciar no celular: "layout estourado, texto
 * empilhado". As abas eram botões num contêiner que quebrava linha —
 * "Visão & Lojas" em três linhas — ou rolavam sem aviso, com a quarta
 * aba cortada parecendo defeito. Havia um jeito diferente em cada tela.
 *
 * Agora é um só, nos dois níveis:
 *   · `sublinhado` — o primeiro nível, como as abas do Android;
 *   · `pilula` — o segundo nível, dentro de uma aba.
 *
 * Nunca quebra linha: o que não cabe desliza, e a borda esmaece para
 * dizer que há mais. A aba escolhida rola sozinha para a vista — chegar
 * por um aviso na quarta aba e não vê-la marcada deixa a pessoa perdida.
 */
import React, { useEffect, useRef } from 'react';

export interface AbaRolavel<T extends string> {
  id: T;
  rotulo: string;
  icone?: React.ReactNode;
  /** Número à direita do rótulo (pendências, por exemplo). */
  contador?: number;
  /** Id do elemento, para quem precisa achá-lo (testes, atalhos). */
  domId?: string;
}

interface Props<T extends string> {
  abas: Array<AbaRolavel<T>>;
  ativa: T;
  aoEscolher: (id: T) => void;
  variante?: 'sublinhado' | 'pilula';
  className?: string;
}

export function AbasRolaveis<T extends string>({
  abas,
  ativa,
  aoEscolher,
  variante = 'pilula',
  className = '',
}: Props<T>) {
  const refAtiva = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    refAtiva.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [ativa]);

  const sublinhado = variante === 'sublinhado';

  return (
    <div
      role="tablist"
      className={`flex overflow-x-auto no-scrollbar ${
        sublinhado ? 'gap-1 px-2' : 'gap-2 px-4'
      } [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] ${className}`}
    >
      {abas.map((aba) => {
        const eAtiva = aba.id === ativa;
        return (
          <button
            key={aba.id}
            ref={eAtiva ? refAtiva : undefined}
            id={aba.domId}
            type="button"
            role="tab"
            aria-selected={eAtiva}
            onClick={() => aoEscolher(aba.id)}
            className={
              sublinhado
                ? `h-11 px-3 flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold border-b-2 transition-colors flex-shrink-0 ${
                    eAtiva
                      ? 'border-[var(--c-acento)] text-[var(--c-acento)]'
                      : 'border-transparent text-[var(--c-texto-3)] active:text-[var(--c-texto)]'
                  }`
                : `h-9 px-3.5 flex items-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-semibold transition-colors flex-shrink-0 ${
                    eAtiva
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto-2)] active:bg-[var(--c-superficie-2)]'
                  }`
            }
          >
            {aba.icone && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{aba.icone}</span>}
            {aba.rotulo}
            {!!aba.contador && aba.contador > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {aba.contador > 99 ? '99+' : aba.contador}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
