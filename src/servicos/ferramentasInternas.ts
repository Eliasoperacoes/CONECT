/**
 * FERRAMENTAS INTERNAS — os aplicativos do CONECTA, em blocos (Elias,
 * 20/10/2026: "uma seção de ferramentas onde serão adicionadas várias
 * funcionalidades, e ao clicar na ferramenta aparece para utilizar").
 *
 * UM BLOCO POR SISTEMA, E AS PARTES DENTRO DELE (Elias, 21/10/2026: "foi um
 * absurdo criar uma nova ferramenta de algo que faz parte do mesmo
 * ecossistema; é tudo dentro do mesmo lugar, de maneira organizada"). O
 * cotador é um bloco só — cotar, solicitações ao comprador, fretes,
 * margens — e cada pessoa vê, lá dentro, as partes que pode usar.
 *
 * Esta é a lista única: a grade do computador e a do celular leem daqui.
 * Sistema novo = um bloco; parte nova de um sistema = uma aba dele.
 *
 * Duas perguntas por parte, e as duas precisam dizer sim:
 *   - a permissão do catálogo (o painel ADM liga e desliga);
 *   - a regra do trabalho (quem cota, quem cuida das margens…), que é o par
 *     da regra do banco — o banco continua sendo a trava.
 */
import { podeCotar, podeAtenderFila } from '../tipos';
import { cuidaDasMargens } from './margens';

export type IdFerramentaInterna = 'cotador';
export type IdParteDaFerramenta = 'cotar' | 'solicitacoes' | 'fretes' | 'margens';

type Pessoa = { nivel: number; setor: string };

export interface ParteDaFerramenta {
  id: IdParteDaFerramenta;
  /** A chave no catálogo de permissões (ferramentas.ts) */
  chave: string;
  nome: string;
  usa: (c: Pessoa) => boolean;
}

export interface FerramentaInterna {
  id: IdFerramentaInterna;
  nome: string;
  descricao: string;
  /** As partes, na ordem das abas. */
  partes: ParteDaFerramenta[];
}

export const FERRAMENTAS_INTERNAS: FerramentaInterna[] = [
  {
    id: 'cotador',
    nome: 'Cotação de peças',
    descricao: 'Preço de venda, prazo e similares nos B2Bs; fretes e margens.',
    partes: [
      { id: 'cotar', chave: 'cotar_b2b', nome: 'Cotar', usa: podeCotar },
      // O painel do comprador (cotação humana): o par de `responder_solicitacao`
      { id: 'solicitacoes', chave: 'solicitacoes_cotador', nome: 'Solicitações', usa: podeAtenderFila },
      // O par de `alterar_frete` no banco: quem atende a fila (Compras e TI)
      { id: 'fretes', chave: 'fretes_cotador', nome: 'Fretes', usa: podeAtenderFila },
      { id: 'margens', chave: 'margens_cotador', nome: 'Margens', usa: cuidaDasMargens },
    ],
  },
];

/** Onde a pessoa está dentro de Ferramentas: um bloco aberto e uma aba dele. */
export interface LugarNasFerramentas {
  ferramenta: IdFerramentaInterna;
  parte: IdParteDaFerramenta;
}

/**
 * O LUGAR LEMBRADO (endereço ou aparelho) → onde abrir, só se a pessoa
 * alcança. ["cotador", "margens"] abre as margens do cotador; aba que a
 * pessoa não tem abre a primeira dela; bloco que ela não tem, ou lixo
 * digitado no endereço, abre a grade (nulo).
 */
export const lugarParaAbrir = (blocos: FerramentaInterna[], lugar: string[]): LugarNasFerramentas | null => {
  const bloco = blocos.find((b) => b.id === lugar[0]);
  if (!bloco) return null;
  const parte = bloco.partes.find((p) => p.id === lugar[1]) ?? bloco.partes[0];
  return { ferramenta: bloco.id, parte: parte.id };
};

/** O lugar escrito como vai no endereço: "cotador/margens". */
export const escreverLugar = (l: LugarNasFerramentas | null): string => (l ? `${l.ferramenta}/${l.parte}` : '');

/**
 * Os blocos que esta pessoa vê, cada um só com as partes dela. Bloco sem
 * parte nenhuma não aparece.
 */
export const ferramentasDe = (c: Pessoa, pode: (chave: string) => boolean): FerramentaInterna[] =>
  FERRAMENTAS_INTERNAS.map((f) => ({ ...f, partes: f.partes.filter((p) => pode(p.chave) && p.usa(c)) })).filter(
    (f) => f.partes.length > 0
  );
