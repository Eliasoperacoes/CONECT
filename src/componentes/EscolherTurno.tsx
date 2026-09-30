/**
 * "QUAL É O SEU HORÁRIO?" — a pergunta da primeira batida.
 *
 * Todas as fichas nasceram no Turno A, e quem entra às 08:20 era cobrado
 * como atrasado 50 minutos todo dia — com a tela de motivo segurando a
 * batida, que se perdia quando a pessoa desistia. O Elias pediu que, em
 * vez do motivo, a pessoa diga o próprio horário: aparece uma vez, grava
 * no banco, e depois só o RH ou o TI mudam.
 *
 * "Agora não" bate o ponto assim mesmo. A batida é o documento; perder a
 * hora em que a pessoa chegou por causa de uma pergunta de cadastro seria
 * trocar o que importa pelo que pode esperar.
 */
import React, { useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { FolhaInferior } from './FolhaInferior';
import { Colaborador, Turno, turnosParaEscolher, TURNO_SABADO } from '../tipos';

interface Props {
  aberto: boolean;
  colaborador: Colaborador;
  /** Grava a escolha. Devolve o erro para a folha mostrar, ou nada. */
  aoEscolher: (turno: string) => Promise<string | null>;
  /** Segue sem escolher: a batida vai com o turno de hoje. */
  aoPular: () => void;
}

const descreverTurno = (t: Turno): string => {
  const intervalo = t.intervalo
    ? t.intervalo.desconta
      ? `almoço ${t.intervalo.saida}–${t.intervalo.retorno}`
      : 'pausa de 15 min'
    : 'direto, sem intervalo';
  const sabado = t.sabado ? `sábado ${TURNO_SABADO.entrada}–${TURNO_SABADO.saida}` : 'sem sábado';
  return `${intervalo} · ${sabado}`;
};

export const EscolherTurno: React.FC<Props> = ({ aberto, colaborador, aoEscolher, aoPular }) => {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const opcoes = turnosParaEscolher(colaborador);

  const confirmar = async () => {
    if (!escolhido) return;
    setGravando(true);
    setErro(null);
    const falha = await aoEscolher(escolhido);
    setGravando(false);
    if (falha) setErro(falha);
  };

  return (
    <FolhaInferior
      aberto={aberto}
      titulo="Qual é o seu horário?"
      subtitulo="Você escolhe uma vez. Depois, só o RH ou o TI mudam."
      aoFechar={aoPular}
      rodape={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            id="botao-confirmar-turno"
            disabled={!escolhido || gravando}
            onClick={confirmar}
            className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-all"
          >
            <Check className="w-4 h-4" />
            {gravando ? 'Gravando…' : 'Confirmar e bater o ponto'}
          </button>
          <button
            type="button"
            id="botao-pular-turno"
            onClick={aoPular}
            disabled={gravando}
            className="w-full h-10 rounded-2xl text-xs font-semibold text-[var(--c-texto-2)] active:bg-[var(--c-superficie-2)]"
          >
            Agora não · bater o ponto assim mesmo
          </button>
        </div>
      }
    >
      <div className="p-4 flex flex-col gap-2.5">
        <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
          O seu horário decide quando a batida conta como atraso ou hora extra. Escolha
          o que você cumpre de verdade.
        </p>

        <div role="radiogroup" aria-label="Horários" className="flex flex-col gap-2">
          {opcoes.map((t) => {
            const ativo = escolhido === t.chave;
            return (
              <button
                key={t.chave}
                type="button"
                role="radio"
                aria-checked={ativo}
                id={`turno-${t.chave}`}
                onClick={() => {
                  setEscolhido(t.chave);
                  setErro(null);
                }}
                className={`w-full text-left p-3.5 rounded-2xl border-2 flex items-center gap-3 transition-colors ${
                  ativo
                    ? 'border-[var(--c-acento)] bg-[var(--c-acento)]/10'
                    : 'border-[var(--c-borda)] bg-[var(--c-canvas)] active:bg-[var(--c-superficie-2)]'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    ativo
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)]'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-bold text-[var(--c-texto)] tabular-nums">
                    {t.entrada} às {t.saida}
                  </span>
                  <span className="block text-xs text-[var(--c-texto-3)] leading-snug">
                    {t.nome.split(' · ')[0]} · {descreverTurno(t)}
                  </span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    ativo ? 'border-[var(--c-acento)] bg-[var(--c-acento)]' : 'border-[var(--c-borda-forte)]'
                  }`}
                >
                  {ativo && <Check className="w-3 h-3 text-[var(--c-sobre-acento)]" />}
                </span>
              </button>
            );
          })}
        </div>

        {erro && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 font-semibold">
            {erro}
          </div>
        )}
      </div>
    </FolhaInferior>
  );
};
