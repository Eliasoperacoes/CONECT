package br.com.malachiasautopecas.conecta;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * O "RESPONDER" DA NOTIFICAÇÃO — envia sem abrir o aplicativo.
 *
 * O texto vai para a função `enviar-aviso` junto com o VALE que veio no
 * aviso. O vale diz quem responde e em que conversa, assinado pelo
 * servidor: o aparelho não guarda senha nem sessão de ninguém. A função
 * grava a mensagem, marca como lida a que foi respondida e avisa os
 * outros participantes — pelo mesmo caminho de qualquer mensagem.
 *
 * DEPOIS DE ENVIAR, O AVISO PRECISA SER REDESENHADO. Sem isso o Android
 * deixa o campo de resposta girando para sempre, e a pessoa não sabe se
 * foi.
 */
public class RespostaRapida extends BroadcastReceiver {

    @Override
    public void onReceive(Context contexto, Intent intent) {
        Bundle digitado = RemoteInput.getResultsFromIntent(intent);
        if (digitado == null) return;
        CharSequence texto = digitado.getCharSequence(ServicoDeAvisos.CHAVE_DO_TEXTO);
        if (texto == null || texto.toString().trim().isEmpty()) return;

        final String vale = intent.getStringExtra("vale");
        final String endereco = intent.getStringExtra("respostaUrl");
        final String resposta = texto.toString().trim();

        final Map<String, String> dados = new HashMap<>();
        dados.put("conversaId", intent.getStringExtra("conversaId"));
        dados.put("mensagemId", intent.getStringExtra("mensagemId"));
        dados.put("tipo", intent.getStringExtra("tipo"));
        dados.put("titulo", intent.getStringExtra("titulo"));

        // A rede não pode rodar na linha principal; `goAsync` mantém o
        // receptor vivo até a resposta do servidor
        final PendingResult pendente = goAsync();
        final Context app = contexto.getApplicationContext();

        new Thread(() -> {
            boolean enviou = false;
            try {
                enviou = enviar(endereco, vale, resposta);
            } catch (Exception falha) {
                enviou = false;
            } finally {
                redesenhar(app, dados, resposta, enviou);
                pendente.finish();
            }
        }).start();
    }

    private static boolean enviar(String endereco, String vale, String texto) throws Exception {
        if (endereco == null || vale == null) return false;

        HttpURLConnection conexao = (HttpURLConnection) new URL(endereco).openConnection();
        conexao.setRequestMethod("POST");
        conexao.setConnectTimeout(15000);
        conexao.setReadTimeout(15000);
        conexao.setDoOutput(true);
        conexao.setRequestProperty("Content-Type", "application/json; charset=utf-8");

        JSONObject corpo = new JSONObject();
        corpo.put("vale", vale);
        corpo.put("texto", texto);

        try (OutputStream saida = conexao.getOutputStream()) {
            saida.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
        }

        int codigo = conexao.getResponseCode();
        conexao.disconnect();
        return codigo >= 200 && codigo < 300;
    }

    private static void redesenhar(Context contexto, Map<String, String> dados, String texto, boolean enviou) {
        int id = ServicoDeAvisos.idDoAviso(dados.get("conversaId"));

        if (enviou) {
            dados.put("corpo", "Você: " + texto);
        } else {
            // Falhou: o texto não se perde da vista, e o toque abre a conversa
            dados.put("corpo", "Não foi enviada: \"" + texto + "\". Toque para abrir a conversa.");
        }

        NotificationCompat.Builder aviso = ServicoDeAvisos.base(contexto, dados, id).setOnlyAlertOnce(true);

        // Enviada, o aviso some sozinho em instantes: o assunto terminou
        if (enviou) aviso.setTimeoutAfter(4000);

        try {
            NotificationManagerCompat.from(contexto).notify(id, aviso.build());
        } catch (SecurityException semPermissao) {
            // Notificação negada nos Ajustes
        }
    }
}
