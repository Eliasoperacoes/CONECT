/**
 * A MARCA do CONECTA — o quadrado azul com as três faixas, do desenho do
 * Figma. Uma só, usada pela barra lateral do computador e pela tela de
 * entrada: duas marcas desenhadas à mão divergiriam na primeira mudança.
 */
import React from 'react';

export const MarcaConecta: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    aria-hidden
    className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--c-acento)] shadow-lg shadow-[var(--c-acento)]/20 ${className}`}
  >
    <span className="relative block h-6 w-6 -rotate-45">
      <span className="absolute left-0 top-0 h-1.5 w-6 rounded-full bg-white" />
      <span className="absolute left-0 top-2.5 h-1.5 w-6 rounded-full bg-[#3b393a]" />
      <span className="absolute bottom-0 left-0 h-1.5 w-4 rounded-full bg-white" />
    </span>
  </span>
);
