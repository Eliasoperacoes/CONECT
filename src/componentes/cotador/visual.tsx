/**
 * AS PEÇAS VISUAIS DO COTADOR — uma de cada, e todas as abas usam estas
 * (Elias, 21/10/2026: "tudo muito bagunçado e nada alinhado").
 *
 * As regras que valem em todo o cotador:
 *   · o PREÇO DE VENDA é o maior texto da linha, à direita, centavos alinhados;
 *   · as CORES têm um significado só, e sempre vêm com texto:
 *       verde = tem em SP · âmbar = fora do estado · cinza = sem estoque ·
 *       azul (acento) = resposta do comprador e custo;
 *   · a linha de fornecedor tem as mesmas colunas em toda parte.
 * Tudo pelos tokens do CONECTA (PadraoWeb.tsx): claro e escuro saem juntos.
 */
import React from 'react';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type Tom = 'ok' | 'atencao' | 'neutro' | 'acento' | 'erro';

const COR: Record<Tom, string> = {
  ok: 'bg-[color-mix(in_srgb,var(--c-ok)_14%,transparent)] text-[var(--c-ok)]',
  atencao: 'bg-[color-mix(in_srgb,var(--c-atencao)_16%,transparent)] text-[var(--c-atencao)]',
  neutro: 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)]',
  acento: 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]',
  erro: 'bg-[color-mix(in_srgb,var(--c-erro)_12%,transparent)] text-[var(--c-erro)]',
};

/** Um selo curto, sempre com texto (a cor nunca fala sozinha). */
export const Selo: React.FC<{ tom: Tom; children: React.ReactNode }> = ({ tom, children }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${COR[tom]}`}>
    {children}
  </span>
);

/** A faixa de cor à esquerda de uma linha: o mesmo significado do selo. */
export const FAIXA: Record<'sp' | 'fora' | 'sem' | 'comprador', string> = {
  sp: 'border-l-[var(--c-ok)]',
  fora: 'border-l-[var(--c-atencao)]',
  sem: 'border-l-[var(--c-borda-forte)]',
  comprador: 'border-l-[var(--c-acento)]',
};

/** O preço de venda: o maior texto da linha, tabular (centavos em coluna). */
export const Preco: React.FC<{ valor: number | null; grande?: boolean; aPartirDe?: boolean }> = ({ valor, grande, aPartirDe }) =>
  valor == null ? (
    <span className="text-xs font-bold uppercase tracking-wide text-[var(--c-texto-3)]">Sem estoque</span>
  ) : (
    <span className={`whitespace-nowrap font-extrabold tabular-nums text-[var(--c-texto)] ${grande ? 'text-2xl' : 'text-base'}`}>
      {aPartirDe && <span className="mr-1 align-middle text-[10px] font-bold uppercase text-[var(--c-atencao)]">a partir de</span>}
      {brl(valor)}
    </span>
  );

/** O custo, para quem vê custo: em azul, discreto, debaixo da venda. */
export const LinhaDeCusto: React.FC<{ custo: number; frete?: number | null; fator?: number | null; padrao?: boolean }> = ({
  custo,
  frete,
  fator,
  padrao,
}) => (
  <span className="block text-[11px] font-semibold tabular-nums text-[var(--c-acento)]">
    custo {brl(custo)}
    {frete != null && (frete > 0 ? ` + frete ${brl(frete)}` : ' · frete grátis')}
    {fator != null && ` × ${fator.toFixed(2).replace('.', ',')}`}
    {padrao && ' · fator padrão'}
  </span>
);

/**
 * UMA LINHA DE FORNECEDOR, com as mesmas colunas em toda parte:
 *   computador: nome | detalhe (local · estoque · prazo) | preço
 *   celular:    nome ........ preço
 *               detalhe
 */
export const LinhaDeFornecedor: React.FC<{
  nome: React.ReactNode;
  detalhe?: React.ReactNode;
  preco: React.ReactNode;
  selos?: React.ReactNode;
  extra?: React.ReactNode;
  faixa: keyof typeof FAIXA;
  apagada?: boolean;
}> = ({ nome, detalhe, preco, selos, extra, faixa, apagada }) => (
  <div className={`border-b border-l-4 border-[var(--c-borda)] px-3 py-2.5 last:border-b-0 sm:px-4 ${FAIXA[faixa]} ${apagada ? 'opacity-60' : ''}`}>
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(8rem,12rem)_1fr_auto]">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="truncate text-sm font-bold text-[var(--c-texto)]">{nome}</span>
        {selos}
      </span>
      <span className="order-3 col-span-2 min-w-0 text-xs text-[var(--c-texto-3)] sm:order-none sm:col-span-1">{detalhe}</span>
      <span className="text-right">{preco}</span>
    </div>
    {extra && <div className="mt-1 sm:pl-[12.75rem]">{extra}</div>}
  </div>
);

/** Um rótulo de seção dentro de um cartão: "SIMILARES (5) · do mais barato". */
export const RotuloDeSecao: React.FC<{ children: React.ReactNode; acao?: React.ReactNode }> = ({ children, acao }) => (
  <div className="flex items-center justify-between gap-2 border-b border-[var(--c-borda)] bg-[var(--c-superficie-2)] px-3 py-1.5 sm:px-4">
    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">{children}</span>
    {acao}
  </div>
);

/** "há 4 min" — o tempo que algo está esperando. */
export const haQuanto = (iso: string, agora: number = Date.now()): string => {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
};

/** 21/10 14:32, no horário de Brasília. */
export const quandoCurto = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
