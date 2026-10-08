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
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
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
 * O IDENTIFICADOR DO COLETOR DA MARCAÇÃO, no código do AFD (leiaute
 * vigente, registro tipo "7", campo 6): "01" aplicativo mobile, "02"
 * browser. O iPhone (PWA) é navegador.
 */
export const coletorDaMarcacao = (): '01' | '02' => (rodandoNoAplicativo() ? '01' : '02');

/** O plugin nativo do próprio app (android/.../Barras.java). */
const Barras = registerPlugin<{ pintar(opcoes: { cor: string }): Promise<void> }>('Barras');

/** "#0E1216" é escuro; "#F4F6F8" é claro. Pela luminância, como o olho vê. */
export const corEhEscura = (cor: string): boolean => {
  const hex = cor.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
};

/**
 * AS BARRAS DO ANDROID SEGUEM O TEMA DO CONECTA — e não o do celular.
 *
 * A barra de status (hora, bateria, avisos) e a de navegação ficavam
 * brancas com o CONECTA escuro. E com o celular no modo escuro, os ícones
 * da barra saíam brancos sobre o branco: a hora e os avisos sumiam.
 *
 * A cor sai do próprio tema (`--c-canvas` do index.css), e não de uma
 * lista aqui: tema novo, cor nova, sem mexer neste arquivo. Os ícones
 * ficam escuros sobre fundo claro e claros sobre fundo escuro.
 *
 * Acompanha as duas mudanças possíveis: a pessoa trocar o tema no
 * sistema (`data-tema` na raiz) e, no "Automático", o celular trocar de
 * claro para escuro.
 *
 * @returns a função que para de acompanhar
 */
export const acompanharTemaNasBarras = (): (() => void) => {
  if (!rodandoNoAplicativo() || typeof document === 'undefined') return () => {};

  /*
   * A página fica ENTRE as barras, e o que aparece nelas é o fundo que
   * `Barras.pintar` colore. Quem põe a página entre as barras é o
   * index.html, antes do primeiro desenho — daqui chegava tarde (ver o
   * comentário lá).
   */
  const pintar = () => {
    const cor = getComputedStyle(document.documentElement).getPropertyValue('--c-canvas').trim();
    if (!cor) return;
    const escuro = corEhEscura(cor);
    /* DARK = ícones CLAROS (para fundo escuro); LIGHT = ícones escuros */
    void SystemBars?.setStyle?.({ style: escuro ? SystemBarsStyle.Dark : SystemBarsStyle.Light })?.catch?.(
      () => {}
    );
    void Barras.pintar?.({ cor })?.catch?.(() => {});
  };

  pintar();

  const observador = new MutationObserver(pintar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

  const celular = window.matchMedia?.('(prefers-color-scheme: dark)');
  celular?.addEventListener?.('change', pintar);

  return () => {
    observador.disconnect();
    celular?.removeEventListener?.('change', pintar);
  };
};

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
const CHAVE_ABERTURA = 'conecta:endereco-de-abertura';

/** Já foi entregue nesta sessão? Marca na primeira vez. Sem armazenamento, entrega. */
export const enderecoDeAberturaJaUsado = (url: string): boolean => {
  try {
    if (sessionStorage.getItem(CHAVE_ABERTURA) === url) return true;
    sessionStorage.setItem(CHAVE_ABERTURA, url);
  } catch {
    /* sem armazenamento: entrega, como antes */
  }
  return false;
};

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

  /*
    O ENDEREÇO DE ABERTURA VALE UMA VEZ.

    O Android guarda com que endereço o aplicativo foi aberto enquanto o
    processo viver, e `getLaunchUrl` o devolve a cada carga da página. Com
    o QR do ponto (05/10/2026), recarregar a página — a atualização de
    versão recarrega sozinha — bateria o ponto DE NOVO: a próxima marcação,
    sem a pessoa ter lido cartaz nenhum. A sessão da página sobrevive à
    recarga e morre com o processo, que é exatamente o tempo em que o
    endereço de abertura se repete.
  */
  void AplicativoNativo.getLaunchUrl()
    .then((r) => {
      if (!r?.url || enderecoDeAberturaJaUsado(r.url)) return;
      entregar(r.url);
    })
    .catch(() => {});
  const ouvinte = AplicativoNativo.addListener('appUrlOpen', (e) => entregar(e.url));

  return () => {
    void ouvinte.then((o) => o.remove());
  };
};
