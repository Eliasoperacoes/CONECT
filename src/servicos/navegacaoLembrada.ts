/**
 * ONDE A PESSOA ESTAVA — CONECTA / Malachias Autopeças
 *
 * O QUE ISTO RESOLVE
 *
 * A navegação vivia só na memória do React. Atualizar a página — que
 * acontece o tempo todo: o navegador da loja recarrega sozinho, a pessoa
 * aperta F5 quando algo parece travado, o celular descarta a aba em
 * segundo plano — jogava todo mundo de volta na tela inicial.
 *
 * Quem está conferindo o espelho de ponto da quinta pessoa de uma lista
 * de vinte volta para Conversas e recomeça a navegação inteira.
 *
 * COMO FUNCIONA
 *
 * Cada tela que tem aba guarda aqui a escolha atual, e lê de volta ao
 * montar. Fica no aparelho, em `localStorage`: é preferência de uso, não
 * dado do sistema — não vale uma ida ao banco a cada clique de aba.
 *
 * É GUARDADO POR PESSOA. Nas lojas o mesmo computador atende o balcão
 * inteiro; sem separar por colaborador, quem entra depois cai na tela
 * que o anterior estava vendo — e no caso do RH essa tela pode ser a
 * ficha de alguém.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: decidir se a pessoa PODE ver o que foi
 * lembrado. Quem restaura filtra por permissão depois de ler — uma
 * escolha guardada de ontem pode ser de uma aba que a pessoa perdeu hoje,
 * e `localStorage` é editável por quem abre o console. Aqui só se guarda
 * e se devolve texto.
 */

const PREFIXO = 'conecta.onde-parei';

/**
 * A chave é do par pessoa + tela.
 *
 * Sem o id do colaborador, o aparelho do balcão devolveria para a próxima
 * pessoa a tela da anterior.
 */
const chaveDe = (colaboradorId: string, tela: string): string =>
  `${PREFIXO}.${colaboradorId}.${tela}`;

/**
 * Guarda onde a pessoa está.
 *
 * Nunca lança: `localStorage` falha em aba anônima e quando o aparelho
 * está sem espaço, e perder a memória da navegação não pode derrubar a
 * tela que a pessoa está usando.
 */
export const lembrarOndeParei = (
  colaboradorId: string,
  tela: string,
  valor: string
): void => {
  if (!colaboradorId) return;
  try {
    localStorage.setItem(chaveDe(colaboradorId, tela), valor);
  } catch {
    /* sem espaço ou aba anônima: a navegação continua, só não é lembrada */
  }
};

/**
 * Devolve onde a pessoa estava, ou o padrão da tela.
 *
 * `opcoes` é a lista do que existe HOJE naquela tela. Um valor guardado
 * que não está mais nela — aba removida, renomeada, ou escrita à mão no
 * console — cai no padrão em vez de deixar a tela em branco.
 */
export const ondeParei = <T extends string>(
  colaboradorId: string,
  tela: string,
  opcoes: readonly T[],
  padrao: T
): T => {
  if (!colaboradorId) return padrao;
  try {
    const guardado = localStorage.getItem(chaveDe(colaboradorId, tela));
    return opcoes.includes(guardado as T) ? (guardado as T) : padrao;
  } catch {
    return padrao;
  }
};

/**
 * Esquece tudo o que foi lembrado neste aparelho.
 *
 * Chamado na saída: a próxima pessoa a entrar neste computador começa na
 * tela inicial dela, e não na última que o colega estava vendo.
 */
export const esquecerOndeParei = (): void => {
  try {
    /**
     * Pela API de `Storage` — `length` e `key(i)` —, e não por
     * `Object.keys`. As duas funcionam no navegador, mas `Object.keys`
     * depende de o objeto expor as chaves como propriedades próprias, o
     * que não é contrato de `Storage`: é detalhe de implementação.
     *
     * A lista é montada ANTES de remover. Apagar durante a varredura
     * reindexa o armazenamento e pula a chave seguinte a cada remoção —
     * metade ficaria para trás.
     */
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave && chave.startsWith(PREFIXO)) chaves.push(chave);
    }
    for (const chave of chaves) localStorage.removeItem(chave);
  } catch {
    /* nada a fazer: sem localStorage não havia nada guardado */
  }
};
