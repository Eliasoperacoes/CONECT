/**
 * Verificação de carregamento — CONECTA
 *
 * O aplicativo tem de ABRIR. Parece óbvio, e já caiu duas vezes por motivos
 * que nenhuma ferramenta pegava:
 *
 *  1. `useMemo` declarado depois de um `return` condicional no App.tsx —
 *     React conta hooks e derruba tudo.
 *  2. Ciclo de importação: `nuvem` → `justificativas` → `ponto` → `nuvem`.
 *     `ponto` roda `new ServicoPonto()` no carregamento, e o construtor
 *     chama `nuvem`, que ainda não existe. "Cannot access 'nuvem' before
 *     initialization", tela branca.
 *
 * Nos dois casos o TypeScript passou, o `bun run build` passou, e a falha só
 * apareceu no navegador. Estes testes fecham essa fresta.
 */
import { test, expect } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

test('OS SERVIÇOS CARREGAM SEM CICLO DE IMPORTAÇÃO', async () => {
  /**
   * Importa na mesma ordem do pacote: o App puxa `bancoDados` cedo, e a
   * partir dele a cadeia inteira é carregada.
   *
   * Se houver ciclo, isto estoura aqui com a MESMA mensagem que o navegador
   * daria — em vez de o usuário descobrir com a tela apagada.
   */
  await expect(import('./bancoDados')).resolves.toBeDefined();
  await expect(import('./ponto')).resolves.toBeDefined();
  await expect(import('./justificativas')).resolves.toBeDefined();
  await expect(import('./nuvem')).resolves.toBeDefined();
  await expect(import('./nuvemComunicacao')).resolves.toBeDefined();
});

test('o cache das ausências não importa NADA além de tipos', async () => {
  /**
   * É o que quebra o ciclo: `nuvem` precisa entregar as ausências do banco,
   * e importar o serviço inteiro fecharia a volta.
   *
   * Um import a mais aqui pode refechar o ciclo, e a falha só aparece no
   * navegador — por isso a regra é verificada, não só escrita no comentário.
   */
  const fonte = await Bun.file(
    new URL('./justificativasCache.ts', import.meta.url)
  ).text();

  /**
   * Pega o alvo de TODO import, inclusive os que ocupam várias linhas — a
   * primeira versão deste teste exigia import de uma linha só e reprovou o
   * arquivo certo quando ele ganhou um segundo símbolo e foi quebrado.
   * A regra é de onde se importa, não de como se formata.
   */
  const imports = [...fonte.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  expect(imports).toEqual(['../tipos', './cacheDeLeitura']);

  /**
   * `cacheDeLeitura` entrou porque este arquivo era lido 968 vezes para
   * montar os números do RH, refazendo o `JSON.parse` em cada uma.
   *
   * Ele é aceitável aqui pelo mesmo motivo que `../tipos`: é FOLHA —
   * não importa ninguém, então não pode fechar ciclo com ninguém. A
   * regra continua sendo essa, e não uma lista de nomes permitidos.
   */
  const doCache = await Bun.file(
    new URL('./cacheDeLeitura.ts', import.meta.url)
  ).text();

  expect([...doCache.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])).toEqual([]);
});

test('quem entrega dado do banco não importa serviço de regra', async () => {
  // `nuvem` é a camada de baixo. Se ela puxar um serviço de regra, esse
  // serviço puxa `nuvem` de volta mais cedo ou mais tarde.
  const fonte = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

  expect(fonte).not.toMatch(/^import .*from '\.\/ponto';$/m);
  expect(fonte).not.toMatch(/^import .*from '\.\/justificativas';$/m);
  expect(fonte).not.toMatch(/^import .*from '\.\/organograma';$/m);
});

/**
 * VARIÁVEL USADA ANTES DE EXISTIR — a terceira tela branca do projeto.
 *
 * As três tiveram causas diferentes, e é por isso que cada uma precisou do
 * próprio guarda:
 *
 *   1. hook depois de um `return` condicional;
 *   2. ciclo de importação entre módulos;
 *   3. esta — um `const` lido por um `useMemo` declarado ACIMA dele.
 *
 * O TypeScript aceita a terceira: a leitura está dentro de uma função, e ele
 * não sabe quando a função roda. Só que ela roda no PRIMEIRO RENDER, e aí é
 * uma variável usada antes de existir. Compila, publica, e a tela não abre.
 */
test('nenhum useMemo le uma variavel declarada depois dele', async () => {
  const { Glob } = await import('bun');
  const problemas: string[] = [];

  const DECLARACAO = /^ {2}const (\w+)\s*=/;

  /**
   * SÓ `useMemo`, e é de propósito.
   *
   * `useEffect` e `useLayoutEffect` rodam DEPOIS do corpo do componente
   * inteiro — quando eles executam, todos os `const` já existem. Ler uma
   * variável declarada mais abaixo lá dentro é normal e correto.
   *
   * `useMemo` é diferente: ele roda DURANTE o corpo, na linha em que está.
   * É o único dos três que pode alcançar uma variável que ainda não nasceu.
   */
  const MEMO = /^ {2}const \w+ = useMemo\(/;

  /**
   * O fim do bloco.
   *
   * O `useMemo` é escrito de duas formas neste código, e as duas fecham no
   * mesmo recuo de dois espaços:
   *
   *   }, [deps]);        corpo em chaves
   *   );                 corpo em expressão, com as deps numa linha própria
   *
   * Procurar só a primeira deixava a varredura correr até o fim do arquivo
   * e acusar meio componente.
   */
  const FIM = /^ {2}[)}]/;

  for (const caminho of new Glob('src/**/*.tsx').scanSync('.')) {
    const linhas = (await Bun.file(caminho).text()).split('\n');

    const declaradoEm = new Map<string, number>();
    linhas.forEach((linha, i) => {
      const achado = linha.match(DECLARACAO);
      if (achado && !declaradoEm.has(achado[1])) declaradoEm.set(achado[1], i);
    });

    linhas.forEach((linha, i) => {
      if (!MEMO.test(linha)) return;

      /**
       * Memo de uma linha só termina nela mesma.
       *
       * Sem esta saída a varredura seguia procurando o fim do bloco e
       * engolia o componente inteiro a partir dali — todo `const` abaixo
       * virava acusação.
       */
      const umaLinhaSo = linha.trimEnd().endsWith(');');

      let fim = i + 1;
      if (!umaLinhaSo) {
        while (fim < linhas.length && !FIM.test(linhas[fim])) fim++;
      }

      /**
       * SEM OS COMENTÁRIOS.
       *
       * Eles são escritos em português, e "pode" aparece em prose o tempo
       * todo — "a tela não pode prometer o que o banco nega". Comparar
       * contra o texto explicativo acusa o código certo, e é a terceira vez
       * que isso acontece neste projeto.
       */
      const corpo = linhas
        .slice(i, fim)
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      // O próprio nome do memo está na linha de abertura: ele não se lê
      const meuNome = linha.match(DECLARACAO)?.[1];

      for (const [nome, onde] of declaradoEm) {
        if (onde <= i || nome === meuNome) continue;
        // Palavra inteira: "pode" não pode casar com "podeUsar"
        if (new RegExp(`\\b${nome}\\b`).test(corpo)) {
          problemas.push(
            `${caminho}: "${nome}" é lido na linha ${i + 1} e declarado na ${onde + 1}`
          );
        }
      }
    });
  }

  expect(problemas).toEqual([]);
});
