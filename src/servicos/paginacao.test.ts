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
      // A receita da sincronização pelo que mudou também pagina: o motor
      // lê tudo por `buscarTodasAsLinhas` (teste abaixo)
      if (!antes.includes('buscarTodasAsLinhas') && !antes.includes('sincronizarPeloQueMudou')) {
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

// ------------------------------------------------------------------
// A ORDEM QUE NÃO EMPATA (29/10/2026)
//
// Página é "da linha 1000 à 1999" de uma ordem. Sem ordem, ou com uma que
// empata (dez ajustes no mesmo dia), o banco pode devolver os empatados em
// sequência diferente a cada página — e uma linha cai entre duas páginas,
// sem erro. No chat, leitura que não chega é mensagem lida contada como
// não lida (o balão da conta ADM com 5 e a lista vazia, no dia em que
// todos entraram). Toda consulta paginada termina na chave da tabela.
// ------------------------------------------------------------------

/** A chave de cada tabela lida em páginas. Tabela nova paginada entra aqui. */
const CHAVE: Record<string, string[]> = {
  conversas: ['id'],
  participantes: ['conversa_id', 'colaborador_id'],
  mensagens: ['id'],
  leituras_mensagem: ['mensagem_id', 'colaborador_id'],
  avisos_leitura: ['aviso_id', 'colaborador_id'],
  registros_ponto: ['id'],
  justificativas_ausencia: ['id'],
  ajustes_jornada: ['id'],
  marcacoes_originais: ['nsr'],
  tratamento_marcacao: ['nsr'],
  cpf_colaborador: ['colaborador_id'],
};

test('toda consulta paginada termina ordenada pela chave da tabela', async () => {
  const consultas: Array<{ arquivo: string; tabela: string; ordens: string[] }> = [];
  for (const arquivo of ['nuvem.ts', 'nuvemComunicacao.ts']) {
    const fonte = await Bun.file(new URL(`./${arquivo}`, import.meta.url)).text();
    const partes = fonte.split('buscarTodasAsLinhas<').slice(1);
    for (const parte of partes) {
      // A consulta vai até o rótulo ('as mensagens'), que fecha a chamada
      const consulta = parte.slice(0, parte.search(/,\s*\n?\s*'[^']+'\s*\n?\s*\)/));
      const tabela = consulta.match(/\.from\('(\w+)'\)/)?.[1] ?? '?';
      const ordens = [...consulta.matchAll(/\.order\('(\w+)'/g)].map((m) => m[1]);
      consultas.push({ arquivo, tabela, ordens });
    }
  }

  /*
    A SINCRONIZAÇÃO PELO QUE MUDOU (30/10/2026). A receita não escreve a
    consulta paginada: declara a chave (`colunasDaChave`), e o motor ordena
    por ela toda leitura que faz. As duas metades são conferidas — a receita
    declara a chave certa, e o motor não lê em páginas sem ordenar por ela.
  */
  const receitas: Array<{ arquivo: string; tabela: string; ordens: string[] }> = [];
  for (const arquivo of ['nuvem.ts', 'nuvemComunicacao.ts']) {
    const fonte = await Bun.file(new URL(`./${arquivo}`, import.meta.url)).text();
    for (const parte of fonte.split('sincronizarPeloQueMudou<').slice(1)) {
      const tabela = parte.match(/tabela: '(\w+)'/)?.[1] ?? '?';
      const ordens = [...(parte.match(/colunasDaChave: \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
      receitas.push({ arquivo, tabela, ordens });
    }
  }
  const motor = await Bun.file(new URL('./sincronizacaoIncremental.ts', import.meta.url)).text();
  const leiturasDoMotor = motor.split('buscarTodasAsLinhas<').slice(1);
  expect(leiturasDoMotor.length).toBeGreaterThanOrEqual(4);
  for (const leitura of leiturasDoMotor) expect(leitura.slice(0, 120)).toContain('naChave(');
  expect(motor).toContain('r.colunasDaChave.reduce((q, coluna) => q.order(coluna), consulta)');
  consultas.push(...receitas);

  expect(consultas.length).toBeGreaterThanOrEqual(10);
  for (const c of consultas) {
    const chave = CHAVE[c.tabela];
    expect({ ...c, chaveConhecida: !!chave }).toMatchObject({ chaveConhecida: true });
    for (const coluna of chave) {
      expect({ ...c, falta: coluna, tem: c.ordens.includes(coluna) }).toMatchObject({ tem: true });
    }
  }
});
