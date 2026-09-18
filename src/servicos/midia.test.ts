/**
 * Câmera, microfone e instalação — CONECTA
 *
 * Duas queixas reais de celular, e o que impede cada uma de voltar:
 *
 *  1. "Quando abro o app ele fica usando a câmera." Fluxo aberto que
 *     ninguém fechou. Cada tela fechava o seu, mas bastava um caminho
 *     esquecido para a luz ficar acesa — e não há como perguntar ao
 *     navegador quais fluxos estão abertos.
 *
 *  2. "Fica uma notificação 'Toque para copiar a URL desse app'." O
 *     Android só monta o aplicativo de verdade com ícone PNG no
 *     manifesto. Com SVG apenas, instala um atalho do navegador — e o
 *     atalho traz essa notificação fixa.
 */
import { test, expect } from 'bun:test';
import { Glob } from 'bun';

test('NENHUMA TELA ABRE CÂMERA OU MICROFONE POR FORA DO `midia`', async () => {
  /**
   * `getUserMedia` chamado direto devolve um fluxo que só aquela tela
   * conhece. Se ela não fechar — erro no meio, aba descartada, aplicativo
   * mandado para segundo plano — ninguém mais consegue desligar.
   *
   * Passando por `midia`, o fluxo fica registrado e é solto junto com os
   * outros quando o aplicativo sai da frente.
   */
  const infratores: string[] = [];

  for (const caminho of new Glob('src/**/*.{ts,tsx}').scanSync('.')) {
    if (caminho.endsWith('midia.ts') || caminho.includes('.test.')) continue;

    const fonte = await Bun.file(caminho).text();
    // Sem os comentários: eles explicam a regra e citam o nome dela
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    if (codigo.includes('mediaDevices.getUserMedia(')) infratores.push(caminho);
  }

  expect(infratores).toEqual([]);
});

test('o fluxo aberto é solto, e some da contagem', async () => {
  const { abrirFluxo, soltarTodosOsFluxos, fluxosAbertos } = await import('./midia');

  const paradas: string[] = [];
  const faixaFalsa = (nome: string) => ({
    stop: () => paradas.push(nome),
  });
  const fluxoFalso = {
    getTracks: () => [faixaFalsa('video')],
  } as unknown as MediaStream;

  const anterior = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async () => fluxoFalso } },
    configurable: true,
  });

  try {
    expect(await abrirFluxo({ video: true })).toBe(fluxoFalso);
    expect(fluxosAbertos()).toBe(1);

    soltarTodosOsFluxos();

    // Parar a faixa é o que desliga o aparelho. Só esquecer a referência
    // deixa a luz acesa.
    expect(paradas).toEqual(['video']);
    expect(fluxosAbertos()).toBe(0);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: anterior, configurable: true });
  }
});

test('permissão negada não vira fluxo aberto', async () => {
  const { abrirFluxo, fluxosAbertos } = await import('./midia');

  const anterior = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          throw new Error('NotAllowedError');
        },
      },
    },
    configurable: true,
  });

  try {
    expect(await abrirFluxo({ video: true })).toBeNull();
    expect(fluxosAbertos()).toBe(0);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: anterior, configurable: true });
  }
});

test('O MANIFESTO TEM ÍCONE PNG DE 192 E 512', async () => {
  /**
   * É o que decide entre aplicativo instalado e atalho do navegador. Só
   * com SVG, o Android desiste de montar o aplicativo e passa a mostrar a
   * notificação fixa "Toque para copiar a URL desse app".
   */
  const manifesto = JSON.parse(await Bun.file('public/manifest.json').text());
  const pngs = manifesto.icons.filter((i: any) => i.type === 'image/png');

  expect(pngs.map((i: any) => i.sizes)).toContain('192x192');
  expect(pngs.map((i: any) => i.sizes)).toContain('512x512');

  // O Android recorta o ícone no formato do aparelho; sem um "maskable"
  // ele corta o desenho ou põe uma moldura branca em volta
  expect(manifesto.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);

  for (const icone of pngs) {
    const arquivo = Bun.file(`public${icone.src}`);
    expect(await arquivo.exists()).toBe(true);

    // Assinatura de PNG: arquivo trocado por SVG com nome .png passaria
    // no teste de existência e falharia no celular
    const cabecalho = new Uint8Array(await arquivo.slice(0, 4).arrayBuffer());
    expect([...cabecalho]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }
});

test('O ÍCONE DO IPHONE É PNG', async () => {
  /**
   * O iOS ignora SVG em `apple-touch-icon` e coloca uma miniatura da
   * página na tela de início. Estava apontando para o SVG.
   */
  const html = await Bun.file('index.html').text();
  const linha = html.match(/<link rel="apple-touch-icon"[^>]*>/)?.[0] || '';

  expect(linha).toContain('.png');
  expect(linha).not.toContain('.svg');
});

test('o aplicativo não se anuncia pelo Rádio, que não existe mais', async () => {
  const manifesto = await Bun.file('public/manifest.json').text();
  expect(manifesto.toLowerCase()).not.toContain('rádio');
  expect(manifesto.toLowerCase()).not.toContain('radio');
});
