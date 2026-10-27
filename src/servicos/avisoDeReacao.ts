/**
 * "FULANO REAGIU 👍 À SUA MENSAGEM" NO NAVEGADOR (21/10/2026)
 *
 * Elias: "as reações não chegam notificação". No aplicativo Android quem
 * avisa é o servidor (`pedirAvisoDaReacao`, caminho 7 de enviar-aviso). No
 * computador e no iPhone, com o CONECTA aberto em outra aba, o aviso é do
 * navegador — e sai daqui, quando o evento ao vivo traz a reação nova.
 *
 * Só o autor é avisado, e só da reação de outra pessoa. A reação que já
 * estava (a carga, a reconexão) não avisa: conta só o que o evento
 * acrescentou à mensagem que o aparelho já tinha.
 */
import type { Colaborador, Conversa, Mensagem } from '../tipos';
import { janelaEstaVisivel, mostrarAvisoDeMensagem, tocarAvisoDeMensagem } from './notificacoes';

/** As reações que o evento acrescentou à MINHA mensagem, de outras pessoas. */
export const reacoesNovasDeOutros = (
  antes: Mensagem | undefined,
  depois: Mensagem | undefined,
  meuId: string
): { emoji: string; quem: string }[] => {
  // Sem a de antes, é mensagem nova (ou a carga): não é reação
  if (!antes || !depois || depois.remetenteId !== meuId || depois.apagadaEm) return [];
  const novas: { emoji: string; quem: string }[] = [];
  for (const [emoji, ids] of Object.entries(depois.reacoes || {})) {
    const jaTinha = antes.reacoes?.[emoji] || [];
    for (const quem of ids) if (quem !== meuId && !jaTinha.includes(quem)) novas.push({ emoji, quem });
  }
  return novas;
};

export const avisarReacoesNoNavegador = (
  novas: { emoji: string; quem: string }[],
  mensagem: Mensagem,
  previa: string,
  conversa: Conversa | undefined,
  colaboradores: Colaborador[]
): void => {
  if (novas.length === 0) return;
  const { emoji, quem } = novas[novas.length - 1];
  const pessoa = colaboradores.find((c) => c.id === quem);
  const nome = pessoa?.nome || 'Alguém';
  const corpo = previa ? `${nome} reagiu ${emoji} à sua mensagem: "${previa}"` : `${nome} reagiu ${emoji} à sua mensagem`;
  if (!janelaEstaVisivel()) tocarAvisoDeMensagem();
  void mostrarAvisoDeMensagem({
    titulo: conversa?.tipo === 'grupo' ? conversa.nome : nome,
    corpo,
    conversaId: mensagem.conversaId,
    foto: pessoa?.foto,
  });
};
