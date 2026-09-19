/**
 * Feriados nacionais — CONECTA / Malachias Autopeças
 *
 * Calcula os feriados do Brasil para um ano, para o RH não digitar doze
 * datas na mão todo mês de dezembro — e, principalmente, não errar uma.
 *
 * ===================================================================
 * OS MÓVEIS SAEM DA PÁSCOA
 * ===================================================================
 *
 * Carnaval, Sexta-feira Santa e Corpus Christi não têm data fixa: são
 * contados a partir do domingo de Páscoa, que por sua vez é calculado
 * pelo algoritmo de Gauss/Meeus. É a mesma conta que a Igreja usa desde
 * 1583, e vale para qualquer ano do calendário gregoriano.
 *
 * Fazer isso à mão, ano a ano, é onde o erro entra: digitar a terça de
 * Carnaval um dia adiantado faz a rede inteira acumular um débito que
 * ninguém entende.
 *
 * ===================================================================
 * O QUE NÃO ESTÁ AQUI
 * ===================================================================
 *
 * Feriado ESTADUAL e MUNICIPAL. As cinco lojas ficam em cidades
 * diferentes, e o aniversário de Pirassununga não fecha a loja de Leme.
 * Esses o RH cadastra na mão, marcando a loja — é informação que não dá
 * para calcular.
 */

/** Um feriado calculado, ainda sem virar registro do sistema. */
export interface FeriadoNacional {
  /** AAAA-MM-DD */
  data: string;
  nome: string;
  /** Meio expediente por costume, e não por lei. */
  minutosPrevistos: number;
}

const emTexto = (ano: number, mes: number, dia: number): string =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/**
 * O domingo de Páscoa daquele ano, pelo algoritmo de Meeus/Jones/Butcher.
 *
 * Os nomes das variáveis são os do algoritmo de propósito: renomeá-los
 * para algo "mais claro" só faz perder a correspondência com a fonte, e
 * ninguém consegue mais conferir se a conta está certa.
 */
export const domingoDePascoa = (ano: number): Date => {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;

  // Meio-dia: evita que fuso horário empurre a data para o dia anterior
  return new Date(ano, mes - 1, dia, 12);
};

/** Uma data deslocada em dias, devolvida como AAAA-MM-DD. */
const deslocar = (base: Date, dias: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return emTexto(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

/**
 * Os feriados nacionais do ano, em ordem de data.
 *
 * Carnaval entra como o dia inteiro de terça. A segunda de Carnaval e a
 * quarta-feira de cinzas até o meio-dia são COSTUME, não lei — se a rede
 * fechar nesses dias, o RH cadastra, porque é decisão da empresa e não
 * uma data do calendário.
 */
export const feriadosNacionaisDe = (ano: number): FeriadoNacional[] => {
  const pascoa = domingoDePascoa(ano);

  const lista: FeriadoNacional[] = [
    { data: emTexto(ano, 1, 1), nome: 'Confraternização Universal', minutosPrevistos: 0 },
    { data: deslocar(pascoa, -47), nome: 'Carnaval', minutosPrevistos: 0 },
    { data: deslocar(pascoa, -2), nome: 'Sexta-feira Santa', minutosPrevistos: 0 },
    { data: emTexto(ano, 4, 21), nome: 'Tiradentes', minutosPrevistos: 0 },
    { data: emTexto(ano, 5, 1), nome: 'Dia do Trabalho', minutosPrevistos: 0 },
    { data: deslocar(pascoa, 60), nome: 'Corpus Christi', minutosPrevistos: 0 },
    { data: emTexto(ano, 9, 7), nome: 'Independência do Brasil', minutosPrevistos: 0 },
    { data: emTexto(ano, 10, 12), nome: 'Nossa Senhora Aparecida', minutosPrevistos: 0 },
    { data: emTexto(ano, 11, 2), nome: 'Finados', minutosPrevistos: 0 },
    { data: emTexto(ano, 11, 15), nome: 'Proclamação da República', minutosPrevistos: 0 },
    { data: emTexto(ano, 11, 20), nome: 'Consciência Negra', minutosPrevistos: 0 },
    { data: emTexto(ano, 12, 25), nome: 'Natal', minutosPrevistos: 0 },
  ];

  return lista.sort((a, b) => a.data.localeCompare(b.data));
};
