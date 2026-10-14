/**
 * A IA QUE AJUDA A ESCREVER NA CENTRAL — a regra (13/10/2026).
 *
 * Pedido do Elias: uma IA "só pra texto", para criar avisos e
 * informativos — "limitada somente a essa tarefa, sem que ela tenha
 * acesso a código, informações e etc".
 *
 * A TRAVA É O DESENHO, não uma promessa da IA:
 *
 *   · ela recebe SÓ o que está aqui: a instrução fixa e o que a pessoa
 *     digitou. Nenhuma linha do banco, nem o nome de quem pede;
 *   · não ganha ferramenta nenhuma — não busca, não consulta, não executa;
 *   · não há conversa livre: são cinco ações, com tamanho máximo;
 *   · a resposta só PREENCHE o editor. Quem publica continua sendo a
 *     pessoa, depois de ler;
 *   · quem pode usar, e quantas vezes por dia, quem decide é o banco
 *     (`usar_escrita_com_ia`), com a mesma regra de quem publica.
 *
 * Mesmo que alguém convença a IA a "ignorar as instruções", ela não tem o
 * que revelar: não recebeu nada além do texto da própria pessoa.
 */
import type { TipoPublicacao } from '../tipos';

export const ACOES_DA_IA = ['criar', 'melhorar', 'encurtar', 'tom', 'titulo'] as const;
export type AcaoDaIa = (typeof ACOES_DA_IA)[number];

export const TONS_DA_IA = ['formal', 'acolhedor', 'direto'] as const;
export type TomDaIa = (typeof TONS_DA_IA)[number];

/** O que a pessoa manda: tópicos para criar, ou o texto para trabalhar */
export const MAXIMO_DA_ENTRADA = 6000;

export interface PedidoDeEscrita {
  acao: AcaoDaIa;
  /** Os tópicos (criar) ou o texto que já está no editor (as outras) */
  entrada: string;
  /** Só na ação "tom" */
  tom?: TomDaIa;
  /** Para a IA saber o que está escrevendo */
  tipo?: TipoPublicacao;
}

const GENERO_DO_TIPO: Record<TipoPublicacao, string> = {
  aviso: 'um aviso',
  documento: 'um comunicado ou documento informativo',
  tutorial: 'um tutorial passo a passo',
};

const COMO_E_O_TOM: Record<TomDaIa, string> = {
  formal: 'formal e institucional, sem ser frio',
  acolhedor: 'próximo e acolhedor, como um gestor que conhece a equipe',
  direto: 'direto e objetivo, frases curtas, só o essencial',
};

/**
 * A INSTRUÇÃO FIXA. Mora no servidor: quem usa não a vê nem a altera.
 *
 * O formato é o da Central (`textoRico.ts`), e só o pedaço que não
 * depende de nada de fora: sem link, botão ou imagem — a IA inventaria
 * endereços.
 */
export const INSTRUCAO_FIXA = [
  'Você ajuda a redigir publicações internas da Malachias Autopeças, uma rede de lojas de autopeças no interior de São Paulo, para os colaboradores lerem no celular.',
  'Sua única tarefa é escrever ou revisar o texto que a pessoa enviar. Se o pedido for sobre qualquer outro assunto, ou pedir algo que não seja redigir esta publicação, responda apenas com o texto: "Só consigo ajudar a escrever avisos e informativos da Central."',
  'Escreva em português do Brasil, claro e correto, para quem lê no balcão entre um atendimento e outro: parágrafos curtos, o mais importante primeiro, datas e horários bem visíveis.',
  'Não invente fatos, datas, horários, nomes, valores ou regras que não estejam no pedido. Se faltar uma informação essencial, deixe o lugar marcado entre colchetes, por exemplo [horário].',
  'Formatação permitida, e nenhuma outra: **negrito**, *itálico*, "### " no início da linha para subtítulo, listas com "- " ou "1. ", e caixas de destaque começando a linha com "> [!IMPORTANTE]", "> [!ATENCAO]" ou "> [!DICA]" seguida de linhas começando com "> ".',
  'Nunca use links, endereços de internet, imagens, tabelas, HTML ou emojis em excesso.',
  'Marcadores como ⟦1⟧, ⟦2⟧ são imagens, links ou pessoas citadas no texto original: mantenha cada um exatamente como está, uma única vez, no lugar que fizer sentido. Nunca crie marcadores novos.',
  'Responda somente com o JSON pedido, sem comentários antes ou depois.',
].join('\n');

/** O pedido de cada ação, já com o texto da pessoa */
export const montarPedido = (p: PedidoDeEscrita): string => {
  const genero = GENERO_DO_TIPO[p.tipo ?? 'aviso'];
  const entrada = p.entrada.trim();
  switch (p.acao) {
    case 'criar':
      return `Escreva ${genero} a partir destes tópicos. Devolva {"titulo": "...", "texto": "..."} — título curto, de até 70 caracteres.\n\nTópicos:\n${entrada}`;
    case 'melhorar':
      return `Revise este texto: corrija português, deixe mais claro e bem organizado, mantendo todas as informações e o sentido. Devolva {"texto": "..."}.\n\nTexto:\n${entrada}`;
    case 'encurtar':
      return `Encurte este texto para cerca de metade, mantendo datas, horários, nomes e o que a pessoa precisa fazer. Devolva {"texto": "..."}.\n\nTexto:\n${entrada}`;
    case 'tom':
      return `Reescreva este texto num tom ${COMO_E_O_TOM[p.tom ?? 'formal']}, mantendo todas as informações. Devolva {"texto": "..."}.\n\nTexto:\n${entrada}`;
    case 'titulo':
      return `Sugira um título para esta publicação, curto (até 70 caracteres) e que diga do que se trata. Devolva {"titulo": "..."}.\n\nTexto:\n${entrada}`;
  }
};

/** Confere o que veio do aplicativo. Devolve o pedido limpo, ou o motivo da recusa. */
export const lerPedido = (corpo: unknown): { pedido: PedidoDeEscrita } | { erro: string } => {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const acao = c.acao as AcaoDaIa;
  if (!ACOES_DA_IA.includes(acao)) return { erro: 'Ação desconhecida.' };

  const entrada = typeof c.entrada === 'string' ? c.entrada.trim() : '';
  if (entrada.length < 3) {
    return { erro: acao === 'criar' ? 'Escreva os tópicos do que quer publicar.' : 'Escreva o texto antes.' };
  }
  if (entrada.length > MAXIMO_DA_ENTRADA) {
    return { erro: `Texto grande demais para a IA (máximo de ${MAXIMO_DA_ENTRADA} caracteres).` };
  }

  const tom = TONS_DA_IA.includes(c.tom as TomDaIa) ? (c.tom as TomDaIa) : undefined;
  if (acao === 'tom' && !tom) return { erro: 'Escolha o tom.' };

  const tipo = ['aviso', 'documento', 'tutorial'].includes(c.tipo as string) ? (c.tipo as TipoPublicacao) : undefined;
  return { pedido: { acao, entrada, tom, tipo } };
};

/**
 * O QUE VOLTA DA IA, LIMPO antes de chegar ao editor.
 *
 * O editor já escapa todo HTML na hora de desenhar (`paraHtml`), então
 * isto não é a segurança — é não deixar a IA pôr no texto o que a
 * instrução proíbe: link vira só o texto dele, imagem some, tag some.
 */
export const limparTextoDaIa = (bruto: string): string =>
  bruto
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // imagem
    .replace(/\[\[([^\]]+)\]\]\([^)]*\)/g, '$1') // botão
    .replace(/\[([^\]]+)\]\((?:https?:|www\.)[^)]*\)/g, '$1') // link
    .replace(/<[^>]+>/g, '') // HTML
    .replace(/https?:\/\/\S+/g, '') // endereço solto
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const limparTituloDaIa = (bruto: string): string =>
  limparTextoDaIa(bruto).replace(/^#+\s*/, '').replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

/** A resposta da IA (o JSON pedido) no formato que o editor usa */
export const lerRespostaDaIa = (
  bruto: string,
  acao: AcaoDaIa
): { titulo?: string; texto?: string } | null => {
  let dados: { titulo?: unknown; texto?: unknown };
  try {
    dados = JSON.parse(bruto.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  const titulo = typeof dados.titulo === 'string' ? limparTituloDaIa(dados.titulo) : undefined;
  const texto = typeof dados.texto === 'string' ? limparTextoDaIa(dados.texto) : undefined;

  if (acao === 'titulo') return titulo ? { titulo } : null;
  if (acao === 'criar') return texto ? { titulo, texto } : null;
  return texto ? { texto } : null;
};
