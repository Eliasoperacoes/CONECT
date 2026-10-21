/**
 * A SEÇÃO FERRAMENTAS — os aplicativos internos em blocos (Elias,
 * 20/10/2026). A mesma tela no computador (área principal) e no celular
 * (aba da barra de baixo). Um bloco por sistema; aberto, as partes dele em
 * abas (Elias, 21/10: "tudo dentro do mesmo lugar, de maneira organizada").
 * Quem vê cada bloco e cada parte é `ferramentasDe` (ferramentasInternas.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ShoppingCart, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { Colaborador } from '../tipos';
import { podeUsar } from '../servicos/permissoes';
import {
  ferramentasDe,
  lugarParaAbrir,
  escreverLugar,
  type FerramentaInterna,
  type IdFerramentaInterna,
  type IdParteDaFerramenta,
  type LugarNasFerramentas,
} from '../servicos/ferramentasInternas';
import { caminhoDaTela, lugarDentroDaTela } from '../servicos/enderecoDaTela';
import { lembrarOndeParei, ondeParei } from '../servicos/navegacaoLembrada';
import { ehTelaDeCelular } from '../servicos/tela';
import { EstadoVazio } from './PadraoWeb';
import { ProtecaoDaTela } from './ProtecaoDaTela';
import { TelaCotar } from './TelaCotar';
import { TelaMargens } from './TelaMargens';
import { TelaFretes } from './TelaFretes';
import { TelaSolicitacoes } from './TelaSolicitacoes';

const ICONE: Record<IdFerramentaInterna, LucideIcon> = {
  cotador: ShoppingCart,
};

/** Uma ferramenta aberta: as abas das partes (quando há mais de uma) e a parte escolhida. */
const FerramentaAberta: React.FC<{
  ferramenta: FerramentaInterna;
  parte: IdParteDaFerramenta;
  aoTrocarParte: (p: IdParteDaFerramenta) => void;
  colaboradorAtual: Colaborador;
  aoVoltar: () => void;
}> = ({ ferramenta, parte, aoTrocarParte: setParte, colaboradorAtual, aoVoltar }) => {
  const atual = ferramenta.partes.find((p) => p.id === parte) ?? ferramenta.partes[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--c-borda)] px-3 py-2 md:px-0 md:pb-3 md:pt-0">
        <button
          type="button"
          onClick={aoVoltar}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-acento)]"
        >
          <ArrowLeft className="h-4 w-4" /> Ferramentas
        </button>
        <span className="text-xs text-[var(--c-texto-3)]">›</span>
        <span className="truncate text-xs font-bold text-[var(--c-texto)]">{ferramenta.nome}</span>
      </div>

      {ferramenta.partes.length > 1 && (
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-[var(--c-borda)] px-3 md:px-0">
          {ferramenta.partes.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === atual.id}
              onClick={() => setParte(p.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
                p.id === atual.id
                  ? 'border-[var(--c-acento)] text-[var(--c-acento)]'
                  : 'border-transparent text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
              }`}
            >
              {p.nome}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:px-0 md:py-4">
        <ProtecaoDaTela nome={`${ferramenta.id} · ${atual.id}`}>
          {atual.id === 'cotar' && <TelaCotar colaboradorAtual={colaboradorAtual} />}
          {atual.id === 'solicitacoes' && <TelaSolicitacoes />}
          {atual.id === 'fretes' && <TelaFretes />}
          {atual.id === 'margens' && <TelaMargens colaboradorAtual={colaboradorAtual} />}
        </ProtecaoDaTela>
      </div>
    </div>
  );
};

/** Onde a pessoa estava: no computador, o endereço; no celular, o que ficou guardado no aparelho. */
const LEMBRAR = 'ferramentas';
const lugarGuardado = (colaboradorId: string, blocos: FerramentaInterna[]): string[] => {
  if (!ehTelaDeCelular()) return lugarDentroDaTela(window.location.pathname, 'ferramentas');
  const possiveis = blocos.flatMap((b) => b.partes.map((p) => escreverLugar({ ferramenta: b.id, parte: p.id })));
  return ondeParei(colaboradorId, LEMBRAR, possiveis, '').split('/');
};

export const TelaFerramentas: React.FC<{ colaboradorAtual: Colaborador }> = ({ colaboradorAtual }) => {
  const blocos = useMemo(
    () => ferramentasDe(colaboradorAtual, (chave) => podeUsar(chave, colaboradorAtual)),
    [colaboradorAtual]
  );
  // Recarregou: volta para onde estava, se a pessoa ainda alcança (Elias, 21/10/2026)
  const [lugar, setLugar] = useState<LugarNasFerramentas | null>(() =>
    lugarParaAbrir(blocos, lugarGuardado(colaboradorAtual.id, blocos))
  );

  /** Troca de lugar e grava: no endereço (computador, com o voltar do navegador) e no aparelho. */
  const irPara = (novo: LugarNasFerramentas | null) => {
    setLugar(novo);
    lembrarOndeParei(colaboradorAtual.id, LEMBRAR, escreverLugar(novo));
    if (!ehTelaDeCelular()) {
      const caminho = novo ? `${caminhoDaTela('ferramentas')}/${escreverLugar(novo)}` : caminhoDaTela('ferramentas');
      if (window.location.pathname !== caminho) window.history.pushState(null, '', caminho);
    }
  };

  // O voltar e o avançar do navegador mudam o lugar de dentro também
  useEffect(() => {
    const aoNavegar = () => setLugar(lugarParaAbrir(blocos, lugarGuardado(colaboradorAtual.id, blocos)));
    window.addEventListener('popstate', aoNavegar);
    return () => window.removeEventListener('popstate', aoNavegar);
  }, [blocos, colaboradorAtual.id]);

  const atual = lugar && blocos.find((b) => b.id === lugar.ferramenta);

  if (atual && lugar) {
    return (
      <FerramentaAberta
        ferramenta={atual}
        parte={lugar.parte}
        aoTrocarParte={(parte) => irPara({ ferramenta: atual.id, parte })}
        colaboradorAtual={colaboradorAtual}
        aoVoltar={() => irPara(null)}
      />
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
              onClick={() => irPara(lugarParaAbrir(blocos, [b.id]))}
              className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 text-left shadow-[var(--s-1)] transition hover:-translate-y-0.5 hover:border-[var(--c-acento)] hover:shadow-[var(--s-2)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--c-acento-suave)] text-[var(--c-acento)]">
                <Icone className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-extrabold text-[var(--c-texto)]">{b.nome}</span>
                <span className="mt-1 block text-[11px] leading-4 text-[var(--c-texto-3)]">
                  {b.partes.map((p) => p.nome).join(' · ')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
