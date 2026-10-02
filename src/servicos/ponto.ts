/**
 * Banco de Horas e Registro de Ponto do CONECTA — Malachias Autopeças
 *
 * O funcionário comprova a marcação lendo o QR afixado na sua loja (ou digitando
 * o código impresso embaixo dele, quando a câmera falha). O sistema decide
 * sozinho qual das quatro marcações do dia está sendo batida, então para o
 * funcionário é sempre um toque só.
 *
 * Nenhuma marcação é apagada: correções do RH entram como novo valor no mesmo
 * registro, sempre com justificativa e autoria.
 *
 * O BANCO DE HORAS É DA PESSOA, NÃO DO APARELHO. No modo rede as marcações
 * vivem no banco: quem bate a entrada no celular e a saída no computador tem
 * um único dia de trabalho, não dois. O armazenamento do navegador segue
 * servindo de cache para a leitura ser instantânea, mas quem decide é o banco
 * — inclusive recusando a batida repetida do mesmo passo, pela restrição
 * `unique (colaborador_id, data, tipo)`.
 */

import {
  TOLERANCIA_PONTO_PADRAO_MINUTOS,
  TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS,
  TOLERANCIA_INTERVALO_PADRAO_MINUTOS,
  TURNO_SABADO,
  MINUTOS_SABADO,
  minutosDoTurno,
  turnoDe,
  Turno,
  minutosPausaDoTurno,
  minutosDeIntervaloDe,
  HORARIO_ENTRADA_PADRAO,
  INTERVALO_ALMOCO_PADRAO_MINUTOS,
  Colaborador,
  CodigoPontoLoja,
  JornadaDia,
  Loja,
  MetodoMarcacao,
  RegistroPonto,
  ResumoPontoColaborador,
  TipoMarcacao,
  ORDEM_MARCACOES,
  ehMarcacaoCorrigida,
  ROTULO_MARCACAO,
  CARGA_HORARIA_PADRAO_MINUTOS,
  NIVEL_TI,
  NIVEL_GERENTE,
  NIVEL_LIDER_SETOR,
  cuidaDePessoas,
  AjusteJornada,
  EstadoAjuste,
  ROTULO_TIPO_AJUSTE,
  minutosComSinal,
  INICIO_DA_COBRANCA_DE_FALTAS,
  trabalhaNoSabado,
  temIntervaloNoDia,
  cargaSemanalDe,
  minutosDeDiaUtilDe,
  compensacaoDoSabadoDe,
  ROTULO_SITUACAO,
  CompensacaoDoMes,
} from '../tipos';
import { bancoDados } from './bancoDados';
import { podeUsar } from './permissoes';
/**
 * Importado com outro nome porque `agora` já é usado como nome de
 * variável local em vários pontos deste arquivo — e um `const agora`
 * dentro de uma função esconderia silenciosamente a função importada,
 * fazendo aquele trecho voltar a usar o relógio do aparelho sem que nada
 * acusasse.
 */
import { agora as agoraSincronizado } from './relogio';
import { linhasDeIdentificacao, contatoEmLinha } from './fichaColaborador';
import { temAlcadaSobre, regraAutomaticaDeAlcada, deveSerAvisadoSobre } from './organograma';
import { aplicarTolerancia, auditarDia } from './toleranciaDoPonto';
import {
  avisarPedidoDePonto,
  avisarDecisaoDePonto,
  quemAcompanha,
  textoDaDecisao,
} from './avisosDePonto';
// A FOLHA, nunca o serviço: importar `justificativas` daqui refecharia o
// ciclo que já derrubou o aplicativo uma vez
import { situacaoDoDia } from './justificativasCache';
import { feriadoEm } from './feriadosCache';
import { montarDocumento } from './documento';
import { nuvem } from './nuvem';
import { fecharCompensacao, mesAnterior, CHAVE_COMPENSACAO } from './compensacaoDoSabado';
import { usandoNuvem } from './supabase';
import { lerLista } from './cacheDeLeitura';
/**
 * As regras do dia moram em `apuracaoDoDia`, para o servidor apurar com as
 * mesmas. As de data continuam exportadas daqui: são dezenas de telas
 * importando de `ponto`.
 */
import {
  usarFonteDaApuracao,
  paraDataLocal,
  deDataLocal,
  ehDiaDeFolga,
  ehSabado,
  marcacoesEsperadas,
  cargaPrevistaEmMinutos,
  horariosEsperadosDoDia,
  jornadaDoDia,
  ehFalta,
  decidirApuracao,
  decidirLevantamento,
  listarDatasDoPeriodo,
  compensacaoEsperadaDoDia,
} from './apuracaoDoDia';
export { paraDataLocal, deDataLocal, ehDiaDeFolga, ehSabado, marcacoesEsperadas, listarDatasDoPeriodo };

const CHAVE_REGISTROS_PONTO = 'conecta_v4_registros_ponto';
const CHAVE_CODIGOS_PONTO = 'conecta_v4_codigos_ponto_loja';
const CHAVE_AJUSTES = 'conecta_v4_ajustes_jornada';
/** Rascunho do motivo entre a batida do meio do dia e o fechamento. */
const CHAVE_JUSTIFICATIVA_DO_DIA = 'conecta_v4_justificativa_do_dia';

/** Lojas físicas que possuem QR de ponto ('Rede' é agrupador, não tem ponto). */
export const LOJAS_COM_PONTO: Loja[] = [
  'Pirassununga',
  'Porto Ferreira',
  'Palmeiras',
  'Descalvado',
  'Santa Rita',
];

/** Prefixo do conteúdo do QR, para não confundir com outros códigos. */
const PREFIXO_QR = 'CONECTA-PONTO';

// --- Utilidades de data e hora (fuso local, sem depender de UTC) ---

/** AAAA-MM-DD de hoje. */
/**
 * A DATA DE HOJE VEM DO RELÓGIO SINCRONIZADO, e não do aparelho.
 *
 * Antes saía de `new Date()`. Num celular de balcão — compartilhado, com
 * bateria velha e o relógio a três toques de qualquer um — isso queria
 * dizer que a batida valia o que o aparelho achasse que eram as horas.
 *
 * `agora()` devolve o relógio do aparelho corrigido pelo desvio medido
 * contra o servidor. Sem rede ele cai no aparelho e AVISA que caiu, em
 * vez de fingir precisão que não tem.
 */
export const dataDeHoje = (): string => paraDataLocal(agoraSincronizado());

/** "2026-09-14" -> "14/09/2026" */
export const formatarDataBR = (data: string): string => {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
};

/**
 * O ajuste em uma linha: "Hora extra de 1h20 em 28/09/2026". É o texto do
 * aviso do pedido e o da decisão — os dois falam do mesmo dia com as
 * mesmas palavras.
 */
export const descreverAjuste = (
  ajuste: {
    tipo: keyof typeof ROTULO_TIPO_AJUSTE;
    minutos: number;
    data: string;
  },
  // O nome pela causa ("Atraso na entrada"), quando quem chama a conhece
  rotulo: string = ROTULO_TIPO_AJUSTE[ajuste.tipo]
): string => `${rotulo} de ${formatarMinutos(ajuste.minutos)} em ${formatarDataBR(ajuste.data)}`;

/** "seg, 14/09" — rótulo curto para listas. */
export const formatarDiaCurto = (data: string): string => {
  const d = deDataLocal(data);
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const [, mes, dia] = data.split('-');
  return `${semana}, ${dia}/${mes}`;
};

/**
 * O DIA ACEITA HORÁRIO? No domingo, não.
 *
 * Decisão do Elias: o domingo aparece no espelho escrito "Domingo", "sem
 * a possibilidade de registrar hora". Antes o domingo trabalhado podia
 * ser batido e lançado como hora extra. A regra mora aqui, e a batida, a
 * correção do RH/líder e a tela do Banco de Horas perguntam a ela — trava
 * só na tela se contorna.
 */
export const aceitaMarcacaoNoDia = (data: string): boolean => !ehDiaDeFolga(data);

export const RECUSA_DE_DOMINGO = 'Domingo não tem jornada: o ponto não registra horário no domingo.';

/**
 * O QUE ESCREVER NUMA CÉLULA QUE O DIA NÃO ESPERA.
 *
 * Devolve `null` quando a marcação é esperada — aí vale o horário, ou o
 * `--:--` de quem não bateu.
 *
 * Existe porque `--:--` tem UM significado só: "deveria ter batido e não
 * bateu". No sábado o almoço não existe — a loja abre às 8 e fecha ao
 * meio-dia, direto — e imprimir `--:--` ali fazia o espelho acusar duas
 * batidas esquecidas em todo sábado do mês. Num documento de ponto isso
 * não é detalhe de layout.
 *
 * Num lugar só porque a tela e o papel precisam dizer a MESMA coisa. Já
 * houve um caso neste sistema em que os dois divergiram.
 */
export const motivoSemMarcacao = (
  data: string,
  tipo: TipoMarcacao,
  colaborador?: Colaborador
): string | null => {
  if (marcacoesEsperadas(data, colaborador).includes(tipo)) return null;

  /**
   * A FOLGA APARECE NO ESPELHO, com o nome dela.
   *
   * Vem ANTES do feriado e do sábado de propósito: a folga de sábado é
   * um sábado, e escrever "Sábado" ali diria a metade errada da
   * verdade — o dia não foi um sábado comum, foi o direito mensal da
   * pessoa, e é isso que o holerite precisa mostrar.
   *
   * Atestado, férias e falta justificada saem pelo mesmo caminho, com
   * o rótulo de cada um.
   */
  if (colaborador) {
    const situacao = situacaoDoDia(colaborador.id, data);
    if (situacao !== 'normal') return ROTULO_SITUACAO[situacao];
  }

  const feriado = feriadoEm(data, colaborador?.loja);
  if (feriado) return feriado.nome;

  if (ehDiaDeFolga(data)) return 'Domingo';
  if (ehSabado(data)) return 'Sábado';

  // Sobra quem não tem intervalo: estágio, nas colunas do almoço
  return 'Sem intervalo';
};

/**
 * ===================================================================
 * A LINHA DO ESPELHO — uma montagem para o papel e para a tela
 * ===================================================================
 *
 * O Elias perguntou por que o espelho impresso não batia com o do painel.
 * Os números vinham da mesma conta, mas cada um montava a sua grade: o
 * papel tinha Previsto, Trabalhado, Relógio e Saldo; a tela, "Total" e
 * Saldo. O mesmo dia, lido lado a lado, parecia discordar — "8h13 · 0h00"
 * numa, "+0h03 · 0h00" na outra.
 *
 * Agora as duas desenham a partir DESTA linha. O que muda entre elas é só
 * o que é próprio de cada uma: a tela deixa clicar e mostra a origem; o
 * papel tem assinatura.
 */
export interface CelulaDoEspelho {
  tipo: TipoMarcacao;
  registro?: RegistroPonto;
  /** Por que está vazia, quando o dia não espera esta batida. */
  motivo: string | null;
}

/** Um dia que começou e não fechou: quem, quando, e o que falta. */
export interface PontoIncompleto {
  colaborador: Colaborador;
  data: string;
  /** Quantas das batidas esperadas a pessoa fez. */
  feitas: number;
  esperadas: number;
  faltam: TipoMarcacao[];
  /** Os horários das batidas feitas — "08:21". A tela mostra sem depender do cache. */
  horas: Partial<Record<TipoMarcacao, string>>;
}

/**
 * A PESSOA BATE PONTO?
 *
 * Da gerência para cima não se bate (decisão do Elias). A resposta é a da
 * ferramenta "Meu ponto" no painel de Permissões — a mesma que mostra ou
 * esconde a aba Ponto —, e não um nível escrito aqui: ligar a ferramenta
 * para alguém devolve a ele o ponto inteiro, e não só a aba.
 *
 * Quem não bate não tem espelho, banco de horas, falta, dia incompleto
 * nem "sem bater hoje". Gerenciar o ponto DOS OUTROS não passa por aqui.
 */
export const batePonto = (c: Colaborador): boolean => podeUsar('ponto', c);

/**
 * O ESPELHO INCOMPLETO DE UMA PESSOA: os dias que começaram e não fecharam
 * e os dias de trabalho que ficaram sem batida nenhuma. Os dois impedem o
 * espelho de fechar. O Elias viu "1 dia" para quem bateu uma vez em
 * setembro: os outros 28 dias vazios não entravam na conta.
 */
export interface EspelhoIncompleto {
  colaborador: Colaborador;
  semFechar: PontoIncompleto[];
  /** Dias de trabalho, já passados, sem batida nenhuma. */
  semBatida: string[];
  total: number;
  /** O dia incompleto mais recente: é o mês que o espelho abre. */
  maisRecente: string;
}

/** Um dia com as batidas que teve, venha do banco ou do aparelho. */
interface DiaComBatidas {
  colaboradorId: string;
  data: string;
  tipos: TipoMarcacao[];
  horas: string[];
}

/**
 * A frase específica, como o Elias pediu: "Yan Geremias Ferrari bateu 2 de
 * 4 — não fechou o dia". Uma batida feita é "bateu 1".
 */
export const descreverPontoIncompleto = (p: PontoIncompleto): string =>
  `${p.colaborador.nome} bateu ${p.feitas} de ${p.esperadas} — não fechou o dia`;

/** "Faltam: retorno do almoço e saída" */
export const descreverBatidasQueFaltam = (faltam: TipoMarcacao[]): string => {
  const nomes = faltam.map((t) => ROTULO_MARCACAO[t].toLowerCase());
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `${nomes.length === 1 ? 'Falta' : 'Faltam'}: ${lista}`;
};

export interface LinhaDoEspelho {
  data: string;
  /** "Seg", "Ter"... sempre: o nome do feriado vai nas marcações. */
  semana: string;
  /**
   * Domingo, feriado, folga, atestado: quando as quatro marcações dizem o
   * mesmo nome, ele aparece uma vez, ocupando as quatro.
   */
  diaSemJornada: string | null;
  celulas: CelulaDoEspelho[];
  semMarcacao: boolean;
  previsto: number;
  trabalhado: number;
  /** Trabalhado − previsto, como o relógio marcou. Nulo sem jornada fechada. */
  relogio: number | null;
  /** O que vale para o banco de horas, com a tolerância. Nulo sem jornada. */
  saldo: number | null;
  /** Dia sem batida que previa jornada: o relógio diz "Falta" e o saldo, o débito. */
  falta: boolean;
}

export const linhaDoEspelho = (j: JornadaDia, colaborador?: Colaborador): LinhaDoEspelho => {
  const celulas = ORDEM_MARCACOES.map((tipo) => ({
    tipo,
    registro: j.marcacoes[tipo],
    motivo: j.marcacoes[tipo] ? null : motivoSemMarcacao(j.data, tipo, colaborador),
  }));
  const primeiro = celulas[0].motivo;
  const semJornada = j.minutosTrabalhados === 0;

  return {
    data: j.data,
    semana: formatarDiaCurto(j.data).split(',')[0],
    diaSemJornada: celulas.every((c) => !!c.motivo && c.motivo === primeiro) ? primeiro : null,
    celulas,
    semMarcacao: Object.keys(j.marcacoes).length === 0,
    previsto: j.minutosPrevistosEfetivos,
    trabalhado: j.minutosTrabalhados,
    relogio: semJornada ? null : j.saldoBrutoMinutos,
    // A falta tem saldo sem ter jornada: é exatamente o que ela é
    saldo: semJornada && !j.falta ? null : j.saldoMinutos,
    falta: j.falta,
  };
};

export interface TotaisDoEspelho {
  trabalhado: number;
  /** O previsto dos dias com jornada fechada: é o que faz trabalhado − previsto = relógio. */
  previsto: number;
  relogio: number;
  /** O que a tolerância tirou do relógio. */
  tolerancia: number;
  saldoPeriodo: number;
  saldoAcumulado: number;
  /** O que as faltas tiraram do período (negativo), já com o que o líder decidiu. */
  faltas: number;
  /** Dias de trabalho em branco que não viraram falta: fora da conta. */
  diasSemBatida: number;
  /** O previsto desses dias — o tamanho do buraco que o saldo não enxerga. */
  previstoSemBatida: number;
  /** Dias que começaram e não fecharam. */
  diasSemFechar: number;
  /** A compensação do sábado juntada (10 min por dia útil fechado). Está DENTRO do relógio. */
  compensacao: number;
  /** Quantos dias renderam compensação. */
  diasComCompensacao: number;
  /** O saldo de compensação que veio do mês anterior. */
  compensacaoAnterior: number;
  /** O que as folgas de sábado consumiram da compensação: até 4h cada, nunca além dela. */
  folgaConsumida: number;
  /** O saldo de compensação que segue para o mês seguinte. */
  compensacaoSegue: number;
}

/**
 * O RODAPÉ FECHA A CONTA, e as linhas dele saem das colunas.
 *
 *   trabalhado − previsto = relógio
 *   relógio − tolerância + faltas − folga consumida = saldo do período
 *
 * O "total previsto" contava os dias ainda não trabalhados do mês ao lado
 * de um trabalhado que só tinha os fechados — a subtração não dava o
 * relógio, e ninguém conseguia conferir o papel com uma calculadora.
 *
 * A COMPENSAÇÃO DO SÁBADO (01/10/2026): o previsto do dia útil passou a ser
 * as 8h da CLT, e os 10 minutos do turno viraram crédito que a folga de
 * sábado consome (`JORNADA_CLT_DIA_UTIL`). Eles ficam no relógio — é o que
 * a pessoa trabalhou além das 8h — e a folga os consome, até as 4h dela.
 * Quem cumpriu o horário e tirou a folga fecha em zero.
 */
export const totaisDoEspelho = (resumo: ResumoPontoColaborador): TotaisDoEspelho => {
  const fechados = resumo.jornadas.filter((j) => j.minutosTrabalhados > 0);
  const relogio = fechados.reduce((s, j) => s + j.saldoBrutoMinutos, 0);
  // As faltas ficam FORA do relógio e da tolerância, numa linha própria:
  // senão "trabalhado − previsto = relógio" deixaria de fechar no papel
  const faltas = resumo.jornadas.filter((j) => j.falta).reduce((s, j) => s + j.saldoMinutos, 0);
  const compensacao = resumo.compensacaoMinutos;
  /*
    A COMPENSAÇÃO É UM SALDO PRÓPRIO, que passa de um mês ao outro — a
    Fernanda trocou a folga de setembro por uma em outubro, e as 3h30 de
    setembro pagam a de outubro. A folga consome o que veio mais o que
    juntou, até 4h, e nunca deixa devendo (`fecharCompensacao`).
  */
  const fechamento = fecharCompensacao(resumo.compensacaoAnteriorMinutos, compensacao, resumo.folgasDeSabado);
  return {
    trabalhado: fechados.reduce((s, j) => s + j.minutosTrabalhados, 0),
    previsto: fechados.reduce((s, j) => s + j.minutosPrevistosEfetivos, 0),
    relogio,
    // A compensação está no relógio e não é variação: não entra na tolerância
    tolerancia: relogio - compensacao + faltas - resumo.saldoPeriodoMinutos,
    // O saldo do período é o do BANCO DE HORAS: só as variações. A
    // compensação segue no saldo dela, mais abaixo
    saldoPeriodo: resumo.saldoPeriodoMinutos,
    compensacao,
    diasComCompensacao: resumo.jornadas.filter((j) => j.compensacaoMinutos > 0).length,
    compensacaoAnterior: resumo.compensacaoAnteriorMinutos,
    folgaConsumida: fechamento.consumida,
    compensacaoSegue: fechamento.saldoFinal,
    saldoAcumulado: resumo.saldoAcumuladoMinutos,
    faltas,
    diasSemBatida: resumo.diasSemBatidaForaDaConta.length,
    previstoSemBatida: resumo.jornadas
      .filter((j) => resumo.diasSemBatidaForaDaConta.includes(j.data))
      .reduce((s, j) => s + j.minutosPrevistosEfetivos, 0),
    diasSemFechar: resumo.diasComPendencia,
  };
};

export interface LinhaDoRodape {
  rotulo: string;
  minutos: number;
  comSinal: boolean;
  destaque: boolean;
  /** Linha que avisa: o espelho está incompleto. A tela e o papel a pintam de âmbar. */
  alerta: boolean;
  /** Quando o valor não é hora — "2 dias". */
  texto?: string;
}

/** O espelho tem dia em branco ou dia que não fechou: o saldo não é final. */
export const espelhoIncompleto = (t: TotaisDoEspelho): boolean => t.diasSemBatida > 0 || t.diasSemFechar > 0;

/**
 * AS LINHAS DO RODAPÉ, na ordem e com os nomes que o papel e a tela
 * mostram. Uma lista só: a tela não pode chamar de "Saldo" o que o papel
 * chama de "Relógio".
 *
 * O ESPELHO INCOMPLETO NÃO SE PASSA POR CERTO. O Elias abriu um espelho de
 * setembro com seis dias úteis em branco e o rodapé dizia "Saldo 0h00", em
 * verde: a conta só olhava os dias fechados, e os vazios (de antes da
 * cobrança de falta) não apareciam em lugar nenhum. Agora eles têm linha
 * própria, com o previsto que ficou de fora, e o saldo se declara
 * provisório até o espelho ser acertado.
 */
export const linhasDoRodape = (t: TotaisDoEspelho): LinhaDoRodape[] => {
  const incompleto = espelhoIncompleto(t);
  const linha = (rotulo: string, minutos: number, comSinal: boolean, destaque = false): LinhaDoRodape => ({
    rotulo,
    minutos,
    comSinal,
    destaque,
    alerta: false,
  });
  const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  // Quem não tem o combinado (estágio, jornada própria) não vê linha nenhuma dele
  const comCompensacao = t.compensacao > 0 || t.compensacaoAnterior > 0 || t.folgaConsumida > 0;
  return [
    linha('Total trabalhado (dias com jornada fechada)', t.trabalhado, false),
    linha(
      comCompensacao
        ? 'Total previsto (dias com jornada fechada · 8h por dia útil, CLT)'
        : 'Total previsto (dias com jornada fechada)',
      t.previsto,
      false
    ),
    linha('Relógio do período (trabalhado − previsto)', t.relogio, true),
    ...(t.compensacao > 0
      ? [
          linha(
            `   dos quais, compensação do sábado (10 min × ${dias(t.diasComCompensacao)}) — vai para o saldo dela`,
            t.compensacao,
            true
          ),
        ]
      : []),
    linha('Tolerância aplicada (pequenas variações que não contam)', t.tolerancia, true),
    // Só aparece quando há falta: os espelhos de antes de 01/10/2026 não mudam
    ...(t.faltas !== 0 ? [linha('Faltas (dias sem batida)', t.faltas, true)] : []),

    ...(t.diasSemBatida > 0
      ? [
          {
            ...linha(`Dias sem batida, fora da conta (${dias(t.diasSemBatida)}) — previsto não cumprido`, t.previstoSemBatida, false),
            alerta: true,
          },
        ]
      : []),
    ...(t.diasSemFechar > 0
      ? [{ ...linha('Dias que não fecharam (faltam batidas)', 0, false), alerta: true, texto: dias(t.diasSemFechar) }]
      : []),
    {
      ...linha(
        `Saldo do período (relógio − ${t.compensacao > 0 ? 'compensação − ' : ''}tolerância${
          t.faltas !== 0 ? ' + faltas' : ''
        })${incompleto ? ' — provisório: espelho incompleto' : ''}`,
        t.saldoPeriodo,
        true,
        true
      ),
      alerta: incompleto,
    },
    linha('Saldo acumulado no banco de horas', t.saldoAcumulado, true, true),
    // O SALDO DE COMPENSAÇÃO DO SÁBADO, à parte: o que veio, o que juntou, o
    // que a folga consumiu e o que segue para o mês seguinte
    ...(comCompensacao
      ? [
          ...(t.compensacaoAnterior > 0
            ? [linha('Compensação do sábado vinda do mês anterior', t.compensacaoAnterior, true)]
            : []),
          ...(t.compensacao > 0 ? [linha('Compensação do sábado juntada no período', t.compensacao, true)] : []),
          ...(t.folgaConsumida > 0
            ? [linha('Folga de sábado (consome a compensação, até 4h)', -t.folgaConsumida, true)]
            : []),
          linha('Compensação do sábado que segue para o mês seguinte', t.compensacaoSegue, true, true),
        ]
      : []),
  ];
};

/** 95 -> "1h35"; -95 -> "-1h35"; 0 -> "0h00" */
export const formatarMinutos = (minutos: number): string => {
  const sinal = minutos < 0 ? '-' : '';
  const absoluto = Math.abs(Math.round(minutos));
  const horas = Math.floor(absoluto / 60);
  const resto = absoluto % 60;
  return `${sinal}${horas}h${String(resto).padStart(2, '0')}`;
};

/** Saldo com sinal explícito, como se lê num extrato: "+2h10" / "-0h45". */
export const formatarSaldo = (minutos: number): string => {
  const arredondado = Math.round(minutos);
  if (arredondado === 0) return '0h00';
  return arredondado > 0 ? `+${formatarMinutos(arredondado)}` : formatarMinutos(arredondado);
};

/**
 * O CICLO DE SÁBADO A SEXTA que contém esta data.
 *
 * É o ciclo da casa, e não uma semana de calendário. Eu havia feito de
 * segunda a domingo por conta própria, argumentando que assim o sábado
 * caía no fim — e estava errado: quem fecha o ciclo é a SEXTA, e o sábado
 * ABRE o seguinte.
 *
 * Faz sentido justamente por causa da conferência: quando o líder senta no
 * sábado para olhar o banco de horas, o ciclo que ele confere terminou na
 * véspera. Com o sábado no fim, ele estaria conferindo um ciclo que ainda
 * não acabou — o dia dele mesmo.
 */
export const semanaDe = (data: string): { inicio: string; fim: string } => {
  const referencia = deDataLocal(data);
  // getDay: 0 = domingo, 6 = sábado. O sábado é o primeiro dia do ciclo,
  // então ele recua zero e os outros recuam até chegar nele
  const diaDaSemana = referencia.getDay();
  const recuo = (diaDaSemana + 1) % 7;

  const inicio = new Date(referencia);
  inicio.setDate(inicio.getDate() - recuo);

  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);

  return { inicio: paraDataLocal(inicio), fim: paraDataLocal(fim) };
};


/** Primeiro dia do mês corrente. */
export const primeiroDiaDoMes = (referencia: Date = new Date()): string =>
  paraDataLocal(new Date(referencia.getFullYear(), referencia.getMonth(), 1));

const gerarCodigoAleatorio = (): string => {
  // Sem 0/O e 1/I para não gerar dúvida na hora de digitar da placa impressa
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 6; i++) {
    codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return codigo;
};

class ServicoPonto {
  private ouvintes: Array<() => void> = [];

  constructor() {
    // Quando o banco traz mudança de outro aparelho, as telas de ponto
    // precisam saber junto com o resto do sistema.
    if (usandoNuvem()) {
      nuvem.assinarAtualizacoes(() => this.notificar());
    }
  }

  /** Assina mudanças no ponto (marcações e códigos de loja). */
  assinarAlteracoes(ouvinte: () => void): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      this.ouvintes = this.ouvintes.filter((o) => o !== ouvinte);
    };
  }

  private notificar(): void {
    this.ouvintes.forEach((ouvinte) => ouvinte());
  }

  // --- CÓDIGOS DE PONTO DAS LOJAS ---

  private lerCodigos(): CodigoPontoLoja[] {
    try {
      const bruto = localStorage.getItem(CHAVE_CODIGOS_PONTO);
      const lista = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }

  private gravarCodigos(codigos: CodigoPontoLoja[]): void {
    localStorage.setItem(CHAVE_CODIGOS_PONTO, JSON.stringify(codigos));
  }

  /**
   * Código da loja. No modo rede ele vive no banco e é o mesmo em todos os
   * aparelhos — devolve `null` enquanto o RH não tiver publicado o da loja.
   * No modo local, nasce na primeira vez que alguém precisa dele.
   */
  obterCodigoDaLoja(loja: Loja): CodigoPontoLoja | null {
    const codigos = this.lerCodigos();
    const existente = codigos.find((c) => c.loja === loja);
    if (existente) return existente;
    if (usandoNuvem()) return null;

    const novo: CodigoPontoLoja = {
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
    };
    codigos.push(novo);
    this.gravarCodigos(codigos);
    return novo;
  }

  /** Códigos das lojas. No modo rede, apenas os que o banco já publicou. */
  obterTodosCodigos(): CodigoPontoLoja[] {
    return LOJAS_COM_PONTO.map((loja) => this.obterCodigoDaLoja(loja)).filter(
      (c): c is CodigoPontoLoja => !!c
    );
  }

  /**
   * Publica no banco o código das lojas que ainda não têm um. Só RH e
   * Administrador conseguem — para os demais a RLS recusa, e é justamente
   * isso que impede o código do cartaz de ser inventado no aparelho de quem
   * bate o ponto.
   */
  async garantirCodigosDasLojas(): Promise<void> {
    if (!usandoNuvem()) {
      this.obterTodosCodigos();
      return;
    }

    const publicados = this.lerCodigos();
    const eu = bancoDados.obterColaboradorAtual();
    const faltando: CodigoPontoLoja[] = LOJAS_COM_PONTO.filter(
      // Só as lojas de quem cuida do cartaz: o gerente não enxerga o código
      // das outras (ponto-pelo-servidor.sql), e "faltando" não é "não existe"
      (loja) => this.podeCuidarDoQrDaLoja(eu, loja) && !publicados.some((c) => c.loja === loja)
    ).map((loja) => ({
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
    }));

    if (faltando.length === 0) return;
    if (await nuvem.provisionarCodigosPonto(faltando)) {
      await nuvem.sincronizarPonto();
    }
  }

  /**
   * Gera um código novo para a loja, invalidando o QR anterior. Usado quando o
   * cartaz é fotografado ou alguém passa a bater ponto de fora da loja.
   */
  async regenerarCodigoDaLoja(
    loja: Loja
  ): Promise<{ sucesso: boolean; codigo?: CodigoPontoLoja; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    if (!this.podeCuidarDoQrDaLoja(atual, loja)) {
      return {
        sucesso: false,
        erro:
          'Você só troca o cartaz da sua loja. Para outra unidade, procure o RH ou o gerente de lá.',
      };
    }

    const codigos = this.lerCodigos().filter((c) => c.loja !== loja);
    const novo: CodigoPontoLoja = {
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
      atualizadoPorNome: atual.nome,
    };
    // O banco primeiro: um código que não subiu não pode valer no cartaz
    if (usandoNuvem()) {
      const res = await nuvem.salvarCodigoPonto(novo);
      if (!res.sucesso) {
        return { sucesso: false, erro: res.erro || 'Falha ao publicar o código no banco.' };
      }
    }

    codigos.push(novo);
    this.gravarCodigos(codigos);

    bancoDados.registrarAuditoria(
      'Novo Código de Ponto',
      'seguranca',
      `${atual.nome} gerou um novo código de ponto para a loja ${loja}.`
    );
    this.notificar();
    return { sucesso: true, codigo: novo };
  }

  /** Conteúdo gravado no QR impresso da loja; null se ainda não há código. */
  /**
   * O conteúdo do cartaz: um ENDEREÇO, e não um texto solto.
   *
   * Antes o QR trazia "CONECTA-PONTO:Loja:ABC123". A câmera do celular lia
   * aquilo, mostrava o texto na tela e parava ali — a pessoa ainda tinha de
   * abrir o CONECTA na mão e procurar a aba de ponto.
   *
   * Agora é o endereço do próprio sistema com o código embutido. A câmera
   * oferece abrir; quem tem o aplicativo instalado cai direto nele, já
   * conectado, na aba de ponto. Quem não tem, cai no navegador — que é o
   * mesmo sistema.
   *
   * O endereço sai de onde o cartaz foi GERADO. Gerar o cartaz rodando o
   * sistema na própria máquina produziria um QR apontando para "localhost",
   * que não existe no celular de ninguém: por isso a tela do cartaz avisa
   * quando é esse o caso.
   */
  montarConteudoQr(loja: Loja): string | null {
    const codigo = this.obterCodigoDaLoja(loja);
    if (!codigo) return null;

    const carga = `${PREFIXO_QR}:${loja}:${codigo.codigo}`;

    if (typeof window === 'undefined') return carga;
    return `${window.location.origin}/?ponto=${encodeURIComponent(carga)}`;
  }

  /**
   * O QUE O CARTAZ DIZ, sem conferir se vale: a loja (no QR) e o código.
   * No modo rede quem confere é o banco (`bater_ponto`) — o aparelho nem
   * enxerga mais os códigos das lojas. Aqui é só a leitura do texto.
   */
  private lerConteudoDoCartaz(conteudo: string): { loja: Loja | null; codigo: string } | null {
    let limpo = conteudo.trim();
    /**
     * ENDEREÇO TAMBÉM VALE, e o texto antigo continua valendo.
     *
     * Os cartazes já impressos e pregados nas cinco lojas trazem o texto
     * solto. Trocar o formato sem aceitar o antigo faria todos eles pararem
     * de funcionar no dia da publicação, e ninguém bateria ponto até
     * reimprimir tudo.
     */
    if (/^https?:\/\//i.test(limpo)) {
      try {
        const doParametro = new URL(limpo).searchParams.get('ponto');
        if (doParametro) limpo = doParametro.trim();
      } catch {
        // Endereço ilegível: segue como se fosse código digitado
      }
    }
    if (limpo.toUpperCase().startsWith(`${PREFIXO_QR}:`)) {
      const partes = limpo.split(':');
      if (partes.length < 3) return null;
      return { loja: partes[1] as Loja, codigo: partes[2].toUpperCase() };
    }
    const digitado = limpo.toUpperCase().replace(/\s/g, '');
    return digitado ? { loja: null, codigo: digitado } : null;
  }

  /**
   * Aceita tanto o conteúdo completo do QR quanto o código de 6 caracteres
   * digitado à mão, e devolve a loja correspondente.
   */
  private resolverLojaDoCodigo(
    conteudo: string
  ): { loja: Loja; metodo: MetodoMarcacao } | null {
    const lido = this.lerConteudoDoCartaz(conteudo);
    if (!lido) return null;
    if (lido.loja) {
      const oficial = this.lerCodigos().find((c) => c.loja === lido.loja);
      if (!oficial || oficial.codigo.toUpperCase() !== lido.codigo) return null;
      return { loja: lido.loja, metodo: 'qrcode' };
    }
    const porCodigo = this.obterTodosCodigos().find((c) => c.codigo.toUpperCase() === lido.codigo);
    return porCodigo ? { loja: porCodigo.loja, metodo: 'codigo_manual' } : null;
  }

  // --- REGISTROS ---

  /**
   * Esta função é chamada 2.759 vezes para montar "Equipe & Ponto" —
   * uma por pessoa, por dia. Fazia `JSON.parse` de 3,1 MB em cada uma:
   * 32 dos 33 segundos que a tela levava para abrir.
   *
   * `lerLista` guarda o resultado e só reparseia quando o texto muda.
   */
  private lerRegistros(): RegistroPonto[] {
    return lerLista<RegistroPonto>(CHAVE_REGISTROS_PONTO);
  }

  private gravarRegistros(registros: RegistroPonto[]): void {
    localStorage.setItem(CHAVE_REGISTROS_PONTO, JSON.stringify(registros));
  }

  /** Marcações de um colaborador num dia, na ordem da jornada. */
  obterMarcacoesDoDia(colaboradorId: string, data: string): RegistroPonto[] {
    return this.lerRegistros()
      .filter((r) => r.colaboradorId === colaboradorId && r.data === data)
      .sort(
        (a, b) => ORDEM_MARCACOES.indexOf(a.tipo) - ORDEM_MARCACOES.indexOf(b.tipo)
      );
  }

  /**
   * Qual marcação vem agora para esta pessoa hoje. Devolve null quando a
   * jornada do dia já está completa.
   */
  /**
   * O próximo passo da jornada DESTE dia.
   *
   * Sábado tem duas marcações: depois da entrada vem a saída, não a saída
   * para o almoço. Percorrendo as quatro fixas, o sistema pediria ao
   * colaborador que batesse um almoço que não existe — e o dia nunca
   * fecharia.
   */
  obterProximaMarcacao(colaboradorId: string, data: string = dataDeHoje()): TipoMarcacao | null {
    // Domingo não tem próxima batida: não se registra horário nele
    if (!aceitaMarcacaoNoDia(data)) return null;

    const registradas = this.obterMarcacoesDoDia(colaboradorId, data).map((r) => r.tipo);

    /**
     * COM A PESSOA, e não só com a data. Terceira vez que esta linha
     * esquece o segundo argumento.
     *
     * O comentário acima fala de sábado, mas a regra é maior: quem não tem
     * intervalo — estágio — também bate duas vezes, em qualquer dia. Sem
     * passar a pessoa, o sistema pedia à estagiária que batesse uma saída
     * para almoço que ela não tem, e o dia dela nunca fechava.
     */
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const esperadas = marcacoesEsperadas(data, colaborador);

    /**
     * DIA QUE NÃO ESPERA NADA AINDA PODE SER TRABALHADO.
     *
     * Domingo, feriado, sábado de quem não vem no sábado: o contrato não
     * prevê jornada, mas a pessoa pode estar ali — e isso se chama hora
     * extra. Sem esta saída, quem foi trabalhar no feriado não conseguia
     * nem registrar que esteve lá.
     *
     * A sequência completa, porque um dia desses pode ter almoço como
     * qualquer outro.
     */
    const sequencia = esperadas.length > 0 ? esperadas : ORDEM_MARCACOES;

    return sequencia.find((tipo) => !registradas.includes(tipo)) || null;
  }

  /** Rótulo do próximo passo, pronto para o botão da tela. */
  obterRotuloProximaMarcacao(colaboradorId: string, data: string = dataDeHoje()): string | null {
    const proxima = this.obterProximaMarcacao(colaboradorId, data);
    return proxima ? ROTULO_MARCACAO[proxima] : null;
  }

  /**
   * Registra a marcação do usuário logado a partir do QR lido (ou do código
   * digitado). O tipo não é escolhido pelo funcionário: é sempre o próximo
   * passo pendente da jornada do dia.
   */
  async registrarMarcacaoPorCodigo(
    conteudoLido: string,
    /**
     * O que o colaborador escreveu e anexou no ato, quando a batida caiu
     * fora da janela. Viaja junto até a apuração para o aprovador não ter
     * de adivinhar o motivo depois.
     */
    justificativa?: { motivo?: string; anexoCaminho?: string }
  ): Promise<{ sucesso: boolean; registro?: RegistroPonto; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    if (!bancoDados.estaAutenticado()) {
      return { sucesso: false, erro: 'Sessão expirada. Entre novamente para bater o ponto.' };
    }
    if (!atual.ativo) {
      return { sucesso: false, erro: 'Esta conta está desativada. Procure o RH.' };
    }

    // A jornada do dia pode ter avançado em outro aparelho. Antes de decidir
    // qual é a próxima marcação, busca o que o banco já tem.
    if (usandoNuvem()) {
      await nuvem.sincronizarPonto();
    }

    const recusaDoCodigo = 'Código não reconhecido. Use o QR afixado na sua loja.';
    const lido = this.lerConteudoDoCartaz(conteudoLido);
    if (!lido) return { sucesso: false, erro: recusaDoCodigo };

    // O relógio sincronizado decide só QUAL é a próxima batida e se é
    // domingo. A hora gravada, no modo rede, é a do servidor
    const momento = agoraSincronizado();
    const data = paraDataLocal(momento);
    if (!aceitaMarcacaoNoDia(data)) return { sucesso: false, erro: RECUSA_DE_DOMINGO };
    const proxima = this.obterProximaMarcacao(atual.id, data);
    if (!proxima) {
      return {
        sucesso: false,
        erro: 'Sua jornada de hoje já está completa. Procure o RH se precisar de ajuste.',
      };
    }

    /**
     * O APARELHO SÓ MARCA. No modo rede, `bater_ponto` confere o código da
     * loja e carimba a hora e o dia com o relógio do banco: antes os dois
     * vinham prontos daqui, e o banco gravava qualquer horário que
     * chegasse — "entrada 07:30" enviada às 09:00 passava.
     */
    /**
     * O MOTIVO DO BANCO VAI PARA A TELA, como no chat.
     *
     * Este é o caminho mais crítico do sistema: alguém no balcão, com o
     * celular na mão, tentando registrar a jornada. "Verifique a conexão"
     * manda essa pessoa fazer a única coisa que não resolve — e foi assim
     * que o chat da rede ficou parado por dias com a causa escrita no
     * console de quem enviava.
     */
    const recusa = (erro?: string) => ({
      sucesso: false,
      erro: erro || 'Não foi possível gravar a marcação. Tente de novo.',
    });
    // A restrição de um registro por passo do dia vale para a pessoa, não
    // para o aparelho: é ela que impede a batida repetida vinda do celular
    // e do computador.
    const jaRegistrada = async () => {
      await nuvem.sincronizarPonto();
      return recusa(`${ROTULO_MARCACAO[proxima]} já foi registrada hoje, em outro aparelho.`);
    };

    let registro: RegistroPonto | null = null;
    if (usandoNuvem()) {
      const res = await nuvem.baterPonto({ codigo: lido.codigo, loja: lido.loja, tipo: proxima });
      if (res.duplicado) return jaRegistrada();
      if (!res.sucesso && !res.semFuncao) return recusa(res.erro);
      registro = res.registro ?? null;
    }

    // Modo local, ou o banco ainda sem `bater_ponto` (ponto-pelo-servidor.sql
    // não rodado): o caminho antigo, conferido e carimbado aqui
    if (!registro) {
      const resolvido = this.resolverLojaDoCodigo(conteudoLido);
      if (!resolvido) return recusa(recusaDoCodigo);
      registro = {
        id: `ponto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        colaboradorId: atual.id,
        data,
        tipo: proxima,
        horario: momento.toISOString(),
        horaFormatada: momento.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        metodo: resolvido.metodo,
        loja: resolvido.loja,
        criadoEm: momento.toISOString(),
      };
      if (usandoNuvem()) {
        const res = await nuvem.salvarRegistroPonto(registro);
        if (res.duplicado) return jaRegistrada();
        if (!res.sucesso) return recusa(res.erro);
      }
    }

    const registros = this.lerRegistros();
    registros.push(registro);
    this.gravarRegistros(registros);

    /**
     * Motivo dado numa batida do MEIO do dia (entrada atrasada, almoço
     * esticado) precisa sobreviver até o fechamento — é só lá que a
     * pendência nasce. Sem guardar, a pessoa escreveria a explicação na
     * entrada e o aprovador receberia o dia mudo às 18h.
     */
    // O dia que vale é o do registro: no modo rede, o que o banco carimbou
    if (justificativa?.motivo?.trim() || justificativa?.anexoCaminho) {
      this.guardarJustificativaDoDia(atual.id, registro.data, justificativa);
    }

    // Fechou a jornada: levanta a diferença e manda para o responsável.
    // É aqui que o caminho começa — sem este passo, hora extra viraria saldo
    // sozinha e ninguém teria decidido nada.
    if (proxima === 'saida') {
      await this.apurarDia(atual.id, registro.data, justificativa);
    }

    bancoDados.registrarAuditoria(
      'Registro de Ponto',
      'sistema',
      `${atual.nome} registrou ${ROTULO_MARCACAO[proxima].toLowerCase()} às ${registro.horaFormatada} na loja ${registro.loja}.`
    );
    this.notificar();
    return { sucesso: true, registro };
  }

  // --- JORNADA E SALDO ---

  /** Quanto o dia prevê para esta pessoa — a regra está em `apuracaoDoDia`. */
  private cargaPrevistaEmMinutos(colaborador: Colaborador | undefined, data: string): number {
    return cargaPrevistaEmMinutos(colaborador, data);
  }

  /**
   * A SEMANA É A UNIDADE DO BANCO DE HORAS, e não o dia.
   *
   * O dia sozinho não diz nada nesta rede. O estagiário que faz 5h de
   * segunda a sexta e 5h no sábado fecha as 30h dele — mas é reprovado
   * cinco vezes por dia curto se a conta for diária. O colaborador que sai
   * dez minutos mais cedo numa terça e compensa na quinta fecha a semana em
   * dia, e a conta diária marca um débito e um crédito que nunca deviam ter
   * existido.
   *
   * Aqui se soma o que a pessoa trabalhou na semana e se compara com a
   * carga semanal DELA. É isso que vai para o banco de horas, e é isso que
   * o líder olha no sábado.
   *
   * O ciclo vai de SÁBADO a SEXTA — é o que `semanaDe` recorta, e é como a
   * folha corre aqui: o sábado ABRE a semana em vez de parti-la ao meio.
   */
  apurarSemana(
    colaboradorId: string,
    dataQualquerDaSemana: string
  ): {
    inicio: string;
    fim: string;
    minutosTrabalhados: number;
    minutosPrevistos: number;
    saldoMinutos: number;
    diasComPendencia: string[];
  } {
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const { inicio, fim } = semanaDe(dataQualquerDaSemana);

    let minutosTrabalhados = 0;
    let minutosPrevistos = 0;
    let saldoMinutos = 0;
    const diasComPendencia: string[] = [];
    const hoje = dataDeHoje();

    for (const data of listarDatasDoPeriodo(inicio, fim)) {
      /**
       * O SALDO SÓ CONTA DIA QUE JÁ FECHOU.
       *
       * Isto somava a semana INTEIRA de previsto, hoje e amanhã incluídos,
       * contra o que a pessoa tinha trabalhado até agora. O efeito
       * aparecia no painel do RH: numa segunda de manhã a rede devia
       * −3924h33, que é a carga semanal de 87 pessoas — a semana que nem
       * tinha começado, cobrada por inteiro de todo mundo.
       *
       * Era um número que não dava para acreditar, e indicador em que não
       * se acredita é pior do que indicador nenhum: ensina a ignorar o
       * painel, e junto com ele o dia em que a rede realmente estiver
       * devendo.
       *
       * O dia de HOJE também fica fora, e não só o futuro: quem entrou às
       * 8h e ainda está trabalhando não deve as 8h10 do dia. Contar o
       * previsto de um dia em andamento faz a rede inteira parecer
       * devedora toda manhã, e quitar sozinha até a noite.
       *
       * O mesmo corte de `hoje` que a pendência já usava, agora valendo
       * para a conta toda — eram duas noções de "dia que passou" no mesmo
       * laço, e foi a discordância entre elas que pôs "Sem bater: 0" ao
       * lado de um débito de quatro mil horas.
       */
      if (data >= hoje) continue;

      const jornada = this.obterJornadaDoDia(colaboradorId, data);

      /**
       * ===============================================================
       * SÓ DIA QUE FECHOU JORNADA ENTRA NA CONTA DE HORAS.
       * ===============================================================
       *
       * Dia sem batida nenhuma é PENDÊNCIA DE BATIDA, e não débito de
       * hora. Decisão do Elias, e ela desfaz a última das quatro
       * divergências do banco de horas.
       *
       * Somava o previsto cheio de um dia em que ninguém bateu nada. A
       * mesma ausência aparecia DUAS VEZES na tela — como −8h10 e como
       * "1 dia com batida faltando" — e o espelho da pessoa, que é o
       * documento trabalhista, dizia 0h00 naquele dia. Três versões do
       * mesmo dia.
       *
       * E era um débito que sumia sozinho: no instante em que o RH
       * lançava o atestado, `cargaPrevistaEmMinutos` zerava o previsto e
       * as 8h10 desapareciam do saldo. Número que se mexe por um motivo
       * que a pessoa não vê é número em que ela para de acreditar.
       *
       * A ausência NÃO fica invisível: ela continua em
       * `diasComPendencia`, que ordena a relação do ciclo e aparece em
       * âmbar na aba Ponto, com "avise seu responsável". Falta de batida
       * a pessoa resolve avisando; falta de hora se resolve trabalhando.
       * Dizer as duas como débito faz ela tentar compensar uma hora que
       * trabalhou e esqueceu de registrar.
       *
       * O PREVISTO É O EFETIVO, com a pausa paga já descontada — é o que
       * faz `trabalhado − previsto` dar exatamente a soma dos saldos
       * diários. Com o previsto cheio, esta função dizia −1h15 na semana
       * da Lyvia enquanto o espelho dela dizia 0h00 nos cinco dias.
       */
      if (jornada.minutosTrabalhados > 0) {
        minutosTrabalhados += jornada.minutosTrabalhados;
        // O horário combinado: as 8h e a compensação do sábado. O saldo da
        // semana é o desvio dele — e assim trabalhado − previsto = saldo
        minutosPrevistos += jornada.minutosPrevistosEfetivos + jornada.compensacaoMinutos;
        /**
         * O SALDO DA SEMANA É A SOMA DOS SALDOS DOS DIAS, e não
         * `trabalhado − previsto` da semana. Com a tolerância, os dois
         * deixam de ser iguais: um dia de 07:29 a 17:12 tem 3 minutos a
         * mais no relógio e zero no saldo. Refazer a subtração aqui
         * devolveria os minutos que a tolerância perdoou — a mesma
         * divergência de quando a pausa paga só existia num dos lados.
         */
        saldoMinutos += jornada.saldoMinutos;
      }

      /**
       * Pendência é batida que FALTA num dia que já passou — não é dia
       * curto. Dia curto agora é assunto do saldo da semana; falta de
       * batida é assunto de quem responde pela pessoa, porque só ela sabe
       * o que aconteceu.
       */
      const esperadas = marcacoesEsperadas(data, colaborador);
      if (esperadas.length === 0) continue;
      if (situacaoDoDia(colaboradorId, data) !== 'normal') continue;

      /**
       * DIA SEM NENHUMA BATIDA TAMBÉM É FALTA DE BATIDA.
       *
       * Era `feitas > 0 && feitas < esperadas.length`: só o dia batido
       * pela METADE contava. O dia em que a pessoa não bateu nada —
       * que é a falta mais completa que existe — passava calado, ao
       * mesmo tempo em que o previsto dele pesava no saldo dela.
       *
       * QUEM NÃO BATE PONTO tem de ficar fora desta conta, e não fica
       * por aqui: `marcacoesEsperadas` olha o dia e a ficha, nunca se a
       * pessoa bate ponto, e devolve as quatro batidas para o gerente
       * também. Quem tira a gerência da relação é
       * `relacaoSemanalDaEquipe`, com o porquê escrito lá.
       */
      const feitas = esperadas.filter((t) => !!jornada.marcacoes[t]).length;
      if (feitas < esperadas.length) diasComPendencia.push(data);
    }

    return {
      inicio,
      fim,
      minutosTrabalhados,
      minutosPrevistos,
      saldoMinutos,
      diasComPendencia,
    };
  }

  /**
   * A RELAÇÃO DO BANCO DE HORAS DA EQUIPE, ciclo a ciclo.
   *
   * É o que o líder abre no sábado: uma linha por pessoa, com o que ela
   * trabalhou no ciclo que fechou, o que ela devia, o saldo e o que ficou
   * pendente de batida.
   *
   * A FOLGA JÁ ENTRA DESCONTADA, e sem ninguém precisar lembrar: o previsto
   * de cada dia vem de `cargaPrevistaEmMinutos`, que zera o dia de ausência
   * APROVADA — e a folga de sábado é uma delas. Quem folgou naquele sábado
   * específico tem 4 horas a menos de previsto naquele ciclo, e fecha em dia
   * sem dever nada.
   *
   * Folga ainda PENDENTE não desconta. É de propósito: enquanto ninguém
   * autorizou, o sábado ainda é dia de trabalho — e o saldo negativo é
   * justamente o que faz o líder decidir.
   */
  relacaoSemanalDaEquipe(dataNoCiclo: string): {
    inicio: string;
    fim: string;
    linhas: {
      colaborador: Colaborador;
      minutosTrabalhados: number;
      minutosPrevistos: number;
      cargaContratada: number;
      saldoMinutos: number;
      diasComPendencia: string[];
      folgouNoCiclo: boolean;
    }[];
  } {
    const { inicio, fim } = semanaDe(dataNoCiclo);

    // Só quem eu aprovo: a relação da rede inteira não é minha para olhar.
    // Quem lidera aparece na própria relação, porque aprova as próprias horas.
    const equipe = this.obterColaboradoresVisiveis()
      .filter((c) => this.podeDecidirSobre(c))
      /**
       * BANCO DE HORAS É DE QUEM BATE PONTO.
       *
       * Da gerência para cima não se bate — está no catálogo, em
       * `ferramentas.ts`, e foi decisão do Elias. Mas esta relação
       * continuava incluindo essas pessoas, e o resultado era aritmético:
       * quem nunca bate marca zero trabalhado contra a carga cheia, e
       * aparece devendo a semana inteira. Toda semana, para sempre.
       *
       * Somado no painel do RH isso virava um débito de milhares de horas
       * que ninguém devia. E a linha de cada gerente ficava no topo da
       * relação do banco de horas, que ordena pelo maior débito — o lugar
       * reservado a quem precisa de atenção, ocupado por quem não tem o
       * que ser olhado.
       *
       * A pergunta é a MESMA que faz a aba "Ponto" aparecer, e vem do
       * mesmo lugar: se a pessoa não tem por onde bater, não há saldo dela
       * para cobrar. Duas respostas para isso seria a quinta vez que este
       * sistema se contradiz sozinho.
       */
      .filter(batePonto);

    const linhas = equipe
      .map((colaborador) => {
        const semana = this.apurarSemana(colaborador.id, dataNoCiclo);

        /**
         * Folgou neste ciclo? Serve para a tela dizer POR QUE o previsto
         * daquela pessoa veio menor — senão o líder vê 40h50 numa linha e
         * 44h50 na de baixo sem explicação, e desconfia da conta.
         */
        const folgouNoCiclo = listarDatasDoPeriodo(inicio, fim).some(
          (data) =>
            ehSabado(data) && situacaoDoDia(colaborador.id, data) === 'folga'
        );

        return {
          colaborador,
          minutosTrabalhados: semana.minutosTrabalhados,
          minutosPrevistos: semana.minutosPrevistos,
          cargaContratada: cargaSemanalDe(colaborador),
          saldoMinutos: semana.saldoMinutos,
          diasComPendencia: semana.diasComPendencia,
          folgouNoCiclo,
        };
      })
      /**
       * Quem tem pendência de batida vem primeiro, depois o maior débito.
       *
       * A relação existe para agir, não para consultar: o que precisa de
       * decisão tem de estar no alto, e não no meio de oitenta linhas
       * ordenadas por nome.
       */
      .sort((a, b) => {
        if (a.diasComPendencia.length !== b.diasComPendencia.length) {
          return b.diasComPendencia.length - a.diasComPendencia.length;
        }
        return a.saldoMinutos - b.saldoMinutos;
      });

    return { inicio, fim, linhas };
  }

  /**
   * O que a semana DEVERIA ter, pela carga contratada da pessoa.
   *
   * Diferente do previsto somado dia a dia: aquele desconta folga e
   * ausência aprovada, este é o contrato limpo. Serve para a tela dizer
   * "30h na semana" sem ter de explicar por que naquela semana foram 25.
   */
  cargaSemanalDoColaborador(colaboradorId: string): number {
    return cargaSemanalDe(bancoDados.obterColaboradorPorId(colaboradorId));
  }

  /** Consolida um dia: horas trabalhadas, intervalo e saldo contra a jornada (`apuracaoDoDia`). */
  obterJornadaDoDia(colaboradorId: string, data: string): JornadaDia {
    return jornadaDoDia(colaboradorId, data);
  }

  /** Este dia é falta? A regra está em `apuracaoDoDia`. */
  ehFalta(
    colaborador: Colaborador | undefined,
    data: string,
    batidas: number,
    minutosPrevistos: number
  ): boolean {
    return ehFalta(colaborador, data, batidas, minutosPrevistos);
  }

  /**
   * AS BATIDAS DO PERÍODO, TRAZIDAS DO BANCO — sem encolher o que já havia.
   *
   * O cache de batidas é uma janela que as telas trocam (o espelho do RH em
   * "Outubro" deixava só o dia 1º). Quem analisa dias passados — a fila de
   * decisão, os pontos incompletos — pede o período ao banco antes, e a
   * janela é ALARGADA para cobri-lo: a tela que pediu outro período
   * continua com ele.
   */
  async garantirBatidasDoPeriodo(inicio: string, fim: string): Promise<void> {
    if (!usandoNuvem()) return;
    const atual = nuvem.obterJanelaDoPonto();
    await nuvem.sincronizarPonto({
      inicio: atual.inicio < inicio ? atual.inicio : inicio,
      fim: atual.fim > fim ? atual.fim : fim,
    });
    await nuvem.sincronizarAjustes();
  }

  /**
   * AS BATIDAS QUE FALTARAM NUM DIA QUE COMEÇOU.
   *
   * Vazio quando o dia fechou, quando ainda é hoje (dá tempo), quando não
   * teve batida nenhuma (aí é falta, que tem a fila própria) e quando o dia
   * não esperava batida (domingo, feriado, ausência aprovada). É a regra de
   * "Pontos incompletos", do aviso no espelho e do "sem bater" do RH.
   */
  batidasQueFaltam(colaborador: Colaborador, data: string): TipoMarcacao[] {
    if (data >= dataDeHoje()) return [];
    const feitas = new Set(this.obterMarcacoesDoDia(colaborador.id, data).map((r) => r.tipo));
    if (feitas.size === 0) return [];
    return marcacoesEsperadas(data, colaborador).filter((tipo) => !feitas.has(tipo));
  }

  /**
   * O horário que o turno espera para esta batida, neste dia — "17:10".
   * Serve de referência para quem completa o dia; não é preenchido sozinho,
   * porque inventar o horário de alguém é o que a justificativa existe
   * para impedir.
   */
  horarioPrevistoDaBatida(colaborador: Colaborador, data: string, tipo: TipoMarcacao): string | null {
    const minutos = this.horariosEsperadosDoDia(colaborador, data)?.[tipo];
    if (minutos === undefined) return null;
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
  }

  /**
   * COMPLETA O DIA: lança, de uma vez, as batidas que faltaram.
   *
   * Pedido do Elias: uma opção só por dia, e não um botão por batida. A
   * ordem é conferida com as batidas que já existem — a saída antes do
   * retorno do almoço viraria um dia de trabalho negativo no espelho.
   */
  async completarDia(dados: {
    colaboradorId: string;
    data: string;
    horarios: Partial<Record<TipoMarcacao, string>>;
    justificativa: string;
  }): Promise<{ sucesso: boolean; lancadas: number; erro?: string }> {
    const colaborador = bancoDados.obterColaboradorPorId(dados.colaboradorId);
    if (!colaborador) return { sucesso: false, lancadas: 0, erro: 'Colaborador não encontrado.' };
    if (!dados.justificativa.trim()) {
      return { sucesso: false, lancadas: 0, erro: 'Escreva a justificativa: ela vai para a auditoria.' };
    }

    // As batidas do dia vêm do banco: o aparelho pode não ter aquele dia, e a
    // ordem tem de ser conferida contra o que existe de verdade
    if (usandoNuvem()) {
      await nuvem.trazerMarcacoesDe(colaborador.id, { inicio: dados.data, fim: dados.data });
    }

    const faltam = this.batidasQueFaltam(colaborador, dados.data);
    const novas = faltam.filter((t) => /^\d{2}:\d{2}$/.test(dados.horarios[t] || ''));
    if (novas.length === 0) {
      return { sucesso: false, lancadas: 0, erro: 'Preencha o horário de ao menos uma batida.' };
    }

    // Todas as batidas do dia, as feitas e as novas, na ordem do dia
    const feitas = new Map(this.obterMarcacoesDoDia(colaborador.id, dados.data).map((r) => [r.tipo, r.horaFormatada]));
    const sequencia = ORDEM_MARCACOES.map((t) => ({ tipo: t, hora: feitas.get(t) || dados.horarios[t] })).filter(
      (b): b is { tipo: TipoMarcacao; hora: string } => !!b.hora && /^\d{2}:\d{2}$/.test(b.hora)
    );
    for (let i = 1; i < sequencia.length; i++) {
      if (sequencia[i].hora <= sequencia[i - 1].hora) {
        return {
          sucesso: false,
          lancadas: 0,
          erro: `${ROTULO_MARCACAO[sequencia[i].tipo]} (${sequencia[i].hora}) tem de vir depois de ${ROTULO_MARCACAO[
            sequencia[i - 1].tipo
          ].toLowerCase()} (${sequencia[i - 1].hora}).`,
        };
      }
    }

    let lancadas = 0;
    for (const tipo of novas) {
      const res = await this.ajustarMarcacao({
        colaboradorId: colaborador.id,
        data: dados.data,
        tipo,
        hora: dados.horarios[tipo]!,
        justificativa: dados.justificativa.trim(),
      });
      if (!res.sucesso) {
        return {
          sucesso: false,
          lancadas,
          erro: `${ROTULO_MARCACAO[tipo]}: ${res.erro || 'não foi possível lançar.'}${
            lancadas ? ` (${lancadas} já lançada${lancadas > 1 ? 's' : ''})` : ''
          }`,
        };
      }
      lancadas++;
    }
    return { sucesso: true, lancadas };
  }

  /**
   * OS DIAS QUE NÃO FECHARAM, da equipe de quem pergunta.
   *
   * Pedido do Elias: "o espelho não pode fechar incompleto", e cada dia tem
   * de dizer exatamente o que houve — "Yan bateu 2 de 4". A equipe é a da
   * alçada (`podeDecidirSobre`): é quem pode lançar a batida esquecida.
   */
  obterPontosIncompletos(dataInicio: string, dataFim: string): PontoIncompleto[] {
    const equipe = this.obterColaboradoresVisiveis().filter((c) => this.podeDecidirSobre(c));
    const dias: DiaComBatidas[] = [];
    for (const colaborador of equipe) {
      for (const data of listarDatasDoPeriodo(dataInicio, dataFim)) {
        const registros = this.obterMarcacoesDoDia(colaborador.id, data);
        if (registros.length === 0) continue;
        dias.push({
          colaboradorId: colaborador.id,
          data,
          tipos: registros.map((r) => r.tipo),
          horas: registros.map((r) => r.horaFormatada),
        });
      }
    }
    return this.montarPontosIncompletos(dias);
  }

  /**
   * OS PONTOS INCOMPLETOS PERGUNTADOS AO BANCO — o caminho das telas.
   *
   * O cache é uma janela que as telas trocam: lido dele, a lista oscilava
   * e o espelho de outubro escondia os dias de setembro sem fechar. O banco
   * (`dias_com_batida_incompleta`) devolve só os dias com batida faltando,
   * filtrados pela segurança de quem pergunta. Sem a função no banco
   * (pontos-incompletos.sql não rodado), volta ao cache.
   */
  async buscarPontosIncompletos(dataInicio: string, dataFim: string): Promise<PontoIncompleto[]> {
    if (usandoNuvem()) {
      const dias = await nuvem.buscarDiasComBatidaIncompleta(dataInicio, dataFim);
      if (dias) return this.montarPontosIncompletos(dias as DiaComBatidas[]);
    }
    return this.obterPontosIncompletos(dataInicio, dataFim);
  }

  /**
   * O DIA DE TRABALHO QUE FICOU VAZIO.
   *
   * Já passou, esperava batida (domingo, feriado, folga e o sábado de quem
   * não vem não esperam), não tem ausência que o cubra, é de depois da
   * admissão e não teve batida nenhuma. É o dia que o "Preencher dias
   * vazios" preenche e o que conta no espelho incompleto — a mesma regra.
   */
  ehDiaVazio(colaborador: Colaborador, data: string, batidasNoDia: number): boolean {
    if (batidasNoDia > 0 || data >= dataDeHoje()) return false;
    if (colaborador.dataAdmissao && data < colaborador.dataAdmissao) return false;
    if (marcacoesEsperadas(data, colaborador).length === 0) return false;
    return situacaoDoDia(colaborador.id, data) === 'normal';
  }

  /**
   * QUEM ESTÁ COM O ESPELHO INCOMPLETO, e quanto falta a cada um.
   *
   * Os dias que começaram e não fecharam vêm de `buscarPontosIncompletos`.
   * Os dias vazios precisam saber em que dias cada pessoa bateu: o banco
   * responde numa linha por pessoa (`dias_com_batida`) — baixar as batidas
   * da rede de dois meses seria dezenas de milhares de linhas. Sem a função
   * no banco, alarga o cache para o período e conta por ele.
   */
  async buscarEspelhosIncompletos(dataInicio: string, dataFim: string): Promise<EspelhoIncompleto[]> {
    const semFechar = await this.buscarPontosIncompletos(dataInicio, dataFim);

    let diasComBatida: Map<string, Set<string>> | null = null;
    if (usandoNuvem()) {
      const doBanco = await nuvem.buscarDiasComBatida(dataInicio, dataFim);
      if (doBanco) diasComBatida = new Map(doBanco.map((l) => [l.colaboradorId, new Set(l.dias)]));
      else await this.garantirBatidasDoPeriodo(dataInicio, dataFim);
    }
    const batidasNoDia = (id: string, data: string) =>
      diasComBatida ? (diasComBatida.get(id)?.has(data) ? 1 : 0) : this.obterMarcacoesDoDia(id, data).length;

    const datas = listarDatasDoPeriodo(dataInicio, dataFim);
    const lista: EspelhoIncompleto[] = [];
    for (const colaborador of this.obterColaboradoresVisiveis()) {
      if (colaborador.ativo === false || !batePonto(colaborador) || !this.podeDecidirSobre(colaborador)) continue;
      const seus = semFechar.filter((p) => p.colaborador.id === colaborador.id);
      const semBatida = datas.filter((data) => this.ehDiaVazio(colaborador, data, batidasNoDia(colaborador.id, data)));
      const total = seus.length + semBatida.length;
      if (total === 0) continue;
      const maisRecente = [...seus.map((p) => p.data), ...semBatida].reduce((a, b) => (b > a ? b : a));
      lista.push({ colaborador, semFechar: seus, semBatida, total, maisRecente });
    }
    return lista.sort((a, b) => b.total - a.total || a.colaborador.nome.localeCompare(b.colaborador.nome));
  }

  /**
   * De quem são, e o que falta, a partir dos dias com batida. Uma regra só,
   * venham os dias do banco ou do cache: só dia que já passou, só de quem
   * eu decido, e só o que a pessoa esperava bater — o estágio de 2 batidas
   * com as 2 feitas não está incompleto.
   */
  private montarPontosIncompletos(dias: DiaComBatidas[]): PontoIncompleto[] {
    const hoje = dataDeHoje();
    const lista: PontoIncompleto[] = [];
    for (const d of dias) {
      if (d.data >= hoje || d.tipos.length === 0) continue;
      const colaborador = bancoDados.obterColaboradorPorId(d.colaboradorId);
      if (!colaborador || colaborador.ativo === false || !batePonto(colaborador)) continue;
      if (!this.podeDecidirSobre(colaborador)) continue;
      const esperadas = marcacoesEsperadas(d.data, colaborador);
      const faltam = esperadas.filter((tipo) => !d.tipos.includes(tipo));
      if (faltam.length === 0) continue;
      const horas: Partial<Record<TipoMarcacao, string>> = {};
      d.tipos.forEach((tipo, i) => {
        horas[tipo] = d.horas[i];
      });
      lista.push({
        colaborador,
        data: d.data,
        feitas: esperadas.length - faltam.length,
        esperadas: esperadas.length,
        faltam,
        horas,
      });
    }
    return lista.sort(
      (a, b) => b.data.localeCompare(a.data) || a.colaborador.nome.localeCompare(b.colaborador.nome)
    );
  }

  /** Jornadas de um período, um item por dia do intervalo. */
  obterJornadasDoPeriodo(colaboradorId: string, dataInicio: string, dataFim: string): JornadaDia[] {
    return listarDatasDoPeriodo(dataInicio, dataFim).map((data) =>
      this.obterJornadaDoDia(colaboradorId, data)
    );
  }

  // --- APURAÇÃO DO DIA E APROVAÇÃO ---

  private lerAjustes(): AjusteJornada[] {
    return lerLista<AjusteJornada>(CHAVE_AJUSTES);
  }

  private gravarAjustes(ajustes: AjusteJornada[]): void {
    localStorage.setItem(CHAVE_AJUSTES, JSON.stringify(ajustes));
  }

  /** Apuração de um dia, se já existir. */
  obterAjusteDoDia(colaboradorId: string, data: string): AjusteJornada | null {
    return (
      this.lerAjustes().find((a) => a.colaboradorId === colaboradorId && a.data === data) || null
    );
  }

  /** Apurações do colaborador, da mais recente para a mais antiga. */
  obterAjustesDoColaborador(colaboradorId: string): AjusteJornada[] {
    return this.lerAjustes()
      .filter((a) => a.colaboradorId === colaboradorId)
      .sort((a, b) => b.data.localeCompare(a.data));
  }

  /**
   * Levanta a diferença do dia e manda para aprovação.
   *
   * Chamado quando a jornada fecha. A batida diz o que aconteceu; o saldo só
   * nasce depois que o responsável disser se a hora extra estava autorizada
   * ou se a saída mais cedo estava combinada. É este passo que faz o caminho
   * não ter atalho.
   *
   * Dia que bate certo com a carga contratada não gera nada — não há o que
   * decidir, e encher a fila do gerente com dias normais faria ele parar de
   * olhar a fila.
   */
  /**
   * A tolerância diária em vigor, em minutos.
   *
   * Vem da configuração da rede; o padrão sai do art. 58 §1º da CLT. Nunca
   * negativa: uma tolerância negativa faria TODO dia virar pendência, que é
   * exatamente o que ela existe para evitar.
   */
  /**
   * Guarda o motivo dado numa batida do meio do dia até o fechamento.
   *
   * Fica no aparelho de propósito: é rascunho de algumas horas, some quando
   * a apuração do dia o absorve, e não vale a pena ocupar linha no banco
   * para isso. Se a pessoa trocar de aparelho no meio do dia, o motivo
   * volta a ser pedido no fechamento — que é o comportamento certo.
   */
  private guardarJustificativaDoDia(
    colaboradorId: string,
    data: string,
    dados: { motivo?: string; anexoCaminho?: string }
  ): void {
    try {
      const bruto = localStorage.getItem(CHAVE_JUSTIFICATIVA_DO_DIA);
      const mapa = bruto ? JSON.parse(bruto) : {};
      const chave = `${colaboradorId}_${data}`;
      mapa[chave] = {
        motivo: dados.motivo?.trim() || mapa[chave]?.motivo,
        anexoCaminho: dados.anexoCaminho || mapa[chave]?.anexoCaminho,
      };
      localStorage.setItem(CHAVE_JUSTIFICATIVA_DO_DIA, JSON.stringify(mapa));
    } catch {
      // Sem armazenamento: o motivo será pedido de novo no fechamento
    }
  }

  private lerJustificativaDoDia(
    colaboradorId: string,
    data: string
  ): { motivo?: string; anexoCaminho?: string } | undefined {
    try {
      const bruto = localStorage.getItem(CHAVE_JUSTIFICATIVA_DO_DIA);
      if (!bruto) return undefined;
      return JSON.parse(bruto)[`${colaboradorId}_${data}`];
    } catch {
      return undefined;
    }
  }

  obterToleranciaMinutos(): number {
    const valor = bancoDados.obterConfiguracoes().toleranciaPontoMinutos;
    if (typeof valor !== 'number' || Number.isNaN(valor) || valor < 0) {
      return TOLERANCIA_PONTO_PADRAO_MINUTOS;
    }
    return Math.floor(valor);
  }

  /** O outro limite da CLT: minutos tolerados em CADA marcação. */
  obterToleranciaPorMarcacaoMinutos(): number {
    const valor = bancoDados.obterConfiguracoes().toleranciaPorMarcacaoMinutos;
    if (typeof valor !== 'number' || Number.isNaN(valor) || valor < 0) {
      return TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS;
    }
    return Math.floor(valor);
  }

  /** O horário que o contrato espera para cada batida (`apuracaoDoDia`). */
  private horariosEsperadosDoDia(
    colaborador: Colaborador | undefined,
    data: string
  ): Partial<Record<TipoMarcacao, number>> | null {
    return horariosEsperadosDoDia(colaborador, data);
  }

  /**
   * A MAIOR variação entre o batido e o esperado, marcação a marcação.
   *
   * Devolve `null` quando não há horário esperado conhecido.
   *
   * É o que faltava para o art. 58 §1º valer inteiro: a lei tem DOIS
   * limites — cinco minutos em cada marcação e dez no dia — e o sistema só
   * conhecia o segundo. Uma saída oito minutos adiantada passava batida,
   * quando pela lei esses oito minutos contam.
   */
  maiorVariacaoDoDia(colaboradorId: string, data: string): number | null {
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const esperados = this.horariosEsperadosDoDia(colaborador, data);
    if (!esperados) return null;

    const jornada = this.obterJornadaDoDia(colaboradorId, data);
    let maior = 0;

    for (const [tipo, esperado] of Object.entries(esperados)) {
      const reg = jornada.marcacoes[tipo as TipoMarcacao];
      if (!reg || esperado === undefined) continue;

      const quando = new Date(reg.horario);
      const batido = quando.getHours() * 60 + quando.getMinutes();
      maior = Math.max(maior, Math.abs(batido - esperado));
    }

    return maior;
  }

  /**
   * A HORA EM QUE ESTA PESSOA DEVE ENTRAR NESTE DIA.
   *
   * Um lugar só, perguntado pela batida (motivo do atraso) e pelo painel
   * ("Sem bater hoje"). O painel não perguntava nada: às 07:40 dava como
   * faltoso quem é do turno B e só entra às 08:20.
   */
  entradaEsperada(colaborador: Colaborador | undefined, data: string): string {
    return ehSabado(data) ? TURNO_SABADO.entrada : turnoDe(colaborador).entrada;
  }

  /**
   * JÁ DEVIA TER BATIDO, E NÃO BATEU.
   *
   * "Sem bater hoje" era só "nenhuma batida hoje" — sem olhar a hora. O
   * turno B inteiro aparecia como faltoso das 07:30 às 08:20, e a lista
   * que devia apontar quem sumiu vinha cheia de quem ainda nem entrou.
   *
   * Só conta depois da entrada do turno DA PESSOA mais a tolerância, e
   * só em dia que prevê jornada: domingo, feriado, folga, atestado e o
   * sábado de quem não vem ao sábado não cobram batida nenhuma.
   */
  estaSemBaterHoje(
    colaborador: Colaborador,
    // O padrão vem do relógio sincronizado; os testes passam a data deles
    agora: Date = agoraSincronizado()
  ): boolean {
    if (!batePonto(colaborador)) return false;
    const data = paraDataLocal(agora);
    if (this.obterMarcacoesDoDia(colaborador.id, data).length > 0) return false;
    if (this.cargaPrevistaEmMinutos(colaborador, data) === 0) return false;

    const [h, m] = this.entradaEsperada(colaborador, data).split(':').map(Number);
    const limite = h * 60 + m + this.obterToleranciaPorMarcacaoMinutos();
    return agora.getHours() * 60 + agora.getMinutes() > limite;
  }

  /**
   * O NOME DO DÉBITO PELA CAUSA, e não "Saída antecipada" para tudo.
   *
   * O rótulo do débito era um só. Quem entrou atrasado recebia o aviso de
   * "Saída antecipada", e quem decide lia o contrário do que aconteceu. A
   * causa já está na apuração do dia — o quanto cada batida tirou — e é
   * dela que o nome sai. Sem horário esperado (dia medido só pelo total),
   * não há como apontar a causa, e o nome diz só o que se sabe.
   */
  rotuloDoAjuste(ajuste: Pick<AjusteJornada, 'tipo' | 'colaboradorId' | 'data'>): string {
    if (ajuste.tipo === 'hora_extra') return ROTULO_TIPO_AJUSTE.hora_extra;

    const jornada = this.obterJornadaDoDia(ajuste.colaboradorId, ajuste.data);
    // Dia sem batida nenhuma não é "dia sem fechar" nem "horas a menos": é falta
    if (jornada.falta) return 'Falta';
    if (ajuste.tipo !== 'debito') return ROTULO_TIPO_AJUSTE[ajuste.tipo];

    const t = jornada.tolerancia;
    const causas: string[] = [];
    if (t.entradaESaida && t.entradaESaida.efeitoEntrada < 0) causas.push('atraso na entrada');
    if (t.intervalo && t.intervalo.efeito < 0) causas.push('intervalo estendido');
    if (t.entradaESaida && t.entradaESaida.efeitoSaida < 0) causas.push('saída antecipada');

    if (causas.length === 0) return ROTULO_TIPO_AJUSTE.debito;
    const texto =
      causas.length === 1
        ? causas[0]
        : `${causas.slice(0, -1).join(', ')} e ${causas[causas.length - 1]}`;
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /**
   * Esta batida, agora, exige motivo do colaborador?
   *
   * Chamada ANTES de confirmar. O dia só fecha na 4ª batida, então nem
   * sempre dá para conhecer a diferença agregada — e esperar as 4 para pedir
   * o motivo de um atraso óbvio de entrada seria pedir tarde demais, quando
   * a pessoa já não lembra o porquê.
   *
   * Por isso cada marcação é medida contra o que se espera dela:
   *
   *   entrada         → atraso sobre o horário de entrada da rede
   *   retorno almoço  → intervalo fora do contratado, maior OU menor
   *   saída           → a diferença do dia, que aí já é conhecida por inteiro
   *   saída p/ almoço → nunca: sair para almoçar cedo ou tarde não é jornada
   *                     a mais nem a menos; quem decide isso é o fechamento
   *                     do dia.
   */
  avaliarMarcacao(
    colaboradorId: string,
    tipo: TipoMarcacao,
    // O padrão vem do relógio sincronizado; os testes passam a data deles
    agora: Date = agoraSincronizado()
  ): { precisaMotivo: boolean; minutos: number; descricao: string } {
    const semMotivo = { precisaMotivo: false, minutos: 0, descricao: '' };
    const tolerancia = this.obterToleranciaMinutos();
    const data = paraDataLocal(agora);
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

    if (tipo === 'saida_almoco') return semMotivo;

    /**
     * O horário esperado sai do TURNO DA PESSOA, não de um valor único da
     * rede: quem é do turno B entra às 08:20, e cobrar dele o horário do
     * turno A o faria justificar um atraso que não existe.
     */
    const turno = turnoDe(colaborador);
    const emMinutos = (hora: string): number => {
      const [h, m] = hora.split(':').map(Number);
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };

    if (tipo === 'entrada') {
      // Domingo não tem horário de entrada a cumprir
      if (ehDiaDeFolga(data)) return semMotivo;

      const esperado = this.entradaEsperada(colaborador, data);
      const atraso = minutosAgora - emMinutos(esperado);

      /* A entrada é UMA marcação: vale o limite por marcação da CLT (5),
         não o do dia (10). Entre os dois, o atraso já gera saldo — e o
         motivo era pedido só quando passava de 10. */
      if (atraso <= this.obterToleranciaPorMarcacaoMinutos()) return semMotivo;
      return {
        precisaMotivo: true,
        minutos: atraso,
        descricao: `Entrada ${formatarMinutos(atraso)} depois do horário (${esperado}).`,
      };
    }

    if (tipo === 'retorno_almoco') {
      const jornada = this.obterJornadaDoDia(colaboradorId, data);
      const saida = jornada.marcacoes.saida_almoco;
      if (!saida) return semMotivo;

      const saiuEm = new Date(saida.horario);
      const intervalo = minutosAgora - (saiuEm.getHours() * 60 + saiuEm.getMinutes());
      /**
       * O intervalo contratado é o DESTA PESSOA, e não o almoço da rede.
       *
       * A conta pegava o almoço do turno direto. Para quem tem 1h30 dava
       * certo por acaso; para o estagiário de 15 minutos, o sistema
       * silenciava uma hora e quinze de intervalo a mais todo dia, porque
       * cabia dentro do "contratado" que não era o dele.
       */
      const contratado = minutosDeIntervaloDe(colaborador);
      if (contratado === 0) return semMotivo;

      const excedente = intervalo - contratado;
      if (excedente > tolerancia) {
        return {
          precisaMotivo: true,
          minutos: excedente,
          descricao: `Intervalo de ${formatarMinutos(intervalo)} — ${formatarMinutos(
            excedente
          )} além dos ${formatarMinutos(contratado)} do seu turno.`,
        };
      }
      /**
       * O INTERVALO CURTO TAMBÉM PERGUNTA (01/10/2026).
       *
       * Só o intervalo LONGO pedia motivo. O José Eduardo não conseguiu
       * bater no almoço (versão antiga do sistema aberta) e, às 15:16,
       * bateu a saída e o retorno com 11 segundos de diferença: um almoço
       * de zero minuto entrou sem pergunta nenhuma — e virou 1h30 de hora
       * a mais no dia. Intervalo abaixo do contratado é ou batida fora de
       * hora, como essa, ou intervalo não cumprido (a CLT exige 1h acima
       * de 6h de jornada): nos dois casos quem decide precisa saber.
       */
      const faltou = contratado - intervalo;
      if (faltou > tolerancia) {
        return {
          precisaMotivo: true,
          minutos: faltou,
          descricao: `Intervalo de ${formatarMinutos(intervalo)} — ${formatarMinutos(
            faltou
          )} a menos que os ${formatarMinutos(contratado)} do seu turno.`,
        };
      }
      return semMotivo;
    }

    // saída: o dia inteiro já é conhecido, então mede-se a diferença real
    const jornada = this.obterJornadaDoDia(colaboradorId, data);
    const entrada = jornada.marcacoes.entrada;
    if (!entrada) return semMotivo;

    const entrouEm = new Date(entrada.horario);
    const trabalhado =
      minutosAgora -
      (entrouEm.getHours() * 60 + entrouEm.getMinutes()) -
      jornada.minutosIntervalo;
    /*
      CONTRA O HORÁRIO DO TURNO, e não contra as 8h da CLT. Desde 01/10/2026
      o previsto é de 8h e os 10 minutos são a compensação do sábado: medida
      contra as 8h, a saída das 18:00 do turno B já nascia com +10, e
      qualquer minuto a mais virava "Saída fora do horário" — vários
      colaboradores relataram no mesmo dia. A compensação é do combinado.
    */
    const diferenca =
      trabalhado - jornada.minutosPrevistos - compensacaoEsperadaDoDia(bancoDados.obterColaboradorPorId(colaboradorId), data);

    if (Math.abs(diferenca) <= tolerancia) return semMotivo;
    return {
      precisaMotivo: true,
      minutos: Math.abs(diferenca),
      descricao:
        diferenca > 0
          ? `${formatarMinutos(diferenca)} além da jornada prevista.`
          : `${formatarMinutos(Math.abs(diferenca))} a menos que a jornada prevista.`,
    };
  }

  /**
   * Levanta os dias que começaram e não fecharam, e os manda para a fila.
   *
   * Antes esses dias sumiam em silêncio: sem as marcações esperadas o dia
   * não apura, então não virava pendência, não virava débito, e
   * simplesmente não contava. Era o caminho mais fácil para sumir com um
   * dia inteiro.
   *
   * Só entra o dia PASSADO: durante o expediente o dia está legitimamente
   * incompleto, e cobrar de manhã a saída que só acontece às 17h seria
   * ruído puro.
   *
   * Dia sem NENHUMA marcação não entra: isso é falta ou ausência
   * justificada, que têm caminho próprio. Aqui é só o que começou e ficou
   * pela metade.
   */
  async levantarDiasIncompletos(diasParaTras = 30): Promise<number> {
    const eu = bancoDados.obterColaboradorAtual();
    const hoje = dataDeHoje();
    let criados = 0;
    let resolvidos = 0;

    /**
     * AS BATIDAS DOS DIAS ANALISADOS VÊM DO BANCO, NÃO DO QUE O APARELHO TINHA.
     *
     * A fila lia o cache — e o cache é uma JANELA que outras telas trocam:
     * o espelho do RH, aberto em "Outubro (em andamento)", deixava no
     * aparelho só o dia 1º. Aberta a fila em seguida, o 30/09 aparecia sem
     * batida nenhuma: o pedido parado não era revisto (Fernanda, Aline e
     * Lyvia, 01/10). E quem deixou a tela aberta desde a véspera criava
     * pedidos com o dia pela metade, por falta das batidas que chegaram
     * depois — os três nasceram com 0 minuto trabalhado.
     *
     * A janela é ALARGADA para cobrir os dias analisados, e não trocada:
     * a tela que pediu outro período continua com ele.
     */
    const primeiro = deDataLocal(hoje);
    primeiro.setDate(primeiro.getDate() - diasParaTras - 1);
    await this.garantirBatidasDoPeriodo(paraDataLocal(primeiro), hoje);

    /**
     * Só quem eu aprovo — e agora isso pode me incluir.
     *
     * A pergunta é a MESMA da fila de decisão (`podeDecidirSobre`), e por
     * isso é ela que responde: se a lista aqui divergisse, apareceria
     * pendência sem quem a decida, ou o contrário.
     */
    const equipe = this.obterColaboradoresVisiveis().filter(
      // Quem não bate ponto não tem dia a apurar nem falta a cobrar
      (c) => batePonto(c) && this.podeDecidirSobre(c)
    );

    for (const pessoa of equipe) {
      for (let i = 1; i <= diasParaTras; i++) {
        /*
          UM RELÓGIO SÓ. "Hoje" vinha do relógio sincronizado com o servidor
          e os dias para trás, do relógio do APARELHO. Com o aparelho
          adiantado ou noutro fuso, os dois discordavam e o dia corrente
          entrava como se já tivesse passado: o "dia sem fechar" da Fernanda
          em 30/09 foi criado às 17:12 do próprio dia 30.
        */
        const referencia = deDataLocal(hoje);
        referencia.setDate(referencia.getDate() - i);
        const data = paraDataLocal(referencia);
        if (data >= hoje) continue;

        // O que o dia pede — a regra é a do servidor (`decidirLevantamento`)
        const decisao = decidirLevantamento(pessoa, data, new Date().toISOString());
        if (decisao.acao === 'nada') continue;
        if (decisao.acao === 'reapurar') {
          const res = await this.apurarDia(pessoa.id, data);
          if (!res.erro) resolvidos++;
          continue;
        }
        const ajuste = decisao.ajuste;

        if (usandoNuvem()) {
          const res = await nuvem.salvarAjuste(ajuste);
          if (!res.sucesso) continue;
        }

        const lista = this.lerAjustes().filter((a) => a.id !== ajuste.id);
        lista.push(ajuste);
        this.gravarAjustes(lista);
        criados++;
      }
    }

    if (criados > 0 || resolvidos > 0) this.notificar();
    return criados;
  }

  /**
   * A decisão sobre um dia sem fechar.
   *
   * `abonar` = o dia conta como jornada normal, saldo zero. Caso do
   * esquecimento honesto.
   *
   * Sem abonar = o dia vira DÉBITO da jornada prevista inteira. Não dá para
   * calcular quanto a pessoa trabalhou de verdade — falta marcação —, e
   * inventar um número seria pior do que assumir o dia como não trabalhado.
   *
   * Em nenhum dos dois o responsável altera a marcação: isso segue do RH,
   * com justificativa e autoria.
   */
  async decidirDiaIncompleto(
    ajusteId: string,
    abonar: boolean,
    observacao?: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const ajuste = this.lerAjustes().find((a) => a.id === ajusteId);
    if (!ajuste) return { sucesso: false, erro: 'Dia não encontrado.' };

    const dono = bancoDados.obterColaboradorPorId(ajuste.colaboradorId);
    if (!dono || !this.podeDecidirSobre(dono)) {
      return { sucesso: false, erro: 'Você não responde por esta pessoa.' };
    }

    const eu = bancoDados.obterColaboradorAtual();
    const decidido: AjusteJornada = {
      ...ajuste,
      tipo: abonar ? 'hora_extra' : 'debito',
      minutos: abonar ? 0 : ajuste.minutosPrevistos,
      estado: 'aprovado',
      aprovadorId: eu.id,
      aprovadorNome: eu.nome,
      decididoEm: new Date().toISOString(),
      observacao: observacao?.trim() || (abonar ? 'Dia abonado pelo responsável' : undefined),
    };

    if (usandoNuvem()) {
      const res = await nuvem.salvarAjuste(decidido);
      if (!res.sucesso) return { sucesso: false, erro: res.erro };
    }

    const lista = this.lerAjustes().map((a) => (a.id === ajusteId ? decidido : a));
    this.gravarAjustes(lista);
    this.notificar();

    bancoDados.registrarAuditoria(
      'Dia sem fechar',
      'usuario',
      `${eu.nome} ${abonar ? 'abonou' : 'marcou débito de'} ${
        abonar ? '' : formatarMinutos(ajuste.minutosPrevistos)
      } no dia ${formatarDataBR(ajuste.data)} de ${dono.nome}.`
    );

    avisarDecisaoDePonto({
      tabela: 'ajustes_jornada',
      id: ajusteId,
      texto: `${abonar ? 'Abonado' : 'Contado como débito'}: dia sem fechar em ${formatarDataBR(
        ajuste.data
      )}`,
    });
    return { sucesso: true };
  }

  /**
   * @param corrigidoPor Quem acabou de corrigir a batida à mão, quando foi
   * o caso. Só chega preenchido de `ajustarMarcacao`, DEPOIS de a
   * autoridade sobre a pessoa ter sido conferida lá — o dia apurado por
   * uma batida normal não passa por aqui, e ninguém aprova o próprio dia
   * batendo o ponto.
   */
  async apurarDia(
    colaboradorId: string,
    data: string,
    dadosDoColaborador?: { motivo?: string; anexoCaminho?: string },
    corrigidoPor?: Colaborador
  ): Promise<{ criou: boolean; ajuste?: AjusteJornada; erro?: string }> {
    /**
     * O QUE O DIA VIRA é decidido em `decidirApuracao` (apuracaoDoDia.ts),
     * a mesma regra que o servidor usa. Aqui fica só o que é do aparelho:
     * o motivo guardado desde a batida do meio do dia, e a gravação.
     */
    const guardada = this.lerJustificativaDoDia(colaboradorId, data);
    const decisao = decidirApuracao(colaboradorId, data, {
      motivo: dadosDoColaborador?.motivo?.trim() || guardada?.motivo,
      anexoCaminho: dadosDoColaborador?.anexoCaminho || guardada?.anexoCaminho,
      corrigidoPor: corrigidoPor ? { id: corrigidoPor.id, nome: corrigidoPor.nome } : undefined,
      agora: new Date().toISOString(),
      novoId: () => `ajuste-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    });
    if (decisao.acao === 'nada') return { criou: false };
    if (decisao.reescrita) {
      const res = await this.gravarAjusteCorrigido(decisao.ajuste);
      if (!res.sucesso) return { criou: false, erro: res.erro };
      return { criou: false };
    }
    const ajuste = decisao.ajuste;

    if (usandoNuvem()) {
      const res = await nuvem.salvarAjuste(ajuste);
      if (!res.sucesso) {
        /**
         * FALHA AQUI NÃO PODE SER MUDA.
         *
         * Era um `return` seco. O efeito: a pessoa corrigia a batida, a
         * tela dizia "corrigido", e a apuração ANTIGA continuava na fila
         * — com o número de antes da correção. Dois lugares mostrando
         * dias diferentes do mesmo dia, e nenhum sinal de que algo falhou.
         *
         * E AGORA O MOTIVO SOBE, além de ir ao console.
         *
         * Dizia aqui que o aviso "não chega ao usuário por aqui, porque
         * esta função roda em cadeia atrás de outras telas". Era
         * verdade e virou desculpa: `reapurarPeriodo` chama esta função
         * em laço e é a tela que o RH usa justamente quando o saldo
         * está errado. Sem o motivo, ela dizia "0 dias mudaram de
         * valor" — a mesma frase de quando não havia nada a mudar.
         */
        console.error(
          `Apuração de ${data} de ${colaboradorId} NÃO foi gravada:`,
          res.erro
        );
        return { criou: false, erro: res.erro };
      }
    }

    const lista = this.lerAjustes().filter((a) => a.id !== ajuste.id);
    lista.push(ajuste);
    this.gravarAjustes(lista);
    this.notificar();

    /**
     * O DIA ENTROU NA FILA: quem acompanha é avisado.
     *
     * Só quando ele PASSA a esperar decisão. Reapurar um dia que já
     * estava na fila (a pessoa juntou o motivo, o RH recalculou) não é
     * novidade para ninguém, e avisar de novo ensinaria o gestor a
     * ignorar o aviso.
     */
    const dono = bancoDados.obterColaboradorPorId(colaboradorId);
    if (decisao.entrouNaFila && dono) {
      const todos = bancoDados.obterColaboradores();
      avisarPedidoDePonto({
        tabela: 'ajustes_jornada',
        id: ajuste.id,
        destinatarios: quemAcompanha((quem) => deveSerAvisadoSobre(quem, dono, todos)),
        secao: 'aprovar_jornadas',
        texto: `${descreverAjuste(ajuste, this.rotuloDoAjuste(ajuste))} · aguarda sua decisão`,
      });
    }

    return { criou: true, ajuste };
  }

  /**
   * Grava a apuração reescrita, no banco ANTES do aparelho.
   *
   * A ordem importa: gravar aqui e falhar lá deixaria a tela mostrando
   * um dia resolvido que o banco ainda tem como pendente — e a próxima
   * sincronização traria o número velho de volta, sem explicação.
   *
   * Foi exatamente isso que aconteceu com a correção do sábado: a tela
   * dizia "corrigido" e a fila seguia com o débito de antes.
   */
  private async gravarAjusteCorrigido(
    ajuste: AjusteJornada
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (usandoNuvem()) {
      const res = await nuvem.salvarAjuste(ajuste);
      if (!res.sucesso) {
        /**
         * A RECUSA SOBE. Não morre no console.
         *
         * Aqui só se escrevia `console.error` e voltava. A tela dizia
         * "0 dias mudaram de valor", que é o que ela também diz quando
         * não havia nada para mudar — e quem reapurava concluía que o
         * saldo estava certo.
         *
         * Foi assim que os −47h50 ficaram impossíveis de desfazer: a
         * reescrita batia na trava `minutos > 0` do banco, porque
         * zerar uma apuração grava exatamente ZERO. O banco recusava,
         * o console guardava o motivo, e ninguém olha console.
         *
         * É o terceiro erro deste sistema por resposta de banco
         * engolida. O `aviso-no-chat` e o login foram os outros dois.
         */
        console.error(`Apuração de ${ajuste.data} não foi reescrita:`, res.erro);
        return { sucesso: false, erro: res.erro };
      }
    }

    const lista = this.lerAjustes().filter((a) => a.id !== ajuste.id);
    lista.push(ajuste);
    this.gravarAjustes(lista);
    this.notificar();
    return { sucesso: true };
  }

  /**
   * Eu respondo pela jornada desta pessoa?
   *
   * Espelha a regra que vale no banco. Aqui ela serve para a tela não
   * oferecer um botão que o banco vai recusar — quem manda é a RLS.
   */
  podeDecidirSobre(solicitante: Colaborador): boolean {
    const eu = bancoDados.obterColaboradorAtual();

    // Quem decide é o organograma; a regra automática (líder do setor,
    // gerente da loja) só entra onde ele cala — para quem ainda não foi
    // posicionado na cadeia.
    return temAlcadaSobre(
      eu,
      solicitante,
      bancoDados.obterColaboradores(),
      regraAutomaticaDeAlcada
    );
  }

  /** Fila de quem aguarda decisão minha, da mais antiga para a mais nova. */
  obterPendenciasParaDecidir(): { ajuste: AjusteJornada; colaborador: Colaborador }[] {
    return this.lerAjustes()
      .filter((a) => a.estado === 'pendente')
      /*
        A FILA É O QUE ESTÁ NO BANCO, sem filtro que dependa do aparelho.

        Houve um filtro aqui tirando o "dia sem fechar" com batida no dia
        (o dia pela metade foi para "Pontos incompletos"). Ele perguntava ao
        CACHE se havia batida — e o cache é uma janela que as telas trocam:
        a fila oscilava entre 1 e 6, e cada subida virava um aviso
        (01/10/2026). Os pedidos antigos saem do BANCO
        (limpar-dias-sem-fechar.sql); os novos não nascem mais — o
        levantamento só cria a falta.
      */
      .map((ajuste) => ({
        ajuste,
        colaborador: bancoDados.obterColaboradorPorId(ajuste.colaboradorId),
      }))
      .filter(
        (item): item is { ajuste: AjusteJornada; colaborador: Colaborador } =>
          !!item.colaborador && this.podeDecidirSobre(item.colaborador)
      )
      .sort((a, b) => a.ajuste.data.localeCompare(b.ajuste.data));
  }

  /** Aprova ou recusa. Só entra no banco de horas o que for aprovado. */
  async decidirAjuste(
    ajusteId: string,
    aprovado: boolean,
    observacao?: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const eu = bancoDados.obterColaboradorAtual();
    const ajuste = this.lerAjustes().find((a) => a.id === ajusteId);
    if (!ajuste) return { sucesso: false, erro: 'Apuração não encontrada.' };

    const solicitante = bancoDados.obterColaboradorPorId(ajuste.colaboradorId);
    if (!solicitante || !this.podeDecidirSobre(solicitante)) {
      return {
        sucesso: false,
        erro: 'Você não responde por esta pessoa. A decisão cabe ao líder do setor ou ao gerente da loja.',
      };
    }

    if (!aprovado && !observacao?.trim()) {
      return { sucesso: false, erro: 'Informe o motivo da recusa.' };
    }

    const estado: EstadoAjuste = aprovado ? 'aprovado' : 'recusado';

    if (usandoNuvem()) {
      const res = await nuvem.decidirAjuste(
        ajusteId,
        estado,
        { id: eu.id, nome: eu.nome },
        observacao
      );
      if (!res.sucesso) return res;
    }

    const lista = this.lerAjustes().map((a) =>
      a.id === ajusteId
        ? {
            ...a,
            estado,
            aprovadorId: eu.id,
            aprovadorNome: eu.nome,
            decididoEm: new Date().toISOString(),
            observacao: observacao?.trim() || undefined,
          }
        : a
    );
    this.gravarAjustes(lista);

    bancoDados.registrarAuditoria(
      aprovado ? 'Aprovação de Jornada' : 'Recusa de Jornada',
      'seguranca',
      `${eu.nome} ${aprovado ? 'aprovou' : 'recusou'} ${formatarMinutos(ajuste.minutos)} de ${
        ROTULO_TIPO_AJUSTE[ajuste.tipo].toLowerCase()
      } de ${solicitante.nome} em ${formatarDataBR(ajuste.data)}.${
        observacao ? ` Motivo: ${observacao.trim()}` : ''
      }`
    );
    this.notificar();

    // Quem pediu fica sabendo sem precisar abrir o Ponto para conferir
    avisarDecisaoDePonto({
      tabela: 'ajustes_jornada',
      id: ajusteId,
      texto: textoDaDecisao(
        aprovado,
        descreverAjuste(ajuste, this.rotuloDoAjuste(ajuste)),
        aprovado ? undefined : observacao
      ),
    });
    return { sucesso: true };
  }

  /**
   * Saldo total do colaborador no banco de horas.
   *
   * Conta SÓ O QUE FOI APROVADO. A jornada que fechou fora da carga fica
   * pendente até alguém decidir — hora extra não autorizada não vira crédito,
   * e saída mais cedo não combinada não vira desconto por conta própria.
   */
  obterSaldoAcumulado(colaboradorId: string): number {
    return this.lerAjustes()
      .filter((a) => a.colaboradorId === colaboradorId && a.estado === 'aprovado')
      .reduce((total, a) => total + minutosComSinal(a), 0);
  }

  /** O que está esperando decisão, em minutos com sinal. */
  obterSaldoPendente(colaboradorId: string): number {
    return this.lerAjustes()
      .filter((a) => a.colaboradorId === colaboradorId && a.estado === 'pendente')
      .reduce((total, a) => total + minutosComSinal(a), 0);
  }

  /** Saldo apurado pelas batidas, antes de qualquer decisão. */
  obterSaldoApuradoPelasBatidas(colaboradorId: string): number {
    const datas = Array.from(
      new Set(
        this.lerRegistros()
          .filter((r) => r.colaboradorId === colaboradorId)
          .map((r) => r.data)
      )
    );
    return datas.reduce(
      (total, data) => total + this.obterJornadaDoDia(colaboradorId, data).saldoMinutos,
      0
    );
  }

  /** Dias com marcação registrada, do mais recente para o mais antigo. */
  obterDatasComRegistro(colaboradorId: string): string[] {
    return Array.from(
      new Set(
        this.lerRegistros()
          .filter((r) => r.colaboradorId === colaboradorId)
          .map((r) => r.data)
      )
    ).sort((a, b) => b.localeCompare(a));
  }

  // --- PAINEL DE RH ---

  /** RH e Administrador enxergam o painel completo de banco de horas. */
  podeAcessarPainelRH(colaborador: Colaborador): boolean {
    return cuidaDePessoas(colaborador);
  }

  /**
   * Quem publica e troca o código do cartaz de ponto de uma loja.
   *
   * RH, Diretoria e TI cuidam das cinco. O gerente cuida da DELE, e só —
   * trocar o código de outra unidade derrubaria o ponto de gente por quem
   * ele não responde.
   *
   * O líder de setor fica de fora: o cartaz é da loja, não do setor, e a
   * liderança de Compras atua em todas elas.
   */
  podeCuidarDoQrDaLoja(colaborador: Colaborador, loja: Loja): boolean {
    if (cuidaDePessoas(colaborador)) return true;
    return colaborador.nivel >= NIVEL_GERENTE && colaborador.loja === loja;
  }

  /** As lojas cujo cartaz esta pessoa pode ver e trocar. */
  lojasComQrQuePosso(colaborador: Colaborador): Loja[] {
    return LOJAS_COM_PONTO.filter((loja) => this.podeCuidarDoQrDaLoja(colaborador, loja));
  }

  /**
   * Colaboradores que o usuário logado pode acompanhar.
   *
   * É EXATAMENTE quem ele pode aprovar, mais ele mesmo. Antes esta lista
   * tinha a própria regra — o gerente aprovava pela cadeia mas enxergava a
   * loja inteira, e via saldo de gente sobre quem não decidia nada. Quem
   * aprova acompanha; quem não aprova não acompanha.
   *
   * Isso faz o organograma valer aqui também: pessoa posicionada só aparece
   * para a cadeia dela (e para RH, Diretoria e TI).
   */
  obterColaboradoresVisiveis(): Colaborador[] {
    const atual = bancoDados.obterColaboradorAtual();
    const todos = bancoDados.obterColaboradores().filter((c) => c.ativo);

    // RH, Diretoria e TI: a rede inteira
    if (cuidaDePessoas(atual)) return todos;

    // A própria pessoa sempre se vê: é o extrato dela
    return todos.filter(
      (c) =>
        c.id === atual.id ||
        temAlcadaSobre(atual, c, todos, regraAutomaticaDeAlcada)
    );
  }

  /**
   * O fechamento do saldo de compensação do sábado de uma pessoa num mês,
   * como a apuração da madrugada o gravou (`compensacao_sabado`).
   */
  compensacaoFechada(colaboradorId: string, mes: string): CompensacaoDoMes | null {
    return (
      lerLista<CompensacaoDoMes>(CHAVE_COMPENSACAO).find(
        (c) => c.colaboradorId === colaboradorId && c.mes === mes
      ) ?? null
    );
  }

  /** Linhas consolidadas do painel de RH para o período escolhido. */
  obterResumoDoPeriodo(dataInicio: string, dataFim: string): ResumoPontoColaborador[] {
    const hoje = dataDeHoje();

    return this.obterColaboradoresVisiveis()
      // Espelho é de quem bate ponto: a gerência não aparece aqui, nem no
      // CSV, nem na impressão da rede (que saem deste resumo)
      .filter(batePonto)
      .map((colaborador) => {
        const jornadas = this.obterJornadasDoPeriodo(colaborador.id, dataInicio, dataFim);

        const minutosTrabalhados = jornadas.reduce((t, j) => t + j.minutosTrabalhados, 0);
        const minutosPrevistos = jornadas
          .filter((j) => j.minutosTrabalhados > 0 || j.completa)
          .reduce((t, j) => t + j.minutosPrevistos, 0);
        const saldoPeriodoMinutos = jornadas.reduce((t, j) => t + j.saldoMinutos, 0);

        const diasCompletos = jornadas.filter((j) => j.completa).length;
        // Pendência: começou o dia e não fechou, ou dia útil passado sem jornada
        // A mesma regra de "Pontos incompletos" e do aviso no espelho
        const diasComPendencia = jornadas.filter(
          (j) => this.batidasQueFaltam(colaborador, j.data).length > 0
        ).length;
        // O dia vazio que virou falta já está no saldo; o que não virou, não
        const diasSemBatidaForaDaConta = jornadas
          .filter((j) => !j.falta && this.ehDiaVazio(colaborador, j.data, Object.keys(j.marcacoes).length))
          .map((j) => j.data);
        // A compensação do sábado juntada no período, e as folgas que a consomem
        const compensacaoMinutos = jornadas.reduce((t, j) => t + j.compensacaoMinutos, 0);
        const folgasDeSabado = jornadas.filter(
          (j) => ehSabado(j.data) && situacaoDoDia(colaborador.id, j.data) === 'folga'
        ).length;
        // O saldo que veio do mês anterior, como a madrugada o fechou
        const compensacaoAnteriorMinutos =
          this.compensacaoFechada(colaborador.id, mesAnterior(dataInicio.slice(0, 7)))?.saldoFinal ?? 0;

        return {
          colaborador,
          jornadas,
          minutosTrabalhados,
          minutosPrevistos,
          saldoPeriodoMinutos,
          saldoAcumuladoMinutos: this.obterSaldoAcumulado(colaborador.id),
          diasCompletos,
          diasComPendencia,
          diasSemBatidaForaDaConta,
          compensacaoMinutos,
          folgasDeSabado,
          compensacaoAnteriorMinutos,
          registrouHoje: this.obterMarcacoesDoDia(colaborador.id, hoje).length > 0,
          semBaterHoje: this.estaSemBaterHoje(colaborador),
        };
      })
      .sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome));
  }

  /**
   * Lança ou corrige uma marcação pelo RH. Exige justificativa e fica marcada
   * como ajuste, com o nome de quem alterou — nunca se confunde com uma
   * marcação feita pelo próprio funcionário no QR.
   */
  async ajustarMarcacao(dados: {
    colaboradorId: string;
    data: string;
    tipo: TipoMarcacao;
    hora: string; // "HH:MM"
    justificativa: string;
  }): Promise<{ sucesso: boolean; registro?: RegistroPonto; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();

    const colaborador = bancoDados.obterColaboradorPorId(dados.colaboradorId);
    if (!colaborador) {
      return { sucesso: false, erro: 'Colaborador não encontrado.' };
    }
    if (!aceitaMarcacaoNoDia(dados.data)) return { sucesso: false, erro: RECUSA_DE_DOMINGO };

    /**
     * QUEM CORRIGE: o RH, e quem responde pela pessoa.
     *
     * Era só do RH. Passou a valer também para o líder e o gerente porque a
     * fila de aprovação ficava sem saída: o responsável via o dia fechado
     * errado, sabia o horário certo, e só podia aprovar o errado ou recusar.
     *
     * O alcance é o MESMO do aprovar — `podeDecidirSobre`, que é a cadeia do
     * organograma. Uma segunda regra aqui divergiria da fila, e alguém
     * acabaria podendo corrigir o dia de quem não aprova.
     */
    const ehDaCadeia = this.podeDecidirSobre(colaborador);
    if (!this.podeAcessarPainelRH(atual) && !ehDaCadeia) {
      return {
        sucesso: false,
        erro: 'Corrigir marcação é de quem responde por esta pessoa, ou do RH.',
      };
    }
    if (!dados.justificativa.trim()) {
      return { sucesso: false, erro: 'Informe a justificativa do ajuste.' };
    }

    // Corrigir exige saber o que está gravado agora: se a pessoa bateu o ponto
    // enquanto o RH tinha a tela aberta, o cache antigo criaria uma segunda
    // marcação em vez de corrigir a que existe.
    if (usandoNuvem()) {
      await nuvem.sincronizarPonto();
    }

    const partes = dados.hora.split(':');
    const horas = Number(partes[0]);
    const minutos = Number(partes[1]);
    if (!Number.isInteger(horas) || !Number.isInteger(minutos) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
      return { sucesso: false, erro: 'Horário inválido. Use o formato HH:MM.' };
    }

    const base = deDataLocal(dados.data);
    const horario = new Date(base.getFullYear(), base.getMonth(), base.getDate(), horas, minutos, 0);

    const registros = this.lerRegistros();
    const indice = registros.findIndex(
      (r) => r.colaboradorId === dados.colaboradorId && r.data === dados.data && r.tipo === dados.tipo
    );

    /**
     * O horário que estava lá antes.
     *
     * A correção SOBRESCREVE a batida — foi a forma escolhida, e o espelho
     * passa a mostrar o horário certo. Só que aí o que a pessoa bateu não
     * fica em lugar nenhum, e ponto é registro trabalhista.
     *
     * Guardar na Auditoria não muda o documento e deixa o original
     * recuperável. Precisa ser lido AGORA: daqui a três linhas a posição já
     * foi reescrita.
     */
    const horaAnterior = indice !== -1 ? registros[indice].horaFormatada : null;

    const registroAjustado: RegistroPonto = {
      id: indice !== -1 ? registros[indice].id : `ponto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      colaboradorId: dados.colaboradorId,
      data: dados.data,
      tipo: dados.tipo,
      horario: horario.toISOString(),
      horaFormatada: `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`,
      // O espelho precisa dizer a verdade sobre quem escreveu a marcação:
      // "corrigido pelo RH" e "corrigido pelo responsável" não são a mesma
      // coisa na hora de conferir o documento
      metodo: this.podeAcessarPainelRH(atual) ? 'ajuste_rh' : 'ajuste_lider',
      loja: indice !== -1 ? registros[indice].loja : colaborador.loja,
      criadoEm: indice !== -1 ? registros[indice].criadoEm : new Date().toISOString(),
      ajustadoPorId: atual.id,
      ajustadoPorNome: atual.nome,
      justificativa: dados.justificativa.trim(),
    };

    if (usandoNuvem()) {
      const res = await nuvem.salvarAjustePonto(registroAjustado);
      if (!res.sucesso) {
        /**
         * O MOTIVO DE VERDADE, e não "verifique a conexão".
         *
         * A mensagem antiga mandava a líder olhar o wi-fi enquanto o banco
         * recusava por permissão. Ela conferiu a conexão, estava boa, e o
         * defeito chegou aqui como "não funciona" — sem a única informação
         * que resolveria.
         *
         * Tela que inventa a causa custa uma rodada inteira de diagnóstico.
         */
        return {
          sucesso: false,
          erro: res.erro
            ? `Não foi possível gravar a correção: ${res.erro}`
            : 'Não foi possível gravar a correção. Verifique a conexão.',
        };
      }
    }

    if (indice !== -1) {
      registros[indice] = registroAjustado;
    } else {
      registros.push(registroAjustado);
    }
    this.gravarRegistros(registros);

    /**
     * Corrigir marcação muda o dia, e a apuração é refeita.
     *
     * `atual` vai junto porque quem corrigiu JÁ DECIDIU: a autoridade dele
     * sobre esta pessoa foi conferida lá em cima, e o dia sai aprovado em
     * nome dele em vez de ir para a fila de um terceiro.
     */
    await this.apurarDia(dados.colaboradorId, dados.data, undefined, atual);

    bancoDados.registrarAuditoria(
      indice !== -1 ? 'Correção de Ponto' : 'Lançamento Manual de Ponto',
      'seguranca',
      `${atual.nome} ${indice !== -1 ? 'corrigiu' : 'lançou'} ${ROTULO_MARCACAO[dados.tipo].toLowerCase()} de ${colaborador.nome} em ${formatarDataBR(dados.data)}${
        horaAnterior ? ` de ${horaAnterior}` : ''
      } para ${registroAjustado.horaFormatada}. Motivo: ${registroAjustado.justificativa}`
    );
    this.notificar();
    return { sucesso: true, registro: registroAjustado };
  }

  /**
   * REAPURA UM PERÍODO INTEIRO com a regra de hoje.
   *
   * A apuração de um dia só é refeita quando alguém bate ou corrige uma
   * marcação daquele dia. É de propósito — refazer sozinho seria reabrir
   * decisão tomada. Mas isso deixa um rastro: quando a REGRA muda, os
   * dias já apurados guardam o número antigo para sempre.
   *
   * Foi o que aconteceu com a Lyvia. O espelho dela mostrava dois
   * números que não conversavam: −47h50 no acumulado, vindo dos ajustes
   * gravados com a jornada errada, e o saldo do período recalculado na
   * hora. Corrigir dia a dia seriam três semanas de cliques.
   *
   * NÃO É UM APAGADOR. Cada dia passa pela mesma `apurarDia` que a
   * batida usa — a regra é uma só, e reescrever aqui uma segunda versão
   * dela é como as contas deste sistema passariam a divergir. O que
   * muda é só quem disparou.
   *
   * Quem reapura DECIDE: a autoridade é a mesma de corrigir a marcação,
   * e o dia sai aprovado em nome de quem mandou, como na correção
   * manual. Reapurar para jogar tudo na fila do líder seria transformar
   * um conserto de sistema em trabalho para outra pessoa.
   */
  async reapurarPeriodo(
    colaboradorId: string,
    dataInicio: string,
    dataFim: string
  ): Promise<{ sucesso: boolean; dias: number; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);

    if (!colaborador) {
      return { sucesso: false, dias: 0, erro: 'Colaborador não encontrado.' };
    }

    // A MESMA porta de `ajustarMarcacao`: quem corrige o dia reapura o dia
    if (!this.podeAcessarPainelRH(atual) && !this.podeDecidirSobre(colaborador)) {
      return {
        sucesso: false,
        dias: 0,
        erro: 'Reapurar é de quem responde por esta pessoa, ou do RH.',
      };
    }

    /**
     * O banco antes do aparelho, como no resto do ponto: reapurar sobre
     * cache velho reescreveria dias com marcações que já mudaram.
     */
    if (usandoNuvem()) {
      await nuvem.sincronizarPonto();
      await nuvem.sincronizarAjustes();
    }

    let dias = 0;
    /**
     * O DIA QUE O BANCO RECUSOU TAMBÉM SE CONTA.
     *
     * Sem isto, reapurar terminava dizendo "0 dias mudaram de valor" —
     * exatamente o que ele diz quando não havia nada a mudar. Quem
     * reapurava um saldo errado concluía que o saldo estava certo.
     *
     * E havia o que recusar: zerar uma apuração grava `minutos = 0`, e o
     * banco tinha `check (minutos > 0)`. A reescrita batia na trava,
     * voltava calada, e os −47h50 não saíam de lá por caminho nenhum.
     */
    const recusados: string[] = [];

    for (const data of listarDatasDoPeriodo(dataInicio, dataFim)) {
      // Dia que ainda não fechou não se apura: ele não acabou
      if (data >= dataDeHoje()) continue;

      const antes = this.obterAjusteDoDia(colaboradorId, data);
      const res = await this.apurarDia(colaboradorId, data, undefined, atual);
      const depois = this.obterAjusteDoDia(colaboradorId, data);

      if (res.erro) recusados.push(`${formatarDataBR(data)}: ${res.erro}`);
      else if ((antes?.minutos ?? 0) !== (depois?.minutos ?? 0)) dias += 1;
    }

    bancoDados.registrarAuditoria(
      'Reapuração de Período',
      'seguranca',
      `${atual.nome} reapurou ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)} de ${colaborador.nome}. ${dias} dia(s) mudaram de valor.${
        recusados.length ? ` ${recusados.length} dia(s) RECUSADOS pelo banco.` : ''
      }`
    );
    this.notificar();

    if (recusados.length > 0) {
      return {
        sucesso: false,
        dias,
        erro: `O banco recusou ${recusados.length} dia(s). Primeiro: ${recusados[0]}`,
      };
    }

    return { sucesso: true, dias };
  }

  /**
   * PREENCHE OS DIAS VAZIOS com o horário do turno da pessoa.
   *
   * O RH precisava digitar quatro batidas por pessoa por dia para fechar
   * um mês. Com 89 pessoas isso não se faz, e o que não se faz vira
   * espelho incompleto — que é pior do que o trabalho.
   *
   * ===================================================================
   * O QUE ISTO É, E O QUE ELE NÃO PODE VIRAR
   * ===================================================================
   *
   * Isto CRIA registro de ponto por dedução: o sistema afirmando que a
   * pessoa cumpriu o turno num dia em que ninguém bateu nada. É
   * documento trabalhista, e por isso vem com quatro travas:
   *
   *  1. SÓ DIA COMPLETAMENTE VAZIO. Uma batida que seja, e o dia fica
   *     como está — dia pela metade é justamente o que precisa de gente
   *     olhando, e preencher o resto apagaria a pergunta.
   *  2. MÉTODO PRÓPRIO. `preenchimento_turno` não se confunde com batida
   *     nem com correção: tem cor no espelho e sai na Auditoria.
   *  3. SÓ DIA QUE JÁ FECHOU, e só dia que a pessoa deveria trabalhar —
   *     domingo, feriado, folga aprovada e sábado de quem não vem ficam
   *     de fora.
   *  4. EXIGE JUSTIFICATIVA, como qualquer lançamento manual.
   *
   * Nenhuma delas é excesso de zelo: sem a primeira, o preenchimento
   * esconderia uma saída não batida; sem a segunda, a fiscalização não
   * teria como separar o que foi batido do que foi suposto.
   */
  async preencherEspelhoPeloTurno(dados: {
    colaboradorId: string;
    dataInicio: string;
    dataFim: string;
    justificativa: string;
  }): Promise<{ sucesso: boolean; dias: number; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    const colaborador = bancoDados.obterColaboradorPorId(dados.colaboradorId);

    if (!colaborador) {
      return { sucesso: false, dias: 0, erro: 'Colaborador não encontrado.' };
    }
    if (!this.podeAcessarPainelRH(atual) && !this.podeDecidirSobre(colaborador)) {
      return {
        sucesso: false,
        dias: 0,
        erro: 'Preencher espelho é de quem responde por esta pessoa, ou do RH.',
      };
    }
    if (!dados.justificativa.trim()) {
      return { sucesso: false, dias: 0, erro: 'Informe o motivo do preenchimento.' };
    }

    // O banco antes do aparelho: preencher sobre cache velho criaria
    // batida em dia que já tinha marcação lançada de outro lugar
    if (usandoNuvem()) await nuvem.sincronizarPonto();

    const turno = turnoDe(colaborador);
    let dias = 0;

    for (const data of listarDatasDoPeriodo(dados.dataInicio, dados.dataFim)) {
      // TRAVA 1: uma batida que seja, e o dia fica como está. Dia que não é
      // dela (domingo, feriado, folga, ausência) também não: `ehDiaVazio`,
      // a mesma regra que conta o espelho incompleto
      const jaTem = this.obterMarcacoesDoDia(dados.colaboradorId, data);
      if (!this.ehDiaVazio(colaborador, data, jaTem.length)) continue;
      const esperadas = marcacoesEsperadas(data, colaborador);

      const horarios = this.horariosDoTurnoParaODia(turno, data, esperadas);
      if (!horarios) continue;

      for (const [tipo, hora] of horarios) {
        const base = deDataLocal(data);
        const [h, m] = hora.split(':').map(Number);
        const horario = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0);

        const registro: RegistroPonto = {
          id: `ponto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          colaboradorId: dados.colaboradorId,
          data,
          tipo,
          horario: horario.toISOString(),
          horaFormatada: hora,
          metodo: 'preenchimento_turno',
          loja: colaborador.loja,
          criadoEm: new Date().toISOString(),
          ajustadoPorId: atual.id,
          ajustadoPorNome: atual.nome,
          justificativa: dados.justificativa.trim(),
        };

        if (usandoNuvem()) {
          const res = await nuvem.salvarRegistroPonto(registro);
          if (!res.sucesso && !res.duplicado) {
            return {
              sucesso: false,
              dias,
              erro: `Não foi possível gravar ${formatarDataBR(data)}: ${res.erro || 'recusado pelo banco'}`,
            };
          }
        }

        const registros = this.lerRegistros();
        registros.push(registro);
        this.gravarRegistros(registros);
      }

      await this.apurarDia(dados.colaboradorId, data, undefined, atual);
      dias += 1;
    }

    if (dias > 0) {
      bancoDados.registrarAuditoria(
        'Preenchimento de Espelho',
        'seguranca',
        `${atual.nome} preencheu ${dias} dia(s) vazio(s) de ${colaborador.nome} entre ${formatarDataBR(dados.dataInicio)} e ${formatarDataBR(dados.dataFim)} com o horário do turno ${turno.nome}. Motivo: ${dados.justificativa.trim()}`
      );
    }
    this.notificar();

    return { sucesso: true, dias };
  }

  /**
   * Os horários que o turno prevê para AQUELE dia, na ordem das batidas.
   *
   * Separado porque o sábado tem relógio próprio e o dia útil depende de
   * o turno ter almoço — e embutir isso no laço do preenchimento faria a
   * mesma decisão existir em dois lugares.
   */
  private horariosDoTurnoParaODia(
    turno: Turno,
    data: string,
    esperadas: TipoMarcacao[]
  ): Array<[TipoMarcacao, string]> | null {
    if (ehSabado(data)) {
      return [
        ['entrada', TURNO_SABADO.entrada],
        ['saida', TURNO_SABADO.saida],
      ];
    }

    if (esperadas.length === 4 && turno.intervalo) {
      return [
        ['entrada', turno.entrada],
        ['saida_almoco', turno.intervalo.saida],
        ['retorno_almoco', turno.intervalo.retorno],
        ['saida', turno.saida],
      ];
    }

    if (esperadas.length === 2) {
      return [
        ['entrada', turno.entrada],
        ['saida', turno.saida],
      ];
    }

    // Combinação que o turno não sabe desenhar: melhor não inventar nada
    return null;
  }

  /** Remove uma marcação lançada por engano. Só RH/Administrador. */
  async removerMarcacao(
    registroId: string,
    justificativa: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    if (!this.podeAcessarPainelRH(atual)) {
      return { sucesso: false, erro: 'Apenas RH e Administrador podem remover marcações.' };
    }
    if (!justificativa.trim()) {
      return { sucesso: false, erro: 'Informe a justificativa da remoção.' };
    }

    const registros = this.lerRegistros();
    const alvo = registros.find((r) => r.id === registroId);
    if (!alvo) return { sucesso: false, erro: 'Marcação não encontrada.' };

    const colaborador = bancoDados.obterColaboradorPorId(alvo.colaboradorId);

    if (usandoNuvem()) {
      const res = await nuvem.removerRegistroPonto(registroId);
      if (!res.sucesso) {
        return {
          sucesso: false,
          erro: 'Não foi possível remover a marcação no banco. Verifique a conexão.',
        };
      }
    }

    this.gravarRegistros(registros.filter((r) => r.id !== registroId));

    bancoDados.registrarAuditoria(
      'Remoção de Marcação de Ponto',
      'seguranca',
      `${atual.nome} removeu ${ROTULO_MARCACAO[alvo.tipo].toLowerCase()} de ${colaborador?.nome || 'colaborador removido'} em ${formatarDataBR(alvo.data)}. Motivo: ${justificativa.trim()}`
    );
    this.notificar();
    return { sucesso: true };
  }

  /**
   * Apaga os registros de um colaborador removido do sistema. No modo rede o
   * banco já elimina as marcações junto com a ficha (`on delete cascade`);
   * aqui só resta limpar o cache deste aparelho.
   */
  removerRegistrosDoColaborador(colaboradorId: string): void {
    const registros = this.lerRegistros();
    const restantes = registros.filter((r) => r.colaboradorId !== colaboradorId);
    if (restantes.length !== registros.length) {
      this.gravarRegistros(restantes);
      this.notificar();
    }
  }

  /**
   * Exportação do espelho de ponto em CSV. Passando `colaboradorIds`, exporta
   * só quem está em tela (a loja aberta ou o resultado da busca).
   */
  gerarCsvDoPeriodo(dataInicio: string, dataFim: string, colaboradorIds?: string[]): string {
    /**
     * A identificação da pessoa vai em TODA linha, não só no nome.
     *
     * O arquivo costuma ser aberto na planilha e filtrado por unidade ou por
     * empregador. Sem matrícula e CNPJ em cada linha, quem recebe tem que
     * cruzar com outra fonte para saber de quem é cada jornada — e é
     * justamente esse cruzamento manual que gera erro em documento
     * trabalhista.
     */
    /**
     * A ÚLTIMA COLUNA É O RASTRO QUE SAIU DO PAPEL.
     *
     * O espelho impresso deixou de trazer a relação de marcações
     * lançadas pelo RH — no papel ela empurrava as assinaturas para uma
     * segunda folha. Mas o rastro não podia sumir junto: é documento
     * trabalhista, e "quem lançou este horário" é a pergunta que uma
     * fiscalização faz.
     *
     * Aqui ele cabe. Coluna a mais numa planilha não custa folha, e é
     * neste arquivo que quem audita trabalha.
     *
     * SÓ O QUE FOGE DO NORMAL entra: a marcação batida no QR pela
     * própria pessoa deixa a célula vazia. Escrever "QR" em quatro
     * colunas de todos os dias é o ruído que já tinha derrubado esta
     * informação da grade impressa uma vez.
     */
    const linhas: string[] = [
      'Colaborador;Matricula;CNPJ;Cargo;Loja;Setor;Data;Entrada;Saida almoco;Retorno almoco;Saida;Trabalhado;Previsto;Relogio;Entrada/Saida;Almoco;Tolerancia aplicada;Saldo do dia;Lancamentos manuais',
    ];

    const todos = this.obterResumoDoPeriodo(dataInicio, dataFim);
    const selecionados = colaboradorIds
      ? todos.filter((r) => colaboradorIds.includes(r.colaborador.id))
      : todos;

    for (const resumo of selecionados) {
      for (const jornada of resumo.jornadas) {
        const temAlgo = Object.keys(jornada.marcacoes).length > 0;
        if (!temAlgo) continue;
        const auditoria = auditarDia(jornada.tolerancia, jornada.saldoBrutoMinutos);

        const lancadasPorOutro = ORDEM_MARCACOES.map((t) => jornada.marcacoes[t])
          .filter((r): r is RegistroPonto => !!r)
          .filter((r) => !this.foiBatidaPelaPessoa(r))
          .map((r) => `${ROTULO_MARCACAO[r.tipo]}: ${this.descreverOrigem(r)}`)
          .join(' | ')
          /* O separador do arquivo é `;`, e a justificativa é texto
             livre — um ponto e vírgula digitado ali partiria a linha em
             duas colunas no meio da planilha de quem abrir */
          .replace(/;/g, ',');

        linhas.push(
          [
            resumo.colaborador.nome,
            resumo.colaborador.matricula || '',
            resumo.colaborador.cnpj || '',
            resumo.colaborador.cargo,
            resumo.colaborador.loja,
            resumo.colaborador.setor,
            formatarDataBR(jornada.data),
            jornada.marcacoes.entrada?.horaFormatada || '',
            jornada.marcacoes.saida_almoco?.horaFormatada || '',
            jornada.marcacoes.retorno_almoco?.horaFormatada || '',
            jornada.marcacoes.saida?.horaFormatada || '',
            formatarMinutos(jornada.minutosTrabalhados),
            /* O previsto do dia, com a pausa do estágio já descontada: é o que
               faz Trabalhado − Previsto dar exatamente a coluna Relógio */
            formatarMinutos(jornada.minutosPrevistosEfetivos),
            formatarSaldo(jornada.saldoBrutoMinutos),
            auditoria.entradaESaida,
            auditoria.intervalo,
            formatarSaldo(auditoria.tolerado),
            formatarSaldo(jornada.saldoMinutos),
            lancadasPorOutro,
          ].join(';')
        );
      }
    }

    return linhas.join('\n');
  }

  /** Origem da marcação, por extenso, para a coluna de lançamentos do CSV. */
  private descreverOrigem(registro: RegistroPonto): string {
    const quem = registro.ajustadoPorNome || 'RH';
    const porque = registro.justificativa ? `: ${registro.justificativa}` : '';

    if (registro.metodo === 'ajuste_rh') return `Ajuste RH — ${quem}${porque}`;

    /**
     * OS DOIS QUE FALTAVAM, e o silêncio deles era grave.
     *
     * `ajuste_lider` e `preenchimento_turno` não tinham linha aqui e caíam
     * no `return` final — o espelho imprimia "QR — Pirassununga" num
     * horário que a pessoa NÃO bateu.
     *
     * Num documento que se assina e se arquiva, isso é o sistema
     * afirmando uma batida que não houve. O preenchimento é o pior dos
     * dois: ele foi deduzido do turno, e sem esta linha nada no papel
     * diria isso.
     */
    if (registro.metodo === 'ajuste_lider') return `Correção — ${quem}${porque}`;
    if (registro.metodo === 'preenchimento_turno') {
      return `Preenchido pelo horário do turno — ${quem}${porque}`;
    }

    if (registro.metodo === 'codigo_manual') return `Código digitado — ${registro.loja}`;
    return `QR — ${registro.loja}`;
  }

  /** A marcação foi batida pela pessoa, ou escrita por alguém/pelo sistema? */
  private foiBatidaPelaPessoa(registro: RegistroPonto): boolean {
    return registro.metodo === 'qrcode' || registro.metodo === 'codigo_manual';
  }

  /**
   * Espelho de ponto pronto para impressão, uma folha por colaborador.
   * Traz a jornada dia a dia, a origem de cada marcação, os totais do período
   * e as linhas de assinatura do colaborador e do responsável.
   */
  gerarHtmlEspelho(dataInicio: string, dataFim: string, colaboradorIds?: string[]): string {
    const todos = this.obterResumoDoPeriodo(dataInicio, dataFim);
    const selecionados = colaboradorIds
      ? todos.filter((r) => colaboradorIds.includes(r.colaborador.id))
      : todos;

    const escapar = (texto: string): string =>
      texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const folhas = selecionados
      .map((resumo) => {
        const c = resumo.colaborador;
        /**
         * A JORNADA DO DOCUMENTO É A DO TURNO DA PESSOA.
         *
         * Era `cargaHorariaDiariaMinutos ?? 8h00`: quem cumpre o turno A
         * (8h10) sem carga própria na ficha saía no papel como "8h00 por
         * dia útil" — um número contra o qual nenhum saldo dele foi
         * apurado. Só a carga própria da ficha, quando existe, vence o
         * turno, e é a mesma precedência de `cargaPrevistaEmMinutos`.
         */
        // A jornada da CLT (8h no turno integral), e não o relógio do turno
        const jornadaContratada = minutosDeDiaUtilDe(c);
        const compensacao = compensacaoDoSabadoDe(c);
        /*
          Só a carga. O horário do almoço saiu a pedido do Elias (01/10/2026):
          o turno, na linha ao lado, já diz o horário — repetir o almoço aqui
          só alongava a linha.
        */
        const horarioContratado =
          c.cargaHorariaDiariaMinutos != null
            ? `${formatarMinutos(jornadaContratada)} por dia útil (carga própria da ficha)`
            : `${formatarMinutos(jornadaContratada)} por dia útil${
                compensacao > 0 ? ` + ${formatarMinutos(compensacao)} de compensação do sábado` : ''
              }`;

        // A identificação vem da ficha, não de uma lista escrita aqui. É o
        // que garante que campo novo no cadastro (o CNPJ foi o último)
        // apareça no documento sem ninguém lembrar de vir editar isto.
        const responsavel = c.responsavelId
          ? bancoDados.obterColaboradorPorId(c.responsavelId) || null
          : null;
        const camposDaIdentificacao = linhasDeIdentificacao(c, responsavel).map((campo) =>
          campo.chave === 'jornada'
            ? // A jornada do documento é a que vale de fato: sem o contratado
              // preenchido, corre a carga padrão da rede, e o espelho tem de
              // dizer contra qual jornada o saldo foi apurado.
              { ...campo, valor: horarioContratado }
            : campo
        );
        camposDaIdentificacao.push(
          { chave: 'contato', rotulo: 'Contato', valor: contatoEmLinha(c) },
          { chave: 'emissao', rotulo: 'Emitido em', valor: formatarDataBR(dataDeHoje()) }
        );

        const identificacaoEmLinhas = camposDaIdentificacao
          .reduce<string[]>((linhas, campo, indice) => {
            const celula = `<td><strong>${escapar(campo.rotulo)}:</strong> ${escapar(
              campo.valor || '—'
            )}</td>`;
            if (indice % 2 === 0) linhas.push(`<tr>${celula}`);
            else linhas[linhas.length - 1] += `${celula}</tr>`;
            return linhas;
          }, [])
          // Número ímpar de campos deixaria a última linha aberta
          .map((linha) => (linha.endsWith('</tr>') ? linha : `${linha}<td></td></tr>`))
          .join('\n');

        /* O rodapé fecha a conta (ver `totaisDoEspelho`) */
        const rodape = linhasDoRodape(totaisDoEspelho(resumo))
          .map(
            (l) => `<tr class="${l.destaque ? 'destaque' : ''} ${l.alerta ? 'alerta' : ''}">
              <td>${escapar(l.rotulo)}</td>
              <td class="num ${l.comSinal && l.minutos < 0 ? 'neg' : ''}">${
                l.texto ?? (l.comSinal ? formatarSaldo(l.minutos) : formatarMinutos(l.minutos))
              }</td>
            </tr>`
          )
          .join('');

        /**
         * TODOS OS DIAS DO PERÍODO. Pedido do Elias: o espelho mostra a
         * semana inteira — domingo escrito "Domingo", feriado com o nome
         * dele. Antes só entravam dias com batida ou com previsto, e o
         * domingo e o feriado fechado sumiam, deixando buracos nas datas.
         */
        const dias = resumo.jornadas;

        /**
         * A ORIGEM DE CADA MARCAÇÃO NÃO SAI NESTE PAPEL.
         *
         * Passou por duas formas antes desta. Primeiro era uma COLUNA da
         * grade, com até quatro frases por dia — "Entrada: QR —
         * Pirassununga | Saída almoço: QR — ...". Ela quebrava linha,
         * cada dia virava três ou quatro alturas, e o mês de 31 dias não
         * cabia na folha de pé: o espelho saía em duas páginas.
         *
         * Depois virou uma coluna estreita de número com a relação por
         * extenso no rodapé. Melhor, e ainda assim: num mês movimentado
         * a lista passava de vinte linhas e empurrava as assinaturas
         * para a segunda folha — pelo mesmo motivo de antes, só que
         * embaixo.
         *
         * Agora sai de vez, por decisão do Elias. O RASTRO FICA, em três
         * lugares melhores que o rodapé de um impresso:
         *
         *   · o `*` ao lado do horário lançado pelo RH
         *   · o CSV do período, com a origem de CADA marcação
         *   · a Auditoria, com quem lançou, quando e por quê
         *
         * O que saiu foi a repetição no papel, e não o registro.
         */
        const linhas = dias
          .map((j) => {
            const l = linhaDoEspelho(j, resumo.colaborador);

            /* O dia inteiro sem jornada é uma célula só (ver `linhaDoEspelho`) */
            const celulas = l.diaSemJornada
              ? `<td class="hora naoSeAplica diaSemJornada" colspan="${l.celulas.length}">${escapar(
                  l.diaSemJornada
                )}</td>`
              : l.celulas
                  .map((c) => {
                    /* O horário batido vence o rótulo: o documento mostra o que aconteceu */
                    if (!c.registro && c.motivo) {
                      return `<td class="hora naoSeAplica">${escapar(c.motivo)}</td>`;
                    }
                    const ajuste = c.registro && ehMarcacaoCorrigida(c.registro.metodo) ? ' *' : '';
                    return `<td class="hora">${c.registro ? c.registro.horaFormatada + ajuste : '--:--'}</td>`;
                  })
                  .join('');

            return `<tr class="${l.semMarcacao ? 'vazio' : ''}">
              <td class="dia">${formatarDataBR(l.data)} <span class="semana">${l.semana}</span></td>
              ${celulas}
              <td class="num">${formatarMinutos(l.previsto)}</td>
              <td class="num">${formatarMinutos(l.trabalhado)}</td>
              <td class="num">${l.falta ? 'Falta' : l.relogio === null ? '—' : formatarSaldo(l.relogio)}</td>
              <td class="num ${(l.saldo ?? 0) < 0 ? 'neg' : ''}">${
                l.saldo === null ? '—' : formatarSaldo(l.saldo)
              }</td>
            </tr>`;
          })
          .join('');

        return `<section class="folha">
          <header class="topo">
            <div>
              <h1>ESPELHO DE PONTO</h1>
              <p class="empresa">Malachias Autopeças · CONECTA</p>
            </div>
            <div class="periodo">
              <strong>Período apurado</strong><br>
              ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}
            </div>
          </header>

          <table class="ficha">
            ${identificacaoEmLinhas}
          </table>

          <table class="marcacoes">
            <thead>
              <tr>
                <th>Data</th>
                <th>Entrada</th>
                <th>Saída<br>almoço</th>
                <th>Retorno<br>almoço</th>
                <th>Saída</th>
                <th>Previsto</th>
                <th>Trabalhado</th>
                <th>Relógio</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>

          ${/*
            A CONTA DE CADA DIA, À VISTA — pedido do Elias: "quero conseguir
            auditar matematicamente todos os valores exibidos no espelho".
            Cada coluna sai da anterior; a legenda diz como.
          */ ''}
          <p class="legenda">
            <strong>Como se lê a conta do dia.</strong>
            Previsto é a jornada do turno para aquele dia. Trabalhado é o tempo entre a
            entrada e a saída, descontado o almoço. Relógio é a diferença entre o trabalhado
            e o previsto, exatamente como o relógio marcou. Saldo é o que vale para o banco de
            horas (art. 58, §1º da CLT): o dia que fecha até 5 minutos acima ou abaixo do
            previsto não gera saldo; e pequenas variações de horário não contam —
            até 5 minutos na entrada e até 5 na saída, no máximo 10 somando as duas,
            e até 5 minutos somando a saída e a volta do almoço. Quando uma variação passa desses
            limites, ela conta. O Saldo nunca passa do Relógio: pode ser menor, ou zero.
          </p>

          <table class="totais">${rodape}</table>

          ${/*
            A RELAÇÃO DE NOTAS SAIU DO PAPEL — decisão do Elias.

            Era um bloco no rodapé listando, dia a dia, cada marcação que
            não foi batida pela própria pessoa: "12/09 — Entrada:
            corrigido por Rita | Saída: preenchido pelo turno". Num mês
            movimentado a lista passava de vinte linhas e empurrava as
            assinaturas para uma segunda folha.

            O RASTRO NÃO SE PERDEU, e é por isso que dá para tirar:

              · o `*` continua ao lado do horário lançado pelo RH
              · o CSV do período traz a origem de CADA marcação
              · a Auditoria guarda quem lançou, quando e por quê

            Ou seja, o que saiu foi a REPETIÇÃO no papel, não o registro.
            Quem precisar auditar tem dois lugares melhores que o rodapé
            de um espelho impresso.
          */ ''}

          <div class="assinaturas">
            <div><span class="linha"></span>Assinatura do colaborador</div>
            <div><span class="linha"></span>Responsável / RH</div>
          </div>
        </section>`;
      })
      .join('');

    /**
     * O ESTILO COMUM MORA EM `documento`.
     *
     * Aqui fica só o que é deste papel: a grade de marcações e o quadro de
     * totais. Cabeçalho, bordas, assinaturas e fonte de número são os
     * mesmos de qualquer documento da Malachias — e é por isso que a
     * escala de folgas agora sai parecida com este.
     */
    return montarDocumento({
      titulo: `Espelho de Ponto — ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}`,
      /**
       * A FOLHA FICA DE PÉ.
       *
       * Estava em paisagem porque a grade tem sete colunas e coube melhor
       * deitada. Só que espelho de ponto é documento que se arquiva, se
       * assina e se entrega — e no meio de uma pasta de papel de pé, uma
       * folha deitada é a que some.
       */
      orientacao: 'retrato',
      estiloExtra: `
  /*
    OS NÚMEROS ENCOLHERAM PARA A FOLHA DE PÉ.

    Em paisagem sobravam ~90mm de largura para as sete colunas. De pé
    sobram ~65mm, e o que estourava primeiro era a coluna de origem —
    ela empurrava as marcações e quebrava o horário em duas linhas, que
    num documento de ponto é o pior lugar para haver dúvida.
  */
  .marcacoes { font-size: 10px; table-layout: fixed; }
  /*
    O MÊS INTEIRO NUMA FOLHA. Com todos os dias no espelho (domingo e
    feriado inclusive, pedido do Elias), 31 linhas mais o rodapé passavam
    da página: as linhas ficaram mais baixas, e o rodapé também.
  */
  .marcacoes th { background: #eee; border: 1px solid #999; padding: 3px 2px; font-size: 8.5px; text-transform: uppercase; }
  .marcacoes td { border: 1px solid #bbb; padding: 1.5px 2px; text-align: center; line-height: 1.25; }
  .marcacoes .diaSemJornada { letter-spacing: 0.02em; }
  .marcacoes .dia { text-align: left; white-space: nowrap; font-weight: 600; font-size: 9px; }
  /* O dia da semana à vista: em cinza claro ele sumia na impressão */
  .semana { font-weight: 600; color: #222; text-transform: capitalize; }
  /*
    A NOTA É UM NÚMERO, e a coluna tem largura de número.

    Enquanto ali cabia texto livre, a linha do dia crescia junto e o mês
    não fechava numa folha. Agora ela não quebra: o que cresce é o rodapé,
    e ele cresce uma vez por documento, não uma vez por dia.
  */
  .marcacoes .nota-ref { width: 22px; font-size: 9px; color: #555; }
  .notas { margin-top: 10px; font-size: 9px; color: #333; }
  .notas ol { margin: 4px 0 0 16px; padding: 0; }
  .notas li { margin-bottom: 2px; }
  .naoSeAplica { color: #bbb; }
  .legenda { margin-top: 5px; font-size: 8px; color: #333; line-height: 1.3; }
  .vazio td { background: #fafafa; }
  /* De pé, 60% de largura deixava o quadro de totais solto no meio */
  .totais { margin-top: 8px; width: 85%; font-size: 10px; }
  .totais td { border: 1px solid #bbb; padding: 2.5px 8px; }
  .totais .destaque td { font-weight: 700; background: #f2f2f2; }
  /* O espelho incompleto não sai no papel como se estivesse certo */
  .totais .alerta td { background: #fff4dc; color: #8a4b00; font-weight: 600; }
      `,
      corpo: folhas || '<p>Nenhum colaborador no período selecionado.</p>',
    });
  }
}

export const servicoPonto = new ServicoPonto();

/**
 * NO APLICATIVO, AS REGRAS DO DIA LEEM O CACHE. É o que sempre leram: a
 * mudança é só de endereço (`apuracaoDoDia`). A hora da batida segue no
 * relógio do aparelho, que aqui é o de Brasília; o servidor liga a sua
 * própria fonte, com o banco e o fuso fixo.
 */
usarFonteDaApuracao({
  colaborador: (id) => bancoDados.obterColaboradorPorId(id),
  marcacoesDoDia: (id, data) => servicoPonto.obterMarcacoesDoDia(id, data),
  situacaoDoDia,
  feriadoEm,
  ajusteDoDia: (id, data) => servicoPonto.obterAjusteDoDia(id, data),
  batePonto,
  hoje: dataDeHoje,
  minutosDoHorario: (horario) => {
    const d = new Date(horario);
    return d.getHours() * 60 + d.getMinutes();
  },
  tolerancias: () => ({
    porMarcacao: servicoPonto.obterToleranciaPorMarcacaoMinutos(),
    diaria: servicoPonto.obterToleranciaMinutos(),
  }),
});
