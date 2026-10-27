/**
 * A SEÇÃO FERRAMENTAS — os aplicativos internos em blocos (Elias,
 * 20/10/2026). A mesma tela no computador (área principal) e no celular
 * (aba da barra de baixo). Um bloco por sistema; aberto, as partes dele em
 * abas (Elias, 21/10: "tudo dentro do mesmo lugar, de maneira organizada").
 * Quem vê cada bloco e cada parte é `ferramentasDe` (ferramentasInternas.ts).
 *
 * UM TÍTULO SÓ: a grade se chama "Ferramentas"; aberta, a página se chama
 * como a ferramenta, com as abas logo embaixo — o cabeçalho padrão do
 * computador não aparece aqui (ConteudoWeb), para nada se repetir.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ShoppingCart, LayoutGrid, Search, Inbox, History, Truck, Percent, PackageCheck, ClipboardList, LayoutDashboard, BarChart3, type LucideIcon } from 'lucide-react';
import type { Colaborador } from '../tipos';
import { podeAtenderFila, NIVEL_GERENTE } from '../tipos';
import { podeUsar } from '../servicos/permissoes';
import { supabase } from '../servicos/supabase';
import {
  ferramentasDe,
  lugarParaAbrir,
  escreverLugar,
  CHAVE_DO_LUGAR,
  EVENTO_ABRIR_FERRAMENTA,
  type FerramentaInterna,
  type IdFerramentaInterna,
  type IdParteDaFerramenta,
  type LugarNasFerramentas,
} from '../servicos/ferramentasInternas';
import { cotacaoHumanaPeloSupabase, pendenciasDoCotador } from '../servicos/cotacaoHumana';
import { pedirAbertura } from '../servicos/aberturaDaCotacao';
import { encomendasPeloSupabase, ouvirEmRajada } from '../servicos/encomendas';
import { caminhoDaTela, lugarDentroDaTela } from '../servicos/enderecoDaTela';
import { lembrarOndeParei, ondeParei } from '../servicos/navegacaoLembrada';
import { ehTelaDeCelular } from '../servicos/tela';
import { AbasRolaveis } from './AbasRolaveis';
import { EstadoVazio } from './PadraoWeb';
import { ProtecaoDaTela } from './ProtecaoDaTela';
import { TelaCotar } from './TelaCotar';
import { TelaMargens } from './TelaMargens';
import { TelaFretes } from './TelaFretes';
import { TelaSolicitacoes } from './TelaSolicitacoes';
import { TelaHistorico } from './TelaHistorico';
import { TelaEncomendas } from './TelaEncomendas';
import { TelaPedidos, type ParteDosPedidos } from './TelaPedidos';
import { TelaPainelCompras } from './TelaPainelCompras';
import { TelaRelatorios, type DestinoDoRelatorio } from './TelaRelatorios';

const ICONE: Record<IdFerramentaInterna, LucideIcon> = { cotador: ShoppingCart };
const ICONE_DA_PARTE: Record<IdParteDaFerramenta, LucideIcon> = {
  cotar: Search,
  painel: LayoutDashboard,
  relatorios: BarChart3,
  encomendas: PackageCheck,
  solicitacoes: Inbox,
  pedidos: ClipboardList,
  historico: History,
  fretes: Truck,
  margens: Percent,
};

/**
 * O QUE ESPERA ESTA PESSOA NO COTADOR — o número da aba e do bloco. Muda na
 * hora (tempo real): solicitação nova para o comprador, resposta para o
 * vendedor.
 */
const usePendencias = (colaborador: Colaborador, ligado: boolean) => {
  const [p, setP] = useState({ solicitacoes: 0, respostas: 0 });
  const [encomendasNovas, setEncomendasNovas] = useState(0);
  const comprador = podeAtenderFila(colaborador);
  useEffect(() => {
    if (!supabase || !ligado) return;
    const servico = cotacaoHumanaPeloSupabase(supabase);
    const contar = () =>
      void servico
        .listar()
        .then((lista) => setP(pendenciasDoCotador(lista, colaborador.id, comprador)))
        .catch(() => {});
    contar();
    // Uma recontagem por rajada de mudanças (LIMITES-SUPABASE)
    return ouvirEmRajada((aoMudar) => servico.ouvir(aoMudar), contar);
  }, [ligado, colaborador.id, comprador]);
  // Compras: as encomendas esperando pedido, no número da aba Pedidos
  useEffect(() => {
    if (!supabase || !ligado || !comprador) return;
    const servico = encomendasPeloSupabase(supabase);
    const contar = () =>
      void servico
        .contarParaPedir()
        .then(setEncomendasNovas)
        .catch(() => {});
    contar();
    return ouvirEmRajada((aoMudar) => servico.ouvir(aoMudar), contar);
  }, [ligado, comprador]);
  return { ...p, encomendas: encomendasNovas };
};

/** Uma ferramenta aberta: o título dela, as abas das partes e a parte escolhida. */
const FerramentaAberta: React.FC<{
  ferramenta: FerramentaInterna;
  parte: IdParteDaFerramenta;
  aoTrocarParte: (p: IdParteDaFerramenta) => void;
  colaboradorAtual: Colaborador;
  aoVoltar: () => void;
  pendencias: { solicitacoes: number; respostas: number; encomendas: number };
}> = ({ ferramenta, parte, aoTrocarParte, colaboradorAtual, aoVoltar, pendencias }) => {
  const atual = ferramenta.partes.find((p) => p.id === parte) ?? ferramenta.partes[0];
  /** A parte do Pedidos em que o Painel mandou abrir (`vez` reabre mesmo se for a mesma) */
  const [pedidosEm, setPedidosEm] = useState<{ parte: ParteDosPedidos; vez: number }>({ parte: 'montar', vez: 0 });
  /** O Painel e os Relatórios levam cada número e cada insight à etapa dele (Elias, 22/10/2026) */
  const irPara = (destino: DestinoDoRelatorio | { aba: 'relatorios' }) => {
    if (destino.aba === 'pedidos') setPedidosEm({ parte: destino.parte, vez: Date.now() });
    aoTrocarParte(destino.aba);
  };
  const contador: Partial<Record<IdParteDaFerramenta, number>> = {
    solicitacoes: pendencias.solicitacoes,
    pedidos: pendencias.encomendas,
    cotar: pendencias.respostas,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-4 pt-3 md:px-6 md:pt-8">
        <button
          type="button"
          onClick={aoVoltar}
          className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-xs font-semibold text-[var(--c-texto-3)] hover:text-[var(--c-acento)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Ferramentas
        </button>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--c-texto)] md:text-3xl">{ferramenta.nome}</h1>
        {ferramenta.partes.length > 1 && (
          <div className="mt-3 border-b border-[var(--c-borda)] md:mt-5">
            <AbasRolaveis
              className="-mx-3 -mb-px"
              variante="sublinhado"
              ativa={atual.id}
              aoEscolher={aoTrocarParte}
              abas={ferramenta.partes.map((p) => {
                const Icone = ICONE_DA_PARTE[p.id];
                return { id: p.id, rotulo: p.nome, icone: <Icone />, contador: contador[p.id] || undefined, domId: `parte-${p.id}` };
              })}
            />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-4 md:px-6 md:pt-6">
        <ProtecaoDaTela nome={`${ferramenta.id} · ${atual.id}`}>
          {atual.id === 'cotar' && <TelaCotar colaboradorAtual={colaboradorAtual} />}
          {atual.id === 'encomendas' && <TelaEncomendas ehGerente={colaboradorAtual.nivel >= NIVEL_GERENTE} />}
          {atual.id === 'solicitacoes' && <TelaSolicitacoes />}
          {atual.id === 'pedidos' && <TelaPedidos key={pedidosEm.vez} parteInicial={pedidosEm.parte} />}
          {atual.id === 'painel' && <TelaPainelCompras aoIr={irPara} />}
          {atual.id === 'relatorios' && <TelaRelatorios colaboradorAtual={colaboradorAtual} aoIr={irPara} />}
          {atual.id === 'historico' && (
            <TelaHistorico
              colaboradorAtual={colaboradorAtual}
              aoReabrir={
                ferramenta.partes.some((p) => p.id === 'cotar')
                  ? (pedido) => {
                      // A aba Cotar pega o pedido ao montar: abre sem cotar de novo
                      pedirAbertura(pedido);
                      aoTrocarParte('cotar');
                    }
                  : undefined
              }
            />
          )}
          {atual.id === 'fretes' && <TelaFretes />}
          {atual.id === 'margens' && <TelaMargens colaboradorAtual={colaboradorAtual} />}
        </ProtecaoDaTela>
      </div>
    </div>
  );
};

/** Onde a pessoa estava: no computador, o endereço; no celular, o que ficou guardado no aparelho. */
const LEMBRAR = CHAVE_DO_LUGAR;
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
  const temCotador = blocos.some((b) => b.id === 'cotador');
  const pendencias = usePendencias(colaboradorAtual, temCotador);

  // Recarregou: volta para onde estava, se a pessoa ainda alcança (Elias, 21/10/2026)
  const [lugar, setLugar] = useState<LugarNasFerramentas | null>(() =>
    lugarParaAbrir(blocos, lugarGuardado(colaboradorAtual.id, blocos))
  );

  /** Troca de lugar e grava: no endereço (computador, com o voltar do navegador) e no aparelho. */
  const irPara = useCallback(
    (novo: LugarNasFerramentas | null) => {
      setLugar(novo);
      lembrarOndeParei(colaboradorAtual.id, LEMBRAR, escreverLugar(novo));
      if (!ehTelaDeCelular()) {
        const caminho = novo ? `${caminhoDaTela('ferramentas')}/${escreverLugar(novo)}` : caminhoDaTela('ferramentas');
        if (window.location.pathname !== caminho) window.history.pushState(null, '', caminho);
      }
    },
    [colaboradorAtual.id]
  );

  // O voltar e o avançar do navegador, e o "Abrir cotação" do chat, mudam o lugar de dentro também
  useEffect(() => {
    const aoNavegar = () => setLugar(lugarParaAbrir(blocos, lugarGuardado(colaboradorAtual.id, blocos)));
    window.addEventListener('popstate', aoNavegar);
    window.addEventListener(EVENTO_ABRIR_FERRAMENTA, aoNavegar);
    return () => {
      window.removeEventListener('popstate', aoNavegar);
      window.removeEventListener(EVENTO_ABRIR_FERRAMENTA, aoNavegar);
    };
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
        pendencias={pendencias}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-28 pt-3 md:px-6 md:pt-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--c-texto)] md:text-3xl">Ferramentas</h1>
      <p className="mt-1 text-sm text-[var(--c-texto-3)]">Os aplicativos internos do CONECTA.</p>
      {!blocos.length ? (
        <EstadoVazio icone={<LayoutGrid className="h-6 w-6" />} titulo="Nenhuma ferramenta" descricao="As ferramentas que você pode usar aparecem aqui." />
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blocos.map((b) => {
            const Icone = ICONE[b.id];
            const esperando = b.id === 'cotador' ? pendencias.solicitacoes + pendencias.respostas + pendencias.encomendas : 0;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => irPara(lugarParaAbrir(blocos, [b.id]))}
                className="relative flex items-start gap-3 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 text-left shadow-[var(--s-1)] transition hover:border-[var(--c-acento)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-acento)]"
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--c-acento-suave)] text-[var(--c-acento)]">
                  <Icone className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-extrabold text-[var(--c-texto)]">{b.nome}</span>
                  <span className="mt-0.5 block text-xs text-[var(--c-texto-3)]">{b.descricao}</span>
                  <span className="mt-2 block text-[11px] font-semibold text-[var(--c-texto-2)]">{b.partes.map((p) => p.nome).join(' · ')}</span>
                </span>
                {esperando > 0 && (
                  <span
                    aria-label={`${esperando} esperando você`}
                    className="absolute right-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white"
                  >
                    {esperando > 9 ? '9+' : esperando}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
