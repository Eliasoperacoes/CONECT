/**
 * O CARTAZ DE PONTO DA LOJA, como vai para a impressora.
 *
 * O QR grande bate o ponto. No rodapé, pequeno e separado por um fio, um
 * segundo QR abre o tutorial de instalação do app (/instalar.html) — quem
 * ainda bate pelo navegador está justamente na frente do cartaz. Ele é
 * pequeno de propósito: o QR da batida continua sendo o que a câmera acha
 * primeiro, e o cartaz não vira um panfleto.
 */
import type { Loja } from '../tipos';

/** O tutorial de instalação, no mesmo endereço de onde o cartaz foi gerado */
export const enderecoDoInstalar = (origem: string): string => `${origem}/instalar.html`;

/**
 * O leitor de batida esbarrou no QR do rodapé? Com o cartaz inteiro no
 * quadro, é ele que a leitura acha primeiro. Não é código de ponto: o
 * leitor o ignora, pede o QR grande e segue lendo.
 */
export const ehQrDoInstalar = (texto: string): boolean => /\/instalar\.html(?:[?#]|$)/.test(texto.trim());

export const AVISO_QR_DO_INSTALAR = 'Esse é o QR de instalar o app. Aponte para o QR grande, acima dele.';

export interface DadosDoCartaz {
  loja: Loja;
  codigo: string;
  /** data: URL do QR da batida */
  qrDoPonto: string;
  /** data: URL do QR do tutorial; sem ele o cartaz sai só com o ponto */
  qrDoInstalar?: string | null;
}

export function montarCartazDoPonto({ loja, codigo, qrDoPonto, qrDoInstalar }: DadosDoCartaz): string {
  const rodape = qrDoInstalar
    ? `<div style="margin:36px auto 0;padding-top:20px;border-top:1px solid #D1D5DB;max-width:420px;` +
      `display:flex;align-items:center;gap:16px;text-align:left">` +
      `<img src="${qrDoInstalar}" alt="Instalar o app" style="width:96px;height:96px;flex:0 0 auto" />` +
      `<p style="margin:0;font-size:13px;line-height:1.45;color:#4B5563">` +
      `<strong style="color:#111827">Ainda não tem o app?</strong><br>` +
      `Aponte a câmera aqui para instalar o CONECTA no Android.</p>` +
      `</div>`
    : '';

  return (
    `<title>Ponto ${loja}</title>` +
    `<div style="font-family:system-ui,sans-serif;text-align:center;padding:40px">` +
    `<h1 style="margin:0 0 4px">CONECTA · Registro de Ponto</h1>` +
    `<h2 style="margin:0 0 24px;font-weight:500">Loja ${loja}</h2>` +
    `<img src="${qrDoPonto}" alt="QR do ponto" style="width:340px;height:340px" />` +
    `<p style="margin:24px 0 4px;font-size:14px">Sem câmera? Digite o código:</p>` +
    `<p style="font-family:monospace;font-size:44px;letter-spacing:10px;margin:0;font-weight:700">${codigo}</p>` +
    rodape +
    `</div>`
  );
}
