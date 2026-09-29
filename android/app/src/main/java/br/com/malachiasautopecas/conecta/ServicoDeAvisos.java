package br.com.malachiasautopecas.conecta;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * O AVISO COM O APLICATIVO FECHADO, desenhado por nós.
 *
 * ===================================================================
 * POR QUE NÃO DEIXAR O ANDROID DESENHAR
 * ===================================================================
 *
 * Quando o servidor manda `notification`, o próprio Android desenha o
 * aviso com o aplicativo fechado — e o desenho dele não tem campo de
 * resposta. Para existir o "Responder", o servidor (enviar-aviso) manda
 * SÓ DADOS, e este serviço monta o aviso.
 *
 * ===================================================================
 * POR QUE ESTENDER O SERVIÇO DO CAPACITOR
 * ===================================================================
 *
 * O Android entrega a mensagem a UM serviço só. O do Capacitor é o que
 * guarda o token novo e repassa a mensagem ao sistema quando ele está
 * aberto; substituí-lo por outro faria o token parar de ser guardado.
 * Estendendo, `super` continua fazendo isso tudo, e o aviso é o que se
 * acrescenta. O manifesto tira o serviço original e põe este no lugar.
 */
public class ServicoDeAvisos extends MessagingService {

    /** O canal dos avisos: o mesmo id do AndroidManifest. */
    static final String CANAL = "mensagens";

    /** A chave do texto digitado no campo "Responder". */
    static final String CHAVE_DO_TEXTO = "texto";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage mensagem) {
        super.onMessageReceived(mensagem);

        Map<String, String> dados = mensagem.getData();
        if (!dados.containsKey("titulo")) return;

        // Com o CONECTA na tela, a conversa já mostra a mensagem
        if (MainActivity.naTela) return;

        mostrar(this, dados);
    }

    /** Um aviso por conversa: a mensagem nova substitui a anterior. */
    static int idDoAviso(String conversaId) {
        return conversaId == null ? 0 : conversaId.hashCode();
    }

    static void garantirCanal(Context contexto) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager gerente = contexto.getSystemService(NotificationManager.class);
        if (gerente == null || gerente.getNotificationChannel(CANAL) != null) return;

        /*
         * IMPORTÂNCIA ALTA: é o que faz o aviso DESCER por cima da tela. Na
         * padrão ele entra calado na barra, e aviso que ninguém vê chegar é
         * aviso que não chegou.
         */
        NotificationChannel canal = new NotificationChannel(
            CANAL,
            "Mensagens",
            NotificationManager.IMPORTANCE_HIGH
        );
        canal.setDescription("Mensagens das conversas e avisos da rede");
        canal.enableVibration(true);
        gerente.createNotificationChannel(canal);
    }

    /**
     * Tocar no aviso abre o aplicativo NA CONVERSA.
     *
     * Os extras são os que o plugin do Capacitor procura para disparar o
     * `pushNotificationActionPerformed` no sistema: `google.message_id`
     * marca que é um aviso, e o resto vira `data` — `tipo` e
     * `conversaId`, que `destinoDoPush` (pushNativo.ts) lê. Vale com o
     * aplicativo fechado também: a atividade repassa o intent de
     * abertura ao plugin.
     */
    static PendingIntent aoTocar(Context contexto, Map<String, String> dados, int id) {
        Intent abrir = new Intent(contexto, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        String mensagemId = dados.get("mensagemId");
        abrir.putExtra("google.message_id", mensagemId != null ? mensagemId : "aviso");
        abrir.putExtra("tipo", dados.get("tipo"));
        abrir.putExtra("conversaId", dados.get("conversaId"));
        return PendingIntent.getActivity(
            contexto,
            id,
            abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    static NotificationCompat.Builder base(Context contexto, Map<String, String> dados, int id) {
        garantirCanal(contexto);
        String corpo = dados.get("corpo");
        return new NotificationCompat.Builder(contexto, CANAL)
            .setSmallIcon(R.drawable.ic_stat_conecta)
            .setColor(ContextCompat.getColor(contexto, R.color.cor_conecta))
            .setContentTitle(dados.get("titulo"))
            .setContentText(corpo)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(corpo))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(aoTocar(contexto, dados, id));
    }

    static void mostrar(Context contexto, Map<String, String> dados) {
        int id = idDoAviso(dados.get("conversaId"));
        NotificationCompat.Builder aviso = base(contexto, dados, id);

        /*
         * O "RESPONDER" SÓ EXISTE QUANDO O SERVIDOR MANDOU O VALE.
         *
         * O vale é a prova de quem responde (o aparelho fechado não tem
         * sessão). Sem ele — grupo de avisos da rede, grupo só de
         * gestores — o aviso chega sem o botão, e quem pode publicar ali
         * abre o aplicativo.
         */
        String vale = dados.get("vale");
        String endereco = dados.get("respostaUrl");
        if (vale != null && endereco != null) {
            Intent responder = new Intent(contexto, RespostaRapida.class);
            responder.putExtra("vale", vale);
            responder.putExtra("respostaUrl", endereco);
            responder.putExtra("conversaId", dados.get("conversaId"));
            responder.putExtra("mensagemId", dados.get("mensagemId"));
            responder.putExtra("tipo", dados.get("tipo"));
            responder.putExtra("titulo", dados.get("titulo"));

            // O campo de texto só funciona com PendingIntent MUTÁVEL: é o
            // Android que escreve o texto digitado dentro dele
            int bandeiras = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                bandeiras |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent aoResponder = PendingIntent.getBroadcast(contexto, id, responder, bandeiras);

            RemoteInput campo = new RemoteInput.Builder(CHAVE_DO_TEXTO).setLabel("Responder").build();
            aviso.addAction(
                new NotificationCompat.Action.Builder(R.drawable.ic_stat_conecta, "Responder", aoResponder)
                    .addRemoteInput(campo)
                    .setAllowGeneratedReplies(true)
                    .build()
            );
        }

        try {
            NotificationManagerCompat.from(contexto).notify(id, aviso.build());
        } catch (SecurityException semPermissao) {
            // Notificação negada nos Ajustes: não há o que mostrar
        }
    }
}
