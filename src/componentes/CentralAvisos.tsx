/**
 * CENTRAL DA DIREÇÃO — CONECTA / Malachias Autopeças
 *
 * O QUE ESTA TELA É
 *
 * A prateleira da rede: comunicados, documentos e tutoriais das cinco
 * lojas. Era só uma lista de recados com filtro de loja; passou a ser o
 * lugar onde se PROCURA — e procurar exige três coisas que uma lista
 * simples não dá: gaveta (categoria), recorte (unidade) e busca que
 * entre no texto.
 *
 * O DESENHO, e por que assim
 *
 * Coluna da esquerda: busca, unidades e categorias, cada uma com o seu
 * número. O número é o que evita clicar para descobrir que está vazio —
 * numa tela que vai receber volume, cada clique em nada é um motivo para
 * não voltar.
 *
 * Direita: as abas de TIPO primeiro, porque é a divisão mais grossa
 * (quem vem buscar a tabela de preço não quer ver comunicado nenhum), e
 * dentro delas o recorte por prioridade.
 *
 * O que NÃO está aqui: a regra de quem vê o quê, quem leu e como
 * ordenar. Tudo isso é `mural.ts`. Esta tela mostra — e uma tela que
 * decide quem vê o quê é uma segunda cópia da regra que o banco já tem.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Plus,
  Pin,
  AlertCircle,
  Info,
  AlertTriangle,
  Search,
  Building2,
  Paperclip,
  ChevronRight,
  FileText,
  BookOpen,
  Eye,
  ShieldCheck,
  X,
  Upload,
} from 'lucide-react';
import {
  Colaborador,
  AvisoRede,
  PrioridadeAviso,
  PRIORIDADES_AVISO,
  ROTULO_PRIORIDADE,
  TipoPublicacao,
  TIPOS_PUBLICACAO,
  ROTULO_TIPO_PUBLICACAO,
  CategoriaPublicacao,
  CATEGORIAS_PUBLICACAO,
  ROTULO_CATEGORIA,
  DestinoPublicacao,
  INFORMACOES_LOJAS,
  publicaComunicado,
} from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import {
  casaComBusca,
  descreverDestinos,
  ehDaUnidade,
  ordenarPublicacoes,
  resumoDeLeitura,
} from '../servicos/mural';
import { enviarAnexo } from '../servicos/anexos';
import { EditorTexto } from './EditorTexto';
import { semFormatacao } from '../servicos/textoRico';
import { NovaPublicacao } from './NovaPublicacao';
import { PainelPublicacao } from './PainelPublicacao';
import { FotoPresenca } from './FotoPresenca';

interface PropsCentralAvisos {
  colaboradorAtual: Colaborador;
  aoAbrirConversaAvisos?: () => void;
  aoAlternarParaGestor?: () => void;
}

const ICONE_TIPO: Record<TipoPublicacao, React.ReactNode> = {
  aviso: <Megaphone className="w-4 h-4" />,
  documento: <FileText className="w-4 h-4" />,
  tutorial: <BookOpen className="w-4 h-4" />,
};

const ICONE_PRIORIDADE: Record<PrioridadeAviso, React.ReactNode> = {
  urgente: <AlertCircle className="w-4 h-4" />,
  atencao: <AlertTriangle className="w-4 h-4" />,
  geral: <Info className="w-4 h-4" />,
};

const CORES_PRIORIDADE: Record<PrioridadeAviso, string> = {
  urgente: 'bg-red-500 text-white',
  atencao: 'bg-amber-500 text-white',
  geral: 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]',
};

const ETIQUETA_PRIORIDADE: Record<PrioridadeAviso, string> = {
  urgente: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
  atencao: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  geral: 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)] border-[var(--c-borda)]',
};

/** Uma linha da coluna da esquerda, com o seu número. */
const LinhaFiltro: React.FC<{
  ligado: boolean;
  aoClicar: () => void;
  icone: React.ReactNode;
  rotulo: string;
  contagem: number;
}> = ({ ligado, aoClicar, icone, rotulo, contagem }) => (
  <button
    type="button"
    onClick={aoClicar}
    className={`w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-left transition-colors ${
      ligado
        ? 'bg-[var(--c-acento)]/10 text-[var(--c-acento)] font-bold'
        : 'text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]'
    }`}
  >
    <span className="shrink-0 opacity-70">{icone}</span>
    <span className="flex-1 min-w-0 text-xs truncate">{rotulo}</span>
    {/* O número evita clicar para descobrir que está vazio */}
    <span className="text-[11px] font-bold text-[var(--c-texto-3)] shrink-0">
      {contagem}
    </span>
  </button>
);

export const CentralAvisos: React.FC<PropsCentralAvisos> = ({
  colaboradorAtual,
}) => {
  const [versao, setVersao] = useState(0);
  const [tipoAtivo, setTipoAtivo] = useState<TipoPublicacao>('aviso');
  const [busca, setBusca] = useState('');
  const [unidade, setUnidade] = useState<string>('todas');
  const [categoria, setCategoria] = useState<CategoriaPublicacao | 'todas'>('todas');
  const [prioridade, setPrioridade] = useState<PrioridadeAviso | 'todas'>('todas');
  const [aberta, setAberta] = useState<AvisoRede | null>(null);
  const [formularioAberto, setFormularioAberto] = useState(false);

  // Campos do formulário
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [tipoNovo, setTipoNovo] = useState<TipoPublicacao>('aviso');
  const [categoriaNova, setCategoriaNova] = useState<CategoriaPublicacao>('operacional');
  const [prioridadeNova, setPrioridadeNova] = useState<PrioridadeAviso>('geral');
  const [destinos, setDestinos] = useState<DestinoPublicacao[]>([
    { alcance: 'rede', valor: '' },
  ]);
  const [exigeConfirmacao, setExigeConfirmacao] = useState(false);
  const [fixar, setFixar] = useState(false);
  const [anexo, setAnexo] = useState<{ dataUrl: string; nome: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const cancelar = bancoDados.assinarAlteracoes(() => setVersao((v) => v + 1));
    return () => cancelar();
  }, []);

  const colaboradores = useMemo(() => {
    void versao;
    return bancoDados.obterColaboradores();
  }, [versao]);

  const podeAdministrar = publicaComunicado(colaboradorAtual);

  /**
   * O que esta pessoa alcança.
   *
   * Vem pronto do serviço, que por sua vez chama `alcanca` — a MESMA
   * função que a política do banco espelha. Refazer o filtro aqui, com
   * o nível escrito à mão, é como a tela e o banco passaram a discordar
   * sobre quem enxerga o quê.
   */
  const minhas = useMemo(() => {
    void versao;
    return bancoDados.obterAvisosVisiveisParaUsuarioAtual();
  }, [versao, colaboradorAtual.id]);

  /**
   * Os contadores da coluna da esquerda contam DENTRO DO TIPO ABERTO.
   *
   * Contar a prateleira inteira faria "RH 6" com a aba de Documentos
   * aberta e um só documento de RH — o número prometeria seis e
   * entregaria um.
   */
  const doTipo = useMemo(
    () => minhas.filter((p) => p.tipo === tipoAtivo),
    [minhas, tipoAtivo]
  );

  const contarUnidade = (nome: string) =>
    doTipo.filter((p) => nome === 'todas' || ehDaUnidade(p, nome, colaboradores))
      .length;

  const lista = useMemo(() => {
    const filtradas = doTipo
      .filter((p) => categoria === 'todas' || p.categoria === categoria)
      .filter((p) => prioridade === 'todas' || p.prioridade === prioridade)
      .filter((p) => unidade === 'todas' || ehDaUnidade(p, unidade, colaboradores))
      .filter((p) => casaComBusca(p, busca));

    return ordenarPublicacoes(filtradas);
  }, [doTipo, categoria, prioridade, unidade, busca, colaboradores]);

  const limparFormulario = () => {
    setTitulo('');
    setConteudo('');
    setTipoNovo('aviso');
    setCategoriaNova('operacional');
    setPrioridadeNova('geral');
    setDestinos([{ alcance: 'rede', valor: '' }]);
    setExigeConfirmacao(false);
    setFixar(false);
    setAnexo(null);
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
     * Se subir depois e falhar, fica uma publicação de tipo "documento"
     * sem documento nenhum — que é pior do que não publicar, porque
     * quem procurar vai achar e não vai levar nada.
     */
    let anexoCaminho: string | undefined;
    let anexoNome: string | undefined;

    if (anexo) {
      const id = `pub-${Date.now()}`;
      const enviado = await enviarAnexo(anexo.dataUrl, 'central', id, anexo.nome);
      if (!enviado) {
        setSalvando(false);
        setAviso('Não foi possível enviar o arquivo. A publicação não foi criada.');
        return;
      }
      anexoCaminho = enviado.caminho;
      anexoNome = anexo.nome;
    }

    const res = await bancoDados.criarAvisoRede({
      titulo,
      conteudo,
      prioridade: prioridadeNova,
      tipo: tipoNovo,
      categoria: categoriaNova,
      destinos,
      anexoCaminho,
      anexoNome,
      exigeConfirmacao,
      fixadoNoTopo: fixar,
      /**
       * `lojaDestino` sai dos destinos, e não de um campo próprio.
       *
       * Ele é o que as telas antigas leem. Dois campos preenchidos por
       * mãos diferentes é como um comunicado aparecia numa tela e não
       * em outra.
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

    limparFormulario();
    setFormularioAberto(false);
    setTipoAtivo(tipoNovo);
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-11 h-11 rounded-2xl bg-[var(--c-acento)]/10 flex items-center justify-center shrink-0">
          <Megaphone className="w-5 h-5 text-[var(--c-acento)]" />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-black text-[var(--c-texto)] leading-tight">
            Central da Direção
          </h1>
          <p className="text-xs text-[var(--c-texto-3)]">
            Comunicados, documentos e tutoriais das {INFORMACOES_LOJAS.length} lojas
            da Malachias
          </p>
        </div>

        {podeAdministrar && (
          <button
            type="button"
            onClick={() => setFormularioAberto(true)}
            className="px-4 py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 transition-all"
          >
            <Plus className="w-4 h-4" /> Nova publicação
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Coluna da esquerda */}
        <aside className="w-full lg:w-60 shrink-0 bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-3 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por assunto..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
            />
          </div>

          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] px-2.5 mb-1">
              Unidades
            </span>
            <LinhaFiltro
              ligado={unidade === 'todas'}
              aoClicar={() => setUnidade('todas')}
              icone={<Building2 className="w-3.5 h-3.5" />}
              rotulo="Todas as unidades"
              contagem={doTipo.length}
            />
            {INFORMACOES_LOJAS.map((loja) => (
              <LinhaFiltro
                key={loja.nome}
                ligado={unidade === loja.nome}
                aoClicar={() => setUnidade(loja.nome)}
                icone={<Building2 className="w-3.5 h-3.5" />}
                rotulo={loja.nome}
                contagem={contarUnidade(loja.nome)}
              />
            ))}
          </div>

          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] px-2.5 mb-1">
              Categorias
            </span>
            <LinhaFiltro
              ligado={categoria === 'todas'}
              aoClicar={() => setCategoria('todas')}
              icone={<FileText className="w-3.5 h-3.5" />}
              rotulo="Todas"
              contagem={doTipo.length}
            />
            {CATEGORIAS_PUBLICACAO.map((cat) => (
              <LinhaFiltro
                key={cat}
                ligado={categoria === cat}
                aoClicar={() => setCategoria(cat)}
                icone={<FileText className="w-3.5 h-3.5" />}
                rotulo={ROTULO_CATEGORIA[cat]}
                contagem={doTipo.filter((p) => p.categoria === cat).length}
              />
            ))}
          </div>
        </aside>

        {/* Lista */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
          {/* Abas de tipo: a divisão mais grossa vem primeiro */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {TIPOS_PUBLICACAO.map((t) => {
              const quantos = minhas.filter((p) => p.tipo === t).length;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoAtivo(t)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                    tipoAtivo === t
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                      : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
                  }`}
                >
                  {ICONE_TIPO[t]}
                  {ROTULO_TIPO_PUBLICACAO[t]}
                  <span
                    className={`px-1.5 rounded-full text-[10px] ${
                      tipoAtivo === t
                        ? 'bg-black/15'
                        : 'bg-[var(--c-superficie-2)]'
                    }`}
                  >
                    {quantos}
                  </span>
                </button>
              );
            })}

            <div className="flex-1" />

            {/* Prioridade só recorta AVISO: documento e tutorial não têm urgência */}
            {tipoAtivo === 'aviso' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrioridade('todas')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${
                    prioridade === 'todas'
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                      : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
                  }`}
                >
                  Todos
                </button>
                {PRIORIDADES_AVISO.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrioridade(p)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${
                      prioridade === p
                        ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                        : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
                    }`}
                  >
                    {ROTULO_PRIORIDADE[p]}{' '}
                    {doTipo.filter((x) => x.prioridade === p).length}
                  </button>
                ))}
              </div>
            )}
          </div>

          {lista.length === 0 ? (
            <div className="p-10 text-center text-xs text-[var(--c-texto-3)] bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl flex flex-col items-center gap-2">
              {ICONE_TIPO[tipoAtivo]}
              <span>
                Nada em {ROTULO_TIPO_PUBLICACAO[tipoAtivo].toLowerCase()} com estes
                filtros.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lista.map((p) => {
                const resumo = resumoDeLeitura(p, colaboradores);
                const vejoLeitura =
                  podeAdministrar || p.autorId === colaboradorAtual.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      bancoDados.confirmarLeituraAviso(p.id);
                      setAberta(p);
                    }}
                    className="w-full text-left p-3.5 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] hover:border-[var(--c-acento)]/40 transition-colors flex gap-3"
                  >
                    <span
                      className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ${
                        CORES_PRIORIDADE[p.prioridade]
                      }`}
                    >
                      {p.tipo === 'aviso'
                        ? ICONE_PRIORIDADE[p.prioridade]
                        : ICONE_TIPO[p.tipo]}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            ETIQUETA_PRIORIDADE[p.prioridade]
                          }`}
                        >
                          {ROTULO_CATEGORIA[p.categoria]}
                        </span>
                        {p.fixadoNoTopo && (
                          <Pin className="w-3 h-3 text-[var(--c-acento)]" />
                        )}
                        {p.exigeConfirmacao && (
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        )}
                      </div>

                      <span className="block text-sm font-bold text-[var(--c-texto)] leading-snug truncate">
                        {p.titulo}
                      </span>
                      {/*
                        O resumo do cartão vai SEM MARCAÇÃO.

                        Com ela, a linha sairia "## Inventário **sexta**" —
                        e o cartão existe justamente para se ler de relance.
                        O texto formatado aparece ao abrir.
                      */}
                      <span className="block text-xs text-[var(--c-texto-3)] leading-snug line-clamp-2 mt-0.5">
                        {semFormatacao(p.conteudo)}
                      </span>

                      <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[10px] text-[var(--c-texto-3)]">
                        {/* Os rostos de quem leu: é o "quem viu" de relance */}
                        {vejoLeitura && resumo.leram.length > 0 && (
                          <span className="flex items-center -space-x-1.5">
                            {resumo.leram.slice(0, 3).map((c) => (
                              <FotoPresenca
                                key={c.id}
                                foto={c.foto}
                                nome={c.nome}
                                presenca={c.presenca}
                                tamanho="w-5 h-5"
                              />
                            ))}
                            {resumo.leram.length > 3 && (
                              <span className="w-5 h-5 rounded-full bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[9px] font-bold flex items-center justify-center text-[var(--c-texto-2)]">
                                +{resumo.leram.length - 3}
                              </span>
                            )}
                          </span>
                        )}

                        {vejoLeitura && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {resumo.leram.length} de {resumo.alvo.length}
                          </span>
                        )}

                        <span className="flex items-center gap-1 truncate">
                          <Building2 className="w-3 h-3" />
                          {descreverDestinos(p, colaboradores)}
                        </span>

                        {p.anexoCaminho && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> 1 anexo
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-[var(--c-texto-3)] whitespace-nowrap">
                        {p.dataPorExtenso}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)]" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {aberta && (
        <PainelPublicacao
          publicacao={aberta}
          colaboradorAtual={colaboradorAtual}
          colaboradores={colaboradores}
          podeAdministrar={podeAdministrar}
          aoConfirmar={() => {
            bancoDados.alternarConfirmacaoAviso(aberta.id);
            setAberta(null);
          }}
          aoFixar={() => {
            bancoDados.alternarFixadoAviso(aberta.id);
            setAberta(null);
          }}
          aoExcluir={() => {
            bancoDados.removerAviso(aberta.id);
            setAberta(null);
          }}
          aoFechar={() => setAberta(null)}
        />
      )}

      {/*
        A ESCRITA É TELA INTEIRA, e não uma janelinha.

        Era um modal de 512px com tipo, título, editor, categoria,
        prioridade, o seletor de destinos inteiro, anexo e duas caixas
        de marcar. O campo do TEXTO — a razão de a tela existir —
        sobrava espremido no meio, com uns poucos pixels de altura.

        Modal serve para "tem certeza?", não para redigir meia página.
      */}
      {formularioAberto && (
        <NovaPublicacao
          colaboradorAtual={colaboradorAtual}
          colaboradores={colaboradores}
          aoFechar={() => setFormularioAberto(false)}
          aoPublicar={(tipoPublicado: TipoPublicacao) => {
            setFormularioAberto(false);
            setTipoAtivo(tipoPublicado);
          }}
        />
      )}
    </div>
  );
};
