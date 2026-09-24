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
  Eye,
  CheckSquare,
  Archive,
  Trash2,
} from 'lucide-react';
import { Conversa } from '../tipos';
import { ItemConversa } from './ItemConversa';
import {
  aplicarPreferencias,
  contarArquivadas,
  reexibirArquivadas,
  ocultarConversa,
  removerConversaDaLista,
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
  const [selecionando, setSelecionando] = useState(false);
  const [versao, setVersao] = useState(0);
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  /**
   * As conversas marcadas para uma ação em conjunto.
   *
   * Limpar a aba uma a uma, com três toques cada, é o que fez o Elias pedir
   * isto: quem volta de férias tem vinte conversas para tirar da frente.
   */
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const modoSelecao = marcadas.length > 0 || selecionando;

  const bruta = secao === 'individuais' ? conversas : grupos;

  const lista = useMemo(() => {
    void versao;
    return aplicarPreferencias(colaboradorId, bruta);
  }, [bruta, colaboradorId, versao]);

  const arquivadas = useMemo(() => {
    void versao;
    return contarArquivadas(colaboradorId, bruta);
  }, [bruta, colaboradorId, versao]);

  const recarregar = () => {
    setVersao((v) => v + 1);
    setMenuAberto(null);
  };

  const sairDaSelecao = () => {
    setMarcadas([]);
    setSelecionando(false);
  };

  const alternarMarcada = (id: string) =>
    setMarcadas((atuais) =>
      atuais.includes(id) ? atuais.filter((i) => i !== id) : [...atuais, id]
    );

  /**
   * Aplica a mesma ação a todas as marcadas e sai do modo.
   *
   * As duas ações passam pelas MESMAS funções do menu de uma conversa só.
   * Repetir a regra aqui faria arquivar em lote divergir de arquivar uma —
   * e divergência assim só aparece quando alguém reclama.
   */
  const aplicarNasMarcadas = (
    acao: (colaboradorId: string, conversaId: string) => void
  ) => {
    for (const id of marcadas) acao(colaboradorId, id);
    sairDaSelecao();
    recarregar();
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

        <div className="flex items-center gap-0.5">
          {lista.length > 0 && (
            <button
              type="button"
              onClick={() => (modoSelecao ? sairDaSelecao() : setSelecionando(true))}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                modoSelecao
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                  : 'hover:bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)]'
              }`}
              title={modoSelecao ? 'Cancelar seleção' : 'Selecionar várias conversas'}
              aria-label={modoSelecao ? 'Cancelar seleção' : 'Selecionar conversas'}
            >
              <CheckSquare className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-lg hover:bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] transition-colors cursor-pointer"
            aria-label="Fechar lista"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
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
              /* O menu de fixar e excluir mora no próprio item, e não aqui:
                 há duas listas — esta e a da barra do celular — e quando as
                 ações viviam só nesta, o celular ficava sem elas. */
              <ItemConversa
                key={c.id}
                conversa={c}
                selecionada={conversaAbertaId === c.id}
                aoClicar={() => aoAbrir(c.id)}
                colaboradorId={colaboradorId}
                aoMudarPreferencia={recarregar}
                modoSelecao={modoSelecao}
                marcada={marcadas.includes(c.id)}
                aoAlternarMarcada={() => alternarMarcada(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/*
        A BARRA DA SELEÇÃO.

        Fica acima do resto e substitui o rodapé enquanto está ligada: duas
        barras empilhadas disputando o mesmo canto é onde a pessoa erra o
        botão.

        As duas ações são as MESMAS do menu de uma conversa só, e chamam as
        mesmas funções. Arquivar em lote que divergisse de arquivar uma só
        seria descoberto por reclamação, não por teste.
      */}
      {modoSelecao && (
        <div className="border-t border-[var(--c-borda)] bg-[var(--c-superficie-2)] flex-shrink-0">
          <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--c-texto-2)]">
            {marcadas.length === 0
              ? 'Toque nas conversas para marcar'
              : `${marcadas.length} ${marcadas.length === 1 ? 'marcada' : 'marcadas'}`}
          </div>
          <div className="flex items-stretch border-t border-[var(--c-borda)]">
            <button
              type="button"
              disabled={marcadas.length === 0}
              onClick={() => aplicarNasMarcadas(ocultarConversa)}
              className="flex-1 px-2 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-superficie)] disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
              title="Saem da lista e voltam na próxima mensagem"
            >
              <Archive className="w-3.5 h-3.5" />
              Arquivar
            </button>
            <button
              type="button"
              disabled={marcadas.length === 0}
              onClick={() => aplicarNasMarcadas(removerConversaDaLista)}
              className="flex-1 px-2 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 border-l border-[var(--c-borda)] hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
              title="Saem da aba e só voltam quando você chamar o colega"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
            <button
              type="button"
              onClick={sairDaSelecao}
              className="px-3 py-2.5 flex items-center justify-center text-xs font-semibold text-[var(--c-texto-3)] border-l border-[var(--c-borda)] hover:bg-[var(--c-superficie)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/*
        Conversa arquivada não pode virar conversa perdida: a lista diz
        quantas estão fora e devolve todas de uma vez.

        AS EXCLUÍDAS NÃO ENTRAM AQUI. Se entrassem, este botão desfaria toda
        exclusão de uma vez e a diferença entre arquivar e excluir deixaria
        de existir na prática — um botão genérico vencendo a escolha da
        pessoa. Excluída só volta chamando o colega de novo.
      */}
      {arquivadas > 0 && (
        <button
          type="button"
          onClick={() => {
            reexibirArquivadas(colaboradorId, bruta);
            recarregar();
          }}
          className="px-3 py-2 border-t border-[var(--c-borda)] text-[11px] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-canvas)] flex items-center justify-center gap-1.5 flex-shrink-0 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {arquivadas} {arquivadas === 1 ? 'arquivada' : 'arquivadas'} · mostrar
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
            {secao === 'individuais' ? 'Nova conversa' : 'Criar canal'}
          </button>
        </div>
      )}
    </div>
  );
};
