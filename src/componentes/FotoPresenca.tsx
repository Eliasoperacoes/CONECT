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
import { Avatar } from './Avatar';

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
  /** No cabeçalho de conversa: o canal oficial mantém a logo. */
  conversaId?: string;
}

const ROTULO_PRESENCA: Record<EstadoPresenca, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  ausente: 'Ausente',
  desconectado: 'Desconectado',
};

/**
 * Anel colorido só para o que alguém ESCOLHEU dizer: ocupado ou ausente.
 *
 * "Disponível" é o padrão de todo cadastro, e o verde fazia os 91 da rede
 * parecerem online ao mesmo tempo (S10, 02/10/2026) — o anel não informava
 * nada. Presença de verdade (quem está com o app aberto) custaria, no canal
 * de tempo real, mais que os 2 milhões de mensagens do plano: ver
 * docs/LIMITES-SUPABASE.md antes de reabrir isso.
 */
export const anelDaPresenca = (presenca?: EstadoPresenca): string => {
  switch (presenca) {
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
  conversaId,
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
      <Avatar foto={foto} nome={nome} id={conversaId} />
    </div>
  );
};
