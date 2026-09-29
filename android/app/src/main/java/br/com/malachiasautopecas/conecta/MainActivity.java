package br.com.malachiasautopecas.conecta;

import android.graphics.Color;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle estado) {
        /*
         * A JANELA OCUPA A TELA INTEIRA EM TODO ANDROID, e não só do 15
         * para cima.
         *
         * O Capacitor 8 foi feito para esse modo: ele mesmo recua a página
         * das barras e do teclado. No Android 14 ou anterior a janela não
         * ocupava a tela inteira, então o recuo do teclado era somado a um
         * ajuste que o próprio sistema já tinha feito — a faixa vazia entre
         * a barra de mensagem e o teclado.
         *
         * Barras TRANSPARENTES, e não o véu padrão do EdgeToEdge: atrás
         * delas aparece o fundo da janela, que o `Barras` pinta com a cor
         * do tema do CONECTA. Um véu por cima estragaria essa cor.
         */
        SystemBarStyle transparente = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT);
        EdgeToEdge.enable(this, transparente, transparente);

        // Plugins do próprio app entram ANTES do super, que monta a ponte
        registerPlugin(Barras.class);
        super.onCreate(estado);
    }

    /**
     * O CONECTA ESTÁ NA TELA AGORA?
     *
     * Com o aplicativo à vista, o aviso não desce por cima: a mensagem
     * aparece na própria conversa, e o sino conta. Uma tarja avisando de
     * algo que está a um toque dali é só um susto — a mesma regra do
     * aviso do navegador.
     *
     * Quem pergunta é o `ServicoDeAvisos`, que roda no mesmo processo.
     * Com o processo morto o valor volta a ser falso, que é o certo: o
     * aplicativo fechado não está na tela.
     */
    static volatile boolean naTela = false;

    @Override
    public void onResume() {
        super.onResume();
        naTela = true;
    }

    @Override
    public void onPause() {
        naTela = false;
        super.onPause();
    }
}
