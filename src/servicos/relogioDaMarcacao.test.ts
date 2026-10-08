/**
 * O RELÓGIO COM SEGUNDOS NA TELA DE BATER (Anexo IX da Portaria 671/2021,
 * item 3): "relógio não-analógico contendo horas, minutos e segundos no
 * momento da marcação" — no fuso de Brasília, com a hora sincronizada.
 */
process.env.TZ = 'UTC';
import { test, expect } from 'bun:test';
import { horaDoRelogio } from '../componentes/RelogioDaMarcacao';

test('horas, minutos e SEGUNDOS, no fuso de Brasília — mesmo com o aparelho em outro fuso', () => {
  // 10:31:45 UTC = 07:31:45 em Brasília
  expect(horaDoRelogio(new Date('2026-10-07T10:31:45Z'))).toBe('07:31:45');
  expect(horaDoRelogio(new Date('2026-10-08T02:05:09Z'))).toBe('23:05:09');
});

test('a tela de bater mostra o relógio enquanto a pessoa marca, com a hora sincronizada', async () => {
  const modal = await Bun.file(new URL('../componentes/ModalBaterPonto.tsx', import.meta.url)).text();
  expect(modal).toContain("{estado !== 'sucesso' && <RelogioDaMarcacao />}");
  const relogio = await Bun.file(new URL('../componentes/RelogioDaMarcacao.tsx', import.meta.url)).text();
  // A hora é a do servidor (relogio.ts), e não a do aparelho
  expect(relogio).toContain("import { agora, estaSincronizado } from '../servicos/relogio';");
  expect(relogio).toContain('setInterval(() => setInstante(agora()), 1000)');
  expect(relogio).not.toContain('new Date()');
});
