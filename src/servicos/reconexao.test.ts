/**
 * O CANAL VOLTOU: O QUE MUDOU NESSE MEIO-TEMPO É BUSCADO.
 *
 * O Elias precisava apertar F5 para ver mensagem de colega. O servidor
 * avisava (medido: as tabelas respondem "Subscribed to PostgreSQL"); o
 * aviso que passava com o canal caído é que se perdia.
 */
import { test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  acompanharCanal,
  definirRecarga,
  pedirRecarga,
  INTERVALO_MINIMO_MS,
} from './reconexao';

let recargas = 0;
let terminar: () => void = () => {};

beforeEach(() => {
  recargas = 0;
  // Cada recarga fica "correndo" até o teste mandar terminar
  definirRecarga(
    () =>
      new Promise<void>((ok) => {
        recargas++;
        terminar = ok;
      })
  );
});

const esperarFim = async () => {
  terminar();
  await new Promise((ok) => setTimeout(ok, 0));
};

test('a primeira inscrição não recarrega: a carga inicial acabou de trazer tudo', () => {
  const canal = acompanharCanal('conversas');
  canal('SUBSCRIBED');
  expect(recargas).toBe(0);
});

test('a volta depois de uma queda recarrega', async () => {
  const canal = acompanharCanal('conversas');
  canal('SUBSCRIBED');
  canal('CHANNEL_ERROR');
  canal('SUBSCRIBED');
  expect(recargas).toBe(1);
  await esperarFim();
});

test('sinais juntos viram uma recarga só', async () => {
  const agora = 1_000_000;
  expect(pedirRecarga(agora)).toBe(true);
  // Outro canal voltou no mesmo instante, com a primeira ainda correndo
  expect(pedirRecarga(agora + 10)).toBe(false);
  await esperarFim();
  // Terminou, mas ainda dentro do intervalo: a primeira já trouxe tudo
  expect(pedirRecarga(agora + 5_000)).toBe(false);
  expect(recargas).toBe(1);
});

test('recarga lenta: outra não começa por cima dela, nem passado o intervalo', async () => {
  // Rede ruim: a primeira ainda está baixando quando o intervalo vence.
  // Duas ao mesmo tempo, e a que terminar por último grava o cache —
  // que pode ser justamente a mais velha.
  const agora = 4_000_000;
  pedirRecarga(agora);
  expect(pedirRecarga(agora + INTERVALO_MINIMO_MS * 2)).toBe(false);
  expect(recargas).toBe(1);
  await esperarFim();
});

test('passado o intervalo, a próxima volta recarrega de novo', async () => {
  const agora = 2_000_000;
  pedirRecarga(agora);
  await esperarFim();
  expect(pedirRecarga(agora + INTERVALO_MINIMO_MS)).toBe(true);
  expect(recargas).toBe(2);
  await esperarFim();
});

test('sem sessão carregada ainda, não há o que recarregar', () => {
  definirRecarga(null);
  expect(pedirRecarga(3_000_000)).toBe(false);
});

test('os quatro canais avisam quando voltam, e a abertura registra a recarga', () => {
  const ler = (arq: string) => readFileSync(join(import.meta.dir, arq), 'utf8');
  const nuvem = ler('nuvem.ts');
  const comunicacao = ler('nuvemComunicacao.ts');

  const inscricoes = [...nuvem.matchAll(/\.subscribe\(([^)]*\)?)\)/g), ...comunicacao.matchAll(/\.subscribe\(([^)]*\)?)\)/g)];
  expect(inscricoes).toHaveLength(4);
  for (const [, argumento] of inscricoes) expect(argumento).toContain('acompanharCanal(');

  expect(nuvem).toContain('definirRecarga(carregarTudo)');
  expect(nuvem).toContain('recarregarAoVoltar()');
});
