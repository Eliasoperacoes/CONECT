/**
 * PEDE AO SERVIDOR O AVISO DE UMA MENSAGEM — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * MENSAGEM, E A PUBLICAÇÃO DIRIGIDA
 * ===================================================================
 *
 * A publicação para a REDE TODA avisa como mensagem: o recado vai ao
 * grupo de avisos da rede, onde estão todos, e sai por este caminho.
 *
 * A publicação DIRIGIDA (uma loja, um setor, algumas pessoas) não passa
 * pelo grupo: o recado ali anunciava a rede inteira o título de algo que
 * a maioria nem enxerga. Ela pede o aviso direto, para quem ela alcança
 * (`pedirAvisoDaPublicacao`).
 *
 * Em nenhum dos dois o servidor sabe quem uma publicação alcança. Essa
 * regra mora em `mural.ts` (`publicoAlvo`) e já esteve escrita em dois
 * lugares; o servidor copiá-la seria a terceira cópia. O aparelho do
 * autor manda a lista, e o servidor confere que quem pede é o autor.
 *
 * ===================================================================
 * O QUE O APARELHO MANDA, E O QUE O SERVIDOR CONFERE
 * ===================================================================
 *
 * Vai o id da mensagem e a prévia do texto. O servidor:
 *
 *   · confere que a mensagem existe e é de QUEM CHAMA — ninguém pede
 *     aviso de mensagem alheia;
 *   · tira do banco a conversa, os participantes e o nome do remetente.
 *
 * A prévia vem do aparelho porque `montarPreviaDaMensagem` é a mesma do
 * aviso do navegador, e reescrevê-la no servidor seria duas regras para
 * o mesmo texto. Ela é do próprio remetente: quem a forjasse estaria
 * forjando a própria mensagem, que ele já escreve como quiser.
 *
 * ===================================================================
 * NUNCA ATRAPALHA O ENVIO
 * ===================================================================
 *
 * A mensagem já está no banco quando isto roda. Aviso que falha é aviso
 * que não chegou — o sino mostra do mesmo jeito na próxima abertura.
 * Nada aqui espera, e nada aqui devolve erro para quem enviou.
 */
import { supabase, usandoNuvem } from './supabase';

/** O nome da função no Supabase. Muda aqui e em `supabase/functions/`. */
export const FUNCAO_DE_AVISO = 'enviar-aviso';

/** O Android corta bem antes disto; o resto só pesaria no pacote. */
const LIMITE_DA_PREVIA = 240;

export const pedirAvisoDaMensagem = (mensagemId: string, previa: string): void => {
  if (!supabase || !usandoNuvem()) return;

  try {
    supabase.functions
      .invoke(FUNCAO_DE_AVISO, {
        body: { mensagemId, previa: previa.slice(0, LIMITE_DA_PREVIA) },
      })
      .then(({ error }) => {
        if (error) console.warn('Aviso da mensagem não saiu:', error.message);
      })
      .catch(() => {});
  } catch {
    /* sem cliente de funções (teste, modo local): sem aviso, sem erro */
  }
};

/**
 * AVISA QUEM UMA PUBLICAÇÃO DIRIGIDA ALCANÇA.
 *
 * Quem recebe é calculado por quem chama, com `publicoAlvo` — a mesma
 * conta do "N de M leram". O servidor confere que quem pede é o autor;
 * forjar a lista só serviria para avisar alguém de uma publicação que o
 * próprio autor poderia mandar por mensagem.
 */
export const pedirAvisoDaPublicacao = (
  publicacaoId: string,
  destinatarios: string[],
  texto: string
): void => {
  if (!supabase || !usandoNuvem() || destinatarios.length === 0) return;

  try {
    supabase.functions
      .invoke(FUNCAO_DE_AVISO, {
        body: {
          publicacao: { id: publicacaoId, destinatarios, texto: texto.slice(0, LIMITE_DA_PREVIA) },
        },
      })
      .then(({ error }) => {
        if (error) console.warn('Aviso da publicação não saiu:', error.message);
      })
      .catch(() => {});
  } catch {
    /* sem cliente de funções (teste, modo local): sem aviso, sem erro */
  }
};

/**
 * AVISA O DONO DE UM DOCUMENTO DO RH: o holerite publicado, a advertência
 * registrada.
 *
 * Vão só os ids. O servidor pergunta ao banco se quem chama cuida de
 * pessoas, lê os documentos com a sessão dele e avisa o DONO de cada um —
 * tirado da linha, nunca daqui. Na carga do PDF, um pedido só com todos.
 */
export const pedirAvisoDeDocumentoRh = (tipo: 'holerite' | 'advertencia', ids: string[]): void => {
  if (!supabase || !usandoNuvem() || ids.length === 0) return;

  try {
    supabase.functions
      .invoke(FUNCAO_DE_AVISO, { body: { documentoRh: { tipo, ids } } })
      .then(({ error }) => {
        if (error) console.warn('Aviso do documento do RH não saiu:', error.message);
      })
      .catch(() => {});
  } catch {
    /* sem cliente de funções (teste, modo local): sem aviso, sem erro */
  }
};
