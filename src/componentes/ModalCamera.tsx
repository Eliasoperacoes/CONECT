import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  RotateCcw,
  Send,
  SwitchCamera,
  Image as ImageIcon,
  Check,
  AlertCircle,
} from 'lucide-react';
import { abrirFluxo, soltarFluxo, assinarRetomada } from '../servicos/midia';

interface PropsModalCamera {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmarFoto: (fotoDataUrl: string, legenda?: string) => void;
}

const SUGESTOES_LEGENDA = [
  'Conferência de lote',
  'Peça em estoque',
  'Danificado / Garantia',
  'Código da peça',
];

export const ModalCamera: React.FC<PropsModalCamera> = ({
  aberto,
  aoFechar,
  aoConfirmarFoto,
}) => {
  // O fluxo fica em ref, não em estado: a limpeza do efeito e o `capturarFoto`
  // precisam enxergar o fluxo mais recente para desligar a câmera de verdade.
  const refStream = useRef<MediaStream | null>(null);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  const [legenda, setLegenda] = useState('');
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [cameraTraseira, setCameraTraseira] = useState(true);
  const [disparandoFlash, setDisparandoFlash] = useState(false);

  const refVideo = useRef<HTMLVideoElement>(null);
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const refFileInput = useRef<HTMLInputElement>(null);

  // Iniciar câmera ao abrir modal
  useEffect(() => {
    if (!aberto) {
      encerrarCamera();
      setFotoCapturada(null);
      setLegenda('');
      setErroCamera(null);
      return;
    }

    iniciarCamera();

    return () => {
      encerrarCamera();
    };
  }, [aberto, cameraTraseira]);

  /**
   * Reabre a câmera quando o aplicativo volta para a frente.
   *
   * `midia` desliga tudo ao ir para segundo plano — senão o celular mostra
   * o CONECTA usando a câmera enquanto a pessoa está em outro aplicativo.
   * Sem esta retomada ela voltaria para uma tela preta.
   */
  useEffect(() => {
    if (!aberto) return;
    return assinarRetomada(() => {
      if (!refStream.current && !fotoCapturada) iniciarCamera();
    });
  }, [aberto, fotoCapturada]);

  const encerrarCamera = () => {
    soltarFluxo(refStream.current);
    refStream.current = null;
    if (refVideo.current) {
      refVideo.current.srcObject = null;
    }
  };

  const iniciarCamera = async () => {
    setErroCamera(null);
    encerrarCamera();

    try {
      // Sempre por `midia`: é lá que o fluxo fica registrado para poder ser
      // desligado quando o aplicativo vai para segundo plano
      const stream = await abrirFluxo({
        video: {
          facingMode: cameraTraseira ? { ideal: 'environment' } : 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!stream) throw new Error('Câmera indisponível.');
      refStream.current = stream;

      if (refVideo.current) {
        refVideo.current.srcObject = stream;
        refVideo.current.play().catch(() => {
          // Play interrompido ou autoplay bloqueado
        });
      }
    } catch (err: any) {
      console.warn('Câmera indisponível ou permissão negada:', err);
      setErroCamera(
        'Não foi possível abrir a câmera diretamente. Você pode usar a câmera do celular ou escolher uma foto da galeria.'
      );
    }
  };

  // Disparar o shutter da câmera
  const capturarFoto = () => {
    if (!refVideo.current) return;

    // Efeito visual de flash
    setDisparandoFlash(true);
    setTimeout(() => setDisparandoFlash(false), 200);

    const video = refVideo.current;
    const largura = video.videoWidth || 640;
    const altura = video.videoHeight || 480;

    const canvas = refCanvas.current || document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Se for câmera frontal, espelha para ficar natural
      if (!cameraTraseira) {
        ctx.translate(largura, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, largura, altura);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setFotoCapturada(dataUrl);
      encerrarCamera();
    }
  };

  // Se o usuário carregar foto via input file
  const lidarArquivoSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFotoCapturada(event.target.result as string);
        encerrarCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  const alternarCamera = () => {
    setCameraTraseira((prev) => !prev);
  };

  const descartarFoto = () => {
    setFotoCapturada(null);
    setLegenda('');
    iniciarCamera();
  };

  const enviarFotoFinal = () => {
    if (!fotoCapturada) return;
    aoConfirmarFoto(fotoCapturada, legenda.trim() || undefined);
    aoFechar();
  };

  if (!aberto) return null;

  return (
    <div
      id="modal-camera-container"
      className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-between items-center p-3 sm:p-6 backdrop-blur-sm animate-in fade-in"
    >
      {/* Topo: Fechar e título */}
      <div className="w-full max-w-lg flex items-center justify-between text-white z-20 py-2">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-sm sm:text-base">
            {fotoCapturada ? 'Confirmar Foto' : 'Câmera Malachias'}
          </h2>
        </div>

        <button
          type="button"
          id="botao-fechar-camera"
          onClick={aoFechar}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          aria-label="Fechar câmera"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Meio: Viewfinder da Câmera ou Preview da Foto Capturada */}
      <div className="w-full max-w-lg flex-1 flex flex-col items-center justify-center relative my-auto overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl">
        {/* Flash Effect */}
        {disparandoFlash && (
          <div className="absolute inset-0 bg-white z-30 animate-out fade-out duration-200" />
        )}

        {fotoCapturada ? (
          /* Visualização da Foto Capturada para Envio */
          <div className="relative w-full h-full flex flex-col items-center justify-center p-2 bg-neutral-950">
            <img
              src={fotoCapturada}
              alt="Foto capturada"
              className="max-h-[60vh] max-w-full rounded-xl object-contain border border-white/20 shadow-lg"
            />
          </div>
        ) : erroCamera ? (
          /* Mensagem amigável de Fallback se permissão for bloqueada */
          <div className="p-6 text-center text-white flex flex-col items-center gap-4 max-w-sm">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <AlertCircle className="w-7 h-7" />
            </div>
            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              {erroCamera}
            </p>
            <button
              type="button"
              id="botao-abrir-galeria-fallback"
              onClick={() => refFileInput.current?.click()}
              className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs sm:text-sm flex items-center gap-2 text-white shadow-lg transition-all active:scale-95"
            >
              <Camera className="w-4 h-4" />
              Tirar Foto / Usar Arquivo
            </button>
          </div>
        ) : (
          /* Live Video Stream Viewfinder */
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            <video
              ref={refVideo}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!cameraTraseira ? 'scale-x-[-1]' : ''}`}
            />

            {/* Guias do Viewfinder para enquadrar peças / etiquetas */}
            <div className="absolute inset-8 pointer-events-none border border-white/30 rounded-2xl flex flex-col justify-between p-3">
              <div className="flex justify-between">
                <div className="w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                <div className="w-4 h-4 border-t-2 border-r-2 border-blue-400" />
              </div>
              <div className="text-center">
                <span className="text-[11px] bg-black/60 text-white/90 px-2.5 py-1 rounded-full backdrop-blur-xs font-mono">
                  Enquadre a peça ou código
                </span>
              </div>
              <div className="flex justify-between">
                <div className="w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                <div className="w-4 h-4 border-b-2 border-r-2 border-blue-400" />
              </div>
            </div>
          </div>
        )}

        <canvas ref={refCanvas} className="hidden" />
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={refFileInput}
          onChange={lidarArquivoSelecionado}
          className="hidden"
          id="input-arquivo-camera"
        />
      </div>

      {/* Rodapé: Controles da Câmera ou Formulário de Envio */}
      <div className="w-full max-w-lg z-20 pt-3">
        {fotoCapturada ? (
          /* Rodapé de Confirmação com Legenda */
          <div className="flex flex-col gap-3 bg-neutral-900/90 border border-white/10 p-3.5 rounded-2xl backdrop-blur-md">
            {/* Tags rápidas para facilitar a rotina nas lojas */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {SUGESTOES_LEGENDA.map((sugestao) => (
                <button
                  key={sugestao}
                  type="button"
                  onClick={() => setLegenda(sugestao)}
                  className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap border transition-all ${
                    legenda === sugestao
                      ? 'bg-blue-600 border-blue-400 text-white font-semibold'
                      : 'bg-white/10 border-white/10 text-neutral-300 hover:bg-white/20'
                  }`}
                >
                  {sugestao}
                </button>
              ))}
            </div>

            {/* Input de Legenda */}
            <input
              type="text"
              id="campo-legenda-foto"
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              placeholder="Adicionar observação ou código da peça..."
              className="w-full bg-black/50 border border-white/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-neutral-500 outline-none focus:border-blue-500"
              autoFocus
            />

            {/* Ações: Descartar / Enviar */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="botao-descartar-foto"
                onClick={descartarFoto}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 font-semibold text-xs text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Tirar Outra
              </button>

              <button
                type="button"
                id="botao-enviar-foto-confirmada"
                onClick={enviarFotoFinal}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/30 transition-colors"
              >
                <Send className="w-4 h-4" />
                Enviar Foto
              </button>
            </div>
          </div>
        ) : (
          /* Rodapé de Disparo */
          <div className="flex items-center justify-around py-3">
            {/* Botão Galeria */}
            <button
              type="button"
              id="botao-abrir-galeria"
              onClick={() => refFileInput.current?.click()}
              className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex flex-col items-center justify-center text-white transition-colors"
              title="Escolher da Galeria"
              aria-label="Escolher foto da galeria"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Botão Central de Disparo (Shutter) */}
            <button
              type="button"
              id="botao-disparador-camera"
              onClick={capturarFoto}
              disabled={!!erroCamera}
              className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center p-1 active:scale-90 transition-transform disabled:opacity-40 disabled:pointer-events-none"
              title="Tirar foto"
              aria-label="Tirar foto agora"
            >
              <div className="w-full h-full rounded-full bg-white hover:bg-blue-400 transition-colors" />
            </button>

            {/* Botão Inverter Câmera */}
            <button
              type="button"
              id="botao-inverter-camera"
              onClick={alternarCamera}
              disabled={!!erroCamera}
              className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex flex-col items-center justify-center text-white transition-colors disabled:opacity-40"
              title="Alternar Câmera"
              aria-label="Alternar entre câmera frontal e traseira"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
