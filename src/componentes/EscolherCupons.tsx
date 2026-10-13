/**
 * QUAL LEVA DE CUPONS IMPRIMIR — por cidade, e Pirassununga por setor
 * (Elias, 13/10/2026). A regra de agrupar mora em `gruposDeCupons`; aqui
 * só se mostra e se escolhe.
 */
import React from 'react';
import { ChevronRight, Printer } from 'lucide-react';
import { FolhaInferior } from './FolhaInferior';
import { gruposDeCupons, type CupomDeAcesso, type GrupoDeCupons } from '../servicos/cuponsDeAcesso';

export const EscolherCupons: React.FC<{
  cupons: CupomDeAcesso[] | null;
  aoImprimir: (grupo: GrupoDeCupons) => void;
  aoFechar: () => void;
}> = ({ cupons, aoImprimir, aoFechar }) => {
  const grupos = cupons ? gruposDeCupons(cupons) : [];
  return (
    <FolhaInferior
      aberto={!!cupons}
      titulo="Cupons de primeiro acesso"
      subtitulo={`${cupons?.length ?? 0} ${cupons?.length === 1 ? 'pessoa ainda não entrou' : 'pessoas ainda não entraram'} · escolha a leva`}
      aoFechar={aoFechar}
    >
      <ul className="pb-4 divide-y divide-[var(--c-borda)] border-y border-[var(--c-borda)] bg-[var(--c-superficie)]">
        {grupos.map((g) => (
          <li key={g.rotulo}>
            <button
              type="button"
              id={`cupons-${g.loja}-${g.setor ?? 'todos'}`.replace(/\s+/g, '-').toLowerCase()}
              onClick={() => aoImprimir(g)}
              className="w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors"
            >
              <span className="w-9 h-9 rounded-full bg-[var(--c-acento-suave)] text-[var(--c-acento)] flex items-center justify-center flex-shrink-0">
                <Printer className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--c-texto)] truncate">{g.rotulo}</span>
                <span className="block text-xs text-[var(--c-texto-3)]">
                  {g.quantos} {g.quantos === 1 ? 'cupom' : 'cupons'}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </FolhaInferior>
  );
};
