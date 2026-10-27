/**
 * ABRIR UMA COTAÇÃO JÁ FEITA, SEM PESQUISAR DE NOVO (Elias, 21/10/2026):
 * "ao clicar no Histórico ele faz uma nova pesquisa no B2B... não seria
 * necessária uma nova pesquisa, e sim só o resultado já carregado".
 *
 * Quem pede: o Histórico, o cartão da cotação no chat e o aviso
 * "Cotação respondida". Quem atende: a aba Cotar, que pode ainda nem estar
 * montada — por isso o pedido fica guardado até ela pegar, e um evento
 * avisa a que já está aberta.
 *
 * O que a aba mostra sem cotar: se a peça foi cotada HOJE, a grade inteira
 * (está no banco); se não, a foto guardada no Histórico — o preço pode ter
 * mudado, e cotar de novo é escolha da pessoa.
 */

export interface PedidoDeAbertura {
  codigo: string;
  /** Do Histórico: quando foi cotado e o resultado daquela vez, em uma frase */
  foto?: { quando: string; resumo: string };
}

const EVENTO = 'abrir';
const avisos = new EventTarget();
let pendente: PedidoDeAbertura | null = null;

/** Pede para a aba Cotar mostrar esta peça (sem cotar). */
export const pedirAbertura = (pedido: PedidoDeAbertura) => {
  pendente = pedido;
  avisos.dispatchEvent(new Event(EVENTO));
};

/** O pedido que espera, uma vez só: quem pega, consome. */
export const pegarAbertura = (): PedidoDeAbertura | null => {
  const p = pendente;
  pendente = null;
  return p;
};

/** A aba Cotar aberta ouve os pedidos que chegam depois. */
export const ouvirAberturas = (aoPedir: (p: PedidoDeAbertura) => void) => {
  const aoEvento = () => {
    const p = pegarAbertura();
    if (p) aoPedir(p);
  };
  avisos.addEventListener(EVENTO, aoEvento);
  return () => avisos.removeEventListener(EVENTO, aoEvento);
};

/**
 * OS CARTÕES ABERTOS SOBREVIVEM À TROCA DE TELA E AO F5. Sem isso, ir ao
 * chat e voltar — ou a aba montar duas vezes no caminho do botão "Abrir
 * cotação" — devolvia a aba vazia. Na sessão do navegador (fecha a aba,
 * esquece) e por pessoa: quem entra depois no mesmo computador não herda.
 * Nunca lança: sem armazenamento a aba só não lembra.
 */
const MAXIMO_ABERTOS = 10;
const chaveDosAbertos = (colaboradorId: string) => `conecta.cotador.abertos.${colaboradorId}`;

export const lembrarAbertos = (colaboradorId: string, codigos: string[]) => {
  try {
    sessionStorage.setItem(chaveDosAbertos(colaboradorId), JSON.stringify(codigos.slice(0, MAXIMO_ABERTOS)));
  } catch {
    /* aba anônima ou sem espaço */
  }
};

export const abertosGuardados = (colaboradorId: string): string[] => {
  try {
    const lidos: unknown = JSON.parse(sessionStorage.getItem(chaveDosAbertos(colaboradorId)) ?? '[]');
    return Array.isArray(lidos) ? lidos.filter((c): c is string => typeof c === 'string').slice(0, MAXIMO_ABERTOS) : [];
  } catch {
    return [];
  }
};
