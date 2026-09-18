/**
 * Faixa de período de teste — CONECTA / Malachias Autopeças
 *
 * POR QUE ELA EXISTE
 *
 * Quem encontra um defeito e não sabe que o sistema está em teste conclui
 * que "é assim mesmo", para de tentar e volta para o grupo do WhatsApp. O
 * defeito continua lá, e ninguém fica sabendo dele.
 *
 * A faixa diz duas coisas: que é teste, e para onde reclamar. A segunda é
 * a que importa — aviso sem caminho de volta é só um aviso.
 *
 * POR QUE ELA É DISCRETA
 *
 * Ela fica em cima de tudo o dia inteiro, em 88 telas. Uma tarja grande e
 * colorida viraria ruído em dois dias, e em três a pessoa deixaria de
 * enxergá-la — inclusive na hora em que precisasse dela. Uma linha fina,
 * que dá para fechar, respeita quem já entendeu o recado.
 *
 * Fechar vale só naquele aparelho e naquela sessão: quem recarrega a vê de
 * novo, porque o período de teste continua.
 */

import React, { useState } from 'react';
import { FlaskConical, X } from 'lucide-react';

interface Props {
  /** Abre a conversa com quem cuida do sistema — o caminho da reclamação. */
  aoAvisarProblema: () => void;
}

export const FaixaDeTeste: React.FC<Props> = ({ aoAvisarProblema }) => {
  const [fechada, setFechada] = useState(false);

  if (fechada) return null;

  return (
    <div className="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/25 px-3 py-1.5 flex items-center gap-2">
      <FlaskConical className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />

      <span className="flex-1 min-w-0 text-[11px] text-[var(--c-texto-2)] leading-snug">
        <strong className="text-[var(--c-texto)]">Sistema em teste.</strong>{' '}
        Achou algo errado? Avise — é para isso que este período existe.
      </span>

      <button
        type="button"
        onClick={aoAvisarProblema}
        className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-bold text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
      >
        Avisar
      </button>

      <button
        type="button"
        onClick={() => setFechada(true)}
        className="flex-shrink-0 p-1 rounded-md text-[var(--c-texto-3)] hover:text-[var(--c-texto)] transition-colors cursor-pointer"
        title="Fechar até recarregar"
        aria-label="Fechar aviso"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
