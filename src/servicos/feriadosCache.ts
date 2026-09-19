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
import { Feriado, Loja } from '../tipos';

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
  if (doDia.length === 0) return undefined;

  return (
    doDia.find((f) => f.loja && f.loja === loja) || doDia.find((f) => !f.loja)
  );
};
