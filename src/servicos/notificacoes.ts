/**
 * Aviso de mensagem nova — CONECTA / Malachias Autopeças
 *
 * Num balcão de autopeças o sistema fica aberto o dia inteiro atrás de outra
 * coisa: o cadastro de peça, a planilha, o navegador em outra aba. Sem aviso,
 * a mensagem só é vista quando alguém lembra de olhar — e aí ela já não
 * serviu para nada.
 *
 * São três avisos, do mais discreto ao mais insistente:
 *
 *  1. O TÍTULO DA ABA, com a contagem. Não pede permissão, não faz barulho e
 *     funciona sempre — é o que a pessoa vê de canto de olho.
 *  2. O SOM, curto. Chama quem está de costas para a tela.
 *  3. O AVISO DO SISTEMA, que aparece por cima de qualquer programa. Este
 *     depende de permissão, e ela é pedida no momento certo: quando a pessoa
 *     escolhe ligar os avisos, não ao abrir o sistema pela primeira vez.
 *
 * Nada disso alcança quem fechou o sistema. Aviso com o aplicativo fechado
 * exige um trabalhador de segundo plano e servidor de push; não é o que está
 * aqui.
 */

import { rodandoNoAplicativo } from './aplicativo';
import { gerarAmostrasDoAviso } from './somDoAviso';

/**
 * É computador (mouse), e não celular nem o aplicativo Android?
 *
 * O convite para ligar os avisos e o aviso silencioso (com o som do
 * CONECTA no lugar do Windows) são coisa do computador: no aplicativo quem
 * avisa é o Android, e no celular pelo navegador o aviso do sistema é o que
 * vibra.
 */
export const ehComputador = (): boolean =>
  typeof window !== 'undefined' &&
  !rodandoNoAplicativo() &&
  !!window.matchMedia?.('(pointer: fine)').matches;

// --- Convite para ligar os avisos ---

const CHAVE_CONVITE_ADIADO = 'conecta_convite_avisos_adiado_ate';
/** "Agora não" cala o convite por uma semana, e não para sempre. */
const DIAS_DE_ADIAMENTO = 7;

/**
 * O CONVITE PARA LIGAR OS AVISOS DO COMPUTADOR.
 *
 * O Elias: "não dá a sugestão para ativar". O único caminho era Eu →
 * Preferências → Ligar, e ninguém ia lá. O navegador só deixa pedir a
 * permissão num clique da pessoa — por isso é um convite com botão, e não
 * o pedido direto ao abrir.
 *
 * Aparece só quando ainda dá para pedir: quem recusou no navegador só
 * libera pelo cadeado, e perguntar de novo não adiantaria.
 */
export const deveConvidarParaAvisos = (agora: number = Date.now()): boolean => {
  if (!ehComputador() || permissaoDeAviso() !== 'nao_perguntada') return false;
  try {
    const ate = Number(localStorage.getItem(CHAVE_CONVITE_ADIADO) || 0);
    return !(ate > agora);
  } catch {
    return true;
  }
};

export const adiarConviteDeAvisos = (agora: number = Date.now()): void => {
  try {
    localStorage.setItem(
      CHAVE_CONVITE_ADIADO,
      String(agora + DIAS_DE_ADIAMENTO * 24 * 60 * 60 * 1000)
    );
  } catch {
    // Sem armazenamento, o convite volta na próxima vez — é o menor dos males
  }
};

const TITULO_BASE = 'CONECTA — Malachias Autopeças';
const CHAVE_PREFERENCIA = 'conecta_v4_avisos_mensagem';

export type PermissaoAviso = 'concedida' | 'negada' | 'nao_perguntada' | 'indisponivel';

/** O navegador sabe mostrar aviso do sistema? */
const temSuporte = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

export const permissaoDeAviso = (): PermissaoAviso => {
  if (!temSuporte()) return 'indisponivel';
  if (Notification.permission === 'granted') return 'concedida';
  if (Notification.permission === 'denied') return 'negada';
  return 'nao_perguntada';
};

/**
 * Pede a permissão ao navegador. Só deve ser chamado a partir de um clique —
 * pedir sozinho na abertura faz o navegador recusar e queima a única chance
 * de perguntar.
 */
export const pedirPermissaoDeAviso = async (): Promise<PermissaoAviso> => {
  if (!temSuporte()) return 'indisponivel';
  if (Notification.permission !== 'default') return permissaoDeAviso();

  try {
    await Notification.requestPermission();
  } catch {
    // Navegador antigo devolve por callback; a leitura abaixo cobre os dois
  }
  return permissaoDeAviso();
};

/** O som está ligado neste aparelho? Silenciar é escolha de quem senta nele. */
export const somLigado = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_PREFERENCIA) !== 'mudo';
  } catch {
    return true;
  }
};

export const definirSom = (ligado: boolean): void => {
  try {
    localStorage.setItem(CHAVE_PREFERENCIA, ligado ? 'com-som' : 'mudo');
  } catch {
    // Sem armazenamento, o padrão (com som) continua valendo
  }
};

// --- Trabalhador de segundo plano ---

let registro: ServiceWorkerRegistration | null = null;

/**
 * Registra o trabalhador que mostra o aviso.
 *
 * No Android o navegador RECUSA `new Notification(...)` — lá o aviso só sai
 * por um trabalhador. É por isso que o celular ficava mudo mesmo com tudo o
 * mais certo. No computador ele também é usado, porque o aviso sobrevive à
 * aba ser trocada.
 */
export const prepararAvisos = async (): Promise<void> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    registro = await navigator.serviceWorker.register('/sw-avisos.js');
    await navigator.serviceWorker.ready;
  } catch (erro) {
    console.error('Falha ao preparar os avisos:', erro);
  }
};

// --- Som ---

let contexto: AudioContext | null = null;

/**
 * Cria o som na primeira vez que a pessoa toca na tela.
 *
 * O navegador só libera áudio depois de um gesto, e o aviso de mensagem
 * nunca é um gesto — chega sozinho. Sem preparar antes, o primeiro aviso
 * (e às vezes todos) sai mudo.
 */
export const prepararSom = (): void => {
  if (typeof window === 'undefined' || contexto) return;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    contexto = new Ctx();
    if (contexto.state === 'suspended') contexto.resume();
  } catch {
    contexto = null;
  }
};

/** O som gerado uma vez por aparelho: montar 60 mil amostras a cada aviso seria desperdício. */
let somPronto: AudioBuffer | null = null;

/**
 * O som do CONECTA: dois sinos suaves, subindo. A receita está em
 * `somDoAviso.ts`, a mesma que gera o som do aplicativo Android — o aviso
 * soa igual no computador e no celular.
 */
export const tocarAvisoDeMensagem = (): void => {
  if (!somLigado() || typeof window === 'undefined') return;

  /**
   * NO APLICATIVO, COM A TELA ESCONDIDA, QUEM AVISA É O ANDROID.
   *
   * Minimizado, o aplicativo continua vivo por um tempo: a mensagem chega
   * pelo tempo real e esta função tocava — e o Android, vendo que o
   * CONECTA não estava na tela (`MainActivity.naTela`), mostrava o aviso
   * dele com o som do canal. Dois avisos da mesma mensagem, o primeiro
   * quase no instante do envio. Com a tela à vista, o Android se cala e
   * o som é este; escondida, é o dele.
   */
  // Só a visibilidade, sem o foco: é o que acompanha o `naTela` do Android
  // (com a cortina de notificações puxada falta foco, e ninguém tocaria)
  if (rodandoNoAplicativo() && document.visibilityState !== 'visible') return;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!contexto) contexto = new Ctx();
    if (contexto.state === 'suspended') contexto.resume();

    if (!somPronto || somPronto.sampleRate !== contexto.sampleRate) {
      const amostras = gerarAmostrasDoAviso(contexto.sampleRate);
      somPronto = contexto.createBuffer(1, amostras.length, contexto.sampleRate);
      somPronto.getChannelData(0).set(amostras);
    }

    const fonte = contexto.createBufferSource();
    fonte.buffer = somPronto;
    fonte.connect(contexto.destination);
    fonte.start();
  } catch {
    // Som é conforto, não função: falhar aqui não pode atrapalhar a mensagem
  }
};

// --- Título da aba ---

/**
 * Põe a contagem no título. É o aviso que sempre funciona: não depende de
 * permissão nem de som, e aparece na barra de abas mesmo com o navegador
 * minimizado na barra de tarefas.
 */
export const atualizarTituloDaAba = (naoLidas: number): void => {
  if (typeof document === 'undefined') return;
  document.title = naoLidas > 0 ? `(${naoLidas}) ${TITULO_BASE}` : TITULO_BASE;
};

// --- Aviso do sistema ---

/**
 * Mostra o aviso do sistema. A `tag` faz o navegador SUBSTITUIR o aviso
 * anterior da mesma conversa em vez de empilhar: dez mensagens seguidas de
 * uma pessoa viram um aviso atualizado, não dez pilhas na tela.
 */
export const mostrarAvisoDeMensagem = async (dados: {
  titulo: string;
  corpo: string;
  conversaId: string;
  aoClicar?: () => void;
}): Promise<void> => {
  /**
   * ===============================================================
   * NO APLICATIVO ANDROID, QUEM AVISA É O ANDROID.
   * ===============================================================
   *
   * Decisão do Elias: "o app não pode dar notificações de navegador,
   * apenas notificações do próprio aplicativo".
   *
   * Dentro da casca nativa, o aviso chega pelo Firebase e o Android o
   * desenha com o ícone e o nome do CONECTA. Deixar este caminho rodar
   * junto faria o aparelho mostrar DOIS avisos da mesma mensagem — um
   * do aplicativo e um da página dentro dele.
   *
   * E o de dentro é o pior dos dois: ele só existe com o sistema
   * ABERTO, que é justamente quando a pessoa não precisa ser avisada.
   *
   * No computador do balcão e no iPhone nada muda — lá o aviso do
   * navegador é o único que existe, e tirá-lo deixaria o pessoal do
   * computador sem aviso nenhum.
   */
  if (rodandoNoAplicativo()) return;

  if (permissaoDeAviso() !== 'concedida') return;

  /**
   * AVISO DO SISTEMA SÓ QUANDO A PESSOA NÃO ESTÁ OLHANDO.
   *
   * Era verificado em UM dos chamadores — o de mensagem, e só para a
   * conversa aberta. Quem estava no Ponto recebia uma janela do Windows
   * por cima de um sistema que ele estava usando, para avisar de algo que
   * estava a um clique dali.
   *
   * A regra é do aviso, não de quem chama. Aqui ela vale para todos, e
   * chamador novo não precisa lembrar dela.
   *
   * O sino dentro do sistema continua contando — é ele que mostra o que
   * está esperando enquanto a tela está à vista.
   */
  if (janelaEstaVisivel()) return;

  const opcoes: NotificationOptions = {
    body: dados.corpo,
    tag: `conecta-${dados.conversaId}`,
    icon: '/logo-malachias.svg',
    badge: '/logo-malachias.svg',

    /**
     * SEM ISTO O CELULAR FICAVA MUDO DA SEGUNDA MENSAGEM EM DIANTE.
     *
     * A `tag` acima faz o aviso da mesma conversa SUBSTITUIR o anterior, em
     * vez de empilhar dez avisos. Só que substituir é silencioso por padrão:
     * a segunda, a terceira e a décima mensagem da mesma pessoa trocavam o
     * texto do aviso sem vibrar e sem tocar. Quem largou o celular na
     * bancada não ficava sabendo.
     *
     * `renotify` mantém a substituição E volta a chamar a atenção.
     */
    renotify: true,

    /**
     * NO COMPUTADOR, SÓ O SOM DO CONECTA.
     *
     * O aviso do sistema toca o som do Windows, e o sistema já toca o
     * dele (`tocarAvisoDeMensagem`): eram dois sons juntos a cada mensagem.
     * No celular fica como estava — lá o aviso do sistema é quem vibra.
     */
    silent: somLigado() && ehComputador(),

    /**
     * Na loja o celular quase sempre está no bolso ou em cima do balcão, com
     * barulho de oficina em volta. A vibração é o que realmente avisa.
     *
     * O padrão é curto de propósito: vibrar longo a cada mensagem de grupo
     * cansa, e aviso que cansa é aviso que a pessoa desliga.
     */
    vibrate: [120, 60, 120],

    /** O horário real da mensagem, e não o do momento em que o aviso saiu. */
    timestamp: Date.now(),

    /**
     * A conversa vai junto do aviso para o trabalhador saber o que abrir no
     * toque. Sem este dado ele só trazia a janela para a frente, na tela em
     * que ela estivesse — e a pessoa tinha de achar a conversa na mão,
     * depois de já ter tocado no aviso daquela conversa.
     */
    data: {
      conversaId: dados.conversaId,
      url: '/',
    },
  } as NotificationOptions;

  // Caminho do trabalhador primeiro: é o único que o Android aceita, e no
  // computador funciona igual.
  try {
    const pronto = registro || (await navigator.serviceWorker?.getRegistration());
    if (pronto) {
      await pronto.showNotification(dados.titulo, opcoes);
      return;
    }
  } catch (erro) {
    console.error('Aviso pelo trabalhador falhou:', erro);
  }

  try {
    const aviso = new Notification(dados.titulo, opcoes);
    aviso.onclick = () => {
      window.focus();
      dados.aoClicar?.();
      aviso.close();
    };
  } catch (erro) {
    console.error('Aviso direto falhou:', erro);
  }
};

/**
 * Dispara os três avisos de uma vez, para a pessoa conferir se estão
 * funcionando sem precisar pedir para alguém mandar mensagem — e para
 * descobrir QUAL deles está travado, em vez de "não apareceu nada".
 */
export const testarAvisos = async (): Promise<{
  som: boolean;
  aviso: boolean;
  motivo?: string;
}> => {
  prepararSom();
  tocarAvisoDeMensagem();
  const som = somLigado() && !!contexto;

  const permissao = permissaoDeAviso();
  if (permissao !== 'concedida') {
    return {
      som,
      aviso: false,
      motivo:
        permissao === 'negada'
          ? 'Os avisos estão bloqueados no navegador. Libere no cadeado ao lado do endereço.'
          : permissao === 'indisponivel'
          ? 'Este navegador não mostra avisos do sistema.'
          : 'Toque em "Ligar" para autorizar os avisos.',
    };
  }

  await mostrarAvisoDeMensagem({
    titulo: 'CONECTA — teste',
    corpo: 'Se você está lendo isto, os avisos estão funcionando.',
    conversaId: 'teste',
  });

  return { som, aviso: true };
};

/** A janela está à vista? Quem está olhando a conversa não precisa de aviso. */
export const janelaEstaVisivel = (): boolean =>
  typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
