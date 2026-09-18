/**
 * Aprovação de jornada — CONECTA / Malachias Autopeças
 *
 * O segundo passo do caminho, e o que faz ele não ter atalho:
 *
 *   colaborador bate o ponto → LÍDER OU GERENTE DECIDE → banco de horas
 *
 * A fila traz só quem a pessoa responde: o líder vê o setor dele, o gerente
 * vê a loja dele, o RH vê a rede. Quem responde por alguém vê também os
 * próprios dias — quem não responde por ninguém depende do responsável.
 *
 * Aprovar é um clique; recusar exige motivo. A diferença é proposital: a
 * recusa tira horas de alguém e a pessoa vai querer saber por quê.
 *
 * E há o terceiro caminho, que é o que faz a fila não ter beco sem saída:
 * CORRIGIR. Antes dele, o responsável que via o dia fechado errado só
 * podia aprovar o errado ou recusar — e recusar não conserta o espelho.
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle, Inbox, Paperclip, Pencil } from 'lucide-react';
import {
  AjusteJornada,
  Colaborador,
  ROTULO_TIPO_AJUSTE,
  ROTULO_TIPO_AUSENCIA,
  JustificativaAusencia,
} from '../tipos';
import {
  pendenciasParaDecidir as pendenciasDeAusencia,
  decidirAusencia,
  assinarJustificativas,
} from '../servicos/justificativas';
import { servicoPonto, formatarMinutos, formatarDataBR, formatarDiaCurto } from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';
import { resolverCaminho } from '../servicos/anexos';
import { resumoDaFicha } from '../servicos/fichaColaborador';
import { ModalCorrigirJornada } from './ModalCorrigirJornada';

interface PropsAprovacaoJornada {
  colaboradorAtual: Colaborador;
}

export const AprovacaoJornada: React.FC<PropsAprovacaoJornada> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [recusando, setRecusando] = useState<AjusteJornada | null>(null);
  /** Quem e qual dia estão sendo corrigidos antes da decisão. */
  const [corrigindo, setCorrigindo] = useState<{
    colaborador: Colaborador;
    data: string;
  } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [recusandoAusencia, setRecusandoAusencia] = useState<JustificativaAusencia | null>(
    null
  );
  const [motivoAusencia, setMotivoAusencia] = useState('');

  /**
   * Levanta os dias sem fechar ao abrir a fila.
   *
   * Aqui, e nao na batida: quem esquece de bater a saida nao volta ao
   * aplicativo para avisar disso. O levantamento tem de partir de quem
   * cobra, e o momento em que ele cobra e quando abre a fila.
   */
  useEffect(() => {
    void servicoPonto.levantarDiasIncompletos();
  }, []);

  useEffect(() => {
    const cancelar = servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1));
    const cancelarAusencias = assinarJustificativas(() => setVersao((v) => v + 1));
    return () => {
      cancelar();
      cancelarAusencias();
    };
  }, []);

  const pendencias = servicoPonto.obterPendenciasParaDecidir();
  // Sem a folga: ela é decidida na Escala de folgas, com o calendário à vista
  const ausencias = pendenciasDeAusencia();
  void versao;

  const mostrar = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 4000);
  };

  const decidir = async (ajuste: AjusteJornada, aprovado: boolean, motivoRecusa?: string) => {
    setEmAndamento(ajuste.id);
    const res = await servicoPonto.decidirAjuste(ajuste.id, aprovado, motivoRecusa);
    setEmAndamento(null);

    if (res.sucesso) {
      setRecusando(null);
      setMotivo('');
      mostrar(
        aprovado
          ? 'Aprovado. As horas entraram no banco de horas.'
          : 'Recusado. As horas não entraram no banco.'
      );
    } else {
      mostrar(res.erro || 'Não foi possível registrar a decisão.', true);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-[var(--c-texto)]">Jornadas aguardando decisão</h2>
        <p className="text-xs text-[var(--c-texto-3)]">
          Dias que fecharam fora da carga contratada. Só entra no banco de horas o que você
          aprovar.
        </p>
      </div>

      {aviso && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            aviso.erro
              ? 'bg-red-500/10 border border-red-500/20 text-red-600'
              : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{aviso.texto}</span>
        </div>
      )}

      {pendencias.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col items-center text-center gap-2">
          <Inbox className="w-8 h-8 text-[var(--c-texto-3)]" />
          <span className="text-sm font-bold text-[var(--c-texto)]">Nada para decidir</span>
          <span className="text-xs text-[var(--c-texto-3)] max-w-xs">
            Quando alguém da sua equipe fechar o dia fora das horas contratadas, aparece aqui.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pendencias.map(({ ajuste, colaborador }) => {
            const ehExtra = ajuste.tipo === 'hora_extra';
            const ehDiaSemFechar = ajuste.tipo === 'dia_incompleto';
            return (
              <div
                key={ajuste.id}
                className="p-3.5 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <FotoPresenca
                  foto={colaborador.foto}
                  nome={colaborador.nome}
                  presenca={colaborador.presenca}
                  tamanho="w-10 h-10"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[var(--c-texto)] truncate">
                      {colaborador.nome}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        ehDiaSemFechar
                          ? 'bg-sky-500/10 text-sky-700 border-sky-500/20'
                          : ehExtra
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                      }`}
                    >
                      {ehDiaSemFechar ? (
                        ROTULO_TIPO_AJUSTE[ajuste.tipo]
                      ) : (
                        <>
                          {ehExtra ? '+' : '−'}
                          {formatarMinutos(ajuste.minutos)} ·{' '}
                          {ROTULO_TIPO_AJUSTE[ajuste.tipo]}
                        </>
                      )}
                    </span>
                  </div>

                  {/* Matrícula junto do nome: quem decide precisa saber de
                      qual pessoa se trata, e nome se repete na rede. */}
                  <span className="text-xs text-[var(--c-texto-3)] block">
                    {resumoDaFicha(colaborador)}
                  </span>

                  {/*
                    O MOTIVO, quando a pessoa escreveu no ato da batida.

                    Vem antes dos números de propósito: o aprovador lê "por
                    que" antes de "quanto". Sem isto ele via só
                    "trabalhou 9h10 de 8h00" e a decisão virava carimbo.
                  */}
                  {ajuste.motivoColaborador && (
                    <div className="mt-1.5 p-2 rounded-lg bg-[var(--c-canvas)] border border-[var(--c-borda)]">
                      <span className="text-[10px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider block">
                        Motivo informado
                      </span>
                      <span className="text-xs text-[var(--c-texto)]">
                        {ajuste.motivoColaborador}
                      </span>

                      {ajuste.anexoCaminho && (
                        <button
                          type="button"
                          onClick={async () => {
                            const url = await resolverCaminho(ajuste.anexoCaminho!);
                            if (url) window.open(url, '_blank');
                            else mostrar('Não foi possível abrir o comprovante.', true);
                          }}
                          className="mt-1 text-[11px] font-semibold text-[var(--c-acento)] hover:underline inline-flex items-center gap-1"
                        >
                          <Paperclip className="w-3 h-3" />
                          Ver comprovante
                        </button>
                      )}
                    </div>
                  )}

                  {/* O que a batida apurou, para a decisão não ser no escuro */}
                  <span className="text-[11px] text-[var(--c-texto-3)] block mt-1">
                    {formatarDiaCurto(ajuste.data)} ({formatarDataBR(ajuste.data)}) ·{' '}
                    trabalhou <strong className="text-[var(--c-texto-2)]">
                      {formatarMinutos(ajuste.minutosTrabalhados)}
                    </strong>{' '}
                    de {formatarMinutos(ajuste.minutosPrevistos)} previstos
                  </span>
                </div>

                {/*
                  Dia sem fechar não é "aprovar ou recusar": é decidir o que
                  o dia vale. Abonar conta como jornada normal; débito assume
                  que o dia não foi trabalhado. Recusar não significaria nada
                  aqui — o dia continuaria em aberto.
                */}
                {ehDiaSemFechar && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={emAndamento === ajuste.id}
                      onClick={async () => {
                        setEmAndamento(ajuste.id);
                        const res = await servicoPonto.decidirDiaIncompleto(ajuste.id, false);
                        setEmAndamento(null);
                        mostrar(
                          res.sucesso
                            ? 'Marcado como débito. O dia não foi trabalhado.'
                            : res.erro || 'Não foi possível registrar.',
                          !res.sucesso
                        );
                      }}
                      className="py-2 px-3 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-amber-600 hover:border-amber-500/30 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      Marcar débito
                    </button>
                    <button
                      type="button"
                      disabled={emAndamento === ajuste.id}
                      onClick={async () => {
                        setEmAndamento(ajuste.id);
                        const res = await servicoPonto.decidirDiaIncompleto(ajuste.id, true);
                        setEmAndamento(null);
                        mostrar(
                          res.sucesso
                            ? 'Abonado. O dia conta como jornada normal.'
                            : res.erro || 'Não foi possível registrar.',
                          !res.sucesso
                        );
                      }}
                      className="py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      Abonar dia
                    </button>
                  </div>
                )}

                {!ehDiaSemFechar && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/*
                    Corrigir antes de decidir.
                    Sem isto o responsável via o dia fechado errado, sabia o
                    horário certo, e só podia aprovar o errado ou recusar —
                    e recusar não conserta o espelho.
                  */}
                  <button
                    type="button"
                    disabled={emAndamento === ajuste.id}
                    onClick={() => setCorrigindo({ colaborador, data: ajuste.data })}
                    className="py-2 px-3 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-acento)] hover:border-[var(--c-acento)]/30 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Corrigir o horário batido e reapurar o dia"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={emAndamento === ajuste.id}
                    onClick={() => setRecusando(ajuste)}
                    className="py-2 px-3 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-red-600 hover:border-red-500/30 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Recusar
                  </button>
                  <button
                    type="button"
                    disabled={emAndamento === ajuste.id}
                    onClick={() => decidir(ajuste, true)}
                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {emAndamento === ajuste.id ? 'Registrando…' : 'Aprovar'}
                  </button>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/*
        AUSÊNCIAS AGUARDANDO DECISÃO.

        Mesma tela da jornada de propósito: quem responde pela pessoa decide
        as duas coisas, e obrigar o gestor a procurar em dois lugares faria
        uma das filas ser esquecida — provavelmente a menor.
      */}
      {ausencias.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <h3 className="text-sm font-bold text-[var(--c-texto)]">
            Atestados e faltas aguardando decisão
          </h3>

          {ausencias.map(({ justificativa, colaborador }) => (
            <div
              key={justificativa.id}
              className="p-3.5 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <FotoPresenca
                foto={colaborador.foto}
                nome={colaborador.nome}
                presenca={colaborador.presenca}
                tamanho="w-10 h-10"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[var(--c-texto)] truncate">
                    {colaborador.nome}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-sky-500/10 text-sky-700 border-sky-500/20">
                    {ROTULO_TIPO_AUSENCIA[justificativa.tipo]}
                  </span>
                </div>

                <span className="text-xs text-[var(--c-texto-3)] block">
                  {resumoDaFicha(colaborador)}
                </span>

                <span className="text-[11px] text-[var(--c-texto-2)] block mt-1">
                  {justificativa.dataInicio === justificativa.dataFim
                    ? formatarDataBR(justificativa.dataInicio)
                    : `${formatarDataBR(justificativa.dataInicio)} a ${formatarDataBR(
                        justificativa.dataFim
                      )}`}
                  {justificativa.observacao && ` · ${justificativa.observacao}`}
                </span>

                {justificativa.anexoCaminho && (
                  <button
                    type="button"
                    onClick={async () => {
                      const url = await resolverCaminho(justificativa.anexoCaminho!);
                      if (url) window.open(url, '_blank');
                      else mostrar('Não foi possível abrir o documento.', true);
                    }}
                    className="mt-1 text-[11px] font-semibold text-[var(--c-acento)] hover:underline inline-flex items-center gap-1"
                  >
                    <Paperclip className="w-3 h-3" />
                    Ver {justificativa.anexoNome || 'documento'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setRecusandoAusencia(justificativa)}
                  className="py-2 px-3 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-red-600 hover:border-red-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Recusar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await decidirAusencia(justificativa.id, true);
                    setVersao((v) => v + 1);
                    mostrar(
                      res.sucesso
                        ? 'Aprovada. Os dias deixam de constar como falta.'
                        : res.erro || 'Não foi possível registrar.',
                      !res.sucesso
                    );
                  }}
                  className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aprovar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recusar ausência: mesmo desenho da jornada — motivo obrigatório,
          porque a pessoa vai querer saber o que corrigir */}
      {recusandoAusencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--c-superficie)] w-full max-w-sm rounded-2xl border border-[var(--c-borda)] shadow-xl p-4 flex flex-col gap-3">
            <span className="text-sm font-bold text-[var(--c-texto)]">
              Recusar {ROTULO_TIPO_AUSENCIA[recusandoAusencia.tipo]}
            </span>
            <textarea
              value={motivoAusencia}
              onChange={(e) => setMotivoAusencia(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Diga o que faltou, para a pessoa poder corrigir"
              className="w-full px-3 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecusandoAusencia(null);
                  setMotivoAusencia('');
                }}
                className="flex-1 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)]"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await decidirAusencia(
                    recusandoAusencia.id,
                    false,
                    motivoAusencia
                  );
                  if (res.sucesso) {
                    setRecusandoAusencia(null);
                    setMotivoAusencia('');
                    setVersao((v) => v + 1);
                    mostrar('Recusada.');
                  } else {
                    mostrar(res.erro || 'Não foi possível recusar.', true);
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
              >
                Recusar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recusar exige motivo: a pessoa perde horas e vai querer saber por quê */}
      {recusando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--c-superficie)] rounded-2xl border border-[var(--c-borda)] shadow-xl max-w-sm w-full p-5 space-y-3">
            <h3 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              Recusar {formatarMinutos(recusando.minutos)} de{' '}
              {ROTULO_TIPO_AJUSTE[recusando.tipo].toLowerCase()}
            </h3>
            <p className="text-xs text-[var(--c-texto-3)]">
              Estas horas não entram no banco. O motivo fica registrado e a pessoa consegue ver.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex: hora extra não foi combinada previamente"
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecusando(null);
                  setMotivo('');
                }}
                className="py-2 px-3.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!motivo.trim()}
                onClick={() => decidir(recusando, false, motivo)}
                className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer"
              >
                Confirmar recusa
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        O texto dizia "você não aparece na própria fila", e isso deixou de
        ser verdade quando ficou combinado que o líder aprova as próprias
        horas. Quem responde por alguém se vê na fila; quem não responde
        por ninguém continua dependendo do responsável dele.
      */}
      <p className="text-[11px] text-[var(--c-texto-3)] px-1">
        Quem responde por alguém decide também a própria jornada — por isso os seus dias
        aparecem aqui junto com os da equipe.
      </p>

      {corrigindo && (
        <ModalCorrigirJornada
          colaborador={corrigindo.colaborador}
          data={corrigindo.data}
          aoFechar={() => setCorrigindo(null)}
          aoSalvar={(texto, ehErro) => {
            mostrar(texto, ehErro);
            // O dia foi reapurado: a fila precisa refletir o número novo
            setVersao((v) => v + 1);
          }}
        />
      )}
    </div>
  );
};
