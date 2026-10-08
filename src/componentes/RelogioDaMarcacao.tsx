/**
 * O RELÓGIO DA MARCAÇÃO — horas, minutos e segundos na tela de bater.
 *
 * Anexo IX da Portaria 671/2021, item 3: "todo coletor de marcação de
 * registro de ponto conectado ao REP-P deve exibir relógio não-analógico
 * contendo horas, minutos e segundos no momento da marcação".
 *
 * A hora é a SINCRONIZADA com o servidor (`relogio.ts`), no fuso de
 * Brasília — a mesma fonte da hora que o banco grava —, e não a do
 * aparelho, que qualquer um muda em três toques. Enquanto a sincronização
 * não aconteceu, o relógio diz que mostra a hora do aparelho.
 */
import React, { useEffect, useState } from 'react';
import { agora, estaSincronizado } from '../servicos/relogio';

const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** "07:31:45" — horas, minutos e segundos de Brasília. */
export const horaDoRelogio = (instante: Date): string => FORMATO.format(instante);

export const RelogioDaMarcacao: React.FC = () => {
  const [instante, setInstante] = useState(() => agora());

  useEffect(() => {
    // Acerta no começo do próximo segundo, para os segundos virarem juntos com o servidor
    let intervalo: ReturnType<typeof setInterval> | undefined;
    const primeiro = setTimeout(() => {
      setInstante(agora());
      intervalo = setInterval(() => setInstante(agora()), 1000);
    }, 1000 - (agora().getTime() % 1000));
    return () => {
      clearTimeout(primeiro);
      if (intervalo) clearInterval(intervalo);
    };
  }, []);

  const sincronizado = estaSincronizado();
  return (
    <div id="relogio-da-marcacao" className="text-right leading-none flex-shrink-0" aria-live="off">
      <time
        dateTime={instante.toISOString()}
        className="block text-lg font-black text-[var(--c-texto)] tabular-nums tracking-tight"
      >
        {horaDoRelogio(instante)}
      </time>
      <span className="block mt-1 text-[10px] font-semibold text-[var(--c-texto-3)]">
        {sincronizado ? 'Horário de Brasília' : 'Hora do aparelho'}
      </span>
    </div>
  );
};
