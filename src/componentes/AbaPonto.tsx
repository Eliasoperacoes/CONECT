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
  ChevronDown,
  ChevronUp,
  Utensils,
  UtensilsCrossed,
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

/**
 * "2026-09" vira "Setembro de 2026".
 *
 * Montado com `Date` no dia 15 de propósito: o dia 1 vira o último dia
 * do mês anterior em fuso negativo, e o mês do seletor sairia trocado
 * — o mesmo defeito que já apareceu no espelho de ponto.
 */
const nomeDoMes = (mes: string): string => {
  const [ano, m] = mes.split('-');
  const nome = new Date(Number(ano), Number(m) - 1, 15).toLocaleDateString('pt-BR', {
    month: 'long',
  });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
};

/**
 * PRATO, E NÃO XÍCARA.
 *
 * As duas marcações do almoço vinham com um copo de café. O intervalo
 * do balcão é a refeição — uma a duas horas —, e no celular, onde o
 * ícone é maior do que o texto, a xícara dizia "pausa do cafezinho".
 *
 * Os talheres CRUZADOS marcam a saída: é a convenção de "parou". Os
 * talheres postos marcam a volta. São o mesmo prato de propósito, e se
 * distinguem pelo estado — dois ícones sem relação nenhuma obrigariam a
 * ler o rótulo para saber qual é qual.
 */
const ICONE_MARCACAO: Record<TipoMarcacao, React.ComponentType<{ className?: string }>> = {
  entrada: LogIn,
  saida_almoco: UtensilsCrossed,
  retorno_almoco: Utensils,
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

  /**
   * O HISTÓRICO É POR MÊS, e não pelos últimos quinze dias.
   *
   * Quinze é um número sem significado nenhum para quem bate ponto: o
   * que ele confere é o mês, que é o período do espelho e o do
   * pagamento. Quinze dias cortam o mês ao meio — quem procurava o dia
   * 3 no fim do mês simplesmente não o achava, e não havia como saber
   * que faltava.
   *
   * Agora cada mês vem inteiro, com os seus 28, 30 ou 31 dias, e o
   * seletor troca de mês.
   */
  const mesesComRegistro = useMemo(() => {
    const meses = new Set(
      servicoPonto
        .obterDatasComRegistro(colaboradorAtual.id)
        .map((data) => data.slice(0, 7))
    );
    // O mês corrente entra mesmo sem batida nenhuma: é onde a pessoa cai
    meses.add(hoje.slice(0, 7));
    return [...meses].sort((a, b) => b.localeCompare(a));
  }, [colaboradorAtual.id, hoje, versaoDados]);

  const [mesEscolhido, setMesEscolhido] = useState(() => hoje.slice(0, 7));

  const historico: JornadaDia[] = useMemo(() => {
    return servicoPonto
      .obterDatasComRegistro(colaboradorAtual.id)
      .filter((data) => data !== hoje && data.startsWith(mesEscolhido))
      .map((data) => servicoPonto.obterJornadaDoDia(colaboradorAtual.id, data));
  }, [colaboradorAtual.id, hoje, mesEscolhido, versaoDados]);

  /**
   * COMEÇA RECOLHIDO.
   *
   * São até 31 linhas numa tela de celular — mais alto do que tudo o
   * que vem acima somado, e empurrando para fora o botão de bater
   * ponto, que é a razão de a pessoa abrir esta aba.
   *
   * Recolhido não esconde o que importa: o resumo do mês fica à vista.
   */
  const [historicoAberto, setHistoricoAberto] = useState(false);

  /** O resumo do mês escolhido — é o que se lê com a lista fechada. */
  const resumoDoMes = useMemo(
    () => ({
      dias: historico.length,
      saldo: historico.reduce((t, j) => t + j.saldoMinutos, 0),
      incompletos: historico.filter((j) => !j.completa).length,
    }),
    [historico]
  );

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

      {/* Histórico do mês */}
      <div className="mt-5">
        <div className="px-4 pb-2 flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-[var(--c-texto-3)] shrink-0" />
          <span className="text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
            Dias anteriores
          </span>

          <div className="flex-1" />

          {/*
            O SELETOR DE MÊS.

            Nativo de propósito: no celular ele abre a roda do sistema,
            que se gira com o polegar. Uma lista desenhada por mim seria
            mais bonita e pior de usar com uma mão só.
          */}
          <select
            value={mesEscolhido}
            onChange={(e) => setMesEscolhido(e.target.value)}
            aria-label="Mês"
            className="px-2 py-1 text-[11px] font-bold bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-lg text-[var(--c-texto-2)]"
          >
            {mesesComRegistro.map((mes) => (
              <option key={mes} value={mes}>
                {nomeDoMes(mes)}
              </option>
            ))}
          </select>
        </div>

        {/*
          O cabeçalho que recolhe. Com a lista fechada ele é o resumo do
          mês — dias, saldo e quantos ficaram incompletos —, que é o que
          a pessoa vem conferir antes de olhar dia a dia.
        */}
        <button
          type="button"
          onClick={() => setHistoricoAberto((v) => !v)}
          className="w-full px-4 py-2.5 border-y border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center gap-2 text-left active:bg-[var(--c-superficie-2)] transition-colors"
        >
          {historicoAberto ? (
            <ChevronUp className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
          )}

          <span className="text-xs font-bold text-[var(--c-texto)]">
            {resumoDoMes.dias} {resumoDoMes.dias === 1 ? 'dia' : 'dias'}
          </span>

          {resumoDoMes.incompletos > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-700 border-amber-500/20">
              {resumoDoMes.incompletos} incompleto
              {resumoDoMes.incompletos === 1 ? '' : 's'}
            </span>
          )}

          <div className="flex-1" />

          <span
            className={`text-xs font-bold tabular-nums ${
              resumoDoMes.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {formatarSaldo(resumoDoMes.saldo)}
          </span>
        </button>

        {!historicoAberto ? null : historico.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--c-texto-3)] border-b border-[var(--c-borda)] bg-[var(--c-superficie)]">
            Nenhum dia registrado em {nomeDoMes(mesEscolhido)}.
          </p>
        ) : (
          <div className="divide-y divide-[var(--c-borda)] border-b border-[var(--c-borda)] bg-[var(--c-superficie)]">
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
