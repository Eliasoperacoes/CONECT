/**
 * Verificação da ORDEM DENTRO DE CADA .SQL — CONECTA
 *
 * O que motivou, e é um erro que só aparece no Supabase:
 *
 *   ERROR: 42883: function public.minha_loja() does not exist
 *   LINE 89: loja_destino = 'Todas' or loja_destino = public.minha_loja()
 *
 * `central-da-direcao.sql` criava `aviso_me_alcanca`, que CHAMA
 * `minha_loja`, e só depois criava `minha_loja`. O Postgres valida o
 * corpo de uma função `language sql` no momento da criação — diferente
 * de `plpgsql`, que só descobre no primeiro uso.
 *
 * E o SQL Editor do Supabase roda o arquivo inteiro numa transação: a
 * falha na linha 89 desfez também os `alter table` das linhas de cima.
 * O script parecia ter rodado pela metade e não tinha rodado nada.
 *
 * O `bun run test` não roda SQL. Este arquivo LÊ os scripts e confere a
 * ordem — é o que dá para verificar daqui, e é o suficiente para este
 * defeito, que é de ordem e não de conteúdo.
 */
import { test, expect } from 'bun:test';

const PASTA = 'supabase';

const listarSql = async (): Promise<string[]> => {
  const { readdirSync } = await import('node:fs');
  return readdirSync(PASTA)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => `${PASTA}/${f}`);
};

/** O SQL sem comentário: uma chamada citada numa explicação não conta. */
const semComentarios = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

test('TODA FUNÇÃO É CRIADA ANTES DE SER USADA, no mesmo arquivo', async () => {
  /**
   * Só olha as funções que o PRÓPRIO arquivo cria. As que vêm do
   * `esquema.sql` — `meu_nivel`, `sou_admin`, `cuido_de_pessoas` — já
   * existem no banco quando o delta roda, e exigir que fossem
   * recriadas aqui seria pedir a cópia que este projeto combate.
   */
  const problemas: string[] = [];

  for (const caminho of await listarSql()) {
    const sql = semComentarios(await Bun.file(caminho).text());

    const criadas = new Map<string, number>();
    for (const achado of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi
    )) {
      const nome = achado[1];
      if (!criadas.has(nome)) criadas.set(nome, achado.index ?? 0);
    }

    for (const [nome, ondeFoiCriada] of criadas) {
      /**
       * A primeira CHAMADA — `public.nome(` — que não seja a própria
       * criação. Uma função pode chamar a si mesma; o que não pode é
       * outra função chamá-la antes de ela existir.
       */
      for (const uso of sql.matchAll(new RegExp(`public\\.${nome}\\s*\\(`, 'g'))) {
        const onde = uso.index ?? 0;

        // A ocorrência dentro do `create function` dela mesma não conta
        if (Math.abs(onde - ondeFoiCriada) < nome.length + 40) continue;

        if (onde < ondeFoiCriada) {
          problemas.push(
            `${caminho}: public.${nome}() é usada antes de ser criada`
          );
        }
        break;
      }
    }
  }

  expect(problemas).toEqual([]);
});

test('o arquivo da Central cria minha_loja ANTES de aviso_me_alcanca', async () => {
  /**
   * O caso concreto que derrubou o script, guardado por nome: as duas
   * podem voltar a trocar de lugar numa edição, e o erro só apareceria
   * no Supabase do Elias.
   */
  const sql = await Bun.file('supabase/central-da-direcao.sql').text();

  const criaLoja = sql.indexOf('create or replace function public.minha_loja');
  const criaAlcanca = sql.indexOf('create or replace function public.aviso_me_alcanca');

  expect(criaLoja).toBeGreaterThan(-1);
  expect(criaAlcanca).toBeGreaterThan(-1);
  expect(criaLoja).toBeLessThan(criaAlcanca);
});

test('a política vem DEPOIS da função que ela chama', async () => {
  /**
   * Mesma armadilha, um passo à frente: `create policy` também é
   * validada na criação.
   */
  const sql = semComentarios(
    await Bun.file('supabase/central-da-direcao.sql').text()
  );

  const criaAlcanca = sql.indexOf('create or replace function public.aviso_me_alcanca');
  const politica = sql.indexOf('create policy avisos_leitura on public.avisos_rede');

  expect(politica).toBeGreaterThan(criaAlcanca);
});

test('todo .sql que mexe em estrutura recarrega o esquema', async () => {
  /**
   * Sem `notify pgrst, 'reload schema'`, a API continua servindo o
   * catálogo velho: a coluna existe no banco e o navegador recebe
   * "Could not find the column in the schema cache" — que foi
   * exatamente o erro desta semana.
   */
  const faltando: string[] = [];

  for (const caminho of await listarSql()) {
    const sql = semComentarios(await Bun.file(caminho).text());

    const mexeEmEstrutura =
      /alter\s+table/i.test(sql) ||
      /create\s+table/i.test(sql) ||
      /add\s+column/i.test(sql);

    if (mexeEmEstrutura && !sql.includes("notify pgrst, 'reload schema'")) {
      faltando.push(caminho);
    }
  }

  expect(faltando).toEqual([]);
});
