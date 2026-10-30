/**
 * A SINCRONIZAÇÃO PELO QUE MUDOU — o motor (sincronizacaoIncremental.ts, 30/10/2026).
 *
 * O que se prova aqui é o que importa para a rede: quando nada mudou, nada
 * desce; quando uma linha mudou, desce só ela; e em nenhum caso o aparelho
 * fica com uma lista diferente da que o banco entrega à pessoa — removida,
 * recém-visível, outra pessoa no mesmo celular, aparelho cheio.
 */
import { test, expect, mock, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';

class ArmazenamentoFalso {
  dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

interface Linha { id: string; dono: string; data: string; valor: string; alterado_em: string }

// --- O banco falso: a tabela, a regra de acesso e o resumo ---
let tabela: Linha[] = [];
let quemEnxerga = 'ana';
let temResumo = true;
/** Linhas inteiras que desceram (as consultas de ids não contam) */
let linhasBaixadas = 0;
let consultas: string[] = [];

const visiveis = () => tabela.filter((l) => l.dono === quemEnxerga);

const consulta = (colunas: string) => {
  const condicoes: Array<(l: Linha) => boolean> = [];
  const filtros: string[] = [];
  const q: any = {
    gte: (c: keyof Linha, v: string) => {
      filtros.push(`${c}>=`);
      condicoes.push((l) => (c === 'alterado_em' ? Date.parse(l[c]) >= Date.parse(v) : l[c] >= v));
      return q;
    },
    lte: (c: keyof Linha, v: string) => {
      condicoes.push((l) => l[c] <= v);
      return q;
    },
    in: (c: keyof Linha, vs: string[]) => {
      filtros.push(`${c} in`);
      condicoes.push((l) => vs.includes(l[c]));
      return q;
    },
    order: () => q,
    range: (de: number, ate: number) => {
      const todas = visiveis().filter((l) => condicoes.every((f) => f(l))).sort((a, b) => (a.id < b.id ? -1 : 1));
      const pagina = todas.slice(de, ate + 1);
      if (de === 0) consultas.push(`${colunas} ${filtros.join(' ')}`.trim());
      if (colunas === '*') linhasBaixadas += pagina.length;
      const dados = colunas === '*' ? pagina : pagina.map((l) => ({ id: l.id }));
      return Promise.resolve({ data: dados, error: null });
    },
  };
  return q;
};

/** A conta do banco, feita aqui por fora — não pelo código que se testa */
const sha = (ids: string[]) => new Bun.CryptoHasher('sha256').update([...ids].sort().join(',')).digest('hex');

const supabaseFalso = {
  from: () => ({ select: (colunas: string) => consulta(colunas) }),
  rpc: async (_nome: string, args: { p_inicio: string | null; p_fim: string | null }) => {
    if (!temResumo) return { data: null, error: { message: 'Could not find the function' } };
    const linhas = visiveis().filter(
      (l) => (!args.p_inicio || l.data >= args.p_inicio) && (!args.p_fim || l.data <= args.p_fim)
    );
    const marca = linhas.map((l) => l.alterado_em).sort().at(-1) ?? null;
    return { data: [{ quantidade: linhas.length, marca, assinatura: sha(linhas.map((l) => l.id)) }], error: null };
  },
};

mock.module('./supabase', () => ({ supabase: supabaseFalso, usandoNuvem: () => true }));

const { sincronizarPeloQueMudou, TABELAS_SINCRONIZADAS, desdeAMarca } = await import('./sincronizacaoIncremental');

// --- O aparelho ---
interface Item { id: string; valor: string }
let guardados: Item[] = [];
let aparelhoCheio = false;
const AGORA = Date.parse('2026-10-30T15:00:00.000Z');

const sincronizar = (extra: Record<string, unknown> = {}) =>
  sincronizarPeloQueMudou<Linha, Item>({
    tabela: 'registros_ponto',
    chaveDoEstado: 'conecta_v4_sinc_teste',
    dono: quemEnxerga,
    montar: (colunas) => supabaseFalso.from().select(colunas),
    colunasDaChave: ['id'],
    chaveDoItem: (i) => i.id,
    paraItem: (l) => ({ id: l.id, valor: l.valor }),
    lerGuardados: () => guardados.map((i) => ({ ...i })),
    gravar: (itens) => {
      if (aparelhoCheio) throw new Error('QuotaExceededError');
      guardados = itens;
    },
    ordenar: (a, b) => (a.id < b.id ? -1 : 1),
    ondeEstou: 'o teste',
    agora: AGORA,
    ...extra,
  });

const em = (minuto: number) => new Date(Date.parse('2026-10-30T12:00:00.000Z') + minuto * 60_000).toISOString();
const linha = (id: string, minuto: number, extra: Partial<Linha> = {}): Linha => ({
  id, dono: 'ana', data: '2026-10-30', valor: `v-${id}`, alterado_em: em(minuto), ...extra,
});
const valores = () => guardados.map((i) => `${i.id}=${i.valor}`);

beforeEach(() => {
  armazenamento.clear();
  // Bem antes da marca: dentro da folga de cinco minutos elas desceriam de novo
  tabela = [linha('a', -100), linha('b', -90), linha('c', -80), linha('da-bia', -70, { dono: 'bia' })];
  quemEnxerga = 'ana';
  temResumo = true;
  guardados = [];
  aparelhoCheio = false;
  linhasBaixadas = 0;
  consultas = [];
});

const zerarContagem = () => {
  linhasBaixadas = 0;
  consultas = [];
};

test('a primeira vez baixa tudo o que a pessoa enxerga — e nada da outra', async () => {
  expect(await sincronizar()).toBe('completa');
  expect(valores()).toEqual(['a=v-a', 'b=v-b', 'c=v-c']);
});

test('NADA MUDOU, NADA DESCE: a segunda vez não baixa uma linha', async () => {
  await sincronizar();
  zerarContagem();
  expect(await sincronizar()).toBe('nada-mudou');
  expect(linhasBaixadas).toBe(0);
  expect(consultas).toEqual([]);
});

test('uma linha alterada: desce ela e a da folga, e o resto fica como estava', async () => {
  await sincronizar();
  tabela[1] = linha('b', 30, { valor: 'corrigido' });
  zerarContagem();
  expect(await sincronizar()).toBe('so-o-que-mudou');
  // A alterada, e a "c", que está na própria marca (dentro dos cinco minutos de folga)
  expect(linhasBaixadas).toBe(2);
  expect(consultas).toEqual(['* alterado_em>=']);
  expect(valores()).toEqual(['a=v-a', 'b=corrigido', 'c=v-c']);
});

test('linha nova entra; a folga de cinco minutos pega a que gravou no limite', async () => {
  await sincronizar();
  // Carimbada um minuto ANTES da marca guardada (transação que fechou depois)
  tabela.push(linha('atrasada', -81));
  tabela.push(linha('nova', 40));
  zerarContagem();
  expect(await sincronizar()).toBe('so-o-que-mudou');
  expect(valores()).toEqual(['a=v-a', 'atrasada=v-atrasada', 'b=v-b', 'c=v-c', 'nova=v-nova']);
});

test('REMOVIDA no banco some do aparelho, acertando pelos ids e sem baixar tudo', async () => {
  await sincronizar();
  tabela = tabela.filter((l) => l.id !== 'b');
  zerarContagem();
  expect(await sincronizar()).toBe('so-o-que-mudou');
  expect(valores()).toEqual(['a=v-a', 'c=v-c']);
  // Só a da folga desceu inteira; o resto veio como lista de ids
  expect(linhasBaixadas).toBe(1);
  expect(consultas).toEqual(['* alterado_em>=', 'id']);
});

test('PASSOU A SER VISÍVEL com marca antiga (líder novo, por exemplo): vem pelo id', async () => {
  await sincronizar();
  // Antiga, de outra pessoa, e agora enxergada: o alterado_em não mudou
  tabela.push(linha('herdada', -500, { dono: 'ana' }));
  tabela.push(linha('outra', 50));
  zerarContagem();
  expect(await sincronizar()).toBe('so-o-que-mudou');
  expect(valores()).toEqual(['a=v-a', 'b=v-b', 'c=v-c', 'herdada=v-herdada', 'outra=v-outra']);
  expect(consultas).toEqual(['* alterado_em>=', 'id', '* id in']);
});

test('OUTRA PESSOA NO MESMO CELULAR: a base de quem saiu não serve, carga completa', async () => {
  await sincronizar();
  quemEnxerga = 'bia';
  expect(await sincronizar()).toBe('completa');
  expect(valores()).toEqual(['da-bia=v-da-bia']);
});

test('janela de datas diferente, ou um dia depois da última completa: carga completa', async () => {
  await sincronizar({ janela: { inicio: '2026-10-01', fim: '2026-10-31' } });
  expect(await sincronizar({ janela: { inicio: '2026-09-01', fim: '2026-10-31' } })).toBe('completa');
  expect(await sincronizar({ janela: { inicio: '2026-09-01', fim: '2026-10-31' } })).toBe('nada-mudou');
  expect(
    await sincronizar({ janela: { inicio: '2026-09-01', fim: '2026-10-31' }, agora: AGORA + 25 * 3600_000 })
  ).toBe('completa');
});

test('SEM O SCRIPT NO BANCO, é a carga completa de antes — sempre', async () => {
  temResumo = false;
  expect(await sincronizar()).toBe('completa');
  zerarContagem();
  expect(await sincronizar()).toBe('completa');
  expect(linhasBaixadas).toBe(3);
});

test('APARELHO CHEIO: não grava pela metade, e a próxima não confia na base', async () => {
  await sincronizar();
  tabela[0] = linha('a', 30, { valor: 'novo' });
  aparelhoCheio = true;
  expect(await sincronizar()).toBe('falhou');
  expect(valores()).toEqual(['a=v-a', 'b=v-b', 'c=v-c']);
  aparelhoCheio = false;
  expect(await sincronizar()).toBe('completa');
  expect(valores()).toEqual(['a=novo', 'b=v-b', 'c=v-c']);
});

test('o que está guardado sumiu (limparam o aparelho): carga completa, mesmo com o banco igual', async () => {
  await sincronizar();
  guardados = [];
  expect(await sincronizar()).toBe('completa');
  expect(valores()).toEqual(['a=v-a', 'b=v-b', 'c=v-c']);
});

test('a marca do banco, com microssegundos, vira a hora de cinco minutos antes', () => {
  expect(desdeAMarca('2026-10-30T15:00:00.123456+00:00')).toBe('2026-10-30T14:55:00.123Z');
});

test('as tabelas do aparelho são as mesmas do resumo no banco', () => {
  const sql = readFileSync('supabase/sincronizacao-pelo-que-mudou.sql', 'utf8');
  const lista = sql.slice(sql.indexOf("if p_tabela is null or p_tabela not in ("), sql.indexOf(') then'));
  const doBanco = [...lista.matchAll(/'(\w+)'/g)].map((m) => m[1]);
  expect(doBanco).toEqual([...TABELAS_SINCRONIZADAS]);
});
