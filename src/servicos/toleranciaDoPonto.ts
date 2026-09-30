/**
 * A TOLERÂNCIA DO PONTO — a regra que decide o que do dia vira saldo
 *
 * ===================================================================
 * POR QUE MORA AQUI, SOZINHA
 * ===================================================================
 *
 * O saldo do dia aparece no espelho, na aba Ponto, na relação do ciclo,
 * no painel do RH e no banco de horas. Todos leem `saldoMinutos` de
 * `obterJornadaDoDia`, e é lá que esta função é chamada — uma vez. Antes
 * a tolerância era decidida só em `apurarDia`, na hora de gravar: o
 * espelho mostrava +0h05 num dia que o banco de horas tratava como zero,
 * e a relação do ciclo somava os +0h05. Três números para o mesmo dia.
 *
 * Função pura, sem banco nem relógio: recebe os minutos batidos, os
 * esperados e os limites, e devolve o saldo apurado. É o que permite
 * testar cada exemplo da regra sem montar um dia inteiro.
 *
 * ===================================================================
 * A REGRA (pedido do Elias, art. 58 §1º da CLT)
 * ===================================================================
 *
 * ENTRADA E SAÍDA da jornada:
 *   · até 5 minutos em cada uma, e até 10 somando as duas;
 *   · dentro disso, as duas variações NÃO geram saldo — nem crédito
 *     nem débito ("não serão descontadas nem computadas");
 *   · passou de qualquer limite, as duas contam INTEIRAS. Não se
 *     desconta a tolerância do excedente: é tudo ou nada (Súmula 366
 *     do TST). Descontar faria a pessoa receber menos do que trabalhou.
 *
 * INTERVALO DE ALMOÇO — regra própria, pedida à parte:
 *   · soma-se o quanto a saída e o retorno do almoço fugiram do
 *     horário; até 5 minutos no TOTAL não geram saldo;
 *   · a regra de 5 por marcação da entrada/saída NÃO se aplica aqui, e
 *     não há tolerância de 10 no almoço;
 *   · passou de 5, a diferença de duração do intervalo conta, e a
 *     redução fica apontada (`reducaoMinutos`) para a regra de
 *     intervalo intrajornada da empresa.
 *
 *     12:31 → 13:30 (59 min)  variação 1   nada
 *     12:32 → 13:27 (55 min)  variação 5   nada
 *     12:32 → 13:26 (54 min)  variação 6   conta, redução de 6
 *
 * QUANDO O HORÁRIO ESPERADO NÃO É CONHECIDO (estágio, ficha com carga
 * própria que não fecha com turno nenhum): não há como separar entrada
 * de almoço. Vale o limite do DIA sobre o saldo — até 10 minutos, nada.
 * Comparar com um horário inventado seria pior.
 */

export interface MinutosDasBatidas {
  entrada: number | null;
  saidaAlmoco: number | null;
  retornoAlmoco: number | null;
  saida: number | null;
}

export interface HorariosEsperados {
  entrada?: number;
  saida_almoco?: number;
  retorno_almoco?: number;
  saida?: number;
}

export interface LimitesDeTolerancia {
  /** Cada marcação de entrada e de saída: 5 pela lei. */
  porMarcacao: number;
  /** Entrada + saída somadas, e o limite do dia sem horário conhecido: 10. */
  diaria: number;
  /** A soma das variações da saída e do retorno do almoço: 5. */
  intervalo: number;
}

export interface ResultadoDaTolerancia {
  /** O que o dia vale no saldo, depois da tolerância. */
  saldoApurado: number;
  /**
   * Como o dia foi medido. `marcacoes`: contra o horário de cada
   * batida. `dia`: sem horário conhecido, pelo limite do dia.
   * `sem_jornada`: o dia não fechou, e não há saldo a apurar.
   */
  modo: 'marcacoes' | 'dia' | 'sem_jornada';
  /** Minutos ganhos (+) ou perdidos (−) na entrada e na saída. */
  entradaESaida?: { efeitoEntrada: number; efeitoSaida: number; tolerado: boolean };
  intervalo?: {
    /** Batido − previsto na saída para o almoço (+ é depois do horário). */
    variacaoSaida: number;
    /** Batido − previsto no retorno do almoço. */
    variacaoRetorno: number;
    /** |Δ saída do almoço| + |Δ retorno|. */
    variacao: number;
    /** Duração prevista − duração usufruída: + é intervalo mais curto. */
    efeito: number;
    tolerado: boolean;
    /** Quanto o intervalo encolheu, quando passou da tolerância. */
    reducaoMinutos: number;
  };
}

/**
 * A pausa paga do estágio só abate o que FALTOU (`obterJornadaDoDia`). A
 * tolerância é aplicada antes dela, para a pausa não virar crédito de
 * uma variação que a tolerância já perdoou.
 */
const abaterPausa = (diferenca: number, pausa: number): number =>
  diferenca < 0 ? diferenca + Math.min(pausa, -diferenca) : diferenca;

export function aplicarTolerancia(dados: {
  batidas: MinutosDasBatidas;
  esperados: HorariosEsperados | null;
  /** Trabalhado − previsto, ANTES da pausa paga. */
  diferenca: number;
  /** A pausa paga do turno, em minutos. Zero fora do estágio. */
  pausa: number;
  jornadaFechada: boolean;
  limites: LimitesDeTolerancia;
}): ResultadoDaTolerancia {
  const { batidas, esperados, diferenca, pausa, jornadaFechada, limites } = dados;

  if (!jornadaFechada) return { saldoApurado: 0, modo: 'sem_jornada' };

  if (!esperados) {
    const bruto = abaterPausa(diferenca, pausa);
    return { saldoApurado: Math.abs(bruto) <= limites.diaria ? 0 : bruto, modo: 'dia' };
  }

  let neutralizado = 0;
  const resultado: ResultadoDaTolerancia = { saldoApurado: 0, modo: 'marcacoes' };

  if (
    esperados.entrada !== undefined &&
    esperados.saida !== undefined &&
    batidas.entrada !== null &&
    batidas.saida !== null
  ) {
    const efeitoEntrada = esperados.entrada - batidas.entrada;
    const efeitoSaida = batidas.saida - esperados.saida;
    const tolerado =
      Math.abs(efeitoEntrada) <= limites.porMarcacao &&
      Math.abs(efeitoSaida) <= limites.porMarcacao &&
      Math.abs(efeitoEntrada) + Math.abs(efeitoSaida) <= limites.diaria;

    if (tolerado) neutralizado += efeitoEntrada + efeitoSaida;
    resultado.entradaESaida = { efeitoEntrada, efeitoSaida, tolerado };
  }

  if (
    esperados.saida_almoco !== undefined &&
    esperados.retorno_almoco !== undefined &&
    batidas.saidaAlmoco !== null &&
    batidas.retornoAlmoco !== null
  ) {
    const variacaoSaida = batidas.saidaAlmoco - esperados.saida_almoco;
    const variacaoRetorno = batidas.retornoAlmoco - esperados.retorno_almoco;
    const variacao = Math.abs(variacaoSaida) + Math.abs(variacaoRetorno);
    const efeito =
      esperados.retorno_almoco -
      esperados.saida_almoco -
      (batidas.retornoAlmoco - batidas.saidaAlmoco);
    const tolerado = variacao <= limites.intervalo;

    if (tolerado) neutralizado += efeito;
    resultado.intervalo = {
      variacaoSaida,
      variacaoRetorno,
      variacao,
      efeito,
      tolerado,
      reducaoMinutos: tolerado ? 0 : Math.max(0, efeito),
    };
  }

  /**
   * ===============================================================
   * A TOLERÂNCIA SÓ APROXIMA O SALDO DE ZERO — nunca passa do relógio.
   * ===============================================================
   *
   * O caso que o Elias pegou, Aline, 21/09 (turno A):
   *
   *     07:30 · 12:30 · 14:05 · 17:16
   *     saída +6 → passou de 5, conta inteira ........... +6
   *     almoço 5 min mais longo → tolerado, não conta ...  0
   *     relógio (o que ela trabalhou a mais) ............ +1
   *
   * Cada regra sozinha estava certa; somadas, a do almoço PERDOOU os 5
   * minutos que ela não trabalhou, enquanto a saída cobrava os 6 — e o
   * saldo saía +0h06 com o relógio em +0h01. A tolerância existe para
   * desconsiderar pequenas variações, e não para criar hora que ninguém
   * trabalhou (nem débito que ninguém deve).
   *
   * Por isso o saldo fica sempre ENTRE ZERO E O RELÓGIO, no mesmo sinal
   * dele: a tolerância pode reduzir o que conta, nunca aumentar nem
   * inverter. Aqui, +0h01.
   */
  const relogio = abaterPausa(diferenca, pausa);
  const calculado = abaterPausa(diferenca - neutralizado, pausa);
  resultado.saldoApurado =
    relogio >= 0
      ? Math.min(Math.max(calculado, 0), relogio)
      : Math.max(Math.min(calculado, 0), relogio);
  return resultado;
}

// ---------------------------------------------------------------
// A AUDITORIA DO DIA, EM TEXTO
//
// Pedido do Elias: "quero conseguir auditar matematicamente todos os
// valores exibidos no espelho". O espelho impresso e o CSV mostram a
// mesma coisa, e por isso o texto nasce aqui, uma vez:
//
//   relógio (trabalhado − previsto)  −  o que a tolerância perdoou  =  saldo
//
// As variações seguem a convenção do pedido: batido − previsto, com
// sinal. Entrar 07:29 num turno de 07:30 é −1; sair 17:12 de 17:10, +2.
// ---------------------------------------------------------------

const comSinal = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `-${-n}` : '0');

export interface AuditoriaDoDia {
  /** "E -1 / S +2 = 3 ✓" — cada marcação, a soma e se foi tolerado. */
  entradaESaida: string;
  /** "S +2 / R -1 = 3 ✓", e a redução quando o intervalo encolheu além dela. */
  intervalo: string;
  /** Quanto a tolerância tirou do relógio, com sinal. */
  tolerado: number;
}

export function auditarDia(t: ResultadoDaTolerancia, saldoRelogio: number): AuditoriaDoDia {
  if (t.modo === 'sem_jornada') return { entradaESaida: '—', intervalo: '—', tolerado: 0 };
  if (t.modo === 'dia') {
    return {
      entradaESaida: 'sem horário: limite do dia',
      intervalo: '—',
      tolerado: saldoRelogio - t.saldoApurado,
    };
  }

  const es = t.entradaESaida;
  const entradaESaida = es
    ? `E ${comSinal(-es.efeitoEntrada)} / S ${comSinal(es.efeitoSaida)} = ${
        Math.abs(es.efeitoEntrada) + Math.abs(es.efeitoSaida)
      } ${es.tolerado ? '✓' : '✗'}`
    : '—';

  const iv = t.intervalo;
  const intervalo = iv
    ? `S ${comSinal(iv.variacaoSaida)} / R ${comSinal(iv.variacaoRetorno)} = ${iv.variacao} ${
        iv.tolerado ? '✓' : '✗'
      }${iv.reducaoMinutos > 0 ? ` · reduzido ${iv.reducaoMinutos}` : ''}`
    : '—';

  return { entradaESaida, intervalo, tolerado: saldoRelogio - t.saldoApurado };
}
