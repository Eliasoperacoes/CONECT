/**
 * ABONAR UM DIA PEDE CONFIRMAÇÃO (AprovacaoJornada.tsx, 25/11/2026).
 *
 * Três faltas combinadas para descontar do banco — Leigislaine 07/11,
 * Fernanda 30/10, Mikael 21/11 — foram abonadas na fila e ficaram com 0h00.
 * O "Abonar dia" era o botão cheio, o de destaque, e gravava num clique.
 *
 * O que se prende, lendo a tela: o botão de abonar só abre a confirmação;
 * a gravação do abono existe uma vez, dentro dela; cada botão diz o que faz
 * com o banco; e nenhum dos dois volta a ser o botão de destaque.
 */
import { test, expect } from 'bun:test';

const tela = await Bun.file(new URL('../componentes/AprovacaoJornada.tsx', import.meta.url)).text();

/** Do marcador até o fim do botão que o contém. */
const botao = (marcador: string) => {
  const i = tela.indexOf(marcador);
  expect(i).toBeGreaterThan(-1);
  return tela.slice(i, tela.indexOf('</button>', i));
};

test('o botão "Abonar dia" só abre a confirmação: não grava nada', () => {
  const abonar = botao('id={`abonar-${ajuste.id}`}');
  expect(abonar).toContain('setConfirmandoAbono(ajuste.id)');
  expect(abonar).not.toContain('decidirDiaIncompleto');
});

test('o abono é gravado num lugar só, o botão da confirmação', () => {
  const gravacoes = tela.split('decidirDiaIncompleto(ajuste.id, true)').length - 1;
  expect(gravacoes).toBe(1);
  expect(botao('id={`confirmar-abono-${ajuste.id}`}')).toContain('decidirDiaIncompleto(ajuste.id, true)');
});

test('cada botão diz o que faz com o banco de horas', () => {
  expect(botao('id={`debito-${ajuste.id}`}')).toContain('desconta {formatarMinutos(ajuste.minutosPrevistos)} do banco');
  expect(botao('id={`abonar-${ajuste.id}`}')).toContain('não desconta do banco');
  expect(tela).toContain('<strong>não desconta {formatarMinutos(ajuste.minutosPrevistos)}</strong>');
});

test('nenhum dos dois é o botão de destaque: a tela não empurra para o abono', () => {
  for (const id of ['id={`debito-${ajuste.id}`}', 'id={`abonar-${ajuste.id}`}']) {
    expect(botao(id)).not.toMatch(/bg-conecta-acento|bg-conecta-ok|bg-\[var\(--c-acento\)\]/);
  }
});
