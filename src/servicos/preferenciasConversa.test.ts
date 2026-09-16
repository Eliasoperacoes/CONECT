/**
 * Verificação das preferências de conversa — CONECTA
 *
 * Decisão do dono do sistema: "excluir conversa" tira da lista de quem
 * clicou, e o histórico fica no banco. O que estes testes prendem é que
 * ocultar nunca vire apagar, e que uma conversa oculta não engula mensagem
 * nova — alguém ser chamado e não ficar sabendo seria pior do que não ter
 * a função.
 */
import { test, expect, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const {
  alternarFixada,
  estaFixada,
  ocultarConversa,
  reexibirConversa,
  deveAparecer,
  aplicarPreferencias,
  contarOcultas,
  obterPreferencias,
} = await import('./preferenciasConversa');

const EU = 'colab-elias';
const OUTRO = 'colab-ana';

const conversa = (id: string, atualizadoEm: string) => ({ id, atualizadoEm });

const ONTEM = '2026-09-15T10:00:00.000Z';
const AGORA = '2026-09-16T10:00:00.000Z';
const DEPOIS = '2026-09-16T23:00:00.000Z';

beforeEach(() => armazenamento.clear());

test('fixar sobe a conversa e não mexe na ordem do resto', () => {
  const lista = [
    conversa('c1', DEPOIS),
    conversa('c2', AGORA),
    conversa('c3', ONTEM),
  ];

  alternarFixada(EU, 'c3');
  expect(aplicarPreferencias(EU, lista).map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
});

test('fixar é reversível', () => {
  expect(alternarFixada(EU, 'c1')).toBe(true);
  expect(estaFixada(EU, 'c1')).toBe(true);
  expect(alternarFixada(EU, 'c1')).toBe(false);
  expect(estaFixada(EU, 'c1')).toBe(false);
});

test('A PREFERÊNCIA É DE CADA PESSOA', () => {
  // O que o gerente fixa não pode aparecer fixado para o colaborador
  alternarFixada(EU, 'c1');
  ocultarConversa(EU, 'c2');

  expect(estaFixada(OUTRO, 'c1')).toBe(false);
  expect(deveAparecer(OUTRO, conversa('c2', AGORA))).toBe(true);
});

// ============================================================
// OCULTAR NÃO É APAGAR
// ============================================================

test('ocultar tira da lista de quem pediu, e só dele', () => {
  const lista = [conversa('c1', AGORA), conversa('c2', AGORA)];

  ocultarConversa(EU, 'c1');
  expect(aplicarPreferencias(EU, lista).map((c) => c.id)).toEqual(['c2']);
  expect(aplicarPreferencias(OUTRO, lista).map((c) => c.id)).toEqual(['c1', 'c2']);
});

test('MENSAGEM NOVA TRAZ A CONVERSA DE VOLTA', () => {
  /**
   * O pior desfecho possível desta função: a pessoa oculta uma conversa,
   * alguém a chama ali, e a mensagem cai num lugar invisível. Ela nunca
   * sabe que foi chamada.
   */
  ocultarConversa(EU, 'c1');

  // Sem novidade, continua oculta
  expect(deveAparecer(EU, conversa('c1', ONTEM))).toBe(false);

  // Mensagem depois de ocultar: volta
  expect(deveAparecer(EU, conversa('c1', DEPOIS))).toBe(true);
});

test('ocultar não apaga: a preferência guarda só a data', () => {
  ocultarConversa(EU, 'c1');
  const pref = obterPreferencias(EU).c1;

  expect(pref.ocultaDesde).toBeTruthy();
  // Nada aqui remove mensagem; quem apaga é a limpeza dos 3 meses no banco
  expect(Object.keys(pref)).not.toContain('mensagens');
});

test('ocultar uma conversa fixada solta o alfinete', () => {
  // Senão ela voltaria grudada no topo assim que chegasse mensagem — a
  // pessoa tirou da frente e a conversa reapareceria em primeiro lugar
  alternarFixada(EU, 'c1');
  ocultarConversa(EU, 'c1');

  expect(estaFixada(EU, 'c1')).toBe(false);
});

test('dá para trazer de volta sem esperar mensagem', () => {
  ocultarConversa(EU, 'c1');
  expect(deveAparecer(EU, conversa('c1', ONTEM))).toBe(false);

  reexibirConversa(EU, 'c1');
  expect(deveAparecer(EU, conversa('c1', ONTEM))).toBe(true);
});

test('a lista sabe quantas estão escondidas', () => {
  const lista = [conversa('c1', ONTEM), conversa('c2', ONTEM), conversa('c3', ONTEM)];
  ocultarConversa(EU, 'c1');
  ocultarConversa(EU, 'c2');

  expect(contarOcultas(EU, lista)).toBe(2);
  expect(contarOcultas(OUTRO, lista)).toBe(0);
});

test('data estragada não faz a conversa sumir', () => {
  // Preferência antiga, relógio errado, dado pela metade: na dúvida a
  // conversa APARECE. Sumir é o erro caro; aparecer a mais, não.
  ocultarConversa(EU, 'c1');
  expect(deveAparecer(EU, conversa('c1', 'data-invalida'))).toBe(true);
});

test('conversa sem preferência nenhuma aparece', () => {
  expect(deveAparecer(EU, conversa('nunca-tocada', AGORA))).toBe(true);
  expect(aplicarPreferencias(EU, [conversa('c9', AGORA)]).map((c) => c.id)).toEqual(['c9']);
});

// ============================================================
// AS AÇÕES PRECISAM EXISTIR NAS DUAS LISTAS
// ============================================================

test('fixar e excluir moram no ITEM, não em quem lista', async () => {
  /**
   * O defeito relatado: eu pus o menu no painel flutuante do computador. A
   * barra do celular usa outra lista, montada no App — e ficou sem fixar e
   * sem excluir. A pessoa conseguia apagar MENSAGEM no telefone, mas não a
   * conversa.
   *
   * A correção foi mover as ações para o item, que as duas listas usam. Este
   * teste impede que elas voltem a morar num lado só.
   */
  const item = await Bun.file(
    new URL('../componentes/ItemConversa.tsx', import.meta.url)
  ).text();

  expect(item).toContain('alternarFixada');
  expect(item).toContain('ocultarConversa');
  // Um toque abre — não pode depender de passar o mouse
  expect(item).not.toContain('group-hover');

  // E quem lista não pode ter a própria cópia do menu
  const painel = await Bun.file(
    new URL('../componentes/PainelConversas.tsx', import.meta.url)
  ).text();
  expect(painel).not.toContain('alternarFixada');
  expect(painel).not.toContain('ocultarConversa');
});

test('as duas listas passam pelas preferências', async () => {
  // Fixar no computador tem que refletir no celular: mesma preferência,
  // mesma filtragem. Antes só o painel flutuante aplicava.
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  expect(app).toContain('aplicarPreferencias(colaboradorAtual.id, conversasIndividuais)');
  expect(app).toContain('aplicarPreferencias(colaboradorAtual.id, grupos)');
});
