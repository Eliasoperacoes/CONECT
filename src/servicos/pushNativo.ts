/**
 * AVISO COM O APLICATIVO FECHADO — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * O QUE ISTO RESOLVE, E O QUE NÃO RESOLVE
 * ===================================================================
 *
 * O aviso do navegador só existe enquanto o sistema está aberto. Quem
 * fecha o CONECTA para usar o cadastro de peça fica sem saber de
 * mensagem, de publicação e de pendência até abrir de novo — e num
 * balcão isso é o dia inteiro.
 *
 * O aviso com o aplicativo FECHADO não é uma configuração que faltava
 * ligar. Ele é outro caminho inteiro:
 *
 *   1. o Android dá ao aplicativo um ENDEREÇO (o token do Firebase)
 *   2. o aplicativo guarda esse endereço no nosso banco
 *   3. quando algo acontece, o SERVIDOR manda o aviso para lá
 *   4. o Android acorda o aplicativo e desenha o aviso
 *
 * Este arquivo cuida dos passos 1, 2 e 4. O passo 3 é a função de
 * servidor, que vive fora daqui.
 *
 * ===================================================================
 * NADA DISTO RODA NO NAVEGADOR
 * ===================================================================
 *
 * Toda função sai pela porta se `rodandoNoAplicativo()` for falso. O
 * computador do balcão e o iPhone seguem no aviso do navegador, que é o
 * único que eles têm — decisão do Elias.
 *
 * Isso é o que permite este arquivo existir antes do APK: no navegador
 * ele é inofensivo.
 */
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications';
import { rodandoNoAplicativo } from './aplicativo';
import { supabase, usandoNuvem } from './supabase';
import { explicarRecusaDoBanco } from './recusaDoBanco';

/**
 * O destino de um aviso, no mesmo formato que o sino já usa.
 *
 * É o que faz tocar na notificação abrir a conversa certa em vez da
 * tela inicial. O servidor manda isto dentro do push, e o aplicativo o
 * devolve para quem sabe navegar.
 */
export interface DestinoDoPush {
  tipo?: 'conversa' | 'publicacao' | 'secao';
  conversaId?: string;
  publicacaoId?: string;
  secao?: string;
}

type Navegador = (destino: DestinoDoPush) => void;

let irPara: Navegador | null = null;

/**
 * GUARDA O ENDEREÇO DESTE APARELHO no banco.
 *
 * O token MUDA — reinstalação, restauração de backup, e de vez em
 * quando por conta própria. E um token velho não dá erro: ele
 * simplesmente não entrega, calado. Por isso ele é gravado a cada
 * abertura, e não só na primeira.
 *
 * O TOKEN É A CHAVE da tabela, e não o aparelho. Quando o mesmo token
 * reaparece para outra pessoa — o celular trocou de dono, ou alguém
 * entrou com outro login no mesmo aparelho —, a linha passa a ser dela.
 * Sem isso, o aviso de uma pessoa chegaria no bolso da outra.
 */
const guardarAparelho = async (
  token: string,
  colaboradorId: string
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!supabase || !usandoNuvem()) return { sucesso: true };

  const agora = new Date().toISOString();

  /**
   * INSERT SIMPLES, e o 23505 tratado como "já existe".
   *
   * Nada de `upsert`: ele vira `ON CONFLICT` no Postgres, que exige
   * enxergar a linha em conflito — e a regra desta tabela só deixa a
   * pessoa ler os PRÓPRIOS aparelhos. O aparelho que trocou de dono
   * ainda pertence a outra pessoa na hora do conflito, então o upsert
   * seria recusado pela RLS.
   *
   * É a mesma armadilha que derrubou a gravação de conversa uma vez, e
   * está documentada em APRENDIZADOS.
   */
  const { error } = await supabase.from('aparelhos').insert({
    token,
    colaborador_id: colaboradorId,
    plataforma: 'android',
    visto_em: agora,
  });

  if (!error) return { sucesso: true };

  if (error.code === '23505') {
    /* Já existia: pode ser o mesmo dono abrindo de novo, ou o aparelho
       mudando de mão. Os dois casos se resolvem igual. */
    const { error: erroUpdate } = await supabase
      .from('aparelhos')
      .update({ colaborador_id: colaboradorId, visto_em: agora })
      .eq('token', token);

    if (!erroUpdate) return { sucesso: true };
    return { sucesso: false, erro: await explicarRecusaDoBanco(erroUpdate) };
  }

  return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
};

/**
 * Liga o aviso nativo deste aparelho.
 *
 * Chamado depois do login — antes dele não há a quem entregar, e pedir
 * permissão de notificação na tela de senha é o tipo de coisa que faz a
 * pessoa negar por reflexo.
 *
 * @param colaboradorId de quem está usando o aparelho agora
 * @param aoTocar o que fazer quando a pessoa toca no aviso
 */
export const ligarAvisoNativo = async (
  colaboradorId: string,
  aoTocar: Navegador
): Promise<{ ligado: boolean; motivo?: string }> => {
  if (!rodandoNoAplicativo()) {
    return { ligado: false, motivo: 'Fora do aplicativo: o aviso é o do navegador.' };
  }

  irPara = aoTocar;

  try {
    /**
     * A PERMISSÃO É PEDIDA, NÃO SUPOSTA.
     *
     * Do Android 13 em diante o aviso é negado por padrão, e o
     * aplicativo precisa pedir. Sem este passo o token até chega, o
     * servidor entrega, e o aparelho não mostra nada — a pior falha
     * possível, porque tudo "funciona".
     */
    let permissao = await PushNotifications.checkPermissions();

    if (permissao.receive === 'prompt' || permissao.receive === 'prompt-with-rationale') {
      permissao = await PushNotifications.requestPermissions();
    }

    if (permissao.receive !== 'granted') {
      return {
        ligado: false,
        motivo:
          'O aviso está desligado nas permissões do aparelho. ' +
          'Ajustes → Aplicativos → CONECTA → Notificações.',
      };
    }

    /**
     * OS OUVINTES VÊM ANTES DO REGISTRO.
     *
     * `register()` dispara `registration` — às vezes na mesma volta. Se
     * o ouvinte ainda não estiver de pé, o token passa e ninguém o
     * guarda: o aparelho fica sem endereço até a próxima abertura, e o
     * aviso some sem erro nenhum.
     */
    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener('registration', (token: Token) => {
      guardarAparelho(token.value, colaboradorId).then((res) => {
        if (!res.sucesso) {
          console.error('Aparelho não foi registrado para avisos:', res.erro);
        }
      });
    });

    await PushNotifications.addListener('registrationError', (erro) => {
      console.error('O Firebase recusou registrar este aparelho:', erro);
    });

    /**
     * COM O APLICATIVO ABERTO, O AVISO NÃO APARECE.
     *
     * É a mesma regra do aviso do navegador, e pela mesma razão: uma
     * tarja por cima de um sistema que a pessoa está usando, avisando
     * de algo que está a um toque dali, é só um susto.
     *
     * O sino dentro do sistema continua contando. Quem precisa do aviso
     * é quem NÃO está com o CONECTA à vista — e esse recebe pelo
     * caminho de baixo, com o aplicativo fechado, desenhado pelo
     * próprio Android.
     */
    await PushNotifications.addListener(
      'pushNotificationReceived',
      (aviso: PushNotificationSchema) => {
        void aviso;
      }
    );

    /** O toque no aviso leva ao lugar, e não à tela inicial. */
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (acao: ActionPerformed) => {
        const dados = (acao.notification.data || {}) as DestinoDoPush;
        irPara?.(dados);
      }
    );

    await PushNotifications.register();
    return { ligado: true };
  } catch (erro) {
    return {
      ligado: false,
      motivo: erro instanceof Error ? erro.message : 'Falha ao ligar os avisos.',
    };
  }
};

/**
 * Tira este aparelho da lista de entrega.
 *
 * Chamado ao SAIR do sistema. Sem isto, quem empresta o celular ou
 * troca de turno no aparelho do balcão continuaria recebendo as
 * mensagens da pessoa anterior — inclusive as do chat.
 */
export const desligarAvisoNativo = async (token?: string): Promise<void> => {
  if (!rodandoNoAplicativo()) return;

  try {
    await PushNotifications.removeAllListeners();
    irPara = null;

    if (token && supabase && usandoNuvem()) {
      await supabase.from('aparelhos').delete().eq('token', token);
    }
  } catch (erro) {
    console.error('Falha ao desligar os avisos deste aparelho:', erro);
  }
};
