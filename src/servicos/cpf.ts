/**
 * O CPF DO COLABORADOR — a identificação do trabalhador no comprovante de
 * cada batida (Portaria MTP 671/2021).
 *
 * Pedido do Elias (06/10/2026): no primeiro acesso, a pessoa cria a senha
 * E informa o CPF, obrigatoriamente. A conta dos dígitos verificadores mora
 * aqui (a tela avisa na hora) e no banco (`registrar_meu_cpf`), que é a que
 * vale — a tela se contorna; o banco, não.
 */

/** Só os dígitos: "123.456.789-09" → "12345678909". */
export const limparCpf = (texto: string): string => (texto || '').replace(/\D/g, '');

/** "12345678909" → "123.456.789-09"; incompleto, formata o que houver. */
export const formatarCpf = (texto: string): string => {
  const d = limparCpf(texto).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
};

/**
 * O CPF existe? Onze dígitos, não todos iguais ("111.111.111-11" passa na
 * conta e não é de ninguém), e os dois dígitos verificadores certos.
 */
export const cpfValido = (texto: string): boolean => {
  const d = limparCpf(texto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
};

/** "123.***.***-09": o CPF à vista sem expor o número inteiro na tela. */
export const cpfMascarado = (texto: string): string => {
  const d = limparCpf(texto);
  return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : '';
};
