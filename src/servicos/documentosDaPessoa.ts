/**
 * OS DOCUMENTOS DA PESSOA MUDARAM — assinou um holerite ou um espelho, deu
 * ciência numa advertência.
 *
 * O selo de Documentos e o sino do computador contam o que falta assinar,
 * mas só recontavam ao entrar e sair da aba Eu do celular: no computador,
 * depois de assinar, os dois continuavam acusando o que já estava feito
 * (Elias, 06/10/2026: "notificações marcadas"). Quem assina avisa aqui;
 * quem conta escuta.
 */
const EVENTO = 'conecta:documentos-mudaram';

/** Chamado por quem acabou de mudar um documento (assinatura.ts, rh.ts). */
export const avisarQueDocumentosMudaram = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENTO));
};

/** Escuta a mudança; devolve a função que para de escutar. */
export const ouvirMudancaDeDocumentos = (aoMudar: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
};
