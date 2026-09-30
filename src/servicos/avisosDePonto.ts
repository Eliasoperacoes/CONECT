/**
 * OS AVISOS DO PONTO — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * POR QUE EXISTE
 * ===================================================================
 *
 * O Elias tirou o sino: "vamos utilizar só as [notificações] do
 * sistema", e "certificar que todas as notificações estejam
 * configuradas, não só as da mensagem".
 *
 * Mensagem e publicação já chegavam pelo servidor, com o aplicativo
 * fechado. O ponto não: ajuste de jornada, atestado e folga esperando
 * decisão só apareciam no sino — e no Android, nem isso. Sem o sino, o
 * gestor não saberia de nada. E quem pediu descobria a decisão abrindo
 * o Ponto por conta própria.
 *
 * ===================================================================
 * QUEM É AVISADO NÃO SE DECIDE AQUI
 * ===================================================================
 *
 * Este arquivo só LEVA o pedido ao servidor. Quem deve saber de um
 * pedido é regra do organograma (`deveSerAvisadoSobre`) e das
 * ausências (`deveSerAvisadoDeAusencia`) — os mesmos que o sino usava.
 * Quem chama passa a regra; `quemAcompanha` só a aplica às pessoas.
 * Uma terceira cópia de "quem responde por quem" é a história que este
 * sistema já contou quatro vezes.
 *
 * Na DECISÃO não há o que calcular: quem é avisado é o dono do pedido,
 * e o servidor tira isso do próprio banco.
 *
 * ===================================================================
 * NUNCA ATRAPALHA O QUE JÁ FOI FEITO
 * ===================================================================
 *
 * Roda depois de o pedido ou a decisão estarem gravados. Aviso que
 * falha é aviso que não chegou — a pendência continua na tela e com o
 * número na aba. Nada aqui espera, e nada aqui devolve erro.
 */
import { supabase, usandoNuvem } from './supabase';
import { bancoDados } from './bancoDados';
import { FUNCAO_DE_AVISO } from './envioDeAviso';
import type { Colaborador } from '../tipos';
import type { SecaoDestino } from './destinoDoAviso';

/** As duas tabelas que guardam pedidos com decisão. O servidor aceita só estas. */
export type TabelaDePonto = 'ajustes_jornada' | 'justificativas_ausencia';


/** O Android corta bem antes disto. */
const LIMITE_DO_TEXTO = 240;

/**
 * QUEM ACOMPANHA ESTE PEDIDO, pela regra que quem chama passar.
 *
 * Fica de fora quem está desligado e quem está pedindo o aviso: o
 * gestor que abre um pedido em nome da equipe não precisa ser avisado
 * do que acabou de fazer.
 */
export const quemAcompanha = (regra: (quem: Colaborador) => boolean): string[] => {
  const eu = bancoDados.obterColaboradorAtual();
  return bancoDados
    .obterColaboradores()
    .filter((c) => c.ativo !== false && c.id !== eu.id && regra(c))
    .map((c) => c.id);
};

const pedir = (corpo: Record<string, unknown>): void => {
  if (!supabase || !usandoNuvem()) return;

  try {
    supabase.functions
      .invoke(FUNCAO_DE_AVISO, { body: corpo })
      .then(({ error }) => {
        if (error) console.warn('Aviso do ponto não saiu:', error.message);
      })
      .catch(() => {});
  } catch {
    /* sem cliente de funções (teste, modo local): sem aviso, sem erro */
  }
};

/**
 * UM PEDIDO NOVO ESPERA DECISÃO: avisa quem acompanha.
 *
 * O servidor confere que o pedido existe, está pendente e está ao
 * alcance de quem chama — lido com a sessão dela, então é a RLS do
 * banco que diz. O aviso só fala do próprio pedido: quem forjasse a
 * lista de destinatários só conseguiria contar a alguém sobre um pedido
 * que ele mesmo pode ver, o que já faria por mensagem.
 */
export const avisarPedidoDePonto = (dados: {
  tabela: TabelaDePonto;
  id: string;
  destinatarios: string[];
  /** Para onde o toque leva: a fila de quem decide, ou a escala. */
  secao: Exclude<SecaoDestino, 'meu_ponto'>;
  texto: string;
}): void => {
  if (dados.destinatarios.length === 0) return;
  pedir({
    ponto: {
      evento: 'pedido',
      tabela: dados.tabela,
      id: dados.id,
      destinatarios: dados.destinatarios,
      secao: dados.secao,
      texto: dados.texto.slice(0, LIMITE_DO_TEXTO),
    },
  });
};

/**
 * UM PEDIDO FOI DECIDIDO: avisa o dono.
 *
 * O servidor confere que quem chama é quem decidiu, e tira o dono do
 * banco — o aparelho não escolhe quem recebe.
 */
export const avisarDecisaoDePonto = (dados: {
  tabela: TabelaDePonto;
  id: string;
  texto: string;
}): void => {
  pedir({
    ponto: {
      evento: 'decisao',
      tabela: dados.tabela,
      id: dados.id,
      secao: 'meu_ponto',
      texto: dados.texto.slice(0, LIMITE_DO_TEXTO),
    },
  });
};

/**
 * O TEXTO DA DECISÃO, o mesmo para ajuste, ausência e folga.
 *
 * "Aprovado" sem concordância de gênero de propósito: "hora extra
 * aprovada", "débito aprovado", "folga aprovada" pediriam uma tabela de
 * gêneros só para isto. O motivo da recusa vai junto — é a primeira
 * coisa que quem teve o pedido recusado quer saber.
 */
export const textoDaDecisao = (
  aprovado: boolean,
  descricao: string,
  motivo?: string
): string =>
  `${aprovado ? 'Aprovado' : 'Recusado'}: ${descricao}${motivo?.trim() ? ` · ${motivo.trim()}` : ''}`;
