/**
 * Cache das ausências justificadas — CONECTA
 *
 * Só o armazenamento: ler, gravar e avisar quem escuta. Nada de regra.
 *
 * ===================================================================
 * POR QUE ISTO É UM ARQUIVO À PARTE
 * ===================================================================
 *
 * Este módulo NÃO IMPORTA NADA. É de propósito, e não é organização: sem
 * ele o aplicativo não abria.
 *
 * `nuvem` precisava entregar as ausências vindas do banco, e para isso
 * importava `justificativas` — que importa `ponto`, que importa `nuvem`. O
 * ciclo fechava, e `ponto` roda `new ServicoPonto()` no carregamento, cujo
 * construtor chama `nuvem`. Resultado: "Cannot access 'nuvem' before
 * initialization" e tela branca, sem nada no lugar.
 *
 * Com o cache aqui, `nuvem` importa uma folha sem dependências e o ciclo
 * não existe. **Não acrescente import neste arquivo** — qualquer um deles
 * pode refechar o ciclo, e a falha só aparece no navegador.
 */
import {
  JustificativaAusencia,
  SituacaoDoDia,
  SITUACAO_POR_TIPO,
  Afastamento,
  afastamentoEm,
} from '../tipos';
import { lerLista } from './cacheDeLeitura';

export const CHAVE_JUSTIFICATIVAS = 'conecta_v4_justificativas_ausencia';

const ouvintes: Array<() => void> = [];

export const notificarJustificativas = (): void => ouvintes.forEach((o) => o());

export const assinarJustificativas = (ouvinte: () => void): (() => void) => {
  ouvintes.push(ouvinte);
  return () => {
    const i = ouvintes.indexOf(ouvinte);
    if (i !== -1) ouvintes.splice(i, 1);
  };
};

/**
 * Lida 968 vezes para montar os números do RH. `lerLista` guarda o
 * resultado e só reparseia quando o texto muda.
 */
export const lerJustificativas = (): JustificativaAusencia[] =>
  lerLista<JustificativaAusencia>(CHAVE_JUSTIFICATIVAS);

export const gravarJustificativas = (lista: JustificativaAusencia[]): void => {
  try {
    localStorage.setItem(CHAVE_JUSTIFICATIVAS, JSON.stringify(lista));
  } catch {
    // Sem armazenamento: vale só nesta sessão
  }
  notificarJustificativas();
};

/** Troca o cache pelo que veio do banco. Chamado pela sincronização. */
export const aplicarJustificativasDaNuvem = (lista: JustificativaAusencia[]): void =>
  gravarJustificativas(lista);

/**
 * OS AFASTAMENTOS (afastamentos.sql, 17/10/2026), no mesmo cache e pelos
 * mesmos ouvintes: mudam a situação do dia como uma ausência aprovada, e a
 * tela que escuta as ausências se redesenha com eles.
 */
export const CHAVE_AFASTAMENTOS = 'conecta_v4_afastamentos';

export const lerAfastamentos = (): Afastamento[] => lerLista<Afastamento>(CHAVE_AFASTAMENTOS);

export const gravarAfastamentos = (lista: Afastamento[]): void => {
  try {
    localStorage.setItem(CHAVE_AFASTAMENTOS, JSON.stringify(lista));
  } catch {
    // Sem armazenamento: vale só nesta sessão
  }
  notificarJustificativas();
};

/**
 * OS DIAS ABONADOS (dias-abonados-para-a-lideranca.sql, 06/11/2026).
 *
 * O líder não recebe o atestado da equipe — dado de saúde fica com o RH —
 * e o espelho dele, calculado aqui, fechava o dia abonado como dia comum:
 * o 04/11 da Beatriz saía 0h00 no RH e −2h30 na Leigislaine. O banco
 * entrega ao líder só isto: quem e de que dia a que dia, sem tipo.
 */
export interface DiaAbonado {
  id: string;
  colaboradorId: string;
  dataInicio: string;
  dataFim: string;
}

export const CHAVE_DIAS_ABONADOS = 'conecta_v4_dias_abonados';

export const lerDiasAbonados = (): DiaAbonado[] => lerLista<DiaAbonado>(CHAVE_DIAS_ABONADOS);

export const gravarDiasAbonados = (lista: DiaAbonado[]): void => {
  try {
    localStorage.setItem(CHAVE_DIAS_ABONADOS, JSON.stringify(lista));
  } catch {
    // Sem armazenamento: vale só nesta sessão
  }
  notificarJustificativas();
};

/**
 * A situação de um dia, vinda de ausência APROVADA.
 *
 * Mora aqui, e não no serviço, porque `ponto` precisa dela para saber que
 * um sábado de folga prevê zero — e `ponto` importando o serviço refecharia
 * o ciclo que já derrubou o aplicativo uma vez.
 *
 * Só aprovada conta: solicitação pendente não muda o espelho de ponto antes
 * de alguém decidir, do mesmo jeito que hora extra não entra no saldo sem
 * aprovação.
 */
export const situacaoDoDia = (colaboradorId: string, data: string): SituacaoDoDia =>
  situacaoNaLista(lerJustificativas(), colaboradorId, data, lerAfastamentos(), lerDiasAbonados());

/**
 * A MESMA PERGUNTA, sobre uma lista dada — sem ler o aparelho. É o que a
 * função de servidor `apurar-ponto` usa com as ausências vindas do banco.
 */
export const situacaoNaLista = (
  ausencias: JustificativaAusencia[],
  colaboradorId: string,
  data: string,
  /** Vale por cima de qualquer ausência: afastado não está de férias nem de atestado */
  afastamentos: Afastamento[] = [],
  /**
   * O que o líder recebe no lugar do atestado. Vale depois das ausências:
   * quem lê a ausência inteira (o RH, a pessoa) vê o tipo dela; o líder vê
   * "Abonado", e o dia fecha igual nos dois espelhos.
   */
  diasAbonados: DiaAbonado[] = []
): SituacaoDoDia => {
  if (afastamentoEm(afastamentos, colaboradorId, data)) return 'afastado';
  const achada = ausencias.find(
    (j) =>
      j.colaboradorId === colaboradorId &&
      j.estado === 'aprovada' &&
      data >= j.dataInicio &&
      data <= j.dataFim
  );
  if (achada) return SITUACAO_POR_TIPO[achada.tipo];
  const abonado = diasAbonados.some(
    (d) => d.colaboradorId === colaboradorId && data >= d.dataInicio && data <= d.dataFim
  );
  return abonado ? 'abonado_outro' : 'normal';
};
