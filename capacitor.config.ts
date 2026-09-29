/**
 * O APLICATIVO ANDROID — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * POR QUE EXISTE UMA CASCA NATIVA
 * ===================================================================
 *
 * O CONECTA roda no navegador e é instalável como PWA. Isso resolve
 * quase tudo — menos uma coisa: aviso com o aplicativo FECHADO.
 *
 * No Android, um site instalado só recebe aviso enquanto o navegador
 * mantém o trabalhador de segundo plano vivo, e o sistema o mata
 * quando quer. Para o aparelho ACORDAR o aplicativo, o aviso tem de
 * chegar pelo canal do próprio Android — o Firebase Cloud Messaging —,
 * e isso exige um aplicativo de verdade.
 *
 * O Elias: "precisamos de notificações com o app fechado, mas de
 * maneira nativa no android" e "o app não pode dar notificações de
 * navegador, apenas notificações do próprio aplicativo".
 *
 * ===================================================================
 * ELE NÃO EMBRULHA O SISTEMA — ELE APONTA PARA ELE
 * ===================================================================
 *
 * `server.url` faz o aplicativo abrir o CONECTA publicado, em vez de
 * carregar uma cópia embutida no APK.
 *
 * É o que mantém UMA versão no ar. Com os arquivos dentro do APK, cada
 * correção exigiria gerar um APK novo e as 89 pessoas instalarem de
 * novo — e enquanto isso metade da rede estaria numa versão e metade
 * em outra, com o mesmo banco embaixo. Já vimos o que uma única coluna
 * divergente faz com o chat.
 *
 * Assim o APK é instalado uma vez e não muda; quem muda é o sistema,
 * que já é publicado a cada push.
 *
 * O PREÇO é que o aplicativo depende de rede para abrir. É o mesmo
 * preço que o PWA já paga, e o trabalhador de segundo plano
 * (`sw-avisos.js`) guarda a casca para o corredor dos fundos, onde o
 * sinal cai.
 *
 * ===================================================================
 * O IPHONE FICA NO PWA
 * ===================================================================
 *
 * Decisão do Elias. O iOS exige conta paga de desenvolvedor e
 * distribuição pela loja — não há "APK interno" equivalente. Lá o
 * sistema segue instalável pelo Safari, com o aviso do navegador.
 */
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * O ENDEREÇO DE PRODUÇÃO, e ele precisa ser HTTPS.
 *
 * Sai da variável de ambiente para o APK de teste poder apontar para
 * outro lugar sem alguém editar este arquivo e esquecer de voltar — que
 * é como um aplicativo interno acaba apontando para a máquina de
 * alguém.
 *
 * O PRIMEIRO APK SAIU COM UM ENDEREÇO QUE NÃO EXISTIA
 * (`conecta-malachias`, com hífen) — escrito de cabeça, sem abrir. O
 * aplicativo instalou, abriu, e mostrou a página de erro da Vercel. Este
 * é o que o pessoal usa no navegador, conferido respondendo 200 com o
 * título do CONECTA. Os endereços `*-projects.vercel.app` da conta NÃO
 * servem: pedem login da Vercel antes de abrir.
 */
const ENDERECO = process.env.VITE_ENDERECO_PRODUCAO || 'https://conectamalachias.vercel.app';

const config: CapacitorConfig = {
  appId: 'br.com.malachiasautopecas.conecta',
  appName: 'CONECTA',

  /**
   * A pasta que o `cap sync` copia para dentro do APK.
   *
   * Com `server.url` apontando para a produção, o que está aqui quase
   * não é usado — mas o Capacitor exige a pasta, e ela serve de tela
   * inicial enquanto a rede não responde.
   */
  webDir: 'dist',

  server: {
    url: ENDERECO,
    /**
     * `cleartext: false` — só HTTPS.
     *
     * Um aplicativo que aceita HTTP aceita que alguém na rede da loja
     * leia e altere o que trafega. Aqui trafega ponto, holerite e
     * conversa.
     */
    cleartext: false,
  },

  plugins: {
    PushNotifications: {
      /**
       * O som e o número no ícone ficam com o Android.
       *
       * `badge` é o contador na bolinha do ícone; `alert` é o aviso na
       * tela. Sem estes, o push chegaria e não apareceria — o que é
       * pior do que não chegar, porque ninguém procura o que não sabe
       * que existe.
       */
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  android: {
    /**
     * O aplicativo não é depurável no aparelho de ninguém.
     *
     * Ele é distribuído internamente, fora da Play Store — e um APK
     * depurável na mão de 89 pessoas é uma porta aberta para qualquer
     * um com um cabo USB.
     */
    webContentsDebuggingEnabled: false,
  },
};

export default config;
