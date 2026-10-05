/**
 * A TELA ESTÁ DENTRO DA ESTRUTURA DO COMPUTADOR?
 *
 * No computador, toda tela abre sob o cabeçalho padrão (ConteudoWeb): o
 * título do assunto, as abas e o título e a frase da própria tela. As telas
 * de hoje traziam cada uma o seu título e a sua margem — o título aparecia
 * duas vezes, e nada alinhava (Elias, 05/10/2026: "tudo muito
 * despadronizado").
 *
 * Embutida, a tela esconde só o PRÓPRIO TÍTULO (as ações dela, como
 * "Registrar" e "Imprimir", ficam) e usa a margem padrão, a mesma de todas.
 * No celular ninguém avisa nada, e cada tela segue como sempre foi.
 */
import { createContext, useContext } from 'react';

export const ContextoTelaEmbutida = createContext(false);

/** A tela está dentro da estrutura do computador? */
export const useTelaEmbutida = (): boolean => useContext(ContextoTelaEmbutida);

/**
 * A margem de fora da tela: a dela no celular; embutida, a padrão — alinhada
 * ao título da estrutura (`px-8` = os `px-2` da área + `px-6` daqui).
 */
export const margemDaTela = (embutida: boolean, propria = 'p-4 sm:p-6'): string =>
  embutida ? 'px-6 pt-5 pb-6' : propria;
