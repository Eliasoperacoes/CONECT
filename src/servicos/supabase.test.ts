/**
 * Verificação da conexão — CONECTA
 *
 * Um teste que fala com o banco de produção é um acidente esperando
 * acontecer. Este arquivo existe para provar que isso não é possível.
 */
import { test, expect } from 'bun:test';
import { usandoNuvem, supabase } from './supabase';

/**
 * O `.env` é carregado sozinho quando os testes rodam, e com ele
 * `usandoNuvem()` passava a ser VERDADEIRO dentro da suíte — os testes
 * faziam chamadas de rede ao Supabase de produção sem ninguém pedir.
 *
 * Descoberto depurando outra coisa: um teste de preferência de conversa
 * demorava e acabava mandando um `update` para o banco da rede.
 */
test('DENTRO DOS TESTES NAO EXISTE BANCO NA NUVEM', () => {
  // As chaves podem até estar no ambiente — o que não pode é virar cliente
  expect(usandoNuvem()).toBe(false);
  expect(supabase).toBe(null);
});

test('o corte e na origem, e nao em cada chamada', async () => {
  const fonte = await Bun.file(new URL('./supabase.ts', import.meta.url)).text();

  /**
   * Sem cliente não há como alcançar o banco por engano em lugar NENHUM do
   * sistema. Espalhar a verificação pelas chamadas deixaria sempre uma de
   * fora — e seria justo essa que escreveria algo real.
   */
  expect(fonte).toContain('const emTeste =');
  expect(fonte).toContain('const configurado =\n  !emTeste &&');
});

test('o rodador de testes tambem nao entrega as chaves', async () => {
  const rodador = await Bun.file(
    new URL('../../scripts/testar.ts', import.meta.url)
  ).text();

  // Segunda tranca: a primeira é uma linha que alguém pode simplificar sem
  // perceber o que ela segura
  expect(rodador).toContain("VITE_SUPABASE_URL: ''");
  expect(rodador).toContain("VITE_SUPABASE_ANON_KEY: ''");
});
