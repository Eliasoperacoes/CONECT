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

/** O caminho de uma tela: o que a barra de endereços mostra. */
export const caminhoDaTela = (tela: TelaWeb): string => CAMINHOS.get(tela) ?? '/';

/**
 * A tela de um caminho, ou nulo quando ele não é de tela nenhuma. A barra
 * no fim e as maiúsculas não contam: "/Ponto/Meu-Ponto/" é o meu ponto.
 */
export const telaDoCaminho = (caminho: string): TelaWeb | null => {
  const limpo = `/${caminho.toLowerCase().split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')}`;
  return TELAS.get(limpo) ?? null;
};

/** Todos os caminhos, para os testes conferirem que não há dois iguais. */
export const todosOsCaminhos = (): Array<[TelaWeb, string]> => [...CAMINHOS];
