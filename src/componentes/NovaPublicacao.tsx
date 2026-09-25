/**
 * ESCREVER UMA PUBLICAÇÃO — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * POR QUE NÃO É MAIS UMA JANELINHA
 * ===================================================================
 *
 * Era um modal de 512px de largura com tudo dentro: tipo, título,
 * editor, categoria, prioridade, o seletor de destinos inteiro (seis
 * unidades, doze setores, a busca de pessoas), anexo e duas caixas de
 * marcar. O campo do TEXTO — que é a razão de a tela existir — sobrava
 * espremido no meio, com uns poucos pixels de altura.
 *
 * Escrever um comunicado não é confirmar uma ação; é redigir. Modal
 * serve para "tem certeza?", não para escrever meia página.
 *
 * ===================================================================
 * O DESENHO
 * ===================================================================
 *
 * Tela inteira, em duas colunas no computador:
 *
 *   ESQUERDA, larga: título e texto. É onde a pessoa passa o tempo,
 *   então é o que ganha o espaço. O editor ocupa a altura disponível
 *   em vez de um número fixo de linhas.
 *
 *   DIREITA, estreita: as decisões — tipo, categoria, prioridade, para
 *   quem vai, anexo. São escolhas rápidas, feitas uma vez.
 *
 * No celular vira uma coluna só, com o texto primeiro.
 */
import React, { useState } from 'react';
import {
  X,
  Megaphone,
  FileText,
  BookOpen,
  Upload,
  Send,
  ShieldCheck,
  Pin,
} from 'lucide-react';
import {
  AvisoRede,
  Colaborador,
  PrioridadeAviso,
  PRIORIDADES_AVISO,
  ROTULO_PRIORIDADE,
  TipoPublicacao,
  TIPOS_PUBLICACAO,
  ROTULO_TIPO_PUBLICACAO_SINGULAR,
  CategoriaPublicacao,
  CATEGORIAS_PUBLICACAO,
  ROTULO_CATEGORIA,
  DestinoPublicacao,
} from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { enviarAnexo } from '../servicos/anexos';
import { EditorTexto } from './EditorTexto';
import { SeletorDestinos } from './SeletorDestinos';

interface Props {
  colaboradorAtual: Colaborador;
  /**
   * A publicação a EDITAR. Sem ela, a tela cria uma nova.
   *
   * Editar e criar são a mesma tela de propósito: os campos são os
   * mesmos, e duas telas iguais divergem no primeiro ajuste — foi
   * assim que a lista de setores acabou escrita em dois lugares.
   */
  publicacaoAEditar?: AvisoRede | null;
  colaboradores: Colaborador[];
  aoPublicar: (tipo: TipoPublicacao) => void;
  aoFechar: () => void;
}

const ICONE_TIPO: Record<TipoPublicacao, React.ReactNode> = {
  aviso: <Megaphone className="w-4 h-4" />,
  documento: <FileText className="w-4 h-4" />,
  tutorial: <BookOpen className="w-4 h-4" />,
};

/**
 * O que cada tipo pede, dito no lugar onde se escreve.
 *
 * Sem isto, os três tipos parecem o mesmo campo com nome diferente — e
 * o tutorial acaba escrito como aviso, sem passo a passo nenhum.
 */
const AJUDA: Record<TipoPublicacao, string> = {
  aviso:
    'O que muda, para quem e a partir de quando. Quem lê está no balcão: comece pelo que muda.',
  documento:
    'Diga o que é o documento e quando usá-lo. O arquivo vai anexado aqui ao lado.',
  tutorial:
    'Passo a passo. Use a lista numerada ou os itens para conferir — quem segue um tutorial vai marcando.',
};

export const NovaPublicacao: React.FC<Props> = ({
  colaboradorAtual,
  colaboradores,
  aoPublicar,
  aoFechar,
  publicacaoAEditar,
}) => {
  const editando = publicacaoAEditar ?? null;

  const [titulo, setTitulo] = useState(editando?.titulo ?? '');
  const [conteudo, setConteudo] = useState(editando?.conteudo ?? '');
  const [tipo, setTipo] = useState<TipoPublicacao>(editando?.tipo ?? 'aviso');
  const [categoria, setCategoria] = useState<CategoriaPublicacao>(
    editando?.categoria ?? 'operacional'
  );
  const [prioridade, setPrioridade] = useState<PrioridadeAviso>(
    editando?.prioridade ?? 'geral'
  );
  const [destinos, setDestinos] = useState<DestinoPublicacao[]>(
    () => editando?.destinos ?? [{ alcance: 'rede', valor: '' }]
  );
  const [exigeConfirmacao, setExigeConfirmacao] = useState(
    !!editando?.exigeConfirmacao
  );
  const [fixar, setFixar] = useState(!!editando?.fixadoNoTopo);
  const [anexo, setAnexo] = useState<{ dataUrl: string; nome: string } | null>(null);

  /**
   * O anexo que JÁ ESTAVA na publicação.
   *
   * Separado do `anexo` novo: sem isto, abrir para editar e salvar
   * sem tocar no arquivo apagaria o documento — o campo do arquivo
   * nasce vazio, e vazio aqui significaria "remover".
   */
  const [anexoExistente, setAnexoExistente] = useState(
    editando?.anexoCaminho
      ? { caminho: editando.anexoCaminho, nome: editando.anexoNome ?? 'Documento' }
      : null
  );
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  void colaboradorAtual;

  /**
   * Sobe a imagem do CORPO do texto e devolve o caminho.
   *
   * Vai para a mesma pasta do anexo, mas com id próprio: a imagem
   * dentro do texto e o documento anexado são coisas diferentes, e
   * uma não pode sobrescrever a outra.
   */
  const subirImagem = async (arquivo: File): Promise<string | null> => {
    const dataUrl = await new Promise<string>((resolver) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(String(leitor.result));
      leitor.readAsDataURL(arquivo);
    });

    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const enviado = await enviarAnexo(dataUrl, 'central', id, arquivo.name);

    if (!enviado) {
      setAviso('Não foi possível enviar a imagem.');
      return null;
    }
    return enviado.caminho;
  };

  const escolherArquivo = (arquivo: File) => {
    const leitor = new FileReader();
    leitor.onload = () =>
      setAnexo({ dataUrl: String(leitor.result), nome: arquivo.name });
    leitor.readAsDataURL(arquivo);
  };

  const publicar = async () => {
    if (!titulo.trim() || !conteudo.trim()) {
      setAviso('Título e conteúdo são obrigatórios.');
      return;
    }
    if (destinos.length === 0) {
      setAviso('Escolha ao menos um destino — ninguém receberia.');
      return;
    }

    setSalvando(true);
    setAviso(null);

    /**
     * O anexo sobe ANTES da publicação existir.
     *
     * Se subisse depois e falhasse, ficaria uma publicação de tipo
     * "documento" sem documento nenhum — pior do que não publicar,
     * porque quem procurar vai achar e não vai levar nada.
     */
    /**
     * Começa com o que JÁ ESTAVA lá.
     *
     * Ao editar, o campo de arquivo nasce vazio — e tratar vazio como
     * "sem anexo" apagaria o documento de quem só veio corrigir uma
     * palavra do texto.
     */
    let anexoCaminho: string | undefined = anexoExistente?.caminho;
    let anexoNome: string | undefined = anexoExistente?.nome;

    if (anexo) {
      const id = `pub-${Date.now()}`;
      const enviado = await enviarAnexo(anexo.dataUrl, 'central', id, anexo.nome);
      if (!enviado) {
        setSalvando(false);
        setAviso(
          editando
            ? 'Não foi possível enviar o arquivo. Nada foi alterado.'
            : 'Não foi possível enviar o arquivo. A publicação não foi criada.'
        );
        return;
      }
      anexoCaminho = enviado.caminho;
      anexoNome = anexo.nome;
    }

    /**
     * MESMA TELA, DUAS AÇÕES.
     *
     * Editar não reabre a lista de quem leu: quem leu, leu, e um
     * texto corrigido não desfaz isso. Conteúdo que muda de verdade
     * se publica de novo.
     */
    const res = editando
      ? await bancoDados.editarAviso(editando.id, {
          titulo,
          conteudo,
          prioridade,
          categoria,
          destinos,
          exigeConfirmacao,
          anexoCaminho,
          anexoNome,
        })
      : await bancoDados.criarAvisoRede({
          titulo,
          conteudo,
          prioridade,
          tipo,
          categoria,
          destinos,
          anexoCaminho,
          anexoNome,
          exigeConfirmacao,
          fixadoNoTopo: fixar,
          /**
           * `lojaDestino` sai dos destinos, e não de um campo próprio:
           * é o que as telas antigas leem, e dois campos preenchidos
           * por mãos diferentes é como um comunicado aparecia numa
           * tela e não noutra.
           */
          lojaDestino:
            destinos.length === 1 && destinos[0].alcance === 'loja'
              ? (destinos[0].valor as never)
              : 'Todas',
        });

    setSalvando(false);

    if (!res.sucesso) {
      setAviso(res.erro || 'Não foi possível publicar.');
      return;
    }

    aoPublicar(tipo);
  };

  const rotuloCampo =
    'block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-[var(--c-canvas)] flex flex-col">
      {/* Cabeçalho fixo: o botão de publicar fica sempre à mão */}
      <header className="shrink-0 px-4 sm:px-6 py-3 border-b border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center gap-3">
        <button
          type="button"
          onClick={aoFechar}
          className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)]"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-[var(--c-texto)]">
            {editando ? 'Editar publicação' : 'Nova publicação'}
          </h1>
          <p className="text-[11px] text-[var(--c-texto-3)] truncate">
            {AJUDA[tipo]}
          </p>
        </div>

        <button
          type="button"
          onClick={aoFechar}
          className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hidden sm:block"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={publicar}
          className="px-4 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-40 flex items-center gap-1.5 shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          {salvando
            ? editando
              ? 'Salvando...'
              : 'Publicando...'
            : editando
              ? 'Salvar'
              : 'Publicar'}
        </button>
      </header>

      {aviso && (
        <div className="shrink-0 px-4 sm:px-6 py-2 bg-red-500/5 border-b border-red-500/25 text-xs text-red-700 dark:text-red-400">
          {aviso}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        <div className="h-full flex flex-col lg:flex-row">
          {/* ESQUERDA: onde se escreve */}
          <div className="flex-1 min-w-0 flex flex-col p-4 sm:p-6 gap-3 lg:overflow-hidden">
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título da publicação"
              className="w-full px-0 py-1 text-xl font-bold bg-transparent border-0 border-b border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-acento)] placeholder:text-[var(--c-texto-3)] placeholder:font-normal shrink-0"
            />

            {/*
              O EDITOR OCUPA O QUE SOBRAR.

              Com altura fixa em linhas, ele ficava do mesmo tamanho num
              monitor de 27" e num notebook — desperdiçando espaço lá e
              faltando aqui. `flex-1` + `min-h-0` é o que faz ele crescer
              sem empurrar o resto para fora.
            */}
            <div className="flex-1 min-h-[260px] lg:min-h-0 flex flex-col">
              <EditorTexto
                valor={conteudo}
                aoMudar={setConteudo}
                alturaCheia
                aoSubirImagem={subirImagem}
                placeholder={AJUDA[tipo]}
              />
            </div>
          </div>

          {/* DIREITA: as decisões */}
          <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 sm:p-6 flex flex-col gap-4 lg:overflow-y-auto">
            <div>
              <span className={rotuloCampo}>Tipo</span>
              <div className="grid grid-cols-3 gap-1.5">
                {TIPOS_PUBLICACAO.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    /* Trocar o tipo na edição tiraria a publicação da
                       prateleira onde as pessoas a guardaram */
                    disabled={!!editando}
                    className={`px-2 py-2 rounded-xl text-[11px] font-bold border flex flex-col items-center gap-1 transition-colors ${
                      tipo === t
                        ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                        : 'bg-[var(--c-canvas)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
                    }`}
                  >
                    {ICONE_TIPO[t]}
                    {/* Singular escrito, e não o plural sem o "s" — era
                        assim que a aba de tutoriais virava "Tutoriai" */}
                    {ROTULO_TIPO_PUBLICACAO_SINGULAR[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={rotuloCampo}>Categoria</span>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as CategoriaPublicacao)}
                  className="w-full px-2.5 py-2 text-xs bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)]"
                >
                  {CATEGORIAS_PUBLICACAO.map((c) => (
                    <option key={c} value={c}>
                      {ROTULO_CATEGORIA[c]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className={rotuloCampo}>Prioridade</span>
                <select
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value as PrioridadeAviso)}
                  className="w-full px-2.5 py-2 text-xs bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)]"
                >
                  {PRIORIDADES_AVISO.map((p) => (
                    <option key={p} value={p}>
                      {ROTULO_PRIORIDADE[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className={rotuloCampo}>Para quem vai</span>
              <SeletorDestinos
                destinos={destinos}
                aoMudar={setDestinos}
                colaboradores={colaboradores}
              />
            </div>

            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-[var(--c-borda)] cursor-pointer hover:border-[var(--c-acento)]/40">
              <Upload className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
              <span className="flex-1 min-w-0 text-xs text-[var(--c-texto-2)] truncate">
                {anexo?.nome ?? anexoExistente?.nome ?? 'Anexar documento ou foto'}
              </span>
              {(anexo || anexoExistente) && (
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    setAnexo(null);
                    setAnexoExistente(null);
                  }}
                  className="p-1 text-[var(--c-texto-3)]"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) escolherArquivo(arquivo);
                }}
              />
            </label>

            <label className="flex items-start gap-2 text-xs text-[var(--c-texto-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={exigeConfirmacao}
                onChange={(e) => setExigeConfirmacao(e.target.checked)}
                className="accent-[var(--c-acento)] mt-0.5"
              />
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Exigir ciência — quem recebe confirma que leu
              </span>
            </label>

            <label className="flex items-start gap-2 text-xs text-[var(--c-texto-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={fixar}
                onChange={(e) => setFixar(e.target.checked)}
                className="accent-[var(--c-acento)] mt-0.5"
              />
              <span className="flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-[var(--c-acento)] shrink-0" />
                Fixar no topo da lista
              </span>
            </label>
          </aside>
        </div>
      </div>
    </div>
  );
};
