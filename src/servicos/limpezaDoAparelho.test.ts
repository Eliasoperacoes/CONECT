/**
 * O QUE FICA NO APARELHO DEPOIS DE "SAIR" (limpezaDoAparelho.ts) — laudo de
 * 13/10/2026, item 2. Só as preferências do aparelho; nada de quem usou.
 */
import { test, expect } from 'bun:test';
import { limparAoSair, apagarSenhaGuardada, PREFERENCIAS_DO_APARELHO } from './limpezaDoAparelho';

class ArmazenamentoFalso implements Storage {
  private dados = new Map<string, string>();
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
  chaves() { return [...this.dados.keys()].sort(); }
}

/** O computador da loja depois de o RH usar e sair. */
const computadorDaLoja = () => {
  const a = new ArmazenamentoFalso();
  a.setItem('conecta_v4_justificativas_ausencia', '[{"tipo":"atestado"}]');
  a.setItem('conecta_v4_ajustes_jornada', '[]');
  a.setItem('conecta_v4_colaboradores', '[]');
  a.setItem('conecta_v4_compensacao_sabado', '[]');
  a.setItem('conecta.onde-parei.rita.tela-web', 'banco_horas');
  a.setItem('conecta_v4_notificacoes_dispensadas_rita', '[]');
  // Um cache que ainda nem existe hoje: também tem de sair, sem ninguém lembrar dele
  a.setItem('conecta_v4_cache_que_alguem_criar_depois', 'x');
  // As preferências do aparelho
  a.setItem('conecta_v4_tema', 'escuro');
  a.setItem('conecta:biometria', 'ligada');
  a.setItem('conecta_v4_avisos_mensagem', 'sim');
  a.setItem('conecta_v4_ultimo_acesso_dispositivo', JSON.stringify({ id: 'rita', senha: 'minhaSenha!' }));
  // De outro site no mesmo endereço: não é nosso
  a.setItem('outra-coisa', 'fica');
  return a;
};

test('AO SAIR, só ficam as preferências do aparelho — atestados, banco de horas e fichas vão embora', () => {
  const a = computadorDaLoja();
  limparAoSair(a);
  expect(a.chaves()).toEqual(
    ['conecta:biometria', 'conecta_v4_avisos_mensagem', 'conecta_v4_tema', 'conecta_v4_ultimo_acesso_dispositivo', 'outra-coisa'].sort()
  );
});

test('A SENHA DE LOGIN não sobrevive: a conta lembrada fica só com o id', () => {
  const a = computadorDaLoja();
  limparAoSair(a);
  expect(a.getItem('conecta_v4_ultimo_acesso_dispositivo')).toBe(JSON.stringify({ id: 'rita' }));
});

test('na abertura do app, a senha que versões antigas gravaram é apagada', () => {
  const a = new ArmazenamentoFalso();
  a.setItem('conecta_v4_ultimo_acesso_dispositivo', JSON.stringify({ id: 'ana', senha: '123456' }));
  apagarSenhaGuardada(a);
  expect(a.getItem('conecta_v4_ultimo_acesso_dispositivo')).toBe(JSON.stringify({ id: 'ana' }));
  // Ilegível: sai inteira
  a.setItem('conecta_v4_ultimo_acesso_dispositivo', '{quebrado');
  apagarSenhaGuardada(a);
  expect(a.getItem('conecta_v4_ultimo_acesso_dispositivo')).toBeNull();
});

test('a lista do que fica é curta e não tem dado de pessoa', () => {
  expect([...PREFERENCIAS_DO_APARELHO].sort()).toEqual([
    'conecta:biometria',
    'conecta_convite_avisos_adiado_ate',
    'conecta_grupos_abertos',
    'conecta_v4_avisos_mensagem',
    'conecta_v4_tema',
    'conecta_v4_ultimo_acesso_dispositivo',
  ]);
});

test('o Sair do sistema e a abertura chamam a limpeza', async () => {
  const nuvem = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();
  const sair = nuvem.slice(nuvem.indexOf('async sair(): Promise<void> {'), nuvem.indexOf('async temSessao()'));
  expect(sair).toContain('limparAoSair();');
  const abertura = nuvem.slice(nuvem.indexOf('export const iniciarNuvem'), nuvem.indexOf('export const iniciarNuvem') + 400);
  expect(abertura).toContain('apagarSenhaGuardada();');
});
