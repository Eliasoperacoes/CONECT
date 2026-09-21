/**
 * Painel de RH — CONECTA / Malachias Autopeças
 *
 * O QUE ESTA TELA É
 *
 * O lugar de quem cuida de pessoas: indicadores, holerite, atestado,
 * advertência, escala e espelho de ponto. É a tela da Dani.
 *
 * O QUE ELA NÃO FAZ: repetir o que já existe.
 *
 * Escala de folgas e espelho de ponto já eram alcançáveis pelo painel de
 * gestão. Em vez de copiá-los para cá, eles MUDARAM DE LUGAR para quem
 * cuida de pessoas — a mesma tela, um dono só. Duas portas para a mesma
 * sala é o que faz a pessoa perder tempo descobrindo qual das duas é a
 * certa, e é o defeito que já custou caro neste sistema.
 *
 * Os indicadores do topo não são enfeite: cada um deles é uma pergunta que
 * o RH faz toda semana, e todos levam para o lugar onde se resolve.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  FileText,
  CalendarDays,
  AlertTriangle,
  Stethoscope,
  Receipt,
  ClipboardList,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';
import { Colaborador } from '../tipos';
import {
  servicoPonto,
  formatarSaldo,
  dataDeHoje,
} from '../servicos/ponto';
import { bancoDados } from '../servicos/bancoDados';
import {
  lerJustificativas,
  assinarJustificativas,
} from '../servicos/justificativasCache';
import { EscalaDeFolgas } from './EscalaDeFolgas';
import { CalendarioFeriados } from './CalendarioFeriados';
import { BancoDeHoras } from './BancoDeHoras';
import { AbaHolerites } from './AbaHolerites';
import { AbaAdvertencias } from './AbaAdvertencias';
import { AbaAtestados } from './AbaAtestados';

type Secao =
  | 'painel'
  | 'holerites'
  | 'atestados'
  | 'advertencias'
  | 'escala'
  | 'calendario'
  | 'espelhos';

interface Props {
  colaboradorAtual: Colaborador;
}

/** Um número do painel, com o que ele quer dizer e para onde ele leva. */
const Indicador: React.FC<{
  rotulo: string;
  valor: React.ReactNode;
  detalhe: string;
  icone: React.ReactNode;
  alerta?: boolean;
  aoAbrir?: () => void;
}> = ({ rotulo, valor, detalhe, icone, alerta, aoAbrir }) => (
  <button
    type="button"
    onClick={aoAbrir}
    disabled={!aoAbrir}
    className={`text-left p-3.5 rounded-2xl border transition-colors ${
      alerta
        ? 'bg-amber-500/5 border-amber-500/25'
        : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
    } ${aoAbrir ? 'cursor-pointer hover:border-[var(--c-acento)]/40' : 'cursor-default'}`}
  >
    <div className="flex items-center gap-1.5 mb-1.5 text-[var(--c-texto-3)]">
      {icone}
      <span className="text-[10px] font-bold uppercase tracking-wider">{rotulo}</span>
    </div>
    <div
      className={`text-2xl font-black tracking-tight ${
        alerta ? 'text-amber-600' : 'text-[var(--c-texto)]'
      }`}
    >
      {valor}
    </div>
    <span className="block text-[11px] text-[var(--c-texto-3)] leading-snug mt-0.5">
      {detalhe}
    </span>
  </button>
);

export const PainelRH: React.FC<Props> = ({ colaboradorAtual }) => {
  const [secao, setSecao] = useState<Secao>('painel');
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const cancelarPonto = servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1));
    const cancelarAusencias = assinarJustificativas(() => setVersao((v) => v + 1));
    return () => {
      cancelarPonto();
      cancelarAusencias();
    };
  }, []);

  /**
   * OS NÚMEROS DA SEMANA.
   *
   * Todos saem do que o sistema já sabe — nenhum deles é digitado por
   * ninguém. Indicador que depende de alguém lembrar de atualizar está
   * errado no dia seguinte.
   */
  const numeros = useMemo(() => {
    void versao;

    const pessoas = bancoDados.obterColaboradores().filter((c) => c.ativo !== false);
    const ciclo = servicoPonto.relacaoSemanalDaEquipe(dataDeHoje());

    const comPendencia = ciclo.linhas.filter((l) => l.diasComPendencia.length > 0);
    const saldoDaRede = ciclo.linhas.reduce((t, l) => t + l.saldoMinutos, 0);

    const justificativas = lerJustificativas();
    const mesAtual = dataDeHoje().slice(0, 7);

    const atestadosDoMes = justificativas.filter(
      (j) => j.tipo === 'atestado' && j.dataInicio.slice(0, 7) === mesAtual
    );
    const aguardando = justificativas.filter((j) => j.estado === 'pendente');

    /**
     * Sem organograma, a pessoa não tem aprovador — e ninguém percebe até a
     * hora dela ficar parada. É o número que o RH precisa zerar antes de
     * qualquer outro.
     */
    const semResponsavel = pessoas.filter(
      (c) => !c.responsavelId && c.id !== colaboradorAtual.id
    );

    return {
      pessoas: pessoas.length,
      comPendencia: comPendencia.length,
      saldoDaRede,
      atestadosDoMes: atestadosDoMes.length,
      aguardando: aguardando.length,
      semResponsavel: semResponsavel.length,
    };
  }, [versao, colaboradorAtual.id]);

  const abas: Array<{ id: Secao; rotulo: string; icone: React.ReactNode; alerta?: boolean }> = [
    { id: 'painel', rotulo: 'Painel', icone: <ClipboardList className="w-3.5 h-3.5" /> },
    { id: 'holerites', rotulo: 'Holerites', icone: <Receipt className="w-3.5 h-3.5" /> },
    {
      id: 'atestados',
      rotulo: 'Atestados',
      icone: <Stethoscope className="w-3.5 h-3.5" />,
      alerta: numeros.aguardando > 0,
    },
    {
      id: 'advertencias',
      rotulo: 'Advertências',
      icone: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    { id: 'escala', rotulo: 'Escala de folgas', icone: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: 'calendario', rotulo: 'Feriados', icone: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: 'espelhos', rotulo: 'Espelhos de ponto', icone: <FileText className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="w-full flex flex-col">
      {/* A barra das seções: uma linha só, e ela cabe no celular rolando */}
      <nav className="px-4 sm:px-6 pt-4 flex gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            id={`aba-rh-${aba.id}`}
            onClick={() => setSecao(aba.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${
              secao === aba.id
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)] shadow-xs'
                : 'bg-[var(--c-superficie)] text-[var(--c-texto-3)] border-[var(--c-borda)] hover:text-[var(--c-texto-2)]'
            }`}
          >
            {aba.icone}
            {aba.rotulo}
            {aba.alerta && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            )}
          </button>
        ))}
      </nav>

      {secao === 'painel' && (
        <div className="p-4 sm:p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--c-texto)]">A rede esta semana</h2>
            <p className="text-xs text-[var(--c-texto-3)]">
              Todos os números saem do que o sistema já sabe. Toque num deles para ir ao
              lugar onde se resolve.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Indicador
              rotulo="Pessoas ativas"
              valor={numeros.pessoas}
              detalhe="na rede inteira"
              icone={<Users className="w-3.5 h-3.5" />}
            />

            <Indicador
              rotulo="Sem bater"
              valor={numeros.comPendencia}
              detalhe="faltou batida em dia já fechado"
              icone={<AlertTriangle className="w-3.5 h-3.5" />}
              alerta={numeros.comPendencia > 0}
              aoAbrir={() => setSecao('espelhos')}
            />

            <Indicador
              rotulo="Saldo da rede"
              valor={formatarSaldo(numeros.saldoDaRede)}
              /**
               * "Já fechados" está escrito porque o número mudou de
               * significado: ele somava o ciclo INTEIRO, futuro incluído, e
               * numa segunda de manhã a rede aparecia devendo a semana que
               * nem tinha começado. Agora só conta dia encerrado — e o
               * rótulo diz isso, para ninguém procurar no sábado um número
               * que só fecha na sexta.
               */
              detalhe="nos dias já fechados do ciclo"
              icone={<TrendingDown className="w-3.5 h-3.5" />}
              alerta={numeros.saldoDaRede < 0}
              aoAbrir={() => setSecao('espelhos')}
            />

            <Indicador
              rotulo="Aguardando decisão"
              valor={numeros.aguardando}
              detalhe="atestados e folgas"
              icone={<Stethoscope className="w-3.5 h-3.5" />}
              alerta={numeros.aguardando > 0}
              aoAbrir={() => setSecao('atestados')}
            />

            <Indicador
              rotulo="Atestados no mês"
              valor={numeros.atestadosDoMes}
              detalhe="entregues neste mês"
              icone={<Stethoscope className="w-3.5 h-3.5" />}
              aoAbrir={() => setSecao('atestados')}
            />

            {/*
              O único indicador que não é sobre o mês, e sim sobre o cadastro.
              Sem organograma a pessoa não tem aprovador, e ninguém percebe
              até a hora dela ficar parada.
            */}
            <Indicador
              rotulo="Sem responsável"
              valor={numeros.semResponsavel}
              detalhe={
                numeros.semResponsavel > 0
                  ? 'ninguém aprova a hora dessas pessoas'
                  : 'todo mundo posicionado'
              }
              icone={
                numeros.semResponsavel > 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )
              }
              alerta={numeros.semResponsavel > 0}
            />
          </div>

          {numeros.semResponsavel > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/25 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--c-texto-2)] leading-relaxed">
                <strong className="text-[var(--c-texto)]">
                  {numeros.semResponsavel}{' '}
                  {numeros.semResponsavel === 1 ? 'pessoa está' : 'pessoas estão'} fora do
                  organograma.
                </strong>{' '}
                A hora delas não chega a nenhum líder — cai aqui, no RH. Posicione cada uma
                na aba Organograma para a aprovação seguir a cadeia.
              </p>
            </div>
          )}
        </div>
      )}

      {secao === 'holerites' && <AbaHolerites colaboradorAtual={colaboradorAtual} />}
      {secao === 'atestados' && <AbaAtestados colaboradorAtual={colaboradorAtual} />}
      {secao === 'advertencias' && <AbaAdvertencias colaboradorAtual={colaboradorAtual} />}

      {/*
        Escala e espelhos são as MESMAS telas de sempre, e não cópias. Elas
        mudaram de lugar para quem cuida de pessoas: quem tem esta aba não as
        vê mais em Equipe & Ponto, para ninguém encontrar a mesma sala por
        duas portas.
      */}
      {secao === 'escala' && (
        <div className="p-4 sm:p-6">
          <EscalaDeFolgas colaboradorAtual={colaboradorAtual} />
        </div>
      )}

      {/*
        O CALENDÁRIO FICA NO RH, e não no ADM.
        Feriado mexe no banco de horas de todo mundo — é assunto de quem
        cuida de pessoas, e é aqui que essa pessoa trabalha.
      */}
      {secao === 'calendario' && (
        <CalendarioFeriados colaboradorAtual={colaboradorAtual} />
      )}

      {secao === 'espelhos' && (
        <BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="banco_horas" />
      )}
    </div>
  );
};
