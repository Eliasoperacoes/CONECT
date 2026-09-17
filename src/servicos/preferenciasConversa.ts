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
  /**
   * REMOVIDA da lista, e ao contrário de arquivada NÃO volta sozinha.
   *
   * A diferença entre as duas é só esta, e é ela que justifica existirem
   * duas: arquivar é "depois eu vejo" — a conversa volta na próxima
   * mensagem. Remover é "sai da minha aba" — só volta quando a própria
   * pessoa chamar o colega de novo.
   *
   * NADA é apagado nos dois casos. O histórico fica no banco e aparece
   * inteiro quando a conversa reabre.
   */
  removida?: boolean;
}

export type MapaDePreferencias = Record<string, PreferenciaDeConversa>;

const ouvintes: Array<() => void> = [];

/**
 * As preferências que este aparelho acabou de mudar e ainda estão subindo.
 *
 * Existe pelo mesmo motivo que a mensagem em trânsito precisa sobreviver à
 * sincronização: fixar e ocultar respondem na tela na hora e sobem depois.
 * Se uma sincronização que já estava a caminho chegasse no meio, ela
 * reescrevia o mapa com o estado ANTIGO do banco — e a conversa que você
 * acabou de tirar da lista voltava sozinha, ou a que você fixou se
 * desfixava. Segundos depois se corrigia, o que é pior: a pessoa já apertou
 * de novo.
 *
 * A chave é pessoa + conversa, porque a preferência é de quem a escolheu.
 */
const subindoAgora = new Set<string>();

const chaveEmTransito = (colaboradorId: string, conversaId: string): string =>
  `${colaboradorId}::${conversaId}`;

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

  /**
   * O banco é a verdade sobre o que ele CONHECE — e só sobre isso.
   *
   * Duas coisas ele não conhece, e as duas precisam sobreviver à reescrita:
   * o que ainda está subindo, e a conversa que nunca chegou a existir no
   * banco por não ter nenhuma mensagem.
   */
  const aManter = obterPreferencias(colaboradorId);
  const resultado: MapaDePreferencias = { ...vindas };

  for (const conversaId of Object.keys(aManter)) {
    /**
     * 1. O QUE AINDA ESTÁ SUBINDO.
     *
     * A escolha acabou de ser feita e o banco ainda não sabe dela.
     */
    if (subindoAgora.has(chaveEmTransito(colaboradorId, conversaId))) {
      resultado[conversaId] = aManter[conversaId];
      continue;
    }

    /**
     * 2. O QUE O BANCO NUNCA VIU.
     *
     * O banco só tem linha de participante para conversa que JÁ EXISTE nele
     * — e conversa sem nenhuma mensagem nunca foi gravada. A gravação da
     * preferência dessas é um `update` que não encontra linha: não dá erro,
     * simplesmente não faz nada.
     *
     * Sem esta ressalva acontecia o seguinte, e foi relatado: a pessoa
     * excluía TODAS as conversas para limpar a aba, muitas delas vazias;
     * abria UMA para falar com alguém; a abertura disparava uma
     * sincronização; e o mapa inteiro era substituído pelo que o banco
     * sabia — que era nada sobre as vazias. Todas voltavam de uma vez.
     *
     * O banco manda sobre o que ele CONHECE. Sobre conversa que ele nunca
     * ouviu falar, quem manda é o aparelho.
     */
    if (!(conversaId in vindas)) {
      resultado[conversaId] = aManter[conversaId];
    }
  }

  try {
    localStorage.setItem(chaveDe(colaboradorId), JSON.stringify(resultado));
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

/**
 * ARQUIVAR: tira da lista e devolve na próxima mensagem.
 *
 * Chamava-se "excluir" na tela, e não era: nada era excluído, e a conversa
 * voltava sozinha assim que o colega escrevesse. Nome que descreve outra
 * coisa faz a pessoa evitar o botão certo com medo de perder o histórico.
 */
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

/**
 * REMOVER: sai da aba e não volta sozinha.
 *
 * Mensagem nova do colega continua chegando — o contador conta e o aviso do
 * celular toca. O que não acontece é a conversa reaparecer na lista por
 * conta própria: quem decide isso é quem removeu, chamando o colega de
 * novo.
 *
 * O `ocultaDesde` vai junto para a conversa sair na hora, sem esperar
 * sincronização. E a marca de fixada cai: conversa removida que volta
 * grudada no topo não faz sentido nenhum.
 */
export const removerConversaDaLista = (
  colaboradorId: string,
  conversaId: string
): void => {
  const mapa = obterPreferencias(colaboradorId);
  const agora = new Date().toISOString();
  mapa[conversaId] = {
    ...(mapa[conversaId] || {}),
    removida: true,
    ocultaDesde: agora,
    fixada: false,
  };
  gravar(colaboradorId, mapa);
  void subirParaONuvem(conversaId, colaboradorId, {
    removida: true,
    ocultaDesde: agora,
    fixada: false,
  });
};

export const reexibirConversa = (colaboradorId: string, conversaId: string): void => {
  const mapa = obterPreferencias(colaboradorId);
  if (!mapa[conversaId]) return;
  delete mapa[conversaId].ocultaDesde;
  // A remoção também cai: abrir a conversa É o pedido de trazê-la de volta
  delete mapa[conversaId].removida;
  gravar(colaboradorId, mapa);
  void subirParaONuvem(conversaId, colaboradorId, {
    ocultaDesde: null,
    removida: false,
  });
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

  /**
   * Removida não volta por mensagem nova. É a única diferença entre remover
   * e arquivar, e ela precisa vir ANTES da comparação de datas — senão a
   * primeira mensagem do colega desfaria a remoção.
   */
  if (pref?.removida) return false;

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
/** Está fora da lista por EXCLUSÃO, e não por arquivamento? */
export const estaRemovida = (colaboradorId: string, conversaId: string): boolean =>
  !!obterPreferencias(colaboradorId)[conversaId]?.removida;

/**
 * Quantas estão ARQUIVADAS — e só elas.
 *
 * O rodapé da lista usa este número para oferecer "mostrar todas". Se as
 * excluídas entrassem na conta, um clique ali desfaria toda exclusão de uma
 * vez, e a diferença entre arquivar e excluir deixaria de existir na
 * prática — o botão genérico venceria a escolha da pessoa.
 *
 * Excluída só volta por um caminho: chamar o colega de novo.
 */
export const contarArquivadas = <T extends { id: string; atualizadoEm: string }>(
  colaboradorId: string,
  conversas: T[]
): number =>
  conversas.filter(
    (c) => !deveAparecer(colaboradorId, c) && !estaRemovida(colaboradorId, c.id)
  ).length;

/**
 * Devolve à lista as arquivadas, sem tocar nas excluídas.
 *
 * Existe aqui, e não na tela, porque a regra de "quais voltam" é a mesma que
 * decide a contagem logo acima. Separadas, elas divergiriam — e a tela
 * mostraria um número que não bate com o que o botão faz.
 */
export const reexibirArquivadas = <T extends { id: string; atualizadoEm: string }>(
  colaboradorId: string,
  conversas: T[]
): void => {
  for (const c of conversas) {
    if (deveAparecer(colaboradorId, c)) continue;
    if (estaRemovida(colaboradorId, c.id)) continue;
    reexibirConversa(colaboradorId, c.id);
  }
};

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
  preferencia: { fixada?: boolean; ocultaDesde?: string | null; removida?: boolean }
): Promise<void> => {
  const emTransito = chaveEmTransito(colaboradorId, conversaId);
  subindoAgora.add(emTransito);

  try {
    const { usandoNuvem } = await import('./supabase');
    if (!usandoNuvem()) return;
    const { nuvemComunicacao } = await import('./nuvemComunicacao');
    await nuvemComunicacao.salvarPreferenciaDeConversa(conversaId, colaboradorId, preferencia);
  } catch {
    // Sem rede: fica valendo o que está no aparelho
  } finally {
    /**
     * A proteção acaba junto com a subida, dê certo ou não.
     *
     * Se deu certo, a próxima sincronização traz o mesmo valor e nada muda.
     * Se falhou, o banco volta a mandar — e é isso mesmo: preferência que
     * não subiu não vale nos outros aparelhos, e uma tela dizendo que vale
     * seria outra tela mentindo.
     */
    subindoAgora.delete(emTransito);
  }
};
