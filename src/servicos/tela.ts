/**
 * A TELA É DE CELULAR?
 *
 * A mesma linha que o layout usa: o `md:` do Tailwind, 768px. Abaixo
 * dela o CONECTA é coluna única — lista OU conversa, em tela cheia.
 * Acima, a conversa abre em janela flutuante.
 *
 * Quem precisa decidir em código (e não em classe CSS) pergunta aqui.
 * Um segundo número escrito em outro lugar é como o layout diria
 * "celular" e o código diria "computador" na mesma tela.
 */
export const LARGURA_DO_COMPUTADOR = 768;

export function ehTelaDeCelular(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia(`(min-width: ${LARGURA_DO_COMPUTADOR}px)`).matches;
}
