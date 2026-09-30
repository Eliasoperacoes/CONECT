/**
 * O TÍTULO DE UMA TELA — um desenho só para todas.
 *
 * No computador, cada tela abria de um jeito: a Central com ícone e letra
 * pequena, o Gerenciar com letra grande, o Ponto e o Eu sem título
 * nenhum. Trocar de tela dava a impressão de trocar de sistema. Agora o
 * título tem um tamanho, um alinhamento e um lugar para as ações.
 *
 * O Gerenciar também aparece assim no celular; por isso as classes base
 * são as que ele já usava lá.
 */
import React from 'react';

interface Props {
  titulo: string;
  subtitulo?: string;
  /** Botões à direita do título (ex.: "Nova publicação"). */
  acoes?: React.ReactNode;
  className?: string;
}

export const TituloDaPagina: React.FC<Props> = ({ titulo, subtitulo, acoes, className = '' }) => (
  <div className={`flex items-start justify-between gap-4 ${className}`}>
    <div className="min-w-0">
      <h1 className="text-2xl font-black text-[var(--c-texto)] tracking-tight leading-tight">
        {titulo}
      </h1>
      {subtitulo && <p className="text-[13px] text-[var(--c-texto-3)] truncate">{subtitulo}</p>}
    </div>
    {acoes && <div className="flex items-center gap-2 flex-shrink-0">{acoes}</div>}
  </div>
);
