/**
 * O LOGO DA MALACHIAS, NUMA MOLDURA BRANCA — o mesmo na tela de entrada e
 * na barra lateral do computador.
 *
 * Por que a moldura: o logo tem partes cinza-escuras que sumiam no tema
 * escuro, e solto no fundo ele "flutuava" (Elias, 06/10/2026, com o print
 * do tema escuro). Sobre o branco ele se lê igual nos dois temas, como o
 * ícone de um aplicativo.
 */
import React from 'react';

const MEDIDAS = {
  // O PNG da logo traz margem própria: no pequeno ela pesa, e o logo é ampliado por dentro
  pequeno: { moldura: 'h-10 w-10 rounded-xl overflow-hidden', sombra: 'shadow-[var(--s-1)]', logo: 'scale-[1.3]' },
  grande: { moldura: 'h-24 w-24 rounded-[28px] p-2', sombra: 'shadow-[0_10px_30px_-8px_rgba(16,24,32,0.25)]', logo: '' },
} as const;

export const LogoMalachias: React.FC<{ tamanho?: keyof typeof MEDIDAS; className?: string }> = ({
  tamanho = 'pequeno',
  className = '',
}) => {
  const m = MEDIDAS[tamanho];
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center bg-white ring-1 ring-black/5 ${m.moldura} ${m.sombra} ${className}`}
    >
      <img src="/logo-malachias.svg" alt="Malachias Autopeças" className={`h-full w-full object-contain ${m.logo}`} />
    </span>
  );
};
