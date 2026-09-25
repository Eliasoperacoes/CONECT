/**
 * Verificação do TEXTO FORMATADO ENQUANTO SE DIGITA — CONECTA
 *
 * ===================================================================
 * O QUE ESTE ARQUIVO PROTEGE
 * ===================================================================
 *
 * O campo mostra o texto formatado, mas o que é GRAVADO é o
 * `textContent` dele — os sinais da marcação ficam escondidos pelo CSS,
 * e não apagados. Toda a ideia depende de UMA igualdade:
 *
 *     textContent do desenho  ===  o texto que entrou
 *
 * Se ela falhar em um caso, aquele caso CORROMPE O DOCUMENTO de quem
 * estiver escrevendo: o negrito perde um asterisco, o link perde o
 * endereço, a tarefa ganha um quadradinho gravado no meio da frase. E
 * corrompe calado, porque na tela continua parecendo certo.
 *
 * Por isso o primeiro teste passa um documento com TODAS as marcações
 * pelo desenho e confere caractere por caractere o que volta.
 *
 * O segundo risco é o de sempre: isto vira `innerHTML` numa tela que 89
 * pessoas usam.
 */
import { test, expect } from 'bun:test';
import {
  textoAoVivo,
  linhaAoVivo,
  linhaEColuna,
  posicaoNoTexto,
  CLASSE_SINAL,
} from './textoAoVivo';
import { marcacaoDeCitacao } from './textoRico';

/**
 * O `textContent` que o navegador devolveria, calculado aqui.
 *
 * Tira as tags e desfaz o escape — nesta ordem, que é a inversa da que
 * o desenho usou. O CSS não entra na conta: `textContent` devolve o que
 * está escondido também, e é exatamente disso que dependemos.
 */
const textoDeVolta = (html: string): string =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Cada linha do desenho, separada como o campo as separa. */
const linhasDoDesenho = (html: string): string[] =>
  html
    .split('<div ')
    .slice(1)
    .map((bloco) => textoDeVolta(`<div ${bloco}`))
    /* O `<br>` da linha vazia não é texto: virou string vazia acima */
    .map((l) => l.replace(/ /g, ' '));

// ============================================================
// A IGUALDADE — o que sustenta a ideia toda
// ============================================================

const DOCUMENTO = [
  '# Inventário da matriz',
  '',
  'Começa **sexta** às `08h`, e vai até *meio-dia*.',
  'O que ~~era~~ mudou, e o que ==continua==.',
  '',
  '## O que cada um faz',
  '',
  '- Balcão confere peça pequena',
  '- Depósito confere peça grande',
  '1. Contar',
  '2) Conferir',
  '',
  '- [ ] abrir o caixa',
  '- [x] fechar o caixa',
  '',
  '> Palavra da direção: ninguém sai antes.',
  '',
  '| Loja | Horário |',
  '|---|---|',
  '| Matriz | 08h |',
  '',
  '---',
  '',
  'Tabela em [nosso site](https://exemplo.com/tabela.pdf).',
  '![print do caixa](central/caixa.png)',
  `Dúvida com ${marcacaoDeCitacao('Fábio Souza', 'c-12')}, por favor.`,
  '',
  'Aspas "duplas", apóstrofo \'simples\', e-mail compras@malachias.com,',
  'sinal de & e um <script>alert(1)</script> digitado à toa.',
].join('\n');

test('O TEXTO VOLTA IDÊNTICO, linha por linha', () => {
  /**
   * O caso que não pode falhar. Uma diferença de um caractere aqui é
   * um documento corrompido em silêncio, na mão de quem está
   * escrevendo.
   *
   * Confere com a linha ativa em CADA POSIÇÃO: os sinais aparecem e
   * somem conforme o cursor anda, e o que muda de desenho é
   * exatamente o que mais pode quebrar a igualdade.
   */
  const esperadas = DOCUMENTO.split('\n');

  for (let ativa = -1; ativa < esperadas.length; ativa++) {
    const voltou = linhasDoDesenho(
      textoAoVivo(DOCUMENTO, ativa, { 'central/caixa.png': 'https://assinado/c.png' })
    );

    expect(voltou.length).toBe(esperadas.length);
    for (let i = 0; i < esperadas.length; i++) {
      expect(voltou[i]).toBe(esperadas[i]);
    }
  }
});

test('o texto volta idêntico TAMBÉM sem as imagens assinadas', () => {
  /**
   * A assinatura da imagem é uma ida à rede, e ela pode não ter
   * voltado ainda — ou ter falhado. O documento não pode depender
   * disso: quem digita enquanto a rede está ruim continua gravando o
   * que escreveu.
   */
  const linha = '![print do caixa](central/caixa.png)';

  expect(textoDeVolta(linhaAoVivo(linha, 0, false))).toBe(linha);
  expect(textoDeVolta(linhaAoVivo(linha, 0, true))).toBe(linha);
});

test('os sinais estão no DESENHO, e não só escondidos por fora', () => {
  /**
   * Se o desenho simplesmente NÃO EMITISSE os sinais, o teste acima
   * ainda poderia passar por acaso num texto sem marcação. Este confere
   * o contrário: o `**` existe no HTML, dentro de um span da classe que
   * o CSS esconde.
   */
  const html = linhaAoVivo('isto é **forte**', 0, false);

  expect(html).toContain(CLASSE_SINAL);
  expect(html).toContain('<strong>forte</strong>');
  // e o asterisco está dentro do span do sinal, não solto no texto
  expect(html).toContain(`<span class="${CLASSE_SINAL}">**</span>`);
});

test('a linha ATIVA é marcada, e só ela', () => {
  /**
   * É o que faz os sinais reaparecerem onde o cursor está. Sem a
   * marca, apagar um `**` que não se vê é procurar no escuro.
   */
  const html = textoAoVivo('primeira\nsegunda\nterceira', 1);
  const ativas = html.match(/tr-l-ativa/g) || [];

  expect(ativas.length).toBe(1);
  expect(html).toContain('data-linha="1"');
  // A linha 1 é a que carrega a marca
  const bloco = html.split('<div ')[2];
  expect(bloco).toContain('tr-l-ativa');
  expect(bloco).toContain('segunda');
});

test('sem cursor no campo, NENHUM sinal aparece', () => {
  expect(textoAoVivo('isto é **forte**', -1)).not.toContain('tr-l-ativa');
});

// ============================================================
// SEGURANÇA — o mesmo `innerHTML`, o mesmo risco
// ============================================================

test('HTML DIGITADO NÃO VIRA HTML', () => {
  const html = textoAoVivo('<script>alert("oi")</script>', 0);

  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});

test('link e imagem com esquema perigoso não viram tag', () => {
  expect(linhaAoVivo('[x](javascript:alert(1))', 0, false)).not.toContain('tr-link');
  expect(linhaAoVivo('![x](javascript:alert(1))', 0, false)).not.toContain('<img');
  expect(linhaAoVivo('![x](data:text/html,<script>)', 0, false)).not.toContain('<img');
});

test('aspas e apóstrofo não escapam do atributo', () => {
  const html = linhaAoVivo('Ele disse "bom dia" e o \'resto\'', 0, false);

  expect(html).toContain('&quot;bom dia&quot;');
  expect(html).toContain('&#39;resto&#39;');
});

// ============================================================
// O CURSOR — contado em caracteres do texto
// ============================================================

test('linha e coluna, e a volta', () => {
  const texto = 'primeira\nsegunda\nterceira';

  expect(linhaEColuna(texto, 0)).toEqual({ linha: 0, coluna: 0 });
  expect(linhaEColuna(texto, 8)).toEqual({ linha: 0, coluna: 8 });
  // A posição 9 é o primeiro caractere da segunda linha
  expect(linhaEColuna(texto, 9)).toEqual({ linha: 1, coluna: 0 });
  expect(linhaEColuna(texto, 13)).toEqual({ linha: 1, coluna: 4 });

  // E a volta bate, em toda posição
  for (let p = 0; p <= texto.length; p++) {
    const { linha, coluna } = linhaEColuna(texto, p);
    expect(posicaoNoTexto(texto, linha, coluna)).toBe(p);
  }
});

test('coluna maior que a linha para NO FIM DELA', () => {
  /**
   * Acontece ao apagar: o desenho é refeito com a linha mais curta, e a
   * coluna guardada não existe mais. Sem o limite, o cursor iria para
   * dentro da linha seguinte — e quem apaga uma palavra continuaria
   * digitando um andar abaixo.
   */
  const texto = 'ab\ncdef';

  expect(posicaoNoTexto(texto, 0, 99)).toBe(2);
  expect(posicaoNoTexto(texto, 1, 99)).toBe(7);
  expect(posicaoNoTexto(texto, 99, 0)).toBe(3);
  expect(posicaoNoTexto(texto, -1, -1)).toBe(0);
});

// ============================================================
// O QUE APARECE FORMATADO
// ============================================================

test('título, lista, tarefa, citação e régua ganham a classe da linha', () => {
  expect(linhaAoVivo('# a', 0, false)).toContain('tr-l-h1');
  expect(linhaAoVivo('## a', 0, false)).toContain('tr-l-h2');
  expect(linhaAoVivo('- a', 0, false)).toContain('tr-l-item');
  expect(linhaAoVivo('1. a', 0, false)).toContain('tr-l-numero');
  expect(linhaAoVivo('- [ ] a', 0, false)).toContain('tr-l-tarefa');
  expect(linhaAoVivo('- [x] a', 0, false)).toContain('tr-l-feita');
  expect(linhaAoVivo('> a', 0, false)).toContain('tr-l-citacao');
  expect(linhaAoVivo('---', 0, false)).toContain('tr-l-regua');
  expect(linhaAoVivo('| a | b |', 0, false)).toContain('tr-l-tabela');
  expect(linhaAoVivo('', 0, false)).toContain('tr-l-vazia');
});

test('TAREFA é reconhecida antes de lista', () => {
  /**
   * `- [ ] x` também casa com lista. Sem a ordem, a caixa viraria um
   * item de lista começando por "[ ]" — e a tarefa não se marcaria.
   */
  const html = linhaAoVivo('- [ ] abrir o caixa', 0, false);

  expect(html).toContain('tr-l-tarefa');
  expect(html).not.toContain('tr-l-item');
  expect(html).toContain('tr-caixa-viva');
});

test('a caixa da tarefa e o aviso de imagem NÃO põem texto no documento', () => {
  /**
   * Os dois são desenho de tela, e desenho de tela que entra no
   * `textContent` é gravado dentro do documento. Um `☐` no meio da
   * frase chegaria ao espelho de ponto de quem lesse.
   */
  expect(linhaAoVivo('- [ ] abrir', 0, false)).toContain('class="tr-caixa-viva"></span>');
  expect(linhaAoVivo('![x](interno/a.png)', 0, false)).toContain(
    'class="tr-imagem-faltando"></span>'
  );
});

test('o marcador da lista vem do CSS, e não do texto', () => {
  /**
   * Um `•` escrito no desenho seria gravado no documento, e o próximo
   * desenho o leria como texto — a lista ganharia um ponto a cada
   * passada.
   */
  expect(linhaAoVivo('- pão', 0, false)).not.toContain('•');
  expect(textoDeVolta(linhaAoVivo('- pão', 0, false))).toBe('- pão');
});

test('o que está dentro de CÓDIGO não vira marcação', () => {
  const html = linhaAoVivo('`**isto não é negrito**`', 0, false);

  expect(html).not.toContain('<strong>');
  expect(html).toContain('<code class="tr-codigo">');
});

test('imagem e citação são reconhecidas ANTES do link', () => {
  const imagem = linhaAoVivo('![foto](https://exemplo.com/a.png)', 0, false);
  expect(imagem).toContain('<img');
  expect(imagem).not.toContain('tr-link');

  const citada = linhaAoVivo(marcacaoDeCitacao('Ana', 'c-1'), 0, false);
  expect(citada).toContain('tr-citado');
  expect(citada).not.toContain('tr-link');
});

test('texto vazio não quebra', () => {
  expect(textoAoVivo('', 0)).toContain('tr-l-vazia');
  expect(textoAoVivo(undefined as unknown as string, 0)).toContain('tr-l-vazia');
});
