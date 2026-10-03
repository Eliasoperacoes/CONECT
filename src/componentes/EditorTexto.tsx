/**
 * O EDITOR DA CENTRAL — CONECTA / Malachias Autopeças
 *
 * A Central só aceitava texto corrido: um comunicado de inventário com
 * cinco passos saía como um parágrafo único, e quem lia no balcão não
 * achava o horário no meio dele.
 *
 * QUEM ESCREVE NÃO PRECISA SABER MARCAÇÃO NENHUMA. A barra escreve por
 * ela, e o campo já mostra o texto formatado. Quem conhece Markdown
 * digita direto, e os atalhos (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+K) funcionam
 * como em qualquer lugar.
 *
 * A ESCOLHA DE GUARDAR TEXTO, e não HTML, está explicada em
 * `textoRico.ts`: é o que mantém as publicações antigas válidas e a
 * busca achando palavra que está DENTRO do documento.
 *
 * ===================================================================
 * A PÁGINA (Elias, 03/10/2026: "muito básico")
 * ===================================================================
 *
 * Era uma faixa de quinze ícones de 14px, sem rótulo, sobre uma área
 * cinza que parecia um bloco de notas. Agora:
 *
 *   · a área de escrever é uma FOLHA, na largura e na fonte da leitura,
 *     com o título dentro dela: o que se escreve é o que se publica;
 *   · a barra fica fixa no alto, em GRUPOS — estilo do parágrafo,
 *     ênfase e cor, alinhamento e listas, blocos, inserir;
 *   · link e botão pedem texto e endereço numa janelinha, em vez de
 *     inserir `[texto](https://)` para a pessoa consertar;
 *   · imagem entra pelo botão, colada (Ctrl+V de um print) ou
 *     arrastada, e abre o painel de tamanho, alinhamento e legenda —
 *     que também abre ao clicar numa imagem já no texto.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading,
  ChevronDown,
  List,
  ListOrdered,
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
  Palette,
  AlignCenter,
  MessageSquareWarning,
  MousePointerClick,
  Smile,
  PanelTop,
  X,
  Trash2,
} from 'lucide-react';
import {
  paraHtml,
  aplicarMarcacao,
  aplicarPrefixo,
  imagensCitadas,
  marcacaoDeCitacao,
  casaComNome,
  definirEstiloDaLinha,
  alternarCentro,
  aplicarDestaque,
  enderecoSeguro,
  lerImagem,
  montarImagem,
  CORES_DO_TEXTO,
  DESTAQUES,
  TAMANHOS_DE_IMAGEM,
  ALINHAMENTOS_DE_IMAGEM,
  type EstiloDaLinha,
  type TipoDeDestaque,
  type TamanhoDeImagem,
  type AlinhamentoDeImagem,
  type CorDoTexto,
} from '../servicos/textoRico';
import { abrirDocumento } from '../servicos/rh';
import { SuperficieAoVivo, CampoAoVivo } from './SuperficieAoVivo';
import { Avatar } from './Avatar';

interface Props {
  valor: string;
  aoMudar: (texto: string) => void;
  placeholder?: string;
  /**
   * O que vai no alto da folha, antes do texto — o título da publicação.
   * Dentro da folha, e não fora: é assim que quem lê o verá.
   */
  cabecalho?: React.ReactNode;
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
  /** A foto, para a lista de citação mostrar o rosto e não só o nome. */
  foto?: string;
}

/**
 * QUANTOS NOMES A LISTA MOSTRA.
 *
 * São 89 colaboradores. Mostrar todos cobriria a tela inteira e
 * tiraria de vista justamente o texto que está sendo escrito — quem
 * não achou em seis nomes digita mais uma letra.
 */
const NOMES_NA_LISTA = 6;

type Transformacao = (
  texto: string,
  inicio: number,
  fim: number
) => { texto: string; inicio: number; fim: number };

/** Os atalhos do teclado. Link (Ctrl+K) abre a janelinha, à parte. */
const ATALHOS: Record<string, Transformacao> = {
  b: (t, i, f) => aplicarMarcacao(t, i, f, '**', '**', 'negrito'),
  i: (t, i, f) => aplicarMarcacao(t, i, f, '*', '*', 'itálico'),
  u: (t, i, f) => aplicarMarcacao(t, i, f, '++', '++', 'sublinhado'),
};

const ESTILOS: { estilo: EstiloDaLinha; rotulo: string; classe: string }[] = [
  { estilo: 'h1', rotulo: 'Título 1', classe: 'text-lg font-extrabold' },
  { estilo: 'h2', rotulo: 'Título 2', classe: 'text-base font-bold' },
  { estilo: 'h3', rotulo: 'Título 3', classe: 'text-sm font-bold' },
  { estilo: 'texto', rotulo: 'Texto normal', classe: 'text-sm' },
  { estilo: 'pequeno', rotulo: 'Texto pequeno', classe: 'text-xs text-[var(--c-texto-3)]' },
];

const NOME_DA_COR: Record<CorDoTexto, string> = {
  azul: 'Azul',
  vermelho: 'Vermelho',
  verde: 'Verde',
  laranja: 'Laranja',
  cinza: 'Cinza',
};

/**
 * OS EMOJIS DE TRABALHO. Poucos e escolhidos: o teclado do celular já
 * tem todos, e uma grade de mil carinhas no computador é procurar.
 */
const EMOJIS = [
  '👍', '👏', '🙏', '🤝', '✅', '❌', '⚠️', '❗', '📢', '📌', '📅', '⏰',
  '📦', '🚚', '🔧', '🛠️', '🏪', '💰', '📄', '📞', '💡', '⭐', '🎉', '🔥',
  '🙂', '😊', '😉', '➡️',
];

const ROTULO_TAMANHO: Record<TamanhoDeImagem, string> = {
  pequena: 'Pequena',
  media: 'Média',
  inteira: 'Largura toda',
};
const ROTULO_ALINHAMENTO: Record<AlinhamentoDeImagem, string> = {
  esquerda: 'Esquerda',
  centro: 'Centro',
  direita: 'Direita',
};

const REGRA_DE_IMAGEM = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Um bloco (imagem, botão, tabela) numa linha só dele, com uma linha em
 * branco antes e depois — sem dobrar as que já existem. Devolve o texto
 * novo, onde o bloco começa e onde o cursor fica.
 */
export const blocoNoTexto = (base: string, onde: number, bloco: string) => {
  const antes = base.slice(0, onde);
  const depois = base.slice(onde);
  const abre = antes === '' || antes.endsWith('\n\n') ? '' : antes.endsWith('\n') ? '\n' : '\n\n';
  const fecha = depois === '' ? '' : depois.startsWith('\n\n') ? '' : depois.startsWith('\n') ? '\n' : '\n\n';
  const inicio = antes.length + abre.length;
  return { texto: antes + abre + bloco + fecha + depois, inicio, cursor: inicio + bloco.length };
};

/** Um botão da barra. `onMouseDown` + `preventDefault`: ver `BotaoDaBarra`. */
const BotaoDaBarra: React.FC<{
  titulo: string;
  aoAcionar: () => void;
  ativo?: boolean;
  desligado?: boolean;
  children: React.ReactNode;
}> = ({ titulo, aoAcionar, ativo, desligado, children }) => (
  <button
    type="button"
    title={titulo}
    aria-label={titulo}
    disabled={desligado}
    /**
     * `onMouseDown` com `preventDefault`, e não `onClick`.
     *
     * O clique tira o foco do campo antes de agir, e aí a seleção se
     * perde — o negrito seria aplicado no lugar errado, ou em nada.
     */
    onMouseDown={(e) => {
      e.preventDefault();
      aoAcionar();
    }}
    className={`h-8 min-w-8 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors disabled:opacity-30 ${
      ativo
        ? 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]'
        : 'text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)]'
    }`}
  >
    {children}
  </button>
);

const Divisoria = () => <span className="w-px h-6 bg-[var(--c-borda)] mx-1 shrink-0" />;

type Menu = 'estilo' | 'cor' | 'caixa' | 'emoji';

export const EditorTexto: React.FC<Props> = ({
  valor,
  aoMudar,
  placeholder,
  cabecalho,
  aoSubirImagem,
  pessoas = [],
}) => {
  const campo = useRef<HTMLTextAreaElement>(null);
  const campoVivo = useRef<CampoAoVivo>(null);
  const folha = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const [subindo, setSubindo] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);

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

  // Clicar fora fecha o menu aberto da barra
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (!barra.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [menu]);

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
   * Aplica e DEVOLVE O CURSOR para onde ele estava.
   *
   * Sem isso, cada clique na barra manda o cursor para o fim do texto —
   * e quem está formatando o meio de um parágrafo perde o lugar a cada
   * palavra em negrito.
   */
  const usar = (transformar: Transformacao) => {
    const { inicio, fim } = selecaoAgora();
    const resultado = transformar(valor, inicio, fim);
    setMenu(null);
    aoMudar(resultado.texto);
    devolverCursor(resultado.inicio, resultado.fim);
  };

  /** Insere um bloco inteiro (botão, tabela, imagem) em linhas próprias. */
  const inserirBloco = (bloco: string, onde = selecaoAgora().fim, base = valor) => {
    const resultado = blocoNoTexto(base, onde, bloco);
    aoMudar(resultado.texto);
    devolverCursor(resultado.cursor, resultado.cursor);
    return resultado;
  };

  // ------------------------------------------------------------------
  // LINK E BOTÃO: a janelinha de texto e endereço
  // ------------------------------------------------------------------
  const [dialogo, setDialogo] = useState<{
    tipo: 'link' | 'botao';
    texto: string;
    endereco: string;
    inicio: number;
    fim: number;
    erro?: string;
  } | null>(null);

  const abrirDialogo = (tipo: 'link' | 'botao') => {
    const { inicio, fim } = selecaoAgora();
    setMenu(null);
    setDialogo({ tipo, texto: valor.slice(inicio, fim), endereco: '', inicio, fim });
  };

  const confirmarDialogo = () => {
    if (!dialogo) return;
    const bruto = dialogo.endereco.trim();
    // "malachias.com.br" sem o https:// é o que quase todo mundo digita
    const endereco = enderecoSeguro(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
    const texto = dialogo.texto.trim() || (dialogo.tipo === 'botao' ? 'Abrir' : bruto);
    if (!bruto || !endereco) {
      return setDialogo({ ...dialogo, erro: 'Informe um endereço, como malachias.com.br/formulario.' });
    }
    // O texto não pode fechar o colchete antes da hora
    const rotulo = texto.replace(/[[\]\n]/g, ' ');
    setDialogo(null);
    if (dialogo.tipo === 'link') {
      const marcacao = `[${rotulo}](${endereco})`;
      aoMudar(valor.slice(0, dialogo.inicio) + marcacao + valor.slice(dialogo.fim));
      devolverCursor(dialogo.inicio + marcacao.length, dialogo.inicio + marcacao.length);
    } else {
      // O botão toma o lugar do que estava selecionado, numa linha própria
      inserirBloco(`[[${rotulo}]](${endereco})`, dialogo.inicio, valor.slice(0, dialogo.inicio) + valor.slice(dialogo.fim));
    }
  };

  // ------------------------------------------------------------------
  // A CITAÇÃO DE COLEGA (@)
  // ------------------------------------------------------------------

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
    devolverCursor(citacao.inicio + marcacao.length, citacao.inicio + marcacao.length);
  };

  // ------------------------------------------------------------------
  // AS IMAGENS
  // ------------------------------------------------------------------

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
   * O PAINEL DA IMAGEM: tamanho, alinhamento e legenda. Abre ao inserir
   * e ao clicar numa imagem do texto. Guarda ONDE a marcação está, para
   * trocar só ela.
   */
  const [painel, setPainel] = useState<{
    inicio: number;
    fim: number;
    descricao: string;
    caminho: string;
    tamanho: TamanhoDeImagem;
    alinhamento: AlinhamentoDeImagem;
    legenda: string;
    capa: boolean;
  } | null>(null);

  /** A N-ésima imagem do texto, na ordem em que aparece. */
  const abrirPainelDaImagem = (texto: string, indice: number) => {
    const achada = [...texto.matchAll(REGRA_DE_IMAGEM)][indice];
    if (!achada || achada.index === undefined) return;
    const opcoes = lerImagem(achada[2]);
    setPainel({
      inicio: achada.index,
      fim: achada.index + achada[0].length,
      descricao: achada[1],
      caminho: opcoes.caminho,
      tamanho: opcoes.tamanho || 'inteira',
      alinhamento: opcoes.alinhamento || 'centro',
      legenda: opcoes.legenda,
      capa: opcoes.capa,
    });
  };

  const aplicarPainel = () => {
    if (!painel) return;
    const marcacao = montarImagem(painel.descricao, painel);
    aoMudar(valor.slice(0, painel.inicio) + marcacao + valor.slice(painel.fim));
    setPainel(null);
  };

  const removerDoPainel = () => {
    if (!painel) return;
    aoMudar((valor.slice(0, painel.inicio) + valor.slice(painel.fim)).replace(/\n{3,}/g, '\n\n'));
    setPainel(null);
  };

  /**
   * Sobe a imagem e INSERE ONDE O CURSOR ESTAVA — ou no alto, se é a capa.
   *
   * A seleção é lida ANTES de subir: o envio demora, e nesse tempo o
   * campo perdeu o foco — inserir depois, pela seleção do momento,
   * jogaria a imagem para o começo do texto.
   */
  const inserirImagem = async (arquivo: File, comoCapa = false) => {
    if (!aoSubirImagem || !arquivo.type.startsWith('image/')) return;

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
     * campo vazio. Um print colado não tem nome: vira "imagem".
     */
    const descricao = arquivo.name && arquivo.name !== 'image.png' ? arquivo.name.replace(/\.[^.]+$/, '') : 'imagem';

    if (comoCapa) {
      // Uma capa só: a nova toma o lugar da anterior, sempre no alto
      const ehCapa = (linha: string) => {
        const m = linha.trim().match(/^!\[[^\]]*\]\(([^)]+)\)$/);
        return !!m && lerImagem(m[1]).capa;
      };
      const semCapaAntiga = valor.split('\n').filter((l) => !ehCapa(l)).join('\n').replace(/^\n+/, '');
      const capa = montarImagem(descricao, { caminho, capa: true });
      aoMudar(semCapaAntiga ? `${capa}\n\n${semCapaAntiga}` : capa);
      return;
    }

    const marcacao = montarImagem(descricao, { caminho, tamanho: 'inteira', alinhamento: 'centro' });
    const inserido = inserirBloco(marcacao, onde);
    // Recém-inserida: o painel abre nela, para escolher tamanho e legenda
    const indice = [...inserido.texto.slice(0, inserido.inicio).matchAll(REGRA_DE_IMAGEM)].length;
    abrirPainelDaImagem(inserido.texto, indice);
  };

  // Clicar numa imagem dentro da folha reabre o painel dela
  const aoClicarNaFolha = (e: React.MouseEvent<HTMLDivElement>) => {
    const alvo = e.target as HTMLElement;
    if (!alvo.matches('.tr-vivo .tr-imagem')) return;
    const todas = [...(folha.current?.querySelectorAll('.tr-vivo .tr-imagem, .tr-vivo .tr-imagem-faltando') || [])];
    abrirPainelDaImagem(valor, todas.indexOf(alvo));
  };

  // Arrastar uma foto para dentro da folha
  const [arrastando, setArrastando] = useState(false);
  const temImagem = (e: React.DragEvent) => [...e.dataTransfer.items].some((i) => i.type.startsWith('image/'));

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

    const tecla = evento.key.toLowerCase();
    if (tecla === 'k') {
      evento.preventDefault();
      abrirDialogo('link');
      return;
    }
    const atalho = ATALHOS[tecla];
    if (!atalho) return;

    evento.preventDefault();
    usar(atalho);
  };

  // ------------------------------------------------------------------
  // O DESENHO
  // ------------------------------------------------------------------
  const menuAberto = (qual: Menu) => menu === qual;
  const alternarMenu = (qual: Menu) => setMenu((atual) => (atual === qual ? null : qual));
  const caixaDoMenu =
    'absolute top-full left-0 mt-1 z-30 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-3)] p-1';

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-[var(--c-canvas)]"
      onDragOver={(e) => {
        if (!aoSubirImagem || !temImagem(e)) return;
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false);
      }}
      onDrop={(e) => {
        setArrastando(false);
        const arquivo = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
        if (!arquivo) return;
        e.preventDefault();
        inserirImagem(arquivo);
      }}
    >
      {/* A BARRA, fixa no alto, em grupos */}
      <div
        ref={barra}
        id="barra-do-editor"
        className="sticky top-0 z-20 shrink-0 border-b border-[var(--c-borda)] bg-[var(--c-superficie)]"
      >
        <div className="flex items-center gap-0.5 px-2 sm:px-4 py-1.5 flex-wrap">
          {/* ESTILO DO PARÁGRAFO */}
          <div className="relative">
            <BotaoDaBarra titulo="Estilo do parágrafo" aoAcionar={() => alternarMenu('estilo')} ativo={menuAberto('estilo')}>
              <Heading className="w-4 h-4" />
              <span className="text-xs font-semibold hidden xl:inline">Estilo</span>
              <ChevronDown className="w-3 h-3" />
            </BotaoDaBarra>
            {menuAberto('estilo') && (
              <div className={`${caixaDoMenu} w-48`} role="menu">
                {ESTILOS.map((e) => (
                  <button
                    key={e.estilo}
                    type="button"
                    role="menuitem"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      usar((t, i, f) => definirEstiloDaLinha(t, i, f, e.estilo));
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--c-superficie-2)] text-[var(--c-texto)] ${e.classe}`}
                  >
                    {e.rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Divisoria />

          {/* ÊNFASE E COR */}
          <BotaoDaBarra titulo="Negrito (Ctrl+B)" aoAcionar={() => usar(ATALHOS.b)}>
            <Bold className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Itálico (Ctrl+I)" aoAcionar={() => usar(ATALHOS.i)}>
            <Italic className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Sublinhado (Ctrl+U)" aoAcionar={() => usar(ATALHOS.u)}>
            <Underline className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Riscado" aoAcionar={() => usar((t, i, f) => aplicarMarcacao(t, i, f, '~~', '~~', 'riscado'))}>
            <Strikethrough className="w-4 h-4" />
          </BotaoDaBarra>
          <div className="relative">
            <BotaoDaBarra titulo="Cor do texto" aoAcionar={() => alternarMenu('cor')} ativo={menuAberto('cor')}>
              <Palette className="w-4 h-4" />
              <ChevronDown className="w-3 h-3" />
            </BotaoDaBarra>
            {menuAberto('cor') && (
              <div className={`${caixaDoMenu} w-44`} role="menu">
                {CORES_DO_TEXTO.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    role="menuitem"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      usar((t, i, f) => aplicarMarcacao(t, i, f, `{${cor}}`, '{/}', 'texto'));
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--c-superficie-2)] flex items-center gap-2.5 text-sm"
                  >
                    <span className={`w-4 h-4 rounded-full bg-current tr-cor-${cor}`} />
                    <span className={`tr-cor-${cor} font-semibold`}>{NOME_DA_COR[cor]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <BotaoDaBarra titulo="Marca-texto" aoAcionar={() => usar((t, i, f) => aplicarMarcacao(t, i, f, '==', '==', 'em destaque'))}>
            <Highlighter className="w-4 h-4" />
          </BotaoDaBarra>

          <Divisoria />

          {/* ALINHAMENTO E LISTAS */}
          <BotaoDaBarra titulo="Centralizar" aoAcionar={() => usar(alternarCentro)}>
            <AlignCenter className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Lista" aoAcionar={() => usar((t, i, f) => aplicarPrefixo(t, i, f, '- '))}>
            <List className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Lista numerada" aoAcionar={() => usar((t, i, f) => aplicarPrefixo(t, i, f, '1. '))}>
            <ListOrdered className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Itens para conferir" aoAcionar={() => usar((t, i, f) => aplicarPrefixo(t, i, f, '- [ ] '))}>
            <CheckSquare className="w-4 h-4" />
          </BotaoDaBarra>

          <Divisoria />

          {/* BLOCOS */}
          <div className="relative">
            <BotaoDaBarra titulo="Caixa de destaque" aoAcionar={() => alternarMenu('caixa')} ativo={menuAberto('caixa')}>
              <MessageSquareWarning className="w-4 h-4" />
              <span className="text-xs font-semibold hidden xl:inline">Caixa</span>
              <ChevronDown className="w-3 h-3" />
            </BotaoDaBarra>
            {menuAberto('caixa') && (
              <div className={`${caixaDoMenu} w-56`} role="menu">
                {(Object.keys(DESTAQUES) as TipoDeDestaque[]).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    role="menuitem"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      usar((t, i, f) => aplicarDestaque(t, i, f, tipo));
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--c-superficie-2)]"
                  >
                    <span className={`texto-rico block`}>
                      <span className={`tr-destaque tr-destaque-${tipo.toLowerCase()} block !my-0 !py-1.5 text-xs`}>
                        <span className="tr-destaque-titulo !mb-0">{DESTAQUES[tipo]}</span>
                      </span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    usar((t, i, f) => aplicarPrefixo(t, i, f, '> '));
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--c-superficie-2)] text-sm italic text-[var(--c-texto-2)] border-l-[3px] border-[var(--c-acento)] mt-1"
                >
                  Citação
                </button>
              </div>
            )}
          </div>
          <BotaoDaBarra titulo="Botão de ação (um link em forma de botão)" aoAcionar={() => abrirDialogo('botao')}>
            <MousePointerClick className="w-4 h-4" />
            <span className="text-xs font-semibold hidden xl:inline">Botão</span>
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Link (Ctrl+K)" aoAcionar={() => abrirDialogo('link')}>
            <Link2 className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra
            titulo="Tabela"
            aoAcionar={() => {
              setMenu(null);
              /**
               * Insere uma tabela PRONTA, com cabeçalho e duas linhas.
               *
               * Um botão que só escrevesse `|` deixaria quem não conhece a
               * marcação sem saber o que fazer com ele — e a linha de
               * traços, que é o que separa o cabeçalho, ninguém adivinha.
               */
              inserirBloco('| Coluna | Coluna |\n|---|---|\n| valor | valor |\n| valor | valor |');
            }}
          >
            <Table className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Linha separadora" aoAcionar={() => inserirBloco('---')}>
            <Minus className="w-4 h-4" />
          </BotaoDaBarra>
          <BotaoDaBarra titulo="Código" aoAcionar={() => usar((t, i, f) => aplicarMarcacao(t, i, f, '`', '`', 'código'))}>
            <Code className="w-4 h-4" />
          </BotaoDaBarra>

          <Divisoria />

          {/* INSERIR */}
          {/*
            A IMAGEM É UM <label>, e não um botão.

            O seletor de arquivo do navegador só abre a partir de um
            `<input type="file">` — um botão que o acionasse por código
            seria bloqueado em parte dos celulares.
          */}
          {aoSubirImagem && (
            <>
              <label
                title={subindo ? 'Enviando...' : 'Inserir imagem (também dá para colar um print ou arrastar a foto)'}
                className={`h-8 px-1.5 rounded-lg flex items-center gap-1 text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)] transition-colors ${
                  subindo ? 'opacity-40' : 'cursor-pointer'
                }`}
              >
                {subindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                <span className="text-xs font-semibold hidden xl:inline">Imagem</span>
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
              <label
                title="Imagem de capa — uma faixa no alto da publicação, que também aparece no cartão"
                className={`h-8 px-1.5 rounded-lg flex items-center gap-1 text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)] transition-colors ${
                  subindo ? 'opacity-40' : 'cursor-pointer'
                }`}
              >
                <PanelTop className="w-4 h-4" />
                <span className="text-xs font-semibold hidden xl:inline">Capa</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subindo}
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    if (arquivo) inserirImagem(arquivo, true);
                    e.target.value = '';
                  }}
                />
              </label>
            </>
          )}
          <div className="relative">
            <BotaoDaBarra titulo="Emoji" aoAcionar={() => alternarMenu('emoji')} ativo={menuAberto('emoji')}>
              <Smile className="w-4 h-4" />
            </BotaoDaBarra>
            {menuAberto('emoji') && (
              <div className={`${caixaDoMenu} w-64 grid grid-cols-7 gap-0.5 sm:left-auto sm:right-0`} role="menu">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      usar((t, i, f) => ({
                        texto: t.slice(0, i) + emoji + t.slice(f),
                        inicio: i + emoji.length,
                        fim: i + emoji.length,
                      }));
                    }}
                    className="h-8 rounded-lg text-lg hover:bg-[var(--c-superficie-2)]"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

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
            title={modo === 'vivo' ? 'Ver a marcação do texto' : 'Voltar ao texto formatado'}
            onClick={() => setModo((m) => (m === 'vivo' ? 'marcacao' : 'vivo'))}
            className={`h-8 px-2 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
              modo === 'marcacao'
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                : 'text-[var(--c-texto-3)] hover:bg-[var(--c-superficie-2)]'
            }`}
          >
            {modo === 'marcacao' ? (
              <>
                <Eye className="w-3.5 h-3.5" /> Formatado
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" /> Marcação
              </>
            )}
          </button>
        </div>
      </div>

      {/* A FOLHA: largura e fonte da leitura, com o título dentro */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-6 py-4 sm:py-8">
        <div
          ref={folha}
          id="folha-do-editor"
          onClick={aoClicarNaFolha}
          className={`relative mx-auto w-full max-w-[780px] min-h-full bg-[var(--c-superficie)] border rounded-2xl shadow-[var(--s-1)] px-4 sm:px-10 py-6 sm:py-9 flex flex-col gap-4 transition-colors ${
            arrastando ? 'border-[var(--c-acento)] border-dashed border-2' : 'border-[var(--c-borda)]'
          }`}
        >
          {cabecalho}

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
              linhas={14}
              classe="px-0 py-0 text-[15px] sm:text-base"
              aoTeclar={aoTeclar}
              aoColarImagem={aoSubirImagem ? (arquivo) => inserirImagem(arquivo) : undefined}
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
              rows={18}
              placeholder={placeholder}
              className="w-full p-0 text-sm font-mono bg-transparent text-[var(--c-texto)] focus:outline-none placeholder:text-[var(--c-texto-3)] leading-relaxed resize-y"
            />
          )}

          {arrastando && (
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[var(--c-acento)]/5 flex items-center justify-center text-sm font-bold text-[var(--c-acento)]">
              Solte a imagem para inserir
            </div>
          )}
        </div>
      </div>

      {/*
        A LISTA DE NOMES fica FORA da escolha de campo: ela serve aos
        dois. Duplicá-la em cada um é como a lista de setores divergiu
        entre duas telas. Presa à janela, embaixo: numa folha comprida,
        presa ao campo ela ficaria fora da tela.
      */}
      {candidatos.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[min(22rem,calc(100vw-2rem))] z-50 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-3)] overflow-hidden">
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
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                i === escolhido ? 'bg-[var(--c-acento-suave)]' : 'hover:bg-[var(--c-superficie-2)]'
              }`}
            >
              <span className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                <Avatar foto={p.foto} nome={p.nome} letra="text-xs" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate text-[var(--c-texto)]">{p.nome}</span>
                <span className="block text-[11px] truncate text-[var(--c-texto-3)]">
                  {[p.cargo, p.loja].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* A JANELINHA DE LINK E BOTÃO */}
      {dialogo && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onMouseDown={() => setDialogo(null)}>
          <form
            id="dialogo-link"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              confirmarDialogo();
            }}
            className="w-full max-w-sm rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)] p-5 flex flex-col gap-3"
          >
            <h3 className="text-base font-bold text-[var(--c-texto)]">
              {dialogo.tipo === 'botao' ? 'Botão de ação' : 'Link'}
            </h3>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--c-texto-2)]">
              {dialogo.tipo === 'botao' ? 'Texto do botão' : 'Texto'}
              <input
                autoFocus={!dialogo.texto}
                value={dialogo.texto}
                onChange={(e) => setDialogo({ ...dialogo, texto: e.target.value })}
                placeholder={dialogo.tipo === 'botao' ? 'Abrir formulário' : 'tabela de preços'}
                className="h-10 px-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-canvas)] text-sm font-normal text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--c-texto-2)]">
              Endereço
              <input
                autoFocus={!!dialogo.texto}
                value={dialogo.endereco}
                onChange={(e) => setDialogo({ ...dialogo, endereco: e.target.value, erro: undefined })}
                placeholder="malachias.com.br/formulario"
                inputMode="url"
                className="h-10 px-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-canvas)] text-sm font-normal text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              />
            </label>
            {dialogo.erro && <p role="alert" className="text-xs font-semibold text-red-600">{dialogo.erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDialogo(null)} className="h-10 px-4 rounded-xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]">
                Cancelar
              </button>
              <button type="submit" className="h-10 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold">
                Inserir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* O PAINEL DA IMAGEM */}
      {painel && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onMouseDown={() => setPainel(null)}>
          <div
            id="painel-da-imagem"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)] p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--c-texto)]">{painel.capa ? 'Imagem de capa' : 'Imagem'}</h3>
              <button type="button" onClick={() => setPainel(null)} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-[var(--c-superficie-2)] text-[var(--c-texto-3)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            {enderecos[painel.caminho] && (
              <img src={enderecos[painel.caminho]} alt="" className="max-h-40 w-full object-contain rounded-xl bg-[var(--c-canvas)]" />
            )}
            {!painel.capa && (
              <>
                <EscolhaSegmentada
                  rotulo="Tamanho"
                  opcoes={TAMANHOS_DE_IMAGEM.map((t) => ({ valor: t, rotulo: ROTULO_TAMANHO[t] }))}
                  valor={painel.tamanho}
                  aoEscolher={(tamanho) => setPainel({ ...painel, tamanho })}
                />
                <EscolhaSegmentada
                  rotulo="Alinhamento"
                  opcoes={ALINHAMENTOS_DE_IMAGEM.map((a) => ({ valor: a, rotulo: ROTULO_ALINHAMENTO[a] }))}
                  valor={painel.alinhamento}
                  aoEscolher={(alinhamento) => setPainel({ ...painel, alinhamento })}
                />
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--c-texto-2)]">
                  Legenda <span className="font-normal text-[var(--c-texto-3)]">(aparece embaixo da imagem)</span>
                  <input
                    value={painel.legenda}
                    onChange={(e) => setPainel({ ...painel, legenda: e.target.value })}
                    placeholder="Ex.: fachada da loja de Descalvado"
                    className="h-10 px-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-canvas)] text-sm font-normal text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
                  />
                </label>
              </>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={removerDoPainel} className="h-10 px-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-500/10 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Remover
              </button>
              <div className="flex-1" />
              <button type="button" onClick={() => setPainel(null)} className="h-10 px-4 rounded-xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]">
                Cancelar
              </button>
              <button type="button" id="aplicar-imagem" onClick={aplicarPainel} className="h-10 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold">
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Um grupo de opções em que só uma vale — tamanho, alinhamento. */
function EscolhaSegmentada<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  aoEscolher: (valor: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--c-texto-2)]">{rotulo}</span>
      <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-xl bg-[var(--c-superficie-2)]">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => aoEscolher(o.valor)}
            className={`h-9 rounded-lg text-xs font-bold transition-colors ${
              valor === o.valor
                ? 'bg-[var(--c-superficie)] text-[var(--c-acento)] shadow-[var(--s-1)]'
                : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
            }`}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

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
