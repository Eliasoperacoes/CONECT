/**
 * A publicação — CONECTA
 *
 * ===================================================================
 * O DEFEITO MAIS CARO ATÉ AGORA, E O MAIS SILENCIOSO
 * ===================================================================
 *
 * Sete commits seguidos foram escritos, testados, aprovados e empurrados
 * — e NENHUM chegou ao ar. O `vercel.json` tinha uma chave `"//"` que eu
 * usei como comentário, e a Vercel valida esse arquivo estritamente:
 * propriedade desconhecida derruba o deploy ANTES de compilar.
 *
 * Nada acusou. Os testes passavam, o `build` passava, o `git push`
 * passava. A única evidência estava num painel que ninguém abriu, e o
 * sintoma chegou como "não atualizou" — três vezes, em dias diferentes,
 * com o usuário procurando telas que existiam só na minha máquina.
 *
 * JSON não tem comentário. A explicação mora na documentação.
 */
import { test, expect } from 'bun:test';

test('O vercel.json NÃO PODE TER CHAVE DESCONHECIDA', async () => {
  /**
   * A lista vem do esquema da Vercel. Chave fora dela — inclusive "//"
   * usada como comentário — faz a validação recusar o arquivo inteiro.
   */
  const config = JSON.parse(await Bun.file('vercel.json').text());

  const RAIZ_PERMITIDA = new Set([
    'buildCommand',
    'devCommand',
    'installCommand',
    'outputDirectory',
    'framework',
    'rewrites',
    'redirects',
    'headers',
    'cleanUrls',
    'trailingSlash',
    'regions',
    'functions',
    'crons',
    'images',
    'git',
    'ignoreCommand',
  ]);

  const forasteiras = Object.keys(config).filter((k) => !RAIZ_PERMITIDA.has(k));
  expect(forasteiras).toEqual([]);

  const REGRA_PERMITIDA = new Set(['source', 'headers', 'has', 'missing', 'destination']);
  const problemas: string[] = [];

  for (const grupo of ['headers', 'rewrites', 'redirects'] as const) {
    for (const regra of config[grupo] || []) {
      for (const chave of Object.keys(regra)) {
        if (!REGRA_PERMITIDA.has(chave)) {
          problemas.push(`${grupo}: chave "${chave}" não existe no esquema da Vercel`);
        }
      }
    }
  }

  expect(problemas).toEqual([]);
});

test('as regras de cache que sustentam a atualização continuam lá', async () => {
  /**
   * O `index.html` guardado no navegador é o que fazia "atualizei e não
   * apareceu": é ele que aponta para os pacotes novos.
   */
  const config = JSON.parse(await Bun.file('vercel.json').text());
  const porFonte = new Map<string, string>();

  for (const regra of config.headers || []) {
    const cache = (regra.headers || []).find(
      (h: { key: string }) => h.key.toLowerCase() === 'cache-control'
    );
    if (cache) porFonte.set(regra.source, cache.value);
  }

  expect(porFonte.get('/index.html')).toContain('must-revalidate');
  expect(porFonte.get('/versao.json')).toBe('no-store');
  // Os pacotes têm o resumo do conteúdo no nome: podem ficar para sempre
  expect(porFonte.get('/assets/(.*)')).toContain('immutable');
});

test('o carimbo da versão é gerado no build', async () => {
  /**
   * Sem o `versao.json` publicado, o aviso de versão nova nunca dispara —
   * e a aba velha fica velha para sempre, sem ninguém saber.
   */
  const vite = await Bun.file('vite.config.ts').text();

  expect(vite).toContain('__VERSAO_BUILD__');
  expect(vite).toContain("fileName: 'versao.json'");
});
