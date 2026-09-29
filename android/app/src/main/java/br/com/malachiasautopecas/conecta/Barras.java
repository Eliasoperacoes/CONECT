package br.com.malachiasautopecas.conecta;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A COR ATRÁS DAS BARRAS DO ANDROID segue o tema do CONECTA.
 *
 * Em boa parte dos aparelhos o Capacitor encolhe o WebView para não
 * ficar embaixo da barra de status e da barra de navegação. O que
 * aparece nessas faixas é o fundo da JANELA, e não a página — e o fundo
 * da janela é fixo no tema Android (branco, para a abertura).
 *
 * Resultado: tema escuro no CONECTA, faixas brancas estourando em cima
 * e embaixo. E com o celular no modo escuro, os ícones da barra (hora,
 * bateria, avisos) saíam brancos sobre o branco — sumiam.
 *
 * O sistema chama `pintar` com a cor do próprio tema sempre que ele
 * muda (`acompanharTemaNasBarras`, aplicativo.ts). A cor dos ícones fica
 * com o SystemBars do Capacitor, que já sabe fazer isso.
 */
@CapacitorPlugin(name = "Barras")
public class Barras extends Plugin {

    @PluginMethod
    public void pintar(PluginCall chamada) {
        String cor = chamada.getString("cor");
        if (cor == null) {
            chamada.reject("Falta a cor.");
            return;
        }

        final int valor;
        try {
            valor = Color.parseColor(cor);
        } catch (IllegalArgumentException invalida) {
            chamada.reject("Cor inválida: " + cor);
            return;
        }

        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(valor);
            chamada.resolve();
        });
    }
}
