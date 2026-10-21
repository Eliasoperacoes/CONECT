/**
 * ESTAÇÃO DE COTAÇÃO (docs/cotador/SPEC-estacao.md): liga o laço do PC de
 * compras e mostra um aviso discreto a quem está atendendo a fila.
 *
 * Para todo o resto (outro setor, outro PC, sem a extensão, modo local sem
 * banco) não aparece nada e não chama nada: quem decide é `criarEstacao`.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../servicos/supabase';
import {
  criarEstacao,
  extensaoPelaJanela,
  bancoPeloSupabase,
  manterAcordadoPeloNavegador,
  type SituacaoSite,
  type SituacaoDaEstacao,
} from '../servicos/estacaoCotacao';

const ROTULO: Record<SituacaoSite, string> = { ok: 'ok', deslogado: 'deslogado', fora: 'aba fechada' };
const PARADA: SituacaoDaEstacao = { ativa: false, sites: {}, precisaRecarregar: false };

export function AvisoEstacaoCotacao({ colaborador }: { colaborador: { id: string; nivel: number; setor: string } | null }) {
  const [situacao, setSituacao] = useState<SituacaoDaEstacao>(PARADA);
  const id = colaborador?.id;
  const nivel = colaborador?.nivel;
  const setor = colaborador?.setor;

  useEffect(() => {
    if (!supabase || !id || nivel == null || !setor) return;
    const estacao = criarEstacao({
      colaborador: { nivel, setor },
      extensao: extensaoPelaJanela(window),
      banco: bancoPeloSupabase(supabase),
      manterAcordado: manterAcordadoPeloNavegador,
      aoMudar: () => setSituacao(estacao.situacao()),
    });
    void estacao.iniciar();
    return () => {
      estacao.parar();
      setSituacao(PARADA);
    };
  }, [id, nivel, setor]);

  if (situacao.precisaRecarregar) {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-full px-4 py-1.5 text-xs font-bold text-center flex-shrink-0 bg-red-600 text-white"
      >
        Estação de cotação parada: a extensão foi recarregada. Toque aqui (ou aperte F5) para voltar a atender a fila.
      </button>
    );
  }
  if (!situacao.ativa) return null;
  const sites = Object.entries(situacao.sites);
  const todosOk = sites.every(([, s]) => s === 'ok');
  const resumo = todosOk
    ? `${sites.length} sites ok`
    : sites.filter(([, s]) => s !== 'ok').map(([nome, s]) => `${nome}: ${ROTULO[s]}`).join(' · ');

  return (
    <div
      role="status"
      className={`w-full px-4 py-1 text-[11px] font-semibold text-center flex-shrink-0 ${
        todosOk ? 'bg-[var(--c-canvas)] text-[var(--c-texto-suave,inherit)] opacity-70' : 'bg-amber-100 text-amber-900'
      }`}
    >
      Estação de cotação ativa · {resumo}
    </div>
  );
}
