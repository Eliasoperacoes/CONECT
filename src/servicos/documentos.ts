/**
 * CNPJ — CONECTA / Malachias Autopeças
 *
 * O grupo tem mais de um CNPJ, e o colaborador nem sempre está registrado no
 * da loja onde trabalha. Por isso o CNPJ é dado da pessoa, não da unidade.
 *
 * A conferência dos dígitos existe para o erro aparecer na hora da carga da
 * planilha, e não meses depois num documento trabalhista: um número trocado
 * passa despercebido na tela, mas não passa no cálculo.
 */

/** Só os 14 dígitos, sem pontuação. */
export const apenasDigitosCnpj = (valor: string): string =>
  (valor || '').replace(/\D/g, '').slice(0, 14);

/** 12345678000190 -> 12.345.678/0001-90 */
export const formatarCnpj = (valor: string): string => {
  const d = apenasDigitosCnpj(valor);
  if (d.length !== 14) return valor || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

/** Dígito verificador pelo módulo 11, com os pesos oficiais. */
const digitoVerificador = (base: string, pesos: number[]): number => {
  const soma = base
    .split('')
    .reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
};

/**
 * O número fecha? Confere os dois dígitos verificadores.
 *
 * Recusa também os repetidos (11.111.111/1111-11): eles passam no cálculo
 * por coincidência matemática, mas não existem como empresa — e são
 * justamente o que alguém digita para "preencher o campo".
 */
export const cnpjEhValido = (valor: string): boolean => {
  /**
   * Conta os dígitos ANTES de cortar em 14. Se cortasse primeiro, um número
   * com 15 dígitos — dedo pesado no teclado — viraria um CNPJ válido pelo
   * acaso dos 14 primeiros, e o erro entraria calado.
   */
  const d = (valor || '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const primeiro = digitoVerificador(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (primeiro !== Number(d[12])) return false;

  const segundo = digitoVerificador(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return segundo === Number(d[13]);
};
