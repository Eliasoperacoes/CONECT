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

// ------------------------------------------------------------------
// AS LISTAS GRANDES VÃO COMPRIMIDAS (20/10/2026): 62 dias de batidas da
// rede (6,7 milhões de caracteres) não cabiam no navegador (~5,2 milhões)
// ------------------------------------------------------------------
const { gravarLista, comprimirTexto, descomprimirTexto, PREFIXO_COMPRIMIDO } = await import('./cacheDeLeitura');

const batidasDaRede = () => {
  const lista: Array<Record<string, unknown>> = [];
  for (let p = 0; p < 89; p++)
    for (let d = 1; d <= 20; d++)
      for (const tipo of ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'])
        lista.push({
          id: `ponto-${p}-${d}-${tipo}-${Math.random().toString(36).slice(2)}`,
          colaboradorId: `colab-${p}`, data: `2026-10-${String(d).padStart(2, '0')}`, tipo,
          horario: '2026-10-01T10:30:00.000Z', horaFormatada: '07:30', metodo: 'qrcode', loja: 'Pirassununga',
          nsr: 1000 + lista.length, codigoVerificacao: Math.random().toString(16).slice(2).repeat(4),
        });
  return lista;
};

test('comprimir e abrir devolve exatamente o mesmo, com acento e tudo', () => {
  const textos = ['', '[]', JSON.stringify([{ nome: 'Ação São João — ç ü ñ 😀' }]), JSON.stringify(batidasDaRede())];
  for (const t of textos) expect(descomprimirTexto(comprimirTexto(t))).toBe(t);
});

test('a lista das batidas cai a menos de um quarto, sem caractere que o navegador estrague', () => {
  const json = JSON.stringify(batidasDaRede());
  const guardado = comprimirTexto(json);
  expect(guardado.length).toBeLessThan(json.length / 4);
  const corpo = guardado.slice(PREFIXO_COMPRIMIDO.length);
  for (let i = corpo.indexOf(':') + 1; i < corpo.length; i++) {
    const c = corpo.charCodeAt(i);
    // Nem metade de par (U+D800–DFFF) nem caractere de controle
    expect(c >= 0x0800 && c <= 0x87ff).toBe(true);
  }
});

test('as batidas e as apurações vão comprimidas; o resto continua JSON', () => {
  gravarLista('conecta_v4_registros_ponto', [{ id: 1 }]);
  gravarLista('conecta_v4_ajustes_jornada', [{ id: 2 }]);
  gravarLista('conecta_v4_feriados', [{ id: 3 }]);
  expect(localStorage.getItem('conecta_v4_registros_ponto')!.startsWith(PREFIXO_COMPRIMIDO)).toBe(true);
  expect(localStorage.getItem('conecta_v4_ajustes_jornada')!.startsWith(PREFIXO_COMPRIMIDO)).toBe(true);
  expect(localStorage.getItem('conecta_v4_feriados')).toBe('[{"id":3}]');
  esquecerCacheDeLeitura();
  expect(lerLista('conecta_v4_registros_ponto')).toEqual([{ id: 1 }]);
});

test('o que já estava guardado sem compressão continua abrindo', () => {
  localStorage.setItem('conecta_v4_registros_ponto', JSON.stringify([{ id: 'antigo' }]));
  expect(lerLista('conecta_v4_registros_ponto')).toEqual([{ id: 'antigo' }]);
});
