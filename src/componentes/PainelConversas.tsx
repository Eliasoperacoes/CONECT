/**
 * Lista de conversas em painel flutuante — CONECTA / Malachias Autopeças
 *
 * Com a conversa abrindo por cima, a coluna fixa da esquerda perdeu sentido:
 * ocupava um terço da tela do computador para mostrar uma lista que só é
 * consultada na hora de escolher com quem falar. Aqui ela vira um painel que
 * se abre quando se precisa dela e sai da frente depois.
 *
 * No celular ocupa a tela, porque lá não há "por cima" que caiba.
 */

import React, { useState } from 'react';
import { X, Plus, MessageSquare, Users } from 'lucide-react';
import { Conversa } from '../tipos';
import { ItemConversa } from './ItemConversa';

type Secao = 'individuais' | 'grupos';

interface PropsPainelConversas {
  secaoInicial: Secao;
  conversas: Conversa[];
  grupos: Conversa[];
  conversaAbertaId: string | null;
  podeCriarGrupo: boolean;
  aoAbrir: (conversaId: string) => void;
  aoNovaConversa: () => void;
  aoNovoGrupo: () => void;
  aoFechar: () => void;
}

export const PainelConversas: React.FC<PropsPainelConversas> = ({
  secaoInicial,
  conversas,
  grupos,
  conversaAbertaId,
  podeCriarGrupo,
  aoAbrir,
  aoNovaConversa,
  aoNovoGrupo,
  aoFechar,
}) => {
  const [secao, setSecao] = useState<Secao>(secaoInicial);
  const lista = secao === 'individuais' ? conversas : grupos;

  return (
    <div
      id="painel-conversas-flutuante"
      className="fixed z-40 top-0 left-0 right-0 bottom-0 w-full h-full md:top-auto md:left-auto md:right-[452px] md:bottom-0 md:w-[340px] md:h-[520px] md:max-h-[calc(100dvh-96px)] flex flex-col bg-[var(--c-superficie)] md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--c-borda)] flex-shrink-0">
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'individuais' as const, rotulo: 'Conversas', icone: MessageSquare },
              { id: 'grupos' as const, rotulo: 'Grupos', icone: Users },
            ]
          ).map((item) => {
            const ativa = secao === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSecao(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  ativa
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                    : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]'
                }`}
              >
                <item.icone className="w-3.5 h-3.5" />
                {item.rotulo}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={aoFechar}
          className="p-1.5 rounded-lg hover:bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] transition-colors cursor-pointer"
          aria-label="Fechar lista"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {lista.length === 0 ? (
          <p className="p-6 text-center text-xs text-[var(--c-texto-3)]">
            {secao === 'individuais'
              ? 'Nenhuma conversa iniciada ainda.'
              : 'Nenhum grupo ou canal disponível.'}
          </p>
        ) : (
          <div className="divide-y divide-[var(--c-borda)]">
            {lista.map((c) => (
              <ItemConversa
                key={c.id}
                conversa={c}
                selecionada={conversaAbertaId === c.id}
                aoClicar={() => aoAbrir(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Criar grupo é do Administrador; chamar um colega é de todos */}
      {(secao === 'individuais' || podeCriarGrupo) && (
        <div className="p-2.5 border-t border-[var(--c-borda)] flex-shrink-0">
          <button
            type="button"
            onClick={secao === 'individuais' ? aoNovaConversa : aoNovoGrupo}
            className="w-full py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-110 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {secao === 'individuais' ? 'Chamar um colega' : 'Criar canal'}
          </button>
        </div>
      )}
    </div>
  );
};
