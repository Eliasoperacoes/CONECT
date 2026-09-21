/**
 * Leitura paginada — CONECTA
 *
 * ===================================================================
 * O DEFEITO QUE ISTO FECHA
 * ===================================================================
 *
 * O Supabase corta a resposta em 1000 linhas e NÃO avisa: não vem erro,
 * vem menos dado, e o sistema acredita que aquilo é tudo.
 *
 * O espelho de ponto do RH aparecia incompleto. São 89 pessoas × 4
 * batidas × 22 dias — quase 8 mil linhas por mês. O líder, cuja
 * segurança por linha devolve só a equipe dele, recebia o conjunto
 * inteiro e via o que tinha acabado de digitar. O RH, que enxerga a rede
 * toda, batia no teto — e como a ordem era por horário CRESCENTE, o que
 * ficava de fora era exatamente o mais recente.
 *
 * Duas pessoas olhando a mesma tela e vendo coisas diferentes, sem erro
 * em lugar nenhum.
 */
import { test, expect } from 'bun:test';
import { buscarTodasAsLinhas, LINHAS_POR_PAGINA } from './paginacao';

/** Uma tabela falsa com `quantas` linhas, cortando como o Supabase corta. */
const bancoFalso = (quantas: number) => {
  const pedidos: Array<[number, number]> = [];

  const montar = () => ({
    range: async (de: number, ate: number) => {
      pedidos.push([de, ate]);
      const pagina = [];
      for (let i = de; i <= Math.min(ate, quantas - 1); i++) pagina.push({ id: i });
      return { data: pagina, error: null };
    },
  });

  return { montar, pedidos };
};

test('TRAZ MAIS DE MIL LINHAS, QUE ERA O TETO INVISÍVEL', async () => {
  const { montar, pedidos } = bancoFalso(7800);

  const tudo = await buscarTodasAsLinhas<{ id: number }>(montar, 'teste');

  expect(tudo).not.toBeNull();
  expect(tudo!.length).toBe(7800);

  // Nenhuma linha se perdeu nem veio repetida
  expect(tudo![0].id).toBe(0);
  expect(tudo![7799].id).toBe(7799);
  expect(new Set(tudo!.map((l) => l.id)).size).toBe(7800);

  // Oito páginas: sete cheias e a última parcial
  expect(pedidos.length).toBe(8);
});

test('PÁGINA EXATA NÃO PERDE A ÚLTIMA VOLTA', async () => {
  /**
   * O caso de beirada que quebra implementações ingênuas: quando o total
   * é múltiplo do tamanho da página, a última página vem CHEIA — e parar
   * ali deixaria de conferir se havia mais.
   */
  const { montar, pedidos } = bancoFalso(LINHAS_POR_PAGINA * 2);

  const tudo = await buscarTodasAsLinhas<{ id: number }>(montar, 'teste');

  expect(tudo!.length).toBe(LINHAS_POR_PAGINA * 2);
  // Duas cheias mais uma vazia, que é o que prova que acabou
  expect(pedidos.length).toBe(3);
});

test('tabela pequena resolve numa página só', async () => {
  const { montar, pedidos } = bancoFalso(12);

  const tudo = await buscarTodasAsLinhas<{ id: number }>(montar, 'teste');

  expect(tudo!.length).toBe(12);
  expect(pedidos.length).toBe(1);
});

test('tabela vazia devolve lista vazia, e não nulo', async () => {
  const { montar } = bancoFalso(0);
  expect(await buscarTodasAsLinhas(montar, 'teste')).toEqual([]);
});

test('ERRO DO BANCO DEVOLVE NULO, E NÃO LISTA VAZIA', async () => {
  /**
   * A diferença decide se o cache é apagado. `[]` quer dizer "consultei e
   * não há nada"; `null` quer dizer "não consegui consultar". Confundir os
   * dois faria uma queda de wi-fi limpar o ponto do aparelho.
   */
  const montar = () => ({
    range: async () => ({ data: null, error: { message: 'sem rede' } }),
  });

  expect(await buscarTodasAsLinhas(montar, 'teste')).toBeNull();
});

test('erro no meio da leitura não devolve metade dos dados', async () => {
  // Meia verdade num espelho de ponto é pior do que erro declarado
  let chamadas = 0;
  const montar = () => ({
    range: async (de: number, ate: number) => {
      chamadas++;
      if (chamadas > 1) return { data: null, error: { message: 'caiu' } };
      const pagina = [];
      for (let i = de; i <= ate; i++) pagina.push({ id: i });
      return { data: pagina, error: null };
    },
  });

  expect(await buscarTodasAsLinhas(montar, 'teste')).toBeNull();
});

test('O MÓDULO NÃO IMPORTA NADA', async () => {
  /**
   * `nuvem` e `nuvemComunicacao` precisam dos dois, e `nuvem` já importa
   * `nuvemComunicacao`. Um import aqui pode fechar o ciclo que já apagou
   * a tela deste sistema.
   */
  const fonte = await Bun.file('src/servicos/paginacao.ts').text();
  expect([...fonte.matchAll(/from\s+'([^']+)'/g)]).toEqual([]);
});

test('AS LEITURAS QUE CRESCEM PASSAM PELA PAGINAÇÃO', async () => {
  /**
   * A lista é das tabelas que crescem sem teto. Uma delas voltar a ler
   * direto reintroduz o defeito calado — e no ponto isso significa duas
   * pessoas vendo espelhos diferentes.
   */
  const nuvem = await Bun.file('src/servicos/nuvem.ts').text();
  const chat = await Bun.file('src/servicos/nuvemComunicacao.ts').text();

  const faltando: string[] = [];

  /**
   * Só as LEITURAS.
   *
   * A primeira versão deste teste procurava a primeira aparição da
   * tabela e acusava a gravação — `insert` e `update` não precisam de
   * página nenhuma. O que não pode ficar sem paginar é `select`.
   */
  const conferir = (fonte: string, tabela: string) => {
    const marca = `.from('${tabela}')`;
    let achouLeitura = false;

    for (let em = fonte.indexOf(marca); em !== -1; em = fonte.indexOf(marca, em + 1)) {
      /**
       * `select` tem de ser o PRIMEIRO método depois do `from`.
       *
       * Uma gravação também termina em `.select('id')` — é como se
       * descobre que a segurança por linha recusou o update. Procurar o
       * `select` em qualquer lugar da cadeia acusava essa gravação como
       * leitura sem página.
       */
      const depois = fonte.slice(em + marca.length, em + marca.length + 40);
      const primeiroMetodo = depois.match(/\.\s*(\w+)\s*\(/s)?.[1];
      if (primeiroMetodo !== 'select') continue;

      achouLeitura = true;
      const antes = fonte.slice(Math.max(0, em - 300), em);
      if (!antes.includes('buscarTodasAsLinhas')) {
        faltando.push(`${tabela}: leitura sem paginação`);
      }
    }

    if (!achouLeitura) faltando.push(`${tabela}: não achei leitura nenhuma`);
  };

  conferir(nuvem, 'registros_ponto');
  conferir(nuvem, 'ajustes_jornada');
  conferir(nuvem, 'justificativas_ausencia');
  conferir(chat, 'mensagens');
  conferir(chat, 'leituras_mensagem');
  conferir(chat, 'avisos_leitura');

  expect(faltando).toEqual([]);
});
