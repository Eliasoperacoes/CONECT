import React, { useState } from 'react';
import { Pin, PinOff, Trash2, MoreVertical } from 'lucide-react';
import { Conversa } from '../tipos';
import {
  estaFixada,
  alternarFixada,
  ocultarConversa,
} from '../servicos/preferenciasConversa';

interface PropsItemConversa {
  conversa: Conversa;
  selecionada?: boolean;
  aoClicar: () => void;
  /**
   * Quem está logado. Sem ele o item não oferece fixar nem excluir — é o
   * que mantém o componente utilizável em tela de leitura, sem ações.
   */
  colaboradorId?: string;
  /** Avisa quem lista para recarregar depois de fixar ou ocultar. */
  aoMudarPreferencia?: () => void;
}

/**
 * Um item da lista de conversas.
 *
 * As ações de fixar e excluir moram AQUI, e não em quem lista, porque há
 * duas listas — a flutuante do computador e a da barra do celular. Quando
 * estavam só na do computador, o celular ficou sem elas, que foi o defeito
 * relatado. Uma vez só, os dois lados ganham juntos.
 */
export const ItemConversa: React.FC<PropsItemConversa> = ({
  conversa,
  selecionada = false,
  aoClicar,
  colaboradorId,
  aoMudarPreferencia,
}) => {
  const [menuAberto, setMenuAberto] = useState(false);
  const temAcoes = !!colaboradorId;
  const fixada = colaboradorId ? estaFixada(colaboradorId, conversa.id) : false;

  const fechar = () => setMenuAberto(false);
  // Inicial do nome para avatar caso não haja foto
  const obterInicial = (nome: string) => {
    return (nome || '?').charAt(0).toUpperCase();
  };

  return (
    <div className="relative">
    <button
      type="button"
      id={`item-conversa-${conversa.id}`}
      onClick={aoClicar}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-[var(--c-borda)] transition-colors min-h-[64px] active:bg-[var(--c-superficie-2)] ${
        selecionada ? 'bg-[var(--c-acento-suave)]' : 'bg-[var(--c-superficie)]'
      } ${temAcoes ? 'pr-12' : ''}`}
    >
      {/* 1. Foto ou Avatar */}
      <div className="relative flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center justify-center">
        {conversa.foto ? (
          <img
            src={conversa.foto}
            alt={conversa.nome}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="font-semibold text-base text-[var(--c-texto-2)]">
            {obterInicial(conversa.nome)}
          </span>
        )}
      </div>

      {/* 2. Nome e 3. Prévia da última mensagem */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-base text-[var(--c-texto)] truncate">
            {conversa.nome}
          </span>

          {/* 4. Horário */}
          {conversa.ultimaMensagem?.hora && (
            <span className="text-xs text-[var(--c-texto-3)] flex-shrink-0 font-mono">
              {conversa.ultimaMensagem.hora}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-[var(--c-texto-2)] truncate">
            {conversa.ultimaMensagem?.texto || 'Nenhuma mensagem'}
          </p>

          {/* Contador de não lidas (quando houver) */}
          {conversa.naoLidas > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-semibold flex items-center justify-center">
              {conversa.naoLidas}
            </span>
          )}
        </div>
      </div>
    </button>

    {/* O alfinete fica sobre o item, sem roubar linha do nome */}
    {fixada && (
      <Pin className="absolute left-1 top-1 w-3 h-3 text-[var(--c-acento)] pointer-events-none" />
    )}

    {/*
      As ações. Um toque abre — não depende de passar o mouse, que é o que
      deixava isto inalcançável no celular.
    */}
    {temAcoes && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuAberto((v) => !v);
        }}
        title="Opções da conversa"
        aria-label="Opções da conversa"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] active:scale-95 transition-all"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    )}

    {menuAberto && colaboradorId && (
      <>
        <div className="fixed inset-0 z-30" onClick={fechar} />
        <div className="absolute right-2 top-12 z-40 w-56 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-xl overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => {
              alternarFixada(colaboradorId, conversa.id);
              fechar();
              aoMudarPreferencia?.();
            }}
            className="w-full px-3 py-3 flex items-center gap-2.5 active:bg-[var(--c-canvas)] hover:bg-[var(--c-canvas)] text-[var(--c-texto)] font-semibold"
          >
            {fixada ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            {fixada ? 'Desafixar' : 'Fixar no topo'}
          </button>

          <button
            type="button"
            onClick={() => {
              ocultarConversa(colaboradorId, conversa.id);
              fechar();
              aoMudarPreferencia?.();
            }}
            className="w-full px-3 py-3 flex flex-col items-start gap-0.5 active:bg-red-500/10 hover:bg-red-500/10 text-red-600 font-semibold border-t border-[var(--c-borda)]"
          >
            <span className="flex items-center gap-2.5">
              <Trash2 className="w-4 h-4" />
              Excluir conversa
            </span>
            {/* Dizer o que acontece de fato: "excluir" promete apagar */}
            <span className="text-[11px] font-normal text-[var(--c-texto-3)] text-left leading-tight">
              Some da sua lista. O histórico fica no banco e volta se escreverem
              de novo.
            </span>
          </button>
        </div>
      </>
    )}
    </div>
  );
};
