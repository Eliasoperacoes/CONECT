package br.com.malachiasautopecas.conecta;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
