/**
 * Câmera e microfone — CONECTA / Malachias Autopeças
 *
 * UM LUGAR SÓ ABRE, E UM LUGAR SÓ FECHA.
 *
 * Três telas pedem câmera ou microfone: a foto do chat, a leitura do QR do
 * ponto e o recado de voz. Cada uma fechava o que abria, e mesmo assim o
 * aparelho ficava com a luz da câmera acesa depois de fechar o aplicativo.
 *
 * O problema de cada tela cuidar do seu é que basta UM caminho esquecido —
 * uma tela derrubada por erro, o navegador fechado com o modal aberto, o
 * aplicativo mandado para segundo plano — para o fluxo continuar vivo. E
 * não há como perguntar ao navegador "quais fluxos estão abertos": quem não
 * guardou a referência não consegue mais desligar.
 *
 * Então é aqui que se guarda. Tudo que este arquivo abre, ele sabe fechar,
 * e fecha sozinho quando o aplicativo sai da frente.
 *
 * ===================================================================
 * POR QUE SOLTAR AO SAIR DA FRENTE, E NÃO SÓ AO FECHAR
 * ===================================================================
 *
 * No celular, "fechar o aplicativo" quase nunca acontece — a pessoa troca
 * de aplicativo e o CONECTA fica em segundo plano. Se o fluxo seguisse
 * vivo, o sistema mostraria o CONECTA usando a câmera enquanto ela está no
 * WhatsApp, que é exatamente a queixa que originou este arquivo.
 *
 * Quem estava com a câmera aberta reabre ao voltar, via `assinarRetomada`.
 * Sem isso a pessoa voltaria para uma tela preta.
 */

/** Os fluxos que este aplicativo abriu e ainda não fechou. */
const abertos = new Set<MediaStream>();

/** Quem quer ser avisado para reabrir a câmera quando o app volta. */
const ouvintesDeRetomada: Array<() => void> = [];

let escutandoOSistema = false;

/**
 * Fecha um fluxo e esquece dele.
 *
 * Parar as faixas é o que desliga o aparelho de verdade. Soltar a
 * referência sem parar deixa a luz acesa até o navegador decidir limpar —
 * no celular, isso pode ser nunca.
 */
export const soltarFluxo = (fluxo: MediaStream | null | undefined): void => {
  if (!fluxo) return;
  fluxo.getTracks().forEach((faixa) => faixa.stop());
  abertos.delete(fluxo);
};

/** Fecha tudo que estiver aberto. */
export const soltarTodosOsFluxos = (): void => {
  for (const fluxo of [...abertos]) soltarFluxo(fluxo);
};

/**
 * Avisa quando o aplicativo volta para a frente.
 *
 * Devolve a função de cancelar. Quem assina precisa cancelar ao sair, senão
 * uma tela fechada continua reabrindo a câmera.
 */
export const assinarRetomada = (ouvinte: () => void): (() => void) => {
  ouvintesDeRetomada.push(ouvinte);
  return () => {
    const i = ouvintesDeRetomada.indexOf(ouvinte);
    if (i !== -1) ouvintesDeRetomada.splice(i, 1);
  };
};

const ligarEscutaDoSistema = (): void => {
  if (escutandoOSistema || typeof document === 'undefined') return;
  escutandoOSistema = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') soltarTodosOsFluxos();
    else ouvintesDeRetomada.forEach((avisar) => avisar());
  });

  /**
   * `pagehide` e não `beforeunload`.
   *
   * No celular a aba costuma ser descartada sem nunca disparar
   * `beforeunload` — é o caso mais comum de fluxo que fica para trás.
   */
  window.addEventListener('pagehide', soltarTodosOsFluxos);
};

/** O aparelho sabe capturar? */
export const capturaDisponivel = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Abre câmera ou microfone, deixando o fluxo registrado.
 *
 * Use SEMPRE isto no lugar de `navigator.mediaDevices.getUserMedia`. Há
 * teste conferindo que nenhuma tela chama o navegador direto: o fluxo que
 * não passa por aqui é justamente o que ninguém consegue desligar depois.
 */
export const abrirFluxo = async (
  pedido: MediaStreamConstraints
): Promise<MediaStream | null> => {
  if (!capturaDisponivel()) return null;

  try {
    const fluxo = await navigator.mediaDevices.getUserMedia(pedido);
    abertos.add(fluxo);
    ligarEscutaDoSistema();
    return fluxo;
  } catch {
    // Permissão negada, aparelho ocupado, ou sem câmera. Quem chamou
    // decide o que dizer — aqui só não se mente que abriu.
    return null;
  }
};

/** Quantos fluxos estão abertos agora. Existe para o teste enxergar. */
export const fluxosAbertos = (): number => abertos.size;
