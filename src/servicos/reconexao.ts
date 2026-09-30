/**
 * O QUE MUDOU ENQUANTO O APARELHO ESTAVA FORA DO AR.
 *
 * O Elias: "as informações não estão atualizando, fica com a necessidade
 * de ficar atualizando a página — principalmente mensagens de outros
 * colaboradores". Medido na produção (30/09/2026): as treze tabelas
 * escutadas respondem "Subscribed to PostgreSQL". O servidor avisa.
 *
 * O furo era do aparelho. O canal de tempo real cai o tempo todo — aba
 * em segundo plano, tela do celular apagada, Wi-Fi que vira 4G — e a
 * biblioteca reconecta sozinha. Mas o aviso que passou durante a queda
 * não é reenviado: a mensagem chegou no banco, o aviso se perdeu, e a
 * tela ficava parada até alguém apertar F5.
 *
 * Então, toda vez que o canal VOLTA, e toda vez que a pessoa volta para o
 * aplicativo, o cache é recarregado. Não há consulta periódica: baixar
 * as conversas custa, e 89 aparelhos fazendo isso a cada minuto gastariam
 * o plano (docs/LIMITES-SUPABASE.md). Recarrega-se só quando pode ter
 * havido perda.
 */

/** Duas recargas em menos que isto viram uma: a volta dispara vários sinais juntos. */
export const INTERVALO_MINIMO_MS = 15_000;

let recarregar: (() => Promise<void>) | null = null;
let ultima = 0;
let emCurso = false;

/** Quem sabe recarregar tudo (`iniciarNuvem`) se registra aqui. */
export const definirRecarga = (fn: (() => Promise<void>) | null): void => {
  recarregar = fn;
  ultima = 0;
  emCurso = false;
};

/**
 * Pede a recarga. Devolve se ela foi disparada — `false` quando outra
 * acabou de acontecer ou ainda está correndo.
 */
export const pedirRecarga = (agora: number = Date.now()): boolean => {
  if (!recarregar || emCurso) return false;
  if (agora - ultima < INTERVALO_MINIMO_MS) return false;

  ultima = agora;
  emCurso = true;
  recarregar()
    .catch((erro) => console.error('Falha ao recarregar depois da reconexão:', erro))
    .finally(() => {
      emCurso = false;
    });
  return true;
};

/**
 * O acompanhante de um canal: passa no `.subscribe()`.
 *
 * A primeira inscrição não recarrega — a carga inicial acabou de trazer
 * tudo. Cada inscrição DEPOIS dela é uma volta depois de queda, e é
 * nessa hora que os avisos perdidos precisam ser buscados.
 */
export const acompanharCanal = (nome: string) => {
  let jaInscrito = false;
  return (status: string, erro?: Error): void => {
    if (status === 'SUBSCRIBED') {
      if (jaInscrito) pedirRecarga();
      jaInscrito = true;
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(`Tempo real (${nome}) caiu: ${status}`, erro?.message || '');
    }
  };
};

/**
 * A pessoa voltou para o aplicativo (aba em primeiro plano, tela do
 * celular acesa, rede de volta). Enquanto ela estava fora, o sistema
 * operacional pode ter suspendido a conexão sem o canal perceber a tempo.
 */
export const recarregarAoVoltar = (): (() => void) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  const aoMudarVisibilidade = () => {
    if (document.visibilityState === 'visible') pedirRecarga();
  };
  const aoVoltarARede = () => pedirRecarga();

  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  window.addEventListener('online', aoVoltarARede);
  return () => {
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    window.removeEventListener('online', aoVoltarARede);
  };
};
