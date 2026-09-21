/**
 * Relógio sincronizado — CONECTA / Malachias Autopeças
 *
 * A hora que o sistema usa, e que NÃO é a do aparelho.
 *
 * ===================================================================
 * POR QUE O RELÓGIO DO APARELHO NÃO SERVE
 * ===================================================================
 *
 * Todo o ponto saía de `new Date()`. Isso quer dizer que a batida valia o
 * que o celular dissesse que eram as horas — e o celular é do balcão, é
 * compartilhado, e qualquer um mexe no relógio dele em três toques.
 *
 * Não é só má-fé: aparelho velho atrasa sozinho, tablet que ficou sem
 * bateria volta com a data de fábrica, computador sem internet erra o
 * fuso no horário de verão. Em qualquer um desses casos a batida era
 * gravada com a hora errada e ninguém tinha como saber depois — o número
 * gravado parecia tão legítimo quanto os outros.
 *
 * Para a homologação isso também importa: registro de ponto pede hora de
 * fonte confiável, e "o que o aparelho achava" não é uma.
 *
 * ===================================================================
 * DE ONDE VEM A HORA CERTA
 * ===================================================================
 *
 * Do servidor, pelo cabeçalho `Date` que TODA resposta HTTP já traz. Não
 * há chamada nova, nem serviço de terceiro, nem relógio atômico: a
 * resposta que o Supabase já devolve carrega a hora dele, e é ela que
 * manda.
 *
 * O que se guarda é o DESVIO — a diferença entre o servidor e o aparelho.
 * Guardar o desvio, e não a hora, é o que faz o relógio continuar andando
 * entre uma sincronização e outra: o aparelho conta os segundos (isso ele
 * faz bem), e o desvio corrige o ponto de partida.
 *
 * ===================================================================
 * QUANDO A SINCRONIZAÇÃO FALHA
 * ===================================================================
 *
 * Cai para o relógio do aparelho e DIZ que caiu. `estaSincronizado()`
 * existe para a tela poder avisar antes de alguém bater o ponto numa hora
 * que talvez esteja errada.
 *
 * Travar a batida seria pior: a loja não pode parar de registrar
 * jornada porque a internet caiu. Melhor a batida acontecer e ficar
 * marcada como de hora não confirmada do que não acontecer.
 */

/**
 * Servidor menos aparelho, em milissegundos.
 *
 * Zero enquanto ninguém sincronizou — e nesse caso o relógio devolvido é
 * exatamente o do aparelho, que é o melhor palpite disponível.
 */
let desvioMs = 0;
let sincronizado = false;
let ultimaSincronizacao = 0;

/**
 * Acima disto a diferença deixa de ser imprecisão e passa a ser relógio
 * errado. Dois minutos: mais que qualquer atraso de rede, menos que o
 * arredondamento de uma marcação de ponto.
 */
const DESVIO_QUE_PREOCUPA_MS = 2 * 60 * 1000;

/** De quanto em quanto tempo vale a pena conferir de novo. */
const INTERVALO_MS = 10 * 60 * 1000;

const ouvintes: Array<() => void> = [];

export const assinarRelogio = (ouvinte: () => void): (() => void) => {
  ouvintes.push(ouvinte);
  return () => {
    const i = ouvintes.indexOf(ouvinte);
    if (i !== -1) ouvintes.splice(i, 1);
  };
};

const avisar = (): void => ouvintes.forEach((o) => o());

/**
 * A HORA DO SISTEMA. É esta que todo o resto deve usar.
 *
 * Devolve um `Date` novo a cada chamada de propósito: `Date` é mutável, e
 * devolver sempre o mesmo objeto deixaria qualquer `setDate` de qualquer
 * tela reescrevendo a hora de todo mundo.
 */
export const agora = (): Date => new Date(Date.now() + desvioMs);

/** A hora do sistema em milissegundos, para contas. */
export const agoraEmMs = (): number => Date.now() + desvioMs;

/** A sincronização deu certo e ainda vale? */
export const estaSincronizado = (): boolean => sincronizado;

/**
 * O aparelho está longe do servidor a ponto de preocupar?
 *
 * Serve para a tela avisar QUEM bate o ponto, e não só registrar no log:
 * quem está com o relógio errado precisa saber antes, não depois.
 */
export const desvioPreocupante = (): boolean =>
  sincronizado && Math.abs(desvioMs) > DESVIO_QUE_PREOCUPA_MS;

/** Quanto o aparelho está adiantado (negativo) ou atrasado (positivo). */
export const desvioEmMs = (): number => desvioMs;

/**
 * Lê a hora do servidor a partir do cabeçalho `Date` de uma resposta.
 *
 * Separado para poder ser testado sem rede — e porque a conta tem uma
 * sutileza: descontar METADE da ida e volta. O cabeçalho foi escrito
 * quando o servidor respondeu, e a resposta levou um tempo para chegar;
 * sem esse desconto, toda sincronização deixaria o sistema atrasado pelo
 * tempo da rede, que numa loja com internet ruim não é pouco.
 */
export const calcularDesvio = (
  cabecalhoDate: string | null,
  enviadoEmMs: number,
  recebidoEmMs: number
): number | null => {
  if (!cabecalhoDate) return null;

  const servidorMs = Date.parse(cabecalhoDate);
  if (!Number.isFinite(servidorMs)) return null;

  const metadeDaViagem = (recebidoEmMs - enviadoEmMs) / 2;
  return servidorMs + metadeDaViagem - recebidoEmMs;
};

/**
 * Acerta o relógio pelo servidor.
 *
 * Usa o endereço do próprio Supabase porque é o servidor com quem o
 * sistema já fala — se ele está fora do ar, o resto também está, e não há
 * hora a acertar para nada.
 */
export const sincronizarRelogio = async (urlDoServidor?: string): Promise<boolean> => {
  const url = urlDoServidor || (import.meta.env?.VITE_SUPABASE_URL as string | undefined);
  if (!url || typeof fetch === 'undefined') return false;

  try {
    const enviadoEm = Date.now();

    /**
     * `HEAD` e `no-store`: só o cabeçalho interessa, e resposta guardada
     * em cache traria a hora de quando foi guardada — que é justamente o
     * erro que este arquivo existe para não cometer.
     */
    const resposta = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      cache: 'no-store',
    });

    const recebidoEm = Date.now();
    const novo = calcularDesvio(resposta.headers.get('date'), enviadoEm, recebidoEm);
    if (novo === null) return false;

    desvioMs = novo;
    sincronizado = true;
    ultimaSincronizacao = recebidoEm;
    avisar();
    return true;
  } catch {
    // Sem rede o relógio do aparelho segue valendo, e `estaSincronizado`
    // continua dizendo a verdade sobre ele
    return false;
  }
};

/**
 * Mantém o relógio acertado enquanto o sistema está aberto.
 *
 * Sincroniza ao voltar para a tela, e não só de tempos em tempos: celular
 * que dormiu a noite inteira acorda com o relógio deslocado, e a primeira
 * batida da manhã é exatamente a que não pode sair errada.
 */
export const vigiarRelogio = (): (() => void) => {
  sincronizarRelogio();

  const periodico = setInterval(() => {
    sincronizarRelogio();
  }, INTERVALO_MS);

  const aoVoltar = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (Date.now() - ultimaSincronizacao < 60 * 1000) return;
    sincronizarRelogio();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', aoVoltar);
  }

  return () => {
    clearInterval(periodico);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', aoVoltar);
    }
  };
};

/** Só para teste: repõe o relógio ao estado de quem nunca sincronizou. */
export const reiniciarRelogio = (): void => {
  desvioMs = 0;
  sincronizado = false;
  ultimaSincronizacao = 0;
};
