/**
 * MUDOU DE VERDADE? — CONECTA / Malachias Autopeças
 *
 * O DEFEITO QUE ISTO CONSERTA, e por que ele parecia outra coisa.
 *
 * O sintoma era "o clique não pega de primeira" nas abas de dentro, no
 * computador. Nada a ver com o clique.
 *
 * `obterColaboradores()` lê do `localStorage` com `JSON.parse` e ainda
 * faz `.map(c => ({ ...c }))` — devolve OBJETOS NOVOS toda vez, mesmo
 * sem um byte ter mudado. O App chamava `setColaboradorAtual(...)` com
 * esse objeto a cada notificação do banco, e são 34 lugares que
 * notificam: presença, mensagem que chega, sincronização.
 *
 * React compara por identidade. Objeto novo é mudança, então a
 * aplicação inteira redesenhava sozinha várias vezes por minuto. E o
 * navegador só emite `click` quando o `mousedown` e o `mouseup` caem no
 * MESMO elemento: se o redesenho acontece entre os dois, o clique
 * simplesmente não existe. Daí "não pegou de primeira".
 *
 * A correção é comparar o CONTEÚDO e devolver o objeto anterior quando
 * nada mudou — o React então não vê mudança nenhuma e não redesenha.
 */

/**
 * Dois valores têm o mesmo conteúdo?
 *
 * Por `JSON.stringify`, e não campo a campo: campo novo na ficha
 * entraria na comparação sozinho. Uma lista escrita à mão aqui teria de
 * ser lembrada a cada coluna nova — e seria esquecida na primeira.
 *
 * Funciona porque os dois lados vêm da mesma origem (o `localStorage`),
 * então a ordem das chaves é a mesma. Para objetos de origens
 * diferentes isto não valeria.
 */
export const mesmoConteudo = <T>(a: T, b: T): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Ciclo ou valor que não serializa: trata como diferente, que é o
    // lado seguro — redesenhar à toa é melhor do que não redesenhar
    return false;
  }
};

/**
 * O valor a guardar no estado: o ANTERIOR quando nada mudou.
 *
 * Usado dentro do `setEstado(anterior => ...)`, que é a única forma de
 * enxergar o que já estava lá sem pôr o estado na lista de dependências
 * — o que criaria o laço que esta função existe para evitar.
 */
export const manterSeIgual = <T>(anterior: T, novo: T): T =>
  mesmoConteudo(anterior, novo) ? anterior : novo;
