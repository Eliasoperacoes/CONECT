/**
 * O APARELHO SÓ MARCA — a trava do lado do banco (01/10/2026).
 *
 * Até aqui a batida chegava pronta do aparelho (dia, hora e loja) e o banco
 * conferia só se era da própria pessoa: pela API dava para gravar "entrada
 * 07:30" às 09:00. E o código do cartaz era conferido no app, que para isso
 * lia os códigos das cinco lojas. Estes testes leem o SQL: se alguém
 * reabrir a porta, falham.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ler = (arq: string) => readFileSync(join(import.meta.dir, '../../supabase', arq), 'utf8');
const semComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

/** O trecho de um comando, do início até o próximo `;` fora de $$. */
const trecho = (sql: string, inicio: string): string => {
  const i = sql.indexOf(inicio);
  expect(i).toBeGreaterThan(-1);
  return sql.slice(i, sql.indexOf(';', i));
};

for (const arquivo of ['esquema.sql', 'ponto-pelo-servidor.sql']) {
  test(`${arquivo}: a batida própria não entra direto na tabela`, () => {
    const sql = semComentarios(ler(arquivo));
    const politica = trecho(sql, 'create policy ponto_batida');
    expect(politica).not.toContain('meu_colaborador_id');
    // As correções de RH e do líder continuam
    expect(politica).toContain('public.cuido_de_pessoas()');
    expect(politica).toContain("metodo in ('ajuste_lider', 'preenchimento_turno')");
  });

  test(`${arquivo}: só quem cuida do cartaz lê o código da loja`, () => {
    const sql = semComentarios(ler(arquivo));
    const politica = trecho(sql, 'create policy codigos_leitura');
    expect(politica).toContain('using (public.cuido_do_qr_da_loja(loja))');
    expect(politica).not.toContain('using (true)');
  });

  test(`${arquivo}: bater_ponto carimba a hora do servidor e confere o código`, () => {
    const sql = semComentarios(ler(arquivo));
    const ini = sql.indexOf('create or replace function public.bater_ponto');
    const funcao = sql.slice(ini, sql.indexOf('$$;', ini));
    // Dia e hora do relógio do banco, em Brasília — nada vem do aparelho
    expect(funcao).toContain("hoje date := (now() at time zone 'America/Sao_Paulo')::date;");
    expect(funcao).toContain("to_char(em_brasilia, 'HH24:MI')");
    expect(funcao).not.toMatch(/p_horario|p_data|p_hora/);
    // A pessoa é a da sessão, e o código vem da tabela das lojas
    expect(funcao).toContain('where id = public.meu_colaborador_id()');
    expect(funcao).toContain('from public.codigos_ponto_loja c');
    expect(funcao).toContain("raise exception 'Código não reconhecido");
    expect(funcao).toContain('security definer');
  });
}

test('o aparelho manda só o que leu e a próxima batida', () => {
  const nuvem = readFileSync(join(import.meta.dir, 'nuvem.ts'), 'utf8');
  const ini = nuvem.indexOf("supabase.rpc('bater_ponto'");
  const chamada = nuvem.slice(ini, nuvem.indexOf('});', ini));
  expect(chamada).toContain('p_codigo');
  expect(chamada).toContain('p_loja');
  expect(chamada).toContain('p_tipo');
  expect(chamada).not.toMatch(/horario|hora|data:/);
});
