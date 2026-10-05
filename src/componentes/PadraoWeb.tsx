/**
 * O PADRÃO DO COMPUTADOR — os blocos de toda tela, copiados do desenho.
 *
 * Elias (05/10/2026): "nosso design está desregulado e não respeita nada
 * das boas práticas". A comparação com o desenho do Figma mostrou o mesmo
 * defeito em toda tela: cada uma desenhava o próprio cartão, título e
 * lista — três modelos de cartão de número, ações soltas numa linha à
 * parte, filtros longe da lista que filtram, estado vazio sem desenho.
 *
 * Aqui mora UM de cada, e as telas usam estes:
 *
 *   CabecalhoDeSecao  rótulo · título · frase, e a ação à direita
 *   CartaoNumero      um número com rótulo, tom e detalhe
 *   CartaoLista       a lista dentro de um cartão, com a barra no topo
 *   LinhaDaLista      avatar · nome · detalhe · info · ação escrita
 *   EstadoVazio       ícone, título e o que vai aparecer ali
 *   FiltroSegmentado  "Todos · Holerites · Espelhos"
 *   AvatarSuave       iniciais em tom claro, sempre do mesmo tamanho
 *
 * A escala é fixa: 30 (página, em ConteudoWeb) · 20 (seção) · 14 (texto)
 * · 11–10 (rótulos). Tudo pelos tokens: claro e escuro saem juntos.
 */
import React from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { FOTO_PADRAO_LOGO_EMPRESA } from '../servicos/bancoDados';

/** Rótulo · título · frase — e a ação da seção na mesma linha, à direita. */
export const CabecalhoDeSecao: React.FC<{
  rotulo?: string;
  titulo: string;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  id?: string;
}> = ({ rotulo, titulo, descricao, acao, id }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {rotulo && (
        <span className="block text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--c-acento)]">
          {rotulo}
        </span>
      )}
      <h2 id={id} className="mt-1 text-xl font-extrabold tracking-tight text-[var(--c-texto)]">
        {titulo}
      </h2>
      {descricao && <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--c-texto-3)]">{descricao}</p>}
    </div>
    {acao && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{acao}</div>}
  </div>
);

export type TomDoNumero = 'neutro' | 'acento' | 'atencao' | 'ok' | 'erro';

const COR_DO_TOM: Record<TomDoNumero, string> = {
  neutro: 'text-[var(--c-texto)]',
  acento: 'text-[var(--c-acento)]',
  atencao: 'text-[var(--c-atencao)]',
  ok: 'text-[var(--c-ok)]',
  erro: 'text-[var(--c-erro)]',
};

/** Um número: o rótulo em cima, o valor no tom dele, a linha que explica. */
export const CartaoNumero: React.FC<{
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: string;
  tom?: TomDoNumero;
  aoAbrir?: () => void;
  /** O cartão escolhe o que a lista de baixo mostra, e este é o escolhido. */
  ativo?: boolean;
  id?: string;
}> = ({ rotulo, valor, detalhe, tom = 'neutro', aoAbrir, ativo, id }) => {
  const Caixa = aoAbrir ? 'button' : 'div';
  return (
    <Caixa
      id={id}
      {...(aoAbrir ? { type: 'button' as const, onClick: aoAbrir, 'aria-pressed': ativo } : {})}
      className={`text-left rounded-2xl border bg-[var(--c-superficie)] p-4 shadow-[var(--s-1)] ${
        ativo ? 'border-[var(--c-acento)] ring-1 ring-[var(--c-acento)]' : 'border-[var(--c-borda)]'
      } ${aoAbrir ? 'transition hover:-translate-y-0.5 hover:shadow-[var(--s-2)]' : ''}`}
    >
      <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">{rotulo}</span>
      <span className={`mt-2 block text-2xl font-extrabold tracking-tight tabular-nums ${COR_DO_TOM[tom]}`}>{valor}</span>
      {detalhe && <span className="mt-1 block text-[11px] text-[var(--c-texto-3)]">{detalhe}</span>}
    </Caixa>
  );
};

/** "Todos · Holerites · Espelhos" — o filtro que mora na barra da lista. */
export function FiltroSegmentado<T extends string>({
  opcoes,
  ativo,
  aoEscolher,
}: {
  opcoes: Array<{ id: T; rotulo: string; contador?: number }>;
  ativo: T;
  aoEscolher: (id: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-xl bg-[var(--c-superficie-2)] p-1">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={ativo === o.id}
          onClick={() => aoEscolher(o.id)}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
            ativo === o.id
              ? 'bg-[var(--c-superficie)] text-[var(--c-texto)] shadow-[var(--s-1)]'
              : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
          }`}
        >
          {o.rotulo}
          {o.contador !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{o.contador}</span>}
        </button>
      ))}
    </div>
  );
}

/** A busca da barra da lista. */
export const BuscaDaLista: React.FC<{ valor: string; aoMudar: (v: string) => void; placeholder: string; id?: string }> = ({
  valor,
  aoMudar,
  placeholder,
  id,
}) => (
  <div className="relative sm:w-64">
    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--c-texto-3)]" />
    <input
      id={id}
      type="search"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] pl-9 pr-3 text-xs text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]"
    />
  </div>
);

/** A lista dentro de um cartão — o filtro e a busca na barra do topo, junto do que filtram. */
export const CartaoLista: React.FC<{ barra?: React.ReactNode; children: React.ReactNode; id?: string }> = ({
  barra,
  children,
  id,
}) => (
  <section
    id={id}
    className="overflow-hidden rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-1)]"
  >
    {barra && (
      <div className="flex flex-col gap-3 border-b border-[var(--c-borda)] p-4 sm:flex-row sm:items-center sm:justify-between">
        {barra}
      </div>
    )}
    {children}
  </section>
);

const TONS_DO_AVATAR = [
  'bg-[var(--c-acento-suave)] text-[var(--c-acento)]',
  'bg-[color-mix(in_srgb,var(--c-ok)_14%,transparent)] text-[var(--c-ok)]',
  'bg-[color-mix(in_srgb,var(--c-atencao)_14%,transparent)] text-[var(--c-atencao)]',
  'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)]',
];

/** As iniciais: "Fernanda Metzner Ceccarelli" → "FC". */
export const iniciaisDe = (nome: string): string => {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (partes[0][0] + ultima).toUpperCase();
};

/**
 * Iniciais em tom claro, do mesmo tamanho em toda lista. O tom sai do nome:
 * a pessoa tem sempre o seu. A foto só quando é DA PESSOA — o logo da
 * empresa (a foto de quem não pôs nenhuma) repetido em cada linha não
 * distingue ninguém.
 */
export const AvatarSuave: React.FC<{ nome: string; foto?: string }> = ({ nome, foto }) => {
  const tom = TONS_DO_AVATAR[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % TONS_DO_AVATAR.length];
  return foto && foto !== FOTO_PADRAO_LOGO_EMPRESA ? (
    <img src={foto} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tom}`}>
      {iniciaisDe(nome)}
    </span>
  );
};

/**
 * UMA LINHA DA LISTA: quem, o quê, e o que fazer — a ação escrita ("Revisar
 * e assinar"), e não só uma seta. Sem ação escrita, a linha inteira abre.
 */
export const LinhaDaLista: React.FC<{
  avatar?: React.ReactNode;
  titulo: React.ReactNode;
  detalhe?: React.ReactNode;
  /** A informação da direita (loja, data), escondida no estreito. */
  info?: React.ReactNode;
  /** Um selo ao lado do título: "Alterado", "Aceito". */
  selo?: React.ReactNode;
  acao?: { rotulo: string; aoTocar: () => void; ocupado?: boolean };
  aoAbrir?: () => void;
}> = ({ avatar, titulo, detalhe, info, selo, acao, aoAbrir }) => (
  <div className="flex items-center gap-3 border-b border-[var(--c-borda)] px-4 py-3 last:border-0">
    <button
      type="button"
      onClick={aoAbrir}
      disabled={!aoAbrir}
      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-xs font-bold text-[var(--c-texto)]">{titulo}</span>
          {selo}
        </span>
        {detalhe && <span className="mt-0.5 block truncate text-[10px] text-[var(--c-texto-3)]">{detalhe}</span>}
      </span>
    </button>
    {info && <span className="hidden text-[10px] text-[var(--c-texto-3)] md:block">{info}</span>}
    {acao ? (
      <button
        type="button"
        onClick={acao.aoTocar}
        disabled={acao.ocupado}
        className="flex-shrink-0 rounded-lg border border-[var(--c-borda)] px-3 py-1.5 text-[10px] font-bold text-[var(--c-texto-2)] transition-colors hover:border-[var(--c-acento)] hover:text-[var(--c-acento)] disabled:opacity-50"
      >
        {acao.ocupado ? 'Abrindo…' : acao.rotulo}
      </button>
    ) : (
      aoAbrir && <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--c-texto-3)]" />
    )}
  </div>
);

/** A tela (ou a lista) vazia: o ícone, o que é, e o que vai aparecer ali. */
export const EstadoVazio: React.FC<{ icone: React.ReactNode; titulo: string; descricao: string }> = ({
  icone,
  titulo,
  descricao,
}) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--c-acento-suave)] text-[var(--c-acento)]">
      {icone}
    </span>
    <h3 className="mt-4 text-base font-extrabold text-[var(--c-texto)]">{titulo}</h3>
    <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[var(--c-texto-3)]">{descricao}</p>
  </div>
);

/** Os botões de ação, do mesmo tamanho e forma em toda tela. */
export const classeDoBotao = {
  principal:
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--c-acento)] px-4 text-xs font-bold text-[var(--c-sobre-acento)] shadow-[var(--s-1)] transition hover:brightness-110 disabled:opacity-50',
  secundario:
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-xs font-bold text-[var(--c-texto-2)] shadow-[var(--s-1)] transition hover:text-[var(--c-texto)] disabled:opacity-50',
};
