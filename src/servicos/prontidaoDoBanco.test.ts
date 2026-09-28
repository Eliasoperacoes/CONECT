/**
 * O BANCO TEM TUDO O QUE O CÓDIGO MANDA? — CONECTA
 *
 * ===================================================================
 * O QUE MOTIVOU
 * ===================================================================
 *
 * O chat da rede inteira parou por UMA coluna. Toda mensagem passou a
 * levar `publicacao_id`, o script que a cria ficou por rodar, e o
 * PostgREST recusou CADA envio — inclusive um "bom dia", que manda a
 * coluna como nula do mesmo jeito.
 *
 * A causa raiz não foi a coluna: foi não haver NADA que percebesse a
 * diferença entre o que o código manda e o que o banco tem. Descobriu-se
 * pelo pior caminho possível, que é uma pessoa não conseguindo trabalhar.
 *
 * `supabase/conferir-prontidao.sql` faz essa pergunta ao banco, e a
 * lista de colunas dele é copiada dos mapeadores daqui. Lista copiada
 * envelhece: alguém acrescenta `publicacao_id` ao mapeador e esquece o
 * conferidor, e o conferidor passa a dar "tudo certo" justamente sobre
 * a coluna que vai quebrar.
 *
 * ===================================================================
 * ENTÃO ESTE ARQUIVO COMPARA OS DOIS
 * ===================================================================
 *
 * Lê as colunas que cada mapeador escreve e confere que TODAS estão no
 * arquivo SQL. É o mesmo princípio dos outros testes que leem
 * código-fonte: a regra mora num lugar, e o teste impede que a cópia
 * divirja em silêncio.
 *
 * O que ele NÃO faz: falar com o banco. Isso é o SQL, e quem o roda é o
 * Elias. Aqui só se garante que a pergunta seja a pergunta certa.
 */
import { test, expect } from 'bun:test';

/** Qual mapeador escreve em qual tabela. */
const MAPEADORES: { arquivo: string; funcao: string; tabela: string }[] = [
  { arquivo: 'src/servicos/nuvem.ts', funcao: 'paraLinha', tabela: 'colaboradores' },
  { arquivo: 'src/servicos/nuvem.ts', funcao: 'paraLinhaPonto', tabela: 'registros_ponto' },
  { arquivo: 'src/servicos/nuvem.ts', funcao: 'paraLinhaAjuste', tabela: 'ajustes_jornada' },
  {
    arquivo: 'src/servicos/nuvem.ts',
    funcao: 'paraLinhaJustificativa',
    tabela: 'justificativas_ausencia',
  },
  {
    arquivo: 'src/servicos/nuvemComunicacao.ts',
    funcao: 'paraLinhaMensagem',
    tabela: 'mensagens',
  },
  {
    arquivo: 'src/servicos/nuvemComunicacao.ts',
    funcao: 'paraLinhaConversa',
    tabela: 'conversas',
  },
  { arquivo: 'src/servicos/nuvemComunicacao.ts', funcao: 'paraLinhaAviso', tabela: 'avisos_rede' },
  /* A auditoria guarda quem alterou o quê num sistema de ponto: é a
     última tabela que pode falhar calada */
  {
    arquivo: 'src/servicos/nuvemComunicacao.ts',
    funcao: 'paraLinhaAuditoria',
    tabela: 'auditoria',
  },
];

/**
 * As colunas que um mapeador escreve.
 *
 * Os mapeadores são objetos literais de um nível: `coluna: valor`, com
 * dois espaços de recuo. A regex casa exatamente isso — e a asserção de
 * que a lista não veio vazia é o que impede o teste de passar por
 * engano no dia em que o formato mudar.
 */
/**
 * O SQL SEM OS COMENTÁRIOS.
 *
 * Existe porque duas asserções deste arquivo passavam por engano, e a
 * mutação as pegou: eu apaguei a linha `... as tem_update` do SQL e o
 * teste continuou verde, porque `tem_update` aparecia no COMENTÁRIO
 * logo acima ("Esperado: `tem_update` e `tem_insert` verdadeiros").
 * Mesma coisa com `returning`.
 *
 * Estes arquivos têm mais comentário do que consulta — de propósito,
 * porque quem os roda precisa saber o que vai acontecer. Isso torna
 * `toContain` sobre o texto cru quase inútil: quase toda palavra
 * importante está explicada em algum lugar.
 *
 * É a mesma armadilha do `'retorno_almoco: Utensils'`, que é substring
 * de `UtensilsCrossed` e fez dois ícones diferentes passarem por iguais.
 */
const semComentarios = (sql: string): string =>
  sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const colunasDe = (fonte: string, funcao: string): string[] => {
  const inicio = fonte.indexOf(`const ${funcao} = (`);
  expect(inicio).toBeGreaterThan(-1);

  const fim = fonte.indexOf('\n});', inicio);
  expect(fim).toBeGreaterThan(inicio);

  return [...fonte.slice(inicio, fim).matchAll(/^ {2}([a-z_][a-z0-9_]*):/gm)].map((m) => m[1]);
};

test('O CONFERIDOR CONHECE TODA COLUNA QUE O CÓDIGO MANDA', async () => {
  /**
   * O teste que teria evitado a parada do chat.
   *
   * Uma coluna nova no mapeador sem a mesma coluna no conferidor faz
   * este teste falhar — e a mensagem diz o nome dela, que é o que
   * alguém precisa para escrever o script do Supabase.
   */
  const sql = semComentarios(await Bun.file('supabase/conferir-prontidao.sql').text());

  const faltando: string[] = [];

  for (const { arquivo, funcao, tabela } of MAPEADORES) {
    const fonte = await Bun.file(arquivo).text();
    const colunas = colunasDe(fonte, funcao);

    // Mapeador vazio seria um teste que passa sem conferir nada
    expect(colunas.length).toBeGreaterThan(3);

    for (const coluna of colunas) {
      if (!sql.includes(`('${tabela}', '${coluna}')`)) {
        faltando.push(`${tabela}.${coluna}`);
      }
    }
  }

  expect(faltando).toEqual([]);
});

test('o conferidor não inventa coluna que o código NÃO manda', async () => {
  /**
   * O outro lado. Uma linha a mais no conferidor aponta para uma coluna
   * que o banco não precisa ter — e cobrar do Elias um script que não
   * resolve nada é pior do que não cobrar: ensina a ignorar o resultado.
   *
   * Também pega o caso em que uma coluna SAI do código e a lista fica
   * para trás, que é como esta lista apodreceria com o tempo.
   */
  const sql = semComentarios(await Bun.file('supabase/conferir-prontidao.sql').text());

  const noCodigo = new Set<string>();
  for (const { arquivo, funcao, tabela } of MAPEADORES) {
    const fonte = await Bun.file(arquivo).text();
    for (const coluna of colunasDe(fonte, funcao)) noCodigo.add(`${tabela}.${coluna}`);
  }

  const noSql = [...sql.matchAll(/^ {2}\('([a-z_]+)', '([a-z_0-9]+)'\)/gm)].map(
    (m) => `${m[1]}.${m[2]}`
  );

  expect(noSql.length).toBeGreaterThan(50);
  expect(noSql.filter((c) => !noCodigo.has(c))).toEqual([]);
});

test('A COLUNA QUE PAROU O CHAT está na lista', async () => {
  /**
   * O caso concreto, preso num teste. `publicacao_id` é mandada em TODA
   * mensagem — um "bom dia" a manda como nula —, e foi a ausência dela
   * no banco que recusou cada envio da rede.
   *
   * Fica aqui nomeada de propósito: os dois testes acima são regras
   * gerais, e regra geral é fácil de satisfazer com uma lista vazia dos
   * dois lados. Este aponta para o caso que já aconteceu.
   */
  const sql = semComentarios(await Bun.file('supabase/conferir-prontidao.sql').text());
  const fonte = await Bun.file('src/servicos/nuvemComunicacao.ts').text();

  expect(colunasDe(fonte, 'paraLinhaMensagem')).toContain('publicacao_id');
  expect(sql).toContain("('mensagens', 'publicacao_id')");
});

test('o conferidor olha as tabelas que o sistema ESCREVE', async () => {
  /**
   * A consulta de políticas não sai de mapeador nenhum, então nenhum
   * teste acima a alcança. Esta lista é o outro risco de rollout: RLS
   * ligada sem política de UPDATE não dá erro — o update afeta ZERO
   * linhas e devolve sucesso. A tela diz "salvo" e o banco não mudou.
   */
  const sql = semComentarios(await Bun.file('supabase/conferir-prontidao.sql').text());

  for (const tabela of [
    'colaboradores',
    'registros_ponto',
    'ajustes_jornada',
    'justificativas_ausencia',
    'mensagens',
    'conversas',
    'participantes',
    'avisos_rede',
    'auditoria',
  ]) {
    expect(sql).toContain(`('${tabela}')`);
  }

  expect(sql).toContain('tem_update');
  expect(sql).toContain('relrowsecurity');
});

test('ZERAR SALDO só alcança quem NÃO tem marcação nenhuma', async () => {
  /**
   * O script apaga apuração, e apagar é a operação que este sistema
   * evita em todo o resto. A trava que o torna seguro é uma só: a
   * condição `not exists` sobre `registros_ponto`.
   *
   * Sem ela — ou com um `exists` no lugar do `not exists` — o script
   * apagaria o banco de horas de quem trabalhou. Por isso ela é cobrada
   * aqui, e não só revisada de olho.
   */
  const sql = semComentarios(await Bun.file('supabase/zerar-saldo-sem-ponto.sql').text());

  expect(sql).toContain('delete from public.ajustes_jornada');
  expect(sql).toMatch(
    /where not exists \(\s*select 1\s*from public\.registros_ponto r\s*where r\.colaborador_id = a\.colaborador_id/
  );

  // Só apuração sai. Marcação, justificativa e mensagem não se tocam
  expect(sql).not.toContain('delete from public.registros_ponto');
  expect(sql).not.toContain('delete from public.justificativas_ausencia');
  expect(sql).not.toContain('delete from public.mensagens');
  expect(sql).not.toContain('delete from public.colaboradores');

  // E devolve o que removeu: conferência e ação na mesma passada
  expect(sql).toContain('returning');
});

test('O DIAGNÓSTICO VEM NUMA CONSULTA SÓ', async () => {
  /**
   * O SQL Editor do Supabase mostra o resultado da ÚLTIMA instrução.
   *
   * Isso custou três idas e voltas: eu mandava um arquivo com quatro
   * `select`, o Elias rodava, e voltava sempre o print do quarto. As
   * três primeiras respostas existiam e ninguém as via — inclusive a
   * que decidia se o sistema podia abrir para a loja.
   *
   * Não é limitação do editor: é arquivo desenhado para a ferramenta
   * errada. Um `union all` com uma coluna `secao` devolve tudo de uma
   * vez, e rolar a lista é mais barato do que rodar de novo.
   *
   * Vale só para os arquivos de DIAGNÓSTICO. Os que alteram estrutura
   * têm várias instruções por natureza — e terminam com um `select` de
   * conferência justamente porque é ele que fica à vista.
   */
  for (const arquivo of ['conferir-prontidao.sql', 'medir-consumo.sql']) {
    const sql = semComentarios(await Bun.file(`supabase/${arquivo}`).text());
    const instrucoes = sql.split(';').filter((t) => t.trim().length > 0);

    expect({ arquivo, instrucoes: instrucoes.length }).toEqual({ arquivo, instrucoes: 1 });

    /**
     * E o RESULTADO traz a coluna que separa as seções.
     *
     * Conferir só `toContain('secao')` não bastava: a palavra aparece
     * em cada ramo do `union all` (`'1. FOTO DE PERFIL' as secao`), e
     * tirá-la da projeção de fora não a fazia sumir do arquivo. A
     * mutação passou, e o teste estaria dizendo que o resultado tem uma
     * coluna que ele não teria.
     */
    expect(sql).toContain('select ordem, secao, item, valor, observacao from (');
    expect(sql).toContain('union all');
  }
});
