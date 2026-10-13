/**
 * ARRASTAR ARQUIVO DO COMPUTADOR PARA DENTRO DO SISTEMA (13/10/2026).
 *
 * Sem tratamento, o navegador ABRE o arquivo solto, em outra aba ou no
 * lugar do CONECTA — e quem arrastou uma foto para a conversa perde a
 * tela em que estava. Duas peças:
 *
 *   - a conversa recebe o que é solto nela e manda pelo mesmo caminho do
 *     clipe de anexo (TelaConversa);
 *   - fora de quem recebe, soltar não faz nada, em vez de abrir o arquivo.
 */

/** O arraste traz arquivos do computador (e não um texto ou um elemento da página) */
export const trazArquivos = (dados: DataTransfer | null | undefined): boolean =>
  !!dados && Array.from(dados.types || []).includes('Files');

/** Quantos arquivos uma soltada manda de uma vez; acima disso, pede para dividir */
export const MAXIMO_DE_ARQUIVOS_POR_VEZ = 10;

/**
 * Soltar arquivo onde ninguém recebe não abre o arquivo no navegador.
 *
 * Ouve na janela, depois de todo mundo: quem recebe arquivo (a conversa, a
 * carga de holerites, a planilha) já tratou o evento antes, e o
 * `defaultPrevented` deixa o dele em paz.
 */
export function impedirQueArquivoSoltoAbra(janela: Pick<Window, 'addEventListener'> = window): void {
  const aoArrastar = (evento: DragEvent) => {
    if (!trazArquivos(evento.dataTransfer) || evento.defaultPrevented) return;
    evento.preventDefault();
    // O cursor mostra que ali não se solta
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'none';
  };
  const aoSoltar = (evento: DragEvent) => {
    if (!trazArquivos(evento.dataTransfer)) return;
    evento.preventDefault();
  };
  janela.addEventListener('dragover', aoArrastar as EventListener);
  janela.addEventListener('drop', aoSoltar as EventListener);
}
