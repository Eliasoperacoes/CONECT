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
/** Como o banco recusa o insert: 23505 (já existe) ou 42501 (a regra de inserção) */
let erroDoInsert = { code: '23505', message: 'duplicate key' };
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
      insert: () => Promise.resolve({ error: erroDoInsert }),
      update: () => construtorDoUpdate(),
    }),
  },
}));

const { nuvem } = await import('./nuvem');

beforeEach(() => {
  linhasAfetadas = [];
  erroDoInsert = { code: '23505', message: 'duplicate key' };
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

test('O GERENTE ABONA: a regra de inserção recusa (42501) e a decisão vai pelo update (15/10/2026)', async () => {
  // O print do Elias: "new row violates row-level security policy for table ajustes_jornada"
  erroDoInsert = { code: '42501', message: 'new row violates row-level security policy for table "ajustes_jornada"' };
  linhasAfetadas = [{ id: 'a1' }];
  const r = await nuvem.salvarAjuste(AJUSTE);
  expect(r).toEqual({ sucesso: true });
  expect(pedidoDeVolta).toHaveLength(1);

  // E se o update também não mudar nada, continua sendo recusa — não sucesso
  linhasAfetadas = [];
  const barrado = await nuvem.salvarAjuste(AJUSTE);
  expect(barrado.sucesso).toBe(false);
  expect(barrado.erro).toContain('você não responde por esta pessoa');
});

test('outro erro do insert não vira tentativa de update', async () => {
  erroDoInsert = { code: '22P02', message: 'invalid input' };
  const r = await nuvem.salvarAjuste(AJUSTE);
  expect(r).toEqual({ sucesso: false, erro: 'invalid input' });
  expect(pedidoDeVolta).toHaveLength(0);
});
