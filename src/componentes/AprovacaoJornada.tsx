/**
 * Aprovação de jornada — CONECTA / Malachias Autopeças
 *
 * O segundo passo do caminho, e o que faz ele não ter atalho:
 *
 *   colaborador bate o ponto → LÍDER OU GERENTE DECIDE → banco de horas
 *
 * A fila traz só quem a pessoa responde: o líder vê o setor dele, o gerente
 * vê a loja dele, o RH vê a rede. Ninguém aparece na própria fila — quem
 * decide sobre a hora do líder é o gerente.
 *
 * Aprovar é um clique; recusar exige motivo. A diferença é proposital: a
 * recusa tira horas de alguém e a pessoa vai querer saber por quê.
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle, Inbox } from 'lucide-react';
import { AjusteJornada, Colaborador, ROTULO_TIPO_AJUSTE } from '../tipos';
import { servicoPonto, formatarMinutos, formatarDataBR, formatarDiaCurto } from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';

interface PropsAprovacaoJornada {
  colaboradorAtual: Colaborador;
}

export const AprovacaoJornada: React.FC<PropsAprovacaoJornada> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [recusando, setRecusando] = useState<AjusteJornada | null>(null);
  const [motivo, setMotivo] = useState('');
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  useEffect(() => {
    const cancelar = servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1));
    return () => cancelar();
  }, []);

  const pendencias = servicoPonto.obterPendenciasParaDecidir();
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
                        ehExtra
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                      }`}
                    >
                      {ehExtra ? '+' : '−'}
                      {formatarMinutos(ajuste.minutos)} · {ROTULO_TIPO_AJUSTE[ajuste.tipo]}
                    </span>
                  </div>

                  <span className="text-xs text-[var(--c-texto-3)] block">
                    {colaborador.cargo} · {colaborador.loja}
                  </span>

                  {/* O que a batida apurou, para a decisão não ser no escuro */}
                  <span className="text-[11px] text-[var(--c-texto-3)] block mt-1">
                    {formatarDiaCurto(ajuste.data)} ({formatarDataBR(ajuste.data)}) ·{' '}
                    trabalhou <strong className="text-[var(--c-texto-2)]">
                      {formatarMinutos(ajuste.minutosTrabalhados)}
                    </strong>{' '}
                    de {formatarMinutos(ajuste.minutosPrevistos)} previstos
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
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
              </div>
            );
          })}
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

      <p className="text-[11px] text-[var(--c-texto-3)] px-1">
        Você não aparece na própria fila. Quem decide sobre a sua jornada é quem responde por
        você — {colaboradorAtual.nivel >= 3 ? 'a Diretoria' : 'o gerente da loja'}.
      </p>
    </div>
  );
};
