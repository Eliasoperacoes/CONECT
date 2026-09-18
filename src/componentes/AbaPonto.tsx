/**
 * Aba Ponto — CONECTA / Malachias Autopeças
 *
 * O que o funcionário vê do próprio banco de horas: a jornada de hoje, um botão
 * único que já sabe qual marcação vem agora, o saldo acumulado e o histórico
 * dos últimos dias.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  QrCode,
  CheckCircle2,
  CircleDashed,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Pencil,
  Coffee,
  LogIn,
  LogOut,
} from 'lucide-react';
import {
  Colaborador,
  JornadaDia,
  RegistroPonto,
  TipoMarcacao,
  ORDEM_MARCACOES,
  ROTULO_MARCACAO,
  ehMarcacaoCorrigida,
} from '../tipos';
import {
  servicoPonto,
  dataDeHoje,
  formatarDiaCurto,
  formatarMinutos,
  formatarSaldo,
} from '../servicos/ponto';
import { ModalBaterPonto } from './ModalBaterPonto';
import { AbaJustificar } from './AbaJustificar';

interface PropsAbaPonto {
  colaboradorAtual: Colaborador;
  /**
   * O código que veio no endereço, quando a pessoa chegou aqui pelo QR.
   *
   * Existe para o caminho ser um toque só: a câmera lê o cartaz, o sistema
   * abre e a batida já está pronta para confirmar. Antes o QR mostrava um
   * texto na tela da câmera e a pessoa ainda tinha de abrir o CONECTA na
   * mão e procurar esta aba.
   */
  codigoDoEndereco?: string | null;
  /** Avisa que o código já foi usado, para ele não valer de novo ao voltar. */
  aoConsumirCodigo?: () => void;
}

const ICONE_MARCACAO: Record<TipoMarcacao, React.ComponentType<{ className?: string }>> = {
  entrada: LogIn,
  saida_almoco: Coffee,
  retorno_almoco: Coffee,
  saida: LogOut,
};

export const AbaPonto: React.FC<PropsAbaPonto> = ({
  colaboradorAtual,
  codigoDoEndereco,
  aoConsumirCodigo,
}) => {
  const [secao, setSecao] = useState<'bater' | 'justificar'>('bater');
  const [modalAberto, setModalAberto] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * Chegou pelo QR: abre a batida na hora.
   *
   * O código é consumido no mesmo instante em que abre a caixa. Sem isso,
   * sair do modal e voltar para esta aba reabriria a batida sozinho, para
   * sempre.
   */
  useEffect(() => {
    if (!codigoDoEndereco) return;
    setSecao('bater');
    setModalAberto(true);
    aoConsumirCodigo?.();
  }, [codigoDoEndereco]);
  // Muda a cada alteração no ponto, forçando o recálculo dos dados derivados
  const [versaoDados, setVersaoDados] = useState(0);

  useEffect(() => {
    const cancelar = servicoPonto.assinarAlteracoes(() => setVersaoDados((v) => v + 1));
    return () => cancelar();
  }, []);

  const hoje = dataDeHoje();

  const jornadaHoje: JornadaDia = useMemo(
    () => servicoPonto.obterJornadaDoDia(colaboradorAtual.id, hoje),
    [colaboradorAtual.id, hoje, versaoDados]
  );

  const proximaMarcacao = useMemo(
    () => servicoPonto.obterProximaMarcacao(colaboradorAtual.id, hoje),
    [colaboradorAtual.id, hoje, versaoDados]
  );

  /**
   * O CICLO DA SEMANA, que é a unidade do banco de horas.
   *
   * Sem isto a pessoa batia o ponto e não sabia como estava: via o dia
   * (que não decide nada) e o acumulado do mês (que não diz o que fazer
   * hoje). A pergunta dela é "estou em dia nesta semana?".
   */
  const semana = useMemo(
    () => servicoPonto.apurarSemana(colaboradorAtual.id, dataDeHoje()),
    [colaboradorAtual.id, versaoDados]
  );

  const saldoAcumulado = useMemo(
    () => servicoPonto.obterSaldoAcumulado(colaboradorAtual.id),
    [colaboradorAtual.id, versaoDados]
  );

  const historico: JornadaDia[] = useMemo(() => {
    return servicoPonto
      .obterDatasComRegistro(colaboradorAtual.id)
      .filter((data) => data !== hoje)
      .slice(0, 15)
      .map((data) => servicoPonto.obterJornadaDoDia(colaboradorAtual.id, data));
  }, [colaboradorAtual.id, hoje, versaoDados]);

  const aoRegistrar = (registro: RegistroPonto) => {
    setToast(`${ROTULO_MARCACAO[registro.tipo]} registrada às ${registro.horaFormatada}.`);
    setTimeout(() => setToast(null), 3500);
  };

  const jornadaCompleta = proximaMarcacao === null;

  return (
    <div className="pb-24">
      {/*
        Seletor entre bater ponto e justificar ausência.

        Justificar é o caminho do que NÃO passa por batida — atestado, falta,
        comparecimento. Fica aqui, junto do ponto, porque é onde a pessoa
        procura quando o assunto é jornada; numa aba distante ninguém acharia.
      */}
      <div className="px-4 pt-4">
        <div className="flex items-center bg-[var(--c-canvas)] border border-[var(--c-borda)] p-1 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setSecao('bater')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              secao === 'bater'
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                : 'text-[var(--c-texto-2)]'
            }`}
          >
            Meu ponto
          </button>
          <button
            type="button"
            onClick={() => setSecao('justificar')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              secao === 'justificar'
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                : 'text-[var(--c-texto-2)]'
            }`}
          >
            Justificar ausência
          </button>
        </div>
      </div>

      {secao === 'justificar' && <AbaJustificar colaboradorAtual={colaboradorAtual} />}

      <div className={secao === 'bater' ? '' : 'hidden'}>
      {/* Cartão do dia */}
      <div className="p-4">
        <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-[var(--c-borda)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
              <span className="text-xs font-bold text-[var(--c-texto)] uppercase tracking-wider truncate">
                Jornada de hoje
              </span>
            </div>
            <span className="text-[11px] font-mono text-[var(--c-texto-3)] flex-shrink-0">
              {formatarDiaCurto(hoje)}
            </span>
          </div>

          {/* As quatro marcações */}
          <div className="grid grid-cols-4 divide-x divide-[var(--c-borda)]">
            {ORDEM_MARCACOES.map((tipo) => {
              const registro = jornadaHoje.marcacoes[tipo];
              const ehProxima = proximaMarcacao === tipo;
              const Icone = ICONE_MARCACAO[tipo];

              return (
                <div
                  key={tipo}
                  id={`marcacao-hoje-${tipo}`}
                  className={`p-2.5 flex flex-col items-center gap-1 text-center transition-colors ${
                    ehProxima ? 'bg-[var(--c-acento-suave)]' : ''
                  }`}
                >
                  <Icone
                    className={`w-4 h-4 ${
                      registro
                        ? 'text-emerald-600'
                        : ehProxima
                        ? 'text-[var(--c-acento)]'
                        : 'text-[var(--c-texto-3)]'
                    }`}
                  />
                  <span
                    className={`text-sm font-black tabular-nums ${
                      registro ? 'text-[var(--c-texto)]' : 'text-[var(--c-texto-3)]'
                    }`}
                  >
                    {registro ? registro.horaFormatada : '--:--'}
                  </span>
                  <span className="text-[9px] leading-tight text-[var(--c-texto-3)] font-medium">
                    {ROTULO_MARCACAO[tipo].replace(' para almoço', ' almoço').replace(' do almoço', ' almoço')}
                  </span>
                  {registro && ehMarcacaoCorrigida(registro.metodo) && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[8px] font-bold text-amber-600"
                      title={`Corrigido por ${registro.ajustadoPorNome}: ${registro.justificativa}`}
                    >
                      {/*
                        Dizia sempre "RH". Agora o líder também corrige, e o
                        selo tem de dizer a verdade — quem corrigiu está no
                        próprio registro.
                      */}
                      <Pencil className="w-2.5 h-2.5" /> Corrigido
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Totais do dia */}
          <div className="px-4 py-2.5 bg-[var(--c-superficie-2)] border-t border-[var(--c-borda)] flex items-center justify-between text-xs">
            <span className="text-[var(--c-texto-3)] font-medium">
              Trabalhado:{' '}
              <strong className="text-[var(--c-texto)] tabular-nums">
                {formatarMinutos(jornadaHoje.minutosTrabalhados)}
              </strong>
            </span>
            {/*
              O SALDO DO DIA SAIU DAQUI.
              
              Ele ficava vermelho a manhã inteira — a pessoa tinha trabalhado
              duas horas de oito, e a tela dizia "-6h00" como se fosse
              dívida. Não é: o dia só fecha à tarde, e o que decide é a
              SEMANA. Mostrar um número que não decide nada, em vermelho, só
              ensina a desconfiar do sistema.
              
              O saldo que importa está logo abaixo, no cartão do ciclo.
            */}
            <span className="text-[var(--c-texto-3)] font-medium">
              Previsto hoje:{' '}
              <strong className="text-[var(--c-texto)] tabular-nums">
                {formatarMinutos(jornadaHoje.minutosPrevistos)}
              </strong>
            </span>
          </div>
        </div>

        {/* Ação principal */}
        <button
          type="button"
          id="botao-bater-ponto"
          onClick={() => setModalAberto(true)}
          disabled={jornadaCompleta}
          className={`mt-3 w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-md ${
            jornadaCompleta
              ? 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] border border-[var(--c-borda)] cursor-not-allowed shadow-none'
              : 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] hover:brightness-110 active:scale-[0.99]'
          }`}
        >
          {jornadaCompleta ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Jornada de hoje concluída
            </>
          ) : (
            <>
              <QrCode className="w-5 h-5" />
              Registrar {proximaMarcacao ? ROTULO_MARCACAO[proximaMarcacao].toLowerCase() : 'ponto'}
            </>
          )}
        </button>

        {!jornadaCompleta && (
          <p className="mt-2 text-center text-[11px] text-[var(--c-texto-3)] leading-relaxed">
            Aponte a câmera para o QR afixado na loja {colaboradorAtual.loja}.
          </p>
        )}
      </div>

      {/* Saldo do banco de horas */}
      <div className="px-4">
        <div
          className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
            saldoAcumulado >= 0
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-red-500/5 border-red-500/20'
          }`}
        >
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider block">
              Banco de horas
            </span>
            <span className="text-xs text-[var(--c-texto-3)]">
              {saldoAcumulado >= 0 ? 'Horas a seu favor' : 'Horas a compensar'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saldoAcumulado >= 0 ? (
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
            <span
              className={`text-2xl font-black tabular-nums tracking-tight ${
                saldoAcumulado >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {formatarSaldo(saldoAcumulado)}
            </span>
          </div>
        </div>

        {/*
          A SEMANA, DENTRO DO MESMO CARTÃO.

          Um segundo cartão diria a mesma coisa em dois lugares — o acumulado
          é a soma das semanas. Aqui é uma linha a mais no cartão que já
          existe: o total em cima, e como vai a semana corrente embaixo.

          É a pergunta que a pessoa faz ao bater o ponto: "estou em dia
          nesta semana?". O acumulado do mês não responde isso.
        */}
        <div className="mt-2 px-1">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider">
              Nesta semana
            </span>
            <span className="text-xs text-[var(--c-texto-2)] tabular-nums">
              <strong className="text-[var(--c-texto)]">
                {formatarMinutos(semana.minutosTrabalhados)}
              </strong>{' '}
              de {formatarMinutos(semana.minutosPrevistos)}
            </span>
          </div>

          <div className="h-2 rounded-full bg-[var(--c-superficie-2)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                semana.saldoMinutos >= 0 ? 'bg-emerald-500' : 'bg-[var(--c-acento)]'
              }`}
              style={{
                width: `${
                  semana.minutosPrevistos > 0
                    ? Math.min(
                        Math.round(
                          (semana.minutosTrabalhados / semana.minutosPrevistos) * 100
                        ),
                        100
                      )
                    : 0
                }%`,
              }}
            />
          </div>

          {/*
            Falta de BATIDA é diferente de falta de hora: a primeira a pessoa
            resolve sozinha, avisando o responsável; a segunda se resolve
            trabalhando. Dizer as duas como "débito" faria ela tentar
            compensar uma hora que na verdade ela trabalhou e esqueceu de
            registrar.
          */}
          {semana.diasComPendencia.length > 0 && (
            <span className="block mt-1.5 text-[11px] text-amber-600 font-semibold">
              {semana.diasComPendencia.length}{' '}
              {semana.diasComPendencia.length === 1 ? 'dia' : 'dias'} com batida faltando
              — avise seu responsável
            </span>
          )}
        </div>
      </div>

      {/* Histórico */}
      <div className="mt-5">
        <div className="px-4 py-2 flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          <span className="text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
            Dias anteriores
          </span>
        </div>

        {historico.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--c-texto-3)]">
            Nenhum dia registrado ainda. Suas marcações aparecem aqui.
          </p>
        ) : (
          <div className="divide-y divide-[var(--c-borda)] border-y border-[var(--c-borda)] bg-[var(--c-superficie)]">
            {historico.map((jornada) => (
              <div key={jornada.data} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-shrink-0">
                  {jornada.completa ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-amber-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-[var(--c-texto)] block capitalize">
                    {formatarDiaCurto(jornada.data)}
                  </span>
                  <span className="text-[11px] text-[var(--c-texto-3)] font-mono block truncate">
                    {ORDEM_MARCACOES.map((t) => jornada.marcacoes[t]?.horaFormatada || '--:--').join(
                      ' · '
                    )}
                  </span>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="text-xs font-bold text-[var(--c-texto)] tabular-nums block">
                    {formatarMinutos(jornada.minutosTrabalhados)}
                  </span>
                  {jornada.minutosTrabalhados > 0 ? (
                    <span
                      className={`text-[11px] font-bold tabular-nums ${
                        jornada.saldoMinutos >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {formatarSaldo(jornada.saldoMinutos)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-600 font-semibold">Incompleto</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalBaterPonto
        aberto={modalAberto}
        codigoInicial={codigoDoEndereco || undefined}
        rotuloProximaMarcacao={proximaMarcacao ? ROTULO_MARCACAO[proximaMarcacao] : null}
        aoFechar={() => setModalAberto(false)}
        aoRegistrar={aoRegistrar}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--c-superficie)] text-[var(--c-texto)] border border-[var(--c-borda)] shadow-xl px-4 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-3 fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          {toast}
        </div>
      )}
      </div>
    </div>
  );
};
