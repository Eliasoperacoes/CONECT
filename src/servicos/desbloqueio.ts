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

const plugin = async () => (await import('@capgo/capacitor-native-biometric')).NativeBiometric;

/** O aparelho tem digital ou rosto cadastrado, e o app tem o plugin? */
export const biometriaDisponivel = async (): Promise<boolean> => {
  if (!rodandoNoAplicativo() || !Capacitor.isPluginAvailable('NativeBiometric')) return false;
  try {
    const r = await (await plugin()).isAvailable({ useFallback: false });
    return r.isAvailable;
  } catch {
    return false;
  }
};

/** A janela de biometria do Android. Verdadeiro só com a digital (ou rosto) confirmada. */
export const confirmarIdentidade = async (titulo = 'Desbloquear o CONECTA'): Promise<boolean> => {
  try {
    await (await plugin()).verifyIdentity({
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
