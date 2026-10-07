/**
 * QUANDO O APP PEDE A DIGITAL: ligada, ao abrir e ao voltar depois do
 * intervalo — nunca desligada, nunca numa troca rápida de app.
 */
import { test, expect } from 'bun:test';
import { deveBloquear, INTERVALO_PARA_BLOQUEAR_MS, lerPreferencia } from './desbloqueio';

test('ligada: bloqueia ao abrir e ao voltar depois do intervalo', () => {
  const agora = 1_000_000;
  // Acabou de abrir o app: nunca foi para o segundo plano
  expect(deveBloquear({ ligada: true, saiuEm: null, agora })).toBe(true);
  // Voltou depois de um minuto ou mais
  expect(deveBloquear({ ligada: true, saiuEm: agora - INTERVALO_PARA_BLOQUEAR_MS, agora })).toBe(true);
  // Trocou de app e voltou em 20 segundos (abriu o WhatsApp para mandar o comprovante): não pede de novo
  expect(deveBloquear({ ligada: true, saiuEm: agora - 20_000, agora })).toBe(false);
});

test('desligada (ou nunca perguntada): nunca bloqueia', () => {
  expect(deveBloquear({ ligada: false, saiuEm: null, agora: 0 })).toBe(false);
  expect(deveBloquear({ ligada: false, saiuEm: 0, agora: 10 * INTERVALO_PARA_BLOQUEAR_MS })).toBe(false);
});

test('sem armazenamento, a preferência é "não perguntada" — e não quebra', () => {
  expect(lerPreferencia()).toBe('nao_perguntada');
});

test('A TRANCA NO APP: abre bloqueado se ligada, destranca quem entrou com a senha, e só no app Android', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  // Só no app, e só se a pessoa ligou
  expect(app).toContain("useState(() => rodandoNoAplicativo() && lerPreferencia() === 'ligada')");
  // Quem acabou de digitar a senha não é bloqueado em seguida
  expect(app).toContain('// Acabou de provar quem é com a senha: não pede a digital em seguida\n          setBloqueado(false);');
  // Voltar ao app passa pela regra do intervalo
  expect(app).toContain("if (deveBloquear({ ligada: lerPreferencia() === 'ligada'");
  // A tela de bloqueio fica POR CIMA: o que estava embaixo segue montado
  expect(app).toContain('{bloqueado && (\n        <TelaDeBloqueio');
  // A biometria só é oferecida onde existe — e, onde não existe, diz por quê
  const servico = await Bun.file(new URL('./desbloqueio.ts', import.meta.url)).text();
  expect(servico).toContain("if (!rodandoNoAplicativo()) return { disponivel: false, motivo: 'Só no aplicativo Android.' };");
  expect(servico).toContain("if (!Capacitor.isPluginAvailable('NativeBiometric')) {");
  expect(servico).toContain('export const biometriaDisponivel = async (): Promise<boolean> => (await situacaoDaBiometria()).disponivel;');
  const eu = await Bun.file(new URL('../componentes/AbaEu.tsx', import.meta.url)).text();
  expect(eu).toContain('{noAplicativo && biometria && !temBiometria && (');
  expect(eu).toContain('{biometria.motivo}');
});
