package br.com.malachiasautopecas.conecta;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Shader;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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
 * resposta, não empilha mensagens e não agrupa conversas. O servidor
 * (enviar-aviso) manda SÓ DADOS, e este serviço monta o aviso.
 *
 * ===================================================================
 * COMO O WHATSAPP
 * ===================================================================
 *
 *   · cada conversa é UM aviso, e as mensagens se EMPILHAM nele
 *     (MessagingStyle) — "Fabio: chegou a peça", "Fabio: já separei";
 *   · com duas conversas ou mais, um aviso PRINCIPAL resume tudo:
 *     "4 mensagens de 2 conversas", com as conversas dentro dele;
 *   · o cabeçalho diz "Malachias" — é o nome do aplicativo para o
 *     Android (strings.xml, `app_name`); o ícone na tela inicial
 *     continua "CONECTA" (`title_activity_main`).
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

    /**
     * O canal dos avisos: o mesmo id do AndroidManifest.
     *
     * Era "mensagens", com o som padrão do celular. O Android não deixa
     * trocar o som de um canal que já existe — então o som do CONECTA veio
     * num canal novo, e os antigos são apagados em `garantirCanal`.
     *
     * O NÚMERO ACOMPANHA O SOM: trocou o som (somDoAviso.ts), sobe o número
     * e põe o anterior em CANAIS_ANTIGOS — senão o celular que já tem o
     * canal continua tocando o som velho. O "_2" é o som mais grave, depois
     * de o Elias achar o primeiro "estourado".
     */
    static final String CANAL = "avisos_conecta_2";

    /** Os canais de antes, que saem para não ficarem duplicados nas configurações. */
    static final String[] CANAIS_ANTIGOS = { "mensagens", "avisos_conecta" };

    /** A chave do texto digitado no campo "Responder". */
    static final String CHAVE_DO_TEXTO = "texto_digitado";

    /** O grupo que junta as conversas sob o aviso principal. */
    static final String GRUPO = "conecta_conversas";

    /** O id do aviso principal. Nenhuma conversa tem hash igual a este. */
    static final int ID_DO_RESUMO = Integer.MIN_VALUE + 7;

    /**
     * O que vem do servidor e viaja junto com o aviso (até o "Responder").
     * Uma lista só: o que o serviço lê é o que o receptor devolve.
     */
    static final String[] CHAVES = {
        "tipo", "conversaId", "mensagemId", "remetente", "texto", "conversa", "ehGrupo", "vale", "respostaUrl",
    };

    /** Quem está com o aparelho: as respostas dele aparecem como "Você". */
    static final Person EU = new Person.Builder().setName("Você").build();

    /**
     * O canal do COMPROVANTE DE BATIDA: calado (sem som, sem descer por
     * cima da tela). A pessoa acabou de bater o ponto com o celular na mão;
     * o aviso é o recibo dela na barra, não um chamado.
     */
    static final String CANAL_COMPROVANTE = "comprovantes";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage mensagem) {
        super.onMessageReceived(mensagem);

        Map<String, String> dados = mensagem.getData();
        if (!dados.containsKey("remetente")) return;

        // O comprovante fica na barra MESMO com o CONECTA na tela: é o recibo da batida
        if ("comprovante".equals(dados.get("tipo"))) {
            publicarComprovante(this, new HashMap<>(dados));
            return;
        }

        // Com o CONECTA na tela, a conversa já mostra a mensagem
        if (MainActivity.naTela) return;

        // A foto de quem mandou, como no WhatsApp; sem ela (ou sem rede), o aviso sai igual
        Bitmap foto = baixarFoto(dados.get("foto"));

        NotificationCompat.MessagingStyle estilo = estiloAtual(this, idDoAviso(dados.get("conversaId")));
        Person.Builder quem = new Person.Builder().setName(dados.get("remetente")).setKey(dados.get("remetente"));
        if (foto != null) quem.setIcon(IconCompat.createWithBitmap(foto));
        estilo.addMessage(dados.get("texto"), System.currentTimeMillis(), quem.build());

        publicar(this, new HashMap<>(dados), estilo, false, foto);
    }

    /** O lado da foto no aviso, em pixels: o Android a mostra pequena. */
    static final int LADO_DA_FOTO = 192;

    /**
     * BAIXA A FOTO DE QUEM MANDOU (enviar-aviso, `?foto=`), já redonda.
     *
     * O aviso do Firebase leva no máximo 4 KB e a foto tem até 60 KB: vem
     * só o endereço, assinado e com prazo. Este método roda fora da tela
     * principal (o serviço do Firebase tem a sua linha), então pode
     * esperar a rede — mas pouco: 4 segundos, e o aviso sai sem foto.
     */
    @Nullable
    static Bitmap baixarFoto(@Nullable String endereco) {
        if (endereco == null || !endereco.startsWith("https://")) return null;
        HttpURLConnection conexao = null;
        try {
            conexao = (HttpURLConnection) new URL(endereco).openConnection();
            conexao.setConnectTimeout(4000);
            conexao.setReadTimeout(4000);
            conexao.setInstanceFollowRedirects(true);
            if (conexao.getResponseCode() != 200) return null;
            Bitmap original;
            try (InputStream entrada = conexao.getInputStream()) {
                original = BitmapFactory.decodeStream(entrada);
            }
            if (original == null) return null;
            return redonda(original);
        } catch (Exception semFoto) {
            return null;
        } finally {
            if (conexao != null) conexao.disconnect();
        }
    }

    /** O meio da foto, quadrado, recortado em círculo. */
    static Bitmap redonda(Bitmap original) {
        int lado = Math.min(original.getWidth(), original.getHeight());
        int x = (original.getWidth() - lado) / 2;
        int y = (original.getHeight() - lado) / 2;
        Bitmap quadrada = Bitmap.createScaledBitmap(Bitmap.createBitmap(original, x, y, lado, lado), LADO_DA_FOTO, LADO_DA_FOTO, true);

        Bitmap saida = Bitmap.createBitmap(LADO_DA_FOTO, LADO_DA_FOTO, Bitmap.Config.ARGB_8888);
        Canvas tela = new Canvas(saida);
        Paint pincel = new Paint(Paint.ANTI_ALIAS_FLAG);
        pincel.setShader(new BitmapShader(quadrada, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        float raio = LADO_DA_FOTO / 2f;
        tela.drawCircle(raio, raio, raio, pincel);
        return saida;
    }

    /**
     * O COMPROVANTE DE BATIDA na barra: calado, um por batida, e o toque
     * abre aquele comprovante (`destinoDoPush`, tipo "comprovante"). Fica
     * fora do grupo das conversas — não é mensagem, e não entra na conta
     * do "4 mensagens de 2 conversas".
     */
    static void publicarComprovante(Context contexto, Map<String, String> dados) {
        garantirCanalDoComprovante(contexto);
        int id = idDoAviso(dados.get("conversaId"));
        Notification aviso = new NotificationCompat.Builder(contexto, CANAL_COMPROVANTE)
            .setSmallIcon(R.drawable.ic_stat_conecta)
            .setColor(ContextCompat.getColor(contexto, R.color.cor_conecta))
            .setContentTitle(dados.get("conversa"))
            .setContentText(dados.get("texto"))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(dados.get("texto")))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(aoTocar(contexto, dados, id))
            .build();
        try {
            NotificationManagerCompat.from(contexto).notify(id, aviso);
        } catch (SecurityException semPermissao) {
            // Notificação negada nos Ajustes
        }
    }

    static void garantirCanalDoComprovante(Context contexto) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager gerente = contexto.getSystemService(NotificationManager.class);
        if (gerente == null || gerente.getNotificationChannel(CANAL_COMPROVANTE) != null) return;
        NotificationChannel canal = new NotificationChannel(
            CANAL_COMPROVANTE, "Comprovantes de batida", NotificationManager.IMPORTANCE_LOW
        );
        canal.setDescription("O recibo de cada batida de ponto, com NSR e código de verificação");
        gerente.createNotificationChannel(canal);
    }

    /** Um aviso por conversa: a mensagem nova se junta às anteriores. */
    static int idDoAviso(String conversaId) {
        return conversaId == null ? 0 : conversaId.hashCode();
    }

    /**
     * As mensagens que JÁ ESTÃO no aviso desta conversa, para a nova se
     * empilhar em cima delas. Aviso apagado ou tocado some da barra — e aí
     * a conversa recomeça do zero, como no WhatsApp.
     */
    static NotificationCompat.MessagingStyle estiloAtual(Context contexto, int id) {
        StatusBarNotification ativo = avisoAtivo(contexto, id);
        if (ativo != null) {
            NotificationCompat.MessagingStyle existente =
                NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(ativo.getNotification());
            if (existente != null) return existente;
        }
        return new NotificationCompat.MessagingStyle(EU);
    }

    @Nullable
    static StatusBarNotification avisoAtivo(Context contexto, int id) {
        for (StatusBarNotification s : avisosAtivos(contexto)) {
            if (s.getId() == id) return s;
        }
        return null;
    }

    static List<StatusBarNotification> avisosAtivos(Context contexto) {
        List<StatusBarNotification> lista = new ArrayList<>();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return lista;
        NotificationManager gerente = contexto.getSystemService(NotificationManager.class);
        if (gerente == null) return lista;
        for (StatusBarNotification s : gerente.getActiveNotifications()) lista.add(s);
        return lista;
    }

    static void garantirCanal(Context contexto) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager gerente = contexto.getSystemService(NotificationManager.class);
        if (gerente == null) return;

        for (String antigo : CANAIS_ANTIGOS) {
            if (gerente.getNotificationChannel(antigo) != null) gerente.deleteNotificationChannel(antigo);
        }
        if (gerente.getNotificationChannel(CANAL) != null) return;

        /*
         * IMPORTÂNCIA ALTA: é o que faz o aviso DESCER por cima da tela. Na
         * padrão ele entra calado na barra, e aviso que ninguém vê chegar é
         * aviso que não chegou.
         */
        NotificationChannel canal = new NotificationChannel(CANAL, "Mensagens", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Mensagens das conversas e avisos da rede");
        canal.enableVibration(true);

        /*
         * O SOM DO CONECTA: os dois sinos que o navegador também toca. O
         * arquivo é gerado da mesma receita (scripts/gerar-som-do-aviso.ts),
         * então o aviso soa igual no computador e no celular.
         */
        Uri som = Uri.parse("android.resource://" + contexto.getPackageName() + "/" + R.raw.aviso_conecta);
        AudioAttributes uso = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        canal.setSound(som, uso);

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
        return PendingIntent.getActivity(contexto, id, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Desenha (ou redesenha) o aviso de uma conversa com as mensagens de
     * `estilo`, e em seguida o aviso principal.
     *
     * @param silencioso redesenho depois de uma resposta: não toca de novo
     */
    static void publicar(Context contexto, Map<String, String> dados, NotificationCompat.MessagingStyle estilo, boolean silencioso) {
        publicar(contexto, dados, estilo, silencioso, null);
    }

    /** @param foto a de quem mandou, já redonda; na conversa individual vira o ícone grande */
    static void publicar(
        Context contexto,
        Map<String, String> dados,
        NotificationCompat.MessagingStyle estilo,
        boolean silencioso,
        @Nullable Bitmap foto
    ) {
        garantirCanal(contexto);
        int id = idDoAviso(dados.get("conversaId"));
        boolean ehGrupo = "true".equals(dados.get("ehGrupo"));

        // Em grupo o título é o grupo, e cada linha diz quem falou
        if (ehGrupo) {
            estilo.setConversationTitle(dados.get("conversa"));
            estilo.setGroupConversation(true);
        }

        NotificationCompat.Builder aviso = new NotificationCompat.Builder(contexto, CANAL)
            .setSmallIcon(R.drawable.ic_stat_conecta)
            .setColor(ContextCompat.getColor(contexto, R.color.cor_conecta))
            .setContentTitle(ehGrupo ? dados.get("conversa") : dados.get("remetente"))
            .setContentText(dados.get("texto"))
            .setStyle(estilo)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setOnlyAlertOnce(silencioso)
            .setGroup(GRUPO)
            // Quem toca e vibra são as conversas, não o resumo: sem isto o
            // aparelho avisaria duas vezes a mesma mensagem
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setContentIntent(aoTocar(contexto, dados, id));

        // No grupo, a foto de cada um vai na linha dele (Person); o ícone grande seria de um só
        if (foto != null && !ehGrupo) aviso.setLargeIcon(foto);

        acrescentarResponder(contexto, aviso, dados, id);

        try {
            NotificationManagerCompat.from(contexto).notify(id, aviso.build());
        } catch (SecurityException semPermissao) {
            return; // Notificação negada nos Ajustes: não há o que mostrar
        }

        atualizarResumo(contexto);
    }

    /**
     * O "RESPONDER" SÓ EXISTE QUANDO O SERVIDOR MANDOU O VALE.
     *
     * O vale é a prova de quem responde (o aparelho fechado não tem
     * sessão). Sem ele — grupo de avisos da rede, grupo só de gestores —
     * o aviso chega sem o botão, e quem pode publicar ali abre o
     * aplicativo.
     */
    static void acrescentarResponder(Context contexto, NotificationCompat.Builder aviso, Map<String, String> dados, int id) {
        if (dados.get("vale") == null || dados.get("respostaUrl") == null) return;

        Intent responder = new Intent(contexto, RespostaRapida.class);
        for (String chave : CHAVES) responder.putExtra(chave, dados.get(chave));

        // O campo de texto só funciona com PendingIntent MUTÁVEL: é o
        // Android que escreve o texto digitado dentro dele
        int bandeiras = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) bandeiras |= PendingIntent.FLAG_MUTABLE;
        PendingIntent aoResponder = PendingIntent.getBroadcast(contexto, id, responder, bandeiras);

        RemoteInput campo = new RemoteInput.Builder(CHAVE_DO_TEXTO).setLabel("Responder").build();
        aviso.addAction(
            new NotificationCompat.Action.Builder(R.drawable.ic_stat_conecta, "Responder", aoResponder)
                .addRemoteInput(campo)
                .setAllowGeneratedReplies(true)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                .build()
        );
    }

    /**
     * O AVISO PRINCIPAL: "4 mensagens de 2 conversas".
     *
     * Só existe com DUAS conversas ou mais — com uma só, ele repetiria a
     * própria conversa em cima dela. A contagem sai dos avisos que estão
     * na barra agora, e não de um contador guardado: aviso que a pessoa
     * apagou sai da conta sozinho.
     */
    static void atualizarResumo(Context contexto) {
        List<StatusBarNotification> conversas = new ArrayList<>();
        for (StatusBarNotification s : avisosAtivos(contexto)) {
            if (s.getId() != ID_DO_RESUMO && GRUPO.equals(s.getNotification().getGroup())) conversas.add(s);
        }

        if (conversas.size() < 2) {
            NotificationManagerCompat.from(contexto).cancel(ID_DO_RESUMO);
            return;
        }

        NotificationCompat.InboxStyle lista = new NotificationCompat.InboxStyle();
        int mensagens = 0;
        for (StatusBarNotification s : conversas) {
            NotificationCompat.MessagingStyle estilo =
                NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(s.getNotification());
            if (estilo == null) continue;

            List<NotificationCompat.MessagingStyle.Message> linhas = estilo.getMessages();
            NotificationCompat.MessagingStyle.Message ultima = null;
            for (NotificationCompat.MessagingStyle.Message m : linhas) {
                // As respostas da própria pessoa não contam como recebidas
                if (m.getPerson() != null) {
                    mensagens++;
                    ultima = m;
                }
            }
            if (ultima != null && ultima.getPerson() != null) {
                lista.addLine(ultima.getPerson().getName() + ": " + ultima.getText());
            }
        }

        String resumo = (mensagens == 1 ? "1 mensagem" : mensagens + " mensagens") + " de " + conversas.size() + " conversas";
        lista.setSummaryText(resumo);

        Intent abrir = new Intent(contexto, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent aoTocar = PendingIntent.getActivity(
            contexto, ID_DO_RESUMO, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification principal = new NotificationCompat.Builder(contexto, CANAL)
            .setSmallIcon(R.drawable.ic_stat_conecta)
            .setColor(ContextCompat.getColor(contexto, R.color.cor_conecta))
            .setContentTitle(resumo)
            .setContentText(resumo)
            .setSubText(resumo)
            .setStyle(lista)
            .setGroup(GRUPO)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setAutoCancel(true)
            .setContentIntent(aoTocar)
            .build();

        try {
            NotificationManagerCompat.from(contexto).notify(ID_DO_RESUMO, principal);
        } catch (SecurityException semPermissao) {
            // Notificação negada nos Ajustes
        }
    }
}
