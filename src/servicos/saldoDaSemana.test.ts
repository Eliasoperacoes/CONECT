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

const CHAVE_REGISTROS = 'conecta_v4_registros_ponto';

/**
 * Batidas de verdade, postas direto no armazenamento.
 *
 * ESTE ARQUIVO NÃO TINHA COMO REGISTRAR BATIDA, e isso moldou as
 * asserções dele: todas descreviam a semana de quem não bateu nada. Era
 * o cenário certo para o defeito das quatro mil horas, e o errado para
 * tudo o mais — dia sem batida deixou de ser débito, e sem poder bater
 * não havia como testar a semana de quem trabalha.
 */
const bater = (quem: string, data: string, horas: Record<string, string>) => {
  const atuais = JSON.parse(localStorage.getItem(CHAVE_REGISTROS) || '[]');
  for (const [tipo, hora] of Object.entries(horas)) {
    atuais.push({
      id: `r-${quem}-${data}-${tipo}`,
      colaboradorId: quem,
      data,
      tipo,
      horario: new Date(`${data}T${hora}:00`).toISOString(),
      loja: 'Pirassununga',
      origem: 'qr',
    });
  }
  localStorage.setItem(CHAVE_REGISTROS, JSON.stringify(atuais));
};

/** O sábado cumprido: 08:00 às 12:00, direto. */
const baterSabado = (quem = 'ana') =>
  bater(quem, SABADO, { entrada: '08:00', saida: '12:00' });

/** Um dia útil cumprido à risca: 07:30–12:30 / 14:00–17:10 são 8h10. */
const baterDiaUtil = (data: string, quem = 'ana', saida = '17:10') =>
  bater(quem, data, {
    entrada: '07:30',
    saida_almoco: '12:30',
    retorno_almoco: '14:00',
    saida,
  });

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
  baterSabado();

  const semana = servicoPonto.apurarSemana('ana', SEGUNDA);

  /**
   * Era aqui que nascia o −3924h33: os sete dias cobrados de uma vez, a
   * semana que nem tinha começado. Agora entra só o sábado, que ela
   * trabalhou e fechou — o domingo não tem previsto, e de segunda em
   * diante nada aconteceu ainda.
   */
  expect(semana.minutosPrevistos).toBe(SABADO_MIN);

  // Longe da carga semanal cheia, que era o que estava sendo cobrado
  expect(semana.minutosPrevistos).toBeLessThan(2690);
});

test('o previsto entra dia a dia, conforme a semana anda', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));
  baterSabado();
  baterDiaUtil(SEGUNDA);
  baterDiaUtil(TERCA);

  // Cumpridos e fechados: sábado (4h), segunda e terça (8h10 cada)
  const semana = servicoPonto.apurarSemana('ana', QUARTA);
  expect(semana.minutosPrevistos).toBe(SABADO_MIN + DIA_UTIL * 2);
  expect(semana.minutosTrabalhados).toBe(SABADO_MIN + DIA_UTIL * 2);
  expect(semana.saldoMinutos).toBe(0);
});

test('o dia de HOJE não é cobrado enquanto está em andamento', () => {
  baterSabado();
  baterDiaUtil(SEGUNDA);
  // Na terça ela entrou e ainda está lá: uma batida só
  bater('ana', TERCA, { entrada: '07:30' });

  setSystemTime(new Date(`${TERCA}T09:00:00`));
  const deManha = servicoPonto.apurarSemana('ana', TERCA).minutosPrevistos;

  setSystemTime(new Date(`${TERCA}T23:00:00`));
  const aNoite = servicoPonto.apurarSemana('ana', TERCA).minutosPrevistos;

  // Quem entrou às 7h30 e ainda está trabalhando não deve as 8h10 do dia:
  // o previsto da terça só entra quando a terça fechar
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

test('DIA SEM BATIDA É PENDÊNCIA, e não hora devida', () => {
  setSystemTime(new Date(`${QUARTA}T09:00:00`));

  const semana = servicoPonto.apurarSemana('ana', QUARTA);

  /**
   * A contradição do print, presa num teste — e agora resolvida pelo
   * outro lado.
   *
   * Antes a mesma ausência aparecia DUAS VEZES na tela: como −8h10 de
   * saldo e como "dia com batida faltando". E o espelho da pessoa, que é
   * o documento trabalhista, dizia 0h00 naquele dia. Três versões do
   * mesmo dia.
   *
   * Decisão do Elias: dia sem batida é pendência. A ausência continua à
   * vista — três dias aqui, em âmbar na aba Ponto e no topo da relação do
   * ciclo —, mas não vira hora que a pessoa vá tentar compensar
   * trabalhando.
   */
  expect(semana.diasComPendencia).toHaveLength(3);
  expect(semana.saldoMinutos).toBe(0);
  expect(semana.minutosPrevistos).toBe(0);
});

test('o saldo da semana É a soma dos saldos do espelho', () => {
  /**
   * A propriedade que sustenta tudo: a aba Ponto e o espelho de ponto
   * mostravam números diferentes da mesma semana. Aqui a igualdade é
   * cobrada com um débito de verdade no meio — quem saiu 40 minutos mais
   * cedo numa terça.
   */
  setSystemTime(new Date(`${QUARTA}T09:00:00`));
  baterSabado();
  baterDiaUtil(SEGUNDA);
  baterDiaUtil(TERCA, 'ana', '16:30');

  const semana = servicoPonto.apurarSemana('ana', QUARTA);

  const doEspelho = [SABADO, SEGUNDA, TERCA].reduce(
    (t, d) => t + servicoPonto.obterJornadaDoDia('ana', d).saldoMinutos,
    0
  );

  expect(semana.saldoMinutos).toBe(doEspelho);
  expect(semana.saldoMinutos).toBe(-40);
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

  /**
   * A Ana tem um débito de VERDADE: saiu 40 minutos mais cedo na terça.
   *
   * Antes este teste comparava contra a carga de dias não batidos —
   * `-(SABADO_MIN + DIA_UTIL * 2)` —, e por isso passaria mesmo se o
   * gerente entrasse na conta com zero. Com um débito real de uma pessoa
   * só, a soma da rede tem de ser exatamente o dela: incluir o gerente
   * (que nunca bate, e por isso "deve" a semana inteira) mudaria o
   * número na hora.
   */
  baterSabado();
  baterDiaUtil(SEGUNDA);
  baterDiaUtil(TERCA, 'ana', '16:30');

  const ciclo = servicoPonto.relacaoSemanalDaEquipe(QUARTA);
  const saldoDaRede = ciclo.linhas.reduce((t, l) => t + l.saldoMinutos, 0);

  expect(saldoDaRede).toBe(-40);
  expect(saldoDaRede).toBe(servicoPonto.apurarSemana('ana', QUARTA).saldoMinutos);
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
