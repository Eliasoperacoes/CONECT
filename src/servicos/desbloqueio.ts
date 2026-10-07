/**
 * DESBLOQUEAR O APP COM A BIOMETRIA — só no aplicativo Android.
 *
 * Pedido do Elias (06/10/2026). A sessão do CONECTA fica guardada (ninguém
 * redigita a senha a cada batida no balcão); a biometria é a tranca por
 * cima dela: o celular esquecido no balcão não abre as conversas, o ponto
 * e os documentos de quem o largou ali.
 *
 *   · OPCIONAL, POR APARELHO: perguntado uma vez depois de entrar; liga e
 *     desliga em "Eu". É do aparelho (localStorage) — o celular de outra
 *     pessoa não herda a escolha.
 *   · BLOQUEIA ao abrir o app e ao voltar a ele depois de
 *     `INTERVALO_PARA_BLOQUEAR_MS` em segundo plano.
 *   · A SAÍDA SEM DIGITAL é a tela de entrada, com a senha.
 *
 * No navegador e no iPhone (PWA) nada disto roda: lá a biometria pediria
 * outro mecanismo, e a sessão segue como sempre.
 */
import { Capacitor } from '@capacitor/core';
import { App as AplicativoNativo } from '@capacitor/app';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { rodandoNoAplicativo } from './aplicativo';

const CHAVE = 'conecta:biometria';

/** Voltou ao app depois de um minuto fora: pede a digital de novo. */
export const INTERVALO_PARA_BLOQUEAR_MS = 60_000;

export type PreferenciaDeBiometria = 'ligada' | 'desligada' | 'nao_perguntada';

export const lerPreferencia = (): PreferenciaDeBiometria => {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'ligada' || v === 'desligada' ? v : 'nao_perguntada';
  } catch {
    return 'nao_perguntada';
  }
};

export const gravarPreferencia = (valor: 'ligada' | 'desligada'): void => {
  try {
    localStorage.setItem(CHAVE, valor);
  } catch {
    /* sem armazenamento: vale só nesta abertura */
  }
};

/**
 * QUANDO BLOQUEAR. Ligada, e: acabou de abrir (nunca foi para o segundo
 * plano), ou ficou fora pelo menos o intervalo. Separado para o teste
 * medir sem aparelho.
 */
export const deveBloquear = (d: { ligada: boolean; saiuEm: number | null; agora: number }): boolean =>
  d.ligada && (d.saiuEm === null || d.agora - d.saiuEm >= INTERVALO_PARA_BLOQUEAR_MS);

/*
  O PLUGIN É IMPORTADO DIRETO, como o dos avisos (pushNativo.ts) — e nunca
  devolvido por uma função async. Era `async () => (await import(...)).NativeBiometric`:
  ao resolver uma promessa com o plugin, o JavaScript pergunta se ele tem
  `then`; o plugin do Capacitor repassa ao Android QUALQUER método pedido,
  inclusive esse, e a promessa nunca resolvia. Nem a pergunta "usar a
  digital?" nem a linha de Eu apareciam (Elias, 07/10/2026).
*/

/** O Android que não responde em alguns segundos vira motivo na tela, e não espera eterna. */
const PRAZO_DO_ANDROID_MS = 5000;
const comPrazo = <T>(promessa: Promise<T>, ms = PRAZO_DO_ANDROID_MS): Promise<T> =>
  Promise.race([
    promessa,
    new Promise<T>((_, rejeitar) => setTimeout(() => rejeitar(new Error('o Android não respondeu')), ms)),
  ]);

/** O que cada código do Android quer dizer, para quem está com o celular na mão. */
const MOTIVO_DO_CODIGO: Record<number, string> = {
  1: 'Este celular não tem leitor de digital ou de rosto disponível.',
  2: 'A digital foi bloqueada por tentativas erradas. Desbloqueie o celular com o PIN e tente de novo.',
  3: 'Nenhuma digital cadastrada no celular. Cadastre em Configurações > Biometria e segurança.',
  4: 'A digital está bloqueada por alguns segundos, por tentativas erradas. Tente de novo em instantes.',
  14: 'O celular está sem bloqueio de tela. Defina um PIN ou padrão para usar a digital.',
};

export interface SituacaoDaBiometria {
  disponivel: boolean;
  /** Por que não — dito na tela, e não escondido (Elias, 07/10/2026: "em momento algum pediu"). */
  motivo?: string;
}

/**
 * A biometria funciona aqui? E, se não, POR QUÊ. Antes a resposta era só
 * sim ou não, e o "não" escondia a linha de Eu sem explicar — quem
 * esperava a digital via nada acontecer e não sabia se era o APK, o
 * celular ou o sistema.
 */
export const situacaoDaBiometria = async (): Promise<SituacaoDaBiometria> => {
  if (!rodandoNoAplicativo()) return { disponivel: false, motivo: 'Só no aplicativo Android.' };
  if (!Capacitor.isPluginAvailable('NativeBiometric')) {
    return { disponivel: false, motivo: 'Este aplicativo é da versão antiga, sem a digital. Instale a versão nova do CONECTA.' };
  }
  try {
    const r = await comPrazo(NativeBiometric.isAvailable({ useFallback: false }));
    if (r.isAvailable) return { disponivel: true };
    const codigo = Number(r.errorCode ?? 0);
    return { disponivel: false, motivo: MOTIVO_DO_CODIGO[codigo] ?? `O Android não liberou a digital (código ${codigo}).` };
  } catch (erro) {
    return { disponivel: false, motivo: `Não foi possível consultar a digital: ${(erro as Error)?.message || 'erro desconhecido'}.` };
  }
};

/** O aparelho tem digital ou rosto cadastrado, e o app tem o plugin? */
export const biometriaDisponivel = async (): Promise<boolean> => (await situacaoDaBiometria()).disponivel;

/** "1.0 (build 1)": qual APK está instalado — para conferir sem cabo. */
export const versaoDoAplicativo = async (): Promise<string | null> => {
  if (!rodandoNoAplicativo()) return null;
  try {
    const info = await AplicativoNativo.getInfo();
    return `${info.version} (build ${info.build})`;
  } catch {
    return null;
  }
};

/** A janela de biometria do Android. Verdadeiro só com a digital (ou rosto) confirmada. */
export const confirmarIdentidade = async (titulo = 'Desbloquear o CONECTA'): Promise<boolean> => {
  try {
    await NativeBiometric.verifyIdentity({
      title: titulo,
      subtitle: 'Use a sua digital ou o seu rosto',
      negativeButtonText: 'Cancelar',
      maxAttempts: 5,
    });
    return true;
  } catch {
    return false;
  }
};

/** Avisa quando o app vai para o segundo plano (false) e volta (true). */
export const ouvirEstadoDoAplicativo = (aoMudar: (ativo: boolean) => void): (() => void) => {
  if (!rodandoNoAplicativo()) return () => {};
  const ouvinte = AplicativoNativo.addListener('appStateChange', (e) => aoMudar(e.isActive));
  return () => {
    void ouvinte.then((o) => o.remove());
  };
};
