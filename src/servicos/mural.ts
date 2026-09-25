/**
 * A CENTRAL DA DIREÇÃO — regras — CONECTA / Malachias Autopeças
 *
 * O QUE MORA AQUI, e por que num arquivo só.
 *
 * Três perguntas se repetem em toda tela que toca publicação, e as três
 * têm uma resposta certa só:
 *
 *  1. Esta publicação ALCANÇA esta pessoa?
 *  2. Quem é o PÚBLICO dela — quem deveria ter lido?
 *  3. Quem JÁ LEU, quem confirmou, quem falta?
 *
 * A primeira já esteve escrita em duas telas com critérios diferentes, e
 * foi assim que um comunicado de loja apareceu na rede inteira. A
 * segunda e a terceira são a mesma conta vista de dois ângulos: sem a
 * primeira, "12 de 24 leram" não quer dizer nada — 24 de quem?
 *
 * ESTE ARQUIVO NÃO LÊ O BANCO. Recebe a lista de colaboradores por
 * parâmetro, de propósito: assim as regras se testam sem sessão, sem
 * localStorage e sem rede.
 */
import {
  AvisoRede,
  Colaborador,
  DestinoPublicacao,
  LeituraPublicacao,
  PUBLICACAO_ENVELHECE,
  TipoPublicacao,
  NIVEL_TI,
} from '../tipos';

/**
 * Os destinos de uma publicação, já tratando a forma antiga.
 *
 * As publicações gravadas antes de `destinos` existir têm só
 * `lojaDestino`. Lê-las como "sem destino" as tornaria invisíveis para
 * todo mundo no dia da migração — então a conversão acontece aqui, uma
 * vez, e não espalhada por cada tela que precisa da lista.
 */
export const destinosDe = (publicacao: AvisoRede): DestinoPublicacao[] => {
  if (publicacao.destinos && publicacao.destinos.length > 0) {
    return publicacao.destinos;
  }
  return publicacao.lojaDestino && publicacao.lojaDestino !== 'Todas'
    ? [{ alcance: 'loja', valor: publicacao.lojaDestino }]
    : [{ alcance: 'rede', valor: '' }];
};

/**
 * ESTA PUBLICAÇÃO ALCANÇA ESTA PESSOA?
 *
 * Os destinos SOMAM: uma publicação para "loja Descalvado" e "setor RH"
 * chega a quem está em Descalvado E a quem é do RH em qualquer loja. É
 * união, e não interseção — quem escolhe dois destinos está ampliando o
 * alcance, não restringindo.
 *
 * O AUTOR SEMPRE ALCANÇA A PRÓPRIA PUBLICAÇÃO. Sem isto, quem publica
 * um comunicado para outra loja não consegue reler o que escreveu, nem
 * corrigir um erro que só ele viu.
 */
export const alcanca = (publicacao: AvisoRede, pessoa: Colaborador): boolean => {
  if (publicacao.autorId === pessoa.id) return true;

  return destinosDe(publicacao).some((destino) => {
    switch (destino.alcance) {
      case 'rede':
        return true;
      case 'loja':
        return pessoa.loja === destino.valor;
      case 'setor':
        return pessoa.setor === destino.valor;
      case 'pessoa':
        return pessoa.id === destino.valor;
      default:
        return false;
    }
  });
};

/**
 * QUEM DEVERIA TER LIDO.
 *
 * O autor fica DE FORA da conta. Ele leu por definição — contá-lo faria
 * todo comunicado nascer com "1 de N leu", e num aviso dirigido a duas
 * pessoas isso é um terço do número inventado.
 *
 * Quem está inativo também fica de fora: cobrar ciência de quem saiu da
 * empresa deixa o contador preso abaixo de 100% para sempre.
 */
export const publicoAlvo = (
  publicacao: AvisoRede,
  todos: Colaborador[]
): Colaborador[] =>
  todos.filter(
    (c) => c.ativo !== false && c.id !== publicacao.autorId && alcanca(publicacao, c)
  );

/**
 * QUEM PODE EDITAR ESTA PUBLICAÇÃO.
 *
 * O autor, ou quem administra o sistema. NÃO é quem tem permissão de
 * publicar: isso deixaria um líder reescrever o comunicado da direção,
 * que continuaria assinado por ela.
 *
 * Mora aqui, e não na tela, porque quem esconde o botão e quem recusa a
 * gravação precisam concordar. Botão escondido se contorna pelo
 * console; a recusa do serviço, não.
 */
export const podeEditarPublicacao = (
  publicacao: AvisoRede,
  pessoa: Colaborador
): boolean => publicacao.autorId === pessoa.id || pessoa.nivel >= NIVEL_TI;

export interface ResumoDeLeitura {
  /** Quem deveria ler, sem o autor. */
  alvo: Colaborador[];
  leram: Colaborador[];
  naoLeram: Colaborador[];
  /** Só interessa quando a publicação exige ciência. */
  confirmaram: Colaborador[];
  /** 0 a 100. Com público vazio é 100: não há ninguém devendo leitura. */
  percentual: number;
}

/**
 * QUEM LEU, QUEM FALTA.
 *
 * Confirmar ciência implica ter lido — quem assina leu. Mas o contrário
 * não vale, e é por isso que os dois números existem separados: numa
 * publicação que exige ciência, "leu" é quem abriu e "confirmou" é quem
 * assinou, e só o segundo serve de prova.
 */
export const resumoDeLeitura = (
  publicacao: AvisoRede,
  todos: Colaborador[]
): ResumoDeLeitura => {
  const alvo = publicoAlvo(publicacao, todos);
  const lidos = new Set(publicacao.lidoPorIds || []);
  const confirmados = new Set(publicacao.confirmacoesIds || []);

  const leram = alvo.filter((c) => lidos.has(c.id) || confirmados.has(c.id));
  const confirmaram = alvo.filter((c) => confirmados.has(c.id));

  return {
    alvo,
    leram,
    naoLeram: alvo.filter((c) => !lidos.has(c.id) && !confirmados.has(c.id)),
    confirmaram,
    percentual:
      alvo.length === 0
        ? 100
        : Math.round(
            ((publicacao.exigeConfirmacao ? confirmaram.length : leram.length) /
              alvo.length) *
              100
          ),
  };
};

/**
 * ESTA PUBLICAÇÃO INTERESSA A ESTA UNIDADE?
 *
 * É o filtro da coluna da esquerda. Parece o mesmo que `alcanca`, e não
 * é: `alcanca` pergunta por uma PESSOA, esta pergunta por uma LOJA —
 * uma publicação dirigida ao setor de RH interessa às cinco unidades,
 * e uma dirigida a três pessoas interessa às lojas delas.
 *
 * Mora aqui, e não na tela, porque a tela tinha a versão curta —
 * `lojaDestino === nome` — que não sabia de setor nem de pessoa. Filtrar
 * por Descalvado escondia o comunicado dirigido a alguém de Descalvado.
 */
export const ehDaUnidade = (
  publicacao: AvisoRede,
  loja: string,
  todos: Colaborador[]
): boolean =>
  destinosDe(publicacao).some((destino) => {
    switch (destino.alcance) {
      case 'rede':
        return true;
      case 'loja':
        return destino.valor === loja;
      case 'setor':
        // Setor atravessa as lojas: interessa a toda unidade que o tenha
        return todos.some((c) => c.setor === destino.valor && c.loja === loja);
      case 'pessoa':
        return todos.some((c) => c.id === destino.valor && c.loja === loja);
      default:
        return false;
    }
  });

/** Como o destino se lê na tela: "Todas as unidades", "Balcão · 3 pessoas". */
export const descreverDestinos = (
  publicacao: AvisoRede,
  todos: Colaborador[]
): string => {
  const destinos = destinosDe(publicacao);
  if (destinos.some((d) => d.alcance === 'rede')) return 'Todas as unidades';

  const partes: string[] = [];
  const lojas = destinos.filter((d) => d.alcance === 'loja').map((d) => d.valor);
  const setores = destinos.filter((d) => d.alcance === 'setor').map((d) => d.valor);
  const pessoas = destinos.filter((d) => d.alcance === 'pessoa');

  if (lojas.length) partes.push(lojas.join(', '));
  if (setores.length) partes.push(setores.join(', '));

  if (pessoas.length) {
    /**
     * Nome de gente, e não "3 pessoas": quem publicou precisa conferir
     * que acertou o destinatário, e um número não permite conferir nada.
     * Da terceira em diante vira contagem, senão o cartão vira lista.
     */
    const nomes = pessoas
      .map((d) => todos.find((c) => c.id === d.valor)?.nome.split(' ')[0])
      .filter(Boolean) as string[];

    partes.push(
      nomes.length <= 2
        ? nomes.join(' e ')
        : `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`
    );
  }

  return partes.join(' · ') || 'Todas as unidades';
};

/**
 * A ORDEM DA PRATELEIRA.
 *
 * Fixado primeiro, sempre — é para isso que serve fixar.
 *
 * Depois, depende do TIPO: aviso é cronológico, porque o de ontem já
 * não vale. Documento e tutorial são alfabéticos, porque o mais
 * consultado costuma ser o mais antigo e ordená-los por data esconderia
 * a tabela de preços atrás do último tutorial escrito.
 */
export const ordenarPublicacoes = (lista: AvisoRede[]): AvisoRede[] =>
  [...lista].sort((a, b) => {
    if (a.fixadoNoTopo !== b.fixadoNoTopo) return a.fixadoNoTopo ? -1 : 1;

    const porData =
      new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();

    if (PUBLICACAO_ENVELHECE[a.tipo] || PUBLICACAO_ENVELHECE[b.tipo]) return porData;
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });

/**
 * A busca. Bate em título, conteúdo, categoria e autor.
 *
 * Inclui o CONTEÚDO de propósito: numa prateleira de documentos, quem
 * procura "vale-transporte" raramente lembra o título do documento —
 * lembra a palavra que está dentro dele.
 */
export const casaComBusca = (publicacao: AvisoRede, termo: string): boolean => {
  const alvo = termo.trim().toLowerCase();
  if (!alvo) return true;

  return (
    publicacao.titulo.toLowerCase().includes(alvo) ||
    publicacao.conteudo.toLowerCase().includes(alvo) ||
    publicacao.categoria.toLowerCase().includes(alvo) ||
    publicacao.autorNome.toLowerCase().includes(alvo) ||
    (publicacao.anexoNome || '').toLowerCase().includes(alvo)
  );
};

/** As leituras de uma publicação, prontas para a lista de "quem viu". */
export const leiturasDe = (publicacao: AvisoRede): LeituraPublicacao[] =>
  (publicacao.lidoPorIds || []).map((id) => ({
    colaboradorId: id,
    lidoEm: publicacao.criadoEm,
    confirmado: (publicacao.confirmacoesIds || []).includes(id),
  }));

/** Quantas publicações de cada tipo — é o número das abas. */
export const contarPorTipo = (
  lista: AvisoRede[]
): Record<TipoPublicacao, number> => {
  const contagem: Record<TipoPublicacao, number> = {
    aviso: 0,
    documento: 0,
    tutorial: 0,
  };
  for (const p of lista) contagem[p.tipo] = (contagem[p.tipo] || 0) + 1;
  return contagem;
};
