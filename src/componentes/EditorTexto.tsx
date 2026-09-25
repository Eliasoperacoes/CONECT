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
import React, { useRef, useState } from 'react';
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
} from 'lucide-react';
import { paraHtml, aplicarMarcacao, aplicarPrefixo } from '../servicos/textoRico';

interface Props {
  valor: string;
  aoMudar: (texto: string) => void;
  placeholder?: string;
  linhas?: number;
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

export const EditorTexto: React.FC<Props> = ({
  valor,
  aoMudar,
  placeholder,
  linhas = 8,
}) => {
  const campo = useRef<HTMLTextAreaElement>(null);
  const [vendo, setVendo] = useState(false);

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
    <div className="rounded-xl border border-[var(--c-borda)] overflow-hidden bg-[var(--c-canvas)]">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--c-borda)] bg-[var(--c-superficie)] flex-wrap">
        {FERRAMENTAS.map((f) => (
          <button
            key={f.chave}
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
        ))}

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
          className="px-3 py-2.5 text-sm text-[var(--c-texto)] texto-rico overflow-y-auto"
          style={{ minHeight: `${linhas * 1.5}rem` }}
          /**
           * O HTML vem de `paraHtml`, que escapa TODO o texto antes de
           * aplicar qualquer marcação. Depois disso não há um `<` no
           * conteúdo, e as tags que saem de lá são só as que ele mesmo
           * escreveu.
           */
          dangerouslySetInnerHTML={{
            __html:
              paraHtml(valor) ||
              '<p class="tr-p" style="opacity:.5">Nada escrito ainda.</p>',
          }}
        />
      ) : (
        <textarea
          ref={campo}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={aoTeclar}
          rows={linhas}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 text-sm bg-transparent text-[var(--c-texto)] resize-y focus:outline-none placeholder:text-[var(--c-texto-3)]"
        />
      )}
    </div>
  );
};

/** O texto formatado, como ele aparece para quem lê. */
export const TextoFormatado: React.FC<{ texto: string; className?: string }> = ({
  texto,
  className = '',
}) => (
  <div
    className={`texto-rico ${className}`}
    dangerouslySetInnerHTML={{ __html: paraHtml(texto) }}
  />
);
