/**
 * O TEXTO FORMATADO ENQUANTO SE DIGITA — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * A IDEIA, QUE É UMA SÓ
 * ===================================================================
 *
 * Quem escreve na Central quer ver negrito, título e lista JÁ
 * FORMATADOS no campo — e não `**assim**`, para depois clicar numa aba
 * e conferir. Mas o que é GRAVADO tem de continuar sendo texto: as
 * publicações antigas continuam valendo, a busca continua achando a
 * palavra dentro do documento, e nada é somado ao pacote que abre no
 * celular do balcão.
 *
 * As duas coisas parecem se excluir. Um editor visual comum resolve
 * guardando HTML e traduzindo HTML de volta para texto na hora de
 * salvar — e é ali que esses editores erram: cada navegador escreve o
 * HTML do seu jeito, e a tradução de volta é adivinhação.
 *
 * AQUI NÃO HÁ TRADUÇÃO DE VOLTA.
 *
 * Os sinais da marcação — os `**`, o `## `, o `- ` — continuam DENTRO
 * do campo, em spans próprios. O que faz o texto parecer formatado é o
 * CSS: os sinais ficam escondidos, e o que eles marcam aparece em
 * negrito, em título, em lista.
 *
 * Esconder não é apagar. `textContent` devolve o que está escondido
 * também — então o texto de volta é o `textContent` de cada linha, sem
 * adivinhar nada, e idêntico ao que entrou. É este arquivo que garante
 * essa igualdade, e é isso que o teste cobra.
 *
 * Os sinais REAPARECEM na linha onde o cursor está, esmaecidos: sem
 * isso, apagar um `**` que não se vê é procurar no escuro — e o cursor
 * não pode parar dentro de algo que o navegador não desenha.
 *
 * ===================================================================
 * POR QUE NÃO REUSAR `paraHtml`
 * ===================================================================
 *
 * `paraHtml` desenha para QUEM LÊ, e ali os sinais somem de verdade —
 * ele os descarta. Aqui eles precisam sobreviver, porque são o texto
 * que vai ser gravado. São dois trabalhos diferentes, e forçá-los na
 * mesma função daria uma função com um `se estou editando` em cada
 * linha.
 *
 * O que NÃO se duplica é a segurança: `escapar` e `enderecoSeguro`
 * vêm de `textoRico`. Essa é a regra que não pode divergir — isto
 * também vira `innerHTML` numa tela que 89 pessoas usam.
 */
import { escapar, enderecoSeguro } from './textoRico';

/** A classe dos sinais: é ela que o CSS esconde e reacende. */
export const CLASSE_SINAL = 'tr-sinal';

const sinal = (texto: string): string =>
  texto ? `<span class="${CLASSE_SINAL}">${texto}</span>` : '';

/**
 * A MARCAÇÃO DE DENTRO DA LINHA, com os sinais preservados.
 *
 * A ordem repete a de `paraHtml`, e pelas mesmas razões: código
 * primeiro (senão a marcação entra dentro dele), imagem e citação
 * antes do link (senão o link casa primeiro e come o `!` e o `@`).
 *
 * Aqui não há como tirar o código de cena com um marcador invisível: o
 * marcador teria de voltar ao texto, e o texto é o que será gravado.
 * Então a varredura acontece UMA VEZ, por uma expressão só, com as
 * alternativas na ordem certa — o que casa como código não é oferecido
 * às outras regras.
 */
const REGRAS = new RegExp(
  [
    '(`[^`]+`)', // 1 código
    '(!\\[[^\\]]*\\]\\([^)]+\\))', // 2 imagem
    '(@\\[[^\\]]+\\]\\(pessoa:[^)]+\\))', // 3 citação
    '(\\[[^\\]]+\\]\\([^)]+\\))', // 4 link
    '(==[^=]+==)', // 5 marca-texto
    '(\\*\\*[^*]+\\*\\*)', // 6 negrito
    '(~~[^~]+~~)', // 7 riscado
    '(\\*[^*]+\\*)', // 8 itálico
  ].join('|'),
  'g'
);

const dentroDaLinhaAoVivo = (
  linha: string,
  imagens: Record<string, string>
): string => {
  /**
   * O ESCAPE VEM POR PEDAÇO, e não de uma vez no começo.
   *
   * Escapar tudo antes mudaria o TAMANHO do texto (`"` vira `&quot;`,
   * seis caracteres no lugar de um), e as posições que a expressão
   * encontra deixariam de valer para o texto de verdade. Como o cursor
   * é uma posição no texto, isso desalinharia o cursor de tudo.
   */
  let saida = '';
  let ultimo = 0;

  for (const achado of linha.matchAll(REGRAS)) {
    const inicio = achado.index ?? 0;
    saida += escapar(linha.slice(ultimo, inicio));
    ultimo = inicio + achado[0].length;

    const [
      todo,
      codigo,
      imagem,
      citacao,
      link,
      marcaTexto,
      negrito,
      riscado,
      italico,
    ] = achado;

    if (codigo) {
      saida += `${sinal('`')}<code class="tr-codigo">${escapar(
        codigo.slice(1, -1)
      )}</code>${sinal('`')}`;
    } else if (imagem) {
      /**
       * A IMAGEM APARECE, e o `![x](y)` fica como sinal ao lado dela.
       *
       * Sem ver a foto, quem escreve um procedimento não tem como
       * conferir se inseriu o print certo — e era justamente para isso
       * que a aba "Como vai ficar" existia.
       */
      const partes = imagem.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const descricao = escapar(partes?.[1] || '');
      const caminho = (partes?.[2] || '').trim();
      const endereco = /^https?:\/\//i.test(caminho)
        ? enderecoSeguro(caminho)
        : imagens[caminho];

      saida += sinal(escapar(todo));
      /**
       * O AVISO DE IMAGEM QUE AINDA NÃO ABRIU vem todo do CSS.
       *
       * Escrever "🖼 imagem" aqui o colocaria no `textContent` — e o
       * `textContent` é o que vai ser GRAVADO. Um aviso de tela não
       * pode entrar no documento.
       */
      saida += endereco
        ? `<img src="${endereco}" alt="${descricao}" class="tr-imagem" loading="lazy" />`
        : '<span class="tr-imagem-faltando"></span>';
    } else if (citacao) {
      /**
       * A ORDEM DOS PEDAÇOS É A ORDEM DO TEXTO.
       *
       * O `textContent` é a soma do que sai daqui, escondido incluído.
       * Se o `[` saísse depois do nome, o texto gravado viria
       * `@Nome[](pessoa:id)` — e o cursor, que é contado em caracteres,
       * apontaria para o lugar errado a partir dali.
       *
       * Só o `@` e o nome ficam à vista; `[`, `]` e o id são sinal.
       */
      const partes = citacao.match(/^@\[([^\]]+)\]\((pessoa:[^)]+)\)$/);
      const nome = partes?.[1] || '';

      saida += `<span class="tr-citado">@${sinal('[')}${escapar(nome)}</span>${sinal(
        escapar(`](${partes?.[2] || ''})`)
      )}`;
    } else if (link) {
      const partes = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const rotulo = partes?.[1] || '';
      const endereco = enderecoSeguro(partes?.[2] || '');

      // Mesma ordem do texto, mesma razão da citação acima
      saida += endereco
        ? `${sinal('[')}<span class="tr-link">${escapar(rotulo)}</span>${sinal(
            escapar(`](${partes?.[2]})`)
          )}`
        : escapar(todo);
    } else if (marcaTexto) {
      saida += `${sinal('==')}<mark class="tr-marca">${escapar(
        marcaTexto.slice(2, -2)
      )}</mark>${sinal('==')}`;
    } else if (negrito) {
      saida += `${sinal('**')}<strong>${escapar(
        negrito.slice(2, -2)
      )}</strong>${sinal('**')}`;
    } else if (riscado) {
      saida += `${sinal('~~')}<s>${escapar(riscado.slice(2, -2))}</s>${sinal('~~')}`;
    } else if (italico) {
      saida += `${sinal('*')}<em>${escapar(italico.slice(1, -1))}</em>${sinal('*')}`;
    }
  }

  return saida + escapar(linha.slice(ultimo));
};

/**
 * UMA LINHA DO TEXTO, pronta para o campo.
 *
 * Sempre um bloco por linha, sempre com `data-linha`: é assim que a
 * leitura de volta sabe onde cada linha começa e termina, e é assim que
 * o navegador quebra a linha no Enter — partindo o bloco em dois, o que
 * mantém a estrutura de pé sem nós precisarmos interferir.
 *
 * Linha vazia leva um `<br>`: um bloco vazio tem altura zero, e o
 * parágrafo em branco que separa dois trechos desapareceria da tela.
 */
export const linhaAoVivo = (
  linha: string,
  indice: number,
  ativa: boolean,
  imagens: Record<string, string> = {}
): string => {
  const abre = (classe: string) =>
    `<div class="tr-l ${classe}${ativa ? ' tr-l-ativa' : ''}" data-linha="${indice}">`;

  if (linha === '') return `${abre('tr-l-vazia')}<br></div>`;

  const titulo = linha.match(/^(#{1,3})(\s+)(.*)$/);
  if (titulo) {
    return `${abre(`tr-l-h${titulo[1].length}`)}${sinal(
      escapar(titulo[1] + titulo[2])
    )}${dentroDaLinhaAoVivo(titulo[3], imagens)}</div>`;
  }

  if (/^---+$/.test(linha)) {
    return `${abre('tr-l-regua')}${sinal(escapar(linha))}</div>`;
  }

  const citacaoDeBloco = linha.match(/^(&gt;|>)(\s?)(.*)$/);
  if (citacaoDeBloco) {
    return `${abre('tr-l-citacao')}${sinal(
      escapar(citacaoDeBloco[1] + citacaoDeBloco[2])
    )}${dentroDaLinhaAoVivo(citacaoDeBloco[3], imagens)}</div>`;
  }

  /**
   * TAREFA antes de lista: `- [ ] x` também casa com lista, e sem esta
   * ordem a caixa viraria um item começando por "[ ]".
   */
  const tarefa = linha.match(/^([-*]\s+)(\[[ xX]\])(\s+)(.*)$/);
  if (tarefa) {
    const feita = tarefa[2].toLowerCase() === '[x]';
    /* A caixa é vazia de propósito: o desenho dela vem do CSS. Um `☐`
       escrito aqui entraria no `textContent`, que é o que é GRAVADO */
    return `${abre(`tr-l-tarefa${feita ? ' tr-l-feita' : ''}`)}${sinal(
      escapar(tarefa[1])
    )}<span class="tr-caixa-viva"></span>${sinal(
      escapar(tarefa[2] + tarefa[3])
    )}${dentroDaLinhaAoVivo(tarefa[4], imagens)}</div>`;
  }

  const item = linha.match(/^([-*])(\s+)(.*)$/);
  if (item) {
    /* O marcador vem do CSS (`::before`) e não do texto: escrever um
       `•` aqui o colocaria no `textContent`, e ele seria GRAVADO */
    return `${abre('tr-l-item')}${sinal(
      escapar(item[1] + item[2])
    )}${dentroDaLinhaAoVivo(item[3], imagens)}</div>`;
  }

  const numerado = linha.match(/^(\d+[.)])(\s+)(.*)$/);
  if (numerado) {
    return `${abre('tr-l-numero')}<span class="tr-numero-visto">${escapar(
      numerado[1]
    )}</span>${sinal(escapar(numerado[2]))}${dentroDaLinhaAoVivo(
      numerado[3],
      imagens
    )}</div>`;
  }

  /**
   * TABELA: a linha de `|` fica em fonte monoespaçada, com as barras à
   * vista.
   *
   * Desenhar uma `<table>` de verdade aqui seria o pior lugar para
   * fazê-lo: o cursor dentro de célula de tabela em campo editável é
   * onde os navegadores mais divergem, e uma tabela que come o Enter
   * trava quem está escrevendo. Alinhada em monoespaçada ela já se lê
   * como tabela — e quem lê a publicação vê a tabela de verdade, que
   * `paraHtml` desenha.
   */
  if (/^\|.*\|$/.test(linha)) {
    return `${abre('tr-l-tabela')}${escapar(linha)}</div>`;
  }

  return `${abre('tr-l-p')}${dentroDaLinhaAoVivo(linha, imagens)}</div>`;
};

/**
 * O TEXTO INTEIRO, desenhado.
 *
 * `linhaAtiva` é onde está o cursor: só naquela linha os sinais
 * aparecem. `-1` esconde todos, que é o campo sem foco.
 */
export const textoAoVivo = (
  texto: string,
  linhaAtiva: number,
  imagens: Record<string, string> = {}
): string =>
  (texto || '')
    .split('\n')
    .map((l, i) => linhaAoVivo(l, i, i === linhaAtiva, imagens))
    .join('');

/**
 * A LINHA E A COLUNA de uma posição do texto.
 *
 * O cursor é guardado como posição no TEXTO, e não no desenho: o
 * desenho é refeito a cada pausa, e qualquer referência a um nó do
 * campo morre junto com ele.
 */
export const linhaEColuna = (
  texto: string,
  posicao: number
): { linha: number; coluna: number } => {
  const ate = (texto || '').slice(0, Math.max(0, posicao));
  const quebras = ate.split('\n');

  return { linha: quebras.length - 1, coluna: quebras[quebras.length - 1].length };
};

/** O caminho de volta: de linha e coluna para posição no texto. */
export const posicaoNoTexto = (
  texto: string,
  linha: number,
  coluna: number
): number => {
  const linhas = (texto || '').split('\n');
  const alvo = Math.min(Math.max(0, linha), linhas.length - 1);

  let posicao = 0;
  for (let i = 0; i < alvo; i++) posicao += linhas[i].length + 1;

  return posicao + Math.min(Math.max(0, coluna), linhas[alvo].length);
};
