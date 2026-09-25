/**
 * A PUBLICAÇÃO ABERTA — CONECTA / Malachias Autopeças
 *
 * O cartão da lista mostra o começo; aqui está o inteiro teor, o anexo e
 * — para quem publicou — QUEM VIU.
 *
 * Por que "quem viu" importa: um comunicado de segurança, uma mudança de
 * horário ou uma advertência só servem de prova se houver como dizer
 * quem foi alcançado. E, do lado prático, é o que evita a Dani reenviar
 * para as 89 pessoas porque três não leram.
 *
 * LEU E CONFIRMOU SÃO COISAS DIFERENTES. Quem assina ciência leu; quem
 * leu não necessariamente assinou. Numa publicação que exige ciência, só
 * a segunda conta — e por isso a barra mede uma ou outra conforme o caso.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Paperclip,
  Download,
  ExternalLink,
  Check,
  Clock,
  Eye,
  Pin,
  Trash2,
  ShieldCheck,
  Pencil,
} from 'lucide-react';
import {
  AvisoRede,
  Colaborador,
  ROTULO_CATEGORIA,
  ROTULO_PRIORIDADE,
} from '../tipos';
import { resumoDeLeitura, descreverDestinos } from '../servicos/mural';
import { abrirDocumento } from '../servicos/rh';
import { imagensCitadas } from '../servicos/textoRico';
import { TextoFormatado } from './EditorTexto';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  publicacao: AvisoRede;
  colaboradorAtual: Colaborador;
  colaboradores: Colaborador[];
  podeAdministrar: boolean;
  aoConfirmar: () => void;
  aoFixar: () => void;
  aoExcluir: () => void;
  /**
   * Abre esta publicação para editar.
   *
   * Opcional: só quem pode editar recebe. A trava de verdade está em
   * `editarAviso`, no serviço — botão escondido se contorna pelo
   * console.
   */
  aoEditar?: () => void;
  aoFechar: () => void;
}

const CORES_PRIORIDADE: Record<string, string> = {
  urgente: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
  atencao: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  geral: 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)] border-[var(--c-borda)]',
};

export const PainelPublicacao: React.FC<Props> = ({
  publicacao,
  colaboradorAtual,
  colaboradores,
  podeAdministrar,
  aoConfirmar,
  aoFixar,
  aoExcluir,
  aoEditar,
  aoFechar,
}) => {
  const [abaLeitura, setAbaLeitura] = useState<'leram' | 'faltam'>('faltam');
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  /**
   * As imagens do corpo, assinadas.
   *
   * O caminho no balde não abre sozinho. Sem isto, um procedimento
   * com print de tela mostraria a legenda no lugar da foto.
   */
  const [imagens, setImagens] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    const caminhos = imagensCitadas(publicacao.conteudo);
    if (caminhos.length === 0) return;

    Promise.all(caminhos.map((c) => abrirDocumento(c).then((url) => [c, url] as const)))
      .then((pares) => {
        if (!vivo) return;
        const mapa: Record<string, string> = {};
        for (const [caminho, url] of pares) if (url) mapa[caminho] = url;
        setImagens(mapa);
      })
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [publicacao.id, publicacao.conteudo]);

  const resumo = useMemo(
    () => resumoDeLeitura(publicacao, colaboradores),
    [publicacao, colaboradores]
  );

  /**
   * A lista de leitura é de quem PUBLICOU (e de quem administra).
   *
   * Saber quem leu o quê é informação sobre as outras pessoas. Quem
   * recebeu o comunicado precisa do comunicado, não do relatório de
   * quem mais o abriu.
   */
  const vejoQuemLeu = podeAdministrar || publicacao.autorId === colaboradorAtual.id;

  const jaConfirmei = (publicacao.confirmacoesIds || []).includes(
    colaboradorAtual.id
  );

  const abrirAnexo = async () => {
    if (!publicacao.anexoCaminho) return;
    const url = await abrirDocumento(publicacao.anexoCaminho);
    if (url) window.open(url, '_blank');
  };

  const listaVisivel = abaLeitura === 'leram' ? resumo.leram : resumo.naoLeram;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={aoFechar}
    >
      <div
        className="bg-[var(--c-superficie)] w-full max-w-2xl max-h-[90vh] rounded-2xl border border-[var(--c-borda)] shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[var(--c-borda)] flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                  CORES_PRIORIDADE[publicacao.prioridade]
                }`}
              >
                {ROTULO_PRIORIDADE[publicacao.prioridade]}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--c-superficie-2)] text-[10px] font-bold text-[var(--c-texto-2)]">
                {ROTULO_CATEGORIA[publicacao.categoria]}
              </span>
              {publicacao.fixadoNoTopo && (
                <Pin className="w-3 h-3 text-[var(--c-acento)]" />
              )}
            </div>

            <h2 className="text-base font-bold text-[var(--c-texto)] leading-tight">
              {publicacao.titulo}
            </h2>
            <p className="text-[11px] text-[var(--c-texto-3)] mt-0.5">
              {publicacao.autorNome} · {publicacao.dataPorExtenso} às{' '}
              {publicacao.horaFormatada} · para{' '}
              {descreverDestinos(publicacao, colaboradores)}
            </p>
          </div>

          <button
            type="button"
            onClick={aoFechar}
            className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* O inteiro teor, com a formatação que quem escreveu deu */}
          <TextoFormatado
            texto={publicacao.conteudo}
            imagens={imagens}
            className="text-sm text-[var(--c-texto)]"
          />

          {publicacao.anexoCaminho && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)]">
              <Paperclip className="w-4 h-4 text-[var(--c-acento)] shrink-0" />
              <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--c-texto)] truncate">
                {publicacao.anexoNome || 'Documento anexado'}
              </span>
              <button
                type="button"
                onClick={abrirAnexo}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[11px] font-bold flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Abrir
              </button>
            </div>
          )}

          {/* Ciência: só aparece quando é exigida, e some depois de dada */}
          {publicacao.exigeConfirmacao && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-3 ${
                jaConfirmei
                  ? 'bg-emerald-500/5 border-emerald-500/30'
                  : 'bg-amber-500/5 border-amber-500/30'
              }`}
            >
              <ShieldCheck
                className={`w-4 h-4 shrink-0 ${
                  jaConfirmei ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <span className="flex-1 text-xs text-[var(--c-texto-2)] leading-snug">
                {jaConfirmei
                  ? 'Você deu ciência desta publicação.'
                  : 'Esta publicação pede ciência: confirme que leu e entendeu.'}
              </span>
              {!jaConfirmei && (
                <button
                  type="button"
                  onClick={aoConfirmar}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0"
                >
                  Dou ciência
                </button>
              )}
            </div>
          )}

          {vejoQuemLeu && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--c-texto)]">
                  <Eye className="w-3.5 h-3.5 text-[var(--c-acento)]" />
                  {publicacao.exigeConfirmacao ? 'Ciência' : 'Leitura'}
                </span>
                <span className="text-xs font-bold text-[var(--c-texto-2)]">
                  {publicacao.exigeConfirmacao
                    ? resumo.confirmaram.length
                    : resumo.leram.length}{' '}
                  de {resumo.alvo.length}
                </span>
              </div>

              <div className="h-2 rounded-full bg-[var(--c-canvas)] border border-[var(--c-borda)] overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    resumo.percentual === 100 ? 'bg-emerald-500' : 'bg-[var(--c-acento)]'
                  }`}
                  style={{ width: `${resumo.percentual}%` }}
                />
              </div>

              <div className="flex items-center gap-1.5">
                {/* "Faltam" vem primeiro: é a lista sobre a qual se age */}
                <button
                  type="button"
                  onClick={() => setAbaLeitura('faltam')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                    abaLeitura === 'faltam'
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                      : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
                  }`}
                >
                  Faltam {resumo.naoLeram.length}
                </button>
                <button
                  type="button"
                  onClick={() => setAbaLeitura('leram')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                    abaLeitura === 'leram'
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                      : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
                  }`}
                >
                  Leram {resumo.leram.length}
                </button>
              </div>

              <div className="rounded-xl border border-[var(--c-borda)] divide-y divide-[var(--c-borda)] max-h-56 overflow-y-auto">
                {listaVisivel.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-[var(--c-texto-3)]">
                    {abaLeitura === 'faltam'
                      ? 'Todo mundo já leu.'
                      : 'Ninguém leu ainda.'}
                  </div>
                ) : (
                  listaVisivel.map((pessoa) => {
                    const confirmou = resumo.confirmaram.some(
                      (c) => c.id === pessoa.id
                    );
                    return (
                      <div
                        key={pessoa.id}
                        className="px-3 py-2 flex items-center gap-2"
                      >
                        <FotoPresenca
                          foto={pessoa.foto}
                          nome={pessoa.nome}
                          presenca={pessoa.presenca}
                          tamanho="w-6 h-6"
                        />
                        <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--c-texto)] truncate">
                          {pessoa.nome}
                        </span>
                        <span className="text-[10px] text-[var(--c-texto-3)] truncate">
                          {pessoa.loja}
                        </span>
                        {abaLeitura === 'leram' ? (
                          <span
                            className={`text-[10px] font-bold flex items-center gap-0.5 shrink-0 ${
                              confirmou
                                ? 'text-emerald-600'
                                : 'text-[var(--c-texto-3)]'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            {confirmou ? 'Ciência' : 'Leu'}
                          </span>
                        ) : (
                          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </div>

        {podeAdministrar && (
          <footer className="px-4 py-3 border-t border-[var(--c-borda)] flex items-center gap-2">
            <button
              type="button"
              onClick={aoFixar}
              className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] flex items-center gap-1.5"
            >
              <Pin className="w-3.5 h-3.5" />
              {publicacao.fixadoNoTopo ? 'Desafixar' : 'Fixar no topo'}
            </button>

            {/*
              EDITAR, em vez de apagar e refazer.

              Apagar e publicar de novo apaga junto QUEM JÁ LEU e quem
              deu ciência — que é justamente a prova que a publicação
              existe para guardar.
            */}
            {aoEditar && (
              <button
                type="button"
                onClick={aoEditar}
                className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
            )}

            <div className="flex-1" />

            {/* Excluir pede confirmação no lugar: some para todo mundo */}
            {confirmandoExclusao ? (
              <>
                <span className="text-[11px] text-[var(--c-texto-3)]">
                  Some para todos.
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={aoExcluir}
                  className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
                >
                  Excluir
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-red-600 hover:border-red-500/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            )}
          </footer>
        )}

        {!podeAdministrar && !publicacao.exigeConfirmacao && (
          <footer className="px-4 py-3 border-t border-[var(--c-borda)] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--c-texto-3)]">
              <ExternalLink className="w-3 h-3 inline mr-1" />
              Publicado por {publicacao.autorNome}
            </span>
            <button
              type="button"
              onClick={aoFechar}
              className="px-3 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold"
            >
              Entendi
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};
