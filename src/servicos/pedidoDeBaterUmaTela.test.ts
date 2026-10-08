/**
 * O PEDIDO DE BATER VAI A UMA TELA SÓ (App.tsx, 08/10/2026).
 *
 * O ponto do celular e o do computador ficam montados juntos — o CSS só
 * esconde um deles. Os dois recebiam o código do cartaz e o pedido do
 * atalho, e cada um batia: o Yan gravou cada batida duas vezes, 2 s uma
 * da outra, e uma saída para almoço às 08:23. Medido no Chrome (412 px e
 * 1280 px): 2 modais antes, 1 depois.
 *
 * Aqui se trava a fiação: cada tela de ponto recebe o código e o pedido
 * só quando é ela a visível, pela régua do layout (`ehTelaDeCelular`).
 */
import { test, expect } from 'bun:test';

const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

test('a régua é a do layout, lida uma vez', () => {
  expect(app).toContain('const pontoNoCelular = ehTelaDeCelular();');
});

test('o ponto do CELULAR só recebe o código e o pedido quando a tela é de celular', () => {
  expect(app).toContain('codigoDoEndereco={pontoNoCelular ? codigoDoCartaz : null}');
  expect(app).toContain('pedidoDeBater={pontoNoCelular && pedidoDeBater}');
});

test('o ponto do COMPUTADOR só recebe quando a tela NÃO é de celular', () => {
  expect(app).toContain('codigoDoCartaz={pontoNoCelular ? null : codigoDoCartaz}');
  expect(app).toContain('pedidoDeBater={!pontoNoCelular && pedidoDeBater}');
});

test('nenhuma tela recebe o código ou o pedido sem passar pela régua', () => {
  expect(app).not.toMatch(/codigoDoEndereco=\{codigoDoCartaz\}/);
  expect(app).not.toMatch(/codigoDoCartaz=\{codigoDoCartaz\}/);
  expect(app).not.toMatch(/pedidoDeBater=\{pedidoDeBater\}/);
});
