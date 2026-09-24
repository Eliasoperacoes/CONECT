/**
 * Verificação da MEMÓRIA DE NAVEGAÇÃO — CONECTA
 *
 * O que motivou: a navegação vivia só na memória do React. Atualizar a
 * página — que acontece o tempo todo aqui, o navegador da loja recarrega
 * sozinho — jogava todo mundo de volta na tela inicial. Quem estava
 * conferindo o espelho da quinta pessoa de uma lista de vinte voltava
 * para Conversas e recomeçava.
 *
 * O que este arquivo protege não é só "lembra": é que lembrar NÃO abra
 * uma tela que a pessoa não pode ver, e não devolva a tela de um
 * colaborador para o colaborador seguinte no mesmo computador do balcão.
 */
import { test, expect, beforeEach } from 'bun:test';

/**
 * O Bun não tem `localStorage`, e sem este falso os testes de lembrar
 * passariam por engano: tudo cairia no `catch` e devolveria o padrão —
 * que é justamente o que metade deles espera.
 *
 * Tem `length` e `key(i)` porque é assim que `esquecerOndeParei` varre o
 * armazenamento, pela API de `Storage`.
 */
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

import {
  lembrarOndeParei,
  ondeParei,
  esquecerOndeParei,
} from './navegacaoLembrada';

const ABAS = ['conversas', 'ponto', 'painel'] as const;

test('o armazenamento de mentira FUNCIONA', () => {
  /**
   * Sem esta conferência, um falso quebrado faria todos os testes de
   * lembrar caírem no `catch` e devolverem o padrão — e metade deles
   * espera o padrão, então passariam calados.
   */
  localStorage.setItem('teste', 'valor');
  expect(localStorage.getItem('teste')).toBe('valor');
  expect(localStorage.length).toBe(1);
  expect(localStorage.key(0)).toBe('teste');
  localStorage.removeItem('teste');
});

beforeEach(() => esquecerOndeParei());

test('lembra onde a pessoa parou', () => {
  lembrarOndeParei('colab-dani', 'rh', 'holerites');
  expect(ondeParei('colab-dani', 'rh', ['painel', 'holerites'], 'painel')).toBe(
    'holerites'
  );
});

test('sem nada guardado, devolve o padrao da tela', () => {
  expect(ondeParei('colab-novo', 'rh', ABAS, 'ponto')).toBe('ponto');
});

test('É GUARDADO POR PESSOA', () => {
  /**
   * Nas lojas o mesmo computador atende o balcão inteiro. Sem separar
   * por colaborador, quem entra depois cai na tela que o anterior estava
   * vendo — e no caso do RH essa tela pode ser a ficha de alguém.
   */
  lembrarOndeParei('colab-dani', 'aba-principal', 'painel');

  expect(ondeParei('colab-dani', 'aba-principal', ABAS, 'conversas')).toBe('painel');
  expect(ondeParei('colab-lyvia', 'aba-principal', ABAS, 'conversas')).toBe('conversas');
});

test('CADA TELA TEM A SUA MEMÓRIA', () => {
  /**
   * Uma memória só para o sistema inteiro faria a escolha de aba do RH
   * sobrescrever a do painel administrativo, e a pessoa cairia numa aba
   * que não existe na tela que abriu.
   */
  lembrarOndeParei('colab-dani', 'rh', 'espelhos');
  lembrarOndeParei('colab-dani', 'admin', 'auditoria');

  expect(ondeParei('colab-dani', 'rh', ['painel', 'espelhos'], 'painel')).toBe(
    'espelhos'
  );
  expect(ondeParei('colab-dani', 'admin', ['colaboradores', 'auditoria'], 'colaboradores')).toBe(
    'auditoria'
  );
});

test('VALOR QUE NÃO EXISTE MAIS CAI NO PADRÃO', () => {
  /**
   * Aba renomeada ou removida — "feriados", que saiu do RH — deixaria a
   * tela em branco: o estado apontaria para uma seção que nenhum `if`
   * desenha. E `localStorage` é editável por quem abre o console.
   */
  lembrarOndeParei('colab-dani', 'rh', 'feriados');

  expect(ondeParei('colab-dani', 'rh', ['painel', 'holerites'], 'painel')).toBe(
    'painel'
  );
});

test('SAIR ESQUECE TUDO', () => {
  /**
   * A próxima pessoa a entrar neste computador começa na tela inicial
   * dela, e não na última que o colega estava vendo.
   */
  lembrarOndeParei('colab-dani', 'rh', 'holerites');
  lembrarOndeParei('colab-elias', 'admin', 'auditoria');

  esquecerOndeParei();

  expect(ondeParei('colab-dani', 'rh', ['painel', 'holerites'], 'painel')).toBe('painel');
  expect(
    ondeParei('colab-elias', 'admin', ['colaboradores', 'auditoria'], 'colaboradores')
  ).toBe('colaboradores');
});

test('sem colaborador conhecido, nao guarda nem devolve nada', () => {
  /**
   * No modo rede, na montagem ainda não se sabe quem entrou — a sessão
   * vem do banco. Guardar sob id vazio misturaria a navegação de todo
   * mundo numa chave só.
   */
  lembrarOndeParei('', 'rh', 'holerites');

  /**
   * Confere o ARMAZENAMENTO, e não o que `ondeParei` devolve: as duas
   * funções recusam id vazio, então perguntar a ela daria certo mesmo
   * com a gravação acontecendo sob uma chave sem dono — que é o defeito.
   */
  expect(localStorage.length).toBe(0);
  expect(ondeParei('', 'rh', ['painel', 'holerites'], 'painel')).toBe('painel');
});

// ============================================================
// AS TELAS QUE USAM A MEMÓRIA
// ============================================================

const lerArquivo = async (caminho: string): Promise<string> =>
  Bun.file(new URL(caminho, import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('A ABA PRINCIPAL É RESTAURADA DEPOIS DA SESSÃO, e não na montagem', async () => {
  /**
   * No modo rede a sessão vem do banco: na montagem ainda não se sabe
   * quem entrou, e a memória é por pessoa. Ler só lá em cima devolveria
   * sempre o padrão, e a aba nunca seria restaurada de verdade.
   */
  const app = semComentarios(await lerArquivo('../App.tsx'));

  expect(app).toContain(
    "ondeParei(eu.id, 'aba-principal', ABAS_PRINCIPAIS, 'conversas')"
  );
  expect(app).toContain("lembrarOndeParei(colaboradorAtual.id, 'aba-principal', abaAtiva)");
});

test('GUARDA A ABA QUE VALE, e não a que foi escolhida', async () => {
  /**
   * São diferentes quando a pessoa perde uma permissão: a escolhida
   * continua sendo a antiga, e gravá-la faria a pessoa cair no desvio a
   * cada recarga, para sempre.
   *
   * `abaAtiva` e `subAbaAtiva` são as filtradas por permissão;
   * `abaAtivaEscolhida` e `subAbaEscolhida` são as cruas.
   */
  const app = semComentarios(await lerArquivo('../App.tsx'));
  expect(app).not.toContain("'aba-principal', abaAtivaEscolhida");

  const rede = semComentarios(await lerArquivo('../componentes/PainelRede.tsx'));
  expect(rede).toContain("lembrarOndeParei(colaboradorAtual.id, 'rede', subAbaAtiva)");
  expect(rede).not.toContain("'rede', subAbaEscolhida");

  const admin = semComentarios(await lerArquivo('../componentes/PainelAdministrativo.tsx'));
  expect(admin).toContain("lembrarOndeParei(colaboradorAtual.id, 'admin', abaAtiva)");
  expect(admin).not.toContain("'admin', abaEscolhida");
});

test('O PAINEL DE GESTÃO GANHOU A ABA QUE VALE', async () => {
  /**
   * Ele não tinha nenhuma: as abas sumiam da barra conforme a permissão,
   * mas o CONTEÚDO abaixo era escolhido direto pelo estado. Enquanto o
   * estado nascia sempre em `abaInicial` isso não aparecia; nascendo do
   * que ficou guardado no aparelho, passa a aparecer — bastava a pessoa
   * perder a permissão depois de ter estado lá, ou editar o
   * `localStorage`, e a escala abria sem o botão existir.
   */
  const gestao = semComentarios(await lerArquivo('../componentes/PainelGestao.tsx'));

  expect(gestao).toContain("if (abaEscolhida === 'folgas' && !veEscala) return abaInicial;");
  expect(gestao).toContain("if (abaEscolhida === 'rede' && !veRede) return abaInicial;");
  expect(gestao).toContain("if (abaEscolhida === 'qr' && !veQr) return abaInicial;");

  // E o que é guardado é a que vale
  expect(gestao).toContain("lembrarOndeParei(colaboradorAtual.id, 'gestao', aba)");
});

test('SAIR LIMPA A MEMÓRIA, no mesmo lugar em que encerra a sessão', async () => {
  const app = semComentarios(await lerArquivo('../App.tsx'));

  const inicio = app.indexOf('const lidarDeslogar');
  const fim = app.indexOf('};', inicio);
  const deslogar = app.slice(inicio, fim);

  expect(deslogar).toContain('esquecerOndeParei()');
  expect(deslogar).toContain("setAbaAtiva('conversas')");
});

test('cada tela guarda numa chave propria', async () => {
  /**
   * Chave repetida entre duas telas faria a escolha de uma sobrescrever
   * a da outra, e a pessoa cairia numa aba que não existe na tela que
   * abriu.
   */
  const arquivos = [
    '../App.tsx',
    '../componentes/PainelRede.tsx',
    '../componentes/PainelRH.tsx',
    '../componentes/PainelGestao.tsx',
    '../componentes/PainelAdministrativo.tsx',
  ];

  const chaves: string[] = [];
  for (const caminho of arquivos) {
    const fonte = await lerArquivo(caminho);
    for (const achado of fonte.matchAll(/lembrarOndeParei\([^,]+,\s*'([^']+)'/g)) {
      chaves.push(achado[1]);
    }
  }

  expect(chaves.length).toBe(5);
  expect(new Set(chaves).size).toBe(5);
});
