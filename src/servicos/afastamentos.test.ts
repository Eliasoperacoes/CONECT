/**
 * O AFASTAMENTO NA TELA (servicos/afastamentos.ts, 17/10/2026): só o RH
 * registra, as datas fazem sentido, dois afastamentos não se sobrepõem — e
 * o dia afastado aparece como "afastado" no aparelho.
 */
import { test, expect, beforeEach } from 'bun:test';

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

const { registrarAfastamento, removerAfastamento, afastamentosDe } = await import('./afastamentos');
const { situacaoDoDia } = await import('./justificativasCache');

const pessoa = (id: string, setor: string, nivel: number) => ({
  id, nome: id, login: id, cargo: 'x', setor, loja: 'Pirassununga', nivel,
  foto: '', presenca: 'disponivel', vistoPorUltimo: '', ativo: true,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('conecta_v4_colaboradores', JSON.stringify([pessoa('dani', 'RH', 4), pessoa('lia', 'Balcão', 2), pessoa('ana', 'Balcão', 1)]));
  localStorage.setItem('conecta_v4_colaborador_atual', 'dani');
});

test('o RH registra, e o dia afastado vira "afastado"', async () => {
  expect(await registrarAfastamento({ colaboradorId: 'ana', inicio: '2026-10-05', fim: '2026-10-20', motivo: 'doenca' })).toEqual({ sucesso: true });
  expect(situacaoDoDia('ana', '2026-10-10')).toBe('afastado');
  expect(situacaoDoDia('ana', '2026-10-21')).toBe('normal');
  expect(afastamentosDe('ana')[0]).toMatchObject({ motivo: 'doenca', registradoPorNome: 'dani' });
});

test('o líder não registra', async () => {
  localStorage.setItem('conecta_v4_colaborador_atual', 'lia');
  expect(await registrarAfastamento({ colaboradorId: 'ana', inicio: '2026-10-05', motivo: 'doenca' })).toEqual({
    sucesso: false,
    erro: 'Só o RH e o TI registram afastamento.',
  });
});

test('volta antes do início e período sobreposto são recusados', async () => {
  expect((await registrarAfastamento({ colaboradorId: 'ana', inicio: '2026-10-10', fim: '2026-10-01', motivo: 'doenca' })).erro).toBe(
    'A volta não pode ser antes do início.'
  );
  await registrarAfastamento({ colaboradorId: 'ana', inicio: '2026-10-05', motivo: 'acidente' });
  expect((await registrarAfastamento({ colaboradorId: 'ana', inicio: '2026-12-01', fim: '2026-12-10', motivo: 'doenca' })).erro).toContain(
    'Já há um afastamento de 05/10/2026 sem data de volta'
  );
});

test('dar a volta encerra; remover devolve os dias ao trabalho', async () => {
  await registrarAfastamento({ colaboradorId: 'ana', inicio: '2026-10-05', motivo: 'acidente' });
  const [a] = afastamentosDe('ana');
  expect(situacaoDoDia('ana', '2026-11-30')).toBe('afastado');
  expect(await registrarAfastamento({ ...a, fim: '2026-10-15' })).toEqual({ sucesso: true });
  expect(situacaoDoDia('ana', '2026-11-30')).toBe('normal');
  expect(afastamentosDe('ana')).toHaveLength(1);
  expect(await removerAfastamento(a.id)).toEqual({ sucesso: true });
  expect(situacaoDoDia('ana', '2026-10-10')).toBe('normal');
});
