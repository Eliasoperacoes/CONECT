/**
 * ABRIR SEM PESQUISAR DE NOVO (Elias, 21/10/2026): o pedido espera a aba
 * Cotar montar e é atendido uma vez só.
 */
import { test, expect } from 'bun:test';
import { pedirAbertura, pegarAbertura, ouvirAberturas, lembrarAbertos, abertosGuardados, type PedidoDeAbertura } from './aberturaDaCotacao';

test('o pedido feito antes de a aba existir espera, e é pego uma vez só', () => {
  pedirAbertura({ codigo: 'OC90' });
  expect(pegarAbertura()).toEqual({ codigo: 'OC90' });
  // Pego: a aba que montar depois não abre a peça de novo
  expect(pegarAbertura()).toBeNull();
});

test('a aba já aberta recebe o pedido na hora, e para de ouvir ao fechar', () => {
  const recebidos: PedidoDeAbertura[] = [];
  const parar = ouvirAberturas((p) => recebidos.push(p));
  pedirAbertura({ codigo: 'W7122' });
  expect(recebidos.map((p) => p.codigo)).toEqual(['W7122']);
  expect(pegarAbertura()).toBeNull(); // quem ouviu já consumiu

  parar();
  pedirAbertura({ codigo: 'PSL619' });
  expect(recebidos).toHaveLength(1);
  expect(pegarAbertura()?.codigo).toBe('PSL619'); // fica para a próxima aba
});

test('os cartões abertos voltam depois do F5, por pessoa, e lixo guardado não derruba a aba', () => {
  const guardado = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => void guardado.set(k, v),
  };
  lembrarAbertos('bia', ['OC90', 'W7122']);
  expect(abertosGuardados('bia')).toEqual(['OC90', 'W7122']);
  // O colega que entra depois no mesmo computador não herda os cartões
  expect(abertosGuardados('gil')).toEqual([]);
  // No máximo 10: a aba não vira uma lista sem fim
  lembrarAbertos('bia', Array.from({ length: 15 }, (_, i) => `P${i}`));
  expect(abertosGuardados('bia')).toHaveLength(10);
  // Valor estragado (outra versão, console): começa vazio, sem erro
  guardado.set('conecta.cotador.abertos.bia', '{quebrado');
  expect(abertosGuardados('bia')).toEqual([]);
  guardado.set('conecta.cotador.abertos.bia', JSON.stringify(['OC90', 7, null]));
  expect(abertosGuardados('bia')).toEqual(['OC90']);
  delete (globalThis as any).sessionStorage;
  // Sem armazenamento nenhum: não lança
  expect(abertosGuardados('bia')).toEqual([]);
  expect(() => lembrarAbertos('bia', ['OC90'])).not.toThrow();
});
