/**
 * Advertências — CONECTA / Malachias Autopeças
 *
 * O registro disciplinar da rede: quem, quando, por quê, e se a pessoa deu
 * ciência.
 *
 * DUAS DECISÕES QUE NÃO SÃO DE INTERFACE, e sim do que uma advertência é:
 *
 * 1. O MOTIVO É OBRIGATÓRIO e tem tamanho mínimo. Advertência sem motivo
 *    escrito não se sustenta em lugar nenhum — nem numa conversa com a
 *    pessoa, nem num processo. "Atraso" sozinho não é motivo: é assunto.
 *
 * 2. A CIÊNCIA É DA PRÓPRIA PESSOA, e por isso ela não pode ser marcada
 *    aqui. O RH vê se já houve; quem confirma é quem recebeu, na tela dela.
 *    Uma advertência em que o RH clica "ele leu" é o RH afirmando algo
 *    sobre outra pessoa — que é exatamente o que uma ciência existe para
 *    evitar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Check, Clock, Trash2, Paperclip } from 'lucide-react';
import { Colaborador, Advertencia, TipoAdvertencia, ROTULO_ADVERTENCIA } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import {
  listarAdvertencias,
  registrarAdvertencia,
  removerAdvertencia,
  abrirDocumento,
} from '../servicos/rh';
import { dataDeHoje } from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  colaboradorAtual: Colaborador;
}

const COR_DO_TIPO: Record<TipoAdvertencia, string> = {
  verbal: 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)]',
  escrita: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  suspensao: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

const formatarData = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const AbaAdvertencias: React.FC<Props> = ({ colaboradorAtual }) => {
  const [lista, setLista] = useState<Advertencia[]>([]);
  const [versao, setVersao] = useState(0);
  const [formAberto, setFormAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    colaboradorId: '',
    tipo: 'verbal' as TipoAdvertencia,
    data: dataDeHoje(),
    motivo: '',
    diasSuspensao: 1,
  });

  useEffect(() => {
    let cancelado = false;
    listarAdvertencias().then((l) => {
      if (!cancelado) setLista(l);
    });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const pessoas = useMemo(
    () =>
      bancoDados
        .obterColaboradores()
        .filter((c) => c.ativo !== false && c.id !== colaboradorAtual.id)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradorAtual.id, versao]
  );

  const registrar = async () => {
    if (!form.colaboradorId) {
      setAviso('Escolha a pessoa.');
      return;
    }
    setSalvando(true);
    const res = await registrarAdvertencia({
      colaboradorId: form.colaboradorId,
      tipo: form.tipo,
      data: form.data,
      motivo: form.motivo,
      diasSuspensao: form.tipo === 'suspensao' ? form.diasSuspensao : undefined,
    });
    setSalvando(false);

    if (res.sucesso) {
      setFormAberto(false);
      setForm({ ...form, colaboradorId: '', motivo: '' });
      setVersao((v) => v + 1);
      setAviso('Advertência registrada. A pessoa verá na aba Eu e dará ciência lá.');
    } else {
      setAviso(res.erro || 'Falha ao registrar.');
    }
  };

  const apagar = async (a: Advertencia) => {
    const res = await removerAdvertencia(a);
    setAviso(res.sucesso ? 'Advertência removida.' : res.erro || 'Falha ao remover.');
    if (res.sucesso) setVersao((v) => v + 1);
  };

  const abrirAnexo = async (a: Advertencia) => {
    if (!a.arquivoCaminho) return;
    const url = await abrirDocumento(a.arquivoCaminho);
    if (url) window.open(url, '_blank');
  };

  const semCiencia = lista.filter((a) => !a.cienciaEm).length;

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Advertências
          </h2>
          <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
            O registro disciplinar da rede. A pessoa vê a dela na aba{' '}
            <strong className="text-[var(--c-texto-2)]">Eu</strong> e dá ciência lá — a
            confirmação é dela, não de quem aplicou.
          </p>
        </div>

        <button
          type="button"
          id="botao-nova-advertencia"
          onClick={() => setFormAberto((v) => !v)}
          className="flex-shrink-0 px-3 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Registrar
        </button>
      </div>

      {semCiencia > 0 && (
        <div className="px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/25 text-xs text-[var(--c-texto-2)] flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          {semCiencia} {semCiencia === 1 ? 'aguarda' : 'aguardam'} a ciência de quem
          recebeu.
        </div>
      )}

      {aviso && (
        <div className="px-3 py-2 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs text-[var(--c-texto-2)]">
          {aviso}
        </div>
      )}

      {formAberto && (
        <div className="p-4 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="adv-pessoa"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
              >
                Colaborador
              </label>
              <select
                id="adv-pessoa"
                value={form.colaboradorId}
                onChange={(e) => setForm({ ...form, colaboradorId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
              >
                <option value="">Escolha…</option>
                {pessoas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {c.loja}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="adv-data"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
              >
                Data
              </label>
              <input
                id="adv-data"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1">
                Tipo
              </span>
              <div className="flex items-center gap-1">
                {(['verbal', 'escrita', 'suspensao'] as TipoAdvertencia[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, tipo: t })}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      form.tipo === t
                        ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                        : 'bg-[var(--c-canvas)] text-[var(--c-texto-2)] border border-[var(--c-borda)]'
                    }`}
                  >
                    {ROTULO_ADVERTENCIA[t]}
                  </button>
                ))}
              </div>
            </div>

            {form.tipo === 'suspensao' && (
              <div>
                <label
                  htmlFor="adv-dias"
                  className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
                >
                  Dias
                </label>
                <input
                  id="adv-dias"
                  type="number"
                  min={1}
                  max={30}
                  value={form.diasSuspensao}
                  onChange={(e) =>
                    setForm({ ...form, diasSuspensao: Number(e.target.value) })
                  }
                  className="w-24 px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
                />
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="adv-motivo"
              className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
            >
              Motivo
            </label>
            <textarea
              id="adv-motivo"
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              rows={3}
              placeholder="O que aconteceu, quando, e o que foi combinado antes. É este texto que sustenta a advertência."
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
            />
            <span className="block text-[11px] text-[var(--c-texto-3)] mt-1">
              {form.motivo.trim().length < 15
                ? 'Descreva com pelo menos uma frase.'
                : 'Pronto para registrar.'}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormAberto(false)}
              className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={registrar}
              disabled={salvando || form.motivo.trim().length < 15 || !form.colaboradorId}
              className="px-3.5 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-40 hover:brightness-110 transition-all"
            >
              {salvando ? 'Registrando…' : 'Registrar advertência'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {lista.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--c-texto-3)] flex flex-col items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600" />
            Nenhuma advertência registrada na rede.
          </div>
        ) : (
          lista.map((a) => {
            const pessoa = bancoDados.obterColaboradorPorId(a.colaboradorId);
            return (
              <div
                key={a.id}
                className="p-3 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex gap-3"
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
                      {pessoa?.nome || a.colaboradorId}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        COR_DO_TIPO[a.tipo]
                      }`}
                    >
                      {ROTULO_ADVERTENCIA[a.tipo]}
                      {a.tipo === 'suspensao' && a.diasSuspensao
                        ? ` · ${a.diasSuspensao}d`
                        : ''}
                    </span>
                    <span className="text-[11px] text-[var(--c-texto-3)]">
                      {formatarData(a.data)}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--c-texto-2)] leading-snug mt-1 break-words">
                    {a.motivo}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {a.cienciaEm ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3 h-3" />
                        Ciência em {formatarData(a.cienciaEm)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <Clock className="w-3 h-3" />
                        Aguardando ciência
                      </span>
                    )}

                    {a.aplicadaPorNome && (
                      <span className="text-[11px] text-[var(--c-texto-3)]">
                        por {a.aplicadaPorNome}
                      </span>
                    )}

                    {a.arquivoCaminho && (
                      <button
                        type="button"
                        onClick={() => abrirAnexo(a)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--c-acento)]"
                      >
                        <Paperclip className="w-3 h-3" />
                        Documento
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => apagar(a)}
                  className="flex-shrink-0 self-start p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-red-600 hover:bg-red-500/10 transition-colors"
                  title="Remover"
                  aria-label={`Remover a advertência de ${pessoa?.nome || ''}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
