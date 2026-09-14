/**
 * Foto do colaborador com anel de presença — CONECTA / Malachias Autopeças
 *
 * A disponibilidade é indicada por um anel em volta da foto, não por um ponto
 * sobreposto: o ponto cobria parte do rosto e, em fotos claras ou escuras,
 * praticamente sumia. O anel fica fora da imagem, é lido de relance e não
 * atrapalha a identificação da pessoa.
 */

import React from 'react';
import { EstadoPresenca } from '../tipos';

interface PropsFotoPresenca {
  foto?: string;
  nome: string;
  presenca?: EstadoPresenca;
  /** Diâmetro em Tailwind, ex: 'w-12 h-12'. */
  tamanho?: string;
  /** Cor do vão entre a foto e o anel — deve casar com o fundo do cartão. */
  corDeFundo?: string;
  aoClicar?: () => void;
  titulo?: string;
  className?: string;
}

const ROTULO_PRESENCA: Record<EstadoPresenca, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  ausente: 'Ausente',
  desconectado: 'Desconectado',
};

/** Anel colorido por estado. Desconectado fica neutro para não poluir. */
const anelDaPresenca = (presenca?: EstadoPresenca): string => {
  switch (presenca) {
    case 'disponivel':
      return 'ring-emerald-500';
    case 'ocupado':
      return 'ring-amber-500';
    case 'ausente':
      return 'ring-slate-400';
    default:
      return 'ring-[var(--c-borda-forte)]';
  }
};

export const FotoPresenca: React.FC<PropsFotoPresenca> = ({
  foto,
  nome,
  presenca,
  tamanho = 'w-12 h-12',
  corDeFundo = 'ring-offset-[var(--c-superficie)]',
  aoClicar,
  titulo,
  className = '',
}) => {
  const interativo = !!aoClicar;

  return (
    <div
      onClick={aoClicar}
      title={titulo || (presenca ? `${nome} · ${ROTULO_PRESENCA[presenca]}` : nome)}
      className={`${tamanho} rounded-full overflow-hidden bg-[var(--c-superficie-2)] flex-shrink-0 flex items-center justify-center
        ring-2 ring-offset-2 ${anelDaPresenca(presenca)} ${corDeFundo}
        ${interativo ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''} ${className}`}
    >
      {foto ? (
        <img
          src={foto}
          alt={nome}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="font-semibold text-sm text-[var(--c-texto-2)]">{nome.charAt(0)}</span>
      )}
    </div>
  );
};
