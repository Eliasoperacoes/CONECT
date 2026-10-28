/**
 * A LEITURA REPETIDA DO QR — o que a tela diz (Elias, 29/10/2026).
 *
 * Até 2 minutos depois da anterior, a leitura não avança a jornada
 * (`registrar_marcacao`, 'repetida'): fica guardada, com NSR, porque a
 * Portaria não deixa recusar. A tela dizia "Marcação registrada e enviada
 * ao RH", em amarelo — e quem lia achava que tinha dado errado e lia de
 * novo. No primeiro dia de todos, 13 leituras assim; uma pessoa, quatro.
 *
 * O que a pessoa precisa saber é que o ponto dela JÁ está batido, e a que
 * horas. É isso que vem em destaque.
 */
import { RegistroPonto, ROTULO_MARCACAO } from '../tipos';

/** A batida da jornada que a leitura repetida repetiu: a última antes dela. */
export const aBatidaQueValeu = (
  doDia: RegistroPonto[],
  repetida: { horario: string }
): RegistroPonto | undefined =>
  // Como data, e não como texto: o banco escreve "+00:00", o comprovante "Z"
  [...doDia]
    .filter((r) => Date.parse(r.horario) <= Date.parse(repetida.horario))
    .sort((a, b) => Date.parse(b.horario) - Date.parse(a.horario))[0];

/** Sem concordar com o rótulo: "Saída" e "Retorno" pediriam gêneros. */
export const textoDaRepetida = (valeu: RegistroPonto | undefined): { titulo: string; detalhe: string } => ({
  titulo: 'Você já tinha batido o ponto',
  detalhe: `${valeu ? `${ROTULO_MARCACAO[valeu.tipo]} às ${valeu.horaFormatada}. ` : ''}Esta leitura repetida fica guardada no seu registro e não muda o seu ponto.`,
});
