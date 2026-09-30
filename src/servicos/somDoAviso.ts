/**
 * O SOM DO CONECTA — uma receita, dois lugares.
 *
 * Pedido do Elias: "o som deve ser algo sofisticado, tanto para o celular
 * quanto para o computador". O de antes eram dois bipes de onda pura, o
 * som de um aparelho de teste.
 *
 * Agora são dois sinos suaves, subindo uma quarta (Si → Mi): cada nota com
 * o som principal e dois harmônicos fracos, ataque macio, e um decaimento
 * que se apaga sozinho, com um eco curto que dá espaço ao som. Reconhecível
 * no meio do barulho da loja, sem sobressaltar quem atende ao lado.
 *
 * A MESMA RECEITA SERVE AOS DOIS:
 *   - o navegador toca as amostras geradas aqui (`notificacoes.ts`);
 *   - `scripts/gerar-som-do-aviso.ts` grava estas mesmas amostras num WAV,
 *     que é o som do canal de avisos do aplicativo Android.
 * Mudou aqui, rode o script, SUBA O NÚMERO DO CANAL (ServicoDeAvisos.CANAL:
 * o Android não troca o som de um canal que já existe) e gere o APK.
 */

/**
 * As duas notas: Ré5 subindo para Sol5, uma quarta.
 *
 * A primeira versão usava Si5 e Mi6 — o Elias achou "estourado". O
 * agudo era parte do problema: quanto mais alta a nota, mais ela fura o
 * ouvido. Uma oitava abaixo o toque fica quente, como uma campainha de
 * madeira, e continua claro o bastante para se ouvir na loja.
 */
export const NOTAS_DO_AVISO = [
  { inicio: 0, frequencia: 587.33, volume: 1 },
  { inicio: 0.16, frequencia: 783.99, volume: 0.9 },
] as const;

/**
 * O timbre: quase só a nota pura, com uma oitava e um brilho de marimba
 * bem baixos. Os harmônicos fortes da primeira versão davam o som de
 * metal; aqui eles só arredondam.
 */
const PARCIAIS = [
  { multiplo: 1, volume: 1 },
  { multiplo: 2, volume: 0.07 },
  { multiplo: 4, volume: 0.015 },
] as const;

/** Subida em 18 ms: a nota "abre" em vez de estalar. */
const ATAQUE = 0.018;
/** A cauda cai devagar: é o que faz soar harmonioso, e não como um bipe. */
const DECAIMENTO = 0.42;
/** Um eco curto e baixo, só para dar espaço. */
const ECO = { atraso: 0.19, volume: 0.14 };
/**
 * Volume geral: o pico fica em ~40% da escala, onde as duas notas se
 * somam. A primeira versão ia a 53%, aguda e com harmônicos fortes, e
 * soava estourada; nota grave soa mais baixa ao ouvido que aguda do mesmo
 * pico. O celular ainda aplica o volume de notificação dele por cima.
 */
const VOLUME_GERAL = 0.25;

/** Quanto dura o som inteiro, com o fim da cauda e do eco. */
export const DURACAO_DO_AVISO = 1.8;

const envelope = (t: number): number => {
  if (t < 0) return 0;
  if (t < ATAQUE) return t / ATAQUE;
  return Math.exp(-(t - ATAQUE) / DECAIMENTO);
};

const semEco = (t: number): number => {
  let soma = 0;
  for (const nota of NOTAS_DO_AVISO) {
    const tNota = t - nota.inicio;
    const env = envelope(tNota);
    if (env === 0) continue;
    for (const p of PARCIAIS) {
      soma += nota.volume * p.volume * env * Math.sin(2 * Math.PI * nota.frequencia * p.multiplo * tNota);
    }
  }
  return soma;
};

/** O valor do som no instante `t` (segundos), entre −1 e 1. */
export const amostraDoAviso = (t: number): number =>
  VOLUME_GERAL * (semEco(t) + ECO.volume * semEco(t - ECO.atraso));

/**
 * O som inteiro, amostra por amostra, na taxa pedida. O fim desce a zero
 * nos últimos 30 ms para não terminar num estalo.
 */
export const gerarAmostrasDoAviso = (taxa: number): Float32Array => {
  const total = Math.round(DURACAO_DO_AVISO * taxa);
  const amostras = new Float32Array(total);
  const fimSuave = Math.round(0.03 * taxa);
  for (let i = 0; i < total; i++) {
    let v = amostraDoAviso(i / taxa);
    const restantes = total - i;
    if (restantes < fimSuave) v *= restantes / fimSuave;
    amostras[i] = Math.max(-1, Math.min(1, v));
  }
  return amostras;
};

/** O mesmo som como arquivo WAV (16 bits, mono) — para o Android. */
export const gerarWavDoAviso = (taxa = 44100): Uint8Array => {
  const amostras = gerarAmostrasDoAviso(taxa);
  const dados = amostras.length * 2;
  const buffer = new ArrayBuffer(44 + dados);
  const v = new DataView(buffer);
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));

  texto(0, 'RIFF');
  v.setUint32(4, 36 + dados, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, dados, true);
  amostras.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(s * 32767), true));

  return new Uint8Array(buffer);
};
