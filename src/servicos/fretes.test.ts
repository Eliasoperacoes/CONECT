/**
 * FRETES: o valor que Compras digita. A conta (custo + frete) × fator e quem
 * pode alterar são do banco (cotarNoBanco.test.ts).
 */
import { test, expect } from 'bun:test';
import { lerFrete } from './fretes';

test('o frete digitado: com ou sem R$, vírgula ou ponto, de 0 a 500', () => {
  expect(['10', '10,00', 'R$ 7,50', ' 0 ', '500', '42.6'].map(lerFrete)).toEqual([10, 10, 7.5, 0, 500, 42.6]);
  // Negativo, acima de R$ 500, 3 casas ou texto: recusa (a tela pede de novo)
  expect(['-10', '500,01', '1,234', '', 'grátis'].map(lerFrete)).toEqual([null, null, null, null, null]);
});
