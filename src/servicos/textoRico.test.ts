/**
 * Verificação do TEXTO COM FORMATAÇÃO — CONECTA
 *
 * O que motivou: a Central só aceitava texto corrido. Um comunicado de
 * inventário com cinco passos saía como um parágrafo único, e quem lia
 * no balcão não achava o horário no meio dele.
 *
 * O QUE ESTE ARQUIVO PROTEGE, ANTES DE QUALQUER FORMATAÇÃO: isto vira
 * `dangerouslySetInnerHTML` numa tela que 89 pessoas leem. Um `<script>`
 * digitado no corpo de um comunicado rodaria na sessão de todo mundo —
 * com a sessão do Supabase em mãos.
 *
 * Por isso metade dos casos aqui é ataque, e não formatação.
 */
import { test, expect } from 'bun:test';
import {
  paraHtml,
  semFormatacao,
  aplicarMarcacao,
  aplicarPrefixo,
  resumoCurto,
} from './textoRico';

// ============================================================
// SEGURANÇA — vem primeiro porque é o que não pode falhar
// ============================================================

test('HTML DIGITADO NÃO VIRA HTML', () => {
  /**
   * O caso que derruba tudo. `<script>` no corpo de um comunicado
   * rodaria na sessão de quem abrisse — e a sessão do Supabase está
   * nela.
   */
  const html = paraHtml('<script>alert("oi")</script>');

  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});

test('atributo de evento não sobrevive', () => {
  /**
   * `<img onerror=...>` é o caminho sem `<script>`: a imagem falha de
   * propósito e o código roda no tratamento do erro.
   */
  const html = paraHtml('<img src=x onerror="alert(1)">');

  expect(html).not.toContain('<img');
  expect(html).not.toContain('onerror="');
});

test('LINK COM javascript: NÃO VIRA LINK', () => {
  /**
   * Este atravessaria o escape: o endereço vai para dentro de um
   * atributo que nós mesmos escrevemos, depois de o texto já estar
   * limpo. Só http e https passam; o resto vira texto puro.
   */
  const html = paraHtml('[clique aqui](javascript:alert(1))');

  expect(html).not.toContain('javascript:');
  expect(html).not.toContain('<a ');
  expect(html).toContain('clique aqui');
});

test('data: e outros esquemas também não passam', () => {
  expect(paraHtml('[x](data:text/html,<script>alert(1)</script>)')).not.toContain('<a ');
  expect(paraHtml('[x](file:///etc/passwd)')).not.toContain('<a ');
  expect(paraHtml('[x](vbscript:msgbox(1))')).not.toContain('<a ');
});

test('link https passa, e abre com rel seguro', () => {
  /**
   * `rel="noopener"` impede que a página aberta alcance a nossa pela
   * `window.opener` — num sistema com sessão viva isso não é detalhe.
   */
  const html = paraHtml('[tabela](https://exemplo.com/tabela.pdf)');

  expect(html).toContain('href="https://exemplo.com/tabela.pdf"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('target="_blank"');
});

test('aspas no texto não escapam do atributo', () => {
  const html = paraHtml('Ele disse "bom dia" e foi embora');
  expect(html).toContain('&quot;bom dia&quot;');
});

// ============================================================
// A FORMATAÇÃO
// ============================================================

test('negrito, itálico, riscado e código', () => {
  expect(paraHtml('**forte**')).toContain('<strong>forte</strong>');
  expect(paraHtml('*leve*')).toContain('<em>leve</em>');
  expect(paraHtml('~~fora~~')).toContain('<s>fora</s>');
  expect(paraHtml('`cod`')).toContain('<code class="tr-codigo">cod</code>');
});

test('o que está dentro de CÓDIGO não vira marcação', () => {
  /**
   * Um comunicado que explica a marcação precisa poder mostrá-la. Por
   * isso o código é tratado primeiro.
   */
  const html = paraHtml('`**isto não é negrito**`');
  expect(html).not.toContain('<strong>');
});

test('títulos viram h3/h4/h5, e não h1', () => {
  /**
   * A página já tem o seu `h1` e o `h2` da publicação. Um `h1` aqui
   * dentro quebraria a hierarquia para quem lê com leitor de tela.
   */
  expect(paraHtml('# Grande')).toContain('<h3 class="tr-h1">Grande</h3>');
  expect(paraHtml('## Médio')).toContain('<h4 class="tr-h2">Médio</h4>');
  expect(paraHtml('### Pequeno')).toContain('<h5 class="tr-h3">Pequeno</h5>');
});

test('lista e lista numerada', () => {
  const lista = paraHtml('- pão\n- leite');
  expect(lista).toContain('<ul class="tr-lista">');
  expect(lista).toContain('<li>pão</li>');
  expect(lista).toContain('<li>leite</li>');

  const numerada = paraHtml('1. primeiro\n2. segundo');
  expect(numerada).toContain('<ol class="tr-lista">');
});

test('trocar de tipo de lista FECHA a anterior', () => {
  /**
   * Sem fechar, sai `<ul>` com `<ol>` dentro e a numeração some.
   */
  const html = paraHtml('- solto\n1. numerado');
  expect(html).toContain('</ul>');
  expect(html.indexOf('</ul>')).toBeLessThan(html.indexOf('<ol'));
});

test('citação e linha separadora', () => {
  expect(paraHtml('> palavra da direção')).toContain(
    '<blockquote class="tr-citacao">palavra da direção</blockquote>'
  );
  expect(paraHtml('---')).toContain('<hr class="tr-hr"/>');
});

test('QUEBRA DE LINHA SIMPLES É QUEBRA DE LINHA', () => {
  /**
   * Quem escreve um endereço em três linhas espera as três linhas. O
   * Markdown clássico juntaria tudo num parágrafo só — e o endereço da
   * loja sairia numa linha corrida.
   */
  const html = paraHtml('Rua A, 100\nCentro\nPirassununga');

  expect(html).toContain('<br/>');
  expect((html.match(/<p class="tr-p">/g) || []).length).toBe(1);
});

test('linha em branco separa parágrafo', () => {
  const html = paraHtml('Primeiro.\n\nSegundo.');
  expect((html.match(/<p class="tr-p">/g) || []).length).toBe(2);
});

test('texto vazio não quebra', () => {
  expect(paraHtml('')).toBe('');
  expect(paraHtml(undefined as unknown as string)).toBe('');
});

test('O MARCADOR INTERNO NÃO SOBRA NA TELA', async () => {
  /**
   * Os trechos de código saem de cena durante a formatação e voltam no
   * fim, trocados por um marcador invisível. Se ele vazasse, a pessoa
   * veria um caractere fantasma no meio do comunicado.
   *
   * E ele NÃO é o byte nulo: a primeira versão usava U+0000, e o
   * grep e o git diff passaram a tratar o arquivo como BINÁRIO — o
   * código sumia da revisão e da busca. Este teste guarda as duas
   * coisas.
   */
  const MARCA = String.fromCharCode(0xe000);
  const NULO = String.fromCharCode(0);

  const html = paraHtml('use `bun test` e depois **publique**');

  expect(html).not.toContain(MARCA);
  expect(html).not.toContain(NULO);
  expect(html).toContain('<code class="tr-codigo">bun test</code>');
  expect(html).toContain('<strong>publique</strong>');

  const fonte = await Bun.file('src/servicos/textoRico.ts').text();
  expect(fonte).not.toContain(NULO);
});

// ============================================================
// O TEXTO SEM MARCAÇÃO
// ============================================================

test('o resumo do cartão sai SEM os sinais', () => {
  /**
   * O cartão existe para se ler de relance. Com a marcação, a linha
   * sairia "## Inventário **sexta**" — e a mensagem que vai ao grupo do
   * chat sairia com asteriscos no meio.
   */
  const limpo = semFormatacao('## Inventário\n\nSerá **sexta**, às `08h`.');

  expect(limpo).not.toContain('#');
  expect(limpo).not.toContain('**');
  expect(limpo).not.toContain('`');
  expect(limpo).toContain('Inventário');
  expect(limpo).toContain('sexta');
});

test('o link vira só o texto dele', () => {
  expect(semFormatacao('Veja a [tabela](https://x.com/t.pdf)')).toBe('Veja a tabela');
});

test('o NEGRITO some do resumo, e não só o título', () => {
  /**
   * Cada marcação precisa do seu caso: sem este, tirar a linha do
   * negrito de `semFormatacao` passava batido — os outros casos usavam
   * texto que também tinha `#` ou crase, e falhavam por eles.
   */
  expect(semFormatacao('Será **sexta**')).toBe('Será sexta');
  expect(semFormatacao('Será *sexta*')).toBe('Será sexta');
  expect(semFormatacao('Era ~~quinta~~')).toBe('Era quinta');
  expect(semFormatacao('o `08h`')).toBe('o 08h');
  expect(semFormatacao('# Só o título')).toBe('Só o título');
});

test('a lista vira marcador, e não some', () => {
  /**
   * Trocar `- ` por nada colaria as palavras: "pãoleite". O marcador
   * mantém a leitura.
   */
  expect(semFormatacao('- pão\n- leite')).toContain('•');
});

// ============================================================
// OS BOTÕES DA BARRA
// ============================================================

test('o botão envolve a SELEÇÃO e devolve o cursor nela', () => {
  /**
   * Sem devolver a seleção, o cursor pula para o fim a cada clique — e
   * quem formata o meio de um parágrafo perde o lugar a cada palavra.
   */
  const r = aplicarMarcacao('bom dia pessoal', 4, 7, '**', '**', 'negrito');

  expect(r.texto).toBe('bom **dia** pessoal');
  expect(r.texto.slice(r.inicio, r.fim)).toBe('dia');
});

test('sem seleção, o botão escreve um exemplo já selecionado', () => {
  /**
   * Para a pessoa digitar por cima. Inserir `****` com o cursor no meio
   * funciona para quem conhece a marcação, e confunde quem não conhece.
   */
  const r = aplicarMarcacao('', 0, 0, '**', '**', 'negrito');

  expect(r.texto).toBe('**negrito**');
  expect(r.texto.slice(r.inicio, r.fim)).toBe('negrito');
});

test('O PREFIXO VALE PARA TODAS AS LINHAS SELECIONADAS', () => {
  /**
   * Marcar só a primeira de três linhas selecionadas deixaria as outras
   * duas de fora — não é o que ninguém espera ao selecionar três linhas
   * e pedir lista.
   */
  const r = aplicarPrefixo('pão\nleite\novos', 0, 14, '- ');

  expect(r.texto).toBe('- pão\n- leite\n- ovos');
});

test('o prefixo não se repete', () => {
  /**
   * Clicar duas vezes em "lista" daria `- - pão`.
   */
  const r = aplicarPrefixo('- pão', 0, 5, '- ');
  expect(r.texto).toBe('- pão');
});

test('o prefixo pega a linha inteira, mesmo com o cursor no meio dela', () => {
  const r = aplicarPrefixo('bom dia', 4, 4, '# ');
  expect(r.texto).toBe('# bom dia');
});

// ============================================================
// AS FERRAMENTAS QUE FALTAVAM
// ============================================================

test('TABELA: cabeçalho, corpo, e a linha de traços não aparece', () => {
  /**
   * É o que um comunicado de preço, de escala ou de horário por loja
   * precisa — sem ela essas três coisas viram lista de pares e não se
   * comparam de relance.
   *
   * A linha `|---|---|` separa o título do conteúdo e não pode virar
   * uma fileira de hífens no meio da tabela.
   */
  const html = paraHtml('| Loja | Horário |\n|---|---|\n| Descalvado | 09h |');

  expect(html).toContain('<th>Loja</th>');
  expect(html).toContain('<td>Descalvado</td>');
  expect(html).not.toContain('---');

  // Uma tabela só, aberta e fechada
  expect((html.match(/<table/g) || []).length).toBe(1);
  expect((html.match(/<\/table>/g) || []).length).toBe(1);
});

test('A TABELA FECHA quando o texto continua', () => {
  /**
   * Sem fechar, o parágrafo seguinte entrava como se fosse célula — e
   * o resto do comunicado sumia dentro da tabela.
   */
  const html = paraHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\nDepois da tabela.');

  expect(html.indexOf('</table>')).toBeLessThan(html.indexOf('Depois da tabela'));
  expect(html).toContain('<p class="tr-p">Depois da tabela.</p>');
});

test('a tabela rola de lado, em vez de espremer as colunas', () => {
  /**
   * Quatro colunas em 390px ficam ilegíveis se cada uma encolher para
   * caber. Esta tela é lida no celular do balcão.
   */
  expect(paraHtml('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('tr-tabela-rolagem');
});

test('ITEM PARA CONFERIR vira caixa, e não vira lista com colchetes', () => {
  /**
   * `- [ ] comprar` também casa com o padrão de lista comum. Sem tratar
   * a tarefa ANTES, o item sairia escrito "[ ] comprar" — com os
   * colchetes à mostra.
   */
  const html = paraHtml('- [ ] conferir caixa\n- [x] fechar gaveta');

  expect(html).toContain('tr-tarefas');
  expect(html).not.toContain('[ ]');
  expect(html).not.toContain('[x]');

  // A feita é riscada; a pendente, não
  expect(html).toContain('tr-caixa tr-feita');
  expect(html).toContain('class="tr-risco"');
});

test('marca-texto', () => {
  expect(paraHtml('isto é ==urgente==')).toContain('<mark class="tr-marca">urgente</mark>');
});

test('a marcação nova também some do resumo', () => {
  /**
   * Cada marcação precisa do seu caso em `semFormatacao` — senão o
   * cartão da lista sairia com `==` e `| a | b |` no meio.
   */
  expect(semFormatacao('isto é ==urgente==')).toBe('isto é urgente');
  expect(semFormatacao('- [ ] conferir')).not.toContain('[ ]');

  // A tabela vira as células, sem os canos nem a linha de traços
  const daTabela = semFormatacao(['| Loja | Hora |', '|---|---|', '| Descalvado | 09h |'].join(String.fromCharCode(10)));
  expect(daTabela).not.toContain('|');
  expect(daTabela).not.toContain('---');
  expect(daTabela).toContain('Descalvado');
});

test('O RESUMO DO CARTÃO CABE NUM CARTÃO', () => {
  /**
   * `semFormatacao` tira a marcação, mas devolve o texto INTEIRO — e um
   * procedimento operacional de dez páginas continua tendo dez páginas.
   * O cartão da lista saiu com o documento todo dentro, e a tela ficou
   * com cara de site que não carregou.
   *
   * O corte é no TEXTO, e não só no CSS: `line-clamp` disputava o
   * `display` com `block` e perdia.
   */
  const longo = 'palavra '.repeat(200);
  const curto = resumoCurto(longo);

  expect(curto.length).toBeLessThan(240);
  expect(curto.endsWith('…')).toBe(true);

  // Texto que já cabe não é cortado nem ganha reticência
  expect(resumoCurto('Inventário na sexta.')).toBe('Inventário na sexta.');
});

test('o corte cai num espaço, e não no meio da palavra', () => {
  /**
   * "peças comprad…" parece defeito; "peças…" parece resumo.
   *
   * O caso precisa ter uma palavra CRUZANDO o limite. A primeira
   * versão deste teste usava "a a a a…", onde todo corte cai num
   * espaço de qualquer jeito — e a mutação que desligava a busca pelo
   * espaço passava batida.
   */
  const texto = 'abcdefghij '.repeat(4) + 'superlongapalavra';
  const curto = resumoCurto(texto, 50);

  // O corte cai no espaço dos 44, e não dentro de "superlonga..."
  expect(curto).not.toContain('super');
  expect(curto).toBe('abcdefghij abcdefghij abcdefghij abcdefghij…');
});

test('o resumo também tira a marcação', () => {
  const curto = resumoCurto('## Título\n\nTexto **forte** e `código`.');

  expect(curto).not.toContain('#');
  expect(curto).not.toContain('**');
  expect(curto).not.toContain('`');
});
