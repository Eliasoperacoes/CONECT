/**
 * Serviço de Áudio e Rádio Walkie-Talkie do CONECTA
 * Gerencia Web Audio, bipes do rádio, captura de microfone,
 * detecção de ondas sonoras e gravação de recados de voz.
 */

class GerenciadorAudioRadio {
  private contextoAudio: AudioContext | null = null;
  private fluxoMicrofone: MediaStream | null = null;
  private analisador: AnalyserNode | null = null;
  private gravadorMidia: MediaRecorder | null = null;
  private pedacosAudio: Blob[] = [];
  private canalTransmissao: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.canalTransmissao = new BroadcastChannel('conecta_radio_malachias');
    }
  }

  // Inicializa o AudioContext sob demanda
  private obterContextoAudio(): AudioContext {
    if (!this.contextoAudio) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.contextoAudio = new AudioCtx();
    }
    if (this.contextoAudio.state === 'suspended') {
      this.contextoAudio.resume();
    }
    return this.contextoAudio;
  }

  // Toca o bipe característico de abertura de transmissão do rádio (Walkie-Talkie chirp)
  tocarBipeInicio(): void {
    try {
      const ctx = this.obterContextoAudio();
      const agora = ctx.currentTime;

      // Primeiro tom rápido
      const osc1 = ctx.createOscillator();
      const ganho1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, agora);
      osc1.frequency.exponentialRampToValueAtTime(1320, agora + 0.04);
      ganho1.gain.setValueAtTime(0.18, agora);
      ganho1.gain.linearRampToValueAtTime(0.01, agora + 0.06);

      osc1.connect(ganho1);
      ganho1.connect(ctx.destination);
      osc1.start(agora);
      osc1.stop(agora + 0.06);

      // Segundo tom rápido (frequência de transmissão)
      const osc2 = ctx.createOscillator();
      const ganho2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, agora + 0.06);
      ganho2.gain.setValueAtTime(0.2, agora + 0.06);
      ganho2.gain.linearRampToValueAtTime(0.001, agora + 0.12);

      osc2.connect(ganho2);
      ganho2.connect(ctx.destination);
      osc2.start(agora + 0.06);
      osc2.stop(agora + 0.12);
    } catch {
      // Ignorar caso políticas de áudio restrinjam
    }
  }

  // Toca o bipe de finalização de transmissão ("roger beep" clássico)
  tocarBipeFim(): void {
    try {
      const ctx = this.obterContextoAudio();
      const agora = ctx.currentTime;

      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1175, agora);
      ganho.gain.setValueAtTime(0.15, agora);
      ganho.gain.linearRampToValueAtTime(0.001, agora + 0.08);

      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.start(agora);
      osc.stop(agora + 0.08);
    } catch {
      // Ignora erro
    }
  }

  // Prepara o microfone previamente quando a conversa é aberta (Meta: conexão em < 1 segundo)
  async prepararMicrofone(): Promise<boolean> {
    try {
      if (this.fluxoMicrofone && this.fluxoMicrofone.active) {
        return true;
      }
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        this.fluxoMicrofone = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Inicia a captura e monitoramento da onda sonora
  async iniciarCapturaVoz(aoObterVolume: (volume: number) => void): Promise<boolean> {
    try {
      const pronto = await this.prepararMicrofone();
      if (!pronto || !this.fluxoMicrofone) return false;

      const ctx = this.obterContextoAudio();
      const fonte = ctx.createMediaStreamSource(this.fluxoMicrofone);
      this.analisador = ctx.createAnalyser();
      this.analisador.fftSize = 64;
      fonte.connect(this.analisador);

      const dadosFrequencia = new Uint8Array(this.analisador.frequencyBinCount);
      let ativo = true;

      const loopAnimacao = () => {
        if (!ativo || !this.analisador) return;
        this.analisador.getByteFrequencyData(dadosFrequencia);
        let soma = 0;
        for (let i = 0; i < dadosFrequencia.length; i++) {
          soma += dadosFrequencia[i];
        }
        const media = soma / dadosFrequencia.length;
        aoObterVolume(Math.min(100, Math.round((media / 128) * 100)));
        requestAnimationFrame(loopAnimacao);
      };
      requestAnimationFrame(loopAnimacao);

      // Inicia também a gravação em memória caso a chamada vire recado
      this.iniciarGravador();

      return true;
    } catch {
      return false;
    }
  }

  // Negocia o melhor formato suportado pelo dispositivo
  // audio/webm;codecs=opus -> audio/ogg;codecs=opus -> audio/mp4
  private obterMelhorTipoMime(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    const formatos = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
    for (const formato of formatos) {
      if (MediaRecorder.isTypeSupported(formato)) {
        return formato;
      }
    }
    return '';
  }

  // Inicia a gravação em paralelo para caso precise virar recado automático
  private iniciarGravador(): void {
    if (!this.fluxoMicrofone) return;
    this.pedacosAudio = [];

    const tipoMime = this.obterMelhorTipoMime();
    try {
      const opcoes = tipoMime ? { mimeType: tipoMime } : undefined;
      this.gravadorMidia = new MediaRecorder(this.fluxoMicrofone, opcoes);

      this.gravadorMidia.ondataavailable = (evento) => {
        if (evento.data && evento.data.size > 0) {
          this.pedacosAudio.push(evento.data);
        }
      };

      this.gravadorMidia.start(100);
    } catch {
      this.gravadorMidia = null;
    }
  }

  // Para a transmissão e finaliza gravação se houver
  async pararCapturaVoz(): Promise<{ blob: Blob | null; tipoMime: string } | null> {
    return new Promise((resolver) => {
      this.analisador = null;

      if (this.gravadorMidia && this.gravadorMidia.state !== 'inactive') {
        this.gravadorMidia.onstop = () => {
          const tipoMimeFinal = this.gravadorMidia?.mimeType || 'audio/webm';
          const blobFinal = this.pedacosAudio.length > 0 ? new Blob(this.pedacosAudio, { type: tipoMimeFinal }) : null;
          resolver({ blob: blobFinal, tipoMime: tipoMimeFinal });
        };
        this.gravadorMidia.stop();
      } else {
        resolver(null);
      }
    });
  }

  // Envia evento de rádio para outras abas / instâncias
  enviarSinalRadio(evento: {
    tipo: 'iniciar_transmissao' | 'finalizar_transmissao';
    deId: string;
    paraId?: string;
    grupoId?: string;
    conversaId: string;
    nomeFalante: string;
    fotoFalante: string;
  }): void {
    if (this.canalTransmissao) {
      try {
        this.canalTransmissao.postMessage(evento);
      } catch {
        // Ignora erro
      }
    }
  }

  // Assina eventos de rádio ao vivo
  assinarSinaisRadio(
    aoReceber: (evento: {
      tipo: 'iniciar_transmissao' | 'finalizar_transmissao';
      deId: string;
      paraId?: string;
      grupoId?: string;
      conversaId: string;
      nomeFalante: string;
      fotoFalante: string;
    }) => void
  ): () => void {
    if (!this.canalTransmissao) return () => {};

    const manipulador = (msg: MessageEvent) => {
      if (msg.data && (msg.data.tipo === 'iniciar_transmissao' || msg.data.tipo === 'finalizar_transmissao')) {
        aoReceber(msg.data);
      }
    };

    this.canalTransmissao.addEventListener('message', manipulador);
    return () => {
      this.canalTransmissao?.removeEventListener('message', manipulador);
    };
  }
}

export const servicoAudioRadio = new GerenciadorAudioRadio();
