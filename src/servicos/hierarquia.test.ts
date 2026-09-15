/**
 * Verificação da hierarquia da rede — CONECTA
 *
 *   5  TI             administra o sistema
 *   4  Diretoria      enxerga a rede e publica comunicado
 *   3  Gerente        responde pela loja inteira
 *   2  Líder de setor acompanha o próprio setor
 *   1  Colaborador    conversa e bate o próprio ponto
 *
 * O caso que mais importa aqui é o da liderança de Compras: ela atua nas
 * cinco lojas, então o alcance do líder é o SETOR, não a loja. Limitar pela
 * loja esconderia dela justamente a equipe que ela lidera.
 */
import { test, expect } from 'bun:test';
import {
  NIVEL_COLABORADOR,
  NIVEL_LIDER_SETOR,
  NIVEL_GERENTE,
  NIVEL_DIRETORIA,
  NIVEL_TI,
  ROTULO_NIVEL,
  NIVEIS_EM_ORDEM,
  cuidaDePessoas,
  ehAdministrador,
  publicaComunicado,
  vePainelDeRede,
} from '../tipos';

const pessoa = (nivel: number, setor = 'Balcão') => ({ nivel, setor });

test('a ordem dos níveis vai do chão à cúpula', () => {
  expect(NIVEL_COLABORADOR).toBeLessThan(NIVEL_LIDER_SETOR);
  expect(NIVEL_LIDER_SETOR).toBeLessThan(NIVEL_GERENTE);
  expect(NIVEL_GERENTE).toBeLessThan(NIVEL_DIRETORIA);
  expect(NIVEL_DIRETORIA).toBeLessThan(NIVEL_TI);
  expect(NIVEIS_EM_ORDEM).toEqual([1, 2, 3, 4, 5]);
});

test('cada nível tem nome próprio na tela', () => {
  expect(ROTULO_NIVEL[NIVEL_COLABORADOR]).toBe('Colaborador');
  expect(ROTULO_NIVEL[NIVEL_LIDER_SETOR]).toBe('Líder de Setor');
  expect(ROTULO_NIVEL[NIVEL_GERENTE]).toBe('Gerente');
  expect(ROTULO_NIVEL[NIVEL_DIRETORIA]).toBe('Diretoria');
  expect(ROTULO_NIVEL[NIVEL_TI]).toBe('TI');
});

test('ADMINISTRAR O SISTEMA é só do TI', () => {
  expect(ehAdministrador(pessoa(NIVEL_TI))).toBe(true);
  expect(ehAdministrador(pessoa(NIVEL_DIRETORIA))).toBe(false);
  expect(ehAdministrador(pessoa(NIVEL_GERENTE))).toBe(false);
  // Nem quem é do setor TI sem o nível: o setor não dá o poder
  expect(ehAdministrador(pessoa(NIVEL_COLABORADOR, 'TI'))).toBe(false);
});

test('cuidar de pessoas: RH, Diretoria e TI — gerente não mexe em ficha', () => {
  expect(cuidaDePessoas(pessoa(NIVEL_TI))).toBe(true);
  expect(cuidaDePessoas(pessoa(NIVEL_DIRETORIA))).toBe(true);
  expect(cuidaDePessoas(pessoa(NIVEL_GERENTE))).toBe(false);
  expect(cuidaDePessoas(pessoa(NIVEL_LIDER_SETOR))).toBe(false);

  // O setor RH carrega a permissão em qualquer nível: é a função dela
  expect(cuidaDePessoas(pessoa(NIVEL_COLABORADOR, 'RH'))).toBe(true);
});

test('comunicado oficial da rede: Diretoria e TI', () => {
  expect(publicaComunicado(pessoa(NIVEL_TI))).toBe(true);
  expect(publicaComunicado(pessoa(NIVEL_DIRETORIA))).toBe(true);
  expect(publicaComunicado(pessoa(NIVEL_GERENTE))).toBe(false);
  expect(publicaComunicado(pessoa(NIVEL_LIDER_SETOR))).toBe(false);
});

test('painel de RH: do líder de setor para cima, mais o setor RH', () => {
  expect(vePainelDeRede(pessoa(NIVEL_TI))).toBe(true);
  expect(vePainelDeRede(pessoa(NIVEL_DIRETORIA))).toBe(true);
  expect(vePainelDeRede(pessoa(NIVEL_GERENTE))).toBe(true);
  expect(vePainelDeRede(pessoa(NIVEL_LIDER_SETOR))).toBe(true);

  expect(vePainelDeRede(pessoa(NIVEL_COLABORADOR))).toBe(false);
  expect(vePainelDeRede(pessoa(NIVEL_COLABORADOR, 'RH'))).toBe(true);
});

test('o líder de setor NÃO administra nem mexe em ficha', () => {
  const lider = pessoa(NIVEL_LIDER_SETOR, 'Compras');

  // Ele acompanha a equipe dele, e só
  expect(vePainelDeRede(lider)).toBe(true);
  expect(cuidaDePessoas(lider)).toBe(false);
  expect(ehAdministrador(lider)).toBe(false);
  expect(publicaComunicado(lider)).toBe(false);
});
