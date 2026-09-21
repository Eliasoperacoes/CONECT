/**
 * Cache dos feriados — CONECTA
 *
 * Só o armazenamento e a pergunta "este dia é feriado para esta pessoa?".
 * Nada de regra de quem cadastra.
 *
 * ===================================================================
 * ESTE MÓDULO NÃO IMPORTA NADA ALÉM DE TIPOS
 * ===================================================================
 *
 * É a mesma razão do cache de ausências, e não é organização: `nuvem`
 * precisa entregar os feriados vindos do banco. Se ela importasse o
 * serviço de regra, o ciclo `nuvem → feriados → ponto → nuvem` fecharia —
 * e `ponto` roda no carregamento, o que derruba o aplicativo inteiro com
 * "Cannot access 'nuvem' before initialization".
 *
 * **Não acrescente import aqui.** Há teste conferindo.
 */
import { Feriado, Loja, INFORMACOES_LOJAS } from '../tipos';
import { feriadosNacionaisDe } from './feriadosNacionais';
import { feriadosLocaisDe, cidadeDaLoja } from './feriadosMunicipais';

export const CHAVE_FERIADOS = 'conecta_v4_feriados';

const ouvintes: Array<() => void> = [];

export const notificarFeriados = (): void => ouvintes.forEach((o) => o());

export const assinarFeriados = (ouvinte: () => void): (() => void) => {
  ouvintes.push(ouvinte);
  return () => {
    const i = ouvintes.indexOf(ouvinte);
    if (i !== -1) ouvintes.splice(i, 1);
  };
};

export const lerFeriados = (): Feriado[] => {
  try {
    const bruto = localStorage.getItem(CHAVE_FERIADOS);
    const lido = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lido) ? (lido as Feriado[]) : [];
  } catch {
    return [];
  }
};

export const gravarFeriados = (lista: Feriado[]): void => {
  localStorage.setItem(CHAVE_FERIADOS, JSON.stringify(lista));
  notificarFeriados();
};

/** Chamado pela `nuvem` ao trazer os feriados do banco. */
export const aplicarFeriadosDaNuvem = (lista: Feriado[]): void => {
  gravarFeriados(lista);
};

/**
 * O feriado que vale para esta pessoa neste dia, se houver.
 *
 * O da LOJA vence o da rede: se a rede marcou meio expediente e a loja de
 * Leme marcou fechado por um feriado municipal, quem é de Leme não
 * trabalha. O contrário — a rede vencer — faria o feriado da cidade da
 * pessoa ser ignorado, que é justamente o caso que a coluna existe para
 * resolver.
 */
export const feriadoEm = (data: string, loja?: Loja): Feriado | undefined => {
  const doDia = lerFeriados().filter((f) => f.data === data);

  const cadastrado =
    doDia.find((f) => f.loja && f.loja === loja) || doDia.find((f) => !f.loja);
  if (cadastrado) return cadastrado;

  /**
   * O FERIADO NACIONAL NÃO PRECISA SER CADASTRADO.
   *
   * Antes precisava: alguém tinha de abrir a tela de Feriados e apertar
   * "Trazer nacionais", uma vez por ano. Funciona enquanto a pessoa
   * lembra — e o dia em que ninguém lembrasse, todo feriado do ano
   * viraria dia útil no espelho de ponto, cobrando 8h10 de uma loja
   * fechada. Sem erro na tela, sem aviso: só o número errado.
   *
   * Natal não é dado a ser digitado, é conta. A data de cada um sai do
   * calendário (e da Páscoa, para os móveis), e o algoritmo já estava
   * aqui — só era usado para PREENCHER a lista, em vez de responder a
   * pergunta.
   *
   * O que está cadastrado VENCE, e é por isso que esta consulta vem
   * depois: o feriado municipal da loja, ou um nacional que a rede
   * resolveu tratar diferente, continuam mandando.
   */
  const ano = Number(data.slice(0, 4));
  if (!Number.isFinite(ano)) return undefined;

  /**
   * O LOCAL VEM ANTES DO NACIONAL.
   *
   * Não por precedência de lei — os dois fecham o dia igual — mas porque
   * o nome tem de ser o certo. Num 8 de setembro em Descalvado o espelho
   * precisa dizer "Aniversário de Descalvado", e não procurar um feriado
   * nacional que não existe nesse dia.
   *
   * A cidade sai de `INFORMACOES_LOJAS`, que já é o cadastro das
   * unidades. Loja sem cidade mapeada ainda pega os estaduais.
   */
  const cidade = cidadeDaLoja(loja, INFORMACOES_LOJAS);
  const local = feriadosLocaisDe(ano, cidade).find((f) => f.data === data);
  if (local) {
    return {
      id: `${local.origem}-${local.data}`,
      data: local.data,
      nome: local.nome,
      loja,
      minutosPrevistos: local.minutosPrevistos,
      criadoEm: '',
    };
  }

  const nacional = feriadosNacionaisDe(ano).find((f) => f.data === data);
  if (!nacional) return undefined;

  return {
    id: `nacional-${nacional.data}`,
    data: nacional.data,
    nome: nacional.nome,
    minutosPrevistos: nacional.minutosPrevistos,
    criadoEm: '',
  };
};
