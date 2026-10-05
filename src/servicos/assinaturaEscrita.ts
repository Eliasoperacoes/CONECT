/**
 * A ASSINATURA ESCRITA — o nome da pessoa em letra de caligrafia.
 *
 * Pedido do Elias (05/10/2026): assinar com o dedo na tela sai garrancho,
 * pela falta de sensibilidade do toque. O cadastro passa a oferecer três
 * assinaturas prontas, escritas a partir do nome da ficha, e mantém o
 * desenho para quem prefere.
 *
 * As fontes vêm com o sistema (`@fontsource`), e não do Google a cada uso:
 * a assinatura tem de sair igual em qualquer aparelho, e sem internet de
 * fora no meio do caminho.
 */

export interface EstiloDeAssinatura {
  id: string;
  /** Como o estilo é chamado na tela. */
  rotulo: string;
  /** A família da fonte, como o CSS e o canvas a conhecem. */
  familia: string;
  /**
   * Quanto a fonte rende: as três têm tamanhos de letra muito diferentes
   * para o mesmo número, e na tela precisam parecer do mesmo tamanho.
   */
  escala: number;
}

export const ESTILOS_DE_ASSINATURA: EstiloDeAssinatura[] = [
  { id: 'classica', rotulo: 'Clássica', familia: 'Great Vibes', escala: 1.25 },
  { id: 'fluida', rotulo: 'Fluida', familia: 'Dancing Script', escala: 1 },
  { id: 'caneta', rotulo: 'Caneta', familia: 'Homemade Apple', escala: 0.72 },
];

/** Partículas que não fazem sobrenome: "da Silva" assina "Silva". */
const PARTICULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

const capitalizar = (palavra: string): string =>
  palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1).toLocaleLowerCase('pt-BR');

/**
 * O NOME QUE SE ASSINA: o primeiro e o último sobrenome, como se assina no
 * papel. "FERNANDA METZNER CECCARELLI" → "Fernanda Ceccarelli"; "João
 * Felipe da Silva Baldi" → "João Baldi". Nome de uma palavra fica como está.
 */
export const nomeParaAssinar = (nomeCompleto: string): string => {
  const palavras = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return '';
  const primeiro = capitalizar(palavras[0]);
  const ultimo = [...palavras.slice(1)].reverse().find((p) => !PARTICULAS.has(p.toLocaleLowerCase('pt-BR')));
  return ultimo ? `${primeiro} ${capitalizar(ultimo)}` : primeiro;
};
