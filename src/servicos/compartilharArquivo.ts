/**
 * COMPARTILHAR UM ARQUIVO — o holerite para o WhatsApp, o e-mail, o que o
 * aparelho oferecer.
 *
 * Dois caminhos, porque são dois mundos:
 *
 *   - no APLICATIVO ANDROID a WebView não tem o compartilhar do navegador.
 *     O arquivo é gravado na pasta temporária do app (Filesystem) e
 *     entregue à folha de compartilhar do Android (Share). Os dois plugins
 *     moram no APK: o app instalado antes de 02/10/2026 não os tem, e quem
 *     usa um deles ouve "atualize o aplicativo" em vez de nada acontecer;
 *   - no NAVEGADOR (Chrome do Android, iPhone, Windows), a folha de
 *     compartilhar do próprio navegador. Onde ela não aceita arquivo
 *     (Firefox, por exemplo), o arquivo é baixado.
 */
import { Capacitor } from '@capacitor/core';
import { rodandoNoAplicativo } from './aplicativo';

export type ResultadoDoCompartilhar = 'compartilhado' | 'cancelado' | 'baixado' | 'atualizar_app' | 'falhou';

/** ArrayBuffer em base64, em pedaços — de uma vez estoura a pilha num PDF grande. */
const paraBase64 = (dados: ArrayBuffer): string => {
  const bytes = new Uint8Array(dados);
  let texto = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(texto);
};

const foiCancelado = (erro: unknown): boolean =>
  /cancel|abort/i.test(`${(erro as Error)?.name} ${(erro as Error)?.message}`);

export const compartilharArquivo = async (
  dados: ArrayBuffer,
  nome: string,
  tipo: string,
  titulo: string
): Promise<ResultadoDoCompartilhar> => {
  if (rodandoNoAplicativo()) {
    if (!Capacitor.isPluginAvailable('Share') || !Capacitor.isPluginAvailable('Filesystem')) {
      return 'atualizar_app';
    }
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      // Nome sem caractere que o Android recusa em arquivo
      const nomeSeguro = nome.replace(/[\\/:*?"<>|]+/g, '-');
      const gravado = await Filesystem.writeFile({
        path: nomeSeguro,
        data: paraBase64(dados),
        directory: Directory.Cache,
      });
      await Share.share({ title: titulo, files: [gravado.uri], dialogTitle: titulo });
      return 'compartilhado';
    } catch (erro) {
      if (foiCancelado(erro)) return 'cancelado';
      console.error('Falha ao compartilhar pelo aplicativo:', erro);
      return 'falhou';
    }
  }

  const arquivo = new File([dados], nome, { type: tipo });
  let aceitaArquivo = false;
  try {
    aceitaArquivo = typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
  } catch {
    aceitaArquivo = false;
  }

  if (aceitaArquivo) {
    try {
      await navigator.share({ files: [arquivo], title: titulo });
      return 'compartilhado';
    } catch (erro) {
      if (foiCancelado(erro)) return 'cancelado';
      console.error('Falha ao compartilhar pelo navegador:', erro);
      return 'falhou';
    }
  }

  // Sem compartilhar de arquivo neste navegador: baixa, para mandar de onde a pessoa quiser
  baixarArquivo(dados, nome, tipo);
  return 'baixado';
};

/** Baixa um arquivo montado aqui (no navegador; a WebView do app não baixa). */
export const baixarArquivo = (dados: ArrayBuffer | Uint8Array, nome: string, tipo: string): void => {
  const endereco = URL.createObjectURL(new Blob([dados as BlobPart], { type: tipo }));
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(endereco), 10_000);
};
