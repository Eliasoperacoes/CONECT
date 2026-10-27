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
 * Então, toda vez que o canal VOLTA, o cache é recarregado — e quando a
 * pessoa volta para o aplicativo, só se pode ter havido perda
 * (`deveRecarregarAoVoltar`). Não há consulta periódica: baixar
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
/** Os canais que estão fora do ar agora: a volta à tela recarrega se houver algum. */
const canaisCaidos = new Set<string>();

export const acompanharCanal = (nome: string) => {
  let jaInscrito = false;
  return (status: string, erro?: Error): void => {
    if (status === 'SUBSCRIBED') {
      canaisCaidos.delete(nome);
      if (jaInscrito) pedirRecarga();
      jaInscrito = true;
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      canaisCaidos.add(nome);
      console.warn(`Tempo real (${nome}) caiu: ${status}`, erro?.message || '');
    }
  };
};

/**
 * Escondida por mais que isto, a volta recarrega mesmo com os canais de pé:
 * celular bloqueado, o sistema operacional pode ter cortado a conexão sem
 * o canal perceber a tempo.
 */
export const AUSENCIA_LONGA_MS = 10 * 60 * 1000;

/**
 * VOLTAR PARA A TELA NÃO É MOTIVO, SOZINHO, PARA BAIXAR TUDO (26/10/2026).
 *
 * Cada troca de aba no balcão e cada tela do celular acesa disparava a
 * carga completa — até 2,4 MB para o RH, 85 % dela ponto e apurações. Eram
 * ~9 cargas por pessoa por dia, e quase todas por isto (medir-trafego.sql).
 * Com os canais de pé, cada mudança já chegou ao vivo. Recarrega só se
 * algum caiu ou se a tela ficou escondida tempo demais.
 */
export const deveRecarregarAoVoltar = (escondidaPorMs: number, caidos: number): boolean =>
  caidos > 0 || escondidaPorMs >= AUSENCIA_LONGA_MS;

/**
 * A pessoa voltou para o aplicativo (aba em primeiro plano, tela do
 * celular acesa, rede de volta). Enquanto ela estava fora, o sistema
 * operacional pode ter suspendido a conexão sem o canal perceber a tempo.
 */
export const recarregarAoVoltar = (): (() => void) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  let escondidaEm: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === 'hidden') {
      escondidaEm = Date.now();
      return;
    }
    const escondidaPorMs = escondidaEm === null ? 0 : Date.now() - escondidaEm;
    escondidaEm = null;
    if (deveRecarregarAoVoltar(escondidaPorMs, canaisCaidos.size)) pedirRecarga();
  };
  const aoVoltarARede = () => pedirRecarga();

  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  window.addEventListener('online', aoVoltarARede);
  return () => {
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    window.removeEventListener('online', aoVoltarARede);
  };
};
