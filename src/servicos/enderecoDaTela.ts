/**
 * O ENDEREÇO DE CADA TELA DO COMPUTADOR — /ponto/meu-ponto, /documentos/assinaturas.
 *
 * Pedido do Elias (06/10/2026): o endereço ficava parado em qualquer tela.
 * Sem ele, o voltar do navegador saía do CONECTA em vez de voltar à tela
 * anterior, e não havia como mandar a alguém o link de uma tela.
 *
 * SEM BIBLIOTECA DE ROTAS, DE PROPÓSITO. Quem vê cada tela e em que assunto
 * ela mora já é decidido em `telasPorAssunto.ts`; uma lista de rotas seria
 * a segunda lista de telas, e as regras de acesso teriam de ser repetidas
 * nela. Aqui o endereço SAI do catálogo (`ASSUNTOS`): tela nova ganha
 * endereço sozinha, e quem decide se a pessoa a alcança continua sendo
 * `telaQueAbre`.
 *
 * Só o computador usa: no celular o endereço não muda, e o voltar do
 * Android segue a pilha de `voltar.ts`.
 */
import { ASSUNTOS, type TelaWeb } from './telasPorAssunto';

/** "meu_ponto" → "meu-ponto": o endereço com hífen, como se escreve na web. */
const trecho = (id: string): string => id.replace(/_/g, '-');

/**
 * O caminho de cada tela. O Início é a raiz; o assunto de uma tela só é o
 * próprio assunto (/central); nos outros, o assunto e a tela
 * (/ponto/meu-ponto). O perfil não está na barra, e mora em /perfil.
 */
const CAMINHOS: ReadonlyMap<TelaWeb, string> = new Map<TelaWeb, string>([
  ...ASSUNTOS.flatMap((assunto) =>
    assunto.telas.map((tela): [TelaWeb, string] => [
      tela.id,
      tela.id === 'inicio'
        ? '/'
        : assunto.telas.length === 1
          ? `/${trecho(assunto.id)}`
          : `/${trecho(assunto.id)}/${trecho(tela.id)}`,
    ])
  ),
  ['perfil', '/perfil'],
]);

const TELAS = new Map<string, TelaWeb>([...CAMINHOS].map(([tela, caminho]) => [caminho, tela]));

/**
 * AS TELAS QUE TÊM LUGARES DENTRO DELAS no endereço (Elias, 21/10/2026:
 * "recarregar a página e ficar onde parou"). Em Ferramentas, a ferramenta e
 * a aba abertas vão depois do caminho: /ferramentas/cotador/margens. Quem
 * lê esse resto e confere se a pessoa pode é a própria tela.
 */
const COM_LUGAR_DENTRO: ReadonlySet<TelaWeb> = new Set<TelaWeb>(['ferramentas']);

/** O caminho de uma tela: o que a barra de endereços mostra. */
export const caminhoDaTela = (tela: TelaWeb): string => CAMINHOS.get(tela) ?? '/';

const limpar = (caminho: string): string => `/${caminho.toLowerCase().split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')}`;

/**
 * A tela de um caminho, ou nulo quando ele não é de tela nenhuma. A barra
 * no fim e as maiúsculas não contam: "/Ponto/Meu-Ponto/" é o meu ponto. Nas
 * telas com lugar dentro, o resto do caminho não muda a tela.
 */
export const telaDoCaminho = (caminho: string): TelaWeb | null => {
  const limpo = limpar(caminho);
  const exata = TELAS.get(limpo);
  if (exata) return exata;
  for (const tela of COM_LUGAR_DENTRO) {
    if (limpo.startsWith(`${caminhoDaTela(tela)}/`)) return tela;
  }
  return null;
};

/** O lugar dentro da tela: "/ferramentas/cotador/margens" → ["cotador", "margens"]. */
export const lugarDentroDaTela = (caminho: string, tela: TelaWeb): string[] => {
  if (!COM_LUGAR_DENTRO.has(tela)) return [];
  const limpo = limpar(caminho);
  const base = caminhoDaTela(tela);
  return limpo.startsWith(`${base}/`) ? limpo.slice(base.length + 1).split('/').filter(Boolean) : [];
};

/** O caminho já está nesta tela (com ou sem lugar dentro)? Para o endereço não ser reescrito à toa. */
export const caminhoEstaNaTela = (caminho: string, tela: TelaWeb): boolean => {
  const limpo = limpar(caminho);
  const base = caminhoDaTela(tela);
  return limpo === base || (COM_LUGAR_DENTRO.has(tela) && limpo.startsWith(`${base}/`));
};

/** Todos os caminhos, para os testes conferirem que não há dois iguais. */
export const todosOsCaminhos = (): Array<[TelaWeb, string]> => [...CAMINHOS];
