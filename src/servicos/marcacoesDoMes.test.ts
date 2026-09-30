/**
 * O ESPELHO DO MÊS FECHADO BUSCA SÓ A PRÓPRIA PESSOA, SEM MEXER NA JANELA.
 *
 * `sincronizarPonto(periodo)` baixa tudo o que quem pede enxerga — para o
 * RH, a rede inteira. Usado para o espelho da aba Eu, doze meses da rede
 * estourariam o aparelho de quem cuida de pessoas.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const CHAVE = 'conecta_v4_registros_ponto';

/** Os filtros que a consulta aplicou, e as linhas que o banco devolve. */
let filtros: Array<[string, string, string]> = [];
let linhasDoBanco: any[] = [];
let falhar = false;

const consulta = () => {
  const q: any = {
    select: () => q,
    eq: (c: string, v: string) => (filtros.push(['eq', c, v]), q),
    gte: (c: string, v: string) => (filtros.push(['gte', c, v]), q),
    lte: (c: string, v: string) => (filtros.push(['lte', c, v]), q),
    order: () => q,
    range: async () =>
      falhar ? { data: null, error: { message: 'caiu' } } : { data: linhasDoBanco, error: null },
  };
  return q;
};

mock.module('./supabase', () => ({
  supabase: { from: () => consulta() },
  usandoNuvem: () => true,
  temSessaoViva: () => true,
  loginParaEmailInterno: (l: string) => `${l}@interno`,
  normalizarLogin: (l: string) => l,
}));

const { nuvem } = await import('./nuvem');

const linha = (id: string, colaborador: string, data: string) => ({
  id, colaborador_id: colaborador, data, tipo: 'entrada',
  horario: `${data}T10:30:00+00:00`, hora_formatada: '07:30',
  metodo: 'qrcode', loja: 'Pirassununga', criado_em: `${data}T10:30:00+00:00`,
});
const registro = (id: string, colaboradorId: string, data: string) => ({
  id, colaboradorId, data, tipo: 'entrada', horario: `${data}T10:30:00.000Z`,
  horaFormatada: '07:30', metodo: 'qrcode', loja: 'Pirassununga', criadoEm: `${data}T10:30:00.000Z`,
});

beforeEach(() => {
  armazenamento.clear();
  filtros = [];
  linhasDoBanco = [];
  falhar = false;
});

const AGOSTO = { inicio: '2026-08-01', fim: '2026-08-31' };

test('pede só as batidas da pessoa, só naquele mês', async () => {
  await nuvem.trazerMarcacoesDe('maria', AGOSTO);
  expect(filtros).toEqual([
    ['eq', 'colaborador_id', 'maria'],
    ['gte', 'data', '2026-08-01'],
    ['lte', 'data', '2026-08-31'],
  ]);
});

test('soma ao cache sem tirar o mês corrente de ninguém', async () => {
  // O cache tem o mês de hoje da equipe (a janela da aba Ponto)
  armazenamento.setItem(
    CHAVE,
    JSON.stringify([registro('s1', 'maria', '2026-09-29'), registro('s2', 'ana', '2026-09-29')])
  );
  linhasDoBanco = [linha('a1', 'maria', '2026-08-03')];

  expect(await nuvem.trazerMarcacoesDe('maria', AGOSTO)).toBe(true);

  const ids = JSON.parse(armazenamento.getItem(CHAVE)!).map((r: any) => r.id).sort();
  expect(ids).toEqual(['a1', 's1', 's2']);
});

test('o mês vem inteiro do banco: batida apagada lá não sobra aqui', async () => {
  // Uma batida de agosto que o RH apagou continuava no aparelho
  armazenamento.setItem(CHAVE, JSON.stringify([registro('apagada', 'maria', '2026-08-10')]));
  linhasDoBanco = [linha('a1', 'maria', '2026-08-03')];

  await nuvem.trazerMarcacoesDe('maria', AGOSTO);

  const ids = JSON.parse(armazenamento.getItem(CHAVE)!).map((r: any) => r.id);
  expect(ids).toEqual(['a1']);
});

test('o banco falhou: devolve falha e o cache fica como estava', async () => {
  armazenamento.setItem(CHAVE, JSON.stringify([registro('s1', 'maria', '2026-09-29')]));
  falhar = true;

  expect(await nuvem.trazerMarcacoesDe('maria', AGOSTO)).toBe(false);
  expect(JSON.parse(armazenamento.getItem(CHAVE)!)).toHaveLength(1);
});
