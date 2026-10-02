/**
 * ONDE UM DOCUMENTO GERADO ABRE — o espelho, a escala, as férias, o cartaz.
 *
 * Todas as telas faziam `window.open('', '_blank')` e escreviam o
 * documento dentro. No computador isso abre uma aba. No APLICATIVO
 * ANDROID não abre nada: a WebView não tem janelas, `window.open` devolve
 * a própria página, e o documento era escrito POR CIMA DO SISTEMA. O Elias
 * abriu o espelho no celular (01/10/2026): o app sumiu, o espelho ficou
 * no lugar com largura de computador, e não havia como voltar nem baixar.
 *
 * Agora a decisão é uma só, aqui:
 *
 *   - no computador, a janela nova de sempre (com impressão, se pedida);
 *   - no aplicativo e em tela de celular, o VISOR — uma tela por cima,
 *     com Voltar, que o botão voltar do Android também fecha
 *     (`VisorDeDocumento.tsx`, montado uma vez em App).
 */
import type { ReactNode } from 'react';
import { rodandoNoAplicativo } from './aplicativo';

/** Um documento gerado aqui (`html`) ou um PDF guardado no banco (`pdf`, o endereço dele). */
export type DocumentoNoVisor =
  | { html: string; titulo: string }
  | { pdf: string; titulo: string; arquivoNome: string; rodape?: RodapeDoPdf };

/**
 * O que vai no pé do visor de PDF, montado com o arquivo que está na tela
 * — a barra de assinar o holerite assina ESTE arquivo, e não outro.
 */
export type RodapeDoPdf = (dados: ArrayBuffer) => ReactNode;

let aberto: DocumentoNoVisor | null = null;
const ouvintes: Array<() => void> = [];
const avisar = () => ouvintes.forEach((o) => o());

export const assinarVisor = (ouvinte: () => void): (() => void) => {
  ouvintes.push(ouvinte);
  return () => {
    const i = ouvintes.indexOf(ouvinte);
    if (i !== -1) ouvintes.splice(i, 1);
  };
};

export const documentoNoVisor = (): DocumentoNoVisor | null => aberto;

export const fecharVisor = (): void => {
  aberto = null;
  avisar();
};

/**
 * Mostra no visor, e não em janela? No aplicativo, sempre — lá não há
 * janela. No navegador do celular também: a aba nova do iPhone instalado
 * na tela de início abre fora do app, e o documento sai com a largura de
 * computador de qualquer jeito.
 */
export const usaVisor = (): boolean => {
  if (rodandoNoAplicativo()) return true;
  try {
    return window.matchMedia('(max-width: 767px)').matches;
  } catch {
    return false;
  }
};

/** O título do documento, tirado do `<title>` dele. */
const tituloDe = (html: string): string =>
  html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || 'Documento';

/**
 * Abre o documento onde ele cabe. Devolve `false` só quando o navegador
 * bloqueou a janela nova (computador, com pop-up bloqueado).
 *
 * @param opcoes.imprimir No computador, chama a impressão ao abrir — é o
 * que os botões "Imprimir" sempre fizeram. No visor, quem decide é a
 * pessoa, pelo botão dele.
 */
export const mostrarDocumento = (html: string, opcoes: { imprimir?: boolean } = {}): boolean => {
  if (usaVisor()) {
    aberto = { html, titulo: tituloDe(html) };
    avisar();
    return true;
  }
  const janela = window.open('', '_blank');
  if (!janela) return false;
  janela.document.write(html);
  janela.document.close();
  janela.focus();
  // Espera o layout fechar antes de chamar a impressão
  if (opcoes.imprimir) setTimeout(() => janela.print(), 250);
  return true;
};

/**
 * UM PDF NO VISOR — o holerite, em qualquer aparelho.
 *
 * Antes o holerite abria o arquivo: no computador, uma aba com o leitor do
 * navegador; no aplicativo, o navegador do celular por fora, baixando.
 * Agora ele é desenhado dentro do sistema, como o espelho no celular — e é
 * aqui, com o documento à frente, que a assinatura digital vai entrar.
 */
export const mostrarPdf = (url: string, titulo: string, arquivoNome: string, rodape?: RodapeDoPdf): void => {
  aberto = { pdf: url, titulo, arquivoNome, rodape };
  avisar();
};

/**
 * Abre o documento e manda imprimir — no computador, numa janela à parte;
 * no celular, no visor. Morava em `documento.ts`, que é folha (o serviço
 * de ponto o importa) e não pode puxar o aplicativo junto.
 */
export const imprimirDocumento = (html: string): boolean => mostrarDocumento(html, { imprimir: true });
