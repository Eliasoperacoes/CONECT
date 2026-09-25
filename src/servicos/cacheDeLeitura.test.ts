/**
 * Verificação do CACHE DE LEITURA — CONECTA
 *
 * O que motivou, medido com a rede do tamanho real (89 pessoas, 60 dias,
 * 21.360 marcações):
 *
 *   obterResumoDoPeriodo (a lista da equipe) ... 33.751 ms  ->  792 ms
 *   relacaoSemanalDaEquipe (o ciclo) ...........  6.815 ms  ->  164 ms
 *
 * `obterJornadaDoDia` chamava `lerRegistros()`, e `obterResumoDoPeriodo`
 * a chamava 89 × 30 vezes. Cada uma refazia o `JSON.parse` de 3,1 MB
 * para ler as quatro batidas de um dia de uma pessoa.
 *
 * O PERIGO DE UM CACHE é servir dado velho — e este sistema decide hora
 * trabalhada. Por isso a maior parte deste arquivo confere que ele se
 * refaz, e não que ele guarda.
 */
import { test, expect, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  parses = 0;
  get length() {
    return this.dados.size;
  }
  key(i: number) {
    return [...this.dados.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.dados.has(k) ? this.dados.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.dados.set(k, String(v));
  }
  removeItem(k: string) {
    this.dados.delete(k);
  }
  clear() {
    this.dados.clear();
  }
}

const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const { lerLista, esquecerCacheDeLeitura } = await import('./cacheDeLeitura');

const CHAVE = 'teste_lista';

beforeEach(() => {
  armazenamento.clear();
  esquecerCacheDeLeitura();
});

test('lê a lista', () => {
  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'a' }, { id: 'b' }]));
  expect(lerLista(CHAVE)).toEqual([{ id: 'a' }, { id: 'b' }]);
});

test('GUARDA: duas leituras seguidas não reparseiam', () => {
  /**
   * A prova de que o cache age: os ITENS são o mesmo objeto. Um
   * `JSON.parse` novo produziria objetos diferentes — é exatamente
   * essa diferença que custava 32 segundos.
   */
  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'a' }]));

  const primeira = lerLista<{ id: string }>(CHAVE);
  const segunda = lerLista<{ id: string }>(CHAVE);

  expect(primeira[0]).toBe(segunda[0]);
});

test('SE REFAZ quando o texto muda', () => {
  /**
   * O lado que não pode falhar. Servir a lista velha depois de uma
   * batida seria esconder a marcação que a pessoa acabou de fazer.
   */
  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'a' }]));
  expect(lerLista(CHAVE)).toEqual([{ id: 'a' }]);

  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'a' }, { id: 'b' }]));
  expect(lerLista(CHAVE)).toEqual([{ id: 'a' }, { id: 'b' }]);
});

test('se refaz mesmo quando ninguém avisa', () => {
  /**
   * É a razão de comparar o TEXTO em vez de confiar num aviso de
   * escrita: há mais de trinta lugares que gravam, e um deles
   * esqueceria de avisar. Aqui o texto é trocado por baixo, sem
   * nenhuma chamada ao cache — e ele acompanha.
   */
  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'antigo' }]));
  lerLista(CHAVE);

  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'novo' }]));
  expect(lerLista(CHAVE)).toEqual([{ id: 'novo' }]);
});

test('A LISTA DEVOLVIDA É UMA CÓPIA', () => {
  /**
   * Duas funções do ponto fazem `registros.push(registro)` antes de
   * gravar. Com a lista guardada, esse `push` entraria no cache — e a
   * marcação apareceria duas vezes no espelho.
   */
  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'a' }]));

  const primeira = lerLista<{ id: string }>(CHAVE);
  primeira.push({ id: 'intruso' });

  expect(lerLista(CHAVE)).toHaveLength(1);

  /**
   * E TAMBÉM NA LEITURA QUE VEM DO CACHE.
   *
   * A primeira versão deste teste só exercitava a leitura que passa
   * pelo `parse`. A mutação "devolve a lista guardada, sem copiar" —
   * que é justamente o caminho do cache, o comum — passava batida.
   */
  const daSegundaVez = lerLista<{ id: string }>(CHAVE);
  daSegundaVez.push({ id: 'intruso-2' });
  daSegundaVez.splice(0, 1);

  expect(lerLista(CHAVE)).toEqual([{ id: 'a' }]);
});

test('ordenar a lista devolvida não bagunça o cache', () => {
  /**
   * `sort` muta no lugar, e várias telas ordenam o que leem.
   */
  armazenamento.setItem(CHAVE, JSON.stringify([{ id: 'b' }, { id: 'a' }]));

  lerLista<{ id: string }>(CHAVE).sort((x, y) => x.id.localeCompare(y.id));

  expect(lerLista<{ id: string }>(CHAVE).map((i) => i.id)).toEqual(['b', 'a']);
});

test('chave vazia, texto corrompido e não-lista devolvem lista vazia', () => {
  /**
   * Texto corrompido não pode derrubar a tela de quem só queria bater o
   * ponto. E `{}` no lugar de `[]` já aconteceu aqui.
   */
  expect(lerLista('nao_existe')).toEqual([]);

  armazenamento.setItem(CHAVE, 'isto não é json');
  expect(lerLista(CHAVE)).toEqual([]);

  armazenamento.setItem(CHAVE, JSON.stringify({ nao: 'e lista' }));
  expect(lerLista(CHAVE)).toEqual([]);

  /**
   * O caso que expõe a checagem de lista, e que um objeto não expõe.
   *
   * `[...{a:1}]` lança e cai no `catch`, dando `[]` de qualquer jeito —
   * então tirar o `Array.isArray` passava despercebido. Já uma STRING
   * é iterável: `[..."abc"]` vira `['a','b','c']`, e a tela receberia
   * três registros inventados a partir de um texto solto.
   */
  armazenamento.setItem(CHAVE, JSON.stringify('abc'));
  expect(lerLista(CHAVE)).toEqual([]);

  armazenamento.setItem(CHAVE, JSON.stringify(42));
  expect(lerLista(CHAVE)).toEqual([]);
});

test('duas chaves não se misturam', () => {
  armazenamento.setItem('a', JSON.stringify([{ id: 'de-a' }]));
  armazenamento.setItem('b', JSON.stringify([{ id: 'de-b' }]));

  expect(lerLista('a')).toEqual([{ id: 'de-a' }]);
  expect(lerLista('b')).toEqual([{ id: 'de-b' }]);
  expect(lerLista('a')).toEqual([{ id: 'de-a' }]);
});

// ============================================================
// ONDE ELE FOI LIGADO
// ============================================================

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('AS QUATRO LEITURAS QUENTES PASSAM PELO CACHE', async () => {
  /**
   * As quatro que a medição apontou, com o número de leituras para
   * montar "Equipe & Ponto":
   *
   *   registros de ponto .... 2.759   (3,1 MB por parse)
   *   feriados .............. 4.984
   *   colaboradores ......... 2.672
   *   justificativas ........   968
   */
  const ponto = semComentarios(await Bun.file('src/servicos/ponto.ts').text());
  expect(ponto).toContain('lerLista<RegistroPonto>(CHAVE_REGISTROS_PONTO)');
  expect(ponto).toContain('lerLista<AjusteJornada>(CHAVE_AJUSTES)');

  const feriados = semComentarios(
    await Bun.file('src/servicos/feriadosCache.ts').text()
  );
  expect(feriados).toContain('lerLista<Feriado>(CHAVE_FERIADOS)');

  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());
  expect(banco).toContain('lerLista<Colaborador>(CHAVE_COLABORADORES)');

  const ausencias = semComentarios(
    await Bun.file('src/servicos/justificativasCache.ts').text()
  );
  expect(ausencias).toContain('lerLista<JustificativaAusencia>(CHAVE_JUSTIFICATIVAS)');
});

test('OS AVISOS FICARAM DE FORA, e de propósito', async () => {
  /**
   * `alternarConfirmacaoAviso` e `alternarFixadoAviso` fazem
   * `lista[indice].campo = x` — mutam um ITEM, e a cópia rasa não
   * protege contra isso: os objetos continuam compartilhados.
   *
   * Cachear ali gravaria a confirmação de leitura de um aviso no cache
   * sem passar pelo banco.
   */
  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());

  const inicio = banco.indexOf('obterAvisosRede()');
  const corpo = banco.slice(inicio, inicio + 500);

  expect(corpo).toContain('JSON.parse');
  expect(corpo).not.toContain('lerLista');
});

test('o cache é FOLHA: não importa ninguém', async () => {
  /**
   * Ele foi ligado a `feriadosCache` e a `justificativasCache`, que têm
   * teste proibindo import — o ciclo `nuvem → feriados → ponto → nuvem`
   * já apagou a tela deste sistema uma vez.
   *
   * Um módulo que não importa ninguém não pode fechar ciclo com
   * ninguém. É essa a permissão, e ela tem de continuar verdadeira.
   */
  const fonte = await Bun.file('src/servicos/cacheDeLeitura.ts').text();
  expect([...fonte.matchAll(/from\s+'([^']+)'/g)]).toHaveLength(0);
});
