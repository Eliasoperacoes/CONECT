/**
 * O MÊS DO ESPELHO, num toque.
 *
 * O Elias, no dia 1º de outubro: "não existe a opção de selecionar o
 * espelho do mês passado". O período era só "De" e "Até", nascendo no dia
 * 1º do mês corrente — no começo do mês, um período de UM dia, e ver o mês
 * que acabou de fechar pedia redigitar as duas datas.
 *
 * Agora o mês vem primeiro, numa lista: o atual (em andamento) e os doze
 * anteriores. As datas continuam ali para o período fora do mês cheio, e
 * quando elas não formam um mês a lista diz "Período personalizado".
 *
 * Os meses e os nomes saem de `meuRH.ts` — os mesmos do espelho da aba Eu.
 */
import React from 'react';
import { CalendarDays } from 'lucide-react';
import { mesesFechados, periodoDoMes, rotuloDoMes } from '../servicos/meuRH';
import { dataDeHoje } from '../servicos/ponto';

interface Props {
  dataInicio: string;
  dataFim: string;
  aoEscolher: (inicio: string, fim: string) => void;
  id?: string;
  className?: string;
  /** Sem o "Mês" em cima, para caber numa linha com as datas. */
  comRotulo?: boolean;
}

const PERSONALIZADO = '';

/** O período de um mês na lista: o corrente vai só até hoje — o resto ainda não aconteceu. */
export const periodoDoMesNaLista = (mes: string, hoje: string): { inicio: string; fim: string } => {
  const { inicio, fim } = periodoDoMes(mes);
  return { inicio, fim: fim > hoje ? hoje : fim };
};

/** Qual mês da lista estas datas formam — ou nenhum. */
export const mesDoPeriodo = (inicio: string, fim: string, hoje: string): string => {
  const mes = inicio.slice(0, 7);
  const esperado = periodoDoMesNaLista(mes, hoje);
  return esperado.inicio === inicio && esperado.fim === fim ? mes : PERSONALIZADO;
};

export const SeletorDeMes: React.FC<Props> = ({
  dataInicio,
  dataFim,
  aoEscolher,
  id = 'seletor-de-mes',
  className = '',
  comRotulo = true,
}) => {
  const hoje = dataDeHoje();
  const atual = hoje.slice(0, 7);
  const meses = [atual, ...mesesFechados(hoje)];
  const escolhido = mesDoPeriodo(dataInicio, dataFim, hoje);

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={comRotulo ? 'text-[11px] font-semibold text-[var(--c-texto-3)] block mb-1' : 'sr-only'}
      >
        Mês
      </label>
      <div className="relative">
        <CalendarDays className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)] pointer-events-none" />
        <select
          id={id}
          value={escolhido}
          onChange={(e) => {
            if (!e.target.value) return;
            const { inicio, fim } = periodoDoMesNaLista(e.target.value, hoje);
            aoEscolher(inicio, fim);
          }}
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
        >
          {meses.map((mes) => (
            <option key={mes} value={mes}>
              {rotuloDoMes(mes)}
              {mes === atual ? ' (em andamento)' : ''}
            </option>
          ))}
          {escolhido === PERSONALIZADO && (
            <option value={PERSONALIZADO}>Período personalizado</option>
          )}
        </select>
      </div>
    </div>
  );
};
