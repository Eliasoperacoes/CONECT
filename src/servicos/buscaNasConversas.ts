/**
 * A BUSCA NAS CONVERSAS — CONECTA / Malachias Autopeças
 *
 * Pedido do Elias: "no chat principal, uma barra de pesquisa no superior
 * (estilo WhatsApp) para buscar palavras de conversa e encontrar algo
 * específico".
 *
 * ===================================================================
 * UMA REGRA DE "ESTA MENSAGEM CASA", para as duas buscas
 * ===================================================================
 *
 * A lupa dentro da conversa já buscava — com a regra escrita na tela:
 * texto, nome do arquivo, legenda da foto, em minúsculas. A busca da lista
 * pergunta a mesma coisa sobre TODAS as conversas. As duas perguntam aqui:
 * se cada uma tivesse a sua, "achei na lista" e "não achei na conversa"
 * aconteceriam para a mesma palavra.
 *
 * SEM ACENTO: quem procura "peca" acha "peça". No balcão ninguém para
 * para achar o ç no teclado do celular.
 *
 * ===================================================================
 * SÓ O QUE ESTÁ NO APARELHO
 * ===================================================================
 *
 * A busca lê as mensagens já sincronizadas, sem ir ao banco. É o que a
 * torna instantânea a cada letra — e é o mesmo alcance da conversa aberta.
 */
import type { Conversa, Mensagem } from '../tipos';

/** "Peça Nº 3" → "peca no 3": sem acento, minúsculo, sem espaço nas pontas. */
export const normalizarBusca = (texto: string): string =>
  texto
    .normalize('NFD')
    // \p{M}: as marcas de acento que o NFD separou da letra (ç → c + ¸)
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

/** O que de uma mensagem se procura: o texto, o nome do arquivo, a legenda. */
export const textoPesquisavel = (m: Mensagem): string => {
  if (m.tipo === 'texto') return m.texto || '';
  if (m.tipo === 'arquivo') return m.arquivoNome || '';
  if (m.tipo === 'imagem') return m.legenda || '';
  return '';
};

/** Esta mensagem casa com o termo? Termo vazio casa com tudo. */
export const mensagemCasaComBusca = (m: Mensagem, termo: string): boolean => {
  const procurado = normalizarBusca(termo);
  if (!procurado) return true;
  const texto = textoPesquisavel(m);
  return !!texto && normalizarBusca(texto).includes(procurado);
};

/**
 * O pedaço da mensagem em volta do que foi encontrado, como no WhatsApp:
 * "…a peça do Gol chegou hoje…". Mensagem longa não cabe numa linha, e o
 * começo dela quase nunca é onde está a palavra procurada.
 */
export const trechoEmVolta = (texto: string, termo: string, largura = 70): string => {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  const onde = normalizarBusca(limpo).indexOf(normalizarBusca(termo));
  if (onde < 0 || limpo.length <= largura) return limpo;

  const inicio = Math.max(0, onde - Math.floor(largura / 3));
  const fim = Math.min(limpo.length, inicio + largura);
  return `${inicio > 0 ? '…' : ''}${limpo.slice(inicio, fim).trim()}${fim < limpo.length ? '…' : ''}`;
};

export interface ResultadoDaBusca {
  /** Conversas cujo NOME casa: a pessoa ou o grupo procurado. */
  conversas: Conversa[];
  /** Mensagens que casam, da mais recente para a mais antiga. */
  mensagens: Array<{ conversa: Conversa; mensagem: Mensagem }>;
}

/**
 * Procura o termo nos nomes das conversas e nas mensagens delas.
 *
 * O teto de mensagens existe porque a lista é para ACHAR, e não para ler
 * o histórico: passando de 50 resultados, a palavra é comum demais e a
 * pessoa refina. Sem teto, "ok" montaria milhares de linhas a cada letra.
 */
export const buscarNasConversas = (
  termo: string,
  conversas: Conversa[],
  mensagensDe: (conversaId: string) => Mensagem[],
  limite = 50
): ResultadoDaBusca => {
  const procurado = normalizarBusca(termo);
  if (!procurado) return { conversas: [], mensagens: [] };

  const porNome = conversas.filter((c) => normalizarBusca(c.nome || '').includes(procurado));

  const mensagens = conversas
    .flatMap((conversa) =>
      mensagensDe(conversa.id)
        .filter((m) => mensagemCasaComBusca(m, procurado))
        .map((mensagem) => ({ conversa, mensagem }))
    )
    .sort((a, b) => (b.mensagem.criadoEm || '').localeCompare(a.mensagem.criadoEm || ''))
    .slice(0, limite);

  return { conversas: porNome, mensagens };
};
