/**
 * SEM BATER HOJE — quem ainda não bateu o ponto, para chamar antes de o
 * dia fechar.
 *
 * Era uma lista corrida, em ordem alfabética, um cartão alto por pessoa:
 * com a rede de manhã cedo, rolar até achar alguém (Elias, 03/10/2026).
 * Agora é a organização de `GruposDePessoas` — por loja ou setor,
 * recolhível, compacta, com busca —, a mesma de "Aprovar jornadas".
 *
 * Quem entra na lista não é decidido aqui: chega pronto do resumo da
 * equipe (`semBaterHoje`, de `obterResumoDoPeriodo`).
 */
import React, { useState } from 'react';
import { MessageSquare, Loader2 } from 'lucide-react';
import { chamarQuemNaoBateu } from '../servicos/chamarQuemNaoBateu';
import { Colaborador } from '../tipos';
import { FotoPresenca } from './FotoPresenca';
import { GruposDePessoas, detalheNoGrupo } from './GruposDePessoas';

const aPropriaPessoa = (p: Colaborador) => p;

export const SemBaterHoje: React.FC<{
  pessoas: Colaborador[];
  aoAbrirConversa: (colegaId: string) => void;
}> = ({ pessoas, aoAbrirConversa }) => {
  const [chamando, setChamando] = useState<string | null>(null);

  /** Manda o recado do dia (uma vez só) e abre a conversa com ele enviado */
  const chamar = async (p: Colaborador) => {
    if (chamando) return;
    setChamando(p.id);
    await chamarQuemNaoBateu(p.id);
    setChamando(null);
    aoAbrirConversa(p.id);
  };

  if (pessoas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--c-texto-3)]">Todo mundo já bateu o ponto hoje.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
        Pode ser folga, atestado ou esquecimento. Chame a pessoa antes de o dia fechar — depois vira
        dia sem fechar, e aí é decisão sua. O botão de chat já manda o recado e abre a conversa.
      </p>

      <GruposDePessoas
        itens={pessoas}
        pessoaDe={aPropriaPessoa}
        idDaBusca="busca-sem-bater"
        linha={(p, por) => (
          <div className="px-3.5 py-2 flex items-center gap-2.5">
            <FotoPresenca foto={p.foto} nome={p.nome} presenca={p.presenca} tamanho="w-8 h-8" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-[var(--c-texto)] truncate">{p.nome}</span>
              <span className="block text-[11px] text-[var(--c-texto-3)] truncate">{detalheNoGrupo(p, por)}</span>
            </span>
            <button
              type="button"
              onClick={() => chamar(p)}
              disabled={!!chamando}
              title={`Mandar o recado a ${p.nome} e abrir a conversa`}
              aria-label={`Mandar o recado a ${p.nome} e abrir a conversa`}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--c-acento)] hover:bg-[var(--c-acento)]/10 active:scale-95 transition-all flex-shrink-0"
            >
              {chamando === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            </button>
          </div>
        )}
      />
    </div>
  );
};
