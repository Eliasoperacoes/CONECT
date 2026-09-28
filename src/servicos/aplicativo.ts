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
