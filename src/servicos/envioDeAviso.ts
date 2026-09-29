/**
 * PEDE AO SERVIDOR O AVISO DE UMA MENSAGEM — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * POR QUE SÓ MENSAGEM
 * ===================================================================
 *
 * Publicação também avisa — e avisa POR AQUI. Publicar já manda um
 * recado ao grupo de avisos da rede, e citar alguém já manda a ele uma
 * mensagem. As duas coisas são mensagens, e passam por este caminho.
 *
 * É o que dispensa o servidor de saber quem uma publicação alcança. Essa
 * regra mora em `mural.ts` e já esteve escrita em dois lugares; o
 * servidor copiá-la seria a terceira cópia. Para mensagem, quem recebe é
 * quem PARTICIPA da conversa — e isso o banco sabe sozinho.
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
