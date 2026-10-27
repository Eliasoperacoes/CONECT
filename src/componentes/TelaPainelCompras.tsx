/**
 * O PAINEL DE COMPRAS. Primeira versão em 22/10/2026 ("um dashboard com
 * todas as informações, extremamente organizado e usável, e linkado").
 * Redesenho aprovado em 26/10/2026: "clean e sofisticado e que se comunique
 * com o usuário".
 *
 * O trabalho da tela: em 5 segundos, o comprador sabe o que fazer agora.
 *   1. a linha do dia: a data, o corte e a estação de cotação;
 *   2. "Precisa de você agora": o que fazer, por quê, e o atalho;
 *   3. "Onde as peças estão": as etapas em sequência, cada uma leva à dela;
 *   4. os fornecedores com encomenda, 4 cartões por linha, e os parados
 *      numa lista fina (são 13 e vão crescer);
 *   5. o dia, com altura fixa e rolagem.
 * A conta mora em encomendas.ts e estacaoCotacao.ts; aqui só se desenha
 * (as peças em cotador/PainelComprasPartes.tsx).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { supabase } from '../servicos/supabase';
import { cotacaoHumanaPeloSupabase, type Solicitacao } from '../servicos/cotacaoHumana';
import {
  acoesDoPainel,
  ouvirEmRajada,
  encomendasPeloSupabase,
  fornecedoresDoPainel,
  resumoDoPainel,
  type ConfiguracaoDeCompras,
  type DestinoDaAcao,
  type EncomendaDeCompras,
} from '../servicos/encomendas';
import { lerEstacaoPeloSupabase, lerVersaoPublicada, type ResumoDaEstacao } from '../servicos/estacaoCotacao';
import type { ParteDosPedidos } from './TelaPedidos';
import { EstadoVazio, FiltroSegmentado } from './PadraoWeb';
import { brl, haQuanto } from './cotador/visual';
import {
  CabecalhoDaSecao,
  CartaoDoFornecedor,
  FluxoDasEtapas,
  FornecedoresParados,
  LinhaDaEstacao,
  LinkDaSecao,
  ListaDoDia,
  PrecisaDeVoce,
} from './cotador/PainelComprasPartes';

/** "faltam 2h10" até o corte de hoje, ou "encerrado" depois dele. */
const ateOCorte = (corte: string, agora: Date): { texto: string; passou: boolean } => {
  const [h, m] = corte.split(':').map(Number);
  const hojeSP = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const min = h * 60 + m - (hojeSP.getHours() * 60 + hojeSP.getMinutes());
  if (min <= 0) return { texto: 'encerrado hoje', passou: true };
  return { texto: `faltam ${min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`}`, passou: false };
};

type Destino = { aba: 'solicitacoes' } | { aba: 'relatorios' } | { aba: 'pedidos'; parte: ParteDosPedidos };

export const TelaPainelCompras: React.FC<{ aoIr: (destino: Destino) => void }> = ({ aoIr }) => {
  const encomendas = useMemo(() => (supabase ? encomendasPeloSupabase(supabase) : null), []);
  const humana = useMemo(() => (supabase ? cotacaoHumanaPeloSupabase(supabase) : null), []);
  const [lista, setLista] = useState<EncomendaDeCompras[] | null>(null);
  const [abertas, setAbertas] = useState<Solicitacao[]>([]);
  const [config, setConfig] = useState<ConfiguracaoDeCompras | null>(null);
  const [estacao, setEstacao] = useState<ResumoDaEstacao | null>(null);
  // A versão publicada da extensão: o Painel avisa quando a instalada ficou velha
  const [publicada, setPublicada] = useState<string | null>(null);
  useEffect(() => {
    void lerVersaoPublicada().then(setPublicada);
  }, []);
  const [agora, setAgora] = useState(() => new Date());
  const [so, setSo] = useState<'com' | 'todos'>('todos');
  const [erro, setErro] = useState('');

  const nomes = useMemo(() => Object.fromEntries((config?.fornecedores ?? []).map((f) => [f.chave, f.nome])), [config]);

  const carregar = useCallback(() => {
    encomendas
      ?.deCompras(['encomendada', 'pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida', 'cancelada', 'entregue'])
      .then((l) => (setLista(l), setErro('')))
      .catch((e) => (setErro((e as Error).message), setLista([])));
    humana
      ?.listar()
      .then((l) => setAbertas(l.filter((s) => s.situacao === 'aberta')))
      .catch(() => {});
  }, [encomendas, humana]);

  // A estação dá sinal a cada minuto: o painel relê junto com o relógio do corte
  const lerEstacao = useCallback(() => {
    if (supabase) lerEstacaoPeloSupabase(supabase, nomes).then(setEstacao).catch(() => setEstacao(null));
  }, [nomes]);

  // Tudo ao vivo: encomenda nova, cancelada, solicitação nova; o relógio do corte e a estação a cada minuto
  useEffect(() => {
    carregar();
    encomendas?.configuracao().then(setConfig).catch(() => {});
    const pararE = encomendas && ouvirEmRajada((aoMudar) => encomendas.ouvir(aoMudar), carregar);
    const pararS = humana && ouvirEmRajada((aoMudar) => humana.ouvir(aoMudar), carregar);
    return () => {
      pararE?.();
      pararS?.();
    };
  }, [encomendas, humana, carregar]);

  useEffect(() => {
    lerEstacao();
    const relogio = setInterval(() => {
      setAgora(new Date());
      lerEstacao();
    }, 60_000);
    return () => clearInterval(relogio);
  }, [lerEstacao]);

  if (!encomendas) {
    return <EstadoVazio icone={<ClipboardList className="h-6 w-6" />} titulo="Painel indisponível" descricao="Precisa do banco conectado." />;
  }
  if (lista === null) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o painel">
        <div className="h-28 animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
          ))}
        </div>
      </div>
    );
  }

  const r = resumoDoPainel(lista, agora);
  const corte = config?.horarioCorte;
  const prazo = corte ? ateOCorte(corte, agora) : null;
  const acoes = acoesDoPainel(r, abertas, (iso) => haQuanto(iso, agora.getTime()), brl, lista ?? [], agora);
  const { comEncomenda, semEncomenda } = fornecedoresDoPainel(r.colunas, config?.fornecedores ?? []);
  const prontos = comEncomenda.filter((c) => c.situacao !== 'falta').length;
  const maisAntigaSolicitacao = abertas.map((s) => s.criadaEm).sort()[0];
  const canceladas = r.atividade.filter((a) => a.tipo === 'cancelada').length;
  const dia = agora.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
  const data = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

  const irPara = (destino: DestinoDaAcao) =>
    aoIr(destino === 'solicitacoes' ? { aba: 'solicitacoes' } : { aba: 'pedidos', parte: destino });
  const montar = () => irPara('montar');

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-5">
        {/* 1. A linha do dia */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="text-lg font-bold capitalize text-[var(--c-texto)]">
            {dia} <span className="ml-1.5 text-sm font-medium normal-case text-[var(--c-texto-3)]">{data}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[13px] text-[var(--c-texto-2)]">
            {prazo && (
              <span title="Até o corte, o vendedor ainda pode cancelar a própria encomenda">
                Corte das <b className="font-bold tabular-nums text-[var(--c-texto)]">{corte}</b> ·{' '}
                {prazo.passou ? 'encomendas do dia firmes' : <b className="font-bold tabular-nums text-[var(--c-texto)]">{prazo.texto}</b>}
              </span>
            )}
            <LinhaDaEstacao estacao={estacao} publicada={publicada} />
          </div>
        </div>

        {erro && (
          <p role="alert" className="rounded-xl border border-[var(--c-erro)] p-3 text-sm text-[var(--c-erro)]">
            {erro}
          </p>
        )}

        {/* 2. Precisa de você agora */}
        <PrecisaDeVoce acoes={acoes} aoIr={irPara} />
      </div>

      {/* 3. Onde as peças estão */}
      <section aria-labelledby="painel-fluxo">
        <CabecalhoDaSecao id="painel-fluxo" titulo="Onde as peças estão">
          <span className="text-[13px] text-[var(--c-texto-3)]">Toque numa etapa para abrir</span>
        </CabecalhoDaSecao>
        <FluxoDasEtapas
          etapas={[
            {
              rotulo: 'Solicitações',
              valor: abertas.length,
              nota: maisAntigaSolicitacao ? `a mais antiga ${haQuanto(maisAntigaSolicitacao, agora.getTime())}` : 'nada esperando',
              alerta: true,
              aoAbrir: () => irPara('solicitacoes'),
            },
            { rotulo: 'Para pedir', valor: r.paraPedir, nota: r.paraPedir ? `${brl(r.custoParaPedir)} em custo` : 'nenhuma encomenda', aoAbrir: montar },
            {
              rotulo: 'Em trânsito',
              valor: r.aguardandoChegada,
              nota: r.pedidoMaisAntigo ? `pedido mais antigo ${haQuanto(r.pedidoMaisAntigo, agora.getTime())}` : 'nenhum pedido',
              aoAbrir: () => aoIr({ aba: 'pedidos', parte: 'chegada' }),
            },
            {
              rotulo: 'Em conferência',
              valor: r.emConferencia,
              nota: r.conferenciaMaisAntiga ? `esperando o Recebi ${haQuanto(r.conferenciaMaisAntiga, agora.getTime())}` : 'nada esperando',
              alerta: true,
              aoAbrir: () => irPara('conferencia'),
            },
          ]}
        />
      </section>

      {/* 4. Para pedir, por fornecedor */}
      <section aria-labelledby="painel-fornecedores">
        <CabecalhoDaSecao
          id="painel-fornecedores"
          titulo="Para pedir, por fornecedor"
          resumo={comEncomenda.length ? `${comEncomenda.length} com encomenda · ${prontos} ${prontos === 1 ? 'pronto' : 'prontos'} para pedir` : 'nenhuma encomenda esperando'}
        >
          <FiltroSegmentado
            opcoes={[
              { id: 'com', rotulo: 'Com encomenda', contador: comEncomenda.length },
              { id: 'todos', rotulo: 'Todos', contador: comEncomenda.length + semEncomenda.length },
            ]}
            ativo={so}
            aoEscolher={setSo}
          />
        </CabecalhoDaSecao>
        {comEncomenda.length ? (
          <div className="grid grid-cols-1 gap-3 min-[481px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {comEncomenda.map((c) => (
              <CartaoDoFornecedor key={c.chave} coluna={c} aoAbrir={montar} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-[18px] py-4 text-[13px] text-[var(--c-texto-3)]">
            Nenhuma encomenda esperando pedido.
          </p>
        )}
        {so === 'todos' && <FornecedoresParados fornecedores={semEncomenda} />}
      </section>

      {/* 5. Hoje */}
      <section aria-labelledby="painel-hoje">
        <CabecalhoDaSecao
          id="painel-hoje"
          titulo="Hoje"
          resumo={r.atividade.length ? `${r.atividade.length} ${r.atividade.length === 1 ? 'acontecimento' : 'acontecimentos'}${canceladas ? ` · ${canceladas} ${canceladas === 1 ? 'cancelada' : 'canceladas'}` : ''}` : undefined}
        >
          {/* Hoje é o começo: o período inteiro, os tempos e os insights moram nos Relatórios */}
          <LinkDaSecao aoIr={() => aoIr({ aba: 'relatorios' })}>Relatório completo</LinkDaSecao>
        </CabecalhoDaSecao>
        <ListaDoDia atividade={r.atividade} />
      </section>
    </div>
  );
};
