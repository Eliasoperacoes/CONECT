/**
 * Gravador de voz do chat — CONECTA / Malachias Autopeças
 *
 * O QUE ELE É, e o que ele não é.
 *
 * Grava o microfone e devolve o áudio. Só isso. Não transmite, não conversa
 * com ninguém, não abre canal — é uma mensagem como qualquer outra, que por
 * acaso é falada.
 *
 * Substitui a gravação que morava dentro do Rádio. Lá o recado de voz era
 * um EFEITO COLATERAL: a pessoa abria a transmissão ao vivo, falava, e se
 * ninguém estivesse ouvindo o sistema salvava o que ela disse como recado.
 * Funcionava, mas obrigava quem só queria mandar um áudio a passar por uma
 * chamada ao vivo — e a entender a diferença entre as duas coisas.
 *
 * O formato é NEGOCIADO com o aparelho: iPhone não grava webm, Android não
 * grava mp4 em toda versão. Fixar um formato faz a gravação falhar em
 * silêncio na metade da rede.
 */

/** O que sai de uma gravação. */
export interface AudioGravado {
  blob: Blob;
  /** Segundos completos, no mínimo 1: "0s" não existe para quem ouve. */
  duracaoSegundos: number;
}

/**
 * O melhor formato que ESTE aparelho grava.
 *
 * A ordem não é gosto: opus é o menor para voz, e o mp4 fica por último
 * porque é o que o iPhone aceita quando não aceita mais nada.
 */
const melhorFormato = (): string => {
  if (typeof MediaRecorder === 'undefined') return '';

  const formatos = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];

  for (const formato of formatos) {
    if (MediaRecorder.isTypeSupported(formato)) return formato;
  }
  return '';
};

export const gravacaoDisponivel = (): boolean =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined';

class GravadorDeVoz {
  private gravador: MediaRecorder | null = null;
  private fluxo: MediaStream | null = null;
  private pedacos: Blob[] = [];
  private comecouEm = 0;

  estaGravando(): boolean {
    return this.gravador?.state === 'recording';
  }

  /**
   * Abre o microfone e começa a gravar.
   *
   * Devolve false quando a pessoa nega a permissão ou o aparelho não grava.
   * Quem chama precisa dizer isso na tela — um botão que não faz nada é
   * pior do que um botão que explica por que não fez.
   */
  async iniciar(): Promise<boolean> {
    if (!gravacaoDisponivel()) return false;
    if (this.estaGravando()) return true;

    try {
      this.fluxo = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      // Permissão negada, ou microfone em uso por outro programa
      return false;
    }

    const tipo = melhorFormato();
    this.pedacos = [];

    try {
      this.gravador = new MediaRecorder(this.fluxo, tipo ? { mimeType: tipo } : undefined);
    } catch {
      this.soltarMicrofone();
      return false;
    }

    this.gravador.ondataavailable = (evento) => {
      if (evento.data.size > 0) this.pedacos.push(evento.data);
    };

    this.comecouEm = Date.now();
    this.gravador.start();
    return true;
  }

  /**
   * Fecha a gravação e devolve o áudio.
   *
   * Espera o `onstop` de propósito: parar o gravador não entrega os últimos
   * pedaços na hora, e ler os dados antes disso corta o fim da frase.
   */
  async parar(): Promise<AudioGravado | null> {
    const gravador = this.gravador;
    if (!gravador || gravador.state === 'inactive') {
      this.soltarMicrofone();
      return null;
    }

    const duracaoSegundos = Math.max(
      1,
      Math.round((Date.now() - this.comecouEm) / 1000)
    );

    const blob = await new Promise<Blob>((pronto) => {
      gravador.onstop = () => {
        pronto(new Blob(this.pedacos, { type: gravador.mimeType || 'audio/webm' }));
      };
      gravador.stop();
    });

    this.soltarMicrofone();
    return blob.size > 0 ? { blob, duracaoSegundos } : null;
  }

  /**
   * Desiste: para de gravar e JOGA FORA o que foi gravado.
   *
   * Existe separado de `parar` porque desistir não pode devolver áudio
   * nenhum. Um cancelamento que devolve o blob vira mensagem enviada por
   * engano na primeira distração de quem chama.
   */
  cancelar(): void {
    if (this.gravador && this.gravador.state !== 'inactive') {
      this.gravador.onstop = null;
      this.gravador.stop();
    }
    this.pedacos = [];
    this.soltarMicrofone();
  }

  /**
   * Fecha o microfone.
   *
   * Sem isto a luz do microfone fica acesa depois da gravação, e o navegador
   * mantém o aparelho ocupado — no celular isso aparece como o sistema
   * "gravando" o tempo todo, e é o tipo de coisa que faz a pessoa
   * desinstalar.
   */
  private soltarMicrofone(): void {
    this.fluxo?.getTracks().forEach((faixa) => faixa.stop());
    this.fluxo = null;
    this.gravador = null;
  }
}

export const gravadorVoz = new GravadorDeVoz();
