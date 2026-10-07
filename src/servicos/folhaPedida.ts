/**
 * QUAL FOLHA DA ABA "EU" ABRIR — o pedido que vem de fora dela.
 *
 * O toque no aviso "holerite disponível" (ou no lembrete) leva à aba Eu.
 * Levar só até a aba deixaria a pessoa procurando o holerite entre os
 * cartões; o aviso pede a folha, e a tela a abre quando estiver montada —
 * agora, se já estiver, ou assim que montar.
 *
 * Sem dependências: o App pede, o MeuRH atende.
 */
export type FolhaPedida = 'holerites' | 'advertencias' | 'espelho';

/** Qual folha cada seção de aviso abre (`destinoDoAviso`). */
export const FOLHA_DA_SECAO: Partial<Record<string, FolhaPedida>> = {
  meus_holerites: 'holerites',
  minhas_advertencias: 'advertencias',
  meus_espelhos: 'espelho',
};

let pedida: FolhaPedida | null = null;
const ouvintes = new Set<() => void>();

export const pedirFolhaDoMeuRH = (folha: FolhaPedida): void => {
  pedida = folha;
  ouvintes.forEach((o) => o());
};

/** Entrega o pedido UMA vez: voltar à aba depois não reabre a folha. */
export const tomarFolhaPedida = (): FolhaPedida | null => {
  const folha = pedida;
  pedida = null;
  return folha;
};

export const ouvirFolhaPedida = (ouvinte: () => void): (() => void) => {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
};
