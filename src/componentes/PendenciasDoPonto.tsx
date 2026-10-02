/**
 * PENDÊNCIAS DO PONTO — "Sem bater hoje", "Pontos incompletos" e "Aprovar
 * jornadas" numa aba só (Elias, 03/10/2026).
 *
 * Eram três abas lado a lado na faixa do Gerenciar, cada uma com o seu
 * número. As três respondem à mesma pergunta — o que do ponto da equipe
 * precisa de mim — em três momentos do dia:
 *
 *   hoje         quem ainda não bateu        → chamar a pessoa
 *   dias atrás   quem bateu e não fechou     → completar o dia
 *   dia fechado  o que saiu fora da carga    → decidir
 *
 * Agora é uma aba, com a soma no número dela, e um seletor de três partes
 * no topo, cada parte com o seu número. Uma parte por vez: empilhar as três
 * era trocar três abas por uma rolagem enorme. O que cada parte faz não
 * mudou — são as mesmas telas de antes.
 */
import React from 'react';
import { CalendarClock, CheckSquare, UserX } from 'lucide-react';
import { Colaborador } from '../tipos';
import { SemBaterHoje } from './SemBaterHoje';
import { PontosIncompletos } from './PontosIncompletos';
import { AprovacaoJornada } from './AprovacaoJornada';

export const VISTAS_DE_PENDENCIA = ['sem_bater', 'incompletos', 'aprovar'] as const;
export type VistaDePendencia = (typeof VISTAS_DE_PENDENCIA)[number];

/**
 * A parte que abre primeiro: a primeira com alguma coisa, na ordem do dia.
 * Tudo zerado, abre em "Aprovar jornadas" — o que diz "nada para decidir".
 */
export const vistaInicialDasPendencias = (totais: Record<VistaDePendencia, number>): VistaDePendencia =>
  VISTAS_DE_PENDENCIA.find((v) => totais[v] > 0) ?? 'aprovar';

/**
 * O número da aba Pendências: só o que pede DECISÃO do gestor. "Sem bater"
 * fica de fora — é informação que muda a manhã inteira, e somada fazia a
 * mesma fila aparecer como 19, 9+ e 38 em três lugares da mesma tela.
 */
export const contadorDasPendencias = (totais: Record<VistaDePendencia, number>): number =>
  totais.incompletos + totais.aprovar;

const PARTES: Record<VistaDePendencia, { rotulo: string; curto: string; icone: React.ReactNode }> = {
  sem_bater: { rotulo: 'Sem bater hoje', curto: 'Sem bater', icone: <UserX className="w-4 h-4" /> },
  incompletos: { rotulo: 'Pontos incompletos', curto: 'Incompletos', icone: <CalendarClock className="w-4 h-4" /> },
  aprovar: { rotulo: 'Aprovar jornadas', curto: 'Aprovar', icone: <CheckSquare className="w-4 h-4" /> },
};

export const PendenciasDoPonto: React.FC<{
  colaboradorAtual: Colaborador;
  vista: VistaDePendencia;
  aoEscolherVista: (vista: VistaDePendencia) => void;
  totais: Record<VistaDePendencia, number>;
  semBaterHoje: Colaborador[];
  aoMudarIncompletos: (total: number) => void;
  aoAbrirConversa: (colegaId: string) => void;
}> = ({ colaboradorAtual, vista, aoEscolherVista, totais, semBaterHoje, aoMudarIncompletos, aoAbrirConversa }) => (
  <div className="flex flex-col gap-4">
    {/*
      O SELETOR: três partes do mesmo tamanho, cada uma com o seu número.
      No celular o rótulo encurta ("Sem bater", "Incompletos", "Aprovar")
      para as três caberem numa linha, sem rolar de lado.
    */}
    <div role="tablist" aria-label="Pendências do ponto" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[var(--c-superficie-2)]">
      {VISTAS_DE_PENDENCIA.map((v) => {
        const ativa = v === vista;
        const total = totais[v];
        return (
          <button
            key={v}
            type="button"
            role="tab"
            id={`pendencias-${v}`}
            aria-selected={ativa}
            onClick={() => aoEscolherVista(v)}
            className={`min-h-[52px] px-2 py-1.5 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 transition-all ${
              ativa
                ? 'bg-[var(--c-superficie)] shadow-[var(--s-1)] text-[var(--c-texto)]'
                : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="hidden sm:inline-flex">{PARTES[v].icone}</span>
              <span className="text-xs font-bold whitespace-nowrap">
                <span className="sm:hidden">{PARTES[v].curto}</span>
                <span className="hidden sm:inline">{PARTES[v].rotulo}</span>
              </span>
            </span>
            <span
              className={`min-w-[1.5rem] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums flex items-center justify-center ${
                total > 0
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {total}
            </span>
          </button>
        );
      })}
    </div>

    <div role="tabpanel" aria-labelledby={`pendencias-${vista}`}>
      {vista === 'sem_bater' ? (
        <SemBaterHoje pessoas={semBaterHoje} aoAbrirConversa={aoAbrirConversa} />
      ) : vista === 'incompletos' ? (
        <PontosIncompletos colaboradorAtual={colaboradorAtual} aoMudarTotal={aoMudarIncompletos} />
      ) : (
        <div className="-m-4 sm:-m-6">
          <AprovacaoJornada colaboradorAtual={colaboradorAtual} />
        </div>
      )}
    </div>
  </div>
);
