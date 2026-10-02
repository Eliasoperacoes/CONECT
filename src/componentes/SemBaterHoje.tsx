/**
 * SEM BATER HOJE — quem ainda não bateu o ponto, para chamar antes de o
 * dia fechar.
 *
 * Era uma lista corrida, em ordem alfabética, um cartão alto por pessoa:
 * com a rede de manhã cedo, rolar até achar alguém (Elias, 03/10/2026).
 * Agora, sem mudar o que a lista é:
 *
 *   - AGRUPADA pelo que o gestor reconhece de relance — a loja, quando há
 *     mais de uma; o setor, quando todos são da mesma loja —, cada grupo
 *     com o número dele e recolhível;
 *   - COMPACTA: linhas baixas, em duas ou três colunas no computador;
 *   - com BUSCA quando passa de algumas pessoas.
 *
 * Quem entra na lista não é decidido aqui: chega pronto do resumo da
 * equipe (`semBaterHoje`, de `obterResumoDoPeriodo`).
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, Search } from 'lucide-react';
import { Colaborador } from '../tipos';
import { FotoPresenca } from './FotoPresenca';

/** A partir de quantas pessoas a busca aparece: abaixo disso, ela só ocupa lugar. */
export const BUSCA_A_PARTIR_DE = 9;

/** Lista que não cabe numa tela abre com os grupos recolhidos — se houver mais de um. */
export const comecaRecolhida = (pessoas: number, grupos: number): boolean => pessoas > 12 && grupos > 1;

/**
 * Os grupos da lista, em ordem: por loja quando a lista tem mais de uma, por
 * setor quando todos são da mesma loja. Os grupos maiores primeiro — é onde
 * está o problema — e as pessoas em ordem alfabética dentro de cada um.
 */
export const agruparSemBater = (
  pessoas: Colaborador[]
): { por: 'loja' | 'setor'; grupos: Array<{ nome: string; pessoas: Colaborador[] }> } => {
  const por = new Set(pessoas.map((p) => p.loja)).size > 1 ? 'loja' : 'setor';
  const mapa = new Map<string, Colaborador[]>();
  for (const p of pessoas) {
    const chave = (por === 'loja' ? p.loja : p.setor) || 'Sem setor';
    mapa.set(chave, [...(mapa.get(chave) || []), p]);
  }
  const grupos = [...mapa]
    .map(([nome, lista]) => ({ nome, pessoas: [...lista].sort((a, b) => a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => b.pessoas.length - a.pessoas.length || a.nome.localeCompare(b.nome));
  return { por, grupos };
};

export const SemBaterHoje: React.FC<{
  pessoas: Colaborador[];
  aoAbrirConversa: (colegaId: string) => void;
}> = ({ pessoas, aoAbrirConversa }) => {
  const [busca, setBusca] = useState('');
  /*
    LISTA GRANDE ABRE RECOLHIDA: primeiro o resumo por grupo ("Pirassununga
    22 · Descalvado 7"), e o gestor abre o que é dele. Aberta, a primeira
    loja empurrava as outras para fora da tela.
  */
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => {
    const { grupos } = agruparSemBater(pessoas);
    return comecaRecolhida(pessoas.length, grupos.length) ? new Set(grupos.map((g) => g.nome)) : new Set();
  });

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(
    () =>
      termo
        ? pessoas.filter(
            (p) =>
              p.nome.toLowerCase().includes(termo) ||
              p.cargo.toLowerCase().includes(termo) ||
              p.setor.toLowerCase().includes(termo) ||
              p.loja.toLowerCase().includes(termo)
          )
        : pessoas,
    [pessoas, termo]
  );
  const { por, grupos } = useMemo(() => agruparSemBater(filtradas), [filtradas]);

  const alternar = (nome: string) =>
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      return novo;
    });

  if (pessoas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--c-texto-3)]">Todo mundo já bateu o ponto hoje.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
        Pode ser folga, atestado ou esquecimento. Chame a pessoa antes de o dia fechar — depois vira
        dia sem fechar, e aí é decisão sua.
      </p>

      {pessoas.length >= BUSCA_A_PARTIR_DE && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          <input
            id="busca-sem-bater"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo, setor ou loja"
            className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
          />
        </div>
      )}

      {filtradas.length === 0 && (
        <p className="py-6 text-center text-xs text-[var(--c-texto-3)]">Ninguém com “{busca.trim()}”.</p>
      )}

      {grupos.map((grupo) => {
        // Buscando, nada fica recolhido: o resultado tem de aparecer
        const fechado = !termo && recolhidos.has(grupo.nome);
        return (
          <section key={grupo.nome} className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-hidden">
            <button
              type="button"
              onClick={() => alternar(grupo.nome)}
              aria-expanded={!fechado}
              className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left hover:bg-[var(--c-superficie-2)] transition-colors"
            >
              {fechado ? (
                <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
              )}
              <span className="flex-1 min-w-0 text-xs font-bold text-[var(--c-texto)] truncate">{grupo.nome}</span>
              <span className="min-w-[1.5rem] h-6 px-2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[11px] font-bold flex items-center justify-center tabular-nums">
                {grupo.pessoas.length}
              </span>
            </button>

            {!fechado && (
              /* Cada célula tem borda embaixo e à direita; a margem negativa esconde
                 as da última linha e da última coluna dentro do cartão */
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 border-t border-[var(--c-borda)] -mr-px -mb-px">
                {grupo.pessoas.map((p) => (
                  <li
                    key={p.id}
                    className="px-3.5 py-2 flex items-center gap-2.5 border-b border-r border-[var(--c-borda)]"
                  >
                    <FotoPresenca foto={p.foto} nome={p.nome} presenca={p.presenca} tamanho="w-8 h-8" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-[var(--c-texto)] truncate">{p.nome}</span>
                      <span className="block text-[11px] text-[var(--c-texto-3)] truncate">
                        {/* O grupo já diz a loja (ou o setor): a linha não repete */}
                        {[p.cargo, por === 'loja' ? p.setor : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => aoAbrirConversa(p.id)}
                      title={`Chamar ${p.nome} no chat`}
                      aria-label={`Chamar ${p.nome} no chat`}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--c-acento)] hover:bg-[var(--c-acento)]/10 active:scale-95 transition-all flex-shrink-0"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};
