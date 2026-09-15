/**
 * Verificação da leitura de nível da planilha — CONECTA
 *
 * A armadilha que motivou estes testes: a busca era por trecho contido, e
 * "Administrativo" contém "admin" E contém "ti". Quem escrevesse o cargo na
 * coluna de nível viraria TI — o nível mais alto da rede — sem nenhum aviso.
 *
 * Erro de preenchimento não pode virar acesso total em silêncio.
 */
import { test, expect } from 'bun:test';
import {
  NIVEL_COLABORADOR,
  NIVEL_LIDER_SETOR,
  NIVEL_GERENTE,
  NIVEL_DIRETORIA,
  NIVEL_TI,
  CARGOS_SUGERIDOS,
} from '../tipos';
import { resolverNivelDaPlanilha } from './planilhaFuncionarios';

test('o número entra direto', () => {
  expect(resolverNivelDaPlanilha('1').nivel).toBe(NIVEL_COLABORADOR);
  expect(resolverNivelDaPlanilha('2').nivel).toBe(NIVEL_LIDER_SETOR);
  expect(resolverNivelDaPlanilha('3').nivel).toBe(NIVEL_GERENTE);
  expect(resolverNivelDaPlanilha('4').nivel).toBe(NIVEL_DIRETORIA);
  expect(resolverNivelDaPlanilha('5').nivel).toBe(NIVEL_TI);
});

test('o nome escrito também entra, com ou sem acento', () => {
  expect(resolverNivelDaPlanilha('Colaborador').nivel).toBe(NIVEL_COLABORADOR);
  expect(resolverNivelDaPlanilha('Líder de Setor').nivel).toBe(NIVEL_LIDER_SETOR);
  expect(resolverNivelDaPlanilha('lider').nivel).toBe(NIVEL_LIDER_SETOR);
  expect(resolverNivelDaPlanilha('GERENTE').nivel).toBe(NIVEL_GERENTE);
  expect(resolverNivelDaPlanilha('Diretoria').nivel).toBe(NIVEL_DIRETORIA);
  expect(resolverNivelDaPlanilha(' TI ').nivel).toBe(NIVEL_TI);
});

test('ADMINISTRATIVO NÃO VIRA TI', () => {
  // Contém "admin" e contém "ti". Com busca por trecho, esta linha dava
  // acesso total a um cargo de nível 1.
  const r = resolverNivelDaPlanilha('Administrativo');

  expect(r.nivel).toBe(NIVEL_COLABORADOR);
  expect(r.aviso).toBeTruthy();
  expect(r.aviso).toContain('Administrativo');
});

test('nenhum dos cargos da rede escala o nível por engano', () => {
  // Se alguém trocar as colunas, o pior que acontece é virar Colaborador
  for (const cargo of CARGOS_SUGERIDOS) {
    const r = resolverNivelDaPlanilha(cargo);
    expect(r.nivel).toBe(NIVEL_COLABORADOR);
  }
});

test('grafia desconhecida entra como Colaborador E avisa', () => {
  const r = resolverNivelDaPlanilha('chefe supremo');

  expect(r.nivel).toBe(NIVEL_COLABORADOR);
  // Entrar calado seria pior: ninguém conferiria a linha depois
  expect(r.aviso).toContain('não é um dos cinco');
});

test('coluna em branco não gera aviso: é o caso comum', () => {
  expect(resolverNivelDaPlanilha('').nivel).toBe(NIVEL_COLABORADOR);
  expect(resolverNivelDaPlanilha('').aviso).toBeUndefined();
  expect(resolverNivelDaPlanilha('   ').aviso).toBeUndefined();
});
