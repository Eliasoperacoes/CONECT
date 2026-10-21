/**
 * SOLICITAÇÕES DE COTAÇÃO — o painel do comprador (docs/cotador/SPEC-cotacao-humana.md).
 *
 * O vendedor pediu uma peça que o B2B não tem (ou o cliente não quis o
 * similar). O comprador cota por fora e responde: fornecedor, venda (já com
 * frete e margem), custo opcional e prazo — ou "não encontrei". Com a
 * opção marcada, a resposta vai também pelo chat ao vendedor, sem o custo:
 * é o lembrete contra o esquecimento (Elias, 21/10/2026).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Plus, Send, Trash2, X } from 'lucide-react';
import { supabase } from '../servicos/supabase';
import { bancoDados } from '../servicos/bancoDados';
import {
  cotacaoHumanaPeloSupabase,
  lerValor,
  mensagemParaOChat,
  type OpcaoDoComprador,
  type Solicitacao,
} from '../servicos/cotacaoHumana';
import { CabecalhoDeSecao, EstadoVazio, classeDoBotao } from './PadraoWeb';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const campo =
  'h-9 min-w-0 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2.5 text-xs text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]';

const haQuanto = (iso: string): string => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
};

type OpcaoDigitada = { fornecedor: string; marca: string; venda: string; custo: string; prazo: string };
const opcaoVazia = (): OpcaoDigitada => ({ fornecedor: '', marca: '', venda: '', custo: '', prazo: '' });

/** Uma solicitação aberta: o que o vendedor pediu e o formulário de resposta. */
const SolicitacaoAberta: React.FC<{
  s: Solicitacao;
  aoResponder: (s: Solicitacao, r: { opcoes: OpcaoDoComprador[] } | { naoEncontrei: string }, pelChat: boolean) => Promise<void>;
}> = ({ s, aoResponder }) => {
  const [opcoes, setOpcoes] = useState<OpcaoDigitada[]>([opcaoVazia()]);
  const [naoEncontrei, setNaoEncontrei] = useState<string | null>(null);
  const [pelChat, setPeloChat] = useState(true);
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
      if (!lidas.length) return setErro('Informe ao menos uma opção, ou marque "Não encontrei".');
      resposta = { opcoes: lidas };
    }
    setEnviando(true);
    try {
      await aoResponder(s, resposta, pelChat);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="rounded-2xl border border-l-4 border-[var(--c-borda)] border-l-[var(--c-atencao)] bg-[var(--c-superficie)] p-3 shadow-[var(--s-1)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-extrabold text-[var(--c-texto)]">PEÇA {s.codigo}</span>
        <span className="text-[11px] text-[var(--c-texto-3)]">
          {s.nomeDeQuemPediu} · {s.loja} · {haQuanto(s.criadaEm)}
        </span>
      </div>
      {s.veiculo && <p className="mt-1 text-xs text-[var(--c-texto-2)]">Veículo: <b>{s.veiculo}</b></p>}
      {s.observacao && <p className="mt-0.5 text-xs text-[var(--c-texto-2)]">Obs.: {s.observacao}</p>}

      {naoEncontrei === null ? (
        <div className="mt-3 flex flex-col gap-2">
          {opcoes.map((o, i) => (
            <div key={i} className="grid grid-cols-2 gap-1.5 sm:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_1fr_auto]">
              <input className={campo} placeholder="Fornecedor" value={o.fornecedor} onChange={(e) => mudar(i, 'fornecedor', e.target.value)} />
              <input className={campo} placeholder="Marca" value={o.marca} onChange={(e) => mudar(i, 'marca', e.target.value)} />
              <input className={campo} placeholder="Venda R$" inputMode="decimal" value={o.venda} onChange={(e) => mudar(i, 'venda', e.target.value)} />
              <input className={campo} placeholder="Custo (opc.)" inputMode="decimal" value={o.custo} onChange={(e) => mudar(i, 'custo', e.target.value)} />
              <input className={campo} placeholder="Prazo" value={o.prazo} onChange={(e) => mudar(i, 'prazo', e.target.value)} />
              {opcoes.length > 1 && (
                <button type="button" aria-label="Tirar esta opção" onClick={() => setOpcoes((os) => os.filter((_, j) => j !== i))} className="text-[var(--c-texto-3)] hover:text-[var(--c-erro)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setOpcoes((os) => [...os, opcaoVazia()])} className="self-start text-[11px] font-bold text-[var(--c-acento)]">
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            mais uma opção
          </button>
        </div>
      ) : (
        <input
          className={`${campo} mt-3 w-full`}
          placeholder="Motivo (opcional): ex. nenhum fornecedor tem"
          value={naoEncontrei}
          onChange={(e) => setNaoEncontrei(e.target.value)}
        />
      )}

      {erro && <p className="mt-2 text-[11px] text-[var(--c-erro)]">{erro}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--c-texto-2)]">
          <input type="checkbox" checked={pelChat} onChange={(e) => setPeloChat(e.target.checked)} />
          Mandar a resposta para {s.nomeDeQuemPediu ?? 'o vendedor'} pelo chat (sem o custo)
        </label>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setNaoEncontrei(naoEncontrei === null ? '' : null)}
            className={`${classeDoBotao.secundario} h-9`}
          >
            {naoEncontrei === null ? (
              'Não encontrei'
            ) : (
              <>
                <X className="h-4 w-4" /> Voltar às opções
              </>
            )}
          </button>
          <button type="button" disabled={enviando} onClick={enviar} className={`${classeDoBotao.principal} h-9`}>
            <Send className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Responder'}
          </button>
        </span>
      </div>
    </section>
  );
};

export const TelaSolicitacoes: React.FC = () => {
  const servico = useMemo(() => (supabase ? cotacaoHumanaPeloSupabase(supabase) : null), []);
  const [lista, setLista] = useState<Solicitacao[]>([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!servico) return;
    try {
      setLista(await servico.listar());
      setErro('');
    } catch (e) {
      setErro((e as Error).message);
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

  const abertas = lista.filter((s) => s.situacao === 'aberta');
  const respondidas = lista.filter((s) => s.situacao !== 'aberta').reverse();

  const responder = async (s: Solicitacao, r: { opcoes: OpcaoDoComprador[] } | { naoEncontrei: string }, pelChat: boolean) => {
    await servico.responder(s.id, r);
    // O lembrete contra o esquecimento: a resposta pelo chat, sem o custo
    if (pelChat && s.pedidaPor) {
      const situacao = 'naoEncontrei' in r ? ('nao_encontrada' as const) : ('respondida' as const);
      const texto = mensagemParaOChat(
        { codigo: s.codigo, veiculo: s.veiculo, situacao, motivo: 'naoEncontrei' in r ? r.naoEncontrei : null },
        'opcoes' in r ? r.opcoes : []
      );
      try {
        const conversa = bancoDados.obterOuCriarConversaIndividual(s.pedidaPor);
        await bancoDados.enviarMensagem(conversa.id, { tipo: 'texto', texto });
      } catch {
        setErro('Respondido, mas a mensagem do chat não foi. O vendedor vê a resposta na cotação.');
      }
    }
    await carregar();
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3">
      <CabecalhoDeSecao
        rotulo="Cotação de peças"
        titulo={`Solicitações${abertas.length ? ` (${abertas.length})` : ''}`}
        descricao="Peças que o vendedor pediu para cotar fora do B2B. Responda com a venda já com frete e margem; o custo é opcional e só quem vê custo enxerga."
      />
      {erro && <p className="rounded-xl bg-[var(--c-superficie-2)] p-3 text-xs text-[var(--c-erro)]">{erro}</p>}

      {abertas.length === 0 && (
        <EstadoVazio icone={<Inbox className="h-6 w-6" />} titulo="Nenhuma solicitação aberta" descricao="Quando um vendedor pedir uma cotação, ela aparece aqui na hora." />
      )}
      {abertas.map((s) => (
        <SolicitacaoAberta key={s.id} s={s} aoResponder={responder} />
      ))}

      {respondidas.length > 0 && (
        <div className="mt-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">Respondidas nos últimos 7 dias</span>
          {respondidas.map((s) => (
            <div key={s.id} className="mt-1.5 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 py-2 text-xs">
              <b className="text-[var(--c-texto)]">{s.codigo}</b>
              <span className="text-[var(--c-texto-3)]"> · {s.nomeDeQuemPediu} · {s.nomeDeQuemRespondeu} {s.respondidaEm ? haQuanto(s.respondidaEm) : ''}</span>
              <span className="ml-1 text-[var(--c-texto-2)]">
                {s.situacao === 'nao_encontrada'
                  ? `— não encontrada${s.motivo ? `: ${s.motivo}` : ''}`
                  : `— ${s.opcoes.map((o) => `${o.fornecedor} ${brl(o.venda)}`).join(' · ')}`}
              </span>
              {s.vistaEm && <span className="ml-1 text-[var(--c-ok)]">· visto</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
