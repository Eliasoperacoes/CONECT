import { afterEach, expect, test } from 'bun:test';
import { ehTelaDeCelular } from './tela';

const g = globalThis as any;
afterEach(() => {
  delete g.window;
});

const telaDe = (largura: number) => {
  g.window = {
    matchMedia: (consulta: string) => ({
      matches: largura >= Number(/min-width: (\d+)px/.exec(consulta)?.[1]),
    }),
  };
};

test('abaixo de 768px é celular; de 768px para cima, computador', () => {
  telaDe(412);
  expect(ehTelaDeCelular()).toBe(true);
  telaDe(767);
  expect(ehTelaDeCelular()).toBe(true);
  telaDe(768);
  expect(ehTelaDeCelular()).toBe(false);
  telaDe(1440);
  expect(ehTelaDeCelular()).toBe(false);
});

test('sem janela (testes, servidor) não é celular', () => {
  expect(ehTelaDeCelular()).toBe(false);
});

/**
 * O VOLTAR FANTASMA.
 *
 * Aberta pelo aviso, pelo sino, por "Nova conversa" ou pelo Painel, a
 * conversa vinha na janela flutuante do computador — que no celular
 * também ocupa a tela, mas o voltar do Android não a conhece. O primeiro
 * voltar fechava a conversa escondida embaixo; o segundo minimizava.
 */
test('no celular toda conversa abre pelo caminho que o voltar conhece', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  const inicio = app.indexOf('const abrirJanela = (id: string) => {');
  expect(inicio).toBeGreaterThan(-1);
  const corpo = app.slice(inicio, app.indexOf('setJanelas(', inicio));
  // O desvio vem ANTES de qualquer janela ser criada
  expect(corpo).toContain('if (ehTelaDeCelular()) {\n      abrirConversaEmTelaCheia(id);\n      return;\n    }');

  // E a tela cheia é o que o voltar fecha
  expect(app).toContain('const abrirConversaEmTelaCheia = (id: string) => {');
  const cheia = app.slice(app.indexOf('const abrirConversaEmTelaCheia'), app.indexOf('const fecharJanela'));
  expect(cheia).toContain('setConversaAtivaId(id);');
  const voltar = app.slice(app.indexOf('ligarBotaoVoltar(() => {'), app.indexOf('ligarBotaoVoltar(() => {') + 400);
  expect(voltar).toContain('setConversaAtivaId(null);');
});
