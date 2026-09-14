/**
 * Tratamento de imagens do CONECTA — Malachias Autopeças
 *
 * As fotos ficam guardadas junto das mensagens, no armazenamento do navegador,
 * que é pequeno. Por isso toda imagem é reduzida e recomprimida antes de ser
 * enviada — uma foto de celular de 4 MB vira algo em torno de 200 KB sem
 * prejuízo para quem vai olhar a peça na tela.
 */

/** Extensões que o navegador exibe como foto. */
export const ehArquivoDeImagem = (arquivo: File): boolean =>
  arquivo.type.startsWith('image/');

/** Um data URL de imagem já gravado (usado para o histórico antigo). */
export const ehDataUrlDeImagem = (url?: string): boolean =>
  !!url && url.startsWith('data:image/');

/**
 * Reduz a imagem para caber em `dimensaoMaxima` e devolve em JPEG.
 * Se algo falhar (formato exótico, imagem corrompida), devolve null para o
 * chamador tratar o arquivo como anexo comum em vez de perder o envio.
 */
export const comprimirImagem = (
  arquivo: File,
  dimensaoMaxima = 1280,
  qualidade = 0.82
): Promise<string | null> =>
  new Promise((resolver) => {
    const leitor = new FileReader();

    leitor.onerror = () => resolver(null);
    leitor.onload = () => {
      const origem = typeof leitor.result === 'string' ? leitor.result : null;
      if (!origem) {
        resolver(null);
        return;
      }

      const img = new Image();
      img.onerror = () => resolver(null);
      img.onload = () => {
        try {
          let largura = img.width;
          let altura = img.height;

          if (largura >= altura && largura > dimensaoMaxima) {
            altura = Math.round((altura * dimensaoMaxima) / largura);
            largura = dimensaoMaxima;
          } else if (altura > largura && altura > dimensaoMaxima) {
            largura = Math.round((largura * dimensaoMaxima) / altura);
            altura = dimensaoMaxima;
          }

          const canvas = document.createElement('canvas');
          canvas.width = largura;
          canvas.height = altura;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolver(null);
            return;
          }

          // Fundo branco: JPEG não tem transparência e ficaria preto sem isto
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, largura, altura);
          ctx.drawImage(img, 0, 0, largura, altura);

          resolver(canvas.toDataURL('image/jpeg', qualidade));
        } catch {
          resolver(null);
        }
      };
      img.src = origem;
    };

    leitor.readAsDataURL(arquivo);
  });
