/**
 * Corrigir a jornada antes de aprovar — CONECTA / Malachias Autopeças
 *
 * O buraco que ele fecha: o responsável via o dia fechado errado, sabia o
 * horário certo, e só podia aprovar o errado ou recusar. Recusar não
 * conserta nada — o dia continua errado no espelho.
 *
 * ===================================================================
 * A CORREÇÃO REESCREVE A BATIDA
 * ===================================================================
 *
 * Foi a forma escolhida: o espelho passa a mostrar o horário certo, e o
 * que a pessoa bateu sai do documento. Em troca, três coisas são
 * obrigatórias e não têm como ser desligadas na tela:
 *
 *   1. MOTIVO, sempre. Marcação de ponto é registro trabalhista; alterar
 *      sem dizer por quê não se sustenta em conferência nenhuma.
 *   2. AUTORIA no próprio registro — o espelho marca "Corrigido" e diz
 *      quem foi.
 *   3. O HORÁRIO ANTERIOR vai para a Auditoria, que não é apagada pela
 *      limpeza do histórico. É o que mantém o original recuperável
 *      mesmo ele saindo do espelho.
 *
 * Só as marcações ALTERADAS são gravadas. Salvar as quatro carimbaria
 * como "corrigido pelo líder" horários que a pessoa bateu de verdade.
 */

import React, { useMemo, useState } from 'react';
import { X, Pencil, AlertTriangle } from 'lucide-react';
import {
  Colaborador,
  TipoMarcacao,
  ORDEM_MARCACOES,
  ROTULO_MARCACAO,
  ehMarcacaoCorrigida,
} from '../tipos';
import { servicoPonto, formatarDataBR } from '../servicos/ponto';

interface Props {
  colaborador: Colaborador;
  data: string;
  aoFechar: () => void;
  aoSalvar: (mensagem: string, ehErro: boolean) => void;
}

export const ModalCorrigirJornada: React.FC<Props> = ({
  colaborador,
  data,
  aoFechar,
  aoSalvar,
}) => {
  const jornada = useMemo(
    () => servicoPonto.obterJornadaDoDia(colaborador.id, data),
    [colaborador.id, data]
  );

  /** O que está gravado hoje, por marcação. Vazio = não bateu. */
  const original = useMemo(() => {
    const mapa = {} as Record<TipoMarcacao, string>;
    for (const tipo of ORDEM_MARCACOES) {
      mapa[tipo] = jornada.marcacoes[tipo]?.horaFormatada || '';
    }
    return mapa;
  }, [jornada]);

  const [horas, setHoras] = useState<Record<TipoMarcacao, string>>(original);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alteradas = ORDEM_MARCACOES.filter(
    (tipo) => horas[tipo].trim() !== original[tipo]
  );

  const salvar = async () => {
    setErro(null);

    if (alteradas.length === 0) {
      setErro('Nenhum horário foi alterado.');
      return;
    }
    if (motivo.trim().length < 5) {
      setErro('Escreva o motivo da correção. Ele fica no registro do ponto.');
      return;
    }

    // Apagar marcação não é corrigir: é outra decisão, e ela é do RH
    const apagada = alteradas.find((tipo) => !horas[tipo].trim());
    if (apagada) {
      setErro(
        `Para remover ${ROTULO_MARCACAO[apagada].toLowerCase()}, fale com o RH. Aqui só dá para corrigir o horário.`
      );
      return;
    }

    setSalvando(true);

    /**
     * Uma de cada vez, e para na primeira que falhar.
     *
     * Cada gravação reapura o dia. Disparar as quatro juntas faria quatro
     * apurações concorrerem pelo mesmo dia, e a última a chegar venceria —
     * possivelmente com o número de antes da correção.
     */
    for (const tipo of alteradas) {
      const res = await servicoPonto.ajustarMarcacao({
        colaboradorId: colaborador.id,
        data,
        tipo,
        hora: horas[tipo].trim(),
        justificativa: motivo.trim(),
      });

      if (!res.sucesso) {
        setSalvando(false);
        setErro(res.erro || 'Não foi possível gravar a correção.');
        return;
      }
    }

    setSalvando(false);
    aoSalvar(
      `${alteradas.length === 1 ? 'Horário corrigido' : `${alteradas.length} horários corrigidos`}. O dia foi reapurado — confira antes de aprovar.`,
      false
    );
    aoFechar();
  };

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
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
              <Pencil className="w-4 h-4 text-[var(--c-acento)]" />
              Corrigir jornada
            </h2>
            <p className="text-[11px] text-[var(--c-texto-3)] truncate">
              {colaborador.nome} · {formatarDataBR(data)}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--c-texto-3)] hover:bg-[var(--c-superficie-2)] flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2.5">
            {ORDEM_MARCACOES.map((tipo) => {
              const registro = jornada.marcacoes[tipo];
              const mudou = horas[tipo].trim() !== original[tipo];

              return (
                <label key={tipo} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
                    {ROTULO_MARCACAO[tipo]}
                  </span>
                  <input
                    type="time"
                    value={horas[tipo]}
                    onChange={(e) =>
                      setHoras((atual) => ({ ...atual, [tipo]: e.target.value }))
                    }
                    className={`px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border text-sm font-mono tabular-nums text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)] transition-colors ${
                      mudou ? 'border-amber-500' : 'border-[var(--c-borda)]'
                    }`}
                  />
                  {/*
                    Quem já mexeu neste horário antes aparece aqui: corrigir
                    o que já foi corrigido merece um instante de atenção.
                  */}
                  {registro && ehMarcacaoCorrigida(registro.metodo) && (
                    <span className="text-[10px] text-amber-600 leading-tight">
                      já corrigido por {registro.ajustadoPorNome}
                    </span>
                  )}
                  {!registro && (
                    <span className="text-[10px] text-[var(--c-texto-3)] leading-tight">
                      não bateu
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
              Motivo da correção
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ex.: saiu para entrega em Leme e não bateu na volta"
              className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)] resize-none"
            />
          </label>

          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
              A correção substitui a batida no espelho, com o seu nome e o motivo.
              O horário anterior fica registrado na Auditoria.
            </span>
          </div>

          {erro && (
            <p className="text-[11px] font-semibold text-red-600 leading-snug">{erro}</p>
          )}
        </div>

        <footer className="p-3 border-t border-[var(--c-borda)] flex items-center justify-between gap-2 flex-shrink-0">
          <span className="text-[11px] text-[var(--c-texto-3)]">
            {alteradas.length === 0
              ? 'Nenhuma alteração'
              : `${alteradas.length} horário(s) alterado(s)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={aoFechar}
              className="px-3 py-2 rounded-xl text-xs font-medium text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || alteradas.length === 0}
              className="px-4 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-50 hover:brightness-110 transition-all"
            >
              {salvando ? 'Gravando…' : 'Corrigir e reapurar'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
