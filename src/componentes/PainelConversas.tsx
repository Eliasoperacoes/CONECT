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

import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  MessageSquare,
  Users,
  Pin,
  PinOff,
  Trash2,
  MoreVertical,
  Eye,
} from 'lucide-react';
import { Conversa } from '../tipos';
import { ItemConversa } from './ItemConversa';
import {
  aplicarPreferencias,
  contarOcultas,
  estaFixada,
  alternarFixada,
  ocultarConversa,
  reexibirConversa,
} from '../servicos/preferenciasConversa';

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
  /** Quem está logado — as preferências de fixar e ocultar são dele. */
  colaboradorId: string;
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
  colaboradorId,
}) => {
  const [secao, setSecao] = useState<Secao>(secaoInicial);
  const [versao, setVersao] = useState(0);
  const [menuAberto, setMenuAberto] = useState<string | null>(null);

  const bruta = secao === 'individuais' ? conversas : grupos;

  const lista = useMemo(() => {
    void versao;
    return aplicarPreferencias(colaboradorId, bruta);
  }, [bruta, colaboradorId, versao]);

  const ocultas = useMemo(() => {
    void versao;
    return contarOcultas(colaboradorId, bruta);
  }, [bruta, colaboradorId, versao]);

  const recarregar = () => {
    setVersao((v) => v + 1);
    setMenuAberto(null);
  };

  return (
    <div
      id="painel-conversas-flutuante"
      className="fixed z-40 top-0 left-0 right-0 bottom-0 w-full h-full md:top-auto md:left-auto md:right-6 md:bottom-0 md:w-[340px] md:h-[520px] md:max-h-[calc(100dvh-96px)] flex flex-col bg-[var(--c-superficie)] md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden"
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
            {lista.map((c) => {
              const fixada = estaFixada(colaboradorId, c.id);

              return (
                <div key={c.id} className="relative group/item">
                  <ItemConversa
                    conversa={c}
                    selecionada={conversaAbertaId === c.id}
                    aoClicar={() => aoAbrir(c.id)}
                  />

                  {fixada && (
                    <Pin
                      className="absolute left-1 top-1 w-3 h-3 text-[var(--c-acento)] pointer-events-none"
                      aria-label="Fixada no topo"
                    />
                  )}

                  {/* O menu só aparece no hover para não competir com o
                      nome da pessoa, que é o que se lê na lista */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuAberto(menuAberto === c.id ? null : c.id);
                    }}
                    title="Opções da conversa"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--c-texto-3)] opacity-0 group-hover/item:opacity-100 focus:opacity-100 hover:bg-[var(--c-superficie-2)] transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuAberto === c.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuAberto(null)}
                      />
                      <div className="absolute right-2 top-9 z-20 w-56 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-lg overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            alternarFixada(colaboradorId, c.id);
                            recarregar();
                          }}
                          className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[var(--c-canvas)] text-[var(--c-texto)] font-semibold"
                        >
                          {fixada ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          {fixada ? 'Desafixar' : 'Fixar no topo'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            ocultarConversa(colaboradorId, c.id);
                            recarregar();
                          }}
                          className="w-full px-3 py-2.5 flex flex-col items-start gap-0.5 hover:bg-red-500/10 text-red-600 font-semibold border-t border-[var(--c-borda)]"
                        >
                          <span className="flex items-center gap-2">
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir conversa
                          </span>
                          {/* Dizer o que acontece de fato: a pessoa espera
                              que "excluir" apague, e aqui não apaga */}
                          <span className="text-[10px] font-normal text-[var(--c-texto-3)] text-left leading-tight">
                            Some da sua lista. O histórico fica no banco e volta se
                            escreverem de novo.
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversa oculta não pode virar conversa perdida: a lista diz
          quantas estão fora e devolve todas de uma vez */}
      {ocultas > 0 && (
        <button
          type="button"
          onClick={() => {
            for (const c of bruta) reexibirConversa(colaboradorId, c.id);
            recarregar();
          }}
          className="px-3 py-2 border-t border-[var(--c-borda)] text-[11px] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-canvas)] flex items-center justify-center gap-1.5 flex-shrink-0 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {ocultas} {ocultas === 1 ? 'conversa oculta' : 'conversas ocultas'} · mostrar
        </button>
      )}

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
