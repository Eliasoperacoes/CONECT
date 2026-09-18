/**
 * A ORDEM DE MONTAGEM DO BANCO — CONECTA
 *
 * `esquema.sql` sozinho NÃO monta o sistema inteiro: as funções que vieram
 * depois moram em arquivos próprios. Rodar só ele produz um sistema onde
 * folga, resposta de mensagem e jornada da semana ficam mudas — sem erro na
 * tela, simplesmente não gravam.
 *
 * Este teste existe para que o próximo arquivo `.sql` não seja esquecido na
 * documentação. Um arquivo que ninguém sabe que precisa rodar é um
 * incidente esperando uma base nova.
 */
import { test, expect } from 'bun:test';
import { Glob } from 'bun';

const lerOperacao = async (): Promise<string> =>
  Bun.file(new URL('../../docs/OPERACAO.md', import.meta.url)).text();

/**
 * Só o nome do arquivo, sem a pasta.
 *
 * O Glob devolve o caminho com barra no Linux e com barra invertida no
 * Windows. A barra invertida é montada por código de propósito: escrita
 * direto, ela some no meio dos escapes até chegar aqui.
 */
const soONomeDoArquivo = (caminho: string): string => {
  const partes = caminho
    .split('/')
    .flatMap((p) => p.split(String.fromCharCode(92)));
  return partes[partes.length - 1];
};

test('todo arquivo .sql esta citado na documentacao de operacao', async () => {
  const doc = await lerOperacao();
  const arquivos = [...new Glob('supabase/*.sql').scanSync('.')].map(soONomeDoArquivo);

  expect(arquivos.length).toBeGreaterThan(10);

  const esquecidos = arquivos.filter((nome) => {
    // Os diagnósticos entram por família, não um a um
    if (/^(diagnostico|verificar)-/.test(nome)) {
      return !doc.includes('diagnostico-*.sql');
    }
    return !doc.includes(nome);
  });

  expect(esquecidos).toEqual([]);
});

test('a documentacao avisa que o esquema sozinho nao basta', async () => {
  const doc = await lerOperacao();

  /**
   * O aviso importa mais do que a lista: quem vai montar uma base nova lê o
   * nome "esquema.sql" e acha que acabou. Era o que a documentação dizia
   * antes — "Banco novo do zero" — e não era verdade.
   */
  expect(doc).toContain('NÃO monta o sistema inteiro');
  expect(doc).toContain('participantes-atualizacao.sql');
  expect(doc).toContain('jornada-por-pessoa.sql');
});

test('a tabela de ausencias tem regra para tudo que o app faz nela', async () => {
  /**
   * O app insere, lê e atualiza `justificativas_ausencia`. Uma operação sem
   * regra na segurança por linha não dá erro — ela encontra zero linhas e
   * devolve sucesso. Foi assim que fixar e excluir conversa ficaram meses
   * sem gravar.
   */
  const sql = await Bun.file(
    new URL('../../supabase/ponto-tolerancia-justificativas.sql', import.meta.url)
  ).text();

  const operacoes = [...sql.matchAll(/for (select|insert|update|delete|all)/g)].map(
    (m) => m[1]
  );

  for (const precisa of ['select', 'insert', 'update']) {
    expect(operacoes).toContain(precisa);
  }
});
