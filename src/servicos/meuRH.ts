/**
 * MEU RH — o que a aba Eu mostra de cada pessoa, e quando.
 *
 * Pedido do Elias: "cada usuário terá documentos, folga, férias, holerite,
 * advertência, espelho do ponto (disponível no fechamento do mês)" — as
 * informações corporativas da própria pessoa, num lugar só.
 *
 * NADA AQUI É FONTE NOVA. Cada dado já tem dono e já é gravado em outro
 * lugar; esta camada só separa e organiza para a tela:
 *
 *   documentos, folgas, férias → `justificativas_ausencia` (a mesma lista
 *                                 que o RH decide e a escala mostra)
 *   o que é "documento"        → `SE_COMPROVA_COM_DOCUMENTO` (tipos.ts)
 *   holerite, advertência      → `rh.ts`
 *   espelho                    → `servicoPonto.gerarHtmlEspelho`, o mesmo
 *                                 documento que o RH imprime
 */
import { JustificativaAusencia, SE_COMPROVA_COM_DOCUMENTO } from '../tipos';
import { diasCorridos } from './justificativas';
import { servicoPonto, AssinaturaNoEspelho } from './ponto';
import { nuvem } from './nuvem';
import { usandoNuvem } from './supabase';

/**
 * O QUE ESPERA UMA AÇÃO DA PESSOA no Meu RH: holerite sem assinatura e
 * advertência sem ciência. É o número do cartão E o selo da aba Eu — a
 * mesma regra, para os dois nunca discordarem. Sem o selo, o "1 para
 * assinar" do Fabio só aparecia para quem já estava na aba (S10, 02/10/2026).
 */
export const pendenciasDoMeuRH = <H extends { id: string }>(
  holerites: H[],
  recebimentos: { has: (holeriteId: string) => boolean },
  advertencias: { cienciaEm?: string | null }[],
  /** Os meses de espelho por assinar (`espelhosParaAssinar`). */
  espelhos: string[] = []
) => {
  const holeritesParaAssinar = holerites.filter((h) => !recebimentos.has(h.id));
  const semCiencia = advertencias.filter((a) => !a.cienciaEm);
  return {
    holeritesParaAssinar,
    semCiencia,
    espelhosParaAssinar: espelhos,
    total: holeritesParaAssinar.length + semCiencia.length + espelhos.length,
  };
};

/** Quantos meses fechados a pessoa alcança na própria tela. */
export const MESES_DO_ESPELHO = 12;

/**
 * O PRIMEIRO MÊS QUE SE COBRA ASSINAR. A assinatura do espelho chegou em
 * outubro de 2026; setembro é o primeiro mês inteiro apurado com as regras
 * de hoje. Os meses de antes continuam abrindo e podem ser assinados — só
 * não viram pendência, para ninguém ganhar uma fila de meses de uma vez.
 */
export const ESPELHO_ASSINADO_DESDE = '2026-09';

/**
 * OS ESPELHOS QUE ESPERAM A ASSINATURA DA PESSOA: os meses fechados desde
 * `ESPELHO_ASSINADO_DESDE` que ela ainda não assinou. Quem não bate ponto
 * não tem espelho.
 */
export const espelhosParaAssinar = (
  colaborador: { dataAdmissao?: string },
  bateOPonto: boolean,
  hoje: string,
  assinados: { has: (mes: string) => boolean }
): string[] =>
  bateOPonto
    ? mesesFechados(hoje, colaborador.dataAdmissao).filter((m) => m >= ESPELHO_ASSINADO_DESDE && !assinados.has(m))
    : [];

const NOMES_DOS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** "2026-08" → "Agosto de 2026" */
export const rotuloDoMes = (mes: string): string => {
  const [ano, m] = mes.split('-').map(Number);
  return `${NOMES_DOS_MESES[m - 1] || mes} de ${ano}`;
};

/** O mês inteiro, do dia 1 ao último: "2026-02" → 01/02 a 28/02. */
export const periodoDoMes = (mes: string): { inicio: string; fim: string } => {
  const [ano, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${doisDigitos(ultimoDia)}` };
};

/**
 * OS MESES FECHADOS, do mais recente para trás.
 *
 * "Disponível no fechamento do mês": o mês corrente não entra, porque o
 * espelho dele ainda muda a cada batida — e um documento de ponto que a
 * pessoa baixa hoje e que diz outra coisa amanhã não serve para nada.
 *
 * Não volta para antes da admissão: um espelho de mês em que a pessoa
 * nem trabalhava aqui sairia inteiro de faltas.
 */
export const mesesFechados = (
  hoje: string,
  dataAdmissao?: string,
  quantos: number = MESES_DO_ESPELHO
): string[] => {
  const meses: string[] = [];
  let [ano, mes] = hoje.split('-').map(Number);
  const primeiro = dataAdmissao ? dataAdmissao.slice(0, 7) : '';

  for (let i = 0; i < quantos; i++) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
    const chave = `${ano}-${doisDigitos(mes)}`;
    if (primeiro && chave < primeiro) break;
    meses.push(chave);
  }
  return meses;
};

/** Quando o mês corrente fica disponível: o dia 1 do seguinte. */
export const liberacaoDoMesAtual = (hoje: string): string => {
  const [ano, mes] = hoje.split('-').map(Number);
  const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${doisDigitos(mes + 1)}`;
  return `${proximo}-01`;
};

export interface MinhasAusencias {
  /** Atestado, declaração, falta justificada: o que se prova com papel. */
  documentos: JustificativaAusencia[];
  folgas: JustificativaAusencia[];
  ferias: JustificativaAusencia[];
}

/**
 * As ausências DA PESSOA, separadas como ela procura.
 *
 * O critério de "documento" é o mesmo que decide quem aprova e o que o RH
 * cobra no arquivo — não uma lista escrita aqui.
 */
export const separarMinhasAusencias = (
  todas: JustificativaAusencia[],
  colaboradorId: string
): MinhasAusencias => {
  const minhas = todas
    .filter((j) => j.colaboradorId === colaboradorId)
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));

  return {
    documentos: minhas.filter((j) => SE_COMPROVA_COM_DOCUMENTO[j.tipo]),
    folgas: minhas.filter((j) => j.tipo === 'folga_sabado'),
    ferias: minhas.filter((j) => j.tipo === 'ferias'),
  };
};

/**
 * AS FÉRIAS DE HOJE EM DIANTE, e quanto do ano já está lançado.
 *
 * Recusadas não contam: não vão acontecer. Pendentes contam em "próximas",
 * com o estado à vista na tela — é a pergunta que a pessoa faz ("já saiu
 * a minha?").
 */
export const situacaoDasFerias = (
  ferias: JustificativaAusencia[],
  hoje: string
): {
  emCurso?: JustificativaAusencia;
  proxima?: JustificativaAusencia;
  diasNoAno: number;
} => {
  const validas = ferias.filter((j) => j.estado !== 'recusada');
  const ano = hoje.slice(0, 4);

  return {
    emCurso: validas.find((j) => j.dataInicio <= hoje && j.dataFim >= hoje),
    proxima: [...validas]
      .filter((j) => j.dataInicio > hoje)
      .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0],
    diasNoAno: validas
      .filter((j) => j.dataInicio.slice(0, 4) === ano)
      .reduce((total, j) => total + diasCorridos(j.dataInicio, j.dataFim), 0),
  };
};

/**
 * O ESPELHO DO MÊS FECHADO, pronto para abrir.
 *
 * O aparelho guarda só uns dois meses de batidas; um mês mais antigo
 * abriria vazio — e espelho vazio se lê como "não bateu ponto", a pior
 * coisa que um documento de ponto pode dizer por engano. Então as batidas
 * da pessoa naquele mês vêm do banco antes de montar. Não vindo, o
 * espelho NÃO abre.
 */
export const prepararMeuEspelho = async (
  colaboradorId: string,
  mes: string,
  hoje: string,
  /**
   * A assinatura do mês, se houver (`assinaturasDoEspelho`). Vem DEPOIS das
   * batidas: é com elas que se confere se o espelho ainda é o assinado.
   */
  assinaturas?: () => Promise<Map<string, AssinaturaNoEspelho>>
): Promise<{ html?: string; erro?: string }> => {
  if (!mesesFechados(hoje, undefined, MESES_DO_ESPELHO).includes(mes)) {
    return { erro: 'Este mês ainda não fechou. O espelho sai no dia 1 do mês seguinte.' };
  }

  const periodo = periodoDoMes(mes);
  if (usandoNuvem()) {
    const trouxe = await nuvem.trazerMarcacoesDe(colaboradorId, periodo);
    if (!trouxe) {
      return {
        erro: 'Não foi possível buscar as batidas deste mês. Confira a conexão e tente de novo.',
      };
    }
  }

  return {
    html: servicoPonto.gerarHtmlEspelho(
      periodo.inicio,
      periodo.fim,
      [colaboradorId],
      assinaturas ? await assinaturas() : undefined
    ),
  };
};

/**
 * A PRÓXIMA AUSÊNCIA DA PESSOA — folga de sábado ou férias, de hoje em
 * diante, a mais próxima. Recusada não conta: não vai acontecer. É o que o
 * Início do computador mostra em "Meu dia" (Elias, 05/10/2026).
 */
export const proximaAusenciaDe = (
  todas: JustificativaAusencia[],
  colaboradorId: string,
  hoje: string
): JustificativaAusencia | null =>
  todas
    .filter(
      (j) =>
        j.colaboradorId === colaboradorId &&
        (j.tipo === 'folga_sabado' || j.tipo === 'ferias') &&
        j.estado !== 'recusada' &&
        j.dataFim >= hoje
    )
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0] || null;
