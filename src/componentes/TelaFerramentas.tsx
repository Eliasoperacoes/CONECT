/**
 * A SEÇÃO FERRAMENTAS — os aplicativos internos em blocos (Elias,
 * 20/10/2026). A mesma tela no computador (área principal) e no celular
 * (aba da barra de baixo). Quem vê cada bloco é `ferramentasDe`
 * (ferramentasInternas.ts); aqui só se desenha e se abre.
 */
import React, { useState } from 'react';
import { ArrowLeft, Search, Percent, LayoutGrid, Truck, type LucideIcon } from 'lucide-react';
import type { Colaborador } from '../tipos';
import { podeUsar } from '../servicos/permissoes';
import { ferramentasDe, type IdFerramentaInterna } from '../servicos/ferramentasInternas';
import { EstadoVazio } from './PadraoWeb';
import { ProtecaoDaTela } from './ProtecaoDaTela';
import { TelaCotar } from './TelaCotar';
import { TelaMargens } from './TelaMargens';
import { TelaFretes } from './TelaFretes';

const ICONE: Record<IdFerramentaInterna, LucideIcon> = {
  cotar: Search,
  margens: Percent,
  fretes: Truck,
};

export const TelaFerramentas: React.FC<{ colaboradorAtual: Colaborador }> = ({ colaboradorAtual }) => {
  const blocos = ferramentasDe(colaboradorAtual, (chave) => podeUsar(chave, colaboradorAtual));
  const [aberta, setAberta] = useState<IdFerramentaInterna | null>(null);
  const atual = blocos.find((b) => b.id === aberta);

  if (atual) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--c-borda)] px-3 py-2 md:px-0 md:pb-3 md:pt-0">
          <button
            type="button"
            onClick={() => setAberta(null)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-acento)]"
          >
            <ArrowLeft className="h-4 w-4" /> Ferramentas
          </button>
          <span className="text-xs text-[var(--c-texto-3)]">›</span>
          <span className="truncate text-xs font-bold text-[var(--c-texto)]">{atual.nome}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 md:px-0 md:py-4">
          <ProtecaoDaTela nome={`ferramenta ${atual.id}`}>
            {atual.id === 'cotar' && <TelaCotar colaboradorAtual={colaboradorAtual} />}
            {atual.id === 'margens' && <TelaMargens colaboradorAtual={colaboradorAtual} />}
            {atual.id === 'fretes' && <TelaFretes />}
          </ProtecaoDaTela>
        </div>
      </div>
    );
  }

  if (!blocos.length) {
    return (
      <EstadoVazio
        icone={<LayoutGrid className="h-6 w-6" />}
        titulo="Nenhuma ferramenta"
        descricao="As ferramentas que você pode usar aparecem aqui."
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 md:p-0">
      <h2 className="mb-3 text-base font-extrabold text-[var(--c-texto)] md:hidden">Ferramentas</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {blocos.map((b) => {
          const Icone = ICONE[b.id];
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setAberta(b.id)}
              className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 text-left shadow-[var(--s-1)] transition hover:-translate-y-0.5 hover:border-[var(--c-acento)] hover:shadow-[var(--s-2)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--c-acento-suave)] text-[var(--c-acento)]">
                <Icone className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-extrabold text-[var(--c-texto)]">{b.nome}</span>
                <span className="mt-1 block text-[11px] leading-4 text-[var(--c-texto-3)]">{b.descricao}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
