/**
 * Verificação do saldo da semana — CONECTA
 *
 * O QUE MOTIVOU, visto pelo Elias no painel do RH, numa SEGUNDA-FEIRA:
 *
 *     SEM BATER          0     faltou batida no ciclo
 *     SALDO DA REDE  -3924h33  somado no ciclo
 *
 * Os dois números saíam do MESMO cálculo e se contradiziam. −3924h33 é a
 * carga semanal de 87 pessoas, com 89 na rede: a semana inteira, que nem
 * tinha começado, cobrada de todo mundo.
 *
 * Eram duas causas somadas:
 *
 *  1. O previsto somava os SETE dias da semana contra o que a pessoa
 *     tinha trabalhado até agora. Toda segunda a rede "devia" a semana.
 *  2. Quem NÃO bate ponto (gerência para cima) entrava na conta: zero
 *     trabalhado contra a carga cheia, devendo a semana toda, para
 *     sempre.
 *
 * Indicador em que não se acredita é pior do que indicador nenhum: ensina
 * a ignorar o painel, e junto com ele o dia em que a rede realmente
 * estiver devendo.
 */
import { test, expect, mock, beforeEach, setSystemTime } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

/**
 * A semana do teste: 21/09/2026 é SEGUNDA, o mesmo dia em que o Elias
 * tirou o print.
 *
 * O ciclo vai de SÁBADO a SEXTA — o sábado abre a semana, é o que
 * `semanaDe` recorta. Então na segunda já fecharam dois dias: o sábado
 * (4h de previsto) e o domingo (nenhum).
 */
const SABADO = '2026-09-19';
const SEGUNDA = '2026-09-21';
const TERCA = '2026-09-22';
const QUARTA = '2026-09-23';

const BASE = {
  cargo: 'Vendedora', setor: 'Vendas', loja: 'Pirassununga', foto: '',
  presenca: 'disponivel', vistoPorUltimo: 'agora', ativo: true,
};

/** Nível 1: bate ponto, pelo padrão do catálogo. */
const ANA = { ...BASE, id: 'ana', nome: 'Ana', login: 'ana', nivel: 1, responsavelId: 'gerente' };
/** Nível 3: da gerência para cima não se bate ponto. */
const GERENTE = { ...BASE, id: 'gerente', nome: 'Gerente', login: 'ger', nivel: 3, cargo: 'Gerente' };

let equipe: any[] = [ANA, GERENTE];
let logado: any = GERENTE;

mock.module('./supabase', () => ({ usandoNuvem: () => false, supabase: null }));
mock.module('./nuvem', () => ({ nuvem: {} }));
mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => logado,
    obterColaboradorPorId: (id: string) => equipe.find((c) => c.id === id),
    obterColaboradores: () => equipe,
    estaAutenticado: () => true,
    registrarAuditoria: () => {},
    assinarAlteracoes: () => () => {},
    obterConfiguracoes: () => ({}),
  },
}));

const { servicoPonto } = await import('./ponto');
const { aplicarPermissoes } = await import('./permissoes');

/** 8h10 por dia útil, a carga que a rede pratica. */
const DIA_UTIL = 490;
/** O sábado vai só até as 12h. */
const SABADO_MIN = 240;

beforeEach(() => {
  armazenamento.clear();
  equipe = [ANA, GERENTE];
  logado = GERENTE;
});

// ---------------------------------------------------------------
// 1. O saldo só conta dia que já fechou
// ---------------------------------------------------------------

test('na SEGUNDA de manhã a semana inteira NÃO é devida', () => {
  setSystemTime(new Date(`${SEGUNDA}T09:00:00`));

  const semana = servicoPonto.apurarSemana('ana', SEGUNDA);

  /**
   * Era aqui que nascia o −3924h33: os sete dias cobrados de uma vez, a
   * semana que nem tinha começado. Agora só o sábado que fechou pesa — o
   * domingo não tem previsto, e de segunda em diante nada aconteceu.
   */
  expect(semana.minutosPrevistos).toBe(SABADO_MIN);

  // Longe da carga semanal cheia, que era o que estava sendo cobrado
  expect(semana.minutosPrevistos).toBeLessThan(2690);
});

test('o previsto entra dia a dia, conforme a semana anda', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));

  // Fecharam: sábado (4h), domingo (nada), segunda e terça (8h10 cada)
  const semana = servicoPonto.apurarSemana('ana', QUARTA);
  expect(semana.minutosPrevistos).toBe(SABADO_MIN + DIA_UTIL * 2);
});

test('o dia de HOJE não é cobrado enquanto está em andamento', () => {
  setSystemTime(new Date(`${TERCA}T09:00:00`));
  const deManha = servicoPonto.apurarSemana('ana', TERCA).minutosPrevistos;

  setSystemTime(new Date(`${TERCA}T23:00:00`));
  const aNoite = servicoPonto.apurarSemana('ana', TERCA).minutosPrevistos;

  // Quem entrou às 8h e ainda está trabalhando não deve as 8h10 do dia:
  // o previsto da terça só entra quando a terça acabar
  expect(deManha).toBe(SABADO_MIN + DIA_UTIL);
  expect(aNoite).toBe(SABADO_MIN + DIA_UTIL);
});

// ---------------------------------------------------------------
// 2. Dia sem nenhuma batida é falta de batida
// ---------------------------------------------------------------

test('dia fechado sem NENHUMA batida entra em "sem bater"', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));

  const semana = servicoPonto.apurarSemana('ana', QUARTA);

  /**
   * Era `feitas > 0 && feitas < esperadas.length`: só o dia batido pela
   * METADE contava. O dia em que ninguém bateu nada — a falta mais
   * completa que existe — passava calado, enquanto o previsto dele pesava
   * no saldo. Foi o que pôs "Sem bater: 0" ao lado das quatro mil horas.
   */
  expect(semana.diasComPendencia).toEqual([SABADO, SEGUNDA, TERCA]);

  // O domingo NÃO entra: a loja não abre, e todo domingo virar pendência
  // foi defeito já corrigido uma vez
  expect(semana.diasComPendencia).not.toContain('2026-09-20');
});

test('dia que ainda não fechou não é pendência', () => {
  setSystemTime(new Date(`${SEGUNDA}T09:00:00`));

  // Cobrar batida de um dia que está acontecendo é acusar quem está lá:
  // na segunda de manhã só o sábado já fechado pode ser cobrado
  expect(servicoPonto.apurarSemana('ana', SEGUNDA).diasComPendencia).toEqual([SABADO]);
});

test('"sem bater" e o saldo passam a contar os MESMOS dias', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));

  const semana = servicoPonto.apurarSemana('ana', QUARTA);

  /**
   * A contradição do print, presa num teste: não dá para dever horas de
   * dias que, segundo o outro número, não têm batida faltando.
   */
  expect(semana.diasComPendencia).toHaveLength(3);
  expect(semana.saldoMinutos).toBe(-(SABADO_MIN + DIA_UTIL * 2));
});

// ---------------------------------------------------------------
// 3. Banco de horas é de quem bate ponto
// ---------------------------------------------------------------

test('quem NÃO bate ponto fica fora da relação do banco de horas', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));

  const ciclo = servicoPonto.relacaoSemanalDaEquipe(QUARTA);
  const nomes = ciclo.linhas.map((l) => l.colaborador.id);

  // O gerente nunca bate: contá-lo é somar a carga dele como débito toda
  // semana, para sempre — e ainda pôr a linha dele no topo da relação,
  // que ordena pelo maior débito
  expect(nomes).toContain('ana');
  expect(nomes).not.toContain('gerente');
});

test('o saldo somado da rede não carrega a carga de quem não bate', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));

  const ciclo = servicoPonto.relacaoSemanalDaEquipe(QUARTA);
  const saldoDaRede = ciclo.linhas.reduce((t, l) => t + l.saldoMinutos, 0);

  // Só a Ana deve os dias fechados; o gerente não deve nada
  expect(saldoDaRede).toBe(-(SABADO_MIN + DIA_UTIL * 2));
});

test('gerente que PRECISA bater volta para a relação', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));

  /**
   * A regra é do catálogo, não do cargo: marcar o nível na tela de
   * Permissões devolve a aba "Ponto" à gerência, e a relação tem de
   * acompanhar. Uma segunda definição de "quem bate ponto" aqui dentro
   * seria a quinta vez que este sistema se contradiz sozinho.
   */
  /**
   * O `__regras` vai junto de propósito: sem ele, `obterPermissoes` trata
   * o mapa como configuração antiga e aplica o teto do catálogo uma vez,
   * TIRANDO o nível 3 de "ponto" — que é exatamente o que essa migração
   * existe para fazer. Com a versão em dia, a escolha da tela vale.
   */
  aplicarPermissoes({ ponto: [1, 2, 3], __regras: [1] } as any);

  const ciclo = servicoPonto.relacaoSemanalDaEquipe(QUARTA);
  expect(ciclo.linhas.map((l) => l.colaborador.id)).toContain('gerente');

  aplicarPermissoes(null);
});
