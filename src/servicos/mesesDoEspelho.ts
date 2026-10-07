/**
 * OS MESES DO ESPELHO DE PONTO — quais estão fechados e quais esperam a
 * assinatura da pessoa.
 *
 * Arquivo SEM DEPENDÊNCIAS, de propósito: o aplicativo (Meu RH, sino,
 * assinaturas) e o servidor dos lembretes das 9h (`lembrar-pendencias`)
 * perguntam a mesma coisa — "que espelho esta pessoa ainda não assinou?".
 * Em `meuRH.ts` a regra vinha junto do ponto, do banco e da nuvem, que o
 * servidor não pode carregar; copiá-la para lá seria a mesma regra em
 * dois lugares. `meuRH.ts` reexporta tudo, e as telas não mudaram.
 */

/** Quantos meses fechados a pessoa alcança na própria tela. */
export const MESES_DO_ESPELHO = 12;

/**
 * O PRIMEIRO MÊS QUE SE COBRA ASSINAR. A assinatura do espelho chegou em
 * outubro de 2026; setembro é o primeiro mês inteiro apurado com as regras
 * de hoje. Os meses de antes continuam abrindo e podem ser assinados — só
 * não viram pendência, para ninguém ganhar uma fila de meses de uma vez.
 */
export const ESPELHO_ASSINADO_DESDE = '2026-09';

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

/** Quando o mês corrente fica disponível: o dia 1 do seguinte. */
export const liberacaoDoMesAtual = (hoje: string): string => {
  const [ano, mes] = hoje.split('-').map(Number);
  const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${doisDigitos(mes + 1)}`;
  return `${proximo}-01`;
};
