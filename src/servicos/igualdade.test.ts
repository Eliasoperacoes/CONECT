/**
 * Verificação do REDESENHO À TOA — CONECTA
 *
 * O que motivou: "o clique não pega de primeira" nas abas de dentro, no
 * computador. Nada a ver com o clique.
 *
 * `obterColaboradores()` lê do `localStorage` com `JSON.parse` e ainda
 * faz `.map(c => ({ ...c }))` — devolve objetos NOVOS toda vez, mesmo
 * sem um byte ter mudado. O App chamava `setColaboradorAtual(...)` com
 * esse objeto a cada notificação do banco, e são 34 lugares que
 * notificam.
 *
 * React compara por identidade. Objeto novo é mudança, então a
 * aplicação redesenhava sozinha várias vezes por minuto — e o navegador
 * só emite `click` quando o `mousedown` e o `mouseup` caem no MESMO
 * elemento. Redesenho entre os dois engole o clique.
 */
import { test, expect } from 'bun:test';
import { mesmoConteudo, manterSeIgual } from './igualdade';

/** Reproduz o que `obterColaboradores` faz a cada chamada. */
const BRUTO = JSON.stringify([
  { id: 'c1', nome: 'Ana Prado', cargo: 'Vendedora', loja: 'Pirassununga', nivel: 1 },
  { id: 'c2', nome: 'Bruno Lemes', cargo: 'Balconista', loja: 'Descalvado', nivel: 1 },
]);
const lerComoOBanco = () => JSON.parse(BRUTO).map((c: object) => ({ ...c }));

test('A CAUSA: duas leituras iguais são objetos DIFERENTES', () => {
  /**
   * É este `false` que fazia o React redesenhar. Se um dia
   * `obterColaboradores` passar a devolver o mesmo objeto, este teste
   * continua válido — ele descreve o que o React compara, não o que o
   * banco faz.
   */
  const a = lerComoOBanco()[0];
  const b = lerComoOBanco()[0];

  expect(a === b).toBe(false);
  expect(mesmoConteudo(a, b)).toBe(true);
});

test('manterSeIgual DEVOLVE O ANTERIOR quando nada mudou', () => {
  /**
   * Devolver o anterior é o ponto todo: o React recebe o mesmo objeto,
   * não vê mudança e não redesenha. Devolver uma cópia com o mesmo
   * conteúdo não resolveria nada.
   */
  const anterior = lerComoOBanco();
  const novo = lerComoOBanco();

  expect(manterSeIgual(anterior, novo)).toBe(anterior);
});

test('e DEVOLVE O NOVO quando mudou de verdade', () => {
  /**
   * O lado que não pode falhar: segurar o anterior com o conteúdo
   * diferente congelaria a tela num dado velho — muito pior que
   * redesenhar demais.
   */
  const anterior = lerComoOBanco();
  const novo = lerComoOBanco();
  novo[0].nome = 'Ana Prado Silva';

  expect(manterSeIgual(anterior, novo)).toBe(novo);
});

test('pega mudança em qualquer campo, inclusive um que ainda não existe', () => {
  /**
   * Por `JSON.stringify`, e não campo a campo: coluna nova na ficha
   * entra na comparação sozinha. Uma lista escrita à mão precisaria ser
   * lembrada a cada coluna — e seria esquecida na primeira.
   */
  const anterior = { id: 'c1', nome: 'Ana' };
  const comCampoNovo = { id: 'c1', nome: 'Ana', matricula: '123' };

  expect(mesmoConteudo(anterior, comCampoNovo)).toBe(false);
});

test('lista com um item a mais é diferente', () => {
  const anterior = lerComoOBanco();
  const comMais = [...lerComoOBanco(), { id: 'c3', nome: 'Carla' }];

  expect(mesmoConteudo(anterior, comMais)).toBe(false);
  expect(manterSeIgual(anterior, comMais)).toBe(comMais);
});

test('null e undefined não quebram', () => {
  /**
   * `obterAvisoDirecaoNaoLido()` devolve `null` quando não há aviso —
   * e passa a devolver objeto quando aparece um. A comparação precisa
   * atravessar os dois sentidos sem lançar.
   */
  expect(mesmoConteudo(null, null)).toBe(true);
  expect(mesmoConteudo(null, { id: 'm1' })).toBe(false);
  expect(mesmoConteudo({ id: 'm1' }, null)).toBe(false);
  expect(manterSeIgual(null, null)).toBe(null);
});

test('valor que não serializa é tratado como DIFERENTE', () => {
  /**
   * O lado seguro. Redesenhar à toa é chato; não redesenhar quando
   * mudou é dado velho na tela de um sistema que decide hora
   * trabalhada.
   */
  const comCiclo: Record<string, unknown> = { id: 'c1' };
  comCiclo.ele = comCiclo;

  expect(mesmoConteudo(comCiclo, comCiclo)).toBe(true); // mesma referência
  expect(mesmoConteudo(comCiclo, { id: 'c1', ele: {} })).toBe(false);
});

test('a comparação é barata perto de um redesenho', () => {
  /**
   * 89 pessoas, que é a rede inteira. Se isto custasse caro, a correção
   * trocaria um problema por outro.
   */
  const a = JSON.parse(
    JSON.stringify(
      Array.from({ length: 89 }, (_, i) => ({
        id: `c${i}`,
        nome: `Pessoa ${i}`,
        foto: 'x'.repeat(80),
      }))
    )
  );
  const b = JSON.parse(JSON.stringify(a));

  const inicio = performance.now();
  for (let i = 0; i < 200; i++) mesmoConteudo(a, b);
  const porChamada = (performance.now() - inicio) / 200;

  expect(porChamada).toBeLessThan(2);
});

// ============================================================
// ONDE A CORREÇÃO FOI APLICADA
// ============================================================

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('O APP NÃO TROCA O ESTADO POR OBJETO NOVO IGUAL', async () => {
  /**
   * `recarregarDados` roda a cada notificação do banco. Os quatro
   * estados que ele mexe vinham de funções que montam objeto novo — e
   * os quatro redesenhavam a árvore inteira à toa.
   */
  const app = semComentarios(await Bun.file('src/App.tsx').text());

  for (const estado of [
    'setColaboradorAtual',
    'setConversasIndividuais',
    'setGrupos',
    'setAvisoNaoLido',
  ]) {
    expect(app).toContain(`${estado}((anterior) =>`);
  }

  expect(app).toContain('manterSeIgual(anterior, bancoDados.obterColaboradorAtual())');
});

test('o painel de rede também', async () => {
  /**
   * `obterEstatisticasRede()` monta objeto novo, e `atualizar` é
   * assinante do banco. É a tela de DENTRO, que foi justamente onde o
   * defeito apareceu.
   */
  const painel = semComentarios(await Bun.file('src/componentes/PainelRede.tsx').text());

  expect(painel).toContain('setEstatisticas((anterior) =>');
  expect(painel).toContain('manterSeIgual(anterior, bancoDados.obterEstatisticasRede())');
});
