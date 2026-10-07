/**
 * O TOQUE NO AVISO DE HOLERITE abre a folha certa da aba Eu — uma vez.
 */
import { test, expect } from 'bun:test';
import { pedirFolhaDoMeuRH, tomarFolhaPedida, ouvirFolhaPedida, FOLHA_DA_SECAO } from './folhaPedida';
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
  const trecho = app.slice(app.indexOf('if (FOLHA_DA_SECAO[destino.secao])'), app.indexOf("setAbaAtiva('painel');\n    setConversaAtivaId(null);\n    setSecaoAlvo"));
  expect(trecho.length).toBeGreaterThan(0);
  expect(trecho).toContain("setAbaAtiva('eu')");
  expect(trecho).toContain('pedirFolhaDoMeuRH(FOLHA_DA_SECAO[destino.secao]!)');
  // O lembrete do espelho (07/10/2026) abre a folha do espelho
  expect(FOLHA_DA_SECAO).toEqual({ meus_holerites: 'holerites', minhas_advertencias: 'advertencias', meus_espelhos: 'espelho' });
  expect(destinoDoPush({ tipo: 'secao', conversaId: 'meus_espelhos' } as any)).toEqual({ tipo: 'secao', secao: 'meus_espelhos' });
});

test('o aviso do COMPROVANTE leva àquela batida', () => {
  expect(destinoDoPush({ tipo: 'comprovante', conversaId: 'bat-1' } as any)).toEqual({ tipo: 'comprovante', registroId: 'bat-1' });
  expect(destinoDoPush({ tipo: 'comprovante' } as any)).toBeNull();
});
