/**
 * O PONTO AO VIVO (21/10/2026): cada batida da rede fazia o aparelho do RH
 * baixar de novo a janela inteira (~19 mil batidas), e cada apuração baixava
 * todas as apurações. Agora a rajada de eventos é aplicada de uma vez à lista
 * que o aparelho tem — e, na dúvida, a carga completa volta.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { aplicarEventosNaLista } from './pontoAoVivo';

type Linha = { id: string; data: string; hora: string };
type Item = { id: string; data: string; horaFormatada: string };
const converter = (l: Linha): Item => ({ id: l.id, data: l.data, horaFormatada: l.hora });
const naJanela = (b: Item) => b.data >= '2026-09-01' && b.data <= '2026-10-31';
const lista = (): Item[] => [{ id: 'b1', data: '2026-10-20', horaFormatada: '07:30' }];

test('a rajada inteira entra de uma vez: nova, corrigida e apagada', () => {
  const r = aplicarEventosNaLista<Linha, Item>(
    lista(),
    [
      { eventType: 'INSERT', new: { id: 'b2', data: '2026-10-21', hora: '07:31' } },
      { eventType: 'INSERT', new: { id: 'b3', data: '2026-10-21', hora: '07:32' } },
      { eventType: 'UPDATE', new: { id: 'b1', data: '2026-10-20', hora: '07:35' } },
      { eventType: 'DELETE', old: { id: 'b3' } },
    ],
    converter,
    naJanela
  );
  expect(r.recarregar).toBe(false);
  expect(r.lista.map((b) => `${b.id} ${b.horaFormatada}`).sort()).toEqual(['b1 07:35', 'b2 07:31']);
});

test('o mesmo evento duas vezes não duplica (a fila pode reaplicar depois de uma carga)', () => {
  const ev = { eventType: 'INSERT', new: { id: 'b2', data: '2026-10-21', hora: '07:31' } };
  const r = aplicarEventosNaLista<Linha, Item>(lista(), [ev, ev], converter, naJanela);
  expect(r.lista.filter((b) => b.id === 'b2')).toHaveLength(1);
});

test('batida fora da janela não entra, e a que saiu dela é tirada', () => {
  const r = aplicarEventosNaLista<Linha, Item>(
    lista(),
    [
      { eventType: 'INSERT', new: { id: 'velha', data: '2026-06-01', hora: '07:30' } },
      { eventType: 'UPDATE', new: { id: 'b1', data: '2026-06-02', hora: '07:30' } },
    ],
    converter,
    naJanela
  );
  expect(r.lista).toEqual([]);
});

test('na dúvida, carga completa: evento sem a linha, apagar sem id, tipo estranho', () => {
  for (const ev of [
    { eventType: 'INSERT', new: null },
    { eventType: 'DELETE', old: {} },
    { eventType: 'TRUNCATE' },
  ]) {
    const r = aplicarEventosNaLista<Linha, Item>(lista(), [ev as any], converter, naJanela);
    expect(r.recarregar).toBe(true);
    expect(r.lista).toEqual(lista());
  }
});

test('apagar o que o aparelho não tem não muda nada (nem regrava)', () => {
  const r = aplicarEventosNaLista<Linha, Item>(lista(), [{ eventType: 'DELETE', old: { id: 'outra' } }], converter, naJanela);
  expect([r.mudou, r.recarregar]).toEqual([false, false]);
});

test('o tempo real do ponto vai para a fila, e não para a janela inteira', () => {
  const nuvem = readFileSync('src/servicos/nuvem.ts', 'utf8');
  const canal = nuvem.slice(nuvem.indexOf(".channel('conecta-ponto')"), nuvem.indexOf("subscribe(acompanharCanal('ponto'))"));
  expect(canal).toContain("this.receberAoVivo('ponto', evento as EventoAoVivo<LinhaRegistroPonto>)");
  expect(canal).toContain("this.receberAoVivo('ajustes', evento as EventoAoVivo<LinhaAjuste>)");
  expect(canal).toContain('this.sincronizarCodigos();');
  expect(canal).not.toContain('this.sincronizarPonto();');
  // A escuta morta de `colaboradores` saiu
  expect(nuvem).not.toContain(".channel('conecta-colaboradores')");
});
