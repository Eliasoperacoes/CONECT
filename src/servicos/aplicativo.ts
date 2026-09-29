/**
 * ESTAMOS DENTRO DO APLICATIVO? — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * POR QUE ISTO PRECISA SER UMA PERGUNTA SÓ
 * ===================================================================
 *
 * O mesmo código roda em três lugares, e eles se comportam diferente:
 *
 *   APLICATIVO Android   casca nativa, aviso pelo Firebase
 *   NAVEGADOR (balcão)   aviso do sistema pelo trabalhador
 *   IPHONE (PWA)         aviso do sistema pelo trabalhador
 *
 * A diferença que importa hoje é o aviso — o Elias pediu que o
 * aplicativo NÃO desse aviso de navegador —, mas ela não vai ficar
 * sozinha: câmera, arquivo e voltar-de-hardware também divergem.
 *
 * Escrever `Capacitor.isNativePlatform()` espalhado pelas telas seria a
 * quinta vez que este sistema faz a mesma pergunta em dois lugares. Ela
 * fica aqui.
 *
 * ===================================================================
 * NÃO SE PERGUNTA PELO USER AGENT
 * ===================================================================
 *
 * A tentação é olhar a string do navegador e procurar "Android" ou
 * "wv" (WebView). Isso erra dos dois lados: um Chrome no celular diz
 * Android e NÃO é o aplicativo; e qualquer pessoa pode mudar a string.
 *
 * `Capacitor.isNativePlatform()` só devolve verdadeiro quando existe
 * ponte nativa de verdade do outro lado — é o próprio aplicativo
 * respondendo, não uma pista sobre ele.
 */
import { Capacitor } from '@capacitor/core';
import { App as AplicativoNativo } from '@capacitor/app';
import { tratarVoltar } from './voltar';

/**
 * Verdadeiro só dentro da casca nativa (o APK do Android).
 *
 * No navegador do balcão e no PWA do iPhone devolve falso, porque não
 * há ponte nativa — e é o que os mantém no caminho que eles já têm.
 */
export const rodandoNoAplicativo = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    /**
     * O CATCH NÃO É ZELO EXCESSIVO.
     *
     * Este módulo é importado por serviços que rodam nos TESTES, sem
     * navegador e sem ponte. Uma exceção aqui derrubaria o arquivo de
     * teste inteiro, com um erro que não fala de notificação nenhuma —
     * e foi assim que uma coluna faltando derrubou o chat com a
     * mensagem "verifique a conexão".
     */
    return false;
  }
};

/** Onde estamos, por extenso. Serve para a tela explicar a si mesma. */
export const ondeEstamosRodando = (): 'aplicativo' | 'navegador' =>
  rodandoNoAplicativo() ? 'aplicativo' : 'navegador';

/**
 * O VOLTAR DO APARELHO.
 *
 * Primeiro a tela de cima (modal, foto, painel — `voltar.ts`). Sem
 * nenhuma, pergunta ao App se ele tem para onde recuar: conversa aberta,
 * aba que não é a inicial. Sem isso também, MINIMIZA — e não fecha.
 *
 * Minimizar e não fechar: fechar derruba a sessão do WebView, e a
 * próxima abertura volta a passar pela tela de espera inteira. É o que
 * o voltar faz no WhatsApp, e é o que as pessoas esperam.
 *
 * @param recuar do App: devolve verdadeiro se tinha para onde voltar
 * @returns a função que desliga o ouvinte
 */
export const ligarBotaoVoltar = (recuar: () => boolean): (() => void) => {
  if (!rodandoNoAplicativo()) return () => {};

  const ouvinte = AplicativoNativo.addListener('backButton', () => {
    if (tratarVoltar()) return;
    if (recuar()) return;
    void AplicativoNativo.minimizeApp();
  });

  return () => {
    void ouvinte.then((o) => o.remove());
  };
};

/**
 * OS ENDEREÇOS QUE ABREM O APLICATIVO — os atalhos do ícone.
 *
 * Segurar o ícone mostra "Bater ponto", "Conversas" e "Central"
 * (`android/.../res/xml/shortcuts.xml`). Cada um abre o aplicativo com
 * `conecta://abrir?atalho=...`, e o Android entrega esse endereço aqui
 * — não na barra do WebView, que continua no sistema publicado.
 *
 * Os dois casos:
 *   · aplicativo FECHADO: o endereço é o de lançamento (`getLaunchUrl`)
 *   · aplicativo ABERTO: chega pelo evento `appUrlOpen`
 *
 * Quem interpreta o `?atalho=` é o mesmo trecho do App que já lia o
 * atalho do PWA. Esta função só entrega o endereço.
 */
export const ouvirEnderecosDoAplicativo = (aoAbrir: (endereco: URL) => void): (() => void) => {
  if (!rodandoNoAplicativo()) return () => {};

  const entregar = (texto?: string) => {
    if (!texto) return;
    try {
      aoAbrir(new URL(texto));
    } catch {
      /* endereço que não é endereço: ignora, o aplicativo abre normal */
    }
  };

  void AplicativoNativo.getLaunchUrl()
    .then((r) => entregar(r?.url))
    .catch(() => {});
  const ouvinte = AplicativoNativo.addListener('appUrlOpen', (e) => entregar(e.url));

  return () => {
    void ouvinte.then((o) => o.remove());
  };
};
