/**
 * O TOQUE NO AVISO DE HOLERITE abre a folha certa da aba Eu — uma vez.
 */
import { test, expect } from 'bun:test';
import { pedirFolhaDoMeuRH, tomarFolhaPedida, ouvirFolhaPedida } from './folhaPedida';
import { destinoDoPush } from './pushNativo';

test('o pedido é entregue uma vez: voltar à aba depois não reabre a folha', () => {
  pedirFolhaDoMeuRH('holerites');
  expect(tomarFolhaPedida()).toBe('holerites');
  expect(tomarFolhaPedida()).toBeNull();
});

test('a tela já montada é avisada na hora', () => {
  const vistos: Array<string | null> = [];
  const parar = ouvirFolhaPedida(() => vistos.push(tomarFolhaPedida()));
  pedirFolhaDoMeuRH('advertencias');
  parar();
  pedirFolhaDoMeuRH('holerites');
  expect(vistos).toEqual(['advertencias']);
  tomarFolhaPedida();
});

test('o aviso do Android com as seções novas vira destino — e seção inventada, não', () => {
  expect(destinoDoPush({ tipo: 'secao', conversaId: 'meus_holerites' } as any)).toEqual({
    tipo: 'secao',
    secao: 'meus_holerites',
  });
  expect(destinoDoPush({ tipo: 'secao', conversaId: 'minhas_advertencias' } as any)).toEqual({
    tipo: 'secao',
    secao: 'minhas_advertencias',
  });
  expect(destinoDoPush({ tipo: 'secao', conversaId: 'painel_secreto' } as any)).toBeNull();
});

test('o App leva as seções do RH à aba Eu, e não ao painel de gestão', async () => {
  const app = await Bun.file('src/App.tsx').text();
  const trecho = app.slice(app.indexOf("destino.secao === 'meus_holerites'"), app.indexOf("setAbaAtiva('painel');\n    setConversaAtivaId(null);\n    setSecaoAlvo"));
  expect(trecho).toContain("setAbaAtiva('eu')");
  expect(trecho).toContain('pedirFolhaDoMeuRH(');
});
