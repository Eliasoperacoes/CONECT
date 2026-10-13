/**
 * TODO PEDIDO QUE DISPARA UMA AÇÃO VAI A UMA TELA SÓ (App.tsx).
 *
 * As telas do celular e as do computador ficam montadas juntas — o CSS só
 * esconde as outras. Os pedidos iam às duas, e cada uma agia:
 *
 *   · o código do cartaz e o atalho "Bater ponto" (08/10/2026): o Yan
 *     gravou cada batida duas vezes e uma saída para almoço às 08:23.
 *     Medido no Chrome (412 px e 1280 px): 2 modais antes, 1 depois.
 *   · a publicação da Central e a seção do painel (laudo de 13/10/2026,
 *     item 4): duas folhas da mesma publicação, medido no Chrome.
 *
 * Aqui se trava a fiação: cada árvore recebe o pedido só quando é ela a
 * visível, pela régua do layout (`ehTelaDeCelular`).
 */
import { test, expect } from 'bun:test';

const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

test('a régua é a do layout, lida uma vez', () => {
  expect(app).toContain('const telaDoCelular = ehTelaDeCelular();');
});

test('a árvore do CELULAR só recebe os pedidos quando a tela é de celular', () => {
  expect(app).toContain('codigoDoEndereco={telaDoCelular ? codigoDoCartaz : null}');
  expect(app).toContain('pedidoDeBater={telaDoCelular && pedidoDeBater}');
  expect(app).toContain('publicacaoAAbrir={telaDoCelular ? publicacaoAAbrir : null}');
  expect(app).toContain('secaoAlvo={telaDoCelular ? secaoAlvo : null}');
});

test('a árvore do COMPUTADOR só recebe quando a tela NÃO é de celular', () => {
  expect(app).toContain('codigoDoCartaz={telaDoCelular ? null : codigoDoCartaz}');
  expect(app).toContain('pedidoDeBater={!telaDoCelular && pedidoDeBater}');
  expect(app).toContain('publicacaoAAbrir={telaDoCelular ? null : publicacaoAAbrir}');
  expect(app).toContain('secaoAlvo={telaDoCelular ? null : secaoAlvo}');
});

test('nenhuma tela recebe um pedido sem passar pela régua', () => {
  for (const prop of ['codigoDoEndereco', 'codigoDoCartaz', 'pedidoDeBater', 'publicacaoAAbrir', 'secaoAlvo']) {
    const crus = [...app.matchAll(new RegExp(`${prop}=\\{(\\w+)\\}`, 'g'))].map((m) => m[1]);
    expect({ prop, semRegua: crus }).toEqual({ prop, semRegua: [] });
  }
});
