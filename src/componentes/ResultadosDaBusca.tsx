import React, { useMemo } from 'react';
import { MessageSquare, SearchX } from 'lucide-react';
import type { Conversa } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { Avatar } from './Avatar';
import {
  buscarNasConversas,
  normalizarBusca,
  textoPesquisavel,
  trechoEmVolta,
} from '../servicos/buscaNasConversas';
import { formatarDataBR } from '../servicos/ponto';
import { dataDeHoje } from '../servicos/ponto';

interface Props {
  termo: string;
  conversas: Conversa[];
  /** Abre a conversa; com a mensagem, abre já nela. */
  aoAbrir: (conversaId: string, mensagemId?: string) => void;
}

/** O termo em negrito dentro do trecho, sem depender de acento para achar. */
const Destacado: React.FC<{ texto: string; termo: string }> = ({ texto, termo }) => {
  const onde = normalizarBusca(texto).indexOf(normalizarBusca(termo));
  if (onde < 0) return <>{texto}</>;
  const fim = onde + normalizarBusca(termo).length;
  return (
    <>
      {texto.slice(0, onde)}
      <mark className="bg-transparent text-[var(--c-acento)] font-semibold">{texto.slice(onde, fim)}</mark>
      {texto.slice(fim)}
    </>
  );
};

/** "Hoje 14:35", ou a data, para quem procura saber quando foi dito. */
const quando = (criadoEm: string, hora: string) => {
  const data = (criadoEm || '').slice(0, 10);
  return data === dataDeHoje() ? hora : formatarDataBR(data).slice(0, 5);
};

/**
 * OS RESULTADOS DA BUSCA DA LISTA — como no WhatsApp: primeiro as
 * conversas cujo nome casa, depois as mensagens, cada uma com o nome da
 * conversa, quando foi e o trecho em volta da palavra.
 */
export const ResultadosDaBusca: React.FC<Props> = ({ termo, conversas, aoAbrir }) => {
  const resultado = useMemo(() => {
    const porConversa = bancoDados.obterMensagensPorConversa(conversas.map((c) => c.id));
    return buscarNasConversas(termo, conversas, (id) => porConversa.get(id) || []);
  }, [termo, conversas]);

  const nada = resultado.conversas.length === 0 && resultado.mensagens.length === 0;

  if (nada) {
    return (
      <div className="px-8 py-16 flex flex-col items-center text-center gap-2 text-[var(--c-texto-3)]">
        <SearchX className="w-8 h-8" />
        <p className="text-sm font-semibold text-[var(--c-texto-2)]">Nada encontrado</p>
        <p className="text-xs">
          Nenhuma conversa ou mensagem com “{termo.trim()}” neste aparelho.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {resultado.conversas.length > 0 && (
        <section>
          <h3 className="px-4 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Conversas
          </h3>
          {resultado.conversas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => aoAbrir(c.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[var(--c-superficie-2)] border-b border-[var(--c-borda)]"
            >
              <span className="w-10 h-10 rounded-full bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                <Avatar foto={c.foto} nome={c.nome} id={c.id} />
              </span>
              <span className="text-[15px] font-medium text-[var(--c-texto)] truncate">
                <Destacado texto={c.nome} termo={termo} />
              </span>
            </button>
          ))}
        </section>
      )}

      {resultado.mensagens.length > 0 && (
        <section>
          <h3 className="px-4 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Mensagens
          </h3>
          {resultado.mensagens.map(({ conversa, mensagem }) => (
            <button
              key={mensagem.id}
              type="button"
              onClick={() => aoAbrir(conversa.id, mensagem.id)}
              className="w-full px-4 py-3 text-left active:bg-[var(--c-superficie-2)] border-b border-[var(--c-borda)]"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium text-[var(--c-texto)] truncate">{conversa.nome}</span>
                <span className="text-xs text-[var(--c-texto-3)] flex-shrink-0 tabular-nums">
                  {quando(mensagem.criadoEm, mensagem.horaFormatada)}
                </span>
              </span>
              <span className="block text-sm text-[var(--c-texto-2)] mt-0.5 line-clamp-2">
                <Destacado texto={trechoEmVolta(textoPesquisavel(mensagem), termo)} termo={termo} />
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
};
