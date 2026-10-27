/**
 * RELATÓRIOS DO COTADOR — um painel de widgets (docs/cotador/SPEC-insights-cotacao.md).
 *
 * Elias, 22/10/2026: "metrificar todo o processo, quanto tempo leva, onde tem
 * gargalo"; depois: "a visualização não ficou nada atraente, tudo misturado
 * e sem intuição — explorar a UI voltada a widgets, moderna".
 *
 * A leitura, de cima para baixo, do resumo ao detalhe:
 *   1. a linha de filtros (período primeiro), que vale para tudo abaixo;
 *   2. o número que abre o painel (valor encomendado, com a curva do período)
 *      e quatro cartões, cada um com a variação contra o período anterior;
 *   3. o dia a dia (cotações × encomendas) ao lado de "O que fazer agora";
 *   4. onde a peça espera (o gargalo) ao lado do caminho das peças (funil);
 *   5. os rankings: quem encomenda, o que sai, quem entrega;
 *   6. o que escapa (procurada sem encomenda) ao lado da linha do tempo;
 *   7. os dados em tabela (o par acessível de cada gráfico) e o Excel.
 * As contas moram em relatorios.ts; as peças visuais, em relatorios/.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Filter,
  Hourglass,
  Lightbulb,
  PackagePlus,
  RefreshCw,
  Percent,
  Route,
  Search,
  Table2,
  ThumbsUp,
  Trophy,
  Truck,
  Undo2,
  UserRound,
  Warehouse,
} from 'lucide-react';
import type { Colaborador } from '../tipos';
import { podeVerCusto } from '../tipos';
import { supabase } from '../servicos/supabase';
import { rodandoNoAplicativo } from '../servicos/aplicativo';
import { compartilharArquivo } from '../servicos/compartilharArquivo';
import {
  PERIODOS,
  abasDaPlanilha,
  escreverTempo,
  intervaloAnterior,
  intervaloDoPeriodo,
  montarRelatorio,
  motivosEmTexto,
  relatoriosPeloSupabase,
  serieDiaria,
  variacao,
  type DadosDoRelatorio,
  type EventoDaLinhaDoTempo,
  type FiltrosDoRelatorio,
  type IdDoPeriodo,
  type Insight,
  type TomDoInsight,
} from '../servicos/relatorios';
import type { ParteDosPedidos } from './TelaPedidos';
import { EstadoVazio, FiltroSegmentado, classeDoBotao } from './PadraoWeb';
import { Selo, brl } from './cotador/visual';
import { AreaNoTempo, CartaoDeNumero, ColunasPorDia, Delta, ListaDeBarras, Widget } from './relatorios/Widgets';
import { Tabela } from './relatorios/Tabela';

export type DestinoDoRelatorio = { aba: 'solicitacoes' } | { aba: 'historico' } | { aba: 'pedidos'; parte: ParteDosPedidos };

/** O insight pelo tom: ícone e cor do círculo (a cor sempre junto do ícone e do texto). */
const TOM: Record<TomDoInsight, { icone: React.ReactNode; circulo: string }> = {
  gargalo: { icone: <Hourglass className="h-4 w-4" />, circulo: 'bg-[color-mix(in_srgb,var(--c-erro)_12%,transparent)] text-[var(--c-erro)]' },
  atencao: { icone: <AlertTriangle className="h-4 w-4" />, circulo: 'bg-[color-mix(in_srgb,var(--c-atencao)_14%,transparent)] text-[var(--c-atencao)]' },
  estoque: { icone: <Warehouse className="h-4 w-4" />, circulo: 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]' },
  demanda: { icone: <Search className="h-4 w-4" />, circulo: 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]' },
  fornecedor: { icone: <Truck className="h-4 w-4" />, circulo: 'bg-[color-mix(in_srgb,var(--c-atencao)_14%,transparent)] text-[var(--c-atencao)]' },
  positivo: { icone: <ThumbsUp className="h-4 w-4" />, circulo: 'bg-[color-mix(in_srgb,var(--c-ok)_14%,transparent)] text-[var(--c-ok)]' },
};

const ICONE_DO_EVENTO: Record<EventoDaLinhaDoTempo['tipo'], React.ReactNode> = {
  cotacao: <Search className="h-3.5 w-3.5" />,
  solicitacao: <UserRound className="h-3.5 w-3.5" />,
  resposta: <UserRound className="h-3.5 w-3.5" />,
  encomenda: <PackagePlus className="h-3.5 w-3.5" />,
  pedido: <ClipboardList className="h-3.5 w-3.5" />,
  chegada: <Truck className="h-3.5 w-3.5" />,
  recebida: <CheckCircle2 className="h-3.5 w-3.5" />,
  cancelada: <Ban className="h-3.5 w-3.5" />,
};

/** "12,5%"; sem pedido, travessão */
const porcento = (t: number | null) => (t == null ? '—' : `${(Math.round(t * 1000) / 10).toLocaleString('pt-BR')}%`);

type AbaDaTabela = 'vendedores' | 'pecas' | 'demanda' | 'fornecedores' | 'lojas';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const brlCurto = (v: number) => (v >= 10_000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v));
const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');

export const TelaRelatorios: React.FC<{ colaboradorAtual: Colaborador; aoIr: (d: DestinoDoRelatorio) => void }> = ({ colaboradorAtual, aoIr }) => {
  const servico = useMemo(() => (supabase ? relatoriosPeloSupabase(supabase) : null), []);
  const mostraCusto = podeVerCusto(colaboradorAtual);
  const [periodo, setPeriodo] = useState<IdDoPeriodo>('30dias');
  const [datas, setDatas] = useState({ de: '', ate: '' });
  const [filtros, setFiltros] = useState<FiltrosDoRelatorio>({});
  const [dados, setDados] = useState<{ atual: DadosDoRelatorio; anterior: DadosDoRelatorio } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [exportando, setExportando] = useState(false);
  const [todosInsights, setTodosInsights] = useState(false);
  const [eventos, setEventos] = useState(8);
  const [aba, setAba] = useState<AbaDaTabela>('vendedores');
  const tabelas = useRef<HTMLDivElement>(null);
  // Cada leitura tem um número: a resposta de uma leitura velha que chega por último não apaga a nova
  const leitura = useRef(0);

  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, new Date(), datas), [periodo, datas]);
  // O período e o anterior juntos: a variação de cada número precisa dos dois
  const carregar = useCallback(() => {
    if (!servico) return;
    setCarregando(true);
    const esta = ++leitura.current;
    const antes = intervaloAnterior(intervalo);
    Promise.all([servico.carregar(intervalo.de, intervalo.ate), servico.carregar(antes.de, antes.ate)])
      .then(([atual, anterior]) => {
        if (esta !== leitura.current) return;
        setDados({ atual, anterior });
        setErro('');
      })
      .catch((e) => esta === leitura.current && setErro((e as Error).message))
      .finally(() => esta === leitura.current && setCarregando(false));
  }, [servico, intervalo]);

  // Relatório é análise, não painel ao vivo: lê ao abrir, ao trocar o período e no
  // "Atualizar". Reler a cada mudança fazia toda tela aberta baixar o período
  // atual e o anterior inteiros a cada encomenda (LIMITES-SUPABASE.md)
  useEffect(() => {
    carregar();
  }, [carregar]);

  const r = useMemo(() => (dados ? montarRelatorio(dados.atual, filtros) : null), [dados, filtros]);
  const antes = useMemo(() => (dados ? montarRelatorio(dados.anterior, filtros) : null), [dados, filtros]);
  const serie = useMemo(() => (dados ? serieDiaria(dados.atual, filtros, intervalo) : []), [dados, filtros, intervalo]);
  const nomeDoPeriodo = `${intervalo.de.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} a ${new Date(intervalo.ate.getTime() - 1).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  const temSerie = serie.length > 1;

  if (!servico) {
    return <EstadoVazio icone={<BarChart3 className="h-6 w-6" />} titulo="Relatórios indisponíveis" descricao="Precisa do banco conectado." />;
  }

  const agir = (destino: NonNullable<Insight['acao']>['destino']) =>
    aoIr(
      destino === 'solicitacoes'
        ? { aba: 'solicitacoes' }
        : destino === 'historico'
          ? { aba: 'historico' }
          : { aba: 'pedidos', parte: destino === 'pedidos_montar' ? 'montar' : destino === 'pedidos_chegada' ? 'chegada' : 'conferencia' }
    );
  const verTabela = (a: AbaDaTabela) => {
    setAba(a);
    requestAnimationFrame(() => tabelas.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  /** O Excel: as mesmas tabelas da tela e a jornada de cada encomenda, com as horas de cada etapa. */
  const exportar = async () => {
    if (!r || !dados) return;
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const livro = XLSX.utils.book_new();
      for (const [nome, linhas] of Object.entries(abasDaPlanilha(r, dados.atual, mostraCusto, nomeDoPeriodo))) {
        const folha = XLSX.utils.aoa_to_sheet(linhas);
        folha['!cols'] = (linhas[0] ?? []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...linhas.slice(0, 50).map((l) => String(l[i] ?? '').length + 2))) }));
        XLSX.utils.book_append_sheet(livro, folha, nome.slice(0, 31));
      }
      const arquivo = `relatorio-cotador-${nomeDoPeriodo.replace(/\//g, '-').replace(' a ', '_a_')}.xlsx`;
      if (rodandoNoAplicativo()) {
        const bytes = XLSX.write(livro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        await compartilharArquivo(bytes, arquivo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Relatório do cotador');
      } else {
        XLSX.writeFile(livro, arquivo);
      }
    } catch (e) {
      setErro(`Não deu para gerar a planilha: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  };

  const seletor =
    'h-9 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-xs font-medium text-[var(--c-texto)] outline-none transition hover:border-[var(--c-borda-forte)] focus:border-[var(--c-acento)]';
  const filtrando = !!(filtros.loja || filtros.vendedor || filtros.fornecedor);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. A LINHA DE FILTROS: o período primeiro; vale para tudo abaixo */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <FiltroSegmentado opcoes={PERIODOS} ativo={periodo} aoEscolher={setPeriodo} />
          </div>
          {periodo === 'personalizado' && (
            <span className="flex items-center gap-1.5">
              <input type="date" aria-label="De" className={seletor} value={datas.de} onChange={(e) => setDatas((d) => ({ ...d, de: e.target.value }))} />
              <span className="text-xs text-[var(--c-texto-3)]">até</span>
              <input type="date" aria-label="Até" className={seletor} value={datas.ate} onChange={(e) => setDatas((d) => ({ ...d, ate: e.target.value }))} />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="hidden h-4 w-4 text-[var(--c-texto-3)] sm:block" aria-hidden />
          <select aria-label="Loja" className={seletor} value={filtros.loja ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, loja: e.target.value || null }))}>
            <option value="">Todas as lojas</option>
            {r?.opcoes.lojas.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select aria-label="Vendedor" className={seletor} value={filtros.vendedor ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, vendedor: e.target.value || null }))}>
            <option value="">Todos os vendedores</option>
            {r?.opcoes.vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
          <select aria-label="Fornecedor" className={seletor} value={filtros.fornecedor ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, fornecedor: e.target.value || null }))}>
            <option value="">Todos os fornecedores</option>
            {r?.opcoes.fornecedores.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          {filtrando && (
            <button type="button" className="text-xs font-semibold text-[var(--c-acento)] hover:underline" onClick={() => setFiltros({})}>
              Limpar
            </button>
          )}
          <button type="button" className={`${classeDoBotao.secundario} h-9`} onClick={carregar} disabled={carregando} title="Ler o período de novo">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button type="button" className={`${classeDoBotao.secundario} h-9`} onClick={() => void exportar()} disabled={!r || exportando}>
            <Download className="h-4 w-4" /> {exportando ? 'Gerando…' : 'Excel'}
          </button>
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-xl border border-[var(--c-erro)] p-3 text-sm text-[var(--c-erro)]">
          {erro}
        </p>
      )}
      {/* Passou do teto de leitura: os números ficariam parciais sem ninguém saber */}
      {(dados?.atual.incompleto || dados?.anterior.incompleto) && (
        <p role="status" className="rounded-xl border border-[var(--c-atencao)] bg-[color-mix(in_srgb,var(--c-atencao)_10%,transparent)] p-3 text-sm text-[var(--c-texto)]">
          Este período tem mais movimento do que o relatório consegue ler de uma vez: os números saem parciais. Escolha um período menor.
        </p>
      )}

      {!r || !antes ? (
        <div className="grid gap-4 lg:grid-cols-12" aria-busy="true" aria-label="Montando o relatório">
          <div className="h-56 animate-pulse rounded-2xl bg-[var(--c-superficie-2)] lg:col-span-5" />
          <div className="grid grid-cols-2 gap-4 lg:col-span-7">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[6.5rem] animate-pulse rounded-2xl bg-[var(--c-superficie-2)]" />
            ))}
          </div>
        </div>
      ) : r.numeros.cotacoes + r.numeros.encomendas + r.numeros.solicitacoes + r.numeros.canceladas === 0 ? (
        <EstadoVazio icone={<BarChart3 className="h-6 w-6" />} titulo="Nada neste período" descricao="Escolha outro período ou tire os filtros." />
      ) : (
        // Trocando o período, o painel anterior fica, esmaecido, até o novo chegar: nada pisca nem pula
        <div className={`grid grid-cols-1 gap-4 transition-opacity lg:grid-cols-12 ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
          {/* 2. O NÚMERO QUE ABRE O PAINEL, e os quatro cartões */}
          <section aria-labelledby="valor-encomendado" className="flex min-w-0 flex-col rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-5 shadow-[var(--s-1)] lg:col-span-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="valor-encomendado" className="text-sm font-medium text-[var(--c-texto-2)]">
                Valor encomendado
              </h2>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--c-texto-3)]">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {nomeDoPeriodo}
              </span>
            </div>
            <span className="mt-1 text-4xl font-bold tracking-tight text-[var(--c-texto)] sm:text-5xl">{brl(r.numeros.valor)}</span>
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Delta v={variacao(r.numeros.valor, antes.numeros.valor, true)} />
              {mostraCusto && r.numeros.margem != null && (
                <span className="text-xs text-[var(--c-texto-3)]">
                  margem <b className="font-semibold text-[var(--c-texto-2)]">{brl(r.numeros.margem)}</b> ({pct(r.numeros.valor ? r.numeros.margem / r.numeros.valor : null)})
                </span>
              )}
            </span>
            <div className="mt-auto pt-4">
              {temSerie ? (
                <AreaNoTempo dias={serie.map((d) => d.dia)} valores={serie.map((d) => d.valor)} formatar={brl} nome="encomendado" />
              ) : (
                <p className="rounded-xl bg-[var(--c-superficie-2)] px-3 py-4 text-center text-xs text-[var(--c-texto-3)]">Escolha 7 dias ou mais para ver a curva do período.</p>
              )}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4 lg:col-span-7">
            <CartaoDeNumero
              rotulo="Encomendas"
              icone={<PackagePlus className="h-3.5 w-3.5" />}
              valor={r.numeros.encomendas.toLocaleString('pt-BR')}
              variacao={variacao(r.numeros.encomendas, antes.numeros.encomendas, true)}
              detalhe={`${r.numeros.pecasEncomendadas} peças`}
              tendencia={temSerie ? serie.map((d) => d.encomendas) : undefined}
            />
            <CartaoDeNumero
              rotulo="Cotações"
              icone={<Search className="h-3.5 w-3.5" />}
              valor={r.numeros.cotacoes.toLocaleString('pt-BR')}
              variacao={variacao(r.numeros.cotacoes, antes.numeros.cotacoes, true)}
              detalhe={`${r.numeros.pecasCotadas} peças diferentes`}
              tendencia={temSerie ? serie.map((d) => d.cotacoes) : undefined}
            />
            <CartaoDeNumero
              rotulo="Conversão"
              icone={<Percent className="h-3.5 w-3.5" />}
              valor={pct(r.numeros.conversao)}
              variacao={variacao(r.numeros.conversao, antes.numeros.conversao, true)}
              detalhe="cotação → encomenda"
              tendencia={temSerie ? serie.map((d) => (d.cotacoes ? d.encomendas / d.cotacoes : 0)) : undefined}
            />
            <CartaoDeNumero
              rotulo="Da cotação à entrega"
              icone={<Clock className="h-3.5 w-3.5" />}
              valor={escreverTempo(r.numeros.total)}
              variacao={variacao(r.numeros.total, antes.numeros.total, false)}
              detalhe={r.gargalo ? `gargalo: ${r.gargalo.nome.toLowerCase()}` : 'tempo típico'}
            />
          </div>

          {/* 3. O DIA A DIA, ao lado de O QUE FAZER AGORA */}
          <Widget
            className="lg:col-span-8"
            titulo="Cotações e encomendas por dia"
            icone={<BarChart3 className="h-4 w-4" />}
            sobre="A procura (cotações) ao fundo e o que virou encomenda na frente. Toque ou passe o mouse num dia para ver os números."
          >
            {temSerie ? (
              <>
                <div className="mb-3 flex items-center gap-4 text-xs text-[var(--c-texto-2)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[var(--c-acento)]" aria-hidden /> Encomendas
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[var(--c-borda-forte)]" aria-hidden /> Cotações
                  </span>
                </div>
                <ColunasPorDia dias={serie} formatarValor={brl} />
              </>
            ) : (
              <p className="rounded-xl bg-[var(--c-superficie-2)] px-3 py-10 text-center text-sm text-[var(--c-texto-3)]">
                Hoje: {r.numeros.cotacoes} cotações e {r.numeros.encomendas} encomendas. Escolha 7 dias ou mais para ver o dia a dia.
              </p>
            )}
          </Widget>

          <Widget className="lg:col-span-4" titulo="O que fazer agora" icone={<Lightbulb className="h-4 w-4" />} sobre="O que os números do período estão dizendo." colado>
            {r.insights.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-[var(--c-texto-3)]">Nada pedindo atenção neste período.</p>
            ) : (
              <>
                <ul className="divide-y divide-[var(--c-borda)]">
                  {(todosInsights ? r.insights : r.insights.slice(0, 3)).map((i) => (
                    <li key={i.titulo} className="flex gap-3 px-5 py-3">
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${TOM[i.tom].circulo}`} aria-hidden>
                        {TOM[i.tom].icone}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-5 text-[var(--c-texto)]">{i.titulo}</span>
                        <span className={`mt-0.5 block text-xs leading-5 text-[var(--c-texto-3)] ${todosInsights ? '' : 'line-clamp-2'}`} title={i.texto}>
                          {i.texto}
                        </span>
                        {i.acao && (
                          <button type="button" onClick={() => agir(i.acao!.destino)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--c-acento)] hover:underline">
                            {i.acao.rotulo} <ArrowRight className="h-3 w-3" aria-hidden />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {r.insights.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setTodosInsights(!todosInsights)}
                    className="w-full rounded-b-2xl border-t border-[var(--c-borda)] py-2.5 text-xs font-semibold text-[var(--c-acento)] hover:bg-[var(--c-superficie-2)]"
                  >
                    {todosInsights ? 'Mostrar menos' : `Ver mais ${r.insights.length - 3}`}
                  </button>
                )}
              </>
            )}
          </Widget>

          {/* 4. ONDE A PEÇA ESPERA (o gargalo), ao lado do CAMINHO DAS PEÇAS */}
          <Widget
            className="lg:col-span-7"
            titulo="Onde a peça espera"
            icone={<Hourglass className="h-4 w-4" />}
            sobre="Tempo típico de cada etapa (a barra) e até onde vão 9 em cada 10 (o traço)."
          >
            {(() => {
              const maior = Math.max(1, ...r.etapas.map((e) => e.p90 ?? e.mediana ?? 0));
              return (
                <ol className="flex flex-col gap-4">
                  {r.etapas.map((e) => {
                    const gargalo = r.gargalo?.id === e.id;
                    return (
                      <li key={e.id}>
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-[var(--c-texto)]">{e.nome}</span>
                              {gargalo && (
                                <Selo tom="erro">
                                  <Hourglass className="h-3 w-3" /> Gargalo
                                </Selo>
                              )}
                              {e.paradas > 0 && <Selo tom="atencao">{e.paradas} parada{e.paradas > 1 ? 's' : ''} agora</Selo>}
                            </span>
                            <span className="block text-xs text-[var(--c-texto-3)]">
                              {e.quem} · {e.n} {e.n === 1 ? 'medida' : 'medidas'}
                            </span>
                          </span>
                          <span className="flex-shrink-0 text-right">
                            <span className={`block text-sm font-bold ${gargalo ? 'text-[var(--c-erro)]' : 'text-[var(--c-texto)]'}`}>{escreverTempo(e.mediana)}</span>
                            {e.p90 != null && <span className="block text-[11px] text-[var(--c-texto-3)]">até {escreverTempo(e.p90)}</span>}
                          </span>
                        </div>
                        <span className="relative mt-2 block h-2 rounded-full bg-[var(--c-superficie-2)]" aria-hidden>
                          <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${((e.mediana ?? 0) / maior) * 100}%`, background: gargalo ? 'var(--c-erro)' : 'var(--c-acento)' }}
                          />
                          {e.p90 != null && <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-[var(--c-texto-3)]" style={{ left: `calc(${(e.p90 / maior) * 100}% - 1px)` }} />}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              );
            })()}
          </Widget>

          <Widget className="lg:col-span-5" titulo="O caminho das peças" icone={<Route className="h-4 w-4" />} sobre="De cada passo para o seguinte: quanto segue.">
            <ol className="flex flex-col">
              {r.funil.map((f, i) => {
                const primeiro = r.funil[0].n || 1;
                const anterior = i ? r.funil[i - 1].n : null;
                return (
                  <li key={f.rotulo}>
                    {anterior != null && (
                      <span className="my-1.5 flex items-center gap-1.5 text-[11px] text-[var(--c-texto-3)]">
                        <span className="h-3 w-px bg-[var(--c-borda-forte)]" aria-hidden />
                        {anterior ? `${pct(f.n / anterior)} seguem para o próximo passo` : '—'}
                      </span>
                    )}
                    {/* Nome e número em cima, a barra embaixo: o mesmo jeito de "Onde a peça espera" */}
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-[var(--c-texto)]">{f.rotulo}</span>
                      <span className="text-sm font-bold tabular-nums text-[var(--c-texto)]">{f.n.toLocaleString('pt-BR')}</span>
                    </div>
                    <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[var(--c-superficie-2)]" aria-hidden>
                      {/* A mesma cor, mais clara a cada passo: é uma ordem, não categorias */}
                      <span className="block h-full rounded-full bg-[var(--c-acento)]" style={{ width: `${(f.n / primeiro) * 100}%`, opacity: 1 - i * 0.15 }} />
                    </span>
                  </li>
                );
              })}
            </ol>
          </Widget>

          {/* 5. OS RANKINGS */}
          <Widget className="lg:col-span-4" titulo="Quem mais encomenda" icone={<Trophy className="h-4 w-4" />} acao={{ rotulo: 'Tabela', aoTocar: () => verTabela('vendedores') }}>
            <ListaDeBarras
              vazio="Nenhuma encomenda no período."
              itens={r.vendedores
                .filter((v) => v.encomendas > 0)
                .map((v) => ({
                  chave: v.id,
                  nome: v.nome,
                  valor: v.valor,
                  textoDoValor: brlCurto(v.valor),
                  detalhe: `${v.encomendas} encomendas · ${v.pecas} peças · conversão ${pct(v.conversao)}`,
                }))}
            />
          </Widget>

          <Widget className="lg:col-span-4" titulo="Peças que mais saem" icone={<PackagePlus className="h-4 w-4" />} acao={{ rotulo: 'Tabela', aoTocar: () => verTabela('pecas') }}>
            <ListaDeBarras
              vazio="Nenhuma encomenda no período."
              itens={r.pecas.map((p) => ({
                chave: p.codigo,
                nome: p.codigo,
                valor: p.pecas,
                textoDoValor: `${p.pecas} pç`,
                detalhe: [p.marca, `${p.encomendas} encomendas`, p.fornecedores.join(', ')].filter(Boolean).join(' · '),
                selo: p.recorrente ? (
                  <Selo tom="acento">
                    <Warehouse className="h-3 w-3" /> Estoque?
                  </Selo>
                ) : undefined,
              }))}
            />
          </Widget>

          <Widget className="lg:col-span-4" titulo="Fornecedores" icone={<Truck className="h-4 w-4" />} acao={{ rotulo: 'Tabela', aoTocar: () => verTabela('fornecedores') }}>
            <ListaDeBarras
              vazio="Nenhuma encomenda no período."
              itens={r.fornecedores.map((f) => ({
                chave: f.nome,
                nome: f.nome,
                valor: f.valor,
                textoDoValor: brlCurto(f.valor),
                detalhe: `entrega ${escreverTempo(f.entrega)} · ${f.encomendas} encomendas${f.canceladasPorCompras ? ` · ${f.canceladasPorCompras} canceladas por Compras` : ''}`,
                selo: r.gargalo?.id === 'entrega' && f.entrega != null && r.etapas.find((e) => e.id === 'entrega')?.mediana != null && f.entrega > (r.etapas.find((e) => e.id === 'entrega')!.mediana! * 1.5) ? (
                  <Selo tom="atencao">Lento</Selo>
                ) : undefined,
              }))}
            />
          </Widget>

          {/* DEVOLUÇÕES POR FORNECEDOR (Elias, 26/10/2026): quem manda peça errada ou avariada */}
          <Widget
            className="lg:col-span-12"
            titulo="Devoluções por fornecedor"
            icone={<Undo2 className="h-4 w-4" />}
            sobre="Peças que voltaram ao fornecedor (troca, devolução, cliente que desistiu), sobre as pedidas no período."
            acao={{ rotulo: 'Tabela', aoTocar: () => verTabela('fornecedores') }}
          >
            <ListaDeBarras
              vazio="Nenhuma devolução no período."
              destaque="todos"
              itens={r.fornecedores
                .filter((f) => f.devolvidas > 0)
                .sort((a, b) => (b.taxaDeDevolucao ?? 0) - (a.taxaDeDevolucao ?? 0) || b.devolvidas - a.devolvidas)
                .map((f) => ({
                  chave: f.nome,
                  nome: f.nome,
                  valor: (f.taxaDeDevolucao ?? 0) * 100,
                  textoDoValor: porcento(f.taxaDeDevolucao),
                  detalhe: `${f.devolvidas} de ${f.pedidas} pedidas · ${motivosEmTexto(f.motivosDaDevolucao)}`,
                }))}
            />
          </Widget>

          {/* 6. O QUE ESCAPA, ao lado da LINHA DO TEMPO */}
          <Widget
            className="lg:col-span-6"
            titulo="Procurada, sem encomenda"
            icone={<Search className="h-4 w-4" />}
            sobre="Demanda que não virou venda: o B2B não tinha, o comprador não achou ou o cliente desistiu."
            acao={{ rotulo: 'Tabela', aoTocar: () => verTabela('demanda') }}
          >
            <ListaDeBarras
              destaque="todos"
              vazio={filtros.fornecedor ? 'Com filtro de fornecedor, as cotações ficam de fora.' : 'Tudo o que foi procurado virou encomenda.'}
              itens={r.demanda.map((d) => ({
                chave: d.codigo,
                nome: d.codigo,
                valor: d.procuras + d.pedidaAoComprador,
                textoDoValor: `${d.procuras + d.pedidaAoComprador}×`,
                detalhe: [
                  `${d.vendedores} ${d.vendedores === 1 ? 'vendedor' : 'vendedores'}`,
                  d.semEstoqueNosB2B ? `sem estoque nos B2Bs ${d.semEstoqueNosB2B}×` : null,
                  d.pedidaAoComprador ? `pedida ao comprador ${d.pedidaAoComprador}×` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                selo: d.comprador === 'nao_encontrou' ? <Selo tom="erro">Comprador não achou</Selo> : undefined,
              }))}
            />
          </Widget>

          <Widget className="lg:col-span-6" titulo="Linha do tempo" icone={<Clock className="h-4 w-4" />} sobre="Tudo o que aconteceu no período, do mais recente." colado>
            <ol className="divide-y divide-[var(--c-borda)]">
              {r.linhaDoTempo.slice(0, eventos).map((ev, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                      ev.tipo === 'cancelada'
                        ? 'bg-[color-mix(in_srgb,var(--c-erro)_12%,transparent)] text-[var(--c-erro)]'
                        : ev.tipo === 'recebida'
                          ? 'bg-[color-mix(in_srgb,var(--c-ok)_14%,transparent)] text-[var(--c-ok)]'
                          : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)]'
                    }`}
                    aria-hidden
                  >
                    {ICONE_DO_EVENTO[ev.tipo]}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${ev.tipo === 'cancelada' ? 'text-[var(--c-erro)]' : 'text-[var(--c-texto)]'}`} title={ev.texto}>
                    {ev.texto}
                  </span>
                  <span className="flex-shrink-0 text-xs tabular-nums text-[var(--c-texto-3)]">{quando(ev.quando)}</span>
                </li>
              ))}
            </ol>
            {r.linhaDoTempo.length > eventos && (
              <button
                type="button"
                onClick={() => setEventos((n) => n + 20)}
                className="w-full rounded-b-2xl border-t border-[var(--c-borda)] py-2.5 text-xs font-semibold text-[var(--c-acento)] hover:bg-[var(--c-superficie-2)]"
              >
                Mostrar mais ({r.linhaDoTempo.length - eventos})
              </button>
            )}
          </Widget>

          {/* 7. OS DADOS EM TABELA: o par acessível de cada gráfico, ordenável */}
          <div ref={tabelas} className="scroll-mt-4 lg:col-span-12">
            <Widget titulo="Dados em tabela" icone={<Table2 className="h-4 w-4" />} sobre="Toque no título de uma coluna para ordenar. O Excel leva estas tabelas e a jornada de cada encomenda." colado>
              <div className="overflow-x-auto px-5 pb-3">
                <FiltroSegmentado<AbaDaTabela>
                  opcoes={[
                    { id: 'vendedores', rotulo: 'Vendedores', contador: r.vendedores.length },
                    { id: 'pecas', rotulo: 'Peças', contador: r.pecas.length },
                    { id: 'demanda', rotulo: 'Sem encomenda', contador: r.demanda.length },
                    { id: 'fornecedores', rotulo: 'Fornecedores', contador: r.fornecedores.length },
                    { id: 'lojas', rotulo: 'Lojas', contador: r.lojas.length },
                  ]}
                  ativo={aba}
                  aoEscolher={setAba}
                />
              </div>
              <div className="border-t border-[var(--c-borda)]">
                {aba === 'vendedores' && (
                  <Tabela
                    linhas={r.vendedores}
                    chave={(v) => v.id}
                    vazio="Nenhum vendedor no período."
                    colunas={[
                      { rotulo: 'Vendedor', valor: (v) => v.nome, ordem: (v) => v.nome },
                      { rotulo: 'Loja', valor: (v) => v.loja ?? '—', ordem: (v) => v.loja ?? '' },
                      { rotulo: 'Cotações', valor: (v) => v.cotacoes, ordem: (v) => v.cotacoes, direita: true },
                      { rotulo: 'Encom.', valor: (v) => v.encomendas, ordem: (v) => v.encomendas, direita: true },
                      { rotulo: 'Peças', valor: (v) => v.pecas, ordem: (v) => v.pecas, direita: true },
                      { rotulo: 'Valor', valor: (v) => brl(v.valor), ordem: (v) => v.valor, direita: true },
                      { rotulo: 'Conversão', valor: (v) => pct(v.conversao), ordem: (v) => v.conversao ?? -1, direita: true },
                      { rotulo: 'Cancel.', valor: (v) => v.canceladas || '—', ordem: (v) => v.canceladas, direita: true },
                      { rotulo: 'Pedidos ao comprador', valor: (v) => v.solicitacoes || '—', ordem: (v) => v.solicitacoes, direita: true },
                      { rotulo: 'Retirada', valor: (v) => escreverTempo(v.retirada), ordem: (v) => v.retirada ?? -1, direita: true },
                    ]}
                  />
                )}
                {aba === 'pecas' && (
                  <Tabela
                    linhas={r.pecas}
                    chave={(p) => p.codigo}
                    vazio="Nenhuma encomenda no período."
                    colunas={[
                      { rotulo: 'Peça', valor: (p) => p.codigo, ordem: (p) => p.codigo },
                      { rotulo: 'Marca', valor: (p) => p.marca ?? '—', ordem: (p) => p.marca ?? '' },
                      { rotulo: 'Encom.', valor: (p) => p.encomendas, ordem: (p) => p.encomendas, direita: true },
                      { rotulo: 'Peças', valor: (p) => p.pecas, ordem: (p) => p.pecas, direita: true },
                      { rotulo: 'Valor', valor: (p) => brl(p.valor), ordem: (p) => p.valor, direita: true },
                      { rotulo: 'Vendedores', valor: (p) => p.vendedores, ordem: (p) => p.vendedores, direita: true },
                      { rotulo: 'Fornecedores', valor: (p) => p.fornecedores.join(', ') },
                      { rotulo: 'Estoque?', valor: (p) => (p.recorrente ? <Selo tom="acento">Candidata</Selo> : '—') },
                    ]}
                  />
                )}
                {aba === 'demanda' && (
                  <Tabela
                    linhas={r.demanda}
                    chave={(d) => d.codigo}
                    vazio="Tudo o que foi procurado virou encomenda."
                    colunas={[
                      { rotulo: 'Peça', valor: (d) => d.codigo, ordem: (d) => d.codigo },
                      { rotulo: 'Cotações', valor: (d) => d.procuras, ordem: (d) => d.procuras, direita: true },
                      { rotulo: 'Vendedores', valor: (d) => d.vendedores, ordem: (d) => d.vendedores, direita: true },
                      { rotulo: 'Sem estoque B2B', valor: (d) => d.semEstoqueNosB2B || '—', ordem: (d) => d.semEstoqueNosB2B, direita: true },
                      { rotulo: 'Ao comprador', valor: (d) => d.pedidaAoComprador || '—', ordem: (d) => d.pedidaAoComprador, direita: true },
                      {
                        rotulo: 'Comprador',
                        valor: (d) =>
                          d.comprador === 'nao_encontrou' ? <Selo tom="erro">Não encontrou</Selo> : d.comprador === 'encontrou' ? <Selo tom="ok">Encontrou</Selo> : d.comprador === 'aberta' ? <Selo tom="acento">Aguardando</Selo> : '—',
                      },
                    ]}
                  />
                )}
                {aba === 'fornecedores' && (
                  <Tabela
                    linhas={r.fornecedores}
                    chave={(f) => f.nome}
                    vazio="Nenhuma encomenda no período."
                    colunas={[
                      { rotulo: 'Fornecedor', valor: (f) => f.nome, ordem: (f) => f.nome },
                      { rotulo: 'Encom.', valor: (f) => f.encomendas, ordem: (f) => f.encomendas, direita: true },
                      { rotulo: 'Peças', valor: (f) => f.pecas, ordem: (f) => f.pecas, direita: true },
                      { rotulo: 'Valor', valor: (f) => brl(f.valor), ordem: (f) => f.valor, direita: true },
                      ...(mostraCusto
                        ? [{ rotulo: 'Custo', valor: (f: (typeof r.fornecedores)[number]) => (f.custo == null ? '—' : brl(f.custo)), ordem: (f: (typeof r.fornecedores)[number]) => f.custo ?? -1, direita: true }]
                        : []),
                      { rotulo: 'Entrega', valor: (f) => escreverTempo(f.entrega), ordem: (f) => f.entrega ?? -1, direita: true },
                      { rotulo: 'Cancel. Compras', valor: (f) => f.canceladasPorCompras || '—', ordem: (f) => f.canceladasPorCompras, direita: true },
                      { rotulo: 'Devolvidas', valor: (f) => (f.devolvidas ? `${f.devolvidas} de ${f.pedidas}` : '—'), ordem: (f) => f.devolvidas, direita: true },
                      { rotulo: 'Taxa dev.', valor: (f) => porcento(f.taxaDeDevolucao), ordem: (f) => f.taxaDeDevolucao ?? -1, direita: true },
                      { rotulo: 'Motivos', valor: (f) => motivosEmTexto(f.motivosDaDevolucao) || '—', ordem: (f) => f.devolvidas },
                    ]}
                  />
                )}
                {aba === 'lojas' && (
                  <Tabela
                    linhas={r.lojas}
                    chave={(l) => l.loja}
                    vazio="Nada no período."
                    colunas={[
                      { rotulo: 'Loja', valor: (l) => l.loja, ordem: (l) => l.loja },
                      { rotulo: 'Cotações', valor: (l) => l.cotacoes, ordem: (l) => l.cotacoes, direita: true },
                      { rotulo: 'Encomendas', valor: (l) => l.encomendas, ordem: (l) => l.encomendas, direita: true },
                      { rotulo: 'Valor', valor: (l) => brl(l.valor), ordem: (l) => l.valor, direita: true },
                    ]}
                  />
                )}
              </div>
            </Widget>
          </div>
        </div>
      )}
    </div>
  );
};
