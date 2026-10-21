/**
 * MARGENS POR MARCA (cotador): o que a tela faz sozinha — ler o fator
 * digitado e decidir quem vê a tela. A conta do preço mora no banco
 * (precificacaoNoBanco.test.ts).
 */
import { test, expect } from 'bun:test';
import { lerFator, mostrarFator, cuidaDasMargens } from './margens';
import { lerSql } from '../../scripts/bancoLocal';

test('o fator digitado: vírgula ou ponto, de 1,00 a 5,00, até 2 casas', () => {
  expect(['1,80', '1.83', ' 2,55 ', '1', '5,00'].map(lerFator)).toEqual([1.8, 1.83, 2.55, 1, 5]);
  // Fora da faixa, com 3 casas, porcentagem ou texto: recusa (a tela pede de novo)
  expect(['0,90', '5,01', '1,834', '80%', '', 'abc', '-1,80'].map(lerFator)).toEqual([null, null, null, null, null, null, null]);
  expect(mostrarFator(1.8)).toBe('1,80');
});

test('quem cuida das margens na tela é o mesmo que grava no banco: nível ≥ 3', () => {
  expect([1, 2, 3, 4, 5].map((nivel) => cuidaDasMargens({ nivel }))).toEqual([false, false, true, true, true]);
  // O par no banco: as regras de escrita e as funções de gravar pedem meu_nivel() >= 3
  const sql = lerSql('cotador-precificacao.sql');
  expect(sql.match(/meu_nivel\(\) >= 3/g)?.length).toBe(4); // 2 regras × using/with check
  expect(sql.match(/meu_nivel\(\) < 3/g)?.length).toBe(3); // salvar_fator, apontar_apelido, marcas_sem_margem
});

// Quem vê o bloco "Margens por marca": ferramentasInternas.test.ts
