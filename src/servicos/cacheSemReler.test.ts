/**
 * O CACHE NÃO RELÊ O ARMAZENAMENTO A CADA PERGUNTA (20/10/2026)
 *
 * No navegador, cada `localStorage.getItem` copia o texto inteiro — 3,6 MB
 * das batidas — e o Ponto e o Início levavam 6 a 8 segundos para abrir com
 * a rede inteira. A cópia em memória agora vale até alguém GRAVAR a chave.
 *
 * O perigo é servir dado velho num sistema que decide hora trabalhada: por
 * isso metade deste arquivo confere que qualquer gravação o derruba.
 */
import { test, expect, beforeEach } from 'bun:test';

class ArmazenamentoQueConta {
  private dados = new Map<string, string>();
  leituras = 0;
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
  getItem(k: string) { this.leituras++; return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}

let armazenamento: ArmazenamentoQueConta;
const { lerLista, lerIndicePor, esquecerCacheDeLeitura } = await import('./cacheDeLeitura');

beforeEach(() => {
  armazenamento = new ArmazenamentoQueConta();
  (globalThis as any).localStorage = armazenamento;
  esquecerCacheDeLeitura();
});

test('mil perguntas seguidas leem o armazenamento uma vez só', () => {
  localStorage.setItem('lista', JSON.stringify([1, 2, 3]));
  for (let i = 0; i < 1000; i++) expect(lerLista<number>('lista')).toEqual([1, 2, 3]);
  expect(armazenamento.leituras).toBe(1);
});

test('gravar, apagar ou limpar derruba a cópia: nunca dado velho', () => {
  localStorage.setItem('lista', JSON.stringify([1]));
  expect(lerLista<number>('lista')).toEqual([1]);
  localStorage.setItem('lista', JSON.stringify([1, 2]));
  expect(lerLista<number>('lista')).toEqual([1, 2]);
  localStorage.removeItem('lista');
  expect(lerLista<number>('lista')).toEqual([]);
  localStorage.setItem('lista', JSON.stringify([9]));
  expect(lerLista<number>('lista')).toEqual([9]);
  localStorage.clear();
  expect(lerLista<number>('lista')).toEqual([]);
});

test('gravar uma chave não derruba a outra', () => {
  localStorage.setItem('a', JSON.stringify([1]));
  localStorage.setItem('b', JSON.stringify([2]));
  lerLista('a');
  lerLista('b');
  const antes = armazenamento.leituras;
  localStorage.setItem('b', JSON.stringify([3]));
  expect(lerLista<number>('a')).toEqual([1]);
  expect(armazenamento.leituras).toBe(antes);
  expect(lerLista<number>('b')).toEqual([3]);
});

test('quem mexe na lista devolvida não estraga o cache', () => {
  localStorage.setItem('lista', JSON.stringify([3, 1, 2]));
  lerLista<number>('lista').push(99);
  lerLista<number>('lista').sort();
  expect(lerLista<number>('lista')).toEqual([3, 1, 2]);
});

test('o índice agrupa uma vez, e se refaz depois de uma gravação', () => {
  const batidas = [
    { id: 1, pessoa: 'ana', dia: 'seg' },
    { id: 2, pessoa: 'ana', dia: 'seg' },
    { id: 3, pessoa: 'bia', dia: 'seg' },
  ];
  localStorage.setItem('batidas', JSON.stringify(batidas));
  const chave = (b: { id: number; pessoa: string; dia: string }) => `${b.pessoa}|${b.dia}`;
  const indice = lerIndicePor('batidas', 'pessoa-dia', chave);
  expect(indice.get('ana|seg')?.map((b) => b.id)).toEqual([1, 2]);
  expect(lerIndicePor('batidas', 'pessoa-dia', chave)).toBe(indice);

  localStorage.setItem('batidas', JSON.stringify([...batidas, { id: 4, pessoa: 'ana', dia: 'seg' }]));
  expect(lerIndicePor('batidas', 'pessoa-dia', chave).get('ana|seg')?.map((b) => b.id)).toEqual([1, 2, 4]);
});
