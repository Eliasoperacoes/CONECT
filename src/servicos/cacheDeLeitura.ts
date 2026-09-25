/**
 * NÃO REPARSEAR O QUE NÃO MUDOU — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * O DEFEITO, MEDIDO
 * ===================================================================
 *
 * "Equipe & Ponto" e "Recursos Humanos" demoravam a abrir. Medido com a
 * rede do tamanho real — 89 pessoas, 60 dias, 21.360 marcações:
 *
 *   obterResumoDoPeriodo (a lista da equipe) ....... 33.751 ms
 *   relacaoSemanalDaEquipe (o ciclo) ...............  6.815 ms
 *
 * Trinta e três SEGUNDOS. A conta de onde eles saem:
 *
 *   JSON.parse de 3,1 MB ......... 11,59 ms
 *   × 2.759 chamadas ............. 32,0 s   <- é isto
 *   filtrar a lista inteira ......  0,12 ms
 *   × 2.759 chamadas .............  0,3 s
 *
 * `obterJornadaDoDia` chama `lerRegistros()` uma vez, e
 * `obterResumoDoPeriodo` a chama para cada pessoa em cada dia: 89 × 30.
 * Cada uma refazia o `JSON.parse` dos 3,1 MB inteiros para ler as quatro
 * batidas de um dia de uma pessoa.
 *
 * ===================================================================
 * A CORREÇÃO, E POR QUE ESTA E NÃO OUTRA
 * ===================================================================
 *
 * Guardar o resultado do `parse` e refazê-lo só quando o TEXTO mudou.
 * Comparar o texto custa 0,1 ms para as 2.759 chamadas — contra 32 s.
 *
 * Comparar o texto, e não confiar num aviso de escrita: há mais de
 * trinta lugares que gravam, e um deles esqueceria de avisar. Texto
 * diferente é a própria prova de que mudou — não há como o cache
 * envelhecer sem alguém ter reescrito, e aí ele se refaz sozinho.
 *
 * ===================================================================
 * A CÓPIA RASA NÃO É DESPERDÍCIO
 * ===================================================================
 *
 * Devolve-se `[...lista]`, e não a lista guardada. Duas funções fazem
 * `registros.push(registro)` antes de gravar — com a lista guardada,
 * esse `push` entraria no cache e a marcação apareceria duas vezes.
 *
 * Custa 0,113 ms contra os 11,59 do `parse`: cem vezes mais barato, e
 * protege contra `push`, `sort` e `splice`.
 *
 * O QUE ELA NÃO PROTEGE: mutação de um ITEM (`lista[0].campo = x`). Os
 * objetos continuam compartilhados. Por isso este cache não serve para
 * tudo — `avisos_rede` muta item, e por isso ficou de fora.
 */

interface Guardado {
  bruto: string;
  valor: unknown[];
}

const cache = new Map<string, Guardado>();

/**
 * Lê uma lista do armazenamento, sem reparsear o que não mudou.
 *
 * Devolve `[]` no lugar de qualquer coisa que não seja lista — texto
 * corrompido não pode derrubar a tela de quem só queria bater o ponto.
 */
export const lerLista = <T>(chave: string): T[] => {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return [];

    const guardado = cache.get(chave);
    if (guardado && guardado.bruto === bruto) return [...guardado.valor] as T[];

    const valor = JSON.parse(bruto);
    if (!Array.isArray(valor)) return [];

    cache.set(chave, { bruto, valor });
    return [...valor] as T[];
  } catch {
    return [];
  }
};

/**
 * Esquece o que está guardado.
 *
 * Não é preciso para o cache funcionar — ele se refaz sozinho quando o
 * texto muda. Existe para os testes, que trocam de armazenamento entre
 * um caso e outro: sem isto, o segundo caso leria o texto do primeiro e
 * passaria por um motivo errado.
 */
export const esquecerCacheDeLeitura = (chave?: string): void => {
  if (chave) cache.delete(chave);
  else cache.clear();
};
