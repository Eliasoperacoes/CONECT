/**
 * O PAINEL DE PEDIDOS DE COMPRAS (docs/cotador/SPEC-pedidos-compras.md).
 *
 * Elias, 21/10/2026: "um painel completo para trabalhar com essas
 * informações, e não tudo numa única tela poluindo tudo". Quatro partes:
 *   1. Montar pedidos — uma coluna por fornecedor, a conta contra o pedido
 *      mínimo (verde fecha, vermelho falta) e "Pedido realizado";
 *   2. Aguardando chegada — "Chegou: em conferência", por peça;
 *   3. Em conferência — o que espera o "Recebi" do vendedor;
 *   4. Configurações — pedido mínimo de cada fornecedor e horário de corte.
 *
 * O sistema SÓ MOSTRA: a conta e as cores. Quem decide é o comprador.
 * Cada passo avisa o vendedor no chat (cartão, sem custo e sem o cliente).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, PackageCheck, Truck, UserX, X } from 'lucide-react';
import { supabase } from '../servicos/supabase';
import { ehTelaDeCelular } from '../servicos/tela';
import {
  colunasPorFornecedor,
  encomendasPeloSupabase,
  ouvirEmRajada,
  esperaCompras,
  lerPedidoMinimo,
  marcadasDaColuna,
  precoVencido,
  ROTULO_DO_PROBLEMA,
  type ColunaDoFornecedor,
  type ConfiguracaoDeCompras,
  type EncomendaDeCompras,
  type SituacaoDaEncomenda,
} from '../servicos/encomendas';
import { EstadoVazio, FiltroSegmentado, classeDoBotao } from './PadraoWeb';
import { Selo, brl, haQuanto, quandoCurto } from './cotador/visual';
import { ResolverEncomendas } from './cotador/ResolverEncomendas';

export type ParteDosPedidos = 'montar' | 'chegada' | 'transferencia' | 'conferencia' | 'config';
type Parte = ParteDosPedidos;
const SITUACAO_DA_PARTE: Record<Exclude<Parte, 'config'>, SituacaoDaEncomenda> = {
  montar: 'encomendada',
  chegada: 'pedido_realizado',
  // Filial: chegou em Pirassununga e segue para a loja; o comprador marca "Chegou na loja"
  transferencia: 'em_transferencia',
  conferencia: 'em_conferencia',
};

/** Uma encomenda na lista de Compras: quem, o quê, quanto custa e há quanto tempo. */
const LinhaDaEncomenda: React.FC<{
  e: EncomendaDeCompras;
  marcada?: boolean;
  aoMarcar?: () => void;
  aoCancelar?: (motivo: string) => Promise<void>;
  quando: string;
}> = ({ e, marcada, aoMarcar, aoCancelar, quando }) => {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        {aoMarcar && (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 flex-shrink-0 accent-[var(--c-acento)]"
            checked={!!marcada}
            onChange={aoMarcar}
            aria-label={`Incluir ${e.quantidade}× ${e.codigo} de ${e.nome_do_vendedor ?? 'vendedor'}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-extrabold text-[var(--c-texto)]">
              {e.quantidade}× {e.codigo}
            </span>
            <span className="whitespace-nowrap text-sm font-bold tabular-nums text-[var(--c-acento)]">
              {e.custo != null ? brl(e.custo * e.quantidade) : <span className="text-[var(--c-atencao)]">sem custo</span>}
            </span>
          </div>
          <span className="block truncate text-xs text-[var(--c-texto-2)]">
            {[e.marca, e.descricao].filter(Boolean).join(' · ') || '—'}
            {e.custo != null && e.quantidade > 1 && <span className="text-[var(--c-texto-3)]"> · {brl(e.custo)} cada</span>}
          </span>
          <span className="block truncate text-[11px] text-[var(--c-texto-3)]">
            {e.nome_do_vendedor ?? '—'} · {e.loja ?? '—'} · {quando}
            {e.observacao && <span className="text-[var(--c-texto-2)]"> · {e.observacao}</span>}
          </span>
          {/* O que pede atenção antes do passo: preço vencido (24 h), problema, desistência */}
          {(e.situacao === 'encomendada' && precoVencido(e)) || (e.problema && !e.problema_resolvido_em) || e.desistiu_em ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {e.situacao === 'encomendada' && precoVencido(e) && <Selo tom="atencao">Preço com mais de 24 h · confira</Selo>}
              {e.problema && !e.problema_resolvido_em && (
                <Selo tom="erro">
                  <AlertTriangle className="h-3 w-3" /> {ROTULO_DO_PROBLEMA[e.problema]}
                </Selo>
              )}
              {e.desistiu_em && (
                <Selo tom="atencao">
                  <UserX className="h-3 w-3" /> Cliente desistiu
                </Selo>
              )}
            </span>
          ) : null}
          {aoCancelar &&
            (cancelando ? (
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  aria-label="Motivo do cancelamento"
                  placeholder="Motivo (vai para o vendedor)"
                  value={motivo}
                  onChange={(ev) => setMotivo(ev.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2 text-xs text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
                />
                <button type="button" aria-label="Desistir de cancelar" className="text-[var(--c-texto-3)]" onClick={() => setCancelando(false)}>
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!motivo.trim()}
                  className="h-8 rounded-lg border border-[var(--c-erro)] px-2 text-[11px] font-bold text-[var(--c-erro)] disabled:opacity-40"
                  onClick={() => void aoCancelar(motivo.trim())}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button type="button" className="mt-1 text-[11px] font-semibold text-[var(--c-texto-3)] hover:text-[var(--c-erro)]" onClick={() => setCancelando(true)}>
                Cancelar encomenda
              </button>
            ))}
        </div>
      </div>
    </li>
  );
};

/** A COLUNA DE UM FORNECEDOR: a conta no alto, as encomendas, e o passo do rodapé. */
const ColunaDoPedido: React.FC<{
  c: ColunaDoFornecedor;
  mostraConta: boolean;
  acao: string;
  quandoDe: (e: EncomendaDeCompras) => string;
  aoConfirmar?: (ids: string[]) => Promise<void>;
  aoCancelar?: (e: EncomendaDeCompras, motivo: string) => Promise<void>;
}> =({ c, mostraConta, acao, quandoDe, aoConfirmar, aoCancelar }) => {
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(c.encomendas.map((e) => e.id)));
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Encomenda NOVA chegando na coluna já vem marcada; a desmarcada continua desmarcada
  const jaVistas = useRef<Set<string>>(new Set(c.encomendas.map((e) => e.id)));
  const idsDaColuna = c.encomendas.map((e) => e.id).join(',');
  useEffect(() => {
    const ids = idsDaColuna ? idsDaColuna.split(',') : [];
    setMarcadas((m) => marcadasDaColuna(m, jaVistas.current, ids));
    ids.forEach((id) => jaVistas.current.add(id));
  }, [idsDaColuna]);

  const cor = c.situacao === 'fecha' ? 'var(--c-ok)' : c.situacao === 'falta' ? 'var(--c-erro)' : 'var(--c-borda-forte)';
  const porcento = c.pedidoMinimo ? Math.min(100, (c.total / c.pedidoMinimo) * 100) : 0;
  const escolhidas = c.encomendas.filter((e) => marcadas.has(e.id));

  return (
    <section aria-label={`${c.nome}: ${c.encomendas.length} encomenda(s)`} className="flex flex-col overflow-hidden rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)]">
      <span className="h-1 w-full" style={{ background: cor }} aria-hidden />
      <header className="border-b border-[var(--c-borda)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-extrabold text-[var(--c-texto)]">{c.nome}</span>
          <span className="text-[11px] text-[var(--c-texto-3)]">
            {c.encomendas.length} {c.encomendas.length === 1 ? 'encomenda' : 'encomendas'}
          </span>
        </div>
        {mostraConta && (
          <>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-lg font-extrabold tabular-nums text-[var(--c-texto)]">{brl(c.total)}</span>
              {c.situacao === 'fecha' ? (
                <Selo tom="ok">
                  <CheckCircle2 className="h-3 w-3" /> Fecha o mínimo
                </Selo>
              ) : c.situacao === 'falta' ? (
                <Selo tom="erro">Faltam {brl(c.falta)}</Selo>
              ) : (
                <Selo tom="neutro">Sem pedido mínimo</Selo>
              )}
            </div>
            {c.pedidoMinimo != null && (
              <>
                <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[var(--c-borda)]" aria-hidden>
                  <span style={{ width: `${porcento}%`, background: cor }} />
                </span>
                <span className="mt-1 block text-[11px] text-[var(--c-texto-3)]">mínimo {brl(c.pedidoMinimo)} · a mais antiga {haQuanto(c.maisAntiga)}</span>
              </>
            )}
            {c.semCusto > 0 && <span className="mt-1 block text-[11px] text-[var(--c-atencao)]">{c.semCusto} sem custo informado: fora da conta</span>}
          </>
        )}
      </header>

      <ul className="flex-1 divide-y divide-[var(--c-borda)]">
        {c.encomendas.map((e) => (
          <LinhaDaEncomenda
            key={e.id}
            e={e}
            quando={quandoDe(e)}
            marcada={marcadas.has(e.id)}
            aoMarcar={
              aoConfirmar
                ? () =>
                    setMarcadas((m) => {
                      const n = new Set(m);
                      if (n.has(e.id)) n.delete(e.id);
                      else n.add(e.id);
                      return n;
                    })
                : undefined
            }
            aoCancelar={aoCancelar ? (motivo) => aoCancelar(e, motivo) : undefined}
          />
        ))}
      </ul>

      {aoConfirmar && (
        <footer className="border-t border-[var(--c-borda)] p-3">
          {confirmando ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-[var(--c-texto-2)]">
                {acao}: {escolhidas.length} de {c.encomendas.length}. Cada vendedor é avisado no chat.
              </span>
              <div className="flex gap-2">
                <button type="button" className={`${classeDoBotao.secundario} flex-1`} onClick={() => setConfirmando(false)} disabled={enviando}>
                  Voltar
                </button>
                <button
                  type="button"
                  className={`${classeDoBotao.principal} flex-1`}
                  disabled={enviando}
                  onClick={async () => {
                    setEnviando(true);
                    try {
                      await aoConfirmar(escolhidas.map((e) => e.id));
                    } finally {
                      setEnviando(false);
                      setConfirmando(false);
                    }
                  }}
                >
                  {enviando ? 'Gravando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={`${classeDoBotao.principal} w-full`} disabled={!escolhidas.length} onClick={() => setConfirmando(true)}>
              {acao} ({escolhidas.length})
            </button>
          )}
        </footer>
      )}
    </section>
  );
};

/** Configurações: o horário de corte e o pedido mínimo de cada fornecedor. */
const Configuracoes: React.FC<{ servico: ReturnType<typeof encomendasPeloSupabase> }> = ({ servico }) => {
  const [config, setConfig] = useState<ConfiguracaoDeCompras | null>(null);
  const [corte, setCorte] = useState('');
  const [minimos, setMinimos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(() => {
    servico
      .configuracao()
      .then((c) => {
        setConfig(c);
        setCorte(c.horarioCorte);
        setMinimos(Object.fromEntries(c.fornecedores.map((f) => [f.chave, f.pedido_minimo.toFixed(2).replace('.', ',')])));
      })
      .catch((e) => setAviso((e as Error).message));
  }, [servico]);
  useEffect(carregar, [carregar]);

  const gravar = async (acao: () => Promise<void>, ok: string) => {
    try {
      await acao();
      setAviso(ok);
      carregar();
    } catch (e) {
      setAviso((e as Error).message);
    }
  };

  if (!config) return <div className="h-40 animate-pulse rounded-2xl bg-[var(--c-superficie-2)]" aria-busy="true" />;
  const campo =
    'h-10 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-sm tabular-nums text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]';

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4">
        <h2 className="text-sm font-extrabold text-[var(--c-texto)]">Horário de corte</h2>
        <p className="mt-1 text-xs text-[var(--c-texto-3)]">
          Até este horário o vendedor cancela a própria encomenda. Encomenda feita depois dele cancela até o corte do dia seguinte. Vale para as próximas encomendas.
        </p>
        <div className="mt-3 flex gap-2">
          <input type="time" aria-label="Horário de corte" className={campo} value={corte} onChange={(e) => setCorte(e.target.value)} />
          <button
            type="button"
            className={classeDoBotao.principal}
            disabled={!corte || corte === config.horarioCorte}
            onClick={() => void gravar(() => servico.alterarHorarioCorte(corte), `Horário de corte: ${corte}`)}
          >
            Salvar
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)]">
        <h2 className="px-4 pt-4 text-sm font-extrabold text-[var(--c-texto)]">Pedido mínimo por fornecedor</h2>
        <p className="px-4 text-xs text-[var(--c-texto-3)]">Soma do custo das encomendas. Zero: sem mínimo (a coluna fica neutra).</p>
        <ul className="mt-2 divide-y divide-[var(--c-borda)]">
          {config.fornecedores.map((f) => {
            const valor = lerPedidoMinimo(minimos[f.chave] ?? '');
            return (
              <li key={f.chave} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm font-bold text-[var(--c-texto)]">{f.nome}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-[var(--c-texto-3)]">R$</span>
                  <input
                    aria-label={`Pedido mínimo da ${f.nome}`}
                    inputMode="decimal"
                    className={`${campo} w-28 text-right`}
                    value={minimos[f.chave] ?? ''}
                    onChange={(e) => setMinimos((m) => ({ ...m, [f.chave]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={classeDoBotao.secundario}
                    disabled={valor == null || valor === f.pedido_minimo}
                    onClick={() => void gravar(() => servico.alterarPedidoMinimo(f.chave, valor!), `Pedido mínimo da ${f.nome}: ${brl(valor!)}`)}
                  >
                    Salvar
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {aviso && (
        <p role="status" className="text-sm text-[var(--c-texto-2)] lg:col-span-2">
          {aviso}
        </p>
      )}
    </div>
  );
};

/** `parteInicial`: o Painel de Compras abre direto numa parte ("Aguardando chegada" → chegada). */
export const TelaPedidos: React.FC<{ parteInicial?: Parte }> = ({ parteInicial = 'montar' }) => {
  const servico = useMemo(() => (supabase ? encomendasPeloSupabase(supabase) : null), []);
  const [parte, setParte] = useState<Parte>(parteInicial);
  const [lista, setLista] = useState<EncomendaDeCompras[] | null>(null);
  const [contagem, setContagem] = useState<Record<Exclude<Parte, 'config'>, number>>({ montar: 0, chegada: 0, transferencia: 0, conferencia: 0 });
  const [aviso, setAviso] = useState('');
  const curto = ehTelaDeCelular();

  const carregar = useCallback(async () => {
    if (!servico) return;
    try {
      // Uma consulta só para as partes: a contagem das abas sai da mesma lista.
      // Recebida entra só pelo "Para resolver" (problema depois do Recebi).
      const todas = await servico.deCompras(['encomendada', 'pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida']);
      const de = (s: SituacaoDaEncomenda) => todas.filter((e) => e.situacao === s).length;
      setContagem({
        montar: de('encomendada'),
        chegada: de('pedido_realizado'),
        transferencia: de('em_transferencia'),
        conferencia: de('em_conferencia'),
      });
      setLista(todas);
    } catch (e) {
      setAviso((e as Error).message);
      setLista([]);
    }
  }, [servico]);

  // Encomenda nova, cancelada ou recebida: o painel se mexe sozinho
  useEffect(() => {
    void carregar();
    return servico ? ouvirEmRajada((aoMudar) => servico.ouvir(aoMudar), () => void carregar()) : undefined;
  }, [servico, carregar]);

  if (!servico) {
    return <EstadoVazio icone={<ClipboardList className="h-6 w-6" />} titulo="Pedidos indisponíveis" descricao="Precisa do banco conectado." />;
  }

  const daParte = parte === 'config' ? [] : (lista ?? []).filter((e) => e.situacao === SITUACAO_DA_PARTE[parte]);
  const colunas = colunasPorFornecedor(daParte);

  // O recado ao vendedor sai do banco junto com o passo: nada a avisar daqui
  const passo = (marcar: (ids: string[]) => Promise<unknown>) => async (ids: string[]) => {
    setAviso('');
    try {
      await marcar(ids);
    } catch (e) {
      setAviso((e as Error).message);
    }
    await carregar();
  };

  const cancelar = async (e: EncomendaDeCompras, motivo: string) => {
    setAviso('');
    try {
      await servico.cancelar(e.id, motivo);
    } catch (x) {
      setAviso((x as Error).message);
    }
    await carregar();
  };

  const vazio: Record<Exclude<Parte, 'config'>, { titulo: string; descricao: string }> = {
    montar: { titulo: 'Nenhuma encomenda esperando pedido', descricao: 'Quando um vendedor encomendar pela cotação, a peça aparece aqui, na coluna do fornecedor.' },
    chegada: { titulo: 'Nenhum pedido aguardando chegada', descricao: 'Os pedidos realizados aparecem aqui até a peça chegar do fornecedor.' },
    transferencia: { titulo: 'Nada em transferência', descricao: 'Peças de outras lojas que chegaram em Pirassununga aparecem aqui até chegarem na loja do vendedor.' },
    conferencia: { titulo: 'Nada em conferência', descricao: 'Peças que chegaram e esperam o "Recebi" do vendedor aparecem aqui.' },
  };

  return (
    <div className="flex flex-col gap-4">
      <FiltroSegmentado<Parte>
        // No celular, nomes curtos: os quatro cabem numa linha
        opcoes={[
          { id: 'montar', rotulo: curto ? 'Montar' : 'Montar pedidos', contador: contagem.montar },
          { id: 'chegada', rotulo: curto ? 'Chegada' : 'Aguardando chegada', contador: contagem.chegada },
          { id: 'transferencia', rotulo: curto ? 'Transf.' : 'Em transferência', contador: contagem.transferencia },
          { id: 'conferencia', rotulo: curto ? 'Conferência' : 'Em conferência', contador: contagem.conferencia },
          { id: 'config', rotulo: curto ? 'Ajustes' : 'Configurações' },
        ]}
        ativo={parte}
        aoEscolher={setParte}
      />

      {aviso && (
        <p role="status" className="rounded-xl border border-[var(--c-atencao)] bg-[color-mix(in_srgb,var(--c-atencao)_10%,transparent)] p-3 text-sm text-[var(--c-texto)]">
          {aviso}
        </p>
      )}

      {/* O que espera Compras decidir, em qualquer parte */}
      {parte !== 'config' && (
        <ResolverEncomendas
          lista={(lista ?? []).filter(esperaCompras)}
          aoResolverProblema={(e, r, d) => passo(() => servico.resolverProblema(e.id, r, d))([])}
          aoDestinar={(e, d) => passo(() => servico.destinarDesistencia(e.id, d))([])}
        />
      )}

      {parte === 'config' ? (
        <Configuracoes servico={servico} />
      ) : lista === null ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Carregando os pedidos">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
          ))}
        </div>
      ) : colunas.length === 0 ? (
        <EstadoVazio
          icone={parte === 'montar' ? <ClipboardList className="h-6 w-6" /> : parte === 'chegada' ? <Truck className="h-6 w-6" /> : <PackageCheck className="h-6 w-6" />}
          titulo={vazio[parte].titulo}
          descricao={vazio[parte].descricao}
        />
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {colunas.map((c) => (
            <ColunaDoPedido
              key={`${parte}-${c.chave}`}
              c={c}
              mostraConta={parte === 'montar'}
              acao={parte === 'montar' ? 'Pedido realizado' : parte === 'chegada' ? 'Chegou do fornecedor' : 'Chegou na loja'}
              quandoDe={(e) =>
                parte === 'montar'
                  ? haQuanto(e.criada_em)
                  : parte === 'chegada'
                    ? `pedido ${quandoCurto(e.pedido_em!)}`
                    : parte === 'transferencia'
                      ? `em Pirassununga ${haQuanto(e.transferencia_em!)}`
                      : `chegou ${haQuanto(e.conferencia_em!)}`
              }
              aoConfirmar={
                parte === 'montar'
                  ? passo((ids) => servico.marcarPedidoRealizado(ids))
                  : parte === 'chegada'
                    ? passo((ids) => servico.marcarEmConferencia(ids))
                    : parte === 'transferencia'
                      ? passo((ids) => servico.marcarChegouNaLoja(ids))
                      : undefined
              }
              // Chegou do fornecedor, não se cancela mais (o banco recusa)
              aoCancelar={parte === 'montar' || parte === 'chegada' ? cancelar : undefined}
            />
          ))}
        </div>
      )}

    </div>
  );
};
