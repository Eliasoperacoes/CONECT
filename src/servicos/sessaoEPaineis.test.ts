/**
 * Quatro pedidos do Elias (30/09/2026), cada um com a regra que o sustenta.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ler = (arq: string) =>
  readFileSync(join(import.meta.dir, '..', arq), 'utf8').replace(/\r\n/g, '\n');
/** O corpo de uma função `const nome = (...) => { ... };`, até o fim dela. */
const corpoDe = (fonte: string, nome: string): string => {
  const ini = fonte.indexOf(`const ${nome} = `);
  expect(ini).toBeGreaterThan(-1);
  return fonte.slice(ini, fonte.indexOf('\n  };\n', ini));
};

// 1. Sair de uma conta e entrar em outra levava a janela de conversa junto

test('sair limpa as conversas abertas da pessoa', () => {
  const app = ler('App.tsx');
  const limpar = corpoDe(app, 'limparTelaDaSessao');
  for (const estado of ['setJanelas([])', 'setConversaAtivaId(null)', 'setSecaoListaAberta(null)', "setBuscaConversas('')", 'setMensagemAlvo(null)']) {
    expect(limpar).toContain(estado);
  }
  expect(corpoDe(app, 'lidarDeslogar')).toContain('limparTelaDaSessao()');
});

test('trocar a pessoa da tela também limpa — e antes de qualquer retorno da tela', () => {
  const app = ler('App.tsx');
  const efeito = app.indexOf('}, [colaboradorAtual.id]);', app.indexOf('refPessoaDaTela'));
  expect(app.slice(app.indexOf('refPessoaDaTela'), efeito)).toContain('limparTelaDaSessao()');
  // Hook depois de `if (...) return` derruba a tela inteira (ordemDosHooks)
  expect(efeito).toBeLessThan(app.indexOf('if (verificandoSessao) return null;'));
});

// 2. Conversa minimizada não avisava de mensagem nova

test('o botão das conversas em espera soma as não lidas', () => {
  const espera = ler('componentes/ConversasEmEspera.tsx');
  expect(espera).toContain('conversas.reduce((soma, c) => soma + (c.naoLidas || 0), 0)');
  expect(espera).toContain('id="nao-lidas-em-espera"');
});

test('as encolhidas saem da lista viva, e não da foto de quando encolheram', () => {
  const app = ler('App.tsx');
  const ini = app.indexOf('const conversasEncolhidas = useMemo(');
  const memo = app.slice(ini, app.indexOf(');\n', app.indexOf('[janelas', ini)) + 2);
  expect(memo).toContain('conversasIndividuais.find(');
  expect(memo).toContain('[janelas, conversasIndividuais, grupos]');
});

// 3. A separação por setor no painel do RH — sem cópia

test('Lojas e o painel do RH usam o MESMO componente de setores', () => {
  const rede = ler('componentes/PainelRede.tsx');
  const rh = ler('componentes/PainelRH.tsx');
  expect(rede).toContain('<SeparacaoPorSetor />');
  expect(rh).toContain('<SeparacaoPorSetor />');
  // Ninguém redesenha a seção por conta própria
  expect(rede).not.toContain('Separações por Setor');
  expect(rh).not.toContain('Separações por Setor');

  // E no RH ela fica dentro do Painel, não solta em outra aba
  const painel = rh.slice(rh.indexOf("{secao === 'painel' && ("), rh.indexOf("{secao === 'holerites'"));
  expect(painel).toContain('<SeparacaoPorSetor />');
});

// 4. Férias para a liderança

test('o líder tem a aba Férias, pela mesma permissão da escala', () => {
  const gestao = ler('componentes/PainelGestao.tsx');
  expect(gestao).toContain("...(veEscala ? [{ id: 'ferias' as Aba, rotulo: 'Férias' }] : [])");
  expect(gestao).toContain("(abaEscolhida === 'folgas' || abaEscolhida === 'ferias') && !veEscala");
  expect(gestao).toMatch(/aba === 'ferias' \? \([\s\S]*?<AbaFerias colaboradorAtual=\{colaboradorAtual\} \/>/);
});

test('a tela de férias mostra só a alçada de quem abre', () => {
  const ferias = ler('componentes/AbaFerias.tsx');
  expect(ferias).toContain('.filter((c) => servicoPonto.podeDecidirSobre(c))');
});
