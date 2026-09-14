import React from 'react';
import { X, Download, ZoomIn } from 'lucide-react';

interface PropsModalVisualizadorImagem {
  imagemUrl: string | null;
  legenda?: string;
  aoFechar: () => void;
}

export const ModalVisualizadorImagem: React.FC<PropsModalVisualizadorImagem> = ({
  imagemUrl,
  legenda,
  aoFechar,
}) => {
  if (!imagemUrl) return null;

  const lidarDownload = () => {
    const link = document.createElement('a');
    link.href = imagemUrl;
    link.download = `malachias-foto-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      id="modal-visualizador-imagem"
      className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-3 sm:p-6 backdrop-blur-md animate-in fade-in"
      onClick={aoFechar}
    >
      {/* Topo com Ações */}
      <div
        className="w-full flex items-center justify-between text-white z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <ZoomIn className="w-5 h-5 text-blue-400" />
          <span className="text-xs sm:text-sm font-semibold text-neutral-200">
            Foto de Peça / Malachias
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            id="botao-download-foto-visualizador"
            onClick={lidarDownload}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="Baixar imagem"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            id="botao-fechar-visualizador"
            onClick={aoFechar}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Centro: Imagem em Alta Resolução */}
      <div
        className="flex-1 flex items-center justify-center p-2 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imagemUrl}
          alt={legenda || 'Foto ampliada'}
          className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl border border-white/10"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Rodapé com Legenda */}
      {legenda && (
        <div
          className="w-full max-w-xl mx-auto text-center bg-black/60 border border-white/10 p-3 rounded-xl backdrop-blur-xs text-white text-xs sm:text-sm z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {legenda}
        </div>
      )}
    </div>
  );
};
