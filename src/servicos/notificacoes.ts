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

/**
 * Dois toques curtos, agudos e baixos. Precisa ser reconhecível no meio do
 * barulho da loja sem assustar quem está atendendo um cliente ao lado.
 */
export const tocarAvisoDeMensagem = (): void => {
  if (!somLigado() || typeof window === 'undefined') return;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!contexto) contexto = new Ctx();
    if (contexto.state === 'suspended') contexto.resume();

    const agora = contexto.currentTime;
    [0, 0.14].forEach((atraso, indice) => {
      const osc = contexto!.createOscillator();
      const ganho = contexto!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(indice === 0 ? 880 : 1175, agora + atraso);

      ganho.gain.setValueAtTime(0.0001, agora + atraso);
      ganho.gain.exponentialRampToValueAtTime(0.14, agora + atraso + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.11);

      osc.connect(ganho);
      ganho.connect(contexto!.destination);
      osc.start(agora + atraso);
      osc.stop(agora + atraso + 0.12);
    });
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
  if (permissaoDeAviso() !== 'concedida') return;

  const opcoes: NotificationOptions = {
    body: dados.corpo,
    tag: `conecta-${dados.conversaId}`,
    icon: '/logo-malachias.svg',
    badge: '/logo-malachias.svg',
  };

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
