/**
 * FERRAMENTAS INTERNAS — os aplicativos do CONECTA, em blocos (Elias,
 * 20/10/2026: "uma seção de ferramentas onde serão adicionadas várias
 * funcionalidades, e ao clicar na ferramenta aparece para utilizar").
 *
 * Esta é a lista única: a grade do computador e a do celular leem daqui.
 * Ferramenta nova = um item a mais, com a chave dela no catálogo de
 * permissões (`ferramentas.ts`) e a regra de quem usa. Nenhuma outra
 * navegação muda.
 *
 * Duas perguntas por bloco, e as duas precisam dizer sim:
 *   - a permissão do catálogo (o painel ADM liga e desliga);
 *   - a regra do trabalho (quem cota, quem cuida das margens), que é o par
 *     da regra do banco — o banco continua sendo a trava.
 */
import { podeCotar, podeAtenderFila } from '../tipos';
import { cuidaDasMargens } from './margens';

export type IdFerramentaInterna = 'cotar' | 'margens' | 'fretes';

export interface FerramentaInterna {
  id: IdFerramentaInterna;
  /** A chave no catálogo de permissões (ferramentas.ts) */
  chave: string;
  nome: string;
  descricao: string;
  usa: (c: { nivel: number; setor: string }) => boolean;
}

export const FERRAMENTAS_INTERNAS: FerramentaInterna[] = [
  {
    id: 'cotar',
    chave: 'cotar_b2b',
    nome: 'Cotar peça',
    descricao: 'Preço de venda, prazo e similares da peça nos B2Bs.',
    usa: podeCotar,
  },
  {
    id: 'margens',
    chave: 'margens_cotador',
    nome: 'Margens por marca',
    descricao: 'O fator de cada marca que transforma o custo em preço de venda.',
    usa: cuidaDasMargens,
  },
  {
    id: 'fretes',
    chave: 'fretes_cotador',
    nome: 'Fretes dos fornecedores',
    descricao: 'O frete por peça somado ao custo antes da margem (Compras).',
    // O par de `alterar_frete` no banco: quem atende a fila (Compras e TI)
    usa: podeAtenderFila,
  },
];

/** Os blocos que esta pessoa vê, na ordem da lista. */
export const ferramentasDe = (
  c: { nivel: number; setor: string },
  pode: (chave: string) => boolean
): FerramentaInterna[] => FERRAMENTAS_INTERNAS.filter((f) => pode(f.chave) && f.usa(c));
