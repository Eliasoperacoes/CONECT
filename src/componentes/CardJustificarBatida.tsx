/**
 * Motivo no ato da batida — CONECTA / Malachias Autopeças
 *
 * Aparece ANTES de confirmar, quando a marcação cai fora da janela da
 * jornada. Sem isto o aprovador recebe "trabalhou 9h10 de 8h00" e decide no
 * escuro: não sabe se foi entrega atrasada, cliente no balcão ou a pessoa
 * esqueceu de bater.
 *
 * Pede no ato, e não depois, porque no dia seguinte ninguém lembra o porquê
 * — e um motivo lembrado por alto vale menos que nenhum.
 */
import React, { useState } from 'react';
import { AlertTriangle, Paperclip, X, Check, Stethoscope } from 'lucide-react';

interface Props {
  aberto: boolean;
  /** O que está sendo batido, em uma linha. */
  rotuloMarcacao: string;
  /** O que saiu fora da janela, já formatado. */
  descricao: string;
  aoCancelar: () => void;
  aoConfirmar: (dados: {
    motivo: string;
    anexo?: { conteudo: string; nome: string };
    /** O anexo é atestado: vai ao RH (`enviarAtestadoDaBatida`), não à fila da líder. */
    ehAtestado: boolean;
  }) => void;
}

/** 4 MB: comprovante é foto de papel, não vídeo. */
const TAMANHO_MAXIMO = 4 * 1024 * 1024;

export const CardJustificarBatida: React.FC<Props> = ({
  aberto,
  rotuloMarcacao,
  descricao,
  aoCancelar,
  aoConfirmar,
}) => {
  const [motivo, setMotivo] = useState('');
  const [anexo, setAnexo] = useState<{ conteudo: string; nome: string } | null>(null);
  const [ehAtestado, setEhAtestado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  const escolherArquivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    if (arquivo.size > TAMANHO_MAXIMO) {
      setErro('Arquivo acima de 4 MB. Tire uma foto menor ou use um PDF.');
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => {
      setAnexo({ conteudo: String(leitor.result), nome: arquivo.name });
      setErro(null);
    };
    leitor.onerror = () => setErro('Não foi possível ler o arquivo.');
    leitor.readAsDataURL(arquivo);
  };

  const confirmar = () => {
    // Motivo obrigatório: é o que a tela existe para colher. Sem ele, a
    // batida não conclui — e o aprovador não recebe um número mudo.
    if (!motivo.trim()) {
      setErro('Escreva o motivo para concluir a batida.');
      return;
    }
    aoConfirmar({ motivo: motivo.trim(), anexo: anexo || undefined, ehAtestado: !!anexo && ehAtestado });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[var(--c-superficie)] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--c-borda)] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/25 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-sm font-bold text-[var(--c-texto)] block">
              {rotuloMarcacao} fora do horário
            </span>
            <span className="text-xs text-[var(--c-texto-2)] block mt-0.5">{descricao}</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs text-[var(--c-texto-3)]">
            Escreva o que aconteceu. Quem aprova a sua jornada vai ler isto junto
            com o horário — é o que evita a pergunta depois.
          </p>

          <div>
            <label
              htmlFor="motivo-da-batida"
              className="text-xs font-semibold text-[var(--c-texto-2)] block mb-1"
            >
              Motivo <span className="text-red-500">*</span>
            </label>
            <textarea
              id="motivo-da-batida"
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErro(null);
              }}
              rows={3}
              autoFocus
              placeholder="Ex.: entrega do fornecedor atrasou e fiquei para conferir"
              className="w-full px-3 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--c-texto-2)] block mb-1">
              Comprovante (opcional)
            </label>

            {anexo ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)]">
                <Paperclip className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
                <span className="text-xs text-[var(--c-texto)] truncate flex-1">
                  {anexo.nome}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAnexo(null);
                    setEhAtestado(false);
                  }}
                  className="p-1 rounded-lg text-[var(--c-texto-3)] hover:text-red-600"
                  aria-label="Remover anexo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[var(--c-borda-forte)] text-xs text-[var(--c-texto-2)] cursor-pointer hover:bg-[var(--c-canvas)] transition-colors">
                <Paperclip className="w-4 h-4" />
                Anexar foto ou documento
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={escolherArquivo}
                  className="hidden"
                />
              </label>
            )}

            {/* Atestado é do RH: marcado, o documento não vai à fila da líder */}
            {anexo && (
              <button
                type="button"
                id="anexo-e-atestado"
                role="checkbox"
                aria-checked={ehAtestado}
                onClick={() => setEhAtestado((v) => !v)}
                className={`mt-2 w-full flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                  ehAtestado
                    ? 'bg-[var(--c-acento)]/10 border-[var(--c-acento)]/40'
                    : 'bg-[var(--c-canvas)] border-[var(--c-borda)] hover:border-[var(--c-acento)]/40'
                }`}
              >
                <span
                  className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                    ehAtestado
                      ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'border-[var(--c-borda-forte)]'
                  }`}
                >
                  {ehAtestado && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0">
                  <span className="text-xs font-semibold text-[var(--c-texto)] flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-[var(--c-texto-2)]" />
                    É atestado ou declaração médica
                  </span>
                  <span className="text-[11px] text-[var(--c-texto-3)] block mt-0.5 leading-snug">
                    Vai direto para o RH, e não para quem aprova a sua jornada. Aprovado, o
                    tempo deste dia é abonado.
                  </span>
                </span>
              </button>
            )}
          </div>

          {erro && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 font-semibold">
              {erro}
            </div>
          )}
        </div>

        <div className="p-4 pt-0 flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={aoCancelar}
            className="flex-1 py-2.5 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            className="flex-[2] py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Confirmar batida
          </button>
        </div>
      </div>
    </div>
  );
};
