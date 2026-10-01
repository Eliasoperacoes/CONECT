/**
 * UMA CONTA SÓ PARA O BANCO DE HORAS — CONECTA
 *
 * ===================================================================
 * O QUE MOTIVOU
 * ===================================================================
 *
 * O Elias: "reavalie o ponto e todas suas funções e onde elas refletem.
 * Tem algo errado."
 *
 * Havia. O sistema respondia "quanto sobrou ou faltou neste dia" em TRÊS
 * lugares, com três regras diferentes, e os três apareciam na tela:
 *
 *   obterJornadaDoDia.saldoMinutos   espelho, CSV, Banco de Horas
 *   apurarSemana.saldoMinutos        aba Ponto, Ciclo, saldo da rede
 *   apurarDia (a subtração à mão)    o que GRAVA no banco de horas
 *
 * Medido, sobre as MESMAS batidas de uma estagiária que entra 13:15 num
 * turno que começa 13:00 — quinze minutos de pausa paga, que a casa
 * decidiu não cobrar:
 *
 *   espelho do dia ....................  0h00
 *   aba Ponto, saldo da semana ........ -1h15
 *   banco de horas .................... um débito de 0h15 POR DIA
 *
 * O terceiro é o que machuca, porque grava: cinco débitos por semana,
 * aprovados em lote por quem confia no sistema, nenhum deles aparecendo
 * no documento que a pessoa confere. É a origem aritmética dos −47h50
 * que ninguém conseguia explicar — 15 minutos por cerca de 190 dias.
 *
 * E a mesma doença em outro campo: "quanto é um dia útil desta pessoa"
 * estava escrito em CINCO lugares. A ficha vencia o turno no espelho,
 * mas a sobra do sábado, a carga semanal, o cabeçalho do Banco de Horas
 * e a ficha do colaborador todos perguntavam ao TURNO. A estagiária de
 * 4h45 na ficha tinha cabeçalho dizendo 5h00, semana de 29h e espelho
 * prevendo 27h45.
 *
 * ===================================================================
 * O QUE ESTE ARQUIVO COBRA
 * ===================================================================
 *
 * Uma propriedade, e ela é verificável sem inventar número nenhum:
 *
 *   as contas do sistema sobre o MESMO período dão o MESMO resultado.
 *
 * Não é teste de valor esperado — é teste de CONCORDÂNCIA. Um teste de
 * valor esperado eu escreveria com o número que o código já dá, e ele
 * passaria com as três regras discordando, que é exatamente o que
 * aconteceu: a suíte tinha 924 testes verdes com tudo isso quebrado.
 */
import { test, expect, mock, beforeEach, setSystemTime } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

/** O ciclo: sábado 19/09/2026 a sexta 25/09/2026. */
const SABADO = '2026-09-19';
const UTEIS = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
/** Medimos de uma segunda seguinte: a semana toda já fechou. */
const DEPOIS = '2026-09-28';

const BASE = {
  cargo: 'Vendedora', setor: 'Vendas', loja: 'Pirassununga', foto: '',
  presenca: 'disponivel', vistoPorUltimo: 'agora', ativo: true,
  nivel: 1, responsavelId: 'chefe',
};

/** Balcão, turno A: 8h10 por dia útil, 4h de sábado, 44h50 na semana. */
const ANA = { ...BASE, id: 'ana', nome: 'Ana', login: 'ana', turno: 'A' };

/** Estágio tarde (E3): 13:00–18:00, com a pausa paga de 15 minutos. */
const LYVIA = {
  ...BASE, id: 'lyvia', nome: 'Lyvia', login: 'lyvia',
  cargo: 'Estagiária', setor: 'Escritório', turno: 'E3',
};

/** A mesma, com jornada própria na ficha — contrato de meio período. */
const LYVIA_FICHA = { ...LYVIA, id: 'lyviaf', cargaHorariaDiariaMinutos: 285 };

/** Jornada própria E sábado: o caso em que o sábado carrega a sobra. */
const LYVIA_SABADO = { ...LYVIA_FICHA, id: 'lyvias', trabalhaSabado: true };

/** Estágio E2 que vem ao sábado para completar a semana. */
const BIA = {
  ...BASE, id: 'bia', nome: 'Bia', login: 'bia',
  cargo: 'Estagiária', setor: 'Escritório', turno: 'E2', trabalhaSabado: true,
};

let equipe: any[] = [ANA, LYVIA, LYVIA_FICHA, LYVIA_SABADO, BIA];
let logado: any = { ...BASE, id: 'chefe', nome: 'Chefe', login: 'chefe', nivel: 4, cargo: 'Administrador' };

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

const { servicoPonto, listarDatasDoPeriodo, semanaDe, formatarSaldo } = await import('./ponto');
const { minutosDeDiaUtilDe, cargaSemanalDe, minutosDoTurno, turnoDe } = await import('../tipos');
const { montarFicha } = await import('./fichaColaborador');

const CHAVE = 'conecta_v4_registros_ponto';

const bater = (colaboradorId: string, data: string, horas: Record<string, string>) => {
  const atuais = JSON.parse(localStorage.getItem(CHAVE) || '[]');
  for (const [tipo, hora] of Object.entries(horas)) {
    atuais.push({
      id: `r-${colaboradorId}-${data}-${tipo}`,
      colaboradorId,
      data,
      tipo,
      horario: new Date(`${data}T${hora}:00`).toISOString(),
      loja: 'Pirassununga',
      origem: 'qr',
    });
  }
  localStorage.setItem(CHAVE, JSON.stringify(atuais));
};

/** A soma dos saldos diários do ciclo — o que o Banco de Horas mostra. */
const somaDosDias = (quem: string): number => {
  const { inicio, fim } = semanaDe(SABADO);
  return listarDatasDoPeriodo(inicio, fim).reduce(
    (t, d) => t + servicoPonto.obterJornadaDoDia(quem, d).saldoMinutos,
    0
  );
};

beforeEach(() => {
  armazenamento.clear();
  setSystemTime(new Date(`${DEPOIS}T09:00:00`));
});

// ===============================================================
// 1. AS CONTAS CONCORDAM
// ===============================================================

test('A SEMANA E O ESPELHO DÃO O MESMO SALDO — semana cumprida', () => {
  bater('ana', SABADO, { entrada: '08:00', saida: '12:00' });
  for (const d of UTEIS) {
    bater('ana', d, {
      entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:10',
    });
  }

  expect(servicoPonto.apurarSemana('ana', SABADO).saldoMinutos).toBe(somaDosDias('ana'));
  expect(somaDosDias('ana')).toBe(0);
});

test('A PAUSA PAGA VALE NAS DUAS CONTAS, e não só no espelho', () => {
  /**
   * O caso da Lyvia. Ela entra 13:15 num turno que começa 13:00: abriu
   * mão da pausa de 15 minutos e trabalhou o mesmo que a colega que
   * entrou 13:00 e parou para o café. A casa decidiu não cobrar isso.
   *
   * A regra existia em `obterJornadaDoDia` e em lugar nenhum mais. O
   * espelho dizia 0h00 e a aba Ponto dela dizia −1h15 na mesma semana,
   * na mesma tela.
   */
  for (const d of UTEIS) bater('lyvia', d, { entrada: '13:15', saida: '18:00' });

  const semana = servicoPonto.apurarSemana('lyvia', SABADO);

  expect(semana.saldoMinutos).toBe(somaDosDias('lyvia'));
  expect(semana.saldoMinutos).toBe(0);
  expect(formatarSaldo(semana.saldoMinutos)).toBe('0h00');
});

test('O QUE É GRAVADO NO BANCO DE HORAS É O QUE O ESPELHO MOSTRA', async () => {
  /**
   * O pior dos três, porque `apurarDia` GRAVA. Ele refazia
   * `trabalhado − previsto` com o previsto CHEIO, sem a pausa que o
   * espelho já havia abatido — e criava um débito de 15 minutos por dia
   * que não aparecia em documento nenhum.
   *
   * Cinco por semana, aprovados em lote por quem confia no sistema. É a
   * origem dos −47h50: 15 minutos por cerca de 190 dias.
   */
  for (const d of UTEIS) bater('lyvia', d, { entrada: '13:15', saida: '18:00' });

  for (const d of UTEIS) {
    const jornada = servicoPonto.obterJornadaDoDia('lyvia', d);
    await servicoPonto.apurarDia('lyvia', d);
    const ajuste = servicoPonto.obterAjusteDoDia('lyvia', d);

    /**
     * O ajuste guarda módulo e tipo; o espelho guarda sinal. A
     * comparação é entre os dois com o mesmo sinal — senão um débito de
     * 15 casaria com um crédito de 15.
     */
    const doAjuste = ajuste
      ? (ajuste.tipo === 'debito' ? -ajuste.minutos : ajuste.minutos)
      : 0;

    expect(doAjuste).toBe(jornada.saldoMinutos);
  }

  // E nada foi para a fila de decisão, porque não há nada a decidir
  expect(servicoPonto.obterSaldoPendente('lyvia')).toBe(0);
  expect(servicoPonto.obterSaldoAcumulado('lyvia')).toBe(0);
});

test('hora extra de verdade CONTINUA virando pendência', async () => {
  /**
   * A guarda do teste acima. Se `apurarDia` parasse de criar ajuste
   * nenhum, todos os testes de concordância passariam — e o banco de
   * horas deixaria de existir.
   */
  for (const d of UTEIS) bater('lyvia', d, { entrada: '13:00', saida: '19:00' });

  for (const d of UTEIS) await servicoPonto.apurarDia('lyvia', d);

  // 1h por dia além do turno, cinco dias, esperando decisão
  expect(servicoPonto.obterSaldoPendente('lyvia')).toBe(5 * 60);

  const ajuste = servicoPonto.obterAjusteDoDia('lyvia', UTEIS[0]);
  expect(ajuste?.tipo).toBe('hora_extra');
  expect(ajuste?.estado).toBe('pendente');
});

test('a pausa NÃO perdoa um dia em que a pessoa não veio', () => {
  /**
   * O abatimento é calculado sobre o que faltou no dia. Sem a guarda de
   * "só dia trabalhado", um dia sem batida nenhuma teria o previsto
   * reduzido em 15 minutos — a pausa perdoando parte de uma ausência.
   */
  const vazio = servicoPonto.obterJornadaDoDia('lyvia', UTEIS[0]);

  expect(vazio.minutosTrabalhados).toBe(0);
  expect(vazio.abatidoPelaPausa).toBe(0);
  expect(vazio.minutosPrevistosEfetivos).toBe(vazio.minutosPrevistos);
});

test('trabalhado − previsto efetivo É o saldo, sempre', () => {
  /**
   * A identidade que sustenta a concordância. Se o saldo fosse calculado
   * por outro caminho, quem soma previsto e trabalhado na tela chegaria
   * a um terceiro número — que é como a aba Ponto e o espelho passaram a
   * discordar.
   */
  for (const d of UTEIS) bater('lyvia', d, { entrada: '13:15', saida: '18:00' });
  bater('ana', UTEIS[0], {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:40',
  });

  for (const quem of ['lyvia', 'ana']) {
    for (const d of UTEIS) {
      const j = servicoPonto.obterJornadaDoDia(quem, d);
      if (j.minutosTrabalhados === 0) continue;
      // A compensação do sábado (os 10 min do turno integral, 01/10/2026)
      // está no relógio e não é saldo: é o combinado, e a folga a consome
      expect(j.saldoMinutos).toBe(j.minutosTrabalhados - j.minutosPrevistosEfetivos - j.compensacaoMinutos);
    }
  }
});

// ===============================================================
// 2. A SEMANA FECHA — o previsto somado é a carga contratada
// ===============================================================

test('O PREVISTO DA SEMANA É A CARGA CONTRATADA, para os cinco contratos', () => {
  /**
   * A conta do sábado do estágio era `minutosDoTurno(turno) * 5` — o
   * TURNO — enquanto o dia útil cobrava a FICHA. Para quem tem jornada
   * própria os dois números eram diferentes, e sobrava 1h15 sem dono
   * toda semana: o sistema dizia que a semana dela era de 29h e previa
   * 27h45.
   *
   * Aqui não há número escrito à mão: a soma dos previstos tem de dar a
   * carga semanal que o próprio sistema diz ser daquela pessoa.
   */
  const { inicio, fim } = semanaDe(SABADO);

  for (const pessoa of equipe) {
    const somaPrevisto = listarDatasDoPeriodo(inicio, fim).reduce(
      (t, d) => t + servicoPonto.obterJornadaDoDia(pessoa.id, d).minutosPrevistos,
      0
    );

    expect(somaPrevisto).toBe(cargaSemanalDe(pessoa));
  }
});

test('o sábado do estágio é a SOBRA, e nunca negativo', () => {
  /**
   * Quem cumpre a semana de segunda a sexta tem sábado previsto ZERO —
   * se vier, é hora extra, e não um dia que ele "devia".
   */
  const semSabado = servicoPonto.obterJornadaDoDia('lyvia', SABADO);
  expect(semSabado.minutosPrevistos).toBe(0);

  // Quem vem ao sábado tem nele o que falta para fechar o contrato
  const comSabado = servicoPonto.obterJornadaDoDia('lyvias', SABADO);
  expect(comSabado.minutosPrevistos).toBe(
    cargaSemanalDe(LYVIA_SABADO) - minutosDeDiaUtilDe(LYVIA_SABADO) * 5
  );
  expect(comSabado.minutosPrevistos).toBeGreaterThan(0);
});

test('o sábado do BALCÃO não estica nem encolhe', () => {
  /**
   * Decisão do Elias, e ela corta a conta da sobra: a loja abre 08:00 e
   * fecha 12:00. Um balconista com contrato de 48h teria sábado previsto
   * de 7h10 — três horas que não existem.
   */
  expect(servicoPonto.obterJornadaDoDia('ana', SABADO).minutosPrevistos).toBe(240);

  const comContratoMaior = { ...ANA, id: 'ana48', cargaSemanalMinutos: 48 * 60 };
  equipe = [...equipe, comContratoMaior];
  expect(servicoPonto.obterJornadaDoDia('ana48', SABADO).minutosPrevistos).toBe(240);
  equipe = equipe.filter((c) => c.id !== 'ana48');
});

// ===============================================================
// 3. UM DIA ÚTIL, UMA RESPOSTA — a tela não desmente o espelho
// ===============================================================

test('O CABEÇALHO, A FICHA E O ESPELHO DIZEM A MESMA JORNADA DIÁRIA', () => {
  /**
   * O cabeçalho do Banco de Horas e a ficha mostravam
   * `minutosDoTurno(turnoDe(...))`, o TURNO, enquanto o espelho embaixo
   * previa a FICHA. Para a estagiária de 4h45 o cabeçalho dizia 5h00.
   *
   * Cabeçalho que discorda da tabela embaixo dele é pior do que
   * cabeçalho nenhum — e foi por aí que o saldo dela ficou impossível de
   * explicar.
   */
  for (const pessoa of equipe) {
    const previstoDoDiaUtil = servicoPonto.obterJornadaDoDia(pessoa.id, UTEIS[0])
      .minutosPrevistos;

    expect(minutosDeDiaUtilDe(pessoa)).toBe(previstoDoDiaUtil);
  }

  // E a ficha imprime esse mesmo número, e não o do turno
  const campo = montarFicha(LYVIA_FICHA as any, { incluirVazios: true })
    .find((c: any) => c.chave === 'jornada');

  expect(campo?.valor).toContain('4h45');
  expect(campo?.valor).not.toContain('5h00');
  // O turno dela realmente diz outra coisa — é o que tornava o erro invisível
  expect(minutosDoTurno(turnoDe(LYVIA_FICHA))).toBe(300);
});

test('o cabeçalho do Banco de Horas não volta a perguntar ao turno', async () => {
  /**
   * Este lê o código-fonte porque o cabeçalho é de um componente, e o
   * defeito era a linha e o comentário dela discordarem: o comentário
   * dizia "O MESMO NÚMERO QUE O ESPELHO USA" enquanto a linha mostrava
   * `minutosDoTurno(turnoDe(...))`.
   *
   * Comentário afirmando o que o código não faz é pior do que comentário
   * nenhum: ele desliga a desconfiança de quem passa ali.
   */
  const tela = await Bun.file('src/componentes/BancoDeHoras.tsx').text();
  const semComentarios = tela.replace(/\/\*[\s\S]*?\*\//g, '');

  expect(semComentarios).toContain('minutosDeDiaUtilDe(detalhe.colaborador)');
  expect(semComentarios).not.toContain('minutosDoTurno(turnoDe(');
});

test('jornada e carga vindas do banco como NULL não viram zero', () => {
  /**
   * `!= null` e não `!== undefined`. O banco guarda `null` desde a
   * migração que limpou a jornada automática, e `null !== undefined` é
   * verdadeiro: a função devolvia `null`, que vira ZERO na subtração.
   *
   * Isso já tinha custado o espelho da Lyvia uma vez, com saldo +4h45
   * todo dia útil — ela trabalhando contra previsto nenhum. Foi
   * corrigido no dia útil e ficou de pé na carga semanal.
   */
  const comNulos = {
    ...LYVIA, id: 'nulos',
    cargaHorariaDiariaMinutos: null,
    cargaSemanalMinutos: null,
  };
  equipe = [...equipe, comNulos];

  // Cai para o turno, e não para zero
  expect(minutosDeDiaUtilDe(comNulos)).toBe(minutosDoTurno(turnoDe(comNulos)));
  expect(cargaSemanalDe(comNulos)).toBe(minutosDoTurno(turnoDe(comNulos)) * 5);

  const jornada = servicoPonto.obterJornadaDoDia('nulos', UTEIS[0]);
  expect(jornada.minutosPrevistos).toBeGreaterThan(0);

  equipe = equipe.filter((c) => c.id !== 'nulos');
});
