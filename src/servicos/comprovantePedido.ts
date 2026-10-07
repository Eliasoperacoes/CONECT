/**
 * QUAL COMPROVANTE ABRIR — o pedido que vem do toque no aviso.
 *
 * O aviso "Comprovante de batida" leva ao Ponto COM o comprovante daquela
 * batida aberto: levar só até a aba deixaria a pessoa procurando a batida
 * na lista. Mesmo desenho de `folhaPedida.ts`: o App pede, a aba Ponto
 * atende — agora, se já estiver montada, ou assim que montar.
 *
 * Sem dependências.
 */
let pedido: string | null = null;
const ouvintes = new Set<() => void>();

export const pedirComprovante = (registroId: string): void => {
  pedido = registroId;
  ouvintes.forEach((o) => o());
};

/** Entrega o pedido UMA vez: voltar à aba depois não reabre o comprovante. */
export const tomarComprovantePedido = (): string | null => {
  const id = pedido;
  pedido = null;
  return id;
};

export const ouvirComprovantePedido = (ouvinte: () => void): (() => void) => {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
};
