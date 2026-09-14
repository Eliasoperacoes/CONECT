import React from 'react';
import { Conversa } from '../tipos';

interface PropsItemConversa {
  conversa: Conversa;
  selecionada?: boolean;
  aoClicar: () => void;
}

export const ItemConversa: React.FC<PropsItemConversa> = ({
  conversa,
  selecionada = false,
  aoClicar,
}) => {
  // Inicial do nome para avatar caso não haja foto
  const obterInicial = (nome: string) => {
    return (nome || '?').charAt(0).toUpperCase();
  };

  return (
    <button
      type="button"
      id={`item-conversa-${conversa.id}`}
      onClick={aoClicar}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-[var(--c-borda)] transition-colors min-h-[64px] active:bg-[var(--c-superficie-2)] ${
        selecionada ? 'bg-[var(--c-acento-suave)]' : 'bg-[var(--c-superficie)]'
      }`}
    >
      {/* 1. Foto ou Avatar */}
      <div className="relative flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center justify-center">
        {conversa.foto ? (
          <img
            src={conversa.foto}
            alt={conversa.nome}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="font-semibold text-base text-[var(--c-texto-2)]">
            {obterInicial(conversa.nome)}
          </span>
        )}
      </div>

      {/* 2. Nome e 3. Prévia da última mensagem */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-base text-[var(--c-texto)] truncate">
            {conversa.nome}
          </span>

          {/* 4. Horário */}
          {conversa.ultimaMensagem?.hora && (
            <span className="text-xs text-[var(--c-texto-3)] flex-shrink-0 font-mono">
              {conversa.ultimaMensagem.hora}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-[var(--c-texto-2)] truncate">
            {conversa.ultimaMensagem?.texto || 'Nenhuma mensagem'}
          </p>

          {/* Contador de não lidas (quando houver) */}
          {conversa.naoLidas > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-semibold flex items-center justify-center">
              {conversa.naoLidas}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};
