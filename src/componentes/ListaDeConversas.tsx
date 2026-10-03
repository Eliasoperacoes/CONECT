/**
 * A LISTA DE CONVERSAS — a mesma no celular e no chat em tela cheia do
 * computador (o modo "Teams").
 *
 * Ela morava escrita dentro do App, só para o celular. Quando o computador
 * ganhou a tela cheia (Elias, 03/10/2026), a lista da esquerda precisava
 * ser ESTA: busca no alto, grupos recolhíveis em cima, conversas embaixo —
 * o que o Elias aprovou no celular. Copiá-la seria a quinta vez que a mesma
 * coisa escrita em dois lugares diverge neste sistema.
 */
import React from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Search, Users, X } from 'lucide-react';
import { Conversa } from '../tipos';
import { ItemConversa } from './ItemConversa';
import { ResultadosDaBusca } from './ResultadosDaBusca';

/** A barra de busca do alto da lista — estilo WhatsApp. */
export const BuscaDeConversas: React.FC<{
  valor: string;
  aoMudar: (valor: string) => void;
  /** No computador as duas listas existem na página: ids diferentes. */
  id?: string;
}> = ({ valor, aoMudar, id = 'busca-conversas' }) => (
  <div className="px-3 pt-3 pb-2 bg-[var(--c-superficie)] flex-shrink-0">
    <label className="flex items-center gap-2.5 h-11 md:h-10 px-4 rounded-full bg-[var(--c-superficie-2)] border border-transparent focus-within:border-[var(--c-acento)] transition-colors">
      <Search className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
      <input
        id={id}
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Pesquisar conversas e mensagens"
        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] md:text-sm text-[var(--c-texto)] placeholder:text-[var(--c-texto-3)] [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button
          type="button"
          onClick={() => aoMudar('')}
          aria-label="Limpar a busca"
          className="w-7 h-7 -mr-1.5 rounded-full flex items-center justify-center text-[var(--c-texto-3)] active:bg-[var(--c-canvas)] hover:bg-[var(--c-canvas)]"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </label>
  </div>
);

export const ListaDeConversas: React.FC<{
  busca: string;
  /** Tudo, sem preferências: a busca procura também no que está arquivado. */
  todas: Conversa[];
  conversasVisiveis: Conversa[];
  gruposVisiveis: Conversa[];
  naoLidasDosGrupos: number;
  gruposAbertos: boolean;
  aoAlternarGrupos: () => void;
  selecionadaId: string | null;
  colaboradorId: string;
  aoAbrir: (conversaId: string, mensagemId?: string) => void;
  aoMudarPreferencia: () => void;
  aoNovaConversa: () => void;
}> = ({
  busca,
  todas,
  conversasVisiveis,
  gruposVisiveis,
  naoLidasDosGrupos,
  gruposAbertos,
  aoAlternarGrupos,
  selecionadaId,
  colaboradorId,
  aoAbrir,
  aoMudarPreferencia,
  aoNovaConversa,
}) => {
  if (busca.trim()) {
    return <ResultadosDaBusca termo={busca} conversas={todas} aoAbrir={aoAbrir} />;
  }

  if (conversasVisiveis.length === 0 && gruposVisiveis.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--c-texto-3)] text-xs space-y-3">
        <p>Nenhuma conversa iniciada ainda.</p>
        <button
          type="button"
          onClick={aoNovaConversa}
          className="py-2 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-xs"
        >
          + Nova conversa
        </button>
      </div>
    );
  }

  const item = (c: Conversa) => (
    <ItemConversa
      key={c.id}
      conversa={c}
      selecionada={selecionadaId === c.id}
      aoClicar={() => aoAbrir(c.id)}
      colaboradorId={colaboradorId}
      aoMudarPreferencia={aoMudarPreferencia}
    />
  );

  return (
    <>
      {/*
        OS GRUPOS VÊM PRIMEIRO, logo abaixo da busca (Elias, 03/10/2026): no
        fim da lista, com muitas conversas, eles ficavam lá embaixo, longe do
        polegar. Recolhidos, ocupam uma linha só e dizem quantas não lidas há.
      */}
      {gruposVisiveis.length > 0 && (
        <>
          <button
            type="button"
            onClick={aoAlternarGrupos}
            aria-expanded={gruposAbertos}
            className="w-full px-4 py-2.5 border-b border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center gap-2 text-left active:bg-[var(--c-superficie-2)] md:hover:bg-[var(--c-superficie-2)] transition-colors"
          >
            {gruposAbertos ? (
              <ChevronUp className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
            )}
            <Users className="w-3.5 h-3.5 text-[var(--c-texto-3)] shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--c-texto-2)]">Grupos</span>
            <span className="text-[11px] text-[var(--c-texto-3)]">{gruposVisiveis.length}</span>

            <div className="flex-1" />

            {/* Recolhido, o número de não lidas é o que faz abrir */}
            {naoLidasDosGrupos > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[11px] font-bold flex items-center justify-center">
                {naoLidasDosGrupos}
              </span>
            )}
          </button>

          {gruposAbertos && <div className="divide-y divide-[var(--c-borda)]">{gruposVisiveis.map(item)}</div>}
        </>
      )}
      {/* Com os grupos abertos, as conversas ganham o título delas: sem ele,
          a primeira conversa parecia mais um grupo */}
      {gruposAbertos && gruposVisiveis.length > 0 && conversasVisiveis.length > 0 && (
        <div className="px-4 py-2.5 border-b border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-[var(--c-texto-3)] shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--c-texto-2)]">Conversas</span>
          <span className="text-[11px] text-[var(--c-texto-3)]">{conversasVisiveis.length}</span>
        </div>
      )}
      <div className="divide-y divide-[var(--c-borda)]">{conversasVisiveis.map(item)}</div>
    </>
  );
};
