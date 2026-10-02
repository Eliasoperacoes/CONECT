/**
 * O LEITOR DE PDF (pdfjs), carregado só quando alguém precisa dele.
 *
 * Serve à carga de holerites (ler o texto) e ao visor (desenhar a página).
 * É pesado, e a maior parte das pessoas abre o sistema sem nunca ver um PDF.
 * O trabalhador dele aponta para o arquivo que o Vite serve.
 */
export const carregarLeitorDePdf = async () => {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: trabalhador } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = trabalhador;
  }
  return pdfjs;
};
