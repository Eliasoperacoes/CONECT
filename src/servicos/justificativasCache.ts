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
import { JustificativaAusencia } from '../tipos';

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

export const lerJustificativas = (): JustificativaAusencia[] => {
  try {
    const bruto = localStorage.getItem(CHAVE_JUSTIFICATIVAS);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
};

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
