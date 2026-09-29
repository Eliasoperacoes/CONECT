import { expect, test } from 'bun:test';
import { abreAoSoltar, ehArrastoLateral, limitarDeslocamento } from './deslizarItem';

const LARGURA = 216;

test('rolar a lista não abre as ações', () => {
  // Polegar torto rolando a lista: anda mais na vertical
  expect(ehArrastoLateral(20, 30)).toBe(false);
  // Diagonal quase igual: ainda é rolagem
  expect(ehArrastoLateral(24, 20)).toBe(false);
  // Tremida de quem só está tocando
  expect(ehArrastoLateral(8, 0)).toBe(false);
  // De lado, de verdade
  expect(ehArrastoLateral(-30, 6)).toBe(true);
});

test('o item nunca vai para a direita nem passa do fim das ações', () => {
  expect(limitarDeslocamento(0, 50, LARGURA)).toBe(0);
  expect(limitarDeslocamento(0, -100, LARGURA)).toBe(-100);
  expect(limitarDeslocamento(0, -400, LARGURA)).toBe(-LARGURA);
  // Aberto, arrastar para a direita fecha até o zero, e não além
  expect(limitarDeslocamento(-LARGURA, 300, LARGURA)).toBe(0);
});

test('fechado, puxar um terço já abre; menos que isso volta', () => {
  expect(abreAoSoltar(0, -80, LARGURA)).toBe(true);
  expect(abreAoSoltar(0, -60, LARGURA)).toBe(false);
});

test('aberto, empurrar um terço de volta já fecha; menos que isso fica aberto', () => {
  // Empurrou 80px de volta: -136
  expect(abreAoSoltar(-LARGURA, -136, LARGURA)).toBe(false);
  // Empurrou 40px: continua aberto
  expect(abreAoSoltar(-LARGURA, -176, LARGURA)).toBe(true);
});
