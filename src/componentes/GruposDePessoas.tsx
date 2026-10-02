/**
 * PESSOAS EM GRUPOS RECOLHÍVEIS — a organização de "Sem bater hoje",
 * que virou a de "Aprovar jornadas" também (Elias, 03/10/2026: "matando
 * essas listas grandes").
 *
 *   - AGRUPADA pelo que o gestor reconhece de relance: a loja, quando há
 *     mais de uma; o setor, quando todos são da mesma loja. Cada grupo com
 *     o seu número, recolhível;
 *   - lista que não cabe numa tela ABRE RECOLHIDA, mostrando primeiro o
 *     resumo por grupo;
 *   - linhas baixas, em até três colunas no computador;
 *   - BUSCA a partir de algumas pessoas.
 *
 * Um componente só para as duas listas: a organização escrita duas vezes
 * seria a busca de uma achando por cargo e a da outra não.
 *
 * O que cada linha mostra e faz é de quem usa (`linha`).
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Colaborador } from '../tipos';

/** A partir de quantas pessoas a busca aparece: abaixo disso, ela só ocupa lugar. */
export const BUSCA_A_PARTIR_DE = 9;

/** Lista que não cabe numa tela abre com os grupos recolhidos — se houver mais de um. */
export const comecaRecolhida = (pessoas: number, grupos: number): boolean => pessoas > 12 && grupos > 1;

/**
 * Os grupos da lista, em ordem: por loja quando a lista tem mais de uma, por
 * setor quando todos são da mesma loja. Os grupos maiores primeiro — é onde
 * está o problema — e as pessoas em ordem alfabética dentro de cada um.
 */
export const agruparPessoas = <T,>(
  itens: T[],
  pessoaDe: (item: T) => Colaborador
): { por: 'loja' | 'setor'; grupos: Array<{ nome: string; itens: T[] }> } => {
  const por = new Set(itens.map((i) => pessoaDe(i).loja)).size > 1 ? 'loja' : 'setor';
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const p = pessoaDe(item);
    const chave = (por === 'loja' ? p.loja : p.setor) || 'Sem setor';
    mapa.set(chave, [...(mapa.get(chave) || []), item]);
  }
  const grupos = [...mapa]
    .map(([nome, lista]) => ({
      nome,
      itens: [...lista].sort((a, b) => pessoaDe(a).nome.localeCompare(pessoaDe(b).nome)),
    }))
    .sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome));
  return { por, grupos };
};

/** A linha de baixo de cada pessoa: o cargo, e o setor quando o grupo é a loja. */
export const detalheNoGrupo = (p: Colaborador, por: 'loja' | 'setor'): string =>
  [p.cargo, por === 'loja' ? p.setor : ''].filter(Boolean).join(' · ');

export function GruposDePessoas<T>({
  itens,
  pessoaDe,
  linha,
  idDaBusca,
}: {
  itens: T[];
  pessoaDe: (item: T) => Colaborador;
  /** O conteúdo de uma linha. `por` diz o agrupamento, para a linha não repetir o que o grupo já diz. */
  linha: (item: T, por: 'loja' | 'setor') => React.ReactNode;
  idDaBusca: string;
}) {
  const [busca, setBusca] = useState('');
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => {
    const { grupos } = agruparPessoas(itens, pessoaDe);
    return comecaRecolhida(itens.length, grupos.length) ? new Set(grupos.map((g) => g.nome)) : new Set();
  });

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      termo
        ? itens.filter((i) => {
            const p = pessoaDe(i);
            return [p.nome, p.cargo, p.setor, p.loja, p.matricula || ''].some((campo) =>
              campo.toLowerCase().includes(termo)
            );
          })
        : itens,
    [itens, termo, pessoaDe]
  );
  const { por, grupos } = useMemo(() => agruparPessoas(filtrados, pessoaDe), [filtrados, pessoaDe]);

  const alternar = (nome: string) =>
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      return novo;
    });

  return (
    <div className="flex flex-col gap-3">
      {itens.length >= BUSCA_A_PARTIR_DE && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          <input
            id={idDaBusca}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo, setor ou loja"
            className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
          />
        </div>
      )}

      {filtrados.length === 0 && (
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
                {grupo.itens.length}
              </span>
            </button>

            {!fechado && (
              /* Cada célula tem borda embaixo e à direita; a margem negativa esconde
                 as da última linha e da última coluna dentro do cartão */
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 border-t border-[var(--c-borda)] -mr-px -mb-px">
                {grupo.itens.map((item) => (
                  <li key={pessoaDe(item).id} className="border-b border-r border-[var(--c-borda)]">
                    {linha(item, por)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
