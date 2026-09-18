/**
 * Controle de atestados — CONECTA / Malachias Autopeças
 *
 * POR QUE ESTA TELA EXISTE, e por que ela não duplica nada.
 *
 * A fila de aprovação de ausências mora dentro do painel de gestão — e o
 * painel de gestão exige TER EQUIPE. Quem cuida de pessoas sem liderar
 * ninguém, que é o caso do RH, simplesmente não alcançava aquela fila: o
 * atestado chegava e ficava esperando uma tela que ela não tinha.
 *
 * Aqui ela decide, com a MESMA função de serviço que o líder usa. A regra
 * de quem pode decidir continua sendo uma só — o que muda é o caminho até
 * ela.
 *
 * E é um CONTROLE, não só uma fila: o atestado decidido continua na lista,
 * porque a pergunta do RH raramente é "o que falta decidir" e quase sempre
 * é "quantos atestados essa pessoa trouxe este ano".
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Stethoscope, Check, X, Clock, Paperclip, Search } from 'lucide-react';
import { Colaborador, JustificativaAusencia, ROTULO_TIPO_AUSENCIA } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import {
  lerJustificativas,
  assinarJustificativas,
} from '../servicos/justificativasCache';
import { decidirAusencia } from '../servicos/justificativas';
import { abrirDocumento } from '../servicos/rh';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  colaboradorAtual: Colaborador;
}

const formatarData = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Quantos dias o atestado cobre, contando as duas pontas. */
const diasCobertos = (j: JustificativaAusencia): number => {
  const inicio = new Date(`${j.dataInicio}T12:00:00`).getTime();
  const fim = new Date(`${j.dataFim}T12:00:00`).getTime();
  return Math.max(1, Math.round((fim - inicio) / 86400000) + 1);
};

export const AbaAtestados: React.FC<Props> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState('');
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [recusando, setRecusando] = useState<JustificativaAusencia | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const cancelar = assinarJustificativas(() => setVersao((v) => v + 1));
    return () => cancelar();
  }, []);

  /**
   * FOLGA NÃO ENTRA AQUI.
   *
   * Ela tem tela própria, e se julga pela escala do sábado — não pelo
   * documento. Misturá-las obrigaria a decidir folga sem ver o calendário,
   * que é o erro que a separação delas veio corrigir.
   */
  const atestados = useMemo(() => {
    void versao;
    const termo = busca.trim().toLowerCase();

    return lerJustificativas()
      .filter((j) => j.tipo !== 'folga_sabado')
      .filter((j) => !somentePendentes || j.estado === 'pendente')
      .filter((j) => {
        if (!termo) return true;
        const pessoa = bancoDados.obterColaboradorPorId(j.colaboradorId);
        return (pessoa?.nome || '').toLowerCase().includes(termo);
      })
      .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  }, [versao, busca, somentePendentes]);

  const totais = useMemo(() => {
    void versao;
    const todos = lerJustificativas().filter((j) => j.tipo !== 'folga_sabado');
    const mes = new Date().toISOString().slice(0, 7);
    return {
      pendentes: todos.filter((j) => j.estado === 'pendente').length,
      doMes: todos.filter((j) => j.dataInicio.slice(0, 7) === mes).length,
      diasDoMes: todos
        .filter((j) => j.dataInicio.slice(0, 7) === mes && j.estado === 'aprovada')
        .reduce((t, j) => t + diasCobertos(j), 0),
    };
  }, [versao]);

  const decidir = async (j: JustificativaAusencia, aprovada: boolean, motivo?: string) => {
    const res = await decidirAusencia(j.id, aprovada, motivo);
    setAviso(res.sucesso ? null : res.erro || 'Não foi possível decidir.');
    if (res.sucesso) {
      setRecusando(null);
      setMotivoRecusa('');
      setVersao((v) => v + 1);
    }
  };

  const abrirAnexo = async (j: JustificativaAusencia) => {
    if (!j.anexoCaminho) return;
    const url = await abrirDocumento(j.anexoCaminho);
    if (url) window.open(url, '_blank');
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-1.5">
          <Stethoscope className="w-4 h-4 text-[var(--c-acento)]" />
          Atestados e ausências
        </h2>
        <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
          Atestado, falta justificada e comparecimento. A folga de sábado tem tela própria
          — ela se julga pela escala, não pelo documento.
        </p>
      </div>

      {/* Os três números do mês */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className={`p-3 rounded-2xl border ${
            totais.pendentes > 0
              ? 'bg-amber-500/5 border-amber-500/25'
              : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Aguardando
          </span>
          <span
            className={`block text-xl font-black ${
              totais.pendentes > 0 ? 'text-amber-600' : 'text-[var(--c-texto)]'
            }`}
          >
            {totais.pendentes}
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)]">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Entregues no mês
          </span>
          <span className="block text-xl font-black text-[var(--c-texto)]">
            {totais.doMes}
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)]">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Dias abonados
          </span>
          <span className="block text-xl font-black text-[var(--c-texto)]">
            {totais.diasDoMes}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
          />
        </div>

        <button
          type="button"
          onClick={() => setSomentePendentes((v) => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
            somentePendentes
              ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
              : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
          }`}
        >
          Só os que aguardam
        </button>
      </div>

      {aviso && (
        <div className="px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/25 text-xs text-red-700 dark:text-red-400">
          {aviso}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {atestados.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--c-texto-3)] flex flex-col items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600" />
            {somentePendentes ? 'Nada aguardando decisão.' : 'Nenhum atestado registrado.'}
          </div>
        ) : (
          atestados.map((j) => {
            const pessoa = bancoDados.obterColaboradorPorId(j.colaboradorId);
            const dias = diasCobertos(j);

            return (
              <div
                key={j.id}
                className={`p-3 rounded-xl border flex gap-3 ${
                  j.estado === 'pendente'
                    ? 'bg-amber-500/5 border-amber-500/25'
                    : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
                }`}
              >
                {pessoa && (
                  <FotoPresenca
                    foto={pessoa.foto}
                    nome={pessoa.nome}
                    presenca={pessoa.presenca}
                    tamanho="w-8 h-8"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[var(--c-texto)]">
                      {pessoa?.nome || j.colaboradorId}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--c-superficie-2)] text-[var(--c-texto-2)]">
                      {ROTULO_TIPO_AUSENCIA[j.tipo]}
                    </span>
                    <span className="text-[11px] text-[var(--c-texto-3)]">
                      {formatarData(j.dataInicio)}
                      {j.dataFim !== j.dataInicio ? ` a ${formatarData(j.dataFim)}` : ''}
                      {dias > 1 ? ` · ${dias} dias` : ''}
                    </span>
                  </div>

                  {j.observacao && (
                    <p className="text-xs text-[var(--c-texto-2)] leading-snug mt-1 break-words">
                      {j.observacao}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {j.estado === 'aprovada' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3 h-3" /> Aprovado
                      </span>
                    )}
                    {j.estado === 'recusada' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400">
                        <X className="w-3 h-3" /> Recusado
                        {j.motivoRecusa ? ` · ${j.motivoRecusa}` : ''}
                      </span>
                    )}
                    {j.estado === 'pendente' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <Clock className="w-3 h-3" /> Aguardando
                      </span>
                    )}

                    {j.anexoCaminho && (
                      <button
                        type="button"
                        onClick={() => abrirAnexo(j)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--c-acento)]"
                      >
                        <Paperclip className="w-3 h-3" />
                        Ver documento
                      </button>
                    )}
                  </div>

                  {j.estado === 'pendente' && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => setRecusando(j)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--c-borda)] text-[11px] font-bold text-[var(--c-texto-2)] hover:text-red-600 hover:border-red-500/30 transition-colors"
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => decidir(j, true)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors"
                      >
                        Aprovar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recusar exige motivo: a pessoa precisa saber o que fazer em seguida */}
      {recusando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--c-superficie)] w-full max-w-sm rounded-2xl border border-[var(--c-borda)] shadow-xl p-4 flex flex-col gap-3">
            <span className="text-sm font-bold text-[var(--c-texto)]">
              Recusar o atestado de{' '}
              {bancoDados.obterColaboradorPorId(recusando.colaboradorId)?.nome}
            </span>
            <textarea
              value={motivoRecusa}
              onChange={(e) => setMotivoRecusa(e.target.value)}
              rows={3}
              placeholder="Diga o motivo. A pessoa precisa saber o que fazer em seguida."
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecusando(null);
                  setMotivoRecusa('');
                }}
                className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!motivoRecusa.trim()}
                onClick={() => decidir(recusando, false, motivoRecusa.trim())}
                className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40"
              >
                Recusar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
