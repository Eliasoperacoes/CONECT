/**
 * O LEITOR DE PDF (pdfjs), carregado só quando alguém precisa dele.
 *
 * Serve à carga de holerites (ler o texto) e ao visor (desenhar a página).
 * É pesado, e a maior parte das pessoas abre o sistema sem nunca ver um PDF.
 * O trabalhador dele aponta para o arquivo que o Vite serve.
 *
 * A VERSÃO "LEGACY", e não a moderna (22/10/2026). A moderna chama
 * `Promise.try` e `Promise.withResolvers` direto — Chrome 128 em diante —, e
 * o aplicativo Android desenha com a WebView do aparelho, que em celular sem
 * atualização fica para trás. No do Marcos o holerite não abria, e sem o
 * documento na tela a barra de assinar não aparece. A legacy é o mesmo
 * leitor com esses recursos embutidos; os testes já usavam ela.
 */
export const carregarLeitorDePdf = async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: trabalhador } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = trabalhador;
  }
  return pdfjs;
};
