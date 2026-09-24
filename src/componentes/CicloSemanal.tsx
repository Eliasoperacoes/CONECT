/**
 * O ciclo da semana — CONECTA / Malachias Autopeças
 *
 * O que o líder abre no sábado: o ciclo que fechou na véspera, com quem
 * precisa de decisão dele em cima.
 *
 * NÃO É UMA SEGUNDA LISTA DA EQUIPE. A lista de baixo responde "como está a
 * minha equipe no mês"; esta responde "o que precisa de mim neste ciclo".
 * São perguntas diferentes, e por isso aqui só aparece quem tem pendência
 * de batida ou fechou o ciclo devendo — quem está em dia não ocupa espaço.
 *
 * A FOLGA JÁ VEM DESCONTADA. Quem tirou a folga naquele sábado específico
 * tem quatro horas a menos de previsto no ciclo e fecha em dia, sem dever
 * nada. É automático: o previsto de cada dia zera em ausência aprovada.
 */

import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  CalendarCheck,
  TrendingDown,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Colaborador } from '../tipos';
import { servicoPonto, formatarMinutos, formatarSaldo, dataDeHoje } from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  colaboradorAtual: Colaborador;
  /** Leva o ciclo para a lista de baixo, em vez de repetir a lista aqui. */
  aoEscolherPeriodo: (inicio: string, fim: string) => void;
}

/** 2026-09-12 -> "12/09" */
const curta = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

export const CicloSemanal: React.FC<Props> = ({ colaboradorAtual, aoEscolherPeriodo }) => {
  /**
   * Começa no ciclo ANTERIOR, e não no de hoje.
   *
   * A conferência é de sábado, e no sábado o ciclo do dia mal começou —
   * olhar para ele mostraria um dia só. O que interessa é o que fechou na
   * sexta.
   */
  const [deslocamento, setDeslocamento] = useState(-1);

  /**
   * A LISTA DE PENDÊNCIAS RECOLHE; OS TRÊS NÚMEROS, NÃO.
   *
   * Numa equipe grande, esta lista e a da equipe empilhadas davam dois
   * blocos longos um atrás do outro — era a queixa. Mas recolher o
   * cartão inteiro esconderia "sem bater: 4", que é justamente o aviso
   * que faz alguém abrir.
   *
   * Então o cabeçalho e os números ficam sempre; só os nomes somem.
   */
  const [listaAberta, setListaAberta] = useState(true);

  const dataDeReferencia = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + deslocamento * 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }, [deslocamento]);

  const relacao = useMemo(
    () => servicoPonto.relacaoSemanalDaEquipe(dataDeReferencia),
    [dataDeReferencia]
  );

  const totais = useMemo(() => {
    const comPendencia = relacao.linhas.filter((l) => l.diasComPendencia.length > 0);
    const devendo = relacao.linhas.filter(
      (l) => l.diasComPendencia.length === 0 && l.saldoMinutos < 0
    );
    return {
      comPendencia,
      devendo,
      folgaram: relacao.linhas.filter((l) => l.folgouNoCiclo).length,
      saldo: relacao.linhas.reduce((t, l) => t + l.saldoMinutos, 0),
    };
  }, [relacao]);

  /** Só quem precisa de decisão. Quem está em dia não ocupa a tela. */
  const precisamDeVoce = [...totais.comPendencia, ...totais.devendo];

  const ehCicloDeHoje = deslocamento === 0;

  return (
    <div className="rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] overflow-hidden">
      {/* Cabeçalho: qual ciclo, e como andar entre eles */}
      <div className="px-3.5 py-3 border-b border-[var(--c-borda)] flex flex-wrap items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-[var(--c-texto)]">
            Ciclo de {curta(relacao.inicio)} a {curta(relacao.fim)}
          </span>
          <span className="block text-[11px] text-[var(--c-texto-3)]">
            Sábado a sexta · {ehCicloDeHoje ? 'ainda em andamento' : 'fechado'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDeslocamento((d) => d - 1)}
            className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
            aria-label="Ciclo anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeslocamento((d) => Math.min(d + 1, 0))}
            disabled={ehCicloDeHoje}
            className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] disabled:opacity-40 transition-colors"
            aria-label="Próximo ciclo"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Os três números do ciclo */}
      <div className="grid grid-cols-3 divide-x divide-[var(--c-borda)] border-b border-[var(--c-borda)]">
        <div className="px-3 py-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Sem bater
          </span>
          <span
            className={`block text-lg font-extrabold ${
              totais.comPendencia.length > 0 ? 'text-amber-600' : 'text-[var(--c-texto)]'
            }`}
          >
            {totais.comPendencia.length}
          </span>
        </div>
        <div className="px-3 py-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Saldo do ciclo
          </span>
          <span
            className={`block text-lg font-extrabold ${
              totais.saldo < 0 ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {formatarSaldo(totais.saldo)}
          </span>
        </div>
        <div className="px-3 py-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            De folga
          </span>
          <span className="block text-lg font-extrabold text-[var(--c-texto)]">
            {totais.folgaram}
          </span>
        </div>
      </div>

      {/* O cabeçalho da lista diz quantos são mesmo recolhido */}
      {precisamDeVoce.length > 0 && (
        <button
          type="button"
          onClick={() => setListaAberta((v) => !v)}
          className="w-full px-3.5 py-2 flex items-center gap-2 text-left hover:bg-[var(--c-superficie-2)] transition-colors"
        >
          {listaAberta ? (
            <ChevronUp className="w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          )}
          <span className="text-[11px] font-bold text-[var(--c-texto-2)]">
            {precisamDeVoce.length}{' '}
            {precisamDeVoce.length === 1 ? 'pessoa precisa' : 'pessoas precisam'} de
            você
          </span>
        </button>
      )}

      <div className="p-2.5 flex flex-col gap-1.5">
        {precisamDeVoce.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-5 text-xs text-[var(--c-texto-3)]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Ninguém com pendência neste ciclo.
          </div>
        ) : !listaAberta ? null : (
          precisamDeVoce.map((linha) => {
            const c = linha.colaborador;
            const temPendencia = linha.diasComPendencia.length > 0;

            return (
              <div
                key={c.id}
                className={`px-2.5 py-2 rounded-xl flex items-center gap-2.5 ${
                  temPendencia
                    ? 'bg-amber-500/10 border border-amber-500/25'
                    : 'bg-[var(--c-canvas)]'
                }`}
              >
                <FotoPresenca
                  foto={c.foto}
                  nome={c.nome}
                  presenca={c.presenca}
                  tamanho="w-8 h-8"
                />

                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-[var(--c-texto)] truncate">
                    {c.nome}
                  </span>
                  <span className="block text-[11px] text-[var(--c-texto-3)] truncate">
                    {formatarMinutos(linha.minutosTrabalhados)} de{' '}
                    {formatarMinutos(linha.minutosPrevistos)}
                    {linha.folgouNoCiclo && ' · folgou no sábado'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {temPendencia ? (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400"
                      title={`Faltou bater em: ${linha.diasComPendencia
                        .map(curta)
                        .join(', ')}`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {linha.diasComPendencia.length}{' '}
                      {linha.diasComPendencia.length === 1 ? 'dia' : 'dias'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      <TrendingDown className="w-3.5 h-3.5" />
                      {formatarSaldo(linha.saldoMinutos)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/*
        O caminho para o detalhe é a lista de baixo, e não uma segunda lista
        aqui: repetir a equipe inteira neste cartão faria duas telas para a
        mesma coisa.
      */}
      <button
        type="button"
        onClick={() => aoEscolherPeriodo(relacao.inicio, relacao.fim)}
        className="w-full px-3.5 py-2.5 border-t border-[var(--c-borda)] flex items-center justify-center gap-1.5 text-[11px] font-bold text-[var(--c-acento)] hover:bg-[var(--c-superficie-2)] transition-colors cursor-pointer"
      >
        Ver a equipe inteira neste ciclo
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
