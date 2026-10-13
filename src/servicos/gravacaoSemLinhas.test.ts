/**
 * DECISÃO DE PONTO QUE O BANCO NÃO GRAVOU NÃO VIRA "SUCESSO"
 * (laudo de 13/10/2026, item 3).
 *
 * A RLS barra o update sem erro: zero linhas afetadas, e o PostgREST
 * responde como se tivesse dado certo. A aprovação de hora extra
 * (`salvarAjuste`) e a correção de marcação (`salvarAjustePonto`) caem no
 * update quando a linha já existe — e a tela dizia "aprovado"/"corrigido"
 * com o banco intacto. Aqui o banco responde exatamente assim.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

/** Quantas linhas o update "afetou" — zero é o que a RLS devolve ao barrar. */
let linhasAfetadas: Array<{ id: string }> = [];
const pedidoDeVolta: boolean[] = [];

const construtorDoUpdate = () => {
  const c: any = {
    eq: () => c,
    select: () => {
      pedidoDeVolta.push(true);
      return Promise.resolve({ data: linhasAfetadas, error: null });
    },
    // Sem `.select()`, o update se resolve sozinho como sucesso — é o defeito
    then: (ok: (v: unknown) => void) => ok({ data: null, error: null }),
  };
  return c;
};

const real = await import('./supabase');
mock.module('./supabase', () => ({
  ...real,
  usandoNuvem: () => true,
  supabase: {
    from: () => ({
      insert: () => Promise.resolve({ error: { code: '23505', message: 'duplicate key' } }),
      update: () => construtorDoUpdate(),
    }),
  },
}));

const { nuvem } = await import('./nuvem');

beforeEach(() => {
  linhasAfetadas = [];
  pedidoDeVolta.length = 0;
});

const AJUSTE = {
  id: 'a1', colaboradorId: 'ana', data: '2026-10-13', tipo: 'hora_extra', minutos: 30,
  minutosTrabalhados: 520, minutosPrevistos: 490, estado: 'aprovado', criadoEm: '',
} as any;

const BATIDA = {
  id: 'r1', colaboradorId: 'ana', data: '2026-10-13', tipo: 'saida', horario: '2026-10-13T20:10:00Z',
  horaFormatada: '17:10', metodo: 'ajuste_lider', loja: 'Pirassununga', criadoEm: '', justificativa: 'esqueceu',
} as any;

test('APROVAÇÃO que a regra do banco barrou: zero linhas é recusa, com o motivo', async () => {
  const r = await nuvem.salvarAjuste(AJUSTE);
  expect(pedidoDeVolta).toHaveLength(1);
  expect(r.sucesso).toBe(false);
  expect(r.erro).toContain('você não responde por esta pessoa');
});

test('CORREÇÃO DE MARCAÇÃO que a regra do banco barrou: zero linhas é recusa', async () => {
  const r = await nuvem.salvarAjustePonto(BATIDA);
  expect(pedidoDeVolta).toHaveLength(1);
  expect(r.sucesso).toBe(false);
  expect(r.erro).toContain('Nada foi alterado');
});

test('quando o banco grava de verdade (uma linha de volta), é sucesso', async () => {
  linhasAfetadas = [{ id: 'x' }];
  expect((await nuvem.salvarAjuste(AJUSTE)).sucesso).toBe(true);
  expect((await nuvem.salvarAjustePonto(BATIDA)).sucesso).toBe(true);
});
