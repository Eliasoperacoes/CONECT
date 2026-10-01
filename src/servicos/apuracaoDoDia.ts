/**
 * AS REGRAS DO DIA DE PONTO — o que um dia vale, num lugar só.
 *
 * Quanto o dia prevê, quais batidas ele espera, a que horas, se é falta, e
 * o saldo depois da tolerância. Moravam dentro de `ServicoPonto`, lendo o
 * cache do aparelho direto — e por isso só o aparelho conseguia apurar um
 * dia. Era a origem dos defeitos de 01/10/2026: a fila oscilando conforme
 * a janela do cache, pedidos nascendo com o dia pela metade, e semanas
 * inteiras sem apuração porque ninguém abriu a tela.
 *
 * ESTE MÓDULO NÃO SABE DE ONDE VÊM OS DADOS. Pergunta à `fonte`:
 *
 *   - no aplicativo, a fonte é o cache (`ponto.ts` a liga ao carregar);
 *   - na função de servidor `apurar-ponto`, são as linhas do banco.
 *
 * As regras são as mesmas nos dois — é o que impede a apuração do servidor
 * de divergir da tela. Duas coisas a fonte responde porque mudam de lugar
 * para lugar: o "hoje" e a hora de uma batida, que no servidor (UTC) tem de
 * ser lida no relógio de Brasília.
 *
 * Só importa tipos e regras puras (`../tipos`, `toleranciaDoPonto`): ele
 * vai inteiro para dentro da função de servidor.
 */
import {
  AjusteJornada,
  Colaborador,
  Feriado,
  INICIO_DA_COBRANCA_DE_FALTAS,
  JornadaDia,
  Loja,
  MINUTOS_SABADO,
  ORDEM_MARCACOES,
  RegistroPonto,
  SituacaoDoDia,
  TOLERANCIA_INTERVALO_PADRAO_MINUTOS,
  TURNO_SABADO,
  TipoMarcacao,
  cargaSemanalDe,
  compensacaoDoSabadoDe,
  minutosComSinal,
  minutosDeDiaUtilDe,
  minutosPausaDoTurno,
  temIntervaloNoDia,
  trabalhaNoSabado,
  turnoDe,
} from '../tipos';
import { aplicarTolerancia } from './toleranciaDoPonto';

/** De onde as regras leem — o cache no aplicativo, o banco no servidor. */
export interface FonteDaApuracao {
  colaborador(id: string): Colaborador | undefined;
  /** As batidas do dia, na ordem da jornada. */
  marcacoesDoDia(colaboradorId: string, data: string): RegistroPonto[];
  /** Ausência APROVADA no dia, ou 'normal'. */
  situacaoDoDia(colaboradorId: string, data: string): SituacaoDoDia;
  feriadoEm(data: string, loja?: Loja): Feriado | undefined;
  ajusteDoDia(colaboradorId: string, data: string): AjusteJornada | null;
  /** A pessoa bate ponto? (ferramenta "Meu ponto") */
  batePonto(colaborador: Colaborador): boolean;
  /** AAAA-MM-DD de hoje, no relógio confiável de quem apura. */
  hoje(): string;
  /** Os minutos do dia (h × 60 + m) de um horário gravado, no relógio da loja. */
  minutosDoHorario(horarioIso: string): number;
  tolerancias(): { porMarcacao: number; diaria: number };
}

const SEM_FONTE: FonteDaApuracao = new Proxy({} as FonteDaApuracao, {
  get: () => {
    throw new Error('Regras do ponto sem fonte de dados: chame usarFonteDaApuracao antes.');
  },
});

let fonte: FonteDaApuracao = SEM_FONTE;

/** Liga as regras a uma fonte. O aplicativo liga o cache; o servidor, o banco. */
export const usarFonteDaApuracao = (nova: FonteDaApuracao): void => {
  fonte = nova;
};

/**
 * Os minutos de um horário NO RELÓGIO DE BRASÍLIA, em qualquer máquina.
 * É o que o servidor usa: lá `getHours()` devolveria a hora em UTC, três
 * horas adiante, e toda entrada das 07:30 viraria 10:30.
 */
const RELOGIO_DA_LOJA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export const minutosEmBrasilia = (horarioIso: string): number => {
  const partes = RELOGIO_DA_LOJA.formatToParts(new Date(horarioIso));
  const h = Number(partes.find((p) => p.type === 'hour')?.value);
  const m = Number(partes.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
};

/** O dia de hoje NO RELÓGIO DE BRASÍLIA, em qualquer máquina. */
export const hojeEmBrasilia = (agora: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

// --- Utilidades de data (fuso local, sem depender de UTC) ---

/** Data no formato AAAA-MM-DD a partir de um Date local. */
export const paraDataLocal = (data: Date): string => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

/** Converte AAAA-MM-DD em Date local ao meio-dia (evita viradas por fuso). */
export const deDataLocal = (data: string): Date => {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12, 0, 0);
};

/**
 * A rede trabalha de segunda a SÁBADO. Só domingo não tem jornada.
 *
 * Existia `ehFimDeSemana` tratando sábado como folga — e isso zerava o
 * previsto do sábado, fazendo as 4 horas trabalhadas virarem 4 horas extras
 * para a rede inteira, toda semana.
 */
export const ehDiaDeFolga = (data: string): boolean =>
  deDataLocal(data).getDay() === 0;

export const ehSabado = (data: string): boolean =>
  deDataLocal(data).getDay() === 6;

/**
 * As marcações que fecham o dia.
 *
 * Sábado tem DUAS: entra às 8 e sai ao meio-dia, sem intervalo. Exigir as
 * quatro deixaria todo sábado eternamente incompleto — e dia incompleto não
 * apura, então o sábado nunca entraria no banco de horas de ninguém.
 */
/**
 * Quais batidas se espera desta pessoa neste dia.
 *
 * ANTES OLHAVA SÓ A DATA, e era daí que vinha o defeito relatado: o
 * sistema cobrava de todo mundo quatro batidas e um sábado.
 *
 * Quem faz 6h direto, sem almoço, batia duas vezes e o dia ficava
 * eternamente "pela metade". Quem não vem ao sábado tinha todo sábado
 * marcado como dia não cumprido. Nenhum dos dois estava errado — a
 * pergunta é que estava.
 *
 * Sem pessoa, mantém o comportamento antigo: há chamadas que só sabem a
 * data, e para elas o dia comum da rede é a resposta certa.
 */
export const marcacoesEsperadas = (
  data: string,
  colaborador?: Colaborador
): TipoMarcacao[] => {
  /**
   * FERIADO FECHADO NÃO ESPERA BATIDA NENHUMA.
   *
   * Sem isto o dia entrava na conta de "dias sem fechar" e ia parar na
   * fila do responsável, pedindo decisão sobre um dia em que a loja
   * estava de portas fechadas.
   *
   * Meio expediente continua esperando entrada e saída: a pessoa veio,
   * só que menos tempo.
   */
  /**
   * DIA ABONADO NÃO ESPERA BATIDA NENHUMA.
   *
   * Folga de sábado, atestado, férias, falta justificada: o dia foi
   * abonado, e `cargaPrevistaEmMinutos` já zera o previsto dele.
   *
   * Faltava a outra metade. Como esta função continuava esperando as
   * batidas, o espelho imprimia `--:--` nas quatro colunas do dia de
   * folga — e `--:--` num documento de ponto tem UM significado só:
   * "deveria ter batido e não bateu". O direito da pessoa aparecia no
   * papel como esquecimento dela.
   *
   * É o mesmo cuidado que o feriado e o domingo já tinham, e que a
   * folga não tinha — apesar de a folga de sábado ser mensal e valer
   * para a rede inteira.
   */
  if (colaborador && fonte.situacaoDoDia(colaborador.id, data) !== 'normal') return [];

  const feriado = fonte.feriadoEm(data, colaborador?.loja);
  if (feriado) return feriado.minutosPrevistos > 0 ? ['entrada', 'saida'] : [];

  /**
   * DOMINGO NÃO ESPERA BATIDA NENHUMA.
   *
   * Estava devolvendo as quatro, e o efeito era silencioso: todo domingo
   * passado entrava na lista de dias com pendência da semana, como se a
   * pessoa tivesse esquecido de bater num dia em que a loja nem abre.
   *
   * Trabalhar no domingo continua possível — é hora extra, e
   * `obterProximaMarcacao` cuida disso.
   */
  if (ehDiaDeFolga(data)) return [];

  if (ehSabado(data)) {
    // Não trabalha aos sábados: não há batida a esperar, e o dia não é dela
    if (colaborador && !trabalhaNoSabado(colaborador)) return [];
    return ['entrada', 'saida'];
  }

  if (colaborador && !temIntervaloNoDia(colaborador)) return ['entrada', 'saida'];

  return ORDEM_MARCACOES;
};

/**
 * Quanto o dia prevê para esta pessoa.
 *
 * Domingo não prevê nada; sábado prevê as 4 horas da escala; dia útil
 * prevê o turno dela — a carga própria, quando cadastrada, vence o turno,
 * porque contrato individual manda mais que a escala da rede.
 */
export const cargaPrevistaEmMinutos = (colaborador: Colaborador | undefined, data: string): number => {
  if (ehDiaDeFolga(data)) return 0;

  /**
   * Ausência aprovada zera o previsto do dia.
   *
   * Sem isto, o sábado de folga previa 4 horas e a pessoa fechava o mês
   * com 4 horas de débito por exercer um direito. O mesmo vale para
   * atestado e falta justificada: o dia foi abonado, e dia abonado não
   * cobra jornada.
   *
   * MAS SÓ QUANDO A PESSOA NÃO VEIO. A Fernanda teve atestado aprovado
   * no dia 25/09 e bateu as quatro marcações: com previsto zero, as 8h13
   * trabalhadas viraram 8h13 de HORA EXTRA. O abono perdoa o que falta;
   * não transforma em extra o que foi trabalhado. Com batida no dia, o
   * previsto é a jornada normal, e `obterJornadaDoDia` impede o saldo
   * de ficar negativo — a falta daquele dia continua perdoada.
   */
  if (
    colaborador &&
    fonte.situacaoDoDia(colaborador.id, data) !== 'normal' &&
    fonte.marcacoesDoDia(colaborador.id, data).length === 0
  ) {
    return 0;
  }

  /**
   * FERIADO NÃO COBRA JORNADA.
   *
   * Sem isto, todo feriado nacional virava um dia inteiro de débito para
   * a rede inteira — e ninguém entendia de onde saiu, porque o espelho
   * mostrava um dia sem batida nenhuma, igual a uma falta.
   *
   * Meio expediente é o mesmo caminho com outro número: 24 e 31 de
   * dezembro preveem o que o RH cadastrar, e não o dia inteiro nem zero.
   *
   * Vem ANTES do sábado de propósito: feriado que cai num sábado fecha a
   * loja do mesmo jeito.
   */
  const feriado = fonte.feriadoEm(data, colaborador?.loja);
  if (feriado) return feriado.minutosPrevistos;

  /**
   * Sábado de quem não trabalha aos sábados não prevê nada.
   *
   * Previa 4 horas para todo mundo, e o estagiário que cumpre as 6h de
   * segunda a sexta fechava o mês com 16 horas de débito por um sábado
   * que nunca foi dele.
   */
  /**
   * ===============================================================
   * O SÁBADO COMPLETA A SEMANA — NÃO É MAIS UM DIA PADRÃO.
   * ===============================================================
   *
   * Era 4h fixas para todo mundo que vem ao sábado, como se fosse um
   * dia igual aos outros com horário próprio. O Elias corrigiu: "os
   * sábados devem compor a semana e não ser apenas mais um horário
   * padrão".
   *
   * E é a descrição dele desde o começo: "os que fazem menos durante a
   * semana trabalham no sábado, e essas horas complementam a semana".
   * O sábado é o dia FLEXÍVEL da escala — ele carrega o que falta.
   *
   * Então o previsto dele é a SOBRA: o contrato da semana menos o que
   * os cinco dias úteis já preveem.
   *
   *     sábado = carga semanal − (dia do turno × 5)
   *
   * Para o balcão a conta dá exatamente as 4h de sempre: 8h10 × 5 são
   * 40h50, e o contrato é 44h50. Nada muda para eles.
   *
   * Para o estágio ela passa a fazer sentido: quem cumpre 6h de segunda
   * a sexta já fechou as 30h, e o sábado dele prevê ZERO — se vier,
   * é hora extra, e não um dia que ele "devia". Quem faz 5h por dia
   * chega a 25h, e o sábado dele prevê as 5h que faltam.
   *
   * Nunca negativo: contrato menor que a semana útil não vira crédito
   * automático no sábado. Isso é divergência de cadastro, e a ficha
   * avisa.
   */
  if (ehSabado(data)) {
    if (!trabalhaNoSabado(colaborador)) return 0;

    const turno = turnoDe(colaborador);

    /**
     * SÓ O ESTÁGIO TEM SÁBADO ELÁSTICO.
     *
     * Para o balcão, o estoque e o escritório o sábado é horário de
     * verdade: 08:00 às 12:00, a loja abre e fecha nessas horas. Ele
     * não estica nem encolhe para fechar conta nenhuma.
     *
     * Eu havia aplicado a sobra para todo mundo, e o Elias cortou.
     * Estava certo: um balconista com contrato de 48h teria sábado
     * previsto de 7h10 — a loja fecha ao meio-dia, então o sistema
     * cobraria três horas que não existem. E com contrato de 40h o
     * sábado dele zeraria, sumindo com um dia inteiro de trabalho.
     *
     * No estágio é o contrário: o sábado É o dia de completar a
     * semana, e foi para isso que ele entrou na escala deles.
     */
    if (turno.perfil !== 'estagio') return MINUTOS_SABADO;

    /**
     * A SOBRA SE CONTA COM O MESMO DIA ÚTIL QUE O DIA ÚTIL COBRA.
     *
     * Era `minutosDoTurno(turno) * 5` — o TURNO. E o dia útil, trinta
     * linhas abaixo, cobrava a FICHA. Para quem tem jornada própria os
     * dois números eram diferentes, e a semana não fechava: a
     * estagiária de 4h45 na ficha com turno de 5h somava 27h45 de
     * previsto numa semana que o sistema dizia ser de 29h. 1h15 sem
     * dono, toda semana.
     */
    const uteis = minutosDeDiaUtilDe(colaborador) * 5;

    /**
     * A SOBRA NUNCA PASSA DO HORÁRIO DA LOJA.
     *
     * O estagiário de 5h por dia (E2, E3) tem 25h na semana útil, e a
     * sobra até as 30h dava sábado de 5h — com a loja abrindo das 8 ao
     * meio-dia. Ele não tinha como cumprir: a Lyvia fechava todo sábado
     * devendo 45 minutos (−1h, menos os 15 da pausa). Decisão do Elias:
     * o sábado dele é de 4h, o horário da loja, e a semana fecha 29h.
     *
     * O estagiário de 6h (E1) continua com sábado ZERO: a sobra dele é
     * nada, e o teto não inventa hora onde não falta.
     */
    return Math.min(MINUTOS_SABADO, Math.max(0, cargaSemanalDe(colaborador) - uteis));
  }

  /**
   * O DIA ÚTIL PREVÊ O QUE O TURNO DIZ. Ponto.
   *
   * Era `cargaHorariaDiariaMinutos ?? minutosDoTurno(...)` — a ficha
   * vencendo o turno. Só que a coluna é `not null default 480`: ela
   * NUNCA vem indefinida, então o `??` nunca caía para o turno e a
   * segunda metade da linha era código morto.
   *
   * Foi o que o Elias viu no espelho da Lyvia: estagiária, turno da
   * tarde, 4h45 por dia — e o cabeçalho dizendo "jornada diária 8h10",
   * com −3h25 de débito todo santo dia. A ficha dela tinha 490 minutos
   * gravados de quando foi cadastrada, e esse número vencia o turno de
   * estágio que o sistema já sabia que era dela.
   *
   * O CAMPO CONTINUA EXISTINDO — meio período é contrato real, e ele
   * precisa vencer a escala da rede. O que mudou é que ele virou
   * OPCIONAL de verdade: `null` quer dizer "vale o turno", e só um
   * número escrito de propósito manda mais que ele.
   *
   * A migração `jornada-vem-do-turno.sql` limpa os 480 e 490 que o
   * sistema distribuiu sozinho, para o `??` abaixo voltar a ter o
   * efeito que sempre foi a intenção dele.
   */
  /**
   * ===============================================================
   * O PREVISTO DO DIA É O RELÓGIO DO TURNO. NADA DE RATEIO.
   * ===============================================================
   *
   * Eu havia feito o previsto ser a FATIA do dia na carga semanal:
   *
   *     previsto = dia pelo turno × (carga semanal ÷ semana pelo turno)
   *
   * A ideia era fazer a carga semanal pesar. O que ela produziu foi um
   * número sem sentido nenhum, e o Elias perguntou exatamente isso:
   * "qual o sentido do 5h18?".
   *
   * Nenhum. A Lyvia estava com turno de 6h e carga semanal de 30h, que
   * com o sábado somaria 34h — então cada dia dela encolhia 12% e virava
   * 5h18. Ninguém sai 5h18 depois de entrar. E pior: o rateio ESPALHAVA
   * um débito de 33 minutos por todos os dias, quando o problema era um
   * só e estava no cadastro — o turno não era o dela.
   *
   * Número que não corresponde a relógio nenhum não se confere, não se
   * explica para quem bateu o ponto, e ainda esconde a causa.
   *
   * O QUE FAZ A SEMANA FECHAR, ENTÃO
   *
   * O dia útil prevê o relógio do turno, e o SÁBADO carrega a
   * diferença — é o dia flexível da escala, e a conta dele está lá em
   * cima. Nenhum dia útil vira número quebrado por causa do contrato.
   *
   * A FICHA AINDA VENCE O TURNO, e quem sabe disso é
   * `minutosDeDiaUtilDe` — a mesma função que a sobra do sábado e a
   * carga semanal consultam. Esta decisão morava aqui, escrita à mão, e
   * os outros quatro lugares que a repetiam discordavam dela.
   */
  return minutosDeDiaUtilDe(colaborador);
};

/**
 * A COMPENSAÇÃO DO SÁBADO QUE ESTE DIA CARREGA — os 10 minutos do turno
 * integral acima das 8h da CLT (`compensacaoDoSabadoDe`, em tipos.ts).
 *
 * Só no dia útil: o sábado é de 4h corridas, sem os 10 minutos; feriado e
 * domingo não carregam combinado nenhum.
 *
 * O DIA ABONADO EM QUE A PESSOA VEIO CARREGA. Quem tem atestado e trabalhou
 * o horário inteiro cumpriu os 10 minutos como em qualquer dia — sem isto
 * eles viravam hora extra. O abonado SEM batida não rende nada sozinho: o
 * previsto dele é zero e a compensação só conta em dia que fechou.
 */
export const compensacaoEsperadaDoDia = (colaborador: Colaborador | undefined, data: string): number => {
  if (!colaborador || ehDiaDeFolga(data) || ehSabado(data)) return 0;
  if (fonte.feriadoEm(data, colaborador.loja)) return 0;
  return compensacaoDoSabadoDe(colaborador);
};

/**
 * O horário que o contrato espera para CADA batida daquele dia.
 *
 * Devolve `null` quando o sistema não tem como saber — e aí o limite por
 * marcação não se aplica, porque comparar com um horário inventado seria
 * pior do que não comparar.
 *
 * É o caso do estágio: seis horas corridas não correspondem a nenhum
 * turno da rede, e a pessoa combina o horário com a área. O limite do
 * DIA continua valendo para ela.
 */
export const horariosEsperadosDoDia = (
  colaborador: Colaborador | undefined,
  data: string
): Partial<Record<TipoMarcacao, number>> | null => {
  const esperadas = marcacoesEsperadas(data, colaborador);
  if (esperadas.length === 0) return null;

  const emMinutos = (hora: string): number => {
    const [h, m] = hora.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const turno = turnoDe(colaborador);

  /**
   * O DIA ÚTIL DE DUAS BATIDAS TAMBÉM TEM HORÁRIO.
   *
   * Antes só o sábado e o dia de quatro batidas tinham. O estagiário
   * que entra 07:30 e sai 12:30 direto caía no `{}`, e o sistema dizia
   * que não sabia o horário dele — quando sabe, está escrito no turno.
   *
   * O efeito era mudo: sem horário esperado não há atraso, e a entrada
   * às 09:00 dele passava como se fosse no relógio.
   */
  const horarios: Partial<Record<TipoMarcacao, number>> = ehSabado(data)
    ? esperadas.length === 2
      ? {
          entrada: emMinutos(TURNO_SABADO.entrada),
          saida: emMinutos(TURNO_SABADO.saida),
        }
      : {}
    : esperadas.length === 4 && turno.intervalo
      ? {
          entrada: emMinutos(turno.entrada),
          saida_almoco: emMinutos(turno.intervalo.saida),
          retorno_almoco: emMinutos(turno.intervalo.retorno),
          saida: emMinutos(turno.saida),
        }
      : esperadas.length === 2
        ? {
            entrada: emMinutos(turno.entrada),
            saida: emMinutos(turno.saida),
          }
        : {};

  if (Object.keys(horarios).length === 0) return null;

  /**
   * OS HORÁRIOS PRECISAM FECHAR A CARGA DA PESSOA.
   *
   * A ficha pode ter carga própria — 8h00, por exemplo — enquanto o
   * turno da rede fecha 8h10. Nesse caso os horários do turno NÃO são
   * os dela: ela entra e sai em outro relógio, combinado com a área.
   *
   * Comparar a batida dela com o turno acusaria trinta minutos de
   * variação todo santo dia, e o dia inteiro cairia na fila. Quando os
   * dois não fecham, o sistema admite que não sabe o horário — e vale
   * só o limite do dia.
   */
  const implicado = ehSabado(data)
    ? (horarios.saida ?? 0) - (horarios.entrada ?? 0)
    : (horarios.saida_almoco ?? 0) -
      (horarios.entrada ?? 0) +
      ((horarios.saida ?? 0) - (horarios.retorno_almoco ?? 0));

  // O relógio do turno é o previsto (8h) MAIS a compensação do sábado (10)
  if (implicado !== cargaPrevistaEmMinutos(colaborador, data) + compensacaoEsperadaDoDia(colaborador, data)) {
    return null;
  }

  return horarios;
};

/** Consolida um dia: horas trabalhadas, intervalo e saldo contra a jornada. */
export const jornadaDoDia = (colaboradorId: string, data: string): JornadaDia => {
  const colaborador = fonte.colaborador(colaboradorId);
  const registros = fonte.marcacoesDoDia(colaboradorId, data);

  const marcacoes: Partial<Record<TipoMarcacao, RegistroPonto>> = {};
  registros.forEach((r) => {
    marcacoes[r.tipo] = r;
  });

  const minutosDe = (tipo: TipoMarcacao): number | null => {
    const reg = marcacoes[tipo];
    if (!reg) return null;
    // No relógio da loja: o aparelho lê no fuso dele, o servidor em Brasília
    return fonte.minutosDoHorario(reg.horario);
  };

  const entrada = minutosDe('entrada');
  const saidaAlmoco = minutosDe('saida_almoco');
  const retornoAlmoco = minutosDe('retorno_almoco');
  const saida = minutosDe('saida');

  let minutosIntervalo = 0;
  if (saidaAlmoco !== null && retornoAlmoco !== null && retornoAlmoco > saidaAlmoco) {
    minutosIntervalo = retornoAlmoco - saidaAlmoco;
  }

  // Só conta jornada fechada: entrada e saída registradas
  let minutosTrabalhados = 0;
  if (entrada !== null && saida !== null && saida > entrada) {
    minutosTrabalhados = saida - entrada - minutosIntervalo;
  }

  const minutosPrevistos = cargaPrevistaEmMinutos(colaborador, data);
  /**
   * O QUE FECHA O DIA DEPENDE DE QUEM É A PESSOA.
   *
   * Estava perguntando só pela data, e por isso cobrava quatro batidas de
   * quem faz seis horas direto: o dia dela nunca ficava "completo", e a
   * tela dizia jornada incompleta todo santo dia.
   *
   * É o mesmo defeito que eu corrigi em `levantarDiasIncompletos` e
   * deixei passar aqui — o segundo lugar que faz a mesma pergunta.
   */
  const completa = marcacoesEsperadas(data, colaborador).every(
    (tipo) => !!marcacoes[tipo]
  );
  const emAndamento = entrada !== null && saida === null;

  /**
   * ===============================================================
   * A PAUSA É O COLCHÃO DO DIA, E ELA SÓ EXISTE UMA VEZ.
   * ===============================================================
   *
   * A pausa de 15 minutos do estágio é paga e não se bate. Quem entra
   * 13:15 num turno que começa 13:00 ABRIU MÃO DELA — e trabalhou
   * exatamente o mesmo que a colega que entrou 13:00 e parou 15
   * minutos. Os dois dias valem igual, e é assim que a casa conta.
   *
   * Sem isto o espelho da Lyvia acusava −15 minutos todo santo dia por
   * uma jornada que ela cumpriu inteira.
   *
   * DOIS LIMITES, e os dois importam:
   *
   *  - Só abate ATÉ o tamanho da pausa. Quem entra 13:40 perdeu a pausa
   *    E chegou atrasado: os 25 minutos além dela continuam débito.
   *  - Só abate PARA BAIXO. Pausa não vira crédito para quem ficou
   *    além do horário — hora extra é outra coisa, e passa por decisão.
   *
   * E vale uma vez por dia, porque a pausa é uma por dia: quem tem
   * almoço de 1h30 não entra aqui, o almoço dele é batido e descontado.
   */
  /**
   * ===============================================================
   * A PAUSA ABATE O PREVISTO, e não o saldo.
   * ===============================================================
   *
   * Era `saldo = diferença + abatimento`, com o abatimento entrando
   * SÓ no saldo. Isso escondia o abatimento de todo mundo que refaz a
   * conta a partir de `minutosPrevistos` — e são dois:
   *
   *  - `apurarSemana` somava o previsto CHEIO e subtraía o
   *    trabalhado. A aba Ponto da Lyvia dizia −1h15 na semana
   *    enquanto o espelho dela dizia 0h00 em todos os cinco dias.
   *  - `apurarDia` refazia `trabalhado − previsto` e criava um DÉBITO
   *    de 15 minutos por dia no banco de horas. Cinco por semana,
   *    aprovados em lote, para sempre. É a origem aritmética dos
   *    −47h50 dela: 15 minutos × cerca de 190 dias.
   *
   * Descontando do previsto, o número que sai daqui é o mesmo para
   * quem soma o saldo e para quem refaz a subtração. Uma conta, um
   * resultado — que é o que faltava.
   *
   * SÓ VALE PARA DIA TRABALHADO. Num dia sem batida nenhuma a
   * diferença é o previsto inteiro, e sem esta guarda a pausa
   * perdoaria 15 minutos de um dia em que a pessoa não veio.
   */
  /**
   * A PAUSA NÃO VALE NO SÁBADO. Decisão do Elias: o sábado é de 4h
   * corridas, sem pausa. Ela perdoava 15 minutos de falta também ali.
   */
  const pausa = ehSabado(data) ? 0 : minutosPausaDoTurno(turnoDe(colaborador));
  const faltando = minutosPrevistos - minutosTrabalhados;
  const abatidoPelaPausa =
    minutosTrabalhados > 0 && faltando > 0 ? Math.min(pausa, faltando) : 0;

  const minutosPrevistosEfetivos = minutosPrevistos - abatidoPelaPausa;

  // Dia sem nenhuma marcação em fim de semana não é falta nem saldo negativo;
  // dia útil sem jornada fechada também não gera saldo até o RH tratar.
  const saldoBrutoMinutos =
    minutosTrabalhados > 0 ? minutosTrabalhados - minutosPrevistosEfetivos : 0;

  /**
   * ===============================================================
   * A TOLERÂNCIA ENTRA AQUI, ANTES DE QUALQUER UM LER O SALDO.
   * ===============================================================
   *
   * Ela era decidida só em `apurarDia`, na hora de gravar no banco de
   * horas. O resultado: o espelho mostrava +0h05 num dia que o banco
   * tratava como zero, a relação do ciclo somava os +0h05, e o saldo
   * do período não fechava com o acumulado. Pedido do Elias: a
   * correção na regra central, para todos receberem o mesmo número.
   *
   * A regra inteira, com os exemplos, está em `toleranciaDoPonto.ts`.
   */
  /*
    O DESVIO SE MEDE CONTRA O HORÁRIO COMBINADO, e não contra as 8h.
    Quem sai às 17:10 saiu no horário: os 10 minutos são a compensação do
    sábado (`compensacaoMinutos`), e não hora extra para a fila.
  */
  const compensacaoEsperada = compensacaoEsperadaDoDia(colaborador, data);
  const tolerancia = aplicarTolerancia({
    batidas: { entrada, saidaAlmoco, retornoAlmoco, saida },
    esperados: horariosEsperadosDoDia(colaborador, data),
    diferenca: minutosTrabalhados - minutosPrevistos - compensacaoEsperada,
    pausa,
    jornadaFechada: minutosTrabalhados > 0,
    limites: {
      porMarcacao: fonte.tolerancias().porMarcacao,
      diaria: fonte.tolerancias().diaria,
      intervalo: TOLERANCIA_INTERVALO_PADRAO_MINUTOS,
    },
  });
  /**
   * DIA ABONADO NÃO DEVE HORA.
   *
   * Ausência aprovada com batida no dia — a declaração de comparecimento
   * de quem saiu duas horas para a consulta, ou o atestado de quem veio
   * mesmo assim — prevê a jornada normal (ver `cargaPrevistaEmMinutos`).
   * O que faltou está perdoado: o saldo não desce de zero. O que passou
   * da jornada normal continua sendo extra, como em qualquer dia.
   */
  const abonado = fonte.situacaoDoDia(colaboradorId, data) !== 'normal';
  let saldoMinutos = abonado ? Math.max(0, tolerancia.saldoApurado) : tolerancia.saldoApurado;
  let saldoBrutoDoDia = saldoBrutoMinutos;

  /**
   * A FALTA DEBITA O DIA INTEIRO — até alguém decidir outra coisa.
   *
   * Dia sem batida passava em branco (ver `ehFalta`). Agora ele pesa o
   * previsto inteiro no espelho, e vai para a fila do líder como "Falta":
   * decidido, vale o que ele decidiu — o débito da jornada, ou zero se
   * abonou.
   */
  const falta = ehFalta(colaborador, data, registros.length, minutosPrevistos);
  if (falta) {
    const decidido = fonte.ajusteDoDia(colaboradorId, data);
    saldoBrutoDoDia = -minutosPrevistos;
    saldoMinutos =
      decidido && decidido.estado === 'aprovado' && decidido.tipo !== 'dia_incompleto'
        ? minutosComSinal(decidido)
        : -minutosPrevistos;
  }

  return {
    data,
    colaboradorId,
    marcacoes,
    minutosTrabalhados,
    minutosIntervalo,
    minutosPrevistos,
    minutosPrevistosEfetivos,
    abatidoPelaPausa,
    // Os 10 minutos rendem só no dia que FECHOU: dia pela metade não paga folga
    compensacaoMinutos: minutosTrabalhados > 0 && completa ? compensacaoEsperada : 0,
    saldoMinutos,
    saldoBrutoMinutos: saldoBrutoDoDia,
    tolerancia,
    completa,
    emAndamento,
    falta,
  };
};

/**
 * ESTE DIA É FALTA?
 *
 * Até 30/09/2026 o dia sem nenhuma batida não gerava saldo: o comentário
 * dizia que "falta tem caminho próprio", e esse caminho nunca existiu.
 * No espelho ele passava em branco, e no banco também. O Elias viu.
 *
 * É falta o dia que:
 *   - previa jornada — domingo, feriado, ausência aprovada e o sábado de
 *     quem não vem já previam zero (`cargaPrevistaEmMinutos`);
 *   - não teve batida nenhuma;
 *   - já passou — hoje ainda dá tempo de chegar;
 *   - é de 01/10/2026 em diante (`INICIO_DA_COBRANCA_DE_FALTAS`) e não
 *     vem antes da admissão da pessoa.
 */
export const ehFalta = (
  colaborador: Colaborador | undefined,
  data: string,
  batidas: number,
  minutosPrevistos: number
): boolean => {
  if (batidas > 0 || minutosPrevistos <= 0) return false;
  // Quem não bate ponto não falta: não tinha por onde bater
  if (colaborador && !fonte.batePonto(colaborador)) return false;
  if (data >= fonte.hoje() || data < INICIO_DA_COBRANCA_DE_FALTAS) return false;
  if (colaborador?.dataAdmissao && data < colaborador.dataAdmissao) return false;
  return true;
};

/**
 * O QUE UM DIA FECHADO VIRA NO BANCO DE HORAS — a decisão, sem gravar.
 *
 * Era o miolo de `apurarDia`, misturado com a gravação no aparelho. Saiu
 * para cá para o servidor decidir com a MESMA regra: quem grava (o app ou
 * a função `apurar-ponto`) só executa o que esta função devolve.
 *
 *   'nada'     — o dia não fechou, ou não há o que lançar, ou já foi decidido
 *   reescrita  — a linha que existe volta a zero (dentro da tolerância)
 *   gravar     — hora extra ou débito; `entrouNaFila` diz se é novidade para
 *                quem decide (só então se avisa)
 *
 * @param opcoes.corrigidoPor Quem acabou de corrigir a batida à mão — a
 * autoridade já foi conferida por quem chama. Batida normal não passa nada.
 */
export type DecisaoDaApuracao =
  | { acao: 'nada' }
  | { acao: 'gravar'; ajuste: AjusteJornada; reescrita: boolean; entrouNaFila: boolean };

export const decidirApuracao = (
  colaboradorId: string,
  data: string,
  opcoes: {
    motivo?: string;
    anexoCaminho?: string;
    corrigidoPor?: { id: string; nome: string };
    /** O instante da decisão, em ISO. */
    agora: string;
    /** Id para a linha nova, quando ainda não há uma. */
    novoId: () => string;
  }
): DecisaoDaApuracao => {
  const jornada = jornadaDoDia(colaboradorId, data);
  if (!jornada.completa) return { acao: 'nada' };

  /**
   * A DIFERENÇA É A QUE O ESPELHO MOSTRA. Não se refaz aqui.
   *
   * Era `jornada.minutosTrabalhados - jornada.minutosPrevistos`, o
   * previsto CHEIO — sem a pausa paga que o espelho já havia abatido.
   * O efeito era o pior de todos, porque esta função GRAVA:
   *
   *   espelho da Lyvia .......... 0h00 no dia
   *   apurarDia ................. débito de 0h15, todo dia
   *
   * Cinco por semana, aprovados em lote por quem confia no sistema, e
   * nenhum deles aparecendo no documento que a pessoa confere. É a
   * origem aritmética dos −47h50: 15 minutos por cerca de 190 dias.
   *
   * `saldoMinutos` é a única resposta da casa para "quanto sobrou ou
   * faltou neste dia" — quem grava tem de usar a mesma que quem mostra.
   */
  const diferenca = jornada.saldoMinutos;
  const existente = fonte.ajusteDoDia(colaboradorId, data);

  /**
   * ===============================================================
   * A TOLERÂNCIA JÁ VEM APLICADA no saldo — não se decide aqui.
   * ===============================================================
   *
   * Aqui havia uma segunda conta: o saldo líquido do dia contra 10
   * minutos e a maior variação de QUALQUER marcação, almoço incluído,
   * contra 5. Era outra regra, e divergia do espelho, que mostrava o
   * saldo sem tolerância nenhuma. Pedido do Elias: entrada e saída
   * 5 + 5 (até 10), almoço com regra própria, e tudo na regra central
   * (`toleranciaDoPonto.ts`, chamada em `obterJornadaDoDia`). O que
   * chega aqui já é o que o dia vale; zero é "dentro da tolerância".
   */

  /**
   * ===============================================================
   * NADA A LANÇAR: o dia fechou certo, ou fechou dentro da lei.
   * ===============================================================
   *
   * DENTRO DA TOLERÂNCIA O BANCO DE HORAS RECEBE ZERO. Decisão do
   * Elias, e é o que o artigo citado acima manda: variações até cinco
   * minutos por marcação "NÃO SERÃO DESCONTADAS NEM COMPUTADAS como
   * jornada extraordinária". Nem descontadas nem computadas — os dois
   * lados.
   *
   * O código citava esse artigo e fazia o contrário: gravava o valor
   * CHEIO, já aprovado, e ele entrava no saldo. Nos dois sentidos, o
   * que fica visível numa semana só da Fernanda:
   *
   *     qua 23/09   8h15 contra 8h10   ->  +0h05 creditados
   *     sex 25/09   8h13 contra 8h10   ->  +0h03 creditados
   *
   * E no outro sentido era a Camila: 33 minutos de débito em 6 dias,
   * aprovados sozinhos. Em 190 dias úteis, 3 minutos por dia são
   * −9h30 que ninguém decidiu descontar.
   *
   * O DIA CONTINUA FACTUAL. O espelho segue mostrando 07:32, 17:13 e
   * o +0h05 do dia — é o que aconteceu, e documento de ponto mostra o
   * que aconteceu. O que muda é o que VIRA SALDO, e esta função é
   * justamente a fronteira entre as duas coisas: é aqui que o fato do
   * dia vira crédito, débito ou nada.
   *
   * NÃO SE CRIA LINHA NOVA para um dia que não gera nada — seriam
   * 85 pessoas × 22 dias de zeros por mês. Mas a linha que JÁ EXISTE
   * é reescrita para zero, e é esse o caminho que cura os saldos
   * errados que já estão gravados.
   *
   * REESCRITA, E NÃO APAGADA. Apagar exigiria dar permissão de
   * remoção à própria pessoa, e aí bastaria apagar a linha para um
   * débito sumir. Reescrever tira da fila, preserva o histórico e não
   * abre nada.
   */
  if (diferenca === 0) {
    /**
     * DIA JÁ DECIDIDO TAMBÉM PRECISA SER REESCRITO QUANDO A BATIDA MUDA.
     *
     * Era só `estado === 'pendente'`. O efeito foi o saldo da Lyvia: o
     * dia fechou com débito enquanto a jornada dela ainda era lida como
     * 8h10, o débito foi decidido, e depois a batida foi corrigida. A
     * diferença virou zero — e o débito velho continuou no saldo dela,
     * porque esta linha não o alcançava.
     *
     * O dia mudou; a conta do dia tem de mudar junto. Quem já decidiu
     * decidiu sobre outro dia, que não existe mais.
     */
    const precisaReescrever =
      existente && (existente.estado === 'pendente' || !!opcoes.corrigidoPor);

    if (precisaReescrever) {
      return {
        acao: 'gravar',
        reescrita: true,
        entrouNaFila: false,
        ajuste: {
        ...existente!,
        minutos: 0,
        minutosTrabalhados: jornada.minutosTrabalhados,
        minutosPrevistos: jornada.minutosPrevistos,
        estado: 'aprovado',
        origem: opcoes.corrigidoPor ? 'correcao_manual' : 'tolerancia_automatica',
        aprovadorId: opcoes.corrigidoPor?.id,
        aprovadorNome: opcoes.corrigidoPor?.nome || 'Tolerância automática',
        decididoEm: opcoes.agora,
        },
      };
    }
    return { acao: 'nada' };
  }

  /**
   * Já decidido: não reabre sozinho.
   *
   * A exceção é a correção manual. O comentário aqui dizia "quem corrige
   * marcação depois da decisão é o RH, e aí a decisão é dele" — mas o
   * código voltava antes de refazer conta nenhuma, e a decisão do RH não
   * chegava a lugar nenhum. O saldo seguia com o número de antes da
   * correção, sem nada na tela dizendo isso.
   */
  if (existente && existente.estado !== 'pendente' && !opcoes.corrigidoPor) {
    return { acao: 'nada' };
  }

  /**
   * DAQUI PARA BAIXO, O DIA ESTOUROU A TOLERÂNCIA.
   *
   * E aí ele vira pendência com o valor CHEIO — não se desconta a
   * tolerância do excedente. É tudo-ou-nada por dia, como manda o art.
   * 58 §1º: ou a variação é desprezível, ou o dia é extraordinário.
   *
   * A tolerância foi conferida lá em cima, junto com a diferença zero,
   * porque as duas terminam no mesmo lugar: nada a lançar. Estava aqui
   * embaixo, decidindo só o ESTADO do ajuste — e era por isso que o
   * valor cheio entrava no saldo com carimbo automático.
   *
   * Sem a tolerância, qualquer minuto viraria fila: ~1.800 aprovações
   * por mês numa rede de 85 pessoas que batem ponto. Fila desse
   * tamanho vira carimbo, e aprovação que vira carimbo não controla
   * nada.
   */
  const agora = opcoes.agora;

  const ajuste: AjusteJornada = {
    id: existente?.id || opcoes.novoId(),
    colaboradorId,
    data,
    tipo: diferenca > 0 ? 'hora_extra' : 'debito',
    minutos: Math.abs(diferenca),
    minutosTrabalhados: jornada.minutosTrabalhados,
    minutosPrevistos: jornada.minutosPrevistos,
    /**
     * QUEM CORRIGE A BATIDA JÁ DECIDIU O DIA.
     *
     * Era sempre `pendente` fora da tolerância, viesse de onde viesse.
     * O Elias corrigiu o espelho pelo RH e o sistema mandou o resultado
     * para o líder do setor aprovar — pedindo carimbo de terceiro sobre
     * o horário que o RH acabou de afirmar.
     *
     * Além de inverter a hierarquia, isso enche a fila de quem não tem
     * o que julgar ali: o líder não sabe por que o RH mudou a batida, e
     * a única informação que ele teria é a justificativa que o RH já
     * escreveu.
     *
     * A autoridade foi conferida em `ajustarMarcacao`, que é quem
     * preenche `opcoes.corrigidoPor`. Batida normal não passa por aqui.
     */
    /**
     * A TOLERÂNCIA NÃO APARECE MAIS AQUI, e a ausência dela é o
     * conserto: quem cabe na tolerância volta lá em cima, sem lançar
     * nada. O que chega neste ponto estourou o limite, e só tem dois
     * destinos — a fila de quem decide, ou o carimbo de quem corrigiu
     * a batida.
     */
    estado: opcoes.corrigidoPor ? 'aprovado' : 'pendente',
    origem: opcoes.corrigidoPor ? 'correcao_manual' : 'pendencia',
    aprovadorId: opcoes.corrigidoPor?.id,
    aprovadorNome: opcoes.corrigidoPor?.nome,
    decididoEm: opcoes.corrigidoPor ? agora : undefined,
    motivoColaborador: opcoes.motivo || existente?.motivoColaborador,
    anexoCaminho: opcoes.anexoCaminho || existente?.anexoCaminho,
    criadoEm: existente?.criadoEm || agora,
  };

  return {
    acao: 'gravar',
    reescrita: false,
    ajuste,
    entrouNaFila: ajuste.estado === 'pendente' && existente?.estado !== 'pendente',
  };
};

/**
 * O QUE UM DIA PASSADO PEDE AO LEVANTAMENTO — a decisão, sem gravar.
 *
 * Era o miolo de `levantarDiasIncompletos`. Saiu para o servidor revisar
 * os dias com a MESMA regra, toda madrugada, sem depender de alguém abrir
 * a fila.
 *
 *   'nada'       — dia que não é de jornada, abonado, já tratado ou pela
 *                  metade (esse vai para "Pontos incompletos", não para a fila)
 *   'reapurar'   — o dia fechou e ainda tem um pedido de "dia sem fechar"
 *                  pendente: apurado de novo, ele sai da fila ou vira o
 *                  valor de verdade
 *   'criarFalta' — dia útil sem batida nenhuma: vai para a fila do líder
 */
export type DecisaoDoLevantamento =
  | { acao: 'nada' }
  | { acao: 'reapurar' }
  | { acao: 'criarFalta'; ajuste: AjusteJornada };

export const decidirLevantamento = (
  pessoa: Colaborador,
  data: string,
  /** O instante da decisão, em ISO. */
  agora: string
): DecisaoDoLevantamento => {
  if (data >= fonte.hoje()) return { acao: 'nada' };

  const esperadas = marcacoesEsperadas(data, pessoa);
  const jornada = jornadaDoDia(pessoa.id, data);
  const batidas = Object.keys(jornada.marcacoes).length;
  // Conta as ESPERADAS, nao quaisquer: no sabado, uma entrada mais
  // uma saida de almoco sao duas batidas e nenhuma delas fecha o dia
  const feitas = esperadas.filter((t) => !!jornada.marcacoes[t]).length;

  // Domingo não tem jornada; dia fechado não é problema
  if (ehDiaDeFolga(data)) return { acao: 'nada' };
  // Dia abonado não é dia pela metade: já foi decidido por outra via
  if (fonte.situacaoDoDia(pessoa.id, data) !== 'normal') return { acao: 'nada' };
  // Sem batida esperada o dia não é dela — sábado de quem não vem
  if (esperadas.length === 0) return { acao: 'nada' };
  /*
    A FALTA ENTRA NA MESMA FILA. O comentário daqui dizia que "falta
    tem caminho próprio" — e o caminho nunca existiu: o dia sem batida
    passava em branco. A decisão é a mesma do dia pela metade: abonar
    (zero) ou contar o débito da jornada. Só a partir de 01/10/2026
    (`ehFalta`).
  */
  const existente = fonte.ajusteDoDia(pessoa.id, data);
  const fechou = batidas > 0 && feitas >= esperadas.length;

  /*
    O PEDIDO QUE O DIA JÁ RESOLVEU SAI DA FILA.

    O "dia sem fechar" era criado e nunca mais revisto: a batida que
    chegava depois ao aparelho, ou a correção lançada por outro
    caminho, fechava o dia — e o pedido ficava lá, pedindo decisão
    sobre um dia com as quatro batidas (Fernanda e Aline, 30/09).
    A cada revisão, o dia que fechou é apurado de novo: dentro da
    tolerância sai da fila; fora dela, vira hora extra ou débito com o
    valor de verdade.
  */
  if (fechou) {
    return existente?.tipo === 'dia_incompleto' && existente.estado === 'pendente'
      ? { acao: 'reapurar' }
      : { acao: 'nada' };
  }

  /*
    Só a FALTA vira pedido. O dia pela metade (batidas > 0) não entra
    na fila: aparece em "Pontos incompletos" (`obterPontosIncompletos`),
    que lê as batidas na hora e some sozinho quando a batida é lançada.
  */
  if (!jornada.falta) return { acao: 'nada' };

  // Já levantado, decidido ou coberto por ausência aprovada: não repete
  if (existente) return { acao: 'nada' };

  return {
    acao: 'criarFalta',
    ajuste: {
      id: `inc-${pessoa.id}-${data}`,
      colaboradorId: pessoa.id,
      data,
      tipo: 'dia_incompleto',
      // Guarda a jornada prevista: é o débito que o dia vira se o
      // responsável decidir que ele não foi trabalhado
      minutos: jornada.minutosPrevistos,
      minutosTrabalhados: jornada.minutosTrabalhados,
      minutosPrevistos: jornada.minutosPrevistos,
      estado: 'pendente',
      origem: 'pendencia',
      criadoEm: agora,
    },
  };
};
