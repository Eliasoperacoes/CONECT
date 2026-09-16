/**
 * Verificação de carregamento — CONECTA
 *
 * O aplicativo tem de ABRIR. Parece óbvio, e já caiu duas vezes por motivos
 * que nenhuma ferramenta pegava:
 *
 *  1. `useMemo` declarado depois de um `return` condicional no App.tsx —
 *     React conta hooks e derruba tudo.
 *  2. Ciclo de importação: `nuvem` → `justificativas` → `ponto` → `nuvem`.
 *     `ponto` roda `new ServicoPonto()` no carregamento, e o construtor
 *     chama `nuvem`, que ainda não existe. "Cannot access 'nuvem' before
 *     initialization", tela branca.
 *
 * Nos dois casos o TypeScript passou, o `bun run build` passou, e a falha só
 * apareceu no navegador. Estes testes fecham essa fresta.
 */
import { test, expect } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

test('OS SERVIÇOS CARREGAM SEM CICLO DE IMPORTAÇÃO', async () => {
  /**
   * Importa na mesma ordem do pacote: o App puxa `bancoDados` cedo, e a
   * partir dele a cadeia inteira é carregada.
   *
   * Se houver ciclo, isto estoura aqui com a MESMA mensagem que o navegador
   * daria — em vez de o usuário descobrir com a tela apagada.
   */
  await expect(import('./bancoDados')).resolves.toBeDefined();
  await expect(import('./ponto')).resolves.toBeDefined();
  await expect(import('./justificativas')).resolves.toBeDefined();
  await expect(import('./nuvem')).resolves.toBeDefined();
  await expect(import('./nuvemComunicacao')).resolves.toBeDefined();
});

test('o cache das ausências não importa NADA além de tipos', async () => {
  /**
   * É o que quebra o ciclo: `nuvem` precisa entregar as ausências do banco,
   * e importar o serviço inteiro fecharia a volta.
   *
   * Um import a mais aqui pode refechar o ciclo, e a falha só aparece no
   * navegador — por isso a regra é verificada, não só escrita no comentário.
   */
  const fonte = await Bun.file(
    new URL('./justificativasCache.ts', import.meta.url)
  ).text();

  /**
   * Pega o alvo de TODO import, inclusive os que ocupam várias linhas — a
   * primeira versão deste teste exigia import de uma linha só e reprovou o
   * arquivo certo quando ele ganhou um segundo símbolo e foi quebrado.
   * A regra é de onde se importa, não de como se formata.
   */
  const imports = [...fonte.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  expect(imports).toEqual(['../tipos']);
});

test('quem entrega dado do banco não importa serviço de regra', async () => {
  // `nuvem` é a camada de baixo. Se ela puxar um serviço de regra, esse
  // serviço puxa `nuvem` de volta mais cedo ou mais tarde.
  const fonte = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

  expect(fonte).not.toMatch(/^import .*from '\.\/ponto';$/m);
  expect(fonte).not.toMatch(/^import .*from '\.\/justificativas';$/m);
  expect(fonte).not.toMatch(/^import .*from '\.\/organograma';$/m);
});
