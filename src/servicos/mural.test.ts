/**
 * Verificação da CENTRAL DA DIREÇÃO — CONECTA
 *
 * O que motivou: a central guardava só recado, com um destino só —
 * 'Todas' ou uma loja. Não dava para mandar ao Balcão das cinco
 * unidades, nem a três pessoas específicas. E um comunicado que chega a
 * 89 pessoas quando interessa a 3 ensina as 89 a ignorar comunicado.
 *
 * Com destino por pessoa, errar passa a ter consequência: a publicação
 * sobre a advertência de alguém não pode vazar para a loja inteira. Por
 * isso a maior parte deste arquivo exercita `alcanca` com gente de
 * verdade, e não lê código-fonte.
 */
import { test, expect } from 'bun:test';
import { AvisoRede, Colaborador } from '../tipos';
import {
  alcanca,
  destinosDe,
  publicoAlvo,
  resumoDeLeitura,
  descreverDestinos,
  ehDaUnidade,
  ordenarPublicacoes,
  casaComBusca,
  contarPorTipo,
  podeEditarPublicacao,
} from './mural';
import { imagensCitadas } from './textoRico';

/**
 * Os nomes precisam ser DISTINTOS NO PRIMEIRO NOME.
 *
 * `descreverDestinos` mostra só o primeiro nome, e um lote de "Pessoa
 * ana", "Pessoa bruno" viraria "Pessoa e Pessoa" — uma asserção que
 * passa sem distinguir ninguém, e que continuaria passando se a função
 * trocasse as pessoas de lugar.
 */
const NOMES: Record<string, string> = {
  ana: 'Ana Prado',
  bruno: 'Bruno Lemes',
  carla: 'Carla Dias',
  dani: 'Daniela Rocha',
  elias: 'Elias Ferreira',
};

const pessoa = (
  id: string,
  loja: string,
  setor: string,
  extras: Partial<Colaborador> = {}
): Colaborador =>
  ({
    id,
    nome: NOMES[id] || `Fulano ${id}`,
    cargo: 'Vendedor',
    loja,
    setor,
    nivel: 1,
    ativo: true,
    presenca: 'disponivel',
    ...extras,
  }) as Colaborador;

const publicacao = (extras: Partial<AvisoRede> = {}): AvisoRede =>
  ({
    id: 'p1',
    titulo: 'Inventário da matriz',
    conteudo: 'O inventário será na sexta-feira, das 08h às 12h.',
    prioridade: 'geral',
    tipo: 'aviso',
    categoria: 'operacional',
    autorId: 'elias',
    autorNome: 'Elias',
    autorCargo: 'TI',
    criadoEm: '2026-09-10T14:30:00.000Z',
    horaFormatada: '14:30',
    dataPorExtenso: '10 de setembro de 2026',
    fixadoNoTopo: false,
    lojaDestino: 'Todas',
    lidoPorIds: [],
    confirmacoesIds: [],
    ...extras,
  }) as AvisoRede;

const rede = [
  pessoa('ana', 'Pirassununga', 'Balcão'),
  pessoa('bruno', 'Descalvado', 'Balcão'),
  pessoa('carla', 'Descalvado', 'RH'),
  pessoa('dani', 'Pirassununga', 'RH'),
  pessoa('elias', 'Pirassununga', 'TI'),
];

// ============================================================
// QUEM ALCANÇA QUEM
// ============================================================

test('destino de REDE alcança todo mundo', () => {
  const p = publicacao({ destinos: [{ alcance: 'rede', valor: '' }] });
  for (const c of rede) expect(alcanca(p, c)).toBe(true);
});

test('destino de LOJA alcança só quem está nela', () => {
  const p = publicacao({ destinos: [{ alcance: 'loja', valor: 'Descalvado' }] });

  expect(alcanca(p, pessoa('x', 'Descalvado', 'Balcão'))).toBe(true);
  expect(alcanca(p, pessoa('y', 'Pirassununga', 'Balcão'))).toBe(false);
});

test('destino de SETOR atravessa as lojas', () => {
  /**
   * É o que não existia: o RH das cinco unidades é um grupo real, e
   * antes só dava para mandar loja a loja — cinco publicações para um
   * comunicado só, cada uma com a sua lista de quem leu.
   */
  const p = publicacao({ destinos: [{ alcance: 'setor', valor: 'RH' }] });

  expect(alcanca(p, pessoa('x', 'Descalvado', 'RH'))).toBe(true);
  expect(alcanca(p, pessoa('y', 'Santa Rita', 'RH'))).toBe(true);
  expect(alcanca(p, pessoa('z', 'Descalvado', 'Balcão'))).toBe(false);
});

test('destino de PESSOA alcança uma só', () => {
  const p = publicacao({ destinos: [{ alcance: 'pessoa', valor: 'bruno' }] });

  expect(alcanca(p, rede.find((c) => c.id === 'bruno')!)).toBe(true);
  expect(alcanca(p, rede.find((c) => c.id === 'carla')!)).toBe(false);
});

test('OS DESTINOS SOMAM, e não se cruzam', () => {
  /**
   * Loja Descalvado + setor RH chega a quem está em Descalvado E a quem
   * é do RH em qualquer loja. Quem escolhe dois destinos está ampliando
   * o alcance, não restringindo — se fosse interseção, a publicação
   * chegaria a menos gente a cada destino acrescentado, que é o oposto
   * do que qualquer pessoa espera ao marcar mais uma caixa.
   */
  const p = publicacao({
    destinos: [
      { alcance: 'loja', valor: 'Descalvado' },
      { alcance: 'setor', valor: 'RH' },
    ],
  });

  expect(alcanca(p, rede.find((c) => c.id === 'bruno')!)).toBe(true); // loja
  expect(alcanca(p, rede.find((c) => c.id === 'dani')!)).toBe(true); // setor
  expect(alcanca(p, rede.find((c) => c.id === 'ana')!)).toBe(false); // nenhum
});

test('O AUTOR SEMPRE ALCANÇA A PRÓPRIA PUBLICAÇÃO', () => {
  /**
   * Sem isto, quem publica para outra loja não consegue reler o que
   * escreveu nem corrigir um erro que só ele viu.
   */
  const p = publicacao({
    autorId: 'ana',
    destinos: [{ alcance: 'loja', valor: 'Descalvado' }],
  });

  expect(alcanca(p, rede.find((c) => c.id === 'ana')!)).toBe(true);
});

test('PUBLICAÇÃO ANTIGA NÃO FICA ÓRFÃ', () => {
  /**
   * São 24 publicações gravadas só com `lojaDestino`. Lê-las como "sem
   * destino" as tornaria invisíveis para todo mundo no dia da migração
   * — a central abriria vazia, e ninguém saberia por quê.
   */
  const antigaDaRede = publicacao({ lojaDestino: 'Todas', destinos: undefined });
  const antigaDaLoja = publicacao({
    lojaDestino: 'Descalvado' as never,
    destinos: undefined,
  });

  expect(destinosDe(antigaDaRede)).toEqual([{ alcance: 'rede', valor: '' }]);
  expect(destinosDe(antigaDaLoja)).toEqual([
    { alcance: 'loja', valor: 'Descalvado' },
  ]);

  expect(alcanca(antigaDaRede, rede[0])).toBe(true);
  expect(alcanca(antigaDaLoja, rede.find((c) => c.id === 'bruno')!)).toBe(true);
  expect(alcanca(antigaDaLoja, rede.find((c) => c.id === 'ana')!)).toBe(false);
});

// ============================================================
// QUEM LEU
// ============================================================

test('O AUTOR NÃO ENTRA NA CONTA DE QUEM DEVERIA LER', () => {
  /**
   * Ele leu por definição. Contá-lo faria toda publicação nascer com
   * "1 de N leu" — e num aviso dirigido a duas pessoas isso é um terço
   * do número inventado.
   */
  const p = publicacao({
    autorId: 'elias',
    destinos: [{ alcance: 'rede', valor: '' }],
  });

  const alvo = publicoAlvo(p, rede);
  expect(alvo.map((c) => c.id)).not.toContain('elias');
  expect(alvo).toHaveLength(4);
});

test('quem saiu da empresa não fica devendo leitura', () => {
  /**
   * Cobrar ciência de quem foi desligado deixa o contador preso abaixo
   * de 100% para sempre, e um indicador que nunca fecha é um indicador
   * que se aprende a ignorar.
   */
  const p = publicacao({ destinos: [{ alcance: 'rede', valor: '' }] });
  const comInativo = [...rede, pessoa('saiu', 'Descalvado', 'Balcão', { ativo: false })];

  expect(publicoAlvo(p, comInativo).map((c) => c.id)).not.toContain('saiu');
});

test('LEU E CONFIRMOU SÃO NÚMEROS DIFERENTES', () => {
  /**
   * Quem assina ciência leu; quem leu não necessariamente assinou. Numa
   * publicação que exige ciência só a segunda serve de prova, e é por
   * isso que a barra mede uma ou outra conforme o caso.
   */
  const p = publicacao({
    autorId: 'elias',
    destinos: [{ alcance: 'rede', valor: '' }],
    lidoPorIds: ['ana', 'bruno', 'carla'],
    confirmacoesIds: ['ana'],
    exigeConfirmacao: true,
  });

  const r = resumoDeLeitura(p, rede);

  expect(r.leram).toHaveLength(3);
  expect(r.confirmaram).toHaveLength(1);
  expect(r.naoLeram.map((c) => c.id)).toEqual(['dani']);

  // Exigindo ciência, a barra mede a ciência: 1 de 4
  expect(r.percentual).toBe(25);
});

test('sem exigir ciência, a barra mede a LEITURA', () => {
  const p = publicacao({
    autorId: 'elias',
    destinos: [{ alcance: 'rede', valor: '' }],
    lidoPorIds: ['ana', 'bruno', 'carla', 'dani'],
    confirmacoesIds: [],
  });

  expect(resumoDeLeitura(p, rede).percentual).toBe(100);
});

test('quem confirmou conta como quem leu, mesmo sem estar na lista de leitura', () => {
  /**
   * Assinar ciência implica ter lido. As duas listas são gravadas em
   * momentos diferentes, e uma sincronização perdida deixaria a pessoa
   * aparecendo como "não leu" logo abaixo da própria assinatura.
   */
  const p = publicacao({
    autorId: 'elias',
    destinos: [{ alcance: 'rede', valor: '' }],
    lidoPorIds: [],
    confirmacoesIds: ['ana'],
  });

  const r = resumoDeLeitura(p, rede);
  expect(r.leram.map((c) => c.id)).toContain('ana');
  expect(r.naoLeram.map((c) => c.id)).not.toContain('ana');
});

test('público vazio é 100%, e não divisão por zero', () => {
  const p = publicacao({
    autorId: 'elias',
    destinos: [{ alcance: 'pessoa', valor: 'elias' }],
  });

  const r = resumoDeLeitura(p, rede);
  expect(r.alvo).toHaveLength(0);
  expect(r.percentual).toBe(100);
});

// ============================================================
// COMO SE LÊ E COMO SE ORDENA
// ============================================================

test('O FILTRO DE UNIDADE NÃO É O MESMO QUE ALCANÇAR ALGUÉM', () => {
  /**
   * `alcanca` pergunta por uma PESSOA; `ehDaUnidade` por uma LOJA. Uma
   * publicação dirigida ao RH interessa às cinco unidades; uma dirigida
   * a três pessoas interessa às lojas delas.
   *
   * A tela tinha a versão curta — `lojaDestino === nome` —, que não
   * sabia de setor nem de pessoa: filtrar por Descalvado escondia o
   * comunicado dirigido a alguém de Descalvado.
   */
  const paraORh = publicacao({ destinos: [{ alcance: 'setor', valor: 'RH' }] });
  expect(ehDaUnidade(paraORh, 'Descalvado', rede)).toBe(true); // Carla é RH lá
  expect(ehDaUnidade(paraORh, 'Pirassununga', rede)).toBe(true); // Dani é RH lá
  expect(ehDaUnidade(paraORh, 'Santa Rita', rede)).toBe(false); // ninguém de RH

  const paraBruno = publicacao({
    destinos: [{ alcance: 'pessoa', valor: 'bruno' }],
  });
  expect(ehDaUnidade(paraBruno, 'Descalvado', rede)).toBe(true);
  expect(ehDaUnidade(paraBruno, 'Pirassununga', rede)).toBe(false);

  const paraTodos = publicacao({ destinos: [{ alcance: 'rede', valor: '' }] });
  expect(ehDaUnidade(paraTodos, 'Santa Rita', rede)).toBe(true);
});

test('o destino se lê por NOME, e não por contagem', () => {
  /**
   * Quem publicou precisa conferir que acertou o destinatário, e "3
   * pessoas" não permite conferir nada. Da terceira em diante vira
   * contagem, senão o cartão vira lista.
   */
  const duas = publicacao({
    destinos: [
      { alcance: 'pessoa', valor: 'ana' },
      { alcance: 'pessoa', valor: 'bruno' },
    ],
  });
  expect(descreverDestinos(duas, rede)).toBe('Ana e Bruno');

  const quatro = publicacao({
    destinos: rede.slice(0, 4).map((c) => ({ alcance: 'pessoa' as const, valor: c.id })),
  });
  // Os dois primeiros pelo nome, o resto contado
  expect(descreverDestinos(quatro, rede)).toBe('Ana, Bruno +2');

  const naRede = publicacao({ destinos: [{ alcance: 'rede', valor: '' }] });
  expect(descreverDestinos(naRede, rede)).toBe('Todas as unidades');
});

test('FIXADO VEM PRIMEIRO, sempre', () => {
  const lista = [
    publicacao({ id: 'novo', criadoEm: '2026-09-20T10:00:00.000Z' }),
    publicacao({ id: 'fixo', criadoEm: '2020-01-01T10:00:00.000Z', fixadoNoTopo: true }),
  ];

  expect(ordenarPublicacoes(lista)[0].id).toBe('fixo');
});

test('AVISO É CRONOLÓGICO; DOCUMENTO E TUTORIAL SÃO ALFABÉTICOS', () => {
  /**
   * Aviso de ontem já não vale. Documento e tutorial são o contrário: o
   * mais consultado costuma ser o mais antigo, e ordená-los por data
   * esconderia a tabela de preços atrás do último tutorial escrito.
   */
  const avisos = [
    publicacao({ id: 'velho', tipo: 'aviso', criadoEm: '2020-01-01T10:00:00.000Z' }),
    publicacao({ id: 'novo', tipo: 'aviso', criadoEm: '2026-09-20T10:00:00.000Z' }),
  ];
  expect(ordenarPublicacoes(avisos)[0].id).toBe('novo');

  const documentos = [
    publicacao({
      id: 'z',
      titulo: 'Zeramento de caixa',
      tipo: 'documento',
      criadoEm: '2026-09-20T10:00:00.000Z',
    }),
    publicacao({
      id: 'a',
      titulo: 'Abertura de loja',
      tipo: 'documento',
      criadoEm: '2020-01-01T10:00:00.000Z',
    }),
  ];
  expect(ordenarPublicacoes(documentos)[0].id).toBe('a');
});

test('A BUSCA ENTRA NO TEXTO, e não só no título', () => {
  /**
   * Numa prateleira de documentos, quem procura "vale-transporte"
   * raramente lembra o título — lembra a palavra que está dentro dele.
   */
  const p = publicacao({
    titulo: 'Comunicado de setembro',
    conteudo: 'O vale-transporte passa a ser creditado no dia 5.',
    anexoNome: 'tabela-precos.pdf',
  });

  expect(casaComBusca(p, 'vale-transporte')).toBe(true);
  expect(casaComBusca(p, 'setembro')).toBe(true);
  expect(casaComBusca(p, 'tabela-precos')).toBe(true);
  expect(casaComBusca(p, 'inventário')).toBe(false);

  // Busca vazia não esconde nada
  expect(casaComBusca(p, '   ')).toBe(true);
});

test('contar por tipo devolve os três, mesmo zerados', () => {
  /**
   * A aba precisa do número mesmo quando é zero — sem ele, "Tutoriais"
   * apareceria sem contador e pareceria carregando.
   */
  const contagem = contarPorTipo([
    publicacao({ tipo: 'aviso' }),
    publicacao({ tipo: 'aviso' }),
    publicacao({ tipo: 'documento' }),
  ]);

  expect(contagem).toEqual({ aviso: 2, documento: 1, tutorial: 0 });
});

// ============================================================
// QUEM EDITA
// ============================================================

test('EDITAR É DO AUTOR, e não de quem pode publicar', () => {
  /**
   * Se fosse de quem publica, um líder reescreveria o comunicado da
   * direção — que continuaria assinado por ela. É o contrário de uma
   * publicação servir de prova.
   */
  const p = publicacao({ autorId: 'elias' });

  const autor = pessoa('elias', 'Pirassununga', 'TI', { nivel: 5 });
  const lider = pessoa('bruno', 'Descalvado', 'Balcão', { nivel: 2 });
  const gerente = pessoa('carla', 'Descalvado', 'RH', { nivel: 3 });

  expect(podeEditarPublicacao(p, autor)).toBe(true);
  expect(podeEditarPublicacao(p, lider)).toBe(false);
  expect(podeEditarPublicacao(p, gerente)).toBe(false);
});

test('o TI edita qualquer uma', () => {
  /**
   * É a saída quando quem publicou saiu da empresa e o procedimento
   * ficou com o horário errado.
   */
  const p = publicacao({ autorId: 'quem-saiu' });
  const ti = pessoa('elias', 'Pirassununga', 'TI', { nivel: 5 });

  expect(podeEditarPublicacao(p, ti)).toBe(true);
});

// ============================================================
// IMAGEM NO CORPO
// ============================================================

test('as imagens do corpo são listadas para assinar', () => {
  /**
   * O caminho no balde não abre sozinho: o Supabase exige um endereço
   * ASSINADO, e assinar é uma ida à rede. Quem desenha resolve antes e
   * passa o mapa — `paraHtml` continua sendo função pura.
   */
  const caminhos = imagensCitadas(
    'veja ![a foto](central/img-1.png) e ![outra](central/img-2.png)'
  );

  expect(caminhos).toEqual(['central/img-1.png', 'central/img-2.png']);
});

test('endereço externo NÃO entra na lista de assinar', () => {
  /**
   * `https://` já abre. Pedir assinatura dele seria uma ida à rede para
   * um caminho que o balde não conhece.
   */
  expect(imagensCitadas('![x](https://exemplo.com/foto.png)')).toEqual([]);
});

test('a mesma imagem citada duas vezes é assinada uma', () => {
  expect(
    imagensCitadas('![a](central/x.png) e de novo ![b](central/x.png)')
  ).toEqual(['central/x.png']);
});
