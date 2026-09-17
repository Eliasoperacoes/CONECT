import React, { useState } from 'react';
import { Pin, PinOff, Trash2, Archive, MoreVertical } from 'lucide-react';
import { Conversa } from '../tipos';
import {
  estaFixada,
  alternarFixada,
  ocultarConversa,
  removerConversaDaLista,
} from '../servicos/preferenciasConversa';

/** Três linhas de 36px mais o respiro das bordas. */
const MENU_LARGURA = 168;
const MENU_ALTURA = 116;

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
  /**
   * O menu aberto e o ponto da JANELA onde ancorá-lo.
   *
   * Era `absolute right-2 top-12` dentro do item da lista. A lista rola e
   * tem `overflow`, então nas últimas conversas o menu abria para baixo e
   * era cortado pela borda — a mesma experiência de defeito que o menu da
   * mensagem tinha, e corrigida do mesmo jeito.
   */
  const [ancora, setAncora] = useState<{ x: number; y: number } | null>(null);
  const temAcoes = !!colaboradorId;
  const fixada = colaboradorId ? estaFixada(colaboradorId, conversa.id) : false;

  const fechar = () => setAncora(null);
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
          if (ancora) {
            fechar();
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          setAncora({ x: r.right - MENU_LARGURA, y: r.bottom });
        }}
        title="Opções da conversa"
        aria-label="Opções da conversa"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] active:scale-95 transition-all"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    )}

    {ancora && colaboradorId && (() => {
      // Cabe embaixo? Senão abre para cima. E nunca passa da lateral.
      const cabeAbaixo = ancora.y + MENU_ALTURA + 12 <= window.innerHeight;
      const topo = cabeAbaixo ? ancora.y + 4 : Math.max(8, ancora.y - MENU_ALTURA - 44);
      const esquerda = Math.min(
        Math.max(8, ancora.x),
        window.innerWidth - MENU_LARGURA - 8
      );

      return (
        <>
          <div className="fixed inset-0 z-[60]" onClick={fechar} />
          <div
            id="menu-item-conversa"
            style={{ top: topo, left: esquerda, width: MENU_LARGURA }}
            className="fixed z-[61] py-1 rounded-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                alternarFixada(colaboradorId, conversa.id);
                fechar();
                aoMudarPreferencia?.();
              }}
              className="w-full px-3 h-9 flex items-center gap-2.5 text-xs font-semibold text-left text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-canvas)] transition-colors"
            >
              {fixada ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              {fixada ? 'Desafixar' : 'Fixar no topo'}
            </button>

            {/*
              ARQUIVAR — o nome honesto do que este botão sempre fez.

              Chamava-se "Excluir conversa" e não excluía nada: a conversa
              voltava sozinha assim que o colega escrevesse. Nome que promete
              outra coisa faz a pessoa evitar o botão certo com medo de
              perder o histórico.
            */}
            <button
              type="button"
              onClick={() => {
                ocultarConversa(colaboradorId, conversa.id);
                fechar();
                aoMudarPreferencia?.();
              }}
              className="w-full px-3 h-9 flex items-center gap-2.5 text-xs font-semibold text-left text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-canvas)] transition-colors border-t border-[var(--c-borda)]"
              title="Sai da lista e volta sozinha na próxima mensagem"
            >
              <Archive className="w-3.5 h-3.5" />
              Arquivar
            </button>

            {/*
              EXCLUIR — sai da aba e NÃO volta sozinha.

              É a única diferença para arquivar, e é ela que justifica as
              duas existirem. Mensagem nova continua chegando: o contador
              conta e o aviso do celular toca. O que não acontece é a
              conversa reaparecer na lista por conta própria.

              Nenhuma mensagem é apagada. Chamar o colega de novo traz a
              conversa inteira de volta.
            */}
            <button
              type="button"
              onClick={() => {
                removerConversaDaLista(colaboradorId, conversa.id);
                fechar();
                aoMudarPreferencia?.();
              }}
              className="w-full px-3 h-9 flex items-center gap-2.5 text-xs font-semibold text-left text-red-600 dark:text-red-400 hover:bg-red-500/10 active:bg-red-500/10 transition-colors border-t border-[var(--c-borda)]"
              title="Sai da aba e só volta quando você chamar o colega de novo"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </>
      );
    })()}
    </div>
  );
};
