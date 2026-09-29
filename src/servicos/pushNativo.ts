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
import type { DestinoNotificacao } from './centralDeNotificacoes';

/**
 * O que o servidor manda dentro do push.
 *
 * O Firebase só carrega TEXTO nos dados, então chega solto: todo campo
 * pode faltar. Quem traduz para o destino do sino é `destinoDoPush`.
 */
export interface DadosDoPush {
  tipo?: string;
  conversaId?: string;
  publicacaoId?: string;
}

/**
 * O TOQUE LEVA AO MESMO LUGAR QUE O SINO LEVA.
 *
 * Quem navega é `irParaNotificacao`, no App, e ele já sabe abrir
 * conversa e publicação. Este arquivo não navega: só traduz o que
 * chegou para o formato que ele entende. Um segundo navegador aqui
 * seria uma segunda cópia da regra de "tocar leva aonde".
 *
 * Dado que não fecha vira `null`, e o aplicativo abre na tela inicial.
 * Uma conversa sem id levaria a uma janela vazia, que é pior.
 */
export const destinoDoPush = (dados: DadosDoPush): DestinoNotificacao | null => {
  if (dados.tipo === 'publicacao' && dados.publicacaoId) {
    return { tipo: 'publicacao', publicacaoId: dados.publicacaoId };
  }
  if (dados.tipo === 'conversa' && dados.conversaId) {
    return { tipo: 'conversa', conversaId: dados.conversaId };
  }
  return null;
};

type Navegador = (destino: DestinoNotificacao) => void;

/** O canal dos avisos. O mesmo id no AndroidManifest e em enviar-aviso. */
export const CANAL_DE_MENSAGENS = 'mensagens';

let irPara: Navegador | null = null;

/**
 * O token deste aparelho, lembrado para o logout.
 *
 * Sem ele, sair do sistema não teria o que apagar: o token só chega no
 * evento de registro, e ninguém o pedia de volta. O aparelho seguiria
 * na lista de entrega da pessoa que saiu.
 */
let tokenDesteAparelho: string | null = null;

/**
 * GUARDA O ENDEREÇO DESTE APARELHO no banco.
 *
 * O token MUDA — reinstalação, restauração de backup, e de vez em
 * quando por conta própria. E um token velho não dá erro: ele
 * simplesmente não entrega, calado. Por isso ele é gravado a cada
 * abertura, e não só na primeira.
 *
 * PELA FUNÇÃO DO BANCO, e não por insert + update.
 *
 * O caminho antigo era insert, e no 23505 um update. Na troca de dono
 * — o celular do balcão passando da pessoa da manhã para a da tarde —
 * a linha ainda é da anterior, a RLS a esconde, e o update afeta zero
 * linhas devolvendo SUCESSO. O aviso da manhã continuava chegando no
 * bolso da tarde, e nada acusava.
 *
 * `registrar_aparelho` grava no nome de QUEM CHAMA — não recebe o
 * colaborador, então não há como registrar o aparelho em nome de outro.
 */
const guardarAparelho = async (token: string): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!supabase || !usandoNuvem()) return { sucesso: true };

  const { error } = await supabase.rpc('registrar_aparelho', {
    p_token: token,
    p_plataforma: 'android',
  });

  if (!error) return { sucesso: true };
  return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
};

/**
 * Liga o aviso nativo deste aparelho.
 *
 * Chamado depois do login — antes dele não há a quem entregar, e pedir
 * permissão de notificação na tela de senha é o tipo de coisa que faz a
 * pessoa negar por reflexo.
 *
 * Quem é o dono do aparelho o banco sabe pela sessão: por isso não se
 * passa o colaborador aqui.
 *
 * @param aoTocar o que fazer quando a pessoa toca no aviso
 */
export const ligarAvisoNativo = async (
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
      tokenDesteAparelho = token.value;
      guardarAparelho(token.value).then((res) => {
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
        const destino = destinoDoPush((acao.notification.data || {}) as DadosDoPush);
        if (destino) irPara?.(destino);
      }
    );

    /**
     * O CANAL "mensagens", com importância ALTA.
     *
     * É a importância do canal que decide se o aviso DESCE por cima da
     * tela ou só entra calado na barra. O canal padrão do Firebase é o
     * segundo — e aviso que ninguém vê chegar é aviso que não chegou.
     *
     * O id é o mesmo que o servidor manda (`channel_id` em
     * enviar-aviso) e o do AndroidManifest. Criar de novo um canal que já
     * existe não faz nada, então pode rodar a cada abertura.
     */
    await PushNotifications.createChannel({
      id: CANAL_DE_MENSAGENS,
      name: 'Mensagens',
      description: 'Mensagens das conversas e avisos da rede',
      importance: 5,
      visibility: 1,
      vibration: true,
    });

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
 *
 * TEM DE RODAR ANTES DE ENCERRAR A SESSÃO. A regra de apagar só deixa
 * a pessoa tirar os próprios aparelhos; sem sessão, o delete afeta zero
 * linhas, devolve sucesso, e o aparelho continua na lista.
 */
export const desligarAvisoNativo = async (): Promise<void> => {
  if (!rodandoNoAplicativo()) return;

  try {
    await PushNotifications.removeAllListeners();
    irPara = null;

    const token = tokenDesteAparelho;
    tokenDesteAparelho = null;

    if (token && supabase && usandoNuvem()) {
      await supabase.from('aparelhos').delete().eq('token', token);
    }
  } catch (erro) {
    console.error('Falha ao desligar os avisos deste aparelho:', erro);
  }
};
