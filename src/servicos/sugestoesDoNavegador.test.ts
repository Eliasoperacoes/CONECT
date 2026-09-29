import { afterEach, expect, test } from 'bun:test';
import { calarSugestoesDoNavegador, deveCalar } from './sugestoesDoNavegador';

/** Um elemento de mentira: só o que a regra consulta. */
function elemento(tag: string, attrs: Record<string, string> = {}, filhos: any[] = []): any {
  const a = { ...attrs };
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    attrs: a,
    getAttribute: (n: string) => (n in a ? a[n] : null),
    hasAttribute: (n: string) => n in a,
    setAttribute: (n: string, v: string) => {
      a[n] = v;
    },
    querySelectorAll: () => filhos,
  };
}

const observadorOriginal = (globalThis as any).MutationObserver;
afterEach(() => {
  (globalThis as any).MutationObserver = observadorOriginal;
});

test('campo de texto, de busca e caixa de texto perdem a lista do navegador', () => {
  expect(deveCalar(elemento('input'))).toBe(true);
  expect(deveCalar(elemento('input', { type: 'text' }))).toBe(true);
  expect(deveCalar(elemento('input', { type: 'search' }))).toBe(true);
  expect(deveCalar(elemento('textarea'))).toBe(true);
});

test('o login continua preenchido pelo navegador', () => {
  // Quem diz o que quer é respeitado
  expect(deveCalar(elemento('input', { type: 'text', autocomplete: 'username' }))).toBe(false);
  expect(deveCalar(elemento('input', { type: 'password' }))).toBe(false);
  // Caixa de marcar e arquivo não têm histórico
  expect(deveCalar(elemento('input', { type: 'checkbox' }))).toBe(false);
  expect(deveCalar(elemento('input', { type: 'file' }))).toBe(false);
  expect(deveCalar(elemento('div'))).toBe(false);
});

test('vale para o campo que já existe E para o que aparecer depois', () => {
  let aoMudar: ((m: any[]) => void) | null = null;
  (globalThis as any).MutationObserver = class {
    constructor(cb: (m: any[]) => void) {
      aoMudar = cb;
    }
    observe() {}
    disconnect() {}
  };

  const busca = elemento('input', { type: 'search' });
  const senha = elemento('input', { type: 'password', autocomplete: 'current-password' });
  const raiz = elemento('html', {}, [busca, senha]);
  const doc: any = { documentElement: raiz };

  calarSugestoesDoNavegador(doc);

  // O texto cinza da previsão, desligado na página inteira
  expect(raiz.attrs.writingsuggestions).toBe('false');
  expect(busca.attrs.autocomplete).toBe('off');
  expect(senha.attrs.autocomplete).toBe('current-password');

  // Uma conversa abre depois: o campo dela nasce já marcado
  const mensagem = elemento('input', { type: 'text' });
  const tela = elemento('div', {}, [mensagem]);
  aoMudar!([{ addedNodes: [tela] }]);
  expect(mensagem.attrs.autocomplete).toBe('off');
});

test('a regra é ligada na partida do sistema', async () => {
  const main = await Bun.file(new URL('../main.tsx', import.meta.url)).text();
  expect(main).toContain('calarSugestoesDoNavegador();');
});
