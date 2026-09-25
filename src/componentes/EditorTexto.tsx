/**
 * O EDITOR DA CENTRAL — CONECTA / Malachias Autopeças
 *
 * A Central só aceitava texto corrido: um comunicado de inventário com
 * cinco passos saía como um parágrafo único, e quem lia no balcão não
 * achava o horário no meio dele.
 *
 * QUEM ESCREVE NÃO PRECISA SABER MARCAÇÃO NENHUMA. A barra escreve por
 * ela, e a aba "Como vai ficar" mostra o resultado antes de publicar.
 * Quem já conhece Markdown digita direto, e os atalhos do teclado
 * (Ctrl+B, Ctrl+I, Ctrl+K) funcionam como em qualquer lugar.
 *
 * A ESCOLHA DE GUARDAR TEXTO, e não HTML, está explicada em
 * `textoRico.ts`: é o que mantém as 24 publicações antigas válidas e a
 * busca achando palavra que está DENTRO do documento.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link2,
  Code,
  Minus,
  Eye,
  Pencil,
  Highlighter,
  CheckSquare,
  Table,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import {
  paraHtml,
  aplicarMarcacao,
  aplicarPrefixo,
  imagensCitadas,
  marcacaoDeCitacao,
  casaComNome,
} from '../servicos/textoRico';
import { abrirDocumento } from '../servicos/rh';
import { SuperficieAoVivo, CampoAoVivo } from './SuperficieAoVivo';

interface Props {
  valor: string;
  aoMudar: (texto: string) => void;
  placeholder?: string;
  linhas?: number;
  /**
   * Ocupa toda a altura que o pai der, em vez de um número fixo de
   * linhas.
   *
   * Com altura em linhas, o campo fica do mesmo tamanho num monitor
   * de 27" e num notebook — desperdiçando espaço lá e faltando aqui.
   */
  alturaCheia?: boolean;
  /**
   * Sobe uma imagem e devolve o CAMINHO dela no balde.
   *
   * Quem envia é quem sabe onde guardar, e é lá que a permissão de
   * escrita mora. O editor só insere a marcação com o caminho que
   * voltar — e `null` deixa o texto intacto, sem inserir imagem
   * quebrada.
   */
  aoSubirImagem?: (arquivo: File) => Promise<string | null>;
  /**
   * Quem pode ser citado com `@`.
   *
   * Vazio ou ausente, o `@` continua sendo só um `@` — é o que um
   * endereço de e-mail digitado no meio do texto precisa.
   */
  pessoas?: PessoaCitavel[];
}

export interface PessoaCitavel {
  id: string;
  nome: string;
  cargo?: string;
  loja?: string;
}

/**
 * QUANTOS NOMES A LISTA MOSTRA.
 *
 * São 89 colaboradores. Mostrar todos cobriria a tela inteira e
 * tiraria de vista justamente o texto que está sendo escrito — quem
 * não achou em seis nomes digita mais uma letra.
 */
const NOMES_NA_LISTA = 6;

type Ferramenta = {
  chave: string;
  titulo: string;
  icone: React.ReactNode;
  /** Envolve a seleção (negrito) ou marca as linhas (lista). */
  aplicar: (
    texto: string,
    inicio: number,
    fim: number
  ) => { texto: string; inicio: number; fim: number };
  atalho?: string;
};

const FERRAMENTAS: Ferramenta[] = [
  {
    chave: 'negrito',
    titulo: 'Negrito (Ctrl+B)',
    icone: <Bold className="w-3.5 h-3.5" />,
    atalho: 'b',
    aplicar: (t, i, f) => aplicarMarcacao(t, i, f, '**', '**', 'negrito'),
  },
  {
    chave: 'italico',
    titulo: 'Itálico (Ctrl+I)',
    icone: <Italic className="w-3.5 h-3.5" />,
    atalho: 'i',
    aplicar: (t, i, f) => aplicarMarcacao(t, i, f, '*', '*', 'itálico'),
  },
  {
    chave: 'riscado',
    titulo: 'Riscado',
    icone: <Strikethrough className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarMarcacao(t, i, f, '~~', '~~', 'riscado'),
  },
  {
    chave: 'titulo',
    titulo: 'Título',
    icone: <Heading1 className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarPrefixo(t, i, f, '# '),
  },
  {
    chave: 'subtitulo',
    titulo: 'Subtítulo',
    icone: <Heading2 className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarPrefixo(t, i, f, '## '),
  },
  {
    chave: 'lista',
    titulo: 'Lista',
    icone: <List className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarPrefixo(t, i, f, '- '),
  },
  {
    chave: 'numerada',
    titulo: 'Lista numerada',
    icone: <ListOrdered className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarPrefixo(t, i, f, '1. '),
  },
  {
    chave: 'citacao',
    titulo: 'Citação',
    icone: <Quote className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarPrefixo(t, i, f, '> '),
  },
  {
    chave: 'link',
    titulo: 'Link (Ctrl+K)',
    icone: <Link2 className="w-3.5 h-3.5" />,
    atalho: 'k',
    aplicar: (t, i, f) => aplicarMarcacao(t, i, f, '[', '](https://)', 'texto do link'),
  },
  {
    chave: 'codigo',
    titulo: 'Código',
    icone: <Code className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarMarcacao(t, i, f, '`', '`', 'código'),
  },
  {
    chave: 'marca',
    titulo: 'Marca-texto',
    icone: <Highlighter className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarMarcacao(t, i, f, '==', '==', 'em destaque'),
  },
  {
    chave: 'tarefa',
    titulo: 'Item para conferir',
    icone: <CheckSquare className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => aplicarPrefixo(t, i, f, '- [ ] '),
  },
  {
    chave: 'tabela',
    titulo: 'Tabela',
    icone: <Table className="w-3.5 h-3.5" />,
    /**
     * Insere uma tabela PRONTA, com cabeçalho e duas linhas.
     *
     * Um botão que só escrevesse `|` deixaria quem não conhece a
     * marcação sem saber o que fazer com ele — e a linha de traços,
     * que é o que separa o cabeçalho, ninguém adivinha.
     */
    aplicar: (t, i, f) => {
      const modelo =
        '\n| Coluna | Coluna |\n|---|---|\n| valor | valor |\n| valor | valor |\n';
      return {
        texto: `${t.slice(0, f)}${modelo}${t.slice(f)}`,
        inicio: f + 3,
        fim: f + 9,
      };
    },
  },
  {
    chave: 'separador',
    titulo: 'Linha separadora',
    icone: <Minus className="w-3.5 h-3.5" />,
    aplicar: (t, i, f) => ({
      texto: `${t.slice(0, f)}\n\n---\n\n${t.slice(f)}`,
      inicio: f + 7,
      fim: f + 7,
    }),
  },
];

/**
 * Onde a barra ganha um risco vertical.
 *
 * Onze botões em fila viram uma régua sem começo nem fim. Os grupos são
 * os de sempre: ênfase | estrutura | blocos | inserir.
 */
const SEPARAR_ANTES = new Set(['titulo', 'lista', 'link', 'tabela']);

export const EditorTexto: React.FC<Props> = ({
  valor,
  aoMudar,
  placeholder,
  linhas = 8,
  alturaCheia = false,
  aoSubirImagem,
  pessoas = [],
}) => {
  const campo = useRef<HTMLTextAreaElement>(null);
  const campoVivo = useRef<CampoAoVivo>(null);
  const [subindo, setSubindo] = useState(false);

  /**
   * DOIS MODOS, e o de ver a marcação existe como SAÍDA.
   *
   * O campo ao vivo mostra o texto formatado, que é o que se pediu. Mas
   * ele é um campo editável de verdade, e campo editável é onde os
   * navegadores mais divergem — se um celular do balcão se comportar
   * mal, quem está escrevendo precisa de um caminho que sempre
   * funcionou. É este: o campo de texto puro, com a marcação à vista.
   *
   * Os dois gravam exatamente a mesma coisa, porque é a mesma string.
   */
  const [modo, setModo] = useState<'vivo' | 'marcacao'>('vivo');

  /** Onde está o cursor, qualquer que seja o campo em uso. */
  const selecaoAgora = (): { inicio: number; fim: number } => {
    if (modo === 'vivo') return campoVivo.current?.selecao() ?? { inicio: 0, fim: 0 };

    const alvo = campo.current;
    return alvo
      ? { inicio: alvo.selectionStart, fim: alvo.selectionEnd }
      : { inicio: valor.length, fim: valor.length };
  };

  /**
   * Devolve o cursor para onde ele estava.
   *
   * O `setTimeout` de zero espera o React redesenhar: mexer na seleção
   * antes disso é mexer no texto antigo.
   */
  const devolverCursor = (inicio: number, fim: number) => {
    setTimeout(() => {
      if (modo === 'vivo') return campoVivo.current?.definirSelecao(inicio, fim);
      campo.current?.focus();
      campo.current?.setSelectionRange(inicio, fim);
    }, 0);
  };

  /**
   * A CITAÇÃO EM ANDAMENTO: o que foi digitado depois do `@` e onde o
   * `@` começa.
   *
   * Guardar a POSIÇÃO, e não só o termo, é o que permite trocar o
   * trecho certo quando o nome for escolhido — o cursor pode ter
   * andado, e procurar o último `@` do texto acertaria o errado em
   * quem cita duas pessoas na mesma frase.
   */
  const [citacao, setCitacao] = useState<{ termo: string; inicio: number } | null>(null);
  const [escolhido, setEscolhido] = useState(0);

  const candidatos =
    citacao && pessoas.length > 0
      ? pessoas.filter((p) => casaComNome(p.nome, citacao.termo)).slice(0, NOMES_NA_LISTA)
      : [];

  /**
   * Abre a lista quando o cursor está logo depois de um `@` seguido de
   * letras — e só então.
   *
   * O `@` precisa estar no COMEÇO DA PALAVRA (início do texto ou
   * depois de um espaço): sem isso, `malachias@hotmail.com` abriria a
   * lista de colegas no meio de um e-mail.
   */
  const conferirCitacao = (texto: string, cursor: number) => {
    if (pessoas.length === 0) return setCitacao(null);

    const ate = texto.slice(0, cursor);
    const achado = ate.match(/(^|\s)@([^\s@[\]()]{0,30})$/);

    if (!achado) return setCitacao(null);

    setCitacao({ termo: achado[2], inicio: cursor - achado[2].length - 1 });
    setEscolhido(0);
  };

  /** Troca o `@termo` pela marcação com o nome e o id. */
  const citar = (pessoa: PessoaCitavel) => {
    if (!citacao) return;

    const fim = selecaoAgora().fim || citacao.inicio + citacao.termo.length + 1;
    const marcacao = `${marcacaoDeCitacao(pessoa.nome, pessoa.id)} `;

    aoMudar(valor.slice(0, citacao.inicio) + marcacao + valor.slice(fim));
    setCitacao(null);
    devolverCursor(
      citacao.inicio + marcacao.length,
      citacao.inicio + marcacao.length
    );
  };

  /**
   * OS ENDEREÇOS DAS IMAGENS, para o campo mostrá-las.
   *
   * O caminho no balde não abre sozinho: o Supabase exige um endereço
   * assinado, e assinar é uma ida à rede. Sem isto, apareceria a
   * legenda no lugar da foto — e quem está escrevendo um procedimento
   * não teria como conferir se inseriu o print certo.
   */
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    const faltando = imagensCitadas(valor).filter((c) => !enderecos[c]);
    if (faltando.length === 0) return;

    Promise.all(faltando.map((c) => abrirDocumento(c).then((url) => [c, url] as const)))
      .then((pares) => {
        if (!vivo) return;
        setEnderecos((atual) => {
          const novo = { ...atual };
          for (const [caminho, url] of pares) if (url) novo[caminho] = url;
          return novo;
        });
      })
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [valor, enderecos]);

  /**
   * Sobe a imagem e INSERE ONDE O CURSOR ESTAVA.
   *
   * A seleção é lida ANTES de subir: o envio demora, e nesse tempo o
   * campo perdeu o foco — inserir depois, pela seleção do momento,
   * jogaria a imagem para o começo do texto.
   */
  const inserirImagem = async (arquivo: File) => {
    if (!aoSubirImagem) return;

    const onde = selecaoAgora().fim || valor.length;

    setSubindo(true);
    const caminho = await aoSubirImagem(arquivo);
    setSubindo(false);

    if (!caminho) return;

    /**
     * A descrição sai do nome do arquivo, sem a extensão.
     *
     * É o `alt` da imagem: o que quem não a enxerga lê, e o que aparece
     * se ela não carregar. "print-caixa" diz alguma coisa;
     * "IMG_20260925_103344.jpg" não diz nada, mas ainda é melhor do que
     * campo vazio.
     */
    const descricao = arquivo.name.replace(/\.[^.]+$/, '');

    const quebra = String.fromCharCode(10);
    const marcacao = quebra + quebra + '![' + descricao + '](' + caminho + ')' + quebra;

    aoMudar(valor.slice(0, onde) + marcacao + valor.slice(onde));
  };

  /**
   * Aplica e DEVOLVE O CURSOR para onde ele estava.
   *
   * Sem isso, cada clique na barra manda o cursor para o fim do texto —
   * e quem está formatando o meio de um parágrafo perde o lugar a cada
   * palavra em negrito.
   */
  const usar = (ferramenta: Ferramenta) => {
    const { inicio, fim } = selecaoAgora();
    const resultado = ferramenta.aplicar(valor, inicio, fim);

    aoMudar(resultado.texto);
    devolverCursor(resultado.inicio, resultado.fim);
  };

  const aoTeclar = (evento: React.KeyboardEvent<HTMLElement>) => {
    /**
     * A LISTA DE NOMES RESPONDE PRIMEIRO.
     *
     * Enquanto ela está aberta, Enter escolhe o nome em vez de quebrar
     * a linha, e as setas andam pela lista em vez de andar pelo texto.
     * Fora isso, cada tecla volta a ser o que sempre foi.
     */
    if (citacao && candidatos.length > 0) {
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        evento.preventDefault();
        const passo = evento.key === 'ArrowDown' ? 1 : candidatos.length - 1;
        setEscolhido((i) => (i + passo) % candidatos.length);
        return;
      }

      if (evento.key === 'Enter' || evento.key === 'Tab') {
        evento.preventDefault();
        citar(candidatos[escolhido]);
        return;
      }

      if (evento.key === 'Escape') {
        evento.preventDefault();
        setCitacao(null);
        return;
      }
    }

    if (!evento.ctrlKey && !evento.metaKey) return;

    const ferramenta = FERRAMENTAS.find((f) => f.atalho === evento.key.toLowerCase());
    if (!ferramenta) return;

    evento.preventDefault();
    usar(ferramenta);
  };

  return (
    <div
      className={`rounded-xl border border-[var(--c-borda)] overflow-hidden bg-[var(--c-canvas)] flex flex-col ${
        alturaCheia ? 'flex-1 min-h-0' : ''
      }`}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--c-borda)] bg-[var(--c-superficie)] flex-wrap">
        {FERRAMENTAS.map((f) => (
          <React.Fragment key={f.chave}>
            {SEPARAR_ANTES.has(f.chave) && (
              <span className="w-px h-5 bg-[var(--c-borda)] mx-0.5 shrink-0" />
            )}
          <button
            type="button"
            title={f.titulo}
            aria-label={f.titulo}
            /**
             * `onMouseDown` com `preventDefault`, e não `onClick`.
             *
             * O clique tira o foco do campo antes de agir, e aí a
             * seleção se perde — o negrito seria aplicado no lugar
             * errado, ou em nada.
             */
            onMouseDown={(e) => {
              e.preventDefault();
              usar(f);
            }}
            className="p-1.5 rounded-lg text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)] disabled:opacity-30 transition-colors"
          >
            {f.icone}
          </button>
          </React.Fragment>
        ))}

        {/*
          A IMAGEM É UM <label>, e não um botão.

          O seletor de arquivo do navegador só abre a partir de um
          `<input type="file">` — um botão que o acionasse por código
          seria bloqueado em parte dos celulares.

          Só aparece quando há para onde subir: sem `aoSubirImagem`, o
          botão inseriria uma marcação apontando para lugar nenhum.
        */}
        {aoSubirImagem && (
          <label
            title={subindo ? 'Enviando...' : 'Inserir imagem'}
            className={`p-1.5 rounded-lg text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)] transition-colors ${
              subindo ? 'opacity-30' : 'cursor-pointer'
            }`}
          >
            {subindo ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImagePlus className="w-3.5 h-3.5" />
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={subindo}
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) inserirImagem(arquivo);
                // Limpa para a MESMA imagem poder ser escolhida de novo
                e.target.value = '';
              }}
            />
          </label>
        )}

        <div className="flex-1" />

        {/*
          A SAÍDA, e não um modo de igual importância.

          O campo ao vivo é o normal. Este botão existe porque campo
          editável é onde os navegadores mais divergem — se um celular
          do balcão se comportar mal, quem está escrevendo precisa de um
          caminho que sempre funcionou. Os dois gravam a mesma string.
        */}
        <button
          type="button"
          title={
            modo === 'vivo'
              ? 'Ver a marcação do texto'
              : 'Voltar ao texto formatado'
          }
          onClick={() => setModo((m) => (m === 'vivo' ? 'marcacao' : 'vivo'))}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
            modo === 'marcacao'
              ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
              : 'text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]'
          }`}
        >
          {modo === 'marcacao' ? (
            <>
              <Eye className="w-3 h-3" /> Formatado
            </>
          ) : (
            <>
              <Pencil className="w-3 h-3" /> Marcação
            </>
          )}
        </button>
      </div>

      <div className={`relative flex flex-col ${alturaCheia ? 'flex-1 min-h-0' : ''}`}>
        {modo === 'vivo' ? (
          <SuperficieAoVivo
            campoRef={campoVivo}
            valor={valor}
            aoMudar={(texto) => {
              aoMudar(texto);
              /* O `@` acompanha a digitação também aqui: a lista de
                 nomes não pode existir só num dos dois campos */
              conferirCitacao(texto, campoVivo.current?.selecao().fim ?? texto.length);
            }}
            imagens={enderecos}
            placeholder={placeholder}
            alturaCheia={alturaCheia}
            linhas={linhas}
            aoTeclar={aoTeclar}
          />
        ) : (
          <textarea
            ref={campo}
            value={valor}
            onChange={(e) => {
              aoMudar(e.target.value);
              conferirCitacao(e.target.value, e.target.selectionEnd);
            }}
            /**
             * O clique e as setas também conferem: mover o cursor para
             * dentro de um `@` já escrito reabre a lista, e sair dele
             * fecha. Sem isto, a lista ficaria aberta sobre o texto
             * depois de o cursor ter ido embora.
             */
            onClick={(e) => conferirCitacao(valor, e.currentTarget.selectionEnd)}
            onKeyUp={(e) => conferirCitacao(valor, e.currentTarget.selectionEnd)}
            onBlur={() => setCitacao(null)}
            onKeyDown={aoTeclar}
            rows={alturaCheia ? undefined : linhas}
            placeholder={placeholder}
            className={`w-full px-3 py-2.5 text-sm bg-transparent text-[var(--c-texto)] focus:outline-none placeholder:text-[var(--c-texto-3)] leading-relaxed ${
              alturaCheia ? 'flex-1 min-h-0 resize-none' : 'resize-y'
            }`}
          />
        )}

        {/*
          A LISTA DE NOMES fica FORA da escolha de campo: ela serve aos
          dois. Duplicá-la em cada um é como a lista de setores divergiu
          entre duas telas.
        */}
        {candidatos.length > 0 && (
            <div className="absolute bottom-2 left-2 right-2 sm:right-auto sm:w-72 z-20 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-xl overflow-hidden">
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--c-texto-3)] border-b border-[var(--c-borda)]">
                Citar colega
              </p>
              {candidatos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  /* `onMouseDown` com `preventDefault`: o clique comum
                     tiraria o foco do campo antes de agir, e a posição
                     do `@` se perderia junto */
                  onMouseDown={(e) => {
                    e.preventDefault();
                    citar(p);
                  }}
                  onMouseEnter={() => setEscolhido(i)}
                  className={`w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors ${
                    i === escolhido
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]'
                  }`}
                >
                  <span className="text-sm font-semibold truncate">{p.nome}</span>
                  <span
                    className={`text-[11px] truncate ${
                      i === escolhido ? 'opacity-80' : 'text-[var(--c-texto-3)]'
                    }`}
                  >
                    {[p.cargo, p.loja].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** O texto formatado, como ele aparece para quem lê. */
export const TextoFormatado: React.FC<{
  texto: string;
  className?: string;
  /** Caminho do balde -> endereço assinado. Ver `imagensCitadas`. */
  imagens?: Record<string, string>;
}> = ({ texto, className = '', imagens = {} }) => (
  <div
    className={`texto-rico ${className}`}
    dangerouslySetInnerHTML={{ __html: paraHtml(texto, imagens) }}
  />
);
