/**
 * A SAUDAÇÃO DO INÍCIO — "Bom dia, Fernanda" e a data por extenso.
 *
 * Pedido do Elias (05/10/2026): o Início do computador abre cumprimentando
 * a pessoa pelo horário. Sem tela aqui: entra a hora, sai o texto.
 */

/** Bom dia até o meio-dia; boa tarde até as 18h; boa noite depois. */
export const saudacaoDaHora = (hora: number): string =>
  hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';

/** O primeiro nome, com maiúscula só no começo: "FERNANDA METZNER" → "Fernanda". */
export const primeiroNome = (nome: string): string => {
  const primeiro = nome.trim().split(/\s+/)[0] || '';
  return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR');
};

/** "Segunda-feira, 5 de outubro" — o dia de hoje, no fuso de Brasília. */
export const dataPorExtenso = (quando: Date): string => {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(quando);
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
};

/** A hora de agora em Brasília, para a saudação não depender do relógio do aparelho. */
export const horaDeBrasilia = (quando: Date): number =>
  Number(
    new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(quando)
  ) % 24;
