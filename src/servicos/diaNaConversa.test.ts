/**
 * O SEPARADOR DE DIA NA CONVERSA. Sem ele, "15:40" não diz se foi hoje ou
 * semana passada (S10, 02/10/2026).
 */
import { test, expect } from 'bun:test';
import { rotuloDoDia, separadoresDeDia, diaLocal } from './diaNaConversa';

const HOJE = '2026-10-02'; // sexta-feira

test('hoje, ontem, o nome do dia na semana, e a data depois disso', () => {
  expect(rotuloDoDia('2026-10-02', HOJE)).toBe('Hoje');
  expect(rotuloDoDia('2026-10-01', HOJE)).toBe('Ontem');
  expect(rotuloDoDia('2026-09-28', HOJE)).toBe('Segunda-feira');
  expect(rotuloDoDia('2026-09-26', HOJE)).toBe('Sábado');
  expect(rotuloDoDia('2026-09-23', HOJE)).toBe('23 de setembro');
  expect(rotuloDoDia('2025-12-31', HOJE)).toBe('31/12/2025');
  // A virada do ano não confunde "ontem"
  expect(rotuloDoDia('2025-12-31', '2026-01-01')).toBe('Ontem');
});

test('um separador antes da primeira mensagem de cada dia, e so dela', () => {
  const ms = [
    { criadoEm: '2026-09-23T15:00:00-03:00' },
    { criadoEm: '2026-09-23T16:00:00-03:00' },
    { criadoEm: '2026-10-01T09:00:00-03:00' },
    { criadoEm: '2026-10-02T08:00:00-03:00' },
    { criadoEm: '2026-10-02T09:00:00-03:00' },
  ];
  expect(separadoresDeDia(ms, HOJE, 'America/Sao_Paulo')).toEqual([
    '23 de setembro', null, 'Ontem', 'Hoje', null,
  ]);
});

test('o dia e o do fuso de quem le: 23h de Brasilia ainda e o mesmo dia', () => {
  // 23h30 em Brasília é 02h30 do dia seguinte em UTC
  expect(diaLocal('2026-10-01T23:30:00-03:00', 'America/Sao_Paulo')).toBe('2026-10-01');
  expect(diaLocal('nada')).toBe('');
});

test('a conversa desenha os separadores e encosta embaixo', async () => {
  const tela = await Bun.file(new URL('../componentes/TelaConversa.tsx', import.meta.url)).text();
  expect(tela).toContain('comSeparadoresDeDia(mensagensExibidas, (msg, indiceDaMensagem) => {');
  // Conversa curta junto do campo de escrever, sem justify-end no rolável
  expect(tela).toContain('className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden p-4 space-y-3"');
  expect(tela).toContain('<div className="mt-auto" aria-hidden />');
});
