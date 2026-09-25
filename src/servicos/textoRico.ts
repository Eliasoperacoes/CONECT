/**
 * TEXTO COM FORMATAÇÃO — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * POR QUE MARKDOWN, E NÃO UM EDITOR DE VERDADE
 * ===================================================================
 *
 * A Central da Direção só aceitava texto corrido. Um comunicado de
 * inventário com cinco passos saía como um parágrafo único, e quem lia
 * no balcão não achava o horário no meio dele.
 *
 * A saída óbvia seria um editor visual (TipTap, Lexical, Quill). Três
 * motivos para não:
 *
 *  1. O CONTEÚDO CONTINUA SENDO TEXTO. A coluna `conteudo` já existe e
 *     já tem 24 publicações dentro. Um editor visual guarda HTML ou uma
 *     árvore JSON, e as 24 antigas viravam lixo no dia da migração.
 *  2. A BUSCA CONTINUA FUNCIONANDO. `casaComBusca` procura dentro do
 *     conteúdo — quem procura "vale-transporte" acha o documento pela
 *     palavra que está dentro dele. Com HTML, a busca acharia `<strong>`.
 *  3. O PACOTE JÁ TEM 1,7 MB. Qualquer um desses editores acrescenta
 *     centenas de KB a um sistema que abre no celular do balcão.
 *
 * Quem escreve não precisa conhecer marcação nenhuma: a barra de
 * ferramentas escreve por ela, e a pré-visualização mostra o resultado.
 * É o que o GitHub faz, e funciona com quem nunca ouviu falar de
 * Markdown.
 *
 * ===================================================================
 * A SEGURANÇA VEM PRIMEIRO, E NÃO DEPOIS
 * ===================================================================
 *
 * Isto vira `dangerouslySetInnerHTML` numa tela que 89 pessoas leem.
 * Um `<script>` digitado no corpo de um comunicado rodaria na sessão de
 * todo mundo — com a sessão do Supabase em mãos.
 *
 * Por isso TODO o texto é escapado ANTES de qualquer marcação ser
 * aplicada. Depois disso não há mais `<` nenhum no texto, e as tags que
 * saem daqui são só as que estas funções escreveram. A ordem é a
 * segurança: escapar depois deixaria passar o que a marcação já tivesse
 * transformado.
 */

/** Tira o poder de qualquer HTML que venha no texto. */
const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Um endereço só passa se for http(s).
 *
 * `javascript:alert(1)` num link é a forma mais simples de rodar código
 * na sessão de quem clica — e ela atravessaria o escape, porque o
 * endereço vai para dentro de um atributo que nós mesmos escrevemos.
 */
const enderecoSeguro = (bruto: string): string | null => {
  const limpo = bruto.trim();
  return /^https?:\/\//i.test(limpo) ? limpo : null;
};

/**
 * A marcação que vale dentro de uma linha: negrito, itálico, código, link.
 *
 * O CÓDIGO SAI DE CENA ANTES, e volta no fim.
 *
 * Substituí-lo primeiro não bastava: as trocas seguintes varriam o
 * texto inteiro e entravam DENTRO do `<code>` que acabara de ser
 * escrito — `` `**isto**` `` saía com negrito de verdade. Um comunicado
 * que explica a marcação precisa poder mostrá-la.
 *
 * O marcador é U+E000, da área de uso privado do Unicode: não sai de
 * teclado nenhum e não tem significado em lugar nenhum, então não há
 * como um texto trazer um de fora e se passar por trecho de código.
 *
 * NÃO é o byte nulo. A primeira versão usava U+0000, e o `grep` e o
 * `git diff` passaram a tratar este arquivo como BINÁRIO — o código
 * sumia da revisão e da busca. Um caractere invisível escolhido sem
 * cuidado custa a legibilidade do arquivo inteiro.
 */
const MARCA = '\uE000';

const dentroDaLinha = (texto: string): string => {
  const trechosDeCodigo: string[] = [];

  const semCodigo = texto.replace(/`([^`]+)`/g, (todo, conteudo: string) => {
    trechosDeCodigo.push(conteudo);
    return `${MARCA}${trechosDeCodigo.length - 1}${MARCA}`;
  });

  const formatado = semCodigo
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (todo, rotulo: string, destino: string) => {
      const endereco = enderecoSeguro(destino);
      if (!endereco) return rotulo;
      return `<a href="${endereco}" target="_blank" rel="noopener noreferrer" class="tr-link">${rotulo}</a>`;
    });

  return formatado.replace(
    new RegExp(`${MARCA}(\\d+)${MARCA}`, 'g'),
    (todo, indice: string) =>
      `<code class="tr-codigo">${trechosDeCodigo[Number(indice)]}</code>`
  );
};

/**
 * Converte o texto escrito em HTML pronto para a tela.
 *
 * O que entende, que é o que um comunicado de loja precisa:
 *
 *   # Título          ## Subtítulo
 *   **negrito**       *itálico*       ~~riscado~~      `código`
 *   - lista           1. lista numerada
 *   > citação
 *   [texto](https://endereço)
 *   ---  (linha separadora)
 *
 * Linha em branco separa parágrafo. Quebra de linha simples vira
 * quebra de linha: quem escreve um endereço em três linhas espera as
 * três linhas, e não um parágrafo só.
 */
export const paraHtml = (texto: string): string => {
  const linhas = escapar(texto || '').split('\n');
  const partes: string[] = [];

  let listaAberta: 'ul' | 'ol' | null = null;
  let paragrafo: string[] = [];

  const fecharParagrafo = () => {
    if (paragrafo.length === 0) return;
    partes.push(`<p class="tr-p">${dentroDaLinha(paragrafo.join('<br/>'))}</p>`);
    paragrafo = [];
  };

  const fecharLista = () => {
    if (!listaAberta) return;
    partes.push(`</${listaAberta}>`);
    listaAberta = null;
  };

  for (const linha of linhas) {
    const limpa = linha.trim();

    if (limpa === '') {
      fecharParagrafo();
      fecharLista();
      continue;
    }

    if (/^---+$/.test(limpa)) {
      fecharParagrafo();
      fecharLista();
      partes.push('<hr class="tr-hr"/>');
      continue;
    }

    const titulo = limpa.match(/^(#{1,3})\s+(.*)$/);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      const nivel = titulo[1].length;
      partes.push(
        `<h${nivel + 2} class="tr-h${nivel}">${dentroDaLinha(titulo[2])}</h${nivel + 2}>`
      );
      continue;
    }

    const citacao = limpa.match(/^&gt;\s?(.*)$/);
    if (citacao) {
      fecharParagrafo();
      fecharLista();
      partes.push(`<blockquote class="tr-citacao">${dentroDaLinha(citacao[1])}</blockquote>`);
      continue;
    }

    const item = limpa.match(/^[-*]\s+(.*)$/);
    const numerado = limpa.match(/^\d+[.)]\s+(.*)$/);

    if (item || numerado) {
      fecharParagrafo();
      const tipo: 'ul' | 'ol' = item ? 'ul' : 'ol';

      if (listaAberta !== tipo) {
        fecharLista();
        partes.push(`<${tipo} class="tr-lista">`);
        listaAberta = tipo;
      }

      partes.push(`<li>${dentroDaLinha((item || numerado)![1])}</li>`);
      continue;
    }

    paragrafo.push(limpa);
  }

  fecharParagrafo();
  fecharLista();

  return partes.join('');
};

/**
 * O texto sem marcação nenhuma — para o resumo do cartão e para a
 * prévia que vai ao chat.
 *
 * Sem isto, o cartão da lista mostraria `## Inventário **sexta**`, e a
 * mensagem no grupo sairia com asteriscos no meio.
 */
export const semFormatacao = (texto: string): string =>
  (texto || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^&gt;\s?/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^---+$/gm, '')
    .replace(/\n{2,}/g, ' · ')
    .replace(/\n/g, ' ')
    .trim();

/**
 * Envolve o pedaço escolhido com a marcação, ou insere um exemplo.
 *
 * É o que os botões da barra chamam. Devolve também onde a seleção
 * fica depois — sem isso, o cursor pula para o fim a cada clique e
 * quem está escrevendo perde o lugar.
 */
export const aplicarMarcacao = (
  texto: string,
  inicio: number,
  fim: number,
  antes: string,
  depois = antes,
  exemplo = 'texto'
): { texto: string; inicio: number; fim: number } => {
  const selecionado = texto.slice(inicio, fim) || exemplo;
  const novo = `${texto.slice(0, inicio)}${antes}${selecionado}${depois}${texto.slice(fim)}`;

  return {
    texto: novo,
    inicio: inicio + antes.length,
    fim: inicio + antes.length + selecionado.length,
  };
};

/**
 * Põe um prefixo no COMEÇO DE CADA LINHA da seleção.
 *
 * É o que título, lista e citação precisam: marcar só a primeira linha
 * de três selecionadas deixaria as outras duas de fora, que não é o que
 * ninguém espera ao selecionar três linhas e pedir lista.
 */
export const aplicarPrefixo = (
  texto: string,
  inicio: number,
  fim: number,
  prefixo: string
): { texto: string; inicio: number; fim: number } => {
  const comecoDaLinha = texto.lastIndexOf('\n', inicio - 1) + 1;
  const fimDaLinha = texto.indexOf('\n', fim) === -1 ? texto.length : texto.indexOf('\n', fim);

  const bloco = texto.slice(comecoDaLinha, fimDaLinha) || 'texto';
  const marcado = bloco
    .split('\n')
    .map((l) => (l.startsWith(prefixo) ? l : `${prefixo}${l}`))
    .join('\n');

  return {
    texto: `${texto.slice(0, comecoDaLinha)}${marcado}${texto.slice(fimDaLinha)}`,
    inicio: comecoDaLinha,
    fim: comecoDaLinha + marcado.length,
  };
};
