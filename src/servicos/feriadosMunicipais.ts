/**
 * Feriados municipais e estaduais — CONECTA / Malachias Autopeças
 *
 * O que fecha em CADA cidade, calculado para qualquer ano.
 *
 * ===================================================================
 * POR QUE ISTO É UMA TABELA, E NÃO UMA CONSULTA A ALGUM SERVIÇO
 * ===================================================================
 *
 * Feriado municipal é fixado por lei da câmara de cada cidade. Não existe
 * base nacional oficial que os reúna, e os sites que listam divergem
 * entre si — dá para conferir dois e achar datas diferentes para a mesma
 * cidade.
 *
 * Depender de um serviço externo para isso seria trocar um trabalho
 * manual por uma dependência que pode mudar de resposta, sair do ar ou
 * simplesmente errar — e o erro aqui não é cosmético: é a loja aberta num
 * dia em que devia estar fechada, ou 8h10 cobradas de todo mundo num dia
 * em que ninguém trabalhou.
 *
 * Então é tabela, aqui, versionada junto com o código. Para quem usa o
 * sistema é automático do mesmo jeito: ninguém digita nada, nunca, e o
 * ano que vem já vem pronto. O que muda é que a data sai de uma linha
 * conferida, e não do que um site respondeu naquele segundo.
 *
 * ===================================================================
 * COMO ACRESCENTAR OU CORRIGIR
 * ===================================================================
 *
 * Mexa em `POR_CIDADE`, e só. Cada entrada é dia e mês fixos — todos os
 * daqui são de data fixa, ao contrário dos nacionais móveis que seguem a
 * Páscoa. Se alguma cidade criar um feriado móvel, ele entra como os
 * nacionais, em `feriadosNacionais.ts`.
 *
 * As datas abaixo foram levantadas em setembro de 2026 e precisam do
 * aval de quem vê a loja fechar: é o calendário da empresa que manda, e
 * não a internet.
 */

import { Loja } from '../tipos';

export interface FeriadoLocal {
  /** AAAA-MM-DD */
  data: string;
  nome: string;
  /** Zero fecha o dia. Meio expediente entra com os minutos dele. */
  minutosPrevistos: number;
  /** De onde veio, para quem for conferir depois. */
  origem: 'municipal' | 'estadual';
}

interface DataFixa {
  dia: number;
  mes: number;
  nome: string;
  minutosPrevistos?: number;
}

/**
 * VALE PARA TODAS AS LOJAS: as cinco ficam em São Paulo.
 *
 * A Consciência Negra NÃO está aqui: virou feriado NACIONAL pela Lei
 * 14.759/2023, e já está na tabela nacional. Repetir criaria dois
 * feriados no mesmo dia, e o de loja venceria o nacional sem motivo.
 */
const ESTADUAIS_SP: DataFixa[] = [
  { dia: 9, mes: 7, nome: 'Revolução Constitucionalista' },
];

/**
 * Por CIDADE, e não por loja: é a cidade que tem feriado.
 *
 * A ligação loja → cidade já existe em `INFORMACOES_LOJAS`, e é de lá
 * que ela sai — repetir o endereço da loja aqui seria a mesma coisa
 * escrita em dois lugares, que é como as telas deste sistema já passaram
 * a discordar quatro vezes.
 */
const POR_CIDADE: Record<string, DataFixa[]> = {
  'Pirassununga - SP': [
    { dia: 6, mes: 8, nome: 'Aniversário de Pirassununga' },
    { dia: 8, mes: 12, nome: 'Piracema' },
  ],
  'Porto Ferreira - SP': [
    { dia: 20, mes: 1, nome: 'São Sebastião' },
    { dia: 29, mes: 7, nome: 'Aniversário de Porto Ferreira' },
  ],
  'Santa Cruz das Palmeiras - SP': [
    { dia: 3, mes: 5, nome: 'Aniversário de Santa Cruz das Palmeiras' },
  ],
  'Descalvado - SP': [
    { dia: 8, mes: 9, nome: 'Aniversário de Descalvado' },
  ],
  'Santa Rita do Passa Quatro - SP': [
    { dia: 22, mes: 5, nome: 'Aniversário de Santa Rita do Passa Quatro' },
  ],
};

const emTexto = (ano: number, mes: number, dia: number): string =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

const montar = (
  ano: number,
  itens: DataFixa[],
  origem: FeriadoLocal['origem']
): FeriadoLocal[] =>
  itens.map((f) => ({
    data: emTexto(ano, f.mes, f.dia),
    nome: f.nome,
    minutosPrevistos: f.minutosPrevistos ?? 0,
    origem,
  }));

/**
 * Tudo o que fecha naquela cidade naquele ano — estadual e municipal.
 *
 * Cidade desconhecida devolve só os estaduais em vez de lista vazia: uma
 * loja nova em cidade ainda não mapeada continua respeitando o 9 de
 * julho, que é o mínimo correto. O que ela perde é o feriado da cidade
 * dela — e isso aparece na conferência, não some calado.
 */
export const feriadosLocaisDe = (ano: number, cidade?: string): FeriadoLocal[] => {
  const municipais = cidade ? POR_CIDADE[cidade] || [] : [];

  return [
    ...montar(ano, ESTADUAIS_SP, 'estadual'),
    ...montar(ano, municipais, 'municipal'),
  ].sort((a, b) => a.data.localeCompare(b.data));
};

/** As cidades que têm calendário próprio aqui. Serve para conferência. */
export const cidadesMapeadas = (): string[] => Object.keys(POR_CIDADE);

/**
 * A cidade de uma loja.
 *
 * Mora aqui a conversão loja → cidade porque é este arquivo que precisa
 * dela; `INFORMACOES_LOJAS` continua sendo a fonte do endereço.
 */
export const cidadeDaLoja = (
  loja: Loja | undefined,
  lojas: Array<{ nome: string; cidade: string }>
): string | undefined => {
  if (!loja) return undefined;
  return lojas.find((l) => l.nome === loja)?.cidade;
};
