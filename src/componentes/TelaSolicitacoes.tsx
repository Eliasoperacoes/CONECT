/**
 * SOLICITAÇÕES DE COTAÇÃO — o painel do comprador (docs/cotador/SPEC-cotacao-humana.md).
 *
 * O trabalho da tela: responder o vendedor rápido. Lista e detalhe: no
 * computador lado a lado; no celular, a lista e, ao tocar, o formulário.
 * A resposta é a venda já com frete e margem (o comprador soma), o custo
 * opcional e o prazo — ou "não encontrei". Com a caixa marcada, vai também
 * pelo chat ao vendedor, sem o custo: o lembrete contra o esquecimento
 * (Elias, 21/10/2026). Respostas antigas: aba Histórico.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Plus, Send, Trash2, ArrowLeft } from 'lucide-react';
import { supabase } from '../servicos/supabase';
import { cotacaoHumanaPeloSupabase, lerValor, type OpcaoDoComprador, type Solicitacao } from '../servicos/cotacaoHumana';
import { EstadoVazio, classeDoBotao } from './PadraoWeb';
import { Selo, haQuanto } from './cotador/visual';

const campo =
  'h-10 w-full min-w-0 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-sm text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]';

type OpcaoDigitada = { fornecedor: string; marca: string; venda: string; custo: string; prazo: string };
const opcaoVazia = (): OpcaoDigitada => ({ fornecedor: '', marca: '', venda: '', custo: '', prazo: '' });

/** A solicitação aberta: o que o vendedor pediu, e o formulário de resposta. */
const Resposta: React.FC<{
  s: Solicitacao;
  aoResponder: (s: Solicitacao, r: { opcoes: OpcaoDoComprador[] } | { naoEncontrei: string }) => Promise<void>;
}> = ({ s, aoResponder }) => {
  const [opcoes, setOpcoes] = useState<OpcaoDigitada[]>([opcaoVazia()]);
  const [naoEncontrei, setNaoEncontrei] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const mudar = (i: number, chave: keyof OpcaoDigitada, valor: string) =>
    setOpcoes((os) => os.map((o, j) => (j === i ? { ...o, [chave]: valor } : o)));

  const enviar = async () => {
    setErro('');
    let resposta: { opcoes: OpcaoDoComprador[] } | { naoEncontrei: string };
    if (naoEncontrei !== null) {
      resposta = { naoEncontrei };
    } else {
      const lidas: OpcaoDoComprador[] = [];
      for (const o of opcoes) {
        if (!o.fornecedor.trim() && !o.venda.trim()) continue;
        const venda = lerValor(o.venda);
        const custo = o.custo.trim() ? lerValor(o.custo) : null;
        if (!o.fornecedor.trim() || venda === null) return setErro('Cada opção precisa do fornecedor e da venda.');
        if (o.custo.trim() && custo === null) return setErro('O custo, quando informado, precisa ser um valor.');
        lidas.push({ fornecedor: o.fornecedor.trim(), marca: o.marca.trim() || null, venda, custo, prazo: o.prazo.trim() || null, observacao: null });
      }
      if (!lidas.length) return setErro('Informe ao menos uma opção, ou use "Não encontrei".');
      resposta = { opcoes: lidas };
    }
    setEnviando(true);
    try {
      await aoResponder(s, resposta);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* O pedido do vendedor */}
      <div>
        <h3 className="text-xl font-extrabold tracking-tight text-[var(--c-texto)]">PEÇA {s.codigo}</h3>
        <p className="text-sm text-[var(--c-texto-2)]">
          {s.nomeDeQuemPediu} · {s.loja} · {haQuanto(s.criadaEm)}
        </p>
        {(s.veiculo || s.observacao) && (
          <dl className="mt-3 grid gap-1 rounded-xl bg-[var(--c-superficie-2)] p-3 text-sm">
            {s.veiculo && (
              <div className="flex gap-2">
                <dt className="w-24 flex-shrink-0 text-[var(--c-texto-3)]">Veículo</dt>
                <dd className="font-semibold text-[var(--c-texto)]">{s.veiculo}</dd>
              </div>
            )}
            {s.observacao && (
              <div className="flex gap-2">
                <dt className="w-24 flex-shrink-0 text-[var(--c-texto-3)]">Observação</dt>
                <dd className="text-[var(--c-texto)]">{s.observacao}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {naoEncontrei === null ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">Sua resposta</legend>
          {opcoes.map((o, i) => (
            <div key={i} className="rounded-xl border border-[var(--c-borda)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--c-texto-2)]">Opção {i + 1}</span>
                {opcoes.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Tirar a opção ${i + 1}`}
                    onClick={() => setOpcoes((os) => os.filter((_, j) => j !== i))}
                    className="rounded-lg p-1 text-[var(--c-texto-3)] hover:text-[var(--c-erro)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <label className="col-span-2 text-xs font-semibold text-[var(--c-texto-2)] lg:col-span-1">
                  Fornecedor *
                  <input className={`${campo} mt-1`} value={o.fornecedor} onChange={(e) => mudar(i, 'fornecedor', e.target.value)} />
                </label>
                <label className="col-span-2 text-xs font-semibold text-[var(--c-texto-2)] lg:col-span-1">
                  Marca
                  <input className={`${campo} mt-1`} value={o.marca} onChange={(e) => mudar(i, 'marca', e.target.value)} />
                </label>
                <label className="text-xs font-semibold text-[var(--c-texto-2)]">
                  Venda (R$) *
                  <input className={`${campo} mt-1 text-right tabular-nums`} inputMode="decimal" value={o.venda} onChange={(e) => mudar(i, 'venda', e.target.value)} />
                </label>
                <label className="text-xs font-semibold text-[var(--c-texto-2)]">
                  Custo (R$)
                  <input className={`${campo} mt-1 text-right tabular-nums`} inputMode="decimal" value={o.custo} onChange={(e) => mudar(i, 'custo', e.target.value)} />
                </label>
                <label className="col-span-2 text-xs font-semibold text-[var(--c-texto-2)] lg:col-span-1">
                  Prazo
                  <input className={`${campo} mt-1`} placeholder="Ex.: 2 dias" value={o.prazo} onChange={(e) => mudar(i, 'prazo', e.target.value)} />
                </label>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setOpcoes((os) => [...os, opcaoVazia()])} className="inline-flex items-center gap-1 self-start text-sm font-bold text-[var(--c-acento)]">
            <Plus className="h-4 w-4" /> Outra opção
          </button>
          <p className="text-xs text-[var(--c-texto-3)]">A venda já com frete e margem. O custo é opcional, e só quem vê custo o enxerga.</p>
        </fieldset>
      ) : (
        <label className="text-xs font-semibold text-[var(--c-texto-2)]">
          Por que não encontrou? (opcional)
          <input className={`${campo} mt-1`} placeholder="Ex.: nenhum fornecedor tem" value={naoEncontrei} onChange={(e) => setNaoEncontrei(e.target.value)} />
        </label>
      )}

      {erro && (
        <p role="alert" className="text-sm text-[var(--c-erro)]">
          {erro}
        </p>
      )}

      {/* A resposta sempre chega ao vendedor no chat: é o único aviso dela */}
      <p className="text-sm text-[var(--c-texto-2)]">
        A resposta vai para <b>{s.nomeDeQuemPediu ?? 'o vendedor'}</b> pelo chat <span className="text-[var(--c-texto-3)]">(sem o custo)</span>.
      </p>

      <div className="flex flex-col-reverse gap-2 border-t border-[var(--c-borda)] pt-4 sm:flex-row sm:justify-between">
        <button type="button" onClick={() => setNaoEncontrei(naoEncontrei === null ? '' : null)} className={classeDoBotao.secundario}>
          {naoEncontrei === null ? 'Não encontrei' : 'Voltar às opções'}
        </button>
        <button type="button" disabled={enviando} onClick={enviar} className={classeDoBotao.principal}>
          <Send className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Responder'}
        </button>
      </div>
    </div>
  );
};

export const TelaSolicitacoes: React.FC = () => {
  const servico = useMemo(() => (supabase ? cotacaoHumanaPeloSupabase(supabase) : null), []);
  const [lista, setLista] = useState<Solicitacao[] | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    if (!servico) return;
    try {
      setLista(await servico.listar());
    } catch (e) {
      setAviso((e as Error).message);
      setLista([]);
    }
  }, [servico]);

  // Na hora em que chega uma solicitação nova (ou outro comprador responde), a lista muda
  useEffect(() => {
    void carregar();
    return servico?.ouvir(() => void carregar());
  }, [servico, carregar]);

  if (!servico) {
    return <EstadoVazio icone={<Inbox className="h-6 w-6" />} titulo="Solicitações indisponíveis" descricao="Precisa do banco conectado." />;
  }

  const abertas = (lista ?? []).filter((s) => s.situacao === 'aberta');
  const atual = abertas.find((s) => s.id === escolhida) ?? null;
  // No computador, a mais antiga já aberta ao lado; no celular, só ao tocar
  const aoLado = atual ?? abertas[0] ?? null;

  const responder = async (s: Solicitacao, r: { opcoes: OpcaoDoComprador[] } | { naoEncontrei: string }) => {
    // O recado ao vendedor (pelo chat) é escrito pelo banco, junto com a resposta
    await servico.responder(s.id, r);
    setAviso('');
    setEscolhida(null);
    await carregar();
  };

  if (lista === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando as solicitações">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
        ))}
      </div>
    );
  }

  if (!abertas.length) {
    return (
      <>
        {aviso && <p className="mb-3 text-sm text-[var(--c-atencao)]">{aviso}</p>}
        <EstadoVazio icone={<Inbox className="h-6 w-6" />} titulo="Nenhuma solicitação aberta" descricao="Quando um vendedor pedir uma cotação, ela aparece aqui na hora. As respondidas ficam na aba Histórico." />
      </>
    );
  }

  const listaDeAbertas = (
    <ul aria-label="Solicitações abertas" className="flex flex-col gap-2">
      {abertas.map((s) => {
        const ativa = aoLado?.id === s.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setEscolhida(s.id)}
              aria-current={ativa ? 'true' : undefined}
              className={`w-full rounded-xl border border-l-4 border-l-[var(--c-acento)] bg-[var(--c-superficie)] px-3 py-2.5 text-left transition hover:border-[var(--c-acento)] ${
                ativa ? 'border-[var(--c-acento)] md:ring-1 md:ring-[var(--c-acento)]' : 'border-[var(--c-borda)]'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-[var(--c-texto)]">{s.codigo}</span>
                <span className="text-[11px] text-[var(--c-texto-3)]">{haQuanto(s.criadaEm)}</span>
              </span>
              <span className="block truncate text-xs text-[var(--c-texto-2)]">
                {s.nomeDeQuemPediu} · {s.loja}
              </span>
              {s.veiculo && <span className="block truncate text-xs text-[var(--c-texto-3)]">{s.veiculo}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <p role="status" className="rounded-xl border border-[var(--c-atencao)] p-3 text-sm text-[var(--c-texto)]">
          {aviso}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Selo tom="acento">{abertas.length} aberta{abertas.length > 1 ? 's' : ''}</Selo>
        <span className="text-xs text-[var(--c-texto-3)]">da mais antiga para a mais nova · as respondidas ficam no Histórico</span>
      </div>

      {/* Computador: lista e detalhe lado a lado */}
      <div className="hidden gap-5 md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
        {listaDeAbertas}
        {aoLado && (
          <section className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-5 shadow-[var(--s-1)]">
            <Resposta key={aoLado.id} s={aoLado} aoResponder={responder} />
          </section>
        )}
      </div>

      {/* Celular: a lista; tocar abre o formulário */}
      <div className="md:hidden">
        {atual ? (
          <section className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4">
            <button type="button" onClick={() => setEscolhida(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--c-acento)]">
              <ArrowLeft className="h-4 w-4" /> Voltar à lista
            </button>
            <Resposta key={atual.id} s={atual} aoResponder={responder} />
          </section>
        ) : (
          listaDeAbertas
        )}
      </div>

      <p className="text-xs text-[var(--c-texto-3)]">
        Respondidas nos últimos dias: {(lista ?? []).filter((s) => s.situacao !== 'aberta').length} · veja na aba Histórico.
      </p>
    </div>
  );
};
