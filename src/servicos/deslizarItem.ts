/**
 * DESLIZAR O ITEM DA LISTA PARA O LADO — as contas do gesto.
 *
 * O Elias pediu as ações da conversa (fixar, arquivar, excluir) atrás
 * do item, reveladas arrastando para a esquerda, no lugar dos três
 * pontinhos que abriam um menu miúdo por cima da lista.
 *
 * As contas moram aqui, e não no componente, porque são elas que dão
 * a sensação de "acabado" ou de "amador": um arrasto que abre sozinho
 * quando a pessoa só queria rolar a lista, ou que exige arrastar até o
 * fim para abrir, é o que faz o gesto parecer quebrado. Aqui dá para
 * testar cada caso sem um dedo.
 */

/** A largura de cada quadrado de ação, em px. Cabe ícone e rótulo. */
export const LARGURA_ACAO = 72;

/**
 * Quanto o dedo precisa andar antes de o sistema decidir o que é o
 * gesto. Abaixo disso é tremida de quem só está tocando.
 */
const FOLGA_DO_TOQUE = 10;

/**
 * O GESTO É DE LADO, OU É ROLAGEM DA LISTA?
 *
 * De lado só quando anda claramente mais na horizontal que na
 * vertical. Um arrasto na diagonal é quase sempre alguém rolando a
 * lista com o polegar torto — abrir as ações ali seria o defeito
 * clássico deste tipo de lista.
 */
export function ehArrastoLateral(dx: number, dy: number): boolean {
  return Math.abs(dx) > FOLGA_DO_TOQUE && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/**
 * ONDE O ITEM FICA DURANTE O ARRASTO.
 *
 * Nunca para a direita (não há nada à esquerda para mostrar) e nunca
 * além das ações: passar do fim mostraria o fundo vazio da lista.
 */
export function limitarDeslocamento(inicio: number, dx: number, largura: number): number {
  return Math.min(0, Math.max(-largura, inicio + dx));
}

/**
 * AO SOLTAR, ABRE OU FECHA?
 *
 * Depende de onde começou. Fechado, basta puxar um terço para abrir —
 * exigir metade faz a pessoa achar que o gesto não pegou. Aberto, basta
 * empurrar um terço de volta para fechar. É a mesma folga nos dois
 * sentidos, e é o que faz o item "querer" ir para o lado que o dedo
 * indicou.
 */
export function abreAoSoltar(inicio: number, deslocamento: number, largura: number): boolean {
  const estavaAberto = inicio < 0;
  return estavaAberto
    ? deslocamento < -largura * (2 / 3)
    : deslocamento < -largura / 3;
}
