/**
 * O AFASTAMENTO, NA FICHA FUNCIONAL (Elias, 17/10/2026).
 *
 * Grava na hora — é outra tabela (afastamentos.sql), e não depende do
 * "Salvar cadastro". Mostra o afastamento que vale hoje em destaque, os
 * anteriores embaixo, e deixa registrar, dar a volta ou remover o lançado
 * por engano. As regras moram em `servicos/afastamentos.ts`.
 */
import React, { useEffect, useState } from 'react';
import { HeartPulse, Plus, Trash2, CalendarCheck, AlertCircle } from 'lucide-react';
import { Afastamento, MotivoAfastamento, MOTIVOS_DE_AFASTAMENTO } from '../tipos';
import {
  afastamentosDe,
  registrarAfastamento,
  removerAfastamento,
  rotuloDoMotivo,
  ateQuando,
} from '../servicos/afastamentos';
import { assinarJustificativas } from '../servicos/justificativasCache';
import { dataDeHoje, formatarDataBR } from '../servicos/ponto';

export const AfastamentoNaFicha: React.FC<{
  colaboradorId: string;
  nome: string;
  campo: string;
  rotuloCampo: string;
}> = ({ colaboradorId, nome, campo, rotuloCampo }) => {
  const [lista, setLista] = useState<Afastamento[]>(() => afastamentosDe(colaboradorId));
  const [novo, setNovo] = useState<{ inicio: string; fim: string; motivo: MotivoAfastamento; observacao: string } | null>(null);
  const [voltaDe, setVoltaDe] = useState<{ id: string; fim: string } | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    setLista(afastamentosDe(colaboradorId));
    return assinarJustificativas(() => setLista(afastamentosDe(colaboradorId)));
  }, [colaboradorId]);

  const hoje = dataDeHoje();
  const vigente = lista.find((a) => a.inicio <= hoje && (!a.fim || a.fim >= hoje));
  const outros = lista.filter((a) => a !== vigente);

  const executar = async (acao: () => Promise<{ sucesso: boolean; erro?: string }>, depois: () => void) => {
    setErro(null);
    setGravando(true);
    const res = await acao();
    setGravando(false);
    if (!res.sucesso) return setErro(res.erro || 'Não foi possível gravar.');
    depois();
  };

  const cartao = (a: Afastamento, emDestaque: boolean) => (
    <div
      key={a.id}
      className={`rounded-lg border px-3 py-2 flex flex-col gap-1.5 ${
        emDestaque ? 'border-amber-500/40 bg-amber-500/5' : 'border-[var(--c-borda)] bg-[var(--c-superficie)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-xs font-bold text-[var(--c-texto)]">
            {emDestaque ? 'Afastado agora · ' : ''}
            {rotuloDoMotivo(a.motivo)}
          </span>
          <span className="block text-[11px] text-[var(--c-texto-2)]">
            Desde {formatarDataBR(a.inicio)} · {ateQuando(a)}
            {a.observacao ? ` · ${a.observacao}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!a.fim && (
            <button
              type="button"
              onClick={() => setVoltaDe({ id: a.id, fim: hoje })}
              className="px-2 py-1 rounded-lg text-[11px] font-bold text-[var(--c-acento)] hover:bg-[var(--c-acento)]/10 flex items-center gap-1"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              Dar a volta
            </button>
          )}
          <button
            type="button"
            onClick={() => setRemovendo(a.id)}
            aria-label="Remover afastamento"
            title="Remover — lançado por engano"
            className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-red-600 hover:bg-red-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {voltaDe?.id === a.id && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[150px]">
            <span className={rotuloCampo}>Último dia afastado</span>
            <input
              type="date"
              value={voltaDe.fim}
              min={a.inicio}
              onChange={(e) => setVoltaDe({ id: a.id, fim: e.target.value })}
              className={campo}
            />
          </label>
          <button
            type="button"
            disabled={gravando}
            onClick={() =>
              executar(
                () => registrarAfastamento({ ...a, fim: voltaDe.fim }),
                () => setVoltaDe(null)
              )
            }
            className="px-3 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-50"
          >
            Gravar a volta
          </button>
          <button type="button" onClick={() => setVoltaDe(null)} className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--c-texto-2)]">
            Cancelar
          </button>
        </div>
      )}

      {removendo === a.id && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--c-texto-2)]">
          <span className="flex-1">Remover? Os dias voltam a ser de trabalho — e a contar falta, se não houver batida.</span>
          <button
            type="button"
            disabled={gravando}
            onClick={() => executar(() => removerAfastamento(a.id), () => setRemovendo(null))}
            className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-bold disabled:opacity-50"
          >
            Remover
          </button>
          <button type="button" onClick={() => setRemovendo(null)} className="px-2.5 py-1.5 rounded-lg font-bold">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div id="afastamento-na-ficha" className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-canvas)] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-2)] flex items-center gap-1.5">
          <HeartPulse className="w-3.5 h-3.5" />
          Afastamento
        </span>
        {!novo && (
          <button
            type="button"
            id="botao-novo-afastamento"
            onClick={() => setNovo({ inicio: hoje, fim: '', motivo: 'doenca', observacao: '' })}
            className="px-2 py-1 rounded-lg text-[11px] font-bold text-[var(--c-acento)] hover:bg-[var(--c-acento)]/10 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar afastamento
          </button>
        )}
      </div>

      {erro && (
        <p className="text-[11px] font-semibold text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {erro}
        </p>
      )}

      {novo && (
        <div className="rounded-lg border border-[var(--c-acento)]/40 bg-[var(--c-superficie)] p-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={rotuloCampo}>Primeiro dia</span>
              <input
                id="afastamento-inicio"
                type="date"
                value={novo.inicio}
                onChange={(e) => setNovo({ ...novo, inicio: e.target.value })}
                className={campo}
              />
            </label>
            <label>
              <span className={rotuloCampo}>Último dia</span>
              <input
                id="afastamento-fim"
                type="date"
                value={novo.fim}
                min={novo.inicio}
                onChange={(e) => setNovo({ ...novo, fim: e.target.value })}
                className={campo}
              />
            </label>
          </div>
          <p className="text-[11px] text-[var(--c-texto-3)] -mt-1">Sem último dia: sem data de volta — dê a volta quando a pessoa retornar.</p>
          <label>
            <span className={rotuloCampo}>Motivo</span>
            <select
              id="afastamento-motivo"
              value={novo.motivo}
              onChange={(e) => setNovo({ ...novo, motivo: e.target.value as MotivoAfastamento })}
              className={campo}
            >
              {MOTIVOS_DE_AFASTAMENTO.map((m) => (
                <option key={m.chave} value={m.chave}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={rotuloCampo}>Observação</span>
            <input
              type="text"
              value={novo.observacao}
              onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
              placeholder="Ex.: CAT nº, número do benefício"
              className={campo}
            />
          </label>
          <p className="text-[11px] text-[var(--c-texto-2)] leading-snug">
            Enquanto durar, o espelho de {nome.split(' ')[0]} diz <strong>Afastado</strong>, o dia não conta falta nem
            débito, e a pessoa não bate ponto.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNovo(null)} className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--c-texto-2)]">
              Cancelar
            </button>
            <button
              type="button"
              id="botao-gravar-afastamento"
              disabled={gravando}
              onClick={() =>
                executar(
                  () => registrarAfastamento({ colaboradorId, ...novo, fim: novo.fim || undefined }),
                  () => setNovo(null)
                )
              }
              className="px-3 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-50"
            >
              {gravando ? 'Gravando…' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      {vigente && cartao(vigente, true)}
      {outros.map((a) => cartao(a, false))}
      {!vigente && outros.length === 0 && !novo && (
        <p className="text-[11px] text-[var(--c-texto-3)]">Nenhum afastamento registrado.</p>
      )}
    </div>
  );
};
