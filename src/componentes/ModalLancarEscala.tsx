/**
 * Lançar na escala — CONECTA / Malachias Autopeças
 *
 * O que faltava para a escala ser PLANEJADA, e não só respondida.
 *
 * Até aqui uma ausência só nascia de um pedido do colaborador, e a
 * liderança decidia. Serve para atestado e folga, que partem da pessoa.
 * Não serve para fechar os sábados do mês nem para montar as férias do
 * semestre — nesses, quem organiza é quem escala, e não há pedido nenhum
 * a responder.
 *
 * O QUE É LANÇADO AQUI JÁ NASCE APROVADO. Quem lança é quem aprovaria de
 * qualquer jeito; criar pendente para aprovar em seguida encheria a tela
 * de linhas amarelas que ninguém precisa decidir.
 */

import React, { useMemo, useState } from 'react';
import { X, CalendarPlus, Palmtree, CalendarDays } from 'lucide-react';
import { Colaborador, TipoAusencia } from '../tipos';
import { lancarAusenciaPelaLideranca } from '../servicos/justificativas';

interface Props {
  equipe: Colaborador[];
  /** Os sábados do mês aberto, para a folga não virar digitação de data. */
  sabados: string[];
  aoFechar: () => void;
  aoLancar: (mensagem: string, ehErro: boolean) => void;
}

const diaEMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

export const ModalLancarEscala: React.FC<Props> = ({
  equipe,
  sabados,
  aoFechar,
  aoLancar,
}) => {
  const [tipo, setTipo] = useState<Extract<TipoAusencia, 'folga_sabado' | 'ferias'>>(
    'folga_sabado'
  );
  const [pessoaId, setPessoaId] = useState('');
  const [sabado, setSabado] = useState(sabados[0] || '');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehFerias = tipo === 'ferias';

  /** Quantos dias as férias cobrem, para a pessoa conferir antes de gravar. */
  const diasDeFerias = useMemo(() => {
    if (!ehFerias || !inicio || !fim || fim < inicio) return 0;
    const [a1, m1, d1] = inicio.split('-').map(Number);
    const [a2, m2, d2] = fim.split('-').map(Number);
    const um = new Date(a1, m1 - 1, d1, 12).getTime();
    const dois = new Date(a2, m2 - 1, d2, 12).getTime();
    return Math.round((dois - um) / 86400000) + 1;
  }, [ehFerias, inicio, fim]);

  const lancar = async () => {
    setErro(null);

    if (!pessoaId) {
      setErro('Escolha quem entra na escala.');
      return;
    }

    const dataInicio = ehFerias ? inicio : sabado;
    const dataFim = ehFerias ? fim : sabado;

    if (!dataInicio || !dataFim) {
      setErro(ehFerias ? 'Informe o período das férias.' : 'Escolha o sábado.');
      return;
    }

    setSalvando(true);
    const res = await lancarAusenciaPelaLideranca({
      colaboradorId: pessoaId,
      dataInicio,
      dataFim,
      tipo,
      observacao,
    });
    setSalvando(false);

    if (!res.sucesso) {
      // O motivo vem do serviço, que conhece a regra: sábado já usado no
      // mês, pessoa fora da equipe, período invertido
      setErro(res.erro || 'Não foi possível lançar.');
      return;
    }

    const nome = equipe.find((c) => c.id === pessoaId)?.nome || 'Colaborador';
    aoLancar(
      ehFerias
        ? `Férias de ${nome} lançadas: ${diaEMes(dataInicio)} a ${diaEMes(dataFim)}.`
        : `Folga de ${nome} marcada para ${diaEMes(dataInicio)}.`,
      false
    );
    aoFechar();
  };

  const abaClasse = (ativa: boolean) =>
    `flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
      ativa
        ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
        : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3"
      onClick={aoFechar}
    >
      <div
        className="bg-[var(--c-superficie)] w-full max-w-md rounded-2xl border border-[var(--c-borda)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3.5 border-b border-[var(--c-borda)] flex items-center justify-between gap-2 flex-shrink-0">
          <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-[var(--c-acento)]" />
            Lançar na escala
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--c-texto-3)] hover:bg-[var(--c-superficie-2)]"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          {/* Folga e férias são coisas diferentes: uma é um sábado, a outra
              é um período. Um formulário só, com dois modos, evita duas
              telas quase iguais. */}
          <div className="flex items-center bg-[var(--c-canvas)] border border-[var(--c-borda)] p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setTipo('folga_sabado')}
              className={abaClasse(!ehFerias)}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Folga de sábado
            </button>
            <button
              type="button"
              onClick={() => setTipo('ferias')}
              className={abaClasse(ehFerias)}
            >
              <Palmtree className="w-3.5 h-3.5" />
              Férias
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
              Quem
            </span>
            <select
              value={pessoaId}
              onChange={(e) => setPessoaId(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
            >
              <option value="">Escolha o colaborador</option>
              {equipe.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {c.cargo}
                </option>
              ))}
            </select>
          </label>

          {ehFerias ? (
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
                  Início
                </span>
                <input
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
                  Fim
                </span>
                <input
                  type="date"
                  value={fim}
                  min={inicio || undefined}
                  onChange={(e) => setFim(e.target.value)}
                  className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
                />
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              {/*
                Uma lista dos sábados do mês, e não um campo de data: a
                folga só cai em sábado, e digitar a data é a chance de
                escolher uma quarta-feira e descobrir pelo erro.
              */}
              <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
                Qual sábado
              </span>
              <select
                value={sabado}
                onChange={(e) => setSabado(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              >
                {sabados.map((s) => (
                  <option key={s} value={s}>
                    Sábado, {diaEMes(s)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
              Observação <span className="font-normal text-[var(--c-texto-3)]">(opcional)</span>
            </span>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={ehFerias ? 'Ex.: 1º período' : 'Ex.: combinado em reunião'}
              className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
            />
          </label>

          {diasDeFerias > 0 && (
            <p className="text-[11px] text-[var(--c-texto-3)]">
              {diasDeFerias} dia(s) corridos.
            </p>
          )}

          <p className="text-[11px] text-[var(--c-texto-3)] leading-snug">
            O que você lança aqui já entra aprovado, com o seu nome. A pessoa vê na
            escala dela.
          </p>

          {erro && (
            <p className="text-[11px] font-semibold text-red-600 leading-snug">{erro}</p>
          )}
        </div>

        <footer className="p-3 border-t border-[var(--c-borda)] flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={aoFechar}
            className="px-3 py-2 rounded-xl text-xs font-medium text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={lancar}
            disabled={salvando}
            className="px-4 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {salvando ? 'Lançando…' : 'Lançar na escala'}
          </button>
        </footer>
      </div>
    </div>
  );
};
