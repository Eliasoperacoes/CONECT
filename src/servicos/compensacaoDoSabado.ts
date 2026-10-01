/**
 * O SALDO DE COMPENSAÇÃO DO SÁBADO — a conta de um mês, num lugar só.
 *
 * A jornada é de 8h (CLT) e os 10 minutos diários do turno integral são a
 * compensação com que a pessoa paga a folga de sábado
 * (`JORNADA_CLT_DIA_UTIL`). A folga consome a compensação, até 4h, e
 * nunca deixa devendo (decisão do Elias).
 *
 * O QUE SOBRA PASSA AO MÊS SEGUINTE (01/10/2026). A Fernanda combinou com
 * o Raphael de não folgar em setembro e folgar em outubro: as 3h30 de
 * setembro precisam chegar a outubro para pagar a folga trocada. Por isso
 * a compensação é um saldo PRÓPRIO, separado do banco de horas — o banco
 * fica só com as variações de verdade.
 *
 * Quem grava o fechamento é a apuração da madrugada (`apurar-ponto`), na
 * tabela `compensacao_sabado`; o espelho lê o mês anterior de lá e faz a
 * conta do mês aberto com esta mesma função.
 *
 * Só importa tipos: vai inteiro para o servidor.
 */
import { MINUTOS_SABADO, CompensacaoDoMes } from '../tipos';

export type { CompensacaoDoMes };

/** Onde o aparelho guarda os fechamentos que vieram do banco. */
export const CHAVE_COMPENSACAO = 'conecta_v4_compensacao_sabado';

/**
 * A conta do mês: o disponível é o que veio mais o que juntou; cada folga
 * consome até 4h dele; o resto segue.
 */
export const fecharCompensacao = (
  anterior: number,
  juntada: number,
  folgas: number
): { consumida: number; saldoFinal: number } => {
  const disponivel = Math.max(0, anterior) + Math.max(0, juntada);
  const consumida = Math.min(disponivel, Math.max(0, folgas) * MINUTOS_SABADO);
  return { consumida, saldoFinal: disponivel - consumida };
};

/** "2026-10" → "2026-09"; "2027-01" → "2026-12". */
export const mesAnterior = (mes: string): string => {
  const [ano, m] = mes.split('-').map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`;
};

/** O primeiro e o último dia do mês. */
export const diasDoMes = (mes: string): { inicio: string; fim: string } => {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` };
};
