/**
 * A TELA DE ESPERA — CONECTA / Malachias Autopeças
 *
 * O desenho e a animação moram no `index.html`, para aparecerem antes de
 * o pacote do sistema baixar. Aqui só se decide QUANDO ela sai.
 *
 * Sai com um esmaecer curto, e não de uma vez: o losango sumindo seco e
 * a tela de login surgindo por baixo parece um piscar, que é o que a
 * tela de espera existe para evitar.
 */

/** O tempo do esmaecer, igual ao `transition` do `#espera` no index.html. */
const DURACAO_SAIDA_MS = 350;

export const encerrarEspera = (): void => {
  if (typeof document === 'undefined') return;

  const espera = document.getElementById('espera');
  if (!espera || espera.classList.contains('saindo')) return;

  espera.classList.add('saindo');
  window.setTimeout(() => espera.remove(), DURACAO_SAIDA_MS);
};
