/**
 * As peças do Painel de Compras (desenho aprovado pelo Elias em 26/10/2026):
 * a linha do dia com a estação, o "Precisa de você agora", o fluxo das
 * etapas, os cartões dos fornecedores (4 por linha) e o "Hoje" com altura
 * fixa e rolagem. Só desenham: a conta mora em encomendas.ts e
 * estacaoCotacao.ts.
 */
import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { AcaoDoPainel, AtividadeDoDia, ColunaDoFornecedor, ConfiguracaoDeCompras, TipoDaAtividade } from '../../servicos/encomendas';
import { PAGINA_DA_EXTENSAO, versaoAtrasada, type ResumoDaEstacao } from '../../servicos/estacaoCotacao';
import { brl, haQuanto } from './visual';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Título de seção com a ação à direita */
export const CabecalhoDaSecao: React.FC<{ id: string; titulo: string; resumo?: string; children?: React.ReactNode }> = ({ id, titulo, resumo, children }) => (
  <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
    <h3 id={id} className="text-[15px] font-bold text-[var(--c-texto)]">
      {titulo}
      {resumo && <span className="ml-2 text-[13px] font-medium text-[var(--c-texto-3)]">{resumo}</span>}
    </h3>
    {children && <div className="flex items-center gap-4">{children}</div>}
  </header>
);

export const LinkDaSecao: React.FC<{ aoIr: () => void; children: React.ReactNode }> = ({ aoIr, children }) => (
  <button type="button" onClick={aoIr} className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--c-acento)] hover:underline">
    {children} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
  </button>
);

/** "Estação no ar · 13 sites ok · fila vazia" — ou o que está errado com ela */
export const LinhaDaEstacao: React.FC<{ estacao: ResumoDaEstacao | null; publicada?: string | null }> = ({ estacao, publicada = null }) => {
  if (!estacao) return null;
  // A extensão: fora do ar, o caminho para instalar; velha, o caminho para atualizar (/extensao.html)
  const atrasada = versaoAtrasada(estacao.versao, publicada);
  const linkDaExtensao =
    atrasada || !estacao.noAr ? (
      <a
        href={PAGINA_DA_EXTENSAO}
        target="_blank"
        rel="noreferrer"
        className={`font-bold hover:underline ${atrasada ? 'text-[var(--c-atencao)]' : 'text-[var(--c-acento)]'}`}
      >
        {atrasada ? `Extensão desatualizada (${estacao.versao} → ${publicada}) · atualizar` : 'Instalar a extensão'}
      </a>
    ) : null;
  const fila = estacao.naFila ? `${estacao.naFila} na fila` : 'fila vazia';
  const cor = !estacao.noAr ? 'var(--c-erro)' : estacao.problemas.length ? 'var(--c-atencao)' : 'var(--c-ok)';
  const texto = !estacao.noAr
    ? `Estação fora do ar${estacao.vistoEm ? ` · último sinal ${haQuanto(estacao.vistoEm)}` : ''} · ${fila}`
    : estacao.problemas.length
      ? `Estação no ar · ${estacao.problemas.join(' · ')} · ${fila}`
      : `Estação no ar · ${estacao.sitesTotal} sites ok · ${fila}`;
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: cor, boxShadow: `0 0 0 3px color-mix(in srgb, ${cor} 18%, transparent)` }} aria-hidden />
      <span>{texto}</span>
      {linkDaExtensao && <span aria-hidden>·</span>}
      {linkDaExtensao}
    </span>
  );
};

const FAIXA_DA_ACAO: Record<AcaoDoPainel['tom'], string> = { atencao: 'var(--c-atencao)', ok: 'var(--c-ok)', acento: 'var(--c-acento)' };
const ROTULO_DO_DESTINO: Record<AcaoDoPainel['destino'], string> = {
  solicitacoes: 'Responder',
  montar: 'Montar pedidos',
  chegada: 'Ver pedidos',
  transferencia: 'Ver transferências',
  conferencia: 'Ver conferência',
};

/** "Precisa de você agora": cada linha diz o que fazer, por quê, e leva lá */
export const PrecisaDeVoce: React.FC<{ acoes: AcaoDoPainel[]; aoIr: (destino: AcaoDoPainel['destino']) => void }> = ({ acoes, aoIr }) => (
  <section aria-labelledby="painel-agora" className="overflow-hidden rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)]">
    <h3 id="painel-agora" className="px-[18px] pb-2.5 pt-3.5 text-xs font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
      Precisa de você agora
    </h3>
    {acoes.length === 0 ? (
      <p className="flex items-center gap-3 border-t border-[var(--c-borda)] px-[18px] py-4 text-sm text-[var(--c-texto-2)]">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--c-ok)_14%,transparent)] text-[var(--c-ok)]" aria-hidden>
          <Check className="h-4 w-4" />
        </span>
        Tudo em dia. Nada esperando por você agora.
      </p>
    ) : (
      <ul>
        {acoes.map((a) => (
          <li key={a.titulo} className="border-t border-[var(--c-borda)]">
            <button
              type="button"
              onClick={() => aoIr(a.destino)}
              className="grid w-full grid-cols-[4px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 px-[18px] py-3.5 text-left transition-colors hover:bg-[var(--c-superficie-2)] sm:grid-cols-[4px_minmax(0,1fr)_auto]"
            >
              <span className="row-span-2 self-stretch rounded-sm sm:row-span-1" style={{ background: FAIXA_DA_ACAO[a.tom] }} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-[var(--c-texto)]">{a.titulo}</span>
                <span className="mt-0.5 block text-[13px] text-[var(--c-texto-3)]">{a.porque}</span>
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-[var(--c-acento)]">
                {ROTULO_DO_DESTINO[a.destino]} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export interface EtapaDoFluxo {
  rotulo: string;
  valor: number;
  nota: string;
  /** Acende em âmbar quando tem algo (solicitação, conferência) */
  alerta?: boolean;
  aoAbrir: () => void;
}

/** "Onde as peças estão": as etapas em sequência; zerada fica apagada */
export const FluxoDasEtapas: React.FC<{ etapas: EtapaDoFluxo[] }> = ({ etapas }) => (
  <ol className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] lg:grid-cols-4">
    {etapas.map((e, i) => (
      <li
        key={e.rotulo}
        className={`relative border-[var(--c-borda)] ${i % 2 ? 'border-l' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
      >
        <button type="button" onClick={e.aoAbrir} className="block h-full w-full px-[18px] py-4 text-left transition-colors hover:bg-[var(--c-superficie-2)]">
          <span className="block text-[13px] font-semibold text-[var(--c-texto-3)]">{e.rotulo}</span>
          <span
            className={`mt-1 block text-[30px] font-extrabold leading-tight tracking-tight tabular-nums ${
              !e.valor ? 'text-[var(--c-borda-forte)]' : e.alerta ? 'text-[var(--c-atencao)]' : 'text-[var(--c-texto)]'
            }`}
          >
            {e.valor}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--c-texto-3)]">{e.nota}</span>
        </button>
      </li>
    ))}
  </ol>
);

/** O selo do cartão: o que falta (âmbar perto, vermelho longe), ou que já pode pedir */
const seloDoFornecedor = (c: ColunaDoFornecedor): { texto: string; cor: string } => {
  if (c.situacao === 'sem_minimo') return { texto: 'Sem mínimo', cor: 'var(--c-ok)' };
  if (c.situacao === 'fecha') return { texto: 'Fecha ✓', cor: 'var(--c-ok)' };
  const perto = c.pedidoMinimo ? c.total / c.pedidoMinimo >= 0.75 : false;
  return { texto: `faltam ${brl(c.falta)}`, cor: perto ? 'var(--c-atencao)' : 'var(--c-erro)' };
};

/** Um fornecedor com encomenda: quanto juntou, contra o mínimo, e há quanto espera */
export const CartaoDoFornecedor: React.FC<{ coluna: ColunaDoFornecedor; aoAbrir: () => void }> = ({ coluna: c, aoAbrir }) => {
  const selo = seloDoFornecedor(c);
  const parte = c.pedidoMinimo ? Math.min(1, c.total / c.pedidoMinimo) : 1;
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={`Montar o pedido de ${c.nome}`}
      className="group flex min-h-[132px] flex-col gap-2.5 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-4 py-3.5 text-left transition-colors hover:border-[var(--c-borda-forte)]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold text-[var(--c-texto)]">{c.nome}</span>
        <span
          className="flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{ color: selo.cor, background: `color-mix(in srgb, ${selo.cor} 13%, transparent)` }}
        >
          {selo.texto}
        </span>
      </span>
      <span className="text-xl font-extrabold tracking-tight tabular-nums text-[var(--c-texto)]">
        {brl(c.total)}
        {c.pedidoMinimo != null && <span className="ml-1 text-[13px] font-medium text-[var(--c-texto-3)]">de {brl(c.pedidoMinimo)}</span>}
      </span>
      {c.pedidoMinimo != null && (
        <span className="h-1 overflow-hidden rounded bg-[var(--c-superficie-2)]" aria-hidden>
          <span className="block h-full rounded" style={{ width: `${parte * 100}%`, background: c.situacao === 'fecha' ? 'var(--c-ok)' : parte >= 0.75 ? 'var(--c-atencao)' : 'var(--c-texto-3)' }} />
        </span>
      )}
      <span className="mt-auto flex items-end justify-between gap-2 text-xs tabular-nums text-[var(--c-texto-3)]">
        <span>
          {c.encomendas.length} {c.encomendas.length === 1 ? 'encomenda' : 'encomendas'} · a mais antiga {haQuanto(c.maisAntiga)}
          {c.semCusto > 0 && ` · ${c.semCusto} sem custo`}
        </span>
        {/* O cartão é o caminho para montar: a seta aparece onde o olho já está */}
        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--c-acento)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      </span>
    </button>
  );
};

/** Os ligados sem encomenda: uma linha fina cada, com o mínimo */
export const FornecedoresParados: React.FC<{ fornecedores: ConfiguracaoDeCompras['fornecedores'] }> = ({ fornecedores }) =>
  fornecedores.length === 0 ? null : (
    <div>
      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
        Sem encomenda <span className="tabular-nums">({fornecedores.length})</span>
      </p>
      <ul className="grid grid-cols-1 gap-2 min-[481px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {fornecedores.map((f) => (
          <li key={f.chave} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--c-borda)] px-3.5 py-2.5">
            <span className="truncate text-[13px] font-semibold text-[var(--c-texto-2)]">{f.nome}</span>
            <span className="whitespace-nowrap text-xs tabular-nums text-[var(--c-texto-3)]">{f.pedido_minimo > 0 ? `mín. ${brl(f.pedido_minimo)}` : 'sem mínimo'}</span>
          </li>
        ))}
      </ul>
    </div>
  );

const COR_DO_TIPO: Record<TipoDaAtividade, string> = {
  encomenda: 'var(--c-acento)',
  pedido: 'var(--c-acento)',
  chegada: 'var(--c-atencao)',
  recebida: 'var(--c-ok)',
  cancelada: 'var(--c-erro)',
};

/** "Hoje": altura fixa, o mais recente em cima, rola por dentro */
export const ListaDoDia: React.FC<{ atividade: AtividadeDoDia[] }> = ({ atividade }) => (
  <div className="overflow-hidden rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)]">
    {atividade.length === 0 ? (
      <p className="px-[18px] py-4 text-[13px] text-[var(--c-texto-3)]">Nada aconteceu hoje ainda. Encomendas, pedidos e chegadas aparecem aqui na hora.</p>
    ) : (
      <>
        <ol className="max-h-80 overflow-y-auto [scrollbar-gutter:stable]" tabIndex={0} aria-label="Acontecimentos de hoje">
          {atividade.map((a, i) => (
            <li key={`${a.quando}-${i}`} className="grid grid-cols-[44px_8px_minmax(0,1fr)] items-center gap-3 border-t border-[var(--c-borda)] px-[18px] py-2.5 text-[13px] first:border-t-0 sm:grid-cols-[52px_8px_minmax(0,1fr)]">
              <time className="tabular-nums text-[var(--c-texto-3)]" dateTime={a.quando}>
                {hora(a.quando)}
              </time>
              <span className="h-2 w-2 rounded-full" style={{ background: COR_DO_TIPO[a.tipo] }} aria-hidden />
              <span className={a.tipo === 'cancelada' ? 'font-semibold text-[var(--c-erro)]' : 'text-[var(--c-texto)]'}>{a.texto}</span>
            </li>
          ))}
        </ol>
        {atividade.length > 8 && (
          <p className="border-t border-[var(--c-borda)] px-[18px] py-2.5 text-xs text-[var(--c-texto-3)]">Mais recentes no topo · role para ver o resto</p>
        )}
      </>
    )}
  </div>
);
