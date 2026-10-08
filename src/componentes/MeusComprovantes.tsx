/**
 * MEUS COMPROVANTES — os comprovantes das marcações dos últimos dias, para
 * baixar a qualquer hora (Portaria 671/2021, art. 80, III: "no mínimo, nas
 * últimas quarenta e oito horas").
 *
 * Antes só a batida de HOJE abria o comprovante, e só enquanto ninguém a
 * corrigisse. A lista vem das originais (`comprovantesRecentes`): a batida
 * de ontem, a corrigida pelo RH e a fora da jornada estão todas aqui, com o
 * documento de quando foram feitas.
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Receipt } from 'lucide-react';
import type { RegistroPonto } from '../tipos';
import { ROTULO_MARCACAO } from '../tipos';
import { comprovantesRecentes, DIAS_DOS_COMPROVANTES } from '../servicos/comprovanteDeBatida';
import { nuvem } from '../servicos/nuvem';
import { agora } from '../servicos/relogio';
import { FolhaInferior } from './FolhaInferior';

const DIA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' });
const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const MeusComprovantes: React.FC<{
  aberto: boolean;
  colaboradorId: string;
  aoEscolher: (registro: RegistroPonto) => void;
  aoFechar: () => void;
}> = ({ aberto, colaboradorId, aoEscolher, aoFechar }) => {
  const [lista, setLista] = useState<RegistroPonto[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setLista(null);
    setFalhou(false);
    const desde = new Date(agora().getTime() - DIAS_DOS_COMPROVANTES * 24 * 60 * 60 * 1000).toISOString();
    nuvem.listarMinhasOriginais(colaboradorId, desde).then((originais) => {
      if (!vivo) return;
      if (!originais) return setFalhou(true);
      setLista(comprovantesRecentes(originais, agora()));
    });
    return () => {
      vivo = false;
    };
  }, [aberto, colaboradorId]);

  // Agrupa por dia, na ordem da lista (mais novo primeiro)
  const dias: Array<{ dia: string; itens: RegistroPonto[] }> = [];
  for (const r of lista || []) {
    const dia = DIA.format(new Date(r.registradoEm || r.horario));
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(r);
    else dias.push({ dia, itens: [r] });
  }

  return (
    <FolhaInferior
      aberto={aberto}
      titulo="Meus comprovantes"
      subtitulo={`As marcações dos últimos ${DIAS_DOS_COMPROVANTES} dias`}
      aoFechar={aoFechar}
    >
      <div className="pb-4">
        {lista === null && !falhou && (
          <div className="py-10 flex justify-center text-[var(--c-texto-3)]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {falhou && (
          <p role="alert" className="px-5 py-8 text-center text-sm text-[var(--c-texto-2)]">
            Não deu para buscar os comprovantes agora. Confira a conexão e abra de novo.
          </p>
        )}
        {lista && lista.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[var(--c-texto-3)]">
            Nenhuma marcação nos últimos {DIAS_DOS_COMPROVANTES} dias.
          </p>
        )}
        {dias.map(({ dia, itens }) => (
          <section key={dia}>
            <h3 className="px-5 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">{dia}</h3>
            <ul className="divide-y divide-[var(--c-borda)] border-y border-[var(--c-borda)] bg-[var(--c-superficie)]">
              {itens.map((r) => (
                <li key={r.nsr}>
                  <button
                    type="button"
                    id={`comprovante-nsr-${r.nsr}`}
                    onClick={() => aoEscolher(r)}
                    className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors"
                  >
                    <span
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        r.foraDaJornada ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      <Receipt className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--c-texto)] truncate">
                        {r.foraDaJornada ? 'Marcação fora da jornada' : ROTULO_MARCACAO[r.tipo]}
                      </span>
                      <span className="block text-xs text-[var(--c-texto-3)] tabular-nums">
                        NSR {String(r.nsr).padStart(9, '0')} · Loja {r.loja}
                      </span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-[var(--c-texto)]">
                      {HORA.format(new Date(r.registradoEm || r.horario))}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </FolhaInferior>
  );
};
