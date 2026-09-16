/**
 * Preferências de conversa — CONECTA / Malachias Autopeças
 *
 * Fixar no topo e ocultar da lista. As duas são de CADA PESSOA: o que o
 * gerente fixa não aparece fixado para ninguém, e o que ele oculta continua
 * na lista dos outros.
 *
 * ===================================================================
 * OCULTAR NÃO É APAGAR
 * ===================================================================
 *
 * "Excluir conversa" aqui tira da lista de quem clicou. As mensagens
 * continuam no banco, a outra pessoa não perde nada, e a conversa VOLTA se
 * alguém escrever de novo — porque a alternativa seria a mensagem nova cair
 * num lugar que a pessoa não vê.
 *
 * É assim de propósito. O histórico é a base de controle da rede; quem
 * apaga mensagem é a regra de limpeza dos 3 meses, que corre no banco com
 * critério e não por clique de quem quer sumir com uma conversa.
 */

const CHAVE = 'conecta_v4_preferencias_conversa';

export interface PreferenciaDeConversa {
  /** No alto da lista, antes das não fixadas. */
  fixada?: boolean;
  /**
   * Quando a pessoa ocultou. Guardamos o INSTANTE, não um "sim/não",
   * porque é ele que decide se uma mensagem nova faz a conversa voltar:
   * mensagem posterior a esta data traz a conversa de volta.
   */
  ocultaDesde?: string;
}

export type MapaDePreferencias = Record<string, PreferenciaDeConversa>;

const ouvintes: Array<() => void> = [];

/**
 * Substitui o cache local pelo que veio do banco.
 *
 * Chamado pela sincronização. O banco é a verdade; o armazenamento do
 * aparelho serve para a lista abrir na hora, sem esperar a rede — mesmo
 * desenho do resto do sistema.
 */
export const aplicarPreferenciasDaNuvem = (
  colaboradorId: string,
  vindas: MapaDePreferencias
): void => {
  if (!colaboradorId) return;
  try {
    localStorage.setItem(chaveDe(colaboradorId), JSON.stringify(vindas));
  } catch {
    // Sem armazenamento: vale só nesta sessão
  }
  notificar();
};
const notificar = (): void => ouvintes.forEach((o) => o());

export const assinarPreferencias = (ouvinte: () => void): (() => void) => {
  ouvintes.push(ouvinte);
  return () => {
    const i = ouvintes.indexOf(ouvinte);
    if (i !== -1) ouvintes.splice(i, 1);
  };
};

/** Chave do armazenamento por pessoa: a preferência não é do aparelho. */
const chaveDe = (colaboradorId: string): string => `${CHAVE}_${colaboradorId}`;

export const obterPreferencias = (colaboradorId: string): MapaDePreferencias => {
  try {
    const bruto = localStorage.getItem(chaveDe(colaboradorId));
    if (!bruto) return {};
    const lido = JSON.parse(bruto);
    return lido && typeof lido === 'object' ? (lido as MapaDePreferencias) : {};
  } catch {
    return {};
  }
};

const gravar = (colaboradorId: string, mapa: MapaDePreferencias): void => {
  try {
    localStorage.setItem(chaveDe(colaboradorId), JSON.stringify(mapa));
  } catch {
    // Navegador sem armazenamento: a preferência só não sobrevive ao recarregar
  }
  notificar();
};

export const estaFixada = (colaboradorId: string, conversaId: string): boolean =>
  !!obterPreferencias(colaboradorId)[conversaId]?.fixada;

export const alternarFixada = (colaboradorId: string, conversaId: string): boolean => {
  const mapa = obterPreferencias(colaboradorId);
  const atual = mapa[conversaId] || {};
  const nova = !atual.fixada;

  mapa[conversaId] = { ...atual, fixada: nova };
  gravar(colaboradorId, mapa);

  // O banco recebe depois: a lista responde na hora, e a preferência
  // alcança os outros aparelhos na sequência
  void subirParaONuvem(conversaId, colaboradorId, { fixada: nova });
  return nova;
};

/** Tira da lista de quem pediu. As mensagens ficam onde estão. */
export const ocultarConversa = (colaboradorId: string, conversaId: string): void => {
  const mapa = obterPreferencias(colaboradorId);
  const agora = new Date().toISOString();
  mapa[conversaId] = {
    ...(mapa[conversaId] || {}),
    ocultaDesde: agora,
    // Ocultar uma conversa fixada e deixá-la fixada faria ela voltar
    // grudada no topo assim que chegasse mensagem
    fixada: false,
  };
  gravar(colaboradorId, mapa);
  void subirParaONuvem(conversaId, colaboradorId, { ocultaDesde: agora, fixada: false });
};

export const reexibirConversa = (colaboradorId: string, conversaId: string): void => {
  const mapa = obterPreferencias(colaboradorId);
  if (!mapa[conversaId]) return;
  delete mapa[conversaId].ocultaDesde;
  gravar(colaboradorId, mapa);
  void subirParaONuvem(conversaId, colaboradorId, { ocultaDesde: null });
};

/**
 * A conversa deve aparecer na lista desta pessoa?
 *
 * Oculta continua oculta até chegar mensagem NOVA — depois do instante em
 * que foi ocultada. Sem essa comparação, a mensagem nova cairia numa
 * conversa invisível e a pessoa não saberia que foi chamada.
 */
export const deveAparecer = (
  colaboradorId: string,
  conversa: { id: string; atualizadoEm: string }
): boolean => {
  const pref = obterPreferencias(colaboradorId)[conversa.id];
  if (!pref?.ocultaDesde) return true;

  const ocultaEm = new Date(pref.ocultaDesde).getTime();
  const mexidaEm = new Date(conversa.atualizadoEm).getTime();
  if (Number.isNaN(ocultaEm) || Number.isNaN(mexidaEm)) return true;

  return mexidaEm > ocultaEm;
};

/**
 * Aplica as preferências a uma lista já ordenada: tira as ocultas e sobe as
 * fixadas, preservando a ordem de dentro de cada grupo.
 */
export const aplicarPreferencias = <T extends { id: string; atualizadoEm: string }>(
  colaboradorId: string,
  conversas: T[]
): T[] => {
  const mapa = obterPreferencias(colaboradorId);
  const visiveis = conversas.filter((c) => deveAparecer(colaboradorId, c));

  const fixadas = visiveis.filter((c) => mapa[c.id]?.fixada);
  const demais = visiveis.filter((c) => !mapa[c.id]?.fixada);
  return [...fixadas, ...demais];
};

/** Quantas conversas estão ocultas agora — para a lista oferecer trazê-las de volta. */
export const contarOcultas = <T extends { id: string; atualizadoEm: string }>(
  colaboradorId: string,
  conversas: T[]
): number => conversas.filter((c) => !deveAparecer(colaboradorId, c)).length;

/**
 * Manda a preferência para o banco.
 *
 * Importado sob demanda de propósito: `nuvemComunicacao` já lê este
 * arquivo, e uma importação no topo fecharia um ciclo entre os dois.
 *
 * Falha de rede não desfaz o que a pessoa acabou de fazer na tela — a
 * próxima sincronização reconcilia. Ocultar uma conversa e ver ela voltar
 * por causa de um erro de rede seria pior do que a preferência demorar.
 */
const subirParaONuvem = async (
  conversaId: string,
  colaboradorId: string,
  preferencia: { fixada?: boolean; ocultaDesde?: string | null }
): Promise<void> => {
  try {
    const { usandoNuvem } = await import('./supabase');
    if (!usandoNuvem()) return;
    const { nuvemComunicacao } = await import('./nuvemComunicacao');
    await nuvemComunicacao.salvarPreferenciaDeConversa(conversaId, colaboradorId, preferencia);
  } catch {
    // Sem rede: fica valendo o que está no aparelho
  }
};
