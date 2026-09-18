import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Image as ImageIcon,
  RotateCcw,
  Check,
  X,
  Link as LinkIcon,
  Sparkles,
} from 'lucide-react';
import { Colaborador } from '../tipos';
import { bancoDados, FOTO_PADRAO_LOGO_EMPRESA } from '../servicos/bancoDados';

interface PropsModalAlterarFoto {
  aberto: boolean;
  colaborador: Colaborador;
  aoFechar: () => void;
  aoFotoSalva?: (novaFoto: string) => void;
}

export const ModalAlterarFoto: React.FC<PropsModalAlterarFoto> = ({
  aberto,
  colaborador,
  aoFechar,
  aoFotoSalva,
}) => {
  const [fotoPrevia, setFotoPrevia] = useState<string>(
    colaborador.foto || FOTO_PADRAO_LOGO_EMPRESA
  );
  const [modoUrl, setModoUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [estaProcessando, setEstaProcessando] = useState(false);
  const [mensagemStatus, setMensagemStatus] = useState<string | null>(null);

  const refInputArquivo = useRef<HTMLInputElement>(null);
  const refInputCamera = useRef<HTMLInputElement>(null);

  if (!aberto) return null;

  // Otimiza a imagem via Canvas para ~400x400 (evita estourar o localStorage)
  const otimizarImagem = (arquivo: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = (e) => {
        const resultado = e.target?.result as string;
        if (!resultado) {
          reject(new Error('Falha ao ler arquivo de imagem.'));
          return;
        }

        // Se for SVG, mantém direto
        if (arquivo.type === 'image/svg+xml') {
          resolve(resultado);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const maxDim = 400;
          let largura = img.width;
          let altura = img.height;

          if (largura > altura) {
            if (largura > maxDim) {
              altura = Math.round((altura * maxDim) / largura);
              largura = maxDim;
            }
          } else {
            if (altura > maxDim) {
              largura = Math.round((largura * maxDim) / altura);
              altura = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = largura;
          canvas.height = altura;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(resultado);
            return;
          }

          ctx.drawImage(img, 0, 0, largura, altura);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Imagem inválida.'));
        img.src = resultado;
      };
      leitor.onerror = () => reject(new Error('Erro na leitura do arquivo.'));
      leitor.readAsDataURL(arquivo);
    });
  };

  const lidarUploadArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    try {
      setEstaProcessando(true);
      const dataUrl = await otimizarImagem(arquivo);
      setFotoPrevia(dataUrl);
      setMensagemStatus('Foto carregada! Clique em "Salvar Foto" para confirmar.');
    } catch (err) {
      console.error(err);
      setMensagemStatus('Não foi possível carregar a foto selecionada.');
    } finally {
      setEstaProcessando(false);
    }
  };

  const aplicarLogoPadrao = () => {
    setFotoPrevia(FOTO_PADRAO_LOGO_EMPRESA);
    setMensagemStatus('Logo da Malachias selecionada como foto padrão.');
  };

  const aplicarUrl = () => {
    if (!urlInput.trim()) return;
    setFotoPrevia(urlInput.trim());
    setUrlInput('');
    setModoUrl(false);
    setMensagemStatus('URL aplicada na prévia. Clique em "Salvar Foto" para confirmar.');
  };

  const salvarNovaFoto = async () => {
    const res = await bancoDados.atualizarColaborador(colaborador.id, {
      foto: fotoPrevia.trim() || FOTO_PADRAO_LOGO_EMPRESA,
    });

    if (res.sucesso) {
      if (aoFotoSalva) {
        aoFotoSalva(fotoPrevia);
      }
      aoFechar();
    } else {
      setMensagemStatus(res.erro || 'Falha ao salvar nova foto.');
    }
  };

  const ehLogoPadrao = fotoPrevia === FOTO_PADRAO_LOGO_EMPRESA;

  return (
    <div
      id="modal-alterar-foto-usuario"
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4 backdrop-blur-xs"
    >
      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in duration-200">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-[var(--c-borda)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--c-texto)]">
                Alterar Foto de Perfil
              </h3>
              <p className="text-[11px] text-[var(--c-texto-3)]">
                {colaborador.nome} ({colaborador.cargo})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-canvas)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-6 flex flex-col items-center">
          {/* Prévia Circular do Avatar */}
          <div className="relative group">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-white border-4 border-blue-500/30 shadow-md flex items-center justify-center">
              <img
                src={fotoPrevia}
                alt="Prévia da foto"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            {ehLogoPadrao && (
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full shadow-sm">
                Logo Malachias
              </span>
            )}
          </div>

          {mensagemStatus && (
            <div className="w-full p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 text-center font-medium">
              {mensagemStatus}
            </div>
          )}

          {/* Opções de Alteração de Foto */}
          <div className="w-full space-y-2.5">
            {/* Opção 1: Usar Logo da Malachias (Padrão) */}
            <button
              type="button"
              id="botao-usar-logo-malachias"
              onClick={aplicarLogoPadrao}
              className={`w-full py-2.5 px-4 rounded-xl border flex items-center justify-between transition-all text-xs font-bold ${
                ehLogoPadrao
                  ? 'bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                  : 'bg-[var(--c-canvas)] border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-0.5">
                  <img src={FOTO_PADRAO_LOGO_EMPRESA} alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div className="text-left">
                  <span>Usar Logo da Malachias</span>
                  <span className="block text-[10px] font-normal text-[var(--c-texto-3)]">
                    Padrão oficial da rede para colaboradores
                  </span>
                </div>
              </div>
              {ehLogoPadrao && <Check className="w-4 h-4 text-blue-600" />}
            </button>

            {/* Opção 2: Carregar do Computador / Galeria */}
            <button
              type="button"
              id="botao-carregar-foto-arquivo"
              disabled={estaProcessando}
              onClick={() => refInputArquivo.current?.click()}
              className="w-full py-2.5 px-4 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] hover:bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-xs font-bold flex items-center gap-2.5 transition-all text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <span>Carregar Foto do Aparelho</span>
                <span className="block text-[10px] font-normal text-[var(--c-texto-3)]">
                  Selecione arquivo do computador ou celular (PNG, JPG)
                </span>
              </div>
            </button>
            <input
              type="file"
              ref={refInputArquivo}
              onChange={lidarUploadArquivo}
              accept="image/*"
              className="hidden"
            />

            {/* Opção 3: Tirar Foto com Câmera */}
            <button
              type="button"
              id="botao-tirar-foto-camera"
              disabled={estaProcessando}
              onClick={() => refInputCamera.current?.click()}
              className="w-full py-2.5 px-4 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] hover:bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-xs font-bold flex items-center gap-2.5 transition-all text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <span>Tirar Foto com a Câmera</span>
                <span className="block text-[10px] font-normal text-[var(--c-texto-3)]">
                  Abra a câmera do dispositivo agora
                </span>
              </div>
            </button>
            <input
              type="file"
              ref={refInputCamera}
              onChange={lidarUploadArquivo}
              accept="image/*"
              capture="user"
              className="hidden"
            />

            {/* Opção 4: Inserir URL Web */}
            {!modoUrl ? (
              <button
                type="button"
                onClick={() => setModoUrl(true)}
                className="w-full py-2 px-3 text-[11px] font-medium text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:underline flex items-center justify-center gap-1.5"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Inserir link/URL de imagem na web</span>
              </button>
            ) : (
              <div className="p-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] space-y-2">
                <label className="block text-[11px] font-bold text-[var(--c-texto-2)]">
                  URL da Imagem:
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://exemplo.com/foto.jpg"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                  />
                  <button
                    type="button"
                    onClick={aplicarUrl}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 border-t border-[var(--c-borda)] bg-[var(--c-superficie-2)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="py-2 px-4 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            id="botao-salvar-nova-foto"
            disabled={estaProcessando}
            onClick={salvarNovaFoto}
            className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Salvar Foto</span>
          </button>
        </div>
      </div>
    </div>
  );
};
