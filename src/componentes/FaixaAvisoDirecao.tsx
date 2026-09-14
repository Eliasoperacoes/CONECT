import React from 'react';
import { Mensagem } from '../tipos';

interface PropsFaixaAviso {
  aviso: Mensagem;
  aoAbrir: () => void;
  aoDispensar: () => void;
}

export const FaixaAvisoDirecao: React.FC<PropsFaixaAviso> = ({
  aviso,
  aoAbrir,
  aoDispensar,
}) => {
  return (
    <div
      id="faixa-aviso-direcao"
      className="w-full bg-[var(--c-acento-suave)] border-b border-[var(--c-acento)] px-4 py-2.5 flex items-center justify-between gap-3 text-left"
    >
      <button
        type="button"
        onClick={aoAbrir}
        className="flex-1 min-w-0 text-left"
      >
        <span className="block text-xs font-semibold text-[var(--c-acento)] uppercase tracking-wider">
          Aviso da Direção
        </span>
        <p className="text-sm text-[var(--c-texto)] truncate font-normal">
          {aviso.texto}
        </p>
      </button>

      <button
        type="button"
        id="botao-dispensar-aviso"
        onClick={aoDispensar}
        className="text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs p-1.5 flex-shrink-0"
        aria-label="Dispensar aviso"
      >
        ✕
      </button>
    </div>
  );
};
