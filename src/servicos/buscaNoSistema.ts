/**
 * A BUSCA DO COMPUTADOR — pessoas e ferramentas, separadas.
 *
 * Pedido do Elias (06/10/2026): uma barra de busca no topo; ao digitar,
 * as sugestões vêm em dois grupos — PESSOAS (só colaboradores) e
 * FERRAMENTAS (só telas do sistema). A pessoa abre a ficha rápida com os
 * atalhos dela; a ferramenta abre a tela.
 *
 * Nada aqui decide acesso. As ferramentas vêm de \`telasQueVejo\` (quem
 * chama passa só as telas da pessoa), e o que a ficha rápida oferece de
 * cada colaborador é decidido pelas regras que já existem.
 */
import type { Colaborador } from '../tipos';
import { normalizarBusca } from './buscaNasConversas';
import { ASSUNTOS, DESCRICAO_DA_TELA, type TelaId } from './telasPorAssunto';

export interface FerramentaEncontrada {
  tela: TelaId;
  rotulo: string;
  /** O assunto onde ela mora: "Documentos", "Ponto"… */
  assunto: string;
  descricao: string;
}

/** Quantas sugestões de cada grupo: o resto se acha digitando mais. */
export const LIMITE_POR_GRUPO = 6;

/**
 * As telas que a busca oferece: as da pessoa, menos as que não são tela
 * (Conversas é o balão do canto).
 */
export const ferramentasDe = (visiveis: Set<TelaId>): FerramentaEncontrada[] =>
  ASSUNTOS.flatMap((assunto) =>
    assunto.telas
      .filter((t) => visiveis.has(t.id) && t.id !== 'conversas')
      .map((t) => ({
        tela: t.id,
        // Assunto de uma tela só: o nome do assunto é o da tela ("Central")
        rotulo: t.rotulo,
        assunto: assunto.rotulo,
        descricao: DESCRICAO_DA_TELA[t.id],
      }))
  );

/**
 * A NOTA DE UM TEXTO PARA O TERMO: começa com ele (2), uma palavra começa
 * com ele (1), ou não serve (0). Sem acento e sem caixa: "joao" acha "João".
 */
const nota = (texto: string, termo: string): number => {
  const t = normalizarBusca(texto);
  if (t.startsWith(termo)) return 2;
  return t.split(/\s+/).some((palavra) => palavra.startsWith(termo)) ? 1 : 0;
};

export const buscarNoSistema = (
  termoDigitado: string,
  dados: { pessoas: Colaborador[]; ferramentas: FerramentaEncontrada[] }
): { pessoas: Colaborador[]; ferramentas: FerramentaEncontrada[] } => {
  const termo = normalizarBusca(termoDigitado);
  if (termo.length < 2) return { pessoas: [], ferramentas: [] };

  const pessoas = dados.pessoas
    .filter((c) => c.ativo !== false)
    .map((c) => ({ c, n: Math.max(nota(c.nome, termo) * 2, nota(`${c.cargo} ${c.setor} ${c.loja}`, termo)) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.c.nome.localeCompare(b.c.nome))
    .slice(0, LIMITE_POR_GRUPO)
    .map((x) => x.c);

  const ferramentas = dados.ferramentas
    .map((f) => ({
      f,
      // O nome da tela vale mais que o assunto, e os dois mais que a frase
      n: Math.max(nota(f.rotulo, termo) * 3, nota(f.assunto, termo) * 2, nota(f.descricao, termo) > 0 ? 1 : 0),
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, LIMITE_POR_GRUPO)
    .map((x) => x.f);

  return { pessoas, ferramentas };
};
