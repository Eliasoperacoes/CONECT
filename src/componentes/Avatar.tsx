/**
 * Foto, ou iniciais sobre uma cor — o miolo de toda foto de pessoa e de
 * conversa. A regra de "o que é foto de verdade" mora em servicos/avatar.ts.
 */
import React from 'react';
import { corDoAvatar, fotoParaMostrar, iniciaisDe } from '../servicos/avatar';

export const Avatar: React.FC<{
  foto?: string | null;
  nome: string;
  /** O id da conversa: reconhece o canal oficial, que mantém a logo. */
  id?: string;
  /** Tamanho da letra das iniciais (Tailwind). */
  letra?: string;
}> = ({ foto, nome, id, letra = 'text-sm' }) => {
  const mostrar = fotoParaMostrar(foto, id);
  if (mostrar) {
    return (
      <img
        src={mostrar}
        alt={nome}
        className="w-full h-full object-cover pointer-events-none"
        referrerPolicy="no-referrer"
        draggable={false}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`w-full h-full flex items-center justify-center font-semibold text-white select-none ${letra} ${corDoAvatar(nome)}`}
    >
      {iniciaisDe(nome)}
    </span>
  );
};
