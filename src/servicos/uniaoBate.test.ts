/**
 * As uniões do TypeScript batem com as restrições do banco — CONECTA
 *
 * ===================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * ===================================================================
 *
 * Duas vezes na mesma semana o mesmo erro chegou pela tela, em produção:
 *
 *   new row violates check constraint "ajustes_jornada_origem_check"
 *   new row violates check constraint "registros_ponto_metodo_check"
 *
 * Nas duas eu acrescentei um valor a uma união do TypeScript — uma
 * origem de apuração, um método de marcação — e o banco continuou com a
 * lista antiga. O código compilava, os testes passavam, o build passava.
 * O defeito só aparecia quando alguém clicava.
 *
 * O padrão é claro o bastante para virar teste: quando um valor de união
 * viaja para uma coluna com `check (... in (...))`, os dois lados
 * precisam conhecer a mesma lista.
 *
 * ===================================================================
 * O QUE ELE NÃO FAZ
 * ===================================================================
 *
 * Não conecta ao banco. Ele lê os arquivos `.sql` do repositório, que é
 * o que o Elias roda — se a lista estiver certa aqui e ele não tiver
 * rodado o arquivo, o erro continua aparecendo. O que este teste impede
 * é o caso pior: eu esquecer de ESCREVER o delta.
 */
import { test, expect } from 'bun:test';

/**
 * Onde cada união vive, dos dois lados.
 *
 * `arquivos` lista todos os `.sql` que podem redefinir a restrição —
 * basta UM deles conhecer o valor novo, porque o mais recente é o que o
 * Elias roda. O `esquema.sql` entra sempre: é ele que monta banco novo.
 */
const UNIOES = [
  {
    nome: 'MetodoMarcacao',
    tipo: 'MetodoMarcacao',
    restricao: 'registros_ponto_metodo_check',
    coluna: 'metodo',
    arquivos: [
      'esquema.sql',
      'corrigir-ponto-pelo-lider.sql',
      'ponto-do-lider-completo.sql',
      'preencher-espelho-pelo-turno.sql',
    ],
  },
  {
    nome: 'OrigemAjuste',
    tipo: 'OrigemAjuste',
    restricao: 'ajustes_jornada_origem_check',
    coluna: 'origem',
    arquivos: [
      'ponto-tolerancia-justificativas.sql',
      'correcao-nao-pede-aprovacao.sql',
    ],
  },
  {
    nome: 'TipoAusencia',
    tipo: 'TipoAusencia',
    restricao: 'justificativas_ausencia_tipo_check',
    coluna: 'tipo',
    arquivos: [
      'ponto-tolerancia-justificativas.sql',
      'folga-sabado.sql',
      'escala-pela-lideranca.sql',
    ],
  },
];

/** Os valores de uma união de literais, lidos da fonte. */
const valoresDaUniao = (fonte: string, tipo: string): string[] => {
  const inicio = fonte.indexOf(`export type ${tipo} =`);
  if (inicio === -1) return [];

  const fim = fonte.indexOf(';', inicio);
  const corpo = fonte.slice(inicio, fim);

  return [...corpo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

const tipos = await Bun.file(new URL('../tipos.ts', import.meta.url)).text();

for (const uniao of UNIOES) {
  test(`${uniao.nome}: todo valor do código existe no banco`, async () => {
    const valores = valoresDaUniao(tipos, uniao.tipo);

    // Se a união sumiu ou mudou de forma, o teste precisa saber disso
    expect(valores.length).toBeGreaterThan(1);

    const sqls = await Promise.all(
      uniao.arquivos.map(async (nome) => {
        const arquivo = Bun.file(new URL(`../../supabase/${nome}`, import.meta.url));
        return (await arquivo.exists()) ? arquivo.text() : '';
      })
    );

    /**
     * SÓ O QUE ESTÁ DENTRO DO `check (coluna in (...))`.
     *
     * A primeira versão deste teste procurava o valor em qualquer lugar
     * do arquivo — e passou no erro que ele existia para pegar. O
     * `preenchimento_turno` aparecia numa POLÍTICA, que decide quem pode
     * gravar; a restrição, que decide o que o banco aceita, continuava
     * sem ele. São duas perguntas diferentes no mesmo arquivo.
     */
    const aceitos = new Set<string>();
    const padrao = new RegExp(`check\\s*\\(\\s*${uniao.coluna}\\s+in\\s*\\(([^)]*)\\)`, 'gi');

    for (const sql of sqls) {
      for (const achado of sql.matchAll(padrao)) {
        for (const valor of achado[1].matchAll(/'([a-z_]+)'/g)) aceitos.add(valor[1]);
      }
    }

    // Nenhuma restrição encontrada quer dizer que a lista de arquivos
    // envelheceu — e um teste que não encontra nada passa por engano
    expect(aceitos.size).toBeGreaterThan(1);

    /**
     * Basta UM dos arquivos conhecer o valor: cada delta reescreve a
     * lista inteira, e os antigos ficam no repositório como histórico do
     * que já foi rodado.
     */
    expect(valores.filter((v) => !aceitos.has(v))).toEqual([]);
  });
}

test('a restrição do banco não conhece valor que o código não tem', async () => {
  /**
   * O outro lado do mesmo erro, e mais silencioso: uma restrição que
   * aceita um valor que o TypeScript não conhece. Nada quebra — o banco
   * simplesmente guarda uma linha que nenhuma tela sabe desenhar, e ela
   * aparece como buraco no espelho meses depois.
   */
  const sql = await Bun.file(
    new URL('../../supabase/esquema.sql', import.meta.url)
  ).text();

  const linha = sql
    .split('\n')
    .find((l) => l.includes('check (metodo in ('));
  expect(linha).toBeDefined();

  const noBanco = [...linha!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const noCodigo = valoresDaUniao(tipos, 'MetodoMarcacao');

  expect(noBanco.filter((v) => !noCodigo.includes(v))).toEqual([]);
});
