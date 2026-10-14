/**
 * O AVISO DA TELA DIZ QUEM CORRIGE A MARCAÇÃO — e diz o que a regra diz
 * (14/10/2026, achado ao escrever o manual dos líderes).
 *
 * A correção passou a valer também para quem responde pela pessoa
 * (`ajustarMarcacao`, política `ponto_ajuste`), mas o rodapé do banco de
 * horas da equipe continuou dizendo "se corrige com o RH" — e mandava o
 * líder pedir ao RH o que ele mesmo resolve.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

test('o líder pode corrigir a marcação da equipe — no serviço e no banco', () => {
  const ponto = readFileSync('src/servicos/ponto.ts', 'utf8');
  expect(ponto).toContain('if (!this.podeAcessarPainelRH(atual) && !ehDaCadeia) {');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  expect(esquema).toContain("or (public.posso_decidir_jornada(colaborador_id) and metodo = 'ajuste_lider')");
});

test('e a tela diz isso, em vez de mandar o líder procurar o RH', () => {
  const tela = readFileSync('src/componentes/PainelGestao.tsx', 'utf8');
  expect(tela).not.toContain('se corrige com o RH');
  expect(tela).toContain('Batida esquecida: complete em Pendências › Pontos incompletos.');
  expect(tela).toContain('corrija em Pendências › Aprovar jornadas › Editar.');
});
