/**
 * O HORÁRIO ESCOLHIDO UMA VEZ, NA PRIMEIRA BATIDA.
 *
 * As 91 fichas estavam no Turno A. Quem entra às 08:20 era cobrado como
 * atrasado 50 minutos, e a batida ficava segurada na tela do motivo — a
 * da Maria Clara se perdeu assim. O Elias pediu: a pessoa diz o próprio
 * horário, uma vez; depois, só RH ou TI mudam.
 */
import { test, expect, mock, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;
(globalThis as any).window = globalThis;

let modoNuvem = false;
mock.module('./supabase', () => ({
  usandoNuvem: () => modoNuvem,
  temSessaoViva: () => true,
  supabase: null,
}));

/** O que o banco responde à escolha. O gatilho pode desfazê-la calado. */
let respostaDoBanco: { sucesso: boolean; erro?: string; confirmadoEm?: string } = { sucesso: true };
const pedidosAoBanco: Array<{ id: string; turno: string }> = [];
mock.module('./nuvem', () => ({
  nuvem: {
    escolherMeuTurno: async (id: string, turno: string) => {
      pedidosAoBanco.push({ id, turno });
      return respostaDoBanco;
    },
    assinarAtualizacoes: () => () => {},
  },
}));

const { bancoDados } = await import('./bancoDados');
const { turnosParaEscolher, precisaEscolherTurno, TURNOS, INFORMACOES_LOJAS } = await import('../tipos');

const BASE = {
  loja: 'Pirassununga', nivel: 1, foto: '', presenca: 'online',
  vistoPorUltimo: 'Agora', ativo: true, criadoEm: '2026-01-01T00:00:00.000Z',
};
const MARIA = { ...BASE, id: 'maria', nome: 'Maria Clara', login: 'maria', cargo: 'Auxiliar de Estoque', setor: 'Estoque', turno: 'A' };
const ISAQUE = { ...BASE, id: 'isaque', nome: 'Isaque', login: 'isaque', cargo: 'Estagiário(a)', setor: 'Estágio', turno: 'A' };
const MARIA_DA_FILIAL = { ...MARIA, id: 'maria-pf', login: 'maria-pf', loja: 'Porto Ferreira' };
const DA_CENTRAL = { ...MARIA, id: 'central', login: 'central', loja: 'Rede' };

const entrarComo = (quem: any, equipe: any[]) => {
  armazenamento.setItem('conecta_v4_colaboradores', JSON.stringify(equipe));
  armazenamento.setItem('conecta_v4_colaborador_atual', quem.id);
};
const fichaDe = (id: string) => bancoDados.obterColaboradorPorId(id)!;

beforeEach(() => {
  armazenamento.clear();
  modoNuvem = false;
  respostaDoBanco = { sucesso: true, confirmadoEm: '2026-09-30T11:00:00.000Z' };
  pedidosAoBanco.length = 0;
});

// ------------------------------------------------------------------
// A regra
// ------------------------------------------------------------------

test('o integral escolhe entre A e B; o estágio, entre os três de estágio', () => {
  expect(turnosParaEscolher(MARIA).map((t) => t.chave)).toEqual(['A', 'B']);
  // O E0 é o lugar de espera "a definir": não é horário que alguém cumpre
  expect(turnosParaEscolher(ISAQUE).map((t) => t.chave)).toEqual(['E1', 'E2', 'E3']);
});

test('cada loja escolhe só os horários dela: filial C ou D; Pirassununga e a central, A ou B (28/10/2026)', () => {
  expect(turnosParaEscolher(MARIA_DA_FILIAL).map((t) => t.chave)).toEqual(['C', 'D']);
  expect(turnosParaEscolher(DA_CENTRAL).map((t) => t.chave)).toEqual(['A', 'B']);
  // O estágio não tem horário por loja
  expect(turnosParaEscolher({ ...ISAQUE, loja: 'Descalvado' }).map((t) => t.chave)).toEqual(['E1', 'E2', 'E3']);
});

test('a filial não confirma o horário de Pirassununga, nem Pirassununga o da filial', async () => {
  entrarComo(MARIA_DA_FILIAL, [MARIA_DA_FILIAL]);
  expect((await bancoDados.escolherMeuTurno('A')).sucesso).toBe(false);
  expect((await bancoDados.escolherMeuTurno('C')).sucesso).toBe(true);
  expect(fichaDe('maria-pf').turno).toBe('C');

  entrarComo(MARIA, [MARIA]);
  expect((await bancoDados.escolherMeuTurno('D')).sucesso).toBe(false);
});

test('pergunta só enquanto ninguém confirmou', () => {
  expect(precisaEscolherTurno(MARIA as { turnoConfirmadoEm?: string })).toBe(true);
  expect(precisaEscolherTurno({ ...MARIA, turnoConfirmadoEm: '2026-09-30T11:00:00Z' })).toBe(false);
});

// ------------------------------------------------------------------
// A escolha
// ------------------------------------------------------------------

test('a pessoa escolhe o próprio horário e ele passa a valer', async () => {
  entrarComo(MARIA, [MARIA]);

  const res = await bancoDados.escolherMeuTurno('B');

  expect(res.sucesso).toBe(true);
  expect(fichaDe('maria').turno).toBe('B');
  expect(fichaDe('maria').turnoConfirmadoEm).toBeTruthy();
  expect(precisaEscolherTurno(fichaDe('maria'))).toBe(false);
});

test('escolhe UMA vez: a segunda tentativa não muda nada', async () => {
  entrarComo(MARIA, [MARIA]);
  await bancoDados.escolherMeuTurno('B');

  const segunda = await bancoDados.escolherMeuTurno('A');

  expect(segunda.sucesso).toBe(false);
  expect(segunda.erro).toContain('RH');
  expect(fichaDe('maria').turno).toBe('B');
});

test('não aceita turno de outro contrato', async () => {
  entrarComo(MARIA, [MARIA]);
  expect((await bancoDados.escolherMeuTurno('E1')).sucesso).toBe(false);
  expect(fichaDe('maria').turno).toBe('A');

  entrarComo(ISAQUE, [ISAQUE]);
  expect((await bancoDados.escolherMeuTurno('B')).sucesso).toBe(false);
  expect((await bancoDados.escolherMeuTurno('E3')).sucesso).toBe(true);
});

test('o banco recusou: o aparelho não finge que gravou', async () => {
  modoNuvem = true;
  respostaDoBanco = { sucesso: false, erro: 'O seu horário já foi definido. Para mudar, fale com o RH.' };
  entrarComo(MARIA, [MARIA]);

  const res = await bancoDados.escolherMeuTurno('B');

  expect(pedidosAoBanco).toEqual([{ id: 'maria', turno: 'B' }]);
  expect(res.sucesso).toBe(false);
  expect(fichaDe('maria').turno).toBe('A');
  expect(fichaDe('maria').turnoConfirmadoEm).toBeUndefined();
});

// ------------------------------------------------------------------
// O banco é quem garante — e a regra dele é a mesma da tela
// ------------------------------------------------------------------

const ler = (arquivo: string) =>
  readFileSync(join(import.meta.dir, '../../supabase', arquivo), 'utf8').replace(/\r\n/g, '\n');

test('o gatilho aceita exatamente os turnos que a tela oferece', () => {
  const esquema = ler('esquema.sql');
  const listas = [...esquema.matchAll(/\((estagio|not estagio and not filial|not estagio and filial) and new\.turno in \(([^)]*)\)\)/g)];
  const doBanco = Object.fromEntries(
    listas.map((m) => [m[1], m[2].split(',').map((s) => s.trim().replace(/'/g, ''))])
  );

  expect(doBanco['not estagio and not filial']).toEqual(turnosParaEscolher(MARIA).map((t) => t.chave));
  expect(doBanco['not estagio and filial']).toEqual(turnosParaEscolher(MARIA_DA_FILIAL).map((t) => t.chave));
  expect(doBanco['estagio']).toEqual(turnosParaEscolher(ISAQUE).map((t) => t.chave));
  // Toda chave que o gatilho aceita existe na tabela de turnos
  for (const chave of Object.values(doBanco).flat()) {
    expect(TURNOS.some((t) => t.chave === chave)).toBe(true);
  }
});

test('as filiais do gatilho são as lojas "Filial" do cadastro das unidades', () => {
  const esquema = ler('esquema.sql');
  const lista = esquema.match(/filial\s+:= old\.loja in \(([^)]*)\);/)![1];
  const doBanco = lista.split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  const doCadastro = INFORMACOES_LOJAS.filter((l) => l.tipo === 'Filial').map((l) => l.nome).sort();
  expect(doBanco).toEqual(doCadastro);
});

test('o delta das filiais traz o gatilho de hoje, e termina conferindo', () => {
  const esquema = ler('esquema.sql');
  const delta = ler('turnos-das-filiais.sql');
  const ini = esquema.indexOf('-- O HORÁRIO, ESCOLHIDO UMA VEZ.');
  const marca = 'for each row execute function public.turno_escolhido_uma_vez();';
  expect(delta).toContain(esquema.slice(ini, esquema.indexOf(marca) + marca.length));
  expect(delta).toContain("check (turno in ('A', 'B', 'C', 'D', 'E0', 'E1', 'E2', 'E3', 'P'))");
  expect(esquema).toContain("check (turno in ('A', 'B', 'C', 'D', 'E0', 'E1', 'E2', 'E3', 'P'))");
  expect(delta.lastIndexOf('select')).toBeGreaterThan(delta.indexOf("notify pgrst, 'reload schema'"));
});

test('a pessoa não mexe na própria jornada: o gatilho devolve cada campo', () => {
  const esquema = ler('esquema.sql');
  for (const campo of [
    'cargo', 'carga_horaria_diaria_minutos', 'carga_semanal_minutos',
    'trabalha_sabado', 'tem_intervalo',
  ]) {
    expect(esquema).toMatch(new RegExp(`new\\.${campo}\\s+:= old\\.${campo};`));
  }
  expect(esquema).toContain('before insert or update on public.colaboradores');
});

test('os deltas antigos do gatilho terminam conferindo', () => {
  // O gatilho de hoje mora no delta das filiais (28/10/2026, conferido
  // acima); estes dois são o histórico: o primeiro e o do horário próprio
  for (const arquivo of ['turno-escolhido-uma-vez.sql', 'horario-proprio.sql']) {
    const delta = ler(arquivo);
    expect(delta).toContain('create or replace function public.turno_escolhido_uma_vez()');
    expect(delta).toContain("notify pgrst, 'reload schema'");
    expect(delta.trim().endsWith(';')).toBe(true);
  }
  expect(ler('turno-escolhido-uma-vez.sql').lastIndexOf('select')).toBeGreaterThan(
    ler('turno-escolhido-uma-vez.sql').indexOf('notify pgrst')
  );
});

// ------------------------------------------------------------------
// A tela pergunta antes do motivo, e não deixa a câmera bater por baixo
// ------------------------------------------------------------------

test('a batida pergunta o horário ANTES de avaliar o atraso', () => {
  const tela = readFileSync(join(import.meta.dir, '../componentes/ModalBaterPonto.tsx'), 'utf8');
  const pergunta = tela.indexOf('precisaEscolherTurno(eu)');
  const avaliacao = tela.indexOf('servicoPonto.avaliarMarcacao(');

  expect(pergunta).toBeGreaterThan(-1);
  expect(pergunta).toBeLessThan(avaliacao);

  // No ramo da pergunta a trava da leitura não é solta
  const ramo = tela.slice(pergunta, tela.indexOf('return;', pergunta));
  expect(ramo).not.toContain('refProcessando.current = false');
});
