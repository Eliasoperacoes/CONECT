/**
 * CHAMAR QUEM NÃO BATEU O PONTO — num toque (Elias, 16/10/2026).
 *
 * O botão de chat de "Sem bater hoje" só abria a conversa vazia, e o líder
 * digitava o mesmo recado para cada um. Agora o toque manda o recado e abre
 * a conversa com ele já enviado — escolha do Elias, entre mandar na hora e
 * deixar escrito para conferir.
 *
 * Um recado por pessoa por dia: o segundo toque só abre a conversa. Sem
 * isso, quem toca duas vezes (ou volta à lista depois) repetiria a cobrança.
 */
import { bancoDados } from './bancoDados';
import { dataDeHoje, formatarDataBR, paraDataLocal } from './ponto';
import { primeiroNome } from './saudacao';
import type { Mensagem } from '../tipos';

/** O recado, com o primeiro nome e a data — o mesmo para todos */
export const recadoDeQuemNaoBateu = (nome: string, data: string): string =>
  `Oi, ${primeiroNome(nome)}! Ainda não vi o seu ponto de hoje (${formatarDataBR(data).slice(0, 5)}). ` +
  'Se esqueceu, bata agora; se é folga ou atestado, me avise.';

/** Se eu já mandei este recado hoje nesta conversa */
export const jaChameiHoje = (mensagens: Mensagem[], meuId: string, recado: string, hoje: string): boolean =>
  mensagens.some(
    (m) => m.remetenteId === meuId && m.texto === recado && paraDataLocal(new Date(m.criadoEm)) === hoje
  );

/**
 * Manda o recado (se ainda não foi hoje) e devolve a conversa para abrir.
 * A conversa abre mesmo se o envio falhar: o líder ainda pode escrever.
 */
export const chamarQuemNaoBateu = async (
  colegaId: string
): Promise<{ conversaId: string; enviada: boolean; erro?: string }> => {
  const colega = bancoDados.obterColaboradorPorId(colegaId);
  const conversaId = bancoDados.obterOuCriarConversaIndividual(colegaId).id;
  if (!colega) return { conversaId, enviada: false, erro: 'Colaborador não encontrado.' };

  const hoje = dataDeHoje();
  const recado = recadoDeQuemNaoBateu(colega.nome, hoje);
  const eu = bancoDados.obterColaboradorAtual().id;
  if (jaChameiHoje(bancoDados.obterMensagens(conversaId), eu, recado, hoje)) {
    return { conversaId, enviada: false };
  }

  const res = await bancoDados.enviarMensagem(conversaId, { tipo: 'texto', texto: recado });
  return { conversaId, enviada: res.sucesso, erro: res.sucesso ? undefined : res.erro };
};
