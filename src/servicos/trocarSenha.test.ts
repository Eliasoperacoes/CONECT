/**
 * TROCAR A PRÓPRIA SENHA PELO PERFIL (15/10/2026). A senha só muda se a
 * atual conferir: quem achar o computador do balcão aberto não troca a
 * senha do dono.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

const SENHA_CERTA = 'velha123';
let trocadaPara: string | null = null;
let conferidas: Array<{ email: string; password: string }> = [];

const real = await import('./supabase');
mock.module('./supabase', () => ({
  ...real,
  usandoNuvem: () => true,
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { email: 'elias@conecta.local' } } }),
      signInWithPassword: async (c: { email: string; password: string }) => {
        conferidas.push(c);
        return c.password === SENHA_CERTA ? { data: {}, error: null } : { data: {}, error: { message: 'Invalid login credentials' } };
      },
      updateUser: async ({ password }: { password: string }) => {
        if (password.length < 6) return { error: { message: 'Password should be at least 6 characters.' } };
        trocadaPara = password;
        return { error: null };
      },
    },
  },
}));

const { nuvem } = await import('./nuvem');

beforeEach(() => {
  trocadaPara = null;
  conferidas = [];
});

test('a senha atual errada não troca nada', async () => {
  const r = await nuvem.trocarMinhaSenha('chute', 'nova4567');
  expect(r).toEqual({ sucesso: false, erro: 'A senha atual não confere.' });
  expect(trocadaPara).toBeNull();
});

test('com a atual certa, troca — conferida na conta de quem está logado', async () => {
  const r = await nuvem.trocarMinhaSenha(SENHA_CERTA, 'nova4567');
  expect(r).toEqual({ sucesso: true });
  expect(conferidas).toEqual([{ email: 'elias@conecta.local', password: SENHA_CERTA }]);
  expect(trocadaPara).toBe('nova4567');
});

test('a recusa do Supabase volta em português', async () => {
  const r = await nuvem.trocarMinhaSenha(SENHA_CERTA, '123');
  expect(r).toEqual({ sucesso: false, erro: 'A senha precisa ter ao menos 6 caracteres.' });
});

test('o perfil oferece a troca, pela folha que confere a atual', async () => {
  const tela = await Bun.file('src/componentes/AbaEu.tsx').text();
  expect(tela).toContain('<TrocarSenha aberto={trocandoSenha}');
  const folha = await Bun.file('src/componentes/TrocarSenha.tsx').text();
  expect(folha).toContain('await nuvem.trocarMinhaSenha(atual, nova)');
  expect(folha).toContain('autoComplete="current-password"');
});
