/**
 * AS ENCOMENDAS DO VENDEDOR (SPEC-pedidos-compras e SPEC-comunicacao-recebimento).
 *
 * O trabalho da tela: saber em que pé está cada peça encomendada, sem
 * perguntar a ninguém, e levar cada uma até o cliente. Em andamento no alto
 * (até "Entregue ao cliente"); as terminadas dos últimos 30 dias embaixo.
 * Cancelar só até o corte; depois do pedido, "Problema" e "Cliente desistiu"
 * avisam Compras. O Gerente vê também as peças da loja que esperam o
 * vendedor, e age por ele depois de 1 dia.
 * O custo vem nulo do banco para quem não vê custo.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PackageCheck, ShoppingCart, UserX } from 'lucide-react';
import { supabase } from '../servicos/supabase';
import {
  EM_ANDAMENTO,
  encomendasPeloSupabase,
  podeCancelar,
  ROTULO_DA_SITUACAO,
  ROTULO_DO_PROBLEMA,
  type EncomendaDaLoja,
  type MinhaEncomenda,
  type ProblemaDaEncomenda,
  type SituacaoDaEncomenda,
} from '../servicos/encomendas';
import { EstadoVazio, classeDoBotao } from './PadraoWeb';
import { Selo, brl, quandoCurto, type Tom } from './cotador/visual';

const TOM: Record<SituacaoDaEncomenda, Tom> = {
  encomendada: 'neutro',
  pedido_realizado: 'acento',
  em_transferencia: 'acento',
  em_conferencia: 'atencao',
  // Recebida ainda pede o "Entregue ao cliente"
  recebida: 'atencao',
  entregue: 'ok',
  cancelada: 'erro',
};

/** Depois do pedido e antes da entrega: dá para apontar problema e desistência */
const DEPOIS_DO_PEDIDO: SituacaoDaEncomenda[] = ['pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida'];

/** "15:59" se é hoje; "22/10 15:59" se o corte é de outro dia (encomenda feita depois do corte). */
const horaDe = (iso: string) => {
  const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return dia(new Date(iso)) === dia(new Date()) ? hora : quandoCurto(iso);
};

/** O passo em que a encomenda está, em uma frase. */
const andamentoDa = (e: MinhaEncomenda): string => {
  if (e.situacao === 'encomendada') return `Encomendada ${quandoCurto(e.criada_em)} · aguardando Compras fechar o pedido`;
  if (e.situacao === 'pedido_realizado') return `Pedido feito ${quandoCurto(e.pedido_em!)} · aguardando a peça chegar`;
  if (e.situacao === 'em_transferencia') return `Chegou ${quandoCurto(e.transferencia_em!)} na matriz · em transferência para a sua loja`;
  if (e.situacao === 'em_conferencia') return `Chegou ${quandoCurto(e.conferencia_em!)} · em conferência no estoque`;
  if (e.situacao === 'recebida') return `Recebida ${quandoCurto(e.recebida_em!)} · falta entregar ao cliente`;
  if (e.situacao === 'entregue') return `Entregue ao cliente ${quandoCurto(e.entregue_em!)}`;
  return `Cancelada ${quandoCurto(e.cancelada_em!)}${e.motivo_cancelamento ? ` · ${e.motivo_cancelamento}` : ''}`;
};

/** "Problema": o tipo e, se for outro, o que aconteceu. Vai para Compras no chat. */
const FormularioDoProblema: React.FC<{ aoEnviar: (tipo: ProblemaDaEncomenda, detalhe: string) => void; aoCancelar: () => void; enviando: boolean }> = ({
  aoEnviar,
  aoCancelar,
  enviando,
}) => {
  const [tipo, setTipo] = useState<ProblemaDaEncomenda>('errada');
  const [detalhe, setDetalhe] = useState('');
  const falta = tipo === 'outro' && !detalhe.trim();
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-[var(--c-atencao)] p-3 md:w-80">
      <label className="text-xs font-semibold text-[var(--c-texto-2)]">
        O que aconteceu
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as ProblemaDaEncomenda)}
          className="mt-1 h-9 w-full rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2 text-sm text-[var(--c-texto)]"
        >
          {(Object.keys(ROTULO_DO_PROBLEMA) as ProblemaDaEncomenda[]).map((p) => (
            <option key={p} value={p}>
              {ROTULO_DO_PROBLEMA[p]}
            </option>
          ))}
        </select>
      </label>
      <input
        value={detalhe}
        onChange={(e) => setDetalhe(e.target.value)}
        maxLength={160}
        placeholder={tipo === 'outro' ? 'Descreva o problema' : 'Detalhe (opcional)'}
        aria-label="Detalhe do problema"
        className="h-9 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2 text-sm text-[var(--c-texto)]"
      />
      <div className="flex gap-2">
        <button type="button" className={`${classeDoBotao.secundario} flex-1`} onClick={aoCancelar}>
          Voltar
        </button>
        <button type="button" disabled={enviando || falta} className={`${classeDoBotao.principal} flex-1`} onClick={() => aoEnviar(tipo, detalhe)}>
          Avisar Compras
        </button>
      </div>
    </div>
  );
};

/** O Gerente: as peças da loja que esperam o vendedor; passado 1 dia, ele age. */
const DaLoja: React.FC<{ lista: EncomendaDaLoja[]; mexendo: string | null; agir: (id: string, acao: () => Promise<unknown>) => void; servico: ReturnType<typeof encomendasPeloSupabase> }> = ({
  lista,
  mexendo,
  agir,
  servico,
}) => (
  <section aria-labelledby="encomendas-loja" className="overflow-hidden rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)]">
    <h2 id="encomendas-loja" className="border-b border-[var(--c-borda)] bg-[var(--c-superficie-2)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">
      Da loja, esperando o vendedor ({lista.length})
    </h2>
    <ul>
      {lista.map((e) => {
        const desde = e.situacao === 'em_conferencia' ? e.conferencia_em : e.recebida_em;
        return (
          <li key={e.id} className="flex flex-col gap-2 border-b border-[var(--c-borda)] px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
            <div className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-[var(--c-texto)]">
                {e.quantidade}× {e.codigo}
                <Selo tom={TOM[e.situacao]}>{ROTULO_DA_SITUACAO[e.situacao]}</Selo>
              </span>
              <span className="block truncate text-xs text-[var(--c-texto-2)]">
                {[e.nome_do_vendedor, e.marca, e.fornecedor_nome].filter(Boolean).join(' · ')}
              </span>
              {e.observacao && <span className="block truncate text-xs font-semibold text-[var(--c-texto)]">Cliente: {e.observacao}</span>}
              <span className="block text-[11px] text-[var(--c-texto-3)]">
                {desde ? `desde ${quandoCurto(desde)}` : ''}
                {!e.pode_agir && ' · você pode agir depois de 1 dia'}
              </span>
            </div>
            {e.pode_agir && (
              <button
                type="button"
                disabled={mexendo === e.id}
                className={classeDoBotao.secundario}
                onClick={() => agir(e.id, () => (e.situacao === 'em_conferencia' ? servico.confirmarRecebimento(e.id) : servico.marcarEntregue(e.id)))}
              >
                {e.situacao === 'em_conferencia' ? 'Recebi pelo vendedor' : 'Entregue pelo vendedor'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  </section>
);

export const TelaEncomendas: React.FC<{ ehGerente?: boolean }> = ({ ehGerente = false }) => {
  const servico = useMemo(() => (supabase ? encomendasPeloSupabase(supabase) : null), []);
  const [lista, setLista] = useState<MinhaEncomenda[] | null>(null);
  const [daLoja, setDaLoja] = useState<EncomendaDaLoja[]>([]);
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState<{ id: string; o: 'cancelar' | 'desistiu' | 'problema' } | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);

  const carregar = useCallback(() => {
    servico
      ?.minhas()
      .then((l) => (setLista(l), setErro('')))
      .catch((e) => (setErro((e as Error).message), setLista([])));
    if (ehGerente) servico?.daLoja().then(setDaLoja).catch(() => setDaLoja([]));
  }, [servico, ehGerente]);

  useEffect(() => {
    carregar();
    // O passo muda do lado de Compras: confere de novo a cada minuto com a aba aberta
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
  }, [carregar]);

  if (!servico) {
    return <EstadoVazio icone={<ShoppingCart className="h-6 w-6" />} titulo="Encomendas indisponíveis" descricao="Precisa do banco conectado." />;
  }

  const agir = async (id: string, acao: () => Promise<unknown>) => {
    setMexendo(id);
    setErro('');
    try {
      await acao();
      setConfirmando(null);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setMexendo(null);
    }
  };

  const andamento = (lista ?? []).filter((e) => EM_ANDAMENTO.includes(e.situacao));
  const terminadas = (lista ?? []).filter((e) => !andamento.includes(e));
  // Da loja, só as dos outros vendedores: as minhas já estão na minha lista
  const meus = new Set((lista ?? []).map((e) => e.id));
  const daLojaDeOutros = daLoja.filter((e) => !meus.has(e.id));

  const cartao = (e: MinhaEncomenda) => {
    const pode = (o: 'cancelar' | 'desistiu' | 'problema') => confirmando?.id === e.id && confirmando.o === o;
    const problemaAberto = e.problema && !e.problema_resolvido_em;
    return (
      <li key={e.id} className="flex flex-col gap-2 border-b border-[var(--c-borda)] px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-extrabold text-[var(--c-texto)]">
              {e.quantidade}× {e.codigo}
            </span>
            <Selo tom={TOM[e.situacao]}>{ROTULO_DA_SITUACAO[e.situacao]}</Selo>
            {e.codigo !== e.codigo_cotado && <Selo tom="neutro">similar de {e.codigo_cotado}</Selo>}
            {problemaAberto && (
              <Selo tom="erro">
                <AlertTriangle className="h-3 w-3" /> {ROTULO_DO_PROBLEMA[e.problema!]}
              </Selo>
            )}
            {e.desistiu_em && e.situacao !== 'cancelada' && (
              <Selo tom="atencao">
                <UserX className="h-3 w-3" /> Cliente desistiu · Compras decide
              </Selo>
            )}
          </div>
          <span className="block truncate text-xs text-[var(--c-texto-2)]">
            {[e.marca, e.fornecedor_nome, e.venda != null ? `${brl(e.venda)} cada` : null, e.prazo].filter(Boolean).join(' · ')}
            {e.custo != null && <span className="font-semibold text-[var(--c-acento)]"> · custo {brl(e.custo)}</span>}
          </span>
          {e.observacao && <span className="block truncate text-xs font-semibold text-[var(--c-texto)]">Cliente: {e.observacao}</span>}
          <span className="block text-[11px] text-[var(--c-texto-3)]">{andamentoDa(e)}</span>
          {e.problema && e.problema_resolvido_em && (
            <span className="block text-[11px] text-[var(--c-ok)]">
              {ROTULO_DO_PROBLEMA[e.problema]} resolvido: {e.problema_resolucao}
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {pode('problema') ? (
            <FormularioDoProblema
              enviando={mexendo === e.id}
              aoCancelar={() => setConfirmando(null)}
              aoEnviar={(tipo, detalhe) => void agir(e.id, () => servico.marcarProblema(e.id, tipo, detalhe))}
            />
          ) : pode('desistiu') || pode('cancelar') ? (
            <>
              <button type="button" className={classeDoBotao.secundario} onClick={() => setConfirmando(null)}>
                Voltar
              </button>
              <button
                type="button"
                disabled={mexendo === e.id}
                className={`${classeDoBotao.secundario} border-[var(--c-erro)] text-[var(--c-erro)]`}
                onClick={() => void agir(e.id, () => (pode('cancelar') ? servico.cancelar(e.id) : servico.clienteDesistiu(e.id)))}
              >
                {pode('cancelar') ? 'Cancelar mesmo' : 'Sim, o cliente desistiu'}
              </button>
            </>
          ) : (
            <>
              {e.situacao === 'em_conferencia' && (
                <button type="button" disabled={mexendo === e.id} className={classeDoBotao.principal} onClick={() => void agir(e.id, () => servico.confirmarRecebimento(e.id))}>
                  <PackageCheck className="h-4 w-4" /> Recebi
                </button>
              )}
              {e.situacao === 'recebida' && (
                <button type="button" disabled={mexendo === e.id} className={classeDoBotao.principal} onClick={() => void agir(e.id, () => servico.marcarEntregue(e.id))}>
                  Entregue ao cliente
                </button>
              )}
              {podeCancelar(e) && (
                <button type="button" className={classeDoBotao.secundario} onClick={() => setConfirmando({ id: e.id, o: 'cancelar' })} title={`Dá para cancelar até ${horaDe(e.cancelavel_ate)}`}>
                  Cancelar <span className="font-normal text-[var(--c-texto-3)]">até {horaDe(e.cancelavel_ate)}</span>
                </button>
              )}
              {DEPOIS_DO_PEDIDO.includes(e.situacao) && !problemaAberto && (
                <button type="button" className={classeDoBotao.secundario} onClick={() => setConfirmando({ id: e.id, o: 'problema' })}>
                  Problema
                </button>
              )}
              {EM_ANDAMENTO.includes(e.situacao) && !podeCancelar(e) && !e.desistiu_em && (
                <button type="button" className={classeDoBotao.secundario} onClick={() => setConfirmando({ id: e.id, o: 'desistiu' })}>
                  Cliente desistiu
                </button>
              )}
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <p role="alert" className="rounded-xl border border-[var(--c-erro)] p-3 text-sm text-[var(--c-erro)]">
          {erro}
        </p>
      )}

      {lista === null && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando as encomendas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
          ))}
        </div>
      )}

      {lista && lista.length === 0 && !erro && daLojaDeOutros.length === 0 && (
        <EstadoVazio
          icone={<ShoppingCart className="h-6 w-6" />}
          titulo="Nenhuma encomenda"
          descricao='Na aba Cotar, toque em "Encomendar" no fornecedor escolhido. A encomenda aparece aqui até a peça chegar ao cliente.'
        />
      )}

      {andamento.length > 0 && (
        <section aria-labelledby="encomendas-andamento" className="overflow-hidden rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-1)]">
          <h2 id="encomendas-andamento" className="border-b border-[var(--c-borda)] bg-[var(--c-superficie-2)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">
            Em andamento ({andamento.length})
          </h2>
          <ul>{andamento.map(cartao)}</ul>
        </section>
      )}

      {ehGerente && daLojaDeOutros.length > 0 && <DaLoja lista={daLojaDeOutros} mexendo={mexendo} agir={(id, a) => void agir(id, a)} servico={servico} />}

      {terminadas.length > 0 && (
        <section aria-labelledby="encomendas-terminadas" className="overflow-hidden rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)]">
          <h2 id="encomendas-terminadas" className="border-b border-[var(--c-borda)] bg-[var(--c-superficie-2)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">
            Últimos 30 dias
          </h2>
          <ul>{terminadas.map(cartao)}</ul>
        </section>
      )}
    </div>
  );
};
