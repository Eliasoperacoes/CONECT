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
} from '../servicos/textoRico';
import { abrirDocumento } from '../servicos/rh';

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
}

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
}) => {
  const campo = useRef<HTMLTextAreaElement>(null);
  const [vendo, setVendo] = useState(false);
  const [subindo, setSubindo] = useState(false);

  /**
   * OS ENDEREÇOS DAS IMAGENS, para a prévia mostrá-las.
   *
   * O caminho no balde não abre sozinho: o Supabase exige um
   * endereço assinado, e assinar é uma ida à rede. Sem isto, a aba
   * "Como vai ficar" mostraria a legenda no lugar da foto — e quem
   * está escrevendo não teria como conferir se inseriu a imagem
   * certa.
   */
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!vendo) return;

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
  }, [vendo, valor, enderecos]);

  /**
   * Sobe a imagem e INSERE ONDE O CURSOR ESTAVA.
   *
   * A seleção é lida ANTES de subir: o envio demora, e nesse tempo o
   * campo perdeu o foco — inserir depois, pela seleção do momento,
   * jogaria a imagem para o começo do texto.
   */
  const inserirImagem = async (arquivo: File) => {
    if (!aoSubirImagem) return;

    const alvo = campo.current;
    const onde = alvo ? alvo.selectionEnd : valor.length;

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
   * Sem o `setSelectionRange`, cada clique na barra manda o cursor para
   * o fim do texto — e quem está formatando o meio de um parágrafo
   * perde o lugar a cada palavra em negrito.
   *
   * O `setTimeout` de zero espera o React redesenhar: mexer na seleção
   * antes disso é mexer no texto antigo.
   */
  const usar = (ferramenta: Ferramenta) => {
    const alvo = campo.current;
    if (!alvo) return;

    const resultado = ferramenta.aplicar(valor, alvo.selectionStart, alvo.selectionEnd);
    aoMudar(resultado.texto);

    setTimeout(() => {
      alvo.focus();
      alvo.setSelectionRange(resultado.inicio, resultado.fim);
    }, 0);
  };

  const aoTeclar = (evento: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
            disabled={vendo}
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
              vendo || subindo ? 'opacity-30' : 'cursor-pointer'
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
              disabled={vendo || subindo}
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

        <button
          type="button"
          onClick={() => setVendo((v) => !v)}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
            vendo
              ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
              : 'text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]'
          }`}
        >
          {vendo ? (
            <>
              <Pencil className="w-3 h-3" /> Escrever
            </>
          ) : (
            <>
              <Eye className="w-3 h-3" /> Como vai ficar
            </>
          )}
        </button>
      </div>

      {vendo ? (
        <div
          className={`px-3 py-2.5 text-sm text-[var(--c-texto)] texto-rico overflow-y-auto ${
            alturaCheia ? 'flex-1 min-h-0' : ''
          }`}
          style={alturaCheia ? undefined : { minHeight: `${linhas * 1.5}rem` }}
          /**
           * O HTML vem de `paraHtml`, que escapa TODO o texto antes de
           * aplicar qualquer marcação. Depois disso não há um `<` no
           * conteúdo, e as tags que saem de lá são só as que ele mesmo
           * escreveu.
           */
          dangerouslySetInnerHTML={{
            __html:
              paraHtml(valor, enderecos) ||
              '<p class="tr-p" style="opacity:.5">Nada escrito ainda.</p>',
          }}
        />
      ) : (
        <textarea
          ref={campo}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={aoTeclar}
          rows={alturaCheia ? undefined : linhas}
          placeholder={placeholder}
          className={`w-full px-3 py-2.5 text-sm bg-transparent text-[var(--c-texto)] focus:outline-none placeholder:text-[var(--c-texto-3)] leading-relaxed ${
            alturaCheia ? 'flex-1 min-h-0 resize-none' : 'resize-y'
          }`}
        />
      )}
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
