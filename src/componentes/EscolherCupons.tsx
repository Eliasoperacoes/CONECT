/**
 * QUAIS LEVAS DE CUPONS IMPRIMIR — por cidade, e Pirassununga por
 * responsável (Elias, 14/10/2026). A regra de agrupar mora em
 * `gruposDeCupons`; aqui só se mostra e se marca.
 *
 * VÁRIAS LEVAS DE UMA VEZ: "a Dani com o restante" é marcar todas as
 * equipes que sobraram e imprimir numa folha só. Antes cada toque
 * imprimia um grupo, e o restante viravam várias impressões.
 */
import React, { useState } from 'react';
import { Check, Printer } from 'lucide-react';
import { FolhaInferior } from './FolhaInferior';
import { gruposDeCupons, type CupomDeAcesso, type GrupoDeCupons } from '../servicos/cuponsDeAcesso';

export const EscolherCupons: React.FC<{
  cupons: CupomDeAcesso[] | null;
  aoImprimir: (grupos: GrupoDeCupons[]) => void;
  aoFechar: () => void;
}> = ({ cupons, aoImprimir, aoFechar }) => {
  const grupos = cupons ? gruposDeCupons(cupons) : [];
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const alternar = (rotulo: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(rotulo)) novo.delete(rotulo);
      else novo.add(rotulo);
      return novo;
    });

  const escolhidos = grupos.filter((g) => marcados.has(g.rotulo));
  const total = escolhidos.reduce((s, g) => s + g.quantos, 0);

  const fechar = () => {
    setMarcados(new Set());
    aoFechar();
  };

  return (
    <FolhaInferior
      aberto={!!cupons}
      titulo="Cupons de primeiro acesso"
      subtitulo={`${cupons?.length ?? 0} ${cupons?.length === 1 ? 'pessoa ainda não entrou' : 'pessoas ainda não entraram'} · marque as levas`}
      aoFechar={fechar}
    >
      <ul className="divide-y divide-[var(--c-borda)] border-y border-[var(--c-borda)] bg-[var(--c-superficie)]">
        {grupos.map((g) => {
          const marcado = marcados.has(g.rotulo);
          return (
            <li key={g.rotulo}>
              <button
                type="button"
                role="checkbox"
                aria-checked={marcado}
                id={`cupons-${g.loja}-${g.responsavel ?? 'todos'}`.replace(/\s+/g, '-').toLowerCase()}
                onClick={() => alternar(g.rotulo)}
                className="w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors"
              >
                <span
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    marcado
                      ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'border-[var(--c-borda-forte)]'
                  }`}
                >
                  {marcado && <Check className="w-4 h-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--c-texto)] truncate">{g.rotulo}</span>
                  <span className="block text-xs text-[var(--c-texto-3)]">
                    {g.quantos} {g.quantos === 1 ? 'cupom' : 'cupons'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 p-4 bg-[var(--c-canvas)] border-t border-[var(--c-borda)] flex items-center gap-3">
        <span className="flex-1 text-xs text-[var(--c-texto-3)]">
          {escolhidos.length === 0
            ? 'Nenhuma leva marcada'
            : `${escolhidos.length} ${escolhidos.length === 1 ? 'leva' : 'levas'} · ${total} ${total === 1 ? 'cupom' : 'cupons'}`}
        </span>
        <button
          type="button"
          id="imprimir-cupons-marcados"
          disabled={escolhidos.length === 0}
          onClick={() => {
            aoImprimir(escolhidos);
            setMarcados(new Set());
          }}
          className="px-4 py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40 flex items-center gap-2"
        >
          <Printer className="w-4 h-4" />
          Imprimir
        </button>
      </div>
    </FolhaInferior>
  );
};
