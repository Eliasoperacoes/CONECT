/**
 * OS AVISOS DA COTAÇÃO HUMANA, com o CONECTA aberto em qualquer tela
 * (docs/cotador/SPEC-cotacao-humana.md):
 *   - para Compras: "Nova solicitação de cotação: peça X";
 *   - para o vendedor: "Cotação respondida: peça X".
 *
 * Com a janela à vista, um aviso na própria tela (a notificação do sistema
 * não aparece para quem está olhando — regra de `mostrarAvisoDeMensagem`);
 * fora de vista, a notificação do sistema. Com o app fechado, quem avisa o
 * vendedor é a mensagem que o comprador manda pelo chat.
 */
import React, { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { podeAtenderFila, podeCotar } from '../tipos';
import { supabase } from '../servicos/supabase';
import { cotacaoHumanaPeloSupabase } from '../servicos/cotacaoHumana';
import { mostrarAvisoDeMensagem } from '../servicos/notificacoes';
import { ehTelaDeCelular } from '../servicos/tela';

interface Aviso {
  id: number;
  titulo: string;
  corpo: string;
  /** Onde a tela abre ao tocar "Ver" (computador) */
  caminho: string;
}

/** Abre um lugar das Ferramentas pelo endereço: o App e a seção ouvem o voltar/avançar. */
const abrir = (caminho: string) => {
  if (ehTelaDeCelular()) return;
  window.history.pushState(null, '', caminho);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export function AvisosDeCotacao({ colaborador }: { colaborador: { id: string; nivel: number; setor: string } | null }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const id = colaborador?.id;
  const compras = !!colaborador && podeAtenderFila(colaborador);
  const cota = !!colaborador && podeCotar(colaborador);

  useEffect(() => {
    if (!supabase || !id || (!compras && !cota)) return;
    const servico = cotacaoHumanaPeloSupabase(supabase);
    return servico.ouvir((m) => {
      let aviso: Omit<Aviso, 'id'> | null = null;
      if (m.tipo === 'nova' && compras && m.pedidaPor !== id) {
        aviso = { titulo: 'Nova solicitação de cotação', corpo: `Peça ${m.codigo}`, caminho: '/ferramentas/cotador/solicitacoes' };
      } else if (m.tipo === 'respondida' && m.pedidaPor === id) {
        aviso = { titulo: 'Cotação respondida', corpo: `Peça ${m.codigo}`, caminho: '/ferramentas/cotador/cotar' };
      }
      if (!aviso) return;
      const completo = { ...aviso, id: Date.now() + Math.random() };
      setAvisos((a) => [...a.slice(-2), completo]);
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== completo.id)), 20_000);
      void mostrarAvisoDeMensagem({
        titulo: aviso.titulo,
        corpo: aviso.corpo,
        conversaId: 'cotacao-de-pecas',
        aoClicar: () => abrir(completo.caminho),
      });
    });
  }, [id, compras, cota]);

  if (!avisos.length) return null;
  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 flex flex-col gap-2 sm:left-auto sm:w-80 md:bottom-6">
      {avisos.map((a) => (
        <div
          key={a.id}
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-[var(--c-acento)] bg-[var(--c-superficie)] p-3 shadow-[var(--s-2)]"
        >
          <BellRing className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--c-acento)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-extrabold text-[var(--c-texto)]">{a.titulo}</span>
            <span className="block text-xs text-[var(--c-texto-2)]">{a.corpo}</span>
            {!ehTelaDeCelular() && (
              <button
                type="button"
                onClick={() => (abrir(a.caminho), setAvisos((x) => x.filter((y) => y.id !== a.id)))}
                className="mt-1 text-[11px] font-bold text-[var(--c-acento)]"
              >
                Ver
              </button>
            )}
          </span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))} className="text-[var(--c-texto-3)]">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
