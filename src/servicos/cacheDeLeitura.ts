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

/*
 * ===================================================================
 * SEM RELER O ARMAZENAMENTO A CADA PERGUNTA (20/10/2026)
 * ===================================================================
 *
 * O Elias sentiu "delay nos cliques" em todas as telas, com o ponto já na
 * rede inteira. Medido no navegador, com 89 pessoas e 16 mil batidas:
 * Ponto 7,4 a 8,5 s, Início 5,7 s — e a versão de antes das atualizações
 * era ainda mais lenta: era o volume crescendo, não uma regressão.
 *
 * A comparação de texto acima era barata no teste (Bun devolve sempre a
 * MESMA string) e cara no navegador: cada `localStorage.getItem` copia o
 * texto inteiro — 3,6 MB das batidas — milhares de vezes por tela, só
 * para confirmar que nada mudou.
 *
 * Agora a cópia em memória vale até alguém GRAVAR aquela chave. A
 * gravação é interceptada no próprio armazenamento (`setItem`,
 * `removeItem`, `clear`), então vale para todos os trinta e tantos
 * lugares que gravam, inclusive os que ainda não existem; e o evento
 * `storage` cobre a gravação feita por outra aba. O texto ainda é
 * conferido na primeira leitura depois de cada gravação.
 */
interface Guardado {
  bruto: string;
  valor: unknown[];
  /** Ninguém gravou a chave desde a última conferência: não precisa reler */
  confiavel: boolean;
}

const cache = new Map<string, Guardado>();
/** Os índices montados de uma lista (`lerIndicePor`), por chave e nome */
const indices = new Map<string, { valor: unknown[]; indice: Map<string, unknown[]> }>();

const esquecer = (chave: string | null): void => {
  if (chave === null) {
    cache.clear();
    indices.clear();
    return;
  }
  cache.delete(chave);
  for (const k of [...indices.keys()]) if (k.startsWith(`${chave}#`)) indices.delete(k);
};

const vigiados = new WeakSet<object>();
let prototipoVigiado = false;

/**
 * Faz o armazenamento avisar este cache a cada gravação. No navegador, no
 * protótipo de `Storage` — atribuir `localStorage.setItem = …` gravaria
 * uma CHAVE chamada "setItem". Nos testes, no armazenamento falso.
 */
const vigiar = (armazenamento: Storage): void => {
  if (vigiados.has(armazenamento)) return;
  vigiados.add(armazenamento);
  const ehDoNavegador = typeof Storage !== 'undefined' && armazenamento instanceof Storage;
  if (ehDoNavegador && prototipoVigiado) return;
  const alvo = (ehDoNavegador ? Storage.prototype : armazenamento) as Storage;
  const setItem = alvo.setItem;
  const removeItem = alvo.removeItem;
  const clear = alvo.clear;
  alvo.setItem = function (this: Storage, chave: string, valor: string) {
    esquecer(String(chave));
    return setItem.call(this, chave, valor);
  };
  alvo.removeItem = function (this: Storage, chave: string) {
    esquecer(String(chave));
    return removeItem.call(this, chave);
  };
  alvo.clear = function (this: Storage) {
    esquecer(null);
    return clear.call(this);
  };
  if (ehDoNavegador) {
    prototipoVigiado = true;
    // Outra aba gravou: o que está em memória aqui envelheceu
    if (typeof window !== 'undefined') window.addEventListener('storage', (e) => esquecer(e.key));
  }
};

/**
 * Lê uma lista do armazenamento, sem reparsear o que não mudou.
 *
 * Devolve `[]` no lugar de qualquer coisa que não seja lista — texto
 * corrompido não pode derrubar a tela de quem só queria bater o ponto.
 */
/**
 * A lista guardada, conferida mas SEM CÓPIA — só para uso daqui de dentro.
 * O índice a usa: copiar 16 mil batidas para conferir se mudou era o que
 * custava 12,7 s no Início (medido no perfil do navegador, 20/10/2026).
 */
const listaConferida = (chave: string): unknown[] => {
  try {
    vigiar(localStorage);
    const guardado = cache.get(chave);
    if (guardado?.confiavel) return guardado.valor;

    const bruto = localStorage.getItem(chave);
    if (!bruto) return [];

    if (guardado && guardado.bruto === bruto) {
      guardado.confiavel = true;
      return guardado.valor;
    }

    const valor = JSON.parse(bruto);
    if (!Array.isArray(valor)) return [];

    cache.set(chave, { bruto, valor, confiavel: true });
    return valor;
  } catch {
    return [];
  }
};

export const lerLista = <T>(chave: string): T[] => [...listaConferida(chave)] as T[];

/**
 * A LISTA AGRUPADA POR UMA CHAVE — as batidas por pessoa e dia, por
 * exemplo. Quem pergunta pelas quatro batidas de um dia não precisa
 * percorrer as 16 mil: o índice é montado uma vez por versão da lista.
 *
 * O `Map` e os grupos são COMPARTILHADOS: quem for ordenar ou mexer,
 * copia o grupo antes (`[...grupo]`).
 */
export const lerIndicePor = <T>(chave: string, nome: string, chaveDe: (item: T) => string): Map<string, T[]> => {
  const valor = listaConferida(chave) as T[];
  const k = `${chave}#${nome}`;
  const montado = indices.get(k);
  if (montado && montado.valor === valor) return montado.indice as Map<string, T[]>;
  const indice = new Map<string, T[]>();
  for (const item of valor) {
    const c = chaveDe(item);
    const grupo = indice.get(c);
    if (grupo) grupo.push(item);
    else indice.set(c, [item]);
  }
  indices.set(k, { valor, indice: indice as Map<string, unknown[]> });
  return indice;
};

/**
 * Esquece o que está guardado.
 *
 * Não é preciso para o cache funcionar — ele se refaz sozinho quando o
 * texto muda. Existe para os testes, que trocam de armazenamento entre
 * um caso e outro: sem isto, o segundo caso leria o texto do primeiro e
 * passaria por um motivo errado.
 */
export const esquecerCacheDeLeitura = (chave?: string): void => esquecer(chave ?? null);
