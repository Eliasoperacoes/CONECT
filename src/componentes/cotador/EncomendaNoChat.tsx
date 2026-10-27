/**
 * A ENCOMENDA NO CHAT (SPEC-pedidos-compras e SPEC-comunicacao-recebimento):
 * o cabeçalho que diz de que passo é o recado e, no de conferência, cada
 * peça com o seu "Recebi" — e depois o "Entregue ao cliente". O vendedor
 * fecha o caminho sem sair da conversa.
 *
 * O texto é o próprio recado, escrito pelo banco (texto_do_aviso). Os botões
 * leem a situação de agora de cada peça: o recado de ontem não oferece
 * "Recebi" do que já foi recebido.
 */
import React, { useEffect, useState } from 'react';
import { Check, PackageCheck } from 'lucide-react';
import { supabase } from '../../servicos/supabase';
import { avisoDaMensagem, encomendasPeloSupabase, precisaLerDeNovo, ROTULO_DA_SITUACAO, type MinhaEncomenda } from '../../servicos/encomendas';

const TITULO: Record<string, string> = {
  pedido_realizado: 'Pedido realizado',
  em_transferencia: 'Em transferência',
  em_conferencia: 'Em conferência',
  cancelada: 'Encomenda cancelada',
  problema: 'Problema',
  problema_resolvido: 'Problema resolvido',
  desistencia: 'Cliente desistiu',
  // Do vendedor para Compras
  nova_encomenda: 'Nova encomenda',
  cancelada_pelo_vendedor: 'Cancelada pelo vendedor',
  recebida: 'Recebida na loja',
  entregue: 'Entregue ao cliente',
};

/** O passo do recado: a coluna que o banco grava; nos recados antigos, pela abertura do texto. */
const avisoDe = (aviso: string | undefined, texto: string | undefined) => aviso ?? avisoDaMensagem(texto);

export const CabecalhoDaEncomenda: React.FC<{ texto?: string; aviso?: string; ehMinha: boolean }> = ({ texto, aviso, ehMinha }) => {
  const passo = avisoDe(aviso, texto);
  return (
    <span className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider ${ehMinha ? 'text-white/80' : 'text-[var(--c-acento)]'}`}>
      <PackageCheck className="h-3.5 w-3.5" /> Encomenda{passo && TITULO[passo] ? ` · ${TITULO[passo]}` : ''}
    </span>
  );
};

/**
 * As encomendas do vendedor, uma leitura para todos os recados da conversa
 * (abrir uma conversa com vinte recados não vira vinte idas ao banco). Vale
 * por 15 s, só para a mesma pessoa; o recado que chega com a conversa aberta
 * lê de novo (precisaLerDeNovo).
 */
let lidas: { eu: string; em: number; recados: Set<string>; promessa: Promise<MinhaEncomenda[]> } | null = null;
const minhas = (eu: string, recadoId: string): Promise<MinhaEncomenda[]> => {
  const agora = Date.now();
  if (precisaLerDeNovo(lidas, eu, recadoId, agora)) {
    lidas = { eu, em: agora, recados: new Set(), promessa: encomendasPeloSupabase(supabase!).minhas().catch(() => []) };
  }
  lidas!.recados.add(recadoId);
  return lidas!.promessa;
};

const botao =
  'inline-flex flex-shrink-0 items-center justify-center gap-1 rounded-lg bg-[var(--c-acento)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--c-sobre-acento)] transition-all hover:brightness-110 disabled:opacity-60';

/** Só no recado de conferência e só para o vendedor dono das peças. */
export const RecebimentoNaMensagem: React.FC<{
  ids: string[];
  aviso?: string;
  texto?: string;
  ehMinha: boolean;
  /** Quem está vendo: a leitura guardada é por pessoa */
  eu: string;
  /** O recado: o que chega com a conversa aberta lê as encomendas de novo */
  recadoId: string;
}> = ({ ids, aviso, texto, ehMinha, eu, recadoId }) => {
  const [pecas, setPecas] = useState<MinhaEncomenda[] | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');
  const ativo = !ehMinha && !!supabase && avisoDe(aviso, texto) === 'em_conferencia';
  const chave = ids.join(',');

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    void minhas(eu, recadoId).then((todas) => vivo && setPecas(todas.filter((e) => chave.split(',').includes(e.id))));
    return () => {
      vivo = false;
    };
  }, [ativo, chave, eu, recadoId]);

  // Quem não é o dono (outro comprador na conversa) não vê botão nenhum
  if (!ativo || !pecas?.length) return null;

  const agir = async (passo: (s: ReturnType<typeof encomendasPeloSupabase>) => Promise<unknown>) => {
    setGravando(true);
    setErro('');
    try {
      await passo(encomendasPeloSupabase(supabase!));
      lidas = null;
      const todas = await minhas(eu, recadoId);
      setPecas(todas.filter((e) => ids.includes(e.id)));
    } catch (e) {
      setErro((e as Error).message);
    }
    setGravando(false);
  };
  const aReceber = pecas.filter((p) => p.situacao === 'em_conferencia');

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {pecas.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--c-superficie-2)] px-2.5 py-1.5 text-xs text-[var(--c-texto)]">
          <span className="min-w-0 truncate">
            {p.quantidade}× <b className="font-bold">{p.codigo}</b> · {p.fornecedor_nome}
          </span>
          {p.situacao === 'em_conferencia' ? (
            <button type="button" disabled={gravando} className={botao} onClick={() => void agir((s) => s.confirmarRecebimento(p.id))}>
              <PackageCheck className="h-3.5 w-3.5" /> Recebi
            </button>
          ) : p.situacao === 'recebida' ? (
            <button type="button" disabled={gravando} className={botao} onClick={() => void agir((s) => s.marcarEntregue(p.id))}>
              Entregue ao cliente
            </button>
          ) : (
            <span className={`flex flex-shrink-0 items-center gap-1 font-bold ${p.situacao === 'entregue' ? 'text-[var(--c-ok)]' : 'text-[var(--c-texto-3)]'}`}>
              {p.situacao === 'entregue' && <Check className="h-3.5 w-3.5" />}
              {ROTULO_DA_SITUACAO[p.situacao]}
            </span>
          )}
        </div>
      ))}
      {aReceber.length > 1 && (
        <button
          type="button"
          disabled={gravando}
          className={`${botao} w-full py-2 text-xs`}
          onClick={() => void agir(async (s) => { for (const p of aReceber) await s.confirmarRecebimento(p.id); })}
        >
          <PackageCheck className="h-3.5 w-3.5" /> {gravando ? 'Confirmando…' : `Recebi tudo (${aReceber.length})`}
        </button>
      )}
      {erro && <span className="block text-[11px] text-[var(--c-erro)]">{erro}</span>}
    </div>
  );
};
