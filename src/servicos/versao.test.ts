/**
 * Versão publicada — CONECTA
 *
 * O que estes testes protegem:
 *
 *  1. A CONSULTA NÃO PODE VIR DO CACHE. Sem `no-store`, o navegador
 *     responde com a mesma cópia guardada que criou o problema, e a
 *     verificação diz para sempre que está tudo em dia. O aviso morre
 *     calado — que é pior do que não existir, porque parece que funciona.
 *
 *  2. VERSÃO IGUAL NÃO AVISA. Um aviso que aparece sem motivo é
 *     desligado pela pessoa na segunda vez, e aí o aviso de verdade
 *     também não chega.
 */
import { test, expect } from 'bun:test';

const comBuild = async <T,>(versao: string, corpo: () => Promise<T>): Promise<T> => {
  (globalThis as any).__VERSAO_BUILD__ = versao;
  try {
    return await corpo();
  } finally {
    delete (globalThis as any).__VERSAO_BUILD__;
  }
};

const comFetch = async <T,>(
  responder: (url: string, opcoes?: RequestInit) => Response,
  corpo: (visto: { url: string; opcoes?: RequestInit }[]) => Promise<T>
): Promise<T> => {
  const anterior = globalThis.fetch;
  const visto: { url: string; opcoes?: RequestInit }[] = [];

  globalThis.fetch = (async (entrada: any, opcoes?: RequestInit) => {
    visto.push({ url: String(entrada), opcoes });
    return responder(String(entrada), opcoes);
  }) as typeof fetch;

  try {
    return await corpo(visto);
  } finally {
    globalThis.fetch = anterior;
  }
};

const resposta = (versao: string) =>
  new Response(JSON.stringify({ versao }), {
    headers: { 'content-type': 'application/json' },
  });

test('A CONSULTA DA VERSÃO NÃO PODE SAIR DO CACHE', async () => {
  const { versaoPublicada } = await import('./versao');

  await comFetch(
    () => resposta('2026-01-01T00:00:00.000Z'),
    async (visto) => {
      await versaoPublicada();

      expect(visto).toHaveLength(1);
      // As duas coisas: o cabeçalho e o parâmetro que fura proxy antigo
      expect(visto[0].opcoes?.cache).toBe('no-store');
      expect(visto[0].url).toContain('?t=');
    }
  );
});

test('versão diferente da publicada avisa', async () => {
  const { saiuVersaoNova } = await import('./versao');

  await comBuild('2026-01-01T00:00:00.000Z', () =>
    comFetch(
      () => resposta('2026-02-02T00:00:00.000Z'),
      async () => {
        expect(await saiuVersaoNova()).toBe(true);
      }
    )
  );
});

test('VERSÃO IGUAL NÃO AVISA', async () => {
  const { saiuVersaoNova } = await import('./versao');

  await comBuild('2026-01-01T00:00:00.000Z', () =>
    comFetch(
      () => resposta('2026-01-01T00:00:00.000Z'),
      async () => {
        expect(await saiuVersaoNova()).toBe(false);
      }
    )
  );
});

test('sem rede não inventa versão nova', async () => {
  const { saiuVersaoNova } = await import('./versao');

  await comBuild('2026-01-01T00:00:00.000Z', async () => {
    const anterior = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('sem rede');
    }) as unknown as typeof fetch;

    try {
      expect(await saiuVersaoNova()).toBe(false);
    } finally {
      globalThis.fetch = anterior;
    }
  });
});

test('em desenvolvimento nunca avisa', async () => {
  const { saiuVersaoNova } = await import('./versao');

  // Sem carimbo injetado: é o modo de desenvolvimento, onde o arquivo
  // publicado seria sempre de outra versão e o aviso ficaria fixo na tela
  await comFetch(
    () => resposta('2026-02-02T00:00:00.000Z'),
    async (visto) => {
      expect(await saiuVersaoNova()).toBe(false);
      // Nem chega a perguntar
      expect(visto).toHaveLength(0);
    }
  );
});

test('a versão aparece legível, e não como carimbo de máquina', async () => {
  const { versaoLegivel } = await import('./versao');

  expect(versaoLegivel('desenvolvimento')).toBe('desenvolvimento');
  expect(versaoLegivel('nem data é')).toBe('nem data é');

  const legivel = versaoLegivel(new Date(2026, 8, 18, 17, 26).toISOString());
  expect(legivel).toBe('18/09 17:26');
});
