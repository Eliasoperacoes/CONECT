/**
 * A TABELA DO RELATÓRIO — o par acessível de todo gráfico (skill dataviz:
 * "todo gráfico tem a sua tabela"). Ordena pela coluna tocada; no celular
 * rola de lado com a 1ª coluna presa; mostra 15 e "Mostrar todas".
 */
import React, { useMemo, useState } from 'react';

/** Uma tabela do relatório: ordena pela coluna tocada; no celular, rola de lado com a 1ª coluna presa. */
export interface Coluna<T> {
  rotulo: string;
  valor: (l: T) => React.ReactNode;
  ordem?: (l: T) => number | string;
  direita?: boolean;
}
export function Tabela<T>({ colunas, linhas, chave, vazio, limite = 15 }: { colunas: Coluna<T>[]; linhas: T[]; chave: (l: T) => string; vazio: string; limite?: number }) {
  const [ordem, setOrdem] = useState<{ i: number; desc: boolean } | null>(null);
  const [todas, setTodas] = useState(false);
  const ordenadas = useMemo(() => {
    if (!ordem || !colunas[ordem.i].ordem) return linhas;
    const f = colunas[ordem.i].ordem!;
    return [...linhas].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return ordem.desc ? -c : c;
    });
  }, [linhas, ordem, colunas]);
  if (!linhas.length) return <p className="px-4 py-8 text-center text-sm text-[var(--c-texto-3)]">{vazio}</p>;
  const visiveis = todas ? ordenadas : ordenadas.slice(0, limite);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-xs">
          <thead>
            <tr className="border-b border-[var(--c-borda)] bg-[var(--c-superficie-2)]">
              {colunas.map((c, i) => (
                <th
                  key={c.rotulo}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)] ${c.direita ? 'text-right' : 'text-left'} ${
                    i === 0 ? 'sticky left-0 z-10 bg-[var(--c-superficie-2)]' : ''
                  }`}
                  aria-sort={ordem?.i === i ? (ordem.desc ? 'descending' : 'ascending') : undefined}
                >
                  {c.ordem ? (
                    <button type="button" className="uppercase hover:text-[var(--c-acento)]" onClick={() => setOrdem((o) => ({ i, desc: o?.i === i ? !o.desc : true }))}>
                      {c.rotulo}
                      {ordem?.i === i ? (ordem.desc ? ' ↓' : ' ↑') : ''}
                    </button>
                  ) : (
                    c.rotulo
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--c-borda)]">
            {visiveis.map((l) => (
              <tr key={chave(l)} className="hover:bg-[var(--c-superficie-2)]">
                {colunas.map((c, i) => (
                  <td
                    key={c.rotulo}
                    className={`whitespace-nowrap px-3 py-2 tabular-nums text-[var(--c-texto)] ${c.direita ? 'text-right' : ''} ${i === 0 ? 'sticky left-0 bg-[var(--c-superficie)] font-bold' : ''}`}
                  >
                    {c.valor(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.length > limite && (
        <button type="button" onClick={() => setTodas(!todas)} className="w-full border-t border-[var(--c-borda)] py-2 text-xs font-bold text-[var(--c-acento)] hover:bg-[var(--c-superficie-2)]">
          {todas ? 'Mostrar menos' : `Mostrar todas (${linhas.length})`}
        </button>
      )}
    </>
  );
}
