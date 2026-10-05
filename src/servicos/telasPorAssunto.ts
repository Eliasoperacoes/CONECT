/**
 * QUEM VÊ CADA TELA, E EM QUE ASSUNTO ELA MORA — CONECTA
 *
 * Pedido do Elias (05/10/2026), para a versão de computador: organizar por
 * ASSUNTO, e não por quem usa. O que era de ponto estava em quatro lugares
 * — bater no "Ponto", o próprio espelho no "Eu", a equipe em "Equipe e
 * ponto", a rede no "RH" —, e escala e férias apareciam em dois.
 *
 * Aqui mora UMA resposta para duas perguntas:
 *
 *   1. que telas esta pessoa alcança (`telasQueVejo`) — as MESMAS de antes
 *      da mudança: as condições foram trazidas de PainelRede, PainelGestao,
 *      MeuRH e App, que passam a consultar daqui. "Não confundir as telas
 *      entre os usuários" (Elias): ninguém ganha nem perde tela por causa
 *      da reorganização;
 *   2. em que assunto cada tela fica (`ASSUNTOS`) — a barra lateral.
 *
 * Sem tela e sem banco: entra a pessoa, a pergunta de permissão e se ela
 * tem equipe; sai a lista. Testado por perfil em `telasPorAssunto.test.ts`.
 */
import {
  Colaborador,
  cuidaDePessoas,
  ehDoRh,
  vePainelDeRede,
  NIVEL_TI,
} from '../tipos';

export type TelaId =
  | 'inicio'
  | 'conversas'
  | 'central'
  // Ponto
  | 'meu_ponto'
  | 'meu_espelho'
  | 'equipe_banco'
  | 'equipe_pendencias'
  | 'ponto_rede'
  | 'qr_ponto'
  // Folgas e férias
  | 'pedir_ausencia'
  | 'minhas_ausencias'
  | 'escala_folgas'
  | 'ferias_planejamento'
  | 'atestados'
  // Documentos
  | 'meus_documentos'
  | 'assinaturas'
  | 'holerites'
  | 'advertencias'
  // Pessoas e lojas
  | 'unidades'
  | 'organograma'
  // O painel do RH ("Precisa de você", a rede em números) vai para o Início
  | 'painel_rh'
  | 'administracao';

export interface ContextoDoAcesso {
  /** `podeUsar(chave, pessoa)` — o catálogo de permissões. */
  pode: (chave: string) => boolean;
  /** Tem alguém abaixo na cadeia? (`obterColaboradoresVisiveis().length > 1`) */
  temEquipe: boolean;
  /** Bate ponto? (`batePonto`) — quem não bate não tem espelho nem folga. */
  batePonto: boolean;
}

/**
 * AS CONDIÇÕES DE CADA PARTE, com o nome de onde vieram. Exportadas para as
 * telas de hoje (celular) perguntarem aqui, em vez de repetirem a conta.
 */
export const acessoDe = (c: Colaborador, ctx: ContextoDoAcesso) => {
  const { pode, temEquipe } = ctx;

  /** "Gerenciar" existe para esta pessoa? (App: `vePainelDeRede`) */
  const gerencia = vePainelDeRede(c);

  /** A tela de RH (PainelRede: `temRh`). */
  const rh = gerencia && pode('rh_pessoal') && cuidaDePessoas(c);

  /**
   * Quem tem a tela de RH acessa escala, férias e espelhos POR ELA — não
   * por "Equipe e ponto" (PainelGestao: `temTelaDeRh`).
   */
  const temTelaDeRh = cuidaDePessoas(c) && pode('rh_pessoal');

  /**
   * "Equipe e ponto" — só para quem não é do setor de RH (PainelRede).
   *
   * Não é só "tenho equipe": o banco de horas da rede e o cartaz de QR
   * moram aqui. Um gerente sem ninguém cadastrado abaixo dele ainda precisa
   * do cartaz da loja — sem o `||` do QR, ele o perderia sem aviso.
   */
  const gestao =
    gerencia &&
    !ehDoRh(c) &&
    ((((pode('painel_gestao') || pode('aprovar_jornadas')) && temEquipe) ||
      pode('banco_horas_rh') ||
      pode('qr_ponto')) as boolean);

  /** As abas de dentro de "Equipe e ponto" (PainelGestao). */
  const equipe = gestao && temEquipe;
  const escalaDaEquipe = gestao && pode('escala_folgas') && !temTelaDeRh;
  const redeNaGestao = gestao && (pode('banco_horas_rh') || pode('espelho_equipe')) && !temTelaDeRh;
  const qr = gestao && pode('qr_ponto');

  return {
    gerencia,
    rh,
    gestao,
    equipe,
    escalaDaEquipe,
    redeNaGestao,
    qr,
    /** Os espelhos da rede: pelo RH, ou por "Equipe e ponto". */
    espelhosDaRede: rh || redeNaGestao,
    /** Escala e férias: pelo RH, ou pela equipe. */
    escala: rh || escalaDaEquipe,
    unidades: gerencia && !ehDoRh(c) && pode('visao_lojas'),
    organograma: gerencia && !ehDoRh(c) && pode('organograma'),
    /** O botão "Painel ADM" (App: `ehAdmin`). */
    administracao: c.nivel >= NIVEL_TI,
  };
};

/** As telas que a pessoa alcança, sem ordem. */
export const telasQueVejo = (c: Colaborador, ctx: ContextoDoAcesso): Set<TelaId> => {
  const a = acessoDe(c, ctx);
  const telas = new Set<TelaId>(['inicio', 'central', 'meus_documentos']);
  const se = (condicao: boolean, ...ids: TelaId[]) => condicao && ids.forEach((id) => telas.add(id));

  se(ctx.pode('conversas'), 'conversas');
  // Bater e justificar moram na mesma tela de hoje (AbaPonto)
  se(ctx.pode('ponto'), 'meu_ponto', 'pedir_ausencia');
  /*
    UMA ABA PARA AS PRÓPRIAS AUSÊNCIAS. Quem pede pelo ponto acompanha os
    pedidos na mesma tela (`AbaJustificar` lista folga, férias e atestado);
    os cartões do Meu RH ali repetiriam a lista. Ficam para quem não pede
    pelo ponto — o gerente, que ainda tem férias e documentos para ver.
  */
  se(!ctx.pode('ponto'), 'minhas_ausencias');
  // O próprio espelho: só de quem bate ponto (MeuRH)
  se(ctx.batePonto, 'meu_espelho');
  se(a.equipe, 'equipe_banco', 'equipe_pendencias');
  se(a.espelhosDaRede, 'ponto_rede');
  se(a.qr, 'qr_ponto');
  se(a.escala, 'escala_folgas', 'ferias_planejamento');
  se(a.rh, 'painel_rh', 'atestados', 'assinaturas', 'holerites', 'advertencias');
  se(a.unidades, 'unidades');
  se(a.organograma, 'organograma');
  se(a.administracao, 'administracao');
  return telas;
};

export type AssuntoId =
  | 'inicio'
  | 'conversas'
  | 'central'
  | 'ponto'
  | 'ausencias'
  | 'documentos'
  | 'pessoas'
  | 'administracao';

export interface Assunto {
  id: AssuntoId;
  rotulo: string;
  /** O grupo da barra lateral. */
  grupo: 'principal' | 'gestao' | 'rodape';
  /** As telas, na ordem das abas. A primeira que a pessoa vê abre primeiro. */
  telas: { id: TelaId; rotulo: string }[];
}

/**
 * O QUE CADA TELA É, numa frase — o cabeçalho padrão do computador.
 *
 * "Tudo muito despadronizado, sem informação" (Elias, 05/10/2026): cada
 * tela abria com um título diferente, ou nenhum, e a pessoa tinha de
 * adivinhar para que ela servia. Agora toda tela diz, no mesmo lugar e do
 * mesmo jeito, o que é e o que se faz nela.
 */
export const DESCRICAO_DA_TELA: Record<TelaWeb, string> = {
  inicio: 'O seu dia em resumo, e o que espera por você.',
  conversas: 'As conversas e os grupos da rede.',
  central: 'Comunicados, documentos e tutoriais da direção para a rede.',
  meu_ponto: 'Suas batidas de hoje, a próxima marcação e o histórico dos dias.',
  meu_espelho: 'O espelho de cada mês fechado, para conferir e assinar.',
  equipe_banco: 'O saldo de cada pessoa da sua equipe, ciclo a ciclo.',
  equipe_pendencias: 'Quem não bateu, os dias que não fecharam e as horas que esperam a sua decisão.',
  ponto_rede: 'O espelho de todas as pessoas, com correção de marcação, impressão e exportação.',
  qr_ponto: 'O cartaz de QR de cada loja, para imprimir e afixar.',
  pedir_ausencia: 'Peça folga, envie atestado ou justifique uma falta — e acompanhe cada resposta.',
  minhas_ausencias: 'As suas férias programadas e os documentos que você entregou.',
  escala_folgas:
    'As folgas de sábado do mês: arraste cada pessoa para o dia dela. Cada uma tem uma folga por mês — e mais uma quem trabalhou a do mês anterior (o selo 1/2 na lista).',
  ferias_planejamento:
    'O ano de férias da equipe, num calendário só. Selecione uma ou mais pessoas para lançar o mesmo período.',
  atestados:
    'Atestados, declarações de comparecimento e faltas justificadas: quem entregou, de quando e o documento — para aceitar, recusar e manter o arquivo em dia.',
  meus_documentos: 'Os seus holerites e os documentos do RH que pedem a sua ciência.',
  assinaturas:
    'Os espelhos que os colaboradores assinaram e esperam a assinatura do responsável — todos de uma vez. O holerite leva só a assinatura do colaborador.',
  holerites:
    'Os holerites do mês, publicados a partir do PDF do escritório. Cada pessoa vê só o dela; reenviar substitui o do mesmo mês.',
  advertencias:
    'O registro disciplinar da rede. A pessoa vê a dela e dá ciência na própria tela — a confirmação é dela, não de quem aplicou.',
  unidades: 'As lojas da rede: equipe, supervisão e quem está online.',
  organograma: 'Quem responde a quem — é o que decide quem aprova as horas de cada um.',
  painel_rh: 'O que está parado esperando uma decisão do RH.',
  administracao: 'Cadastro, permissões e configurações do sistema.',
  perfil: 'Os seus dados, a sua presença e as preferências deste aparelho.',
};

/**
 * DE QUEM É A TELA — o rótulo acima do título dela, no computador.
 *
 * "Não confundir e bagunçar as telas entre os usuários" (Elias,
 * 05/10/2026): num mesmo assunto ficam lado a lado "Meus documentos" e
 * "Holerites" (de toda a rede). O rótulo diz, antes do nome, se a tela é
 * da própria pessoa, de quem ela gerencia ou da rede inteira.
 */
export const DE_QUEM_E_A_TELA: Record<TelaWeb, string> = {
  inicio: 'Para você',
  conversas: 'Para você',
  central: 'Toda a rede',
  meu_ponto: 'Para você',
  meu_espelho: 'Para você',
  equipe_banco: 'Sua equipe',
  equipe_pendencias: 'Sua equipe',
  ponto_rede: 'Gestão de pessoas',
  qr_ponto: 'Gestão de pessoas',
  pedir_ausencia: 'Para você',
  minhas_ausencias: 'Para você',
  escala_folgas: 'Gestão de pessoas',
  ferias_planejamento: 'Gestão de pessoas',
  atestados: 'Gestão de pessoas',
  meus_documentos: 'Para você',
  assinaturas: 'Gestão de pessoas',
  holerites: 'Gestão de pessoas',
  advertencias: 'Gestão de pessoas',
  unidades: 'Toda a rede',
  organograma: 'Toda a rede',
  painel_rh: 'Gestão de pessoas',
  administracao: 'Administração',
  perfil: 'Para você',
};

/** O que cada assunto reúne, numa frase — o título da página. */
export const DESCRICAO_DO_ASSUNTO: Record<AssuntoId, string> = {
  inicio: DESCRICAO_DA_TELA.inicio,
  conversas: DESCRICAO_DA_TELA.conversas,
  central: DESCRICAO_DA_TELA.central,
  ponto: 'Batidas, espelhos e banco de horas — os seus, os da sua equipe e os da rede.',
  ausencias: 'Folgas de sábado, férias e atestados: pedir, acompanhar e planejar.',
  documentos: 'Holerites, advertências e assinaturas — os seus e os que o RH cuida.',
  pessoas: 'As lojas da rede e quem responde a quem.',
  administracao: DESCRICAO_DA_TELA.administracao,
};

/**
 * A BARRA LATERAL, POR ASSUNTO. Tudo de ponto num lugar, tudo de folga e
 * férias em outro, tudo de documento em outro (mapa aprovado pelo Elias,
 * 05/10/2026). A tela é a mesma de hoje; o que muda é a porta.
 */
export const ASSUNTOS: Assunto[] = [
  { id: 'inicio', rotulo: 'Início', grupo: 'principal', telas: [{ id: 'inicio', rotulo: 'Início' }] },
  { id: 'conversas', rotulo: 'Conversas', grupo: 'principal', telas: [{ id: 'conversas', rotulo: 'Conversas' }] },
  { id: 'central', rotulo: 'Central', grupo: 'principal', telas: [{ id: 'central', rotulo: 'Central' }] },
  {
    id: 'ponto',
    rotulo: 'Ponto',
    grupo: 'gestao',
    telas: [
      { id: 'meu_ponto', rotulo: 'Meu ponto' },
      { id: 'meu_espelho', rotulo: 'Meu espelho' },
      { id: 'equipe_banco', rotulo: 'Banco de horas da equipe' },
      { id: 'equipe_pendencias', rotulo: 'Pendências da equipe' },
      { id: 'ponto_rede', rotulo: 'Espelhos de ponto' },
      { id: 'qr_ponto', rotulo: 'QR do ponto' },
    ],
  },
  {
    id: 'ausencias',
    rotulo: 'Folgas e férias',
    grupo: 'gestao',
    telas: [
      { id: 'pedir_ausencia', rotulo: 'Minhas solicitações' },
      { id: 'minhas_ausencias', rotulo: 'Minhas férias e documentos' },
      { id: 'escala_folgas', rotulo: 'Escala de folgas' },
      { id: 'ferias_planejamento', rotulo: 'Férias da equipe' },
      { id: 'atestados', rotulo: 'Atestados' },
    ],
  },
  {
    id: 'documentos',
    rotulo: 'Documentos',
    grupo: 'gestao',
    telas: [
      { id: 'meus_documentos', rotulo: 'Meus documentos' },
      { id: 'assinaturas', rotulo: 'Assinaturas' },
      { id: 'holerites', rotulo: 'Holerites' },
      { id: 'advertencias', rotulo: 'Advertências' },
    ],
  },
  {
    id: 'pessoas',
    rotulo: 'Pessoas e lojas',
    grupo: 'gestao',
    telas: [
      { id: 'unidades', rotulo: 'Unidades' },
      { id: 'organograma', rotulo: 'Organograma' },
    ],
  },
  {
    id: 'administracao',
    rotulo: 'Administração',
    grupo: 'rodape',
    telas: [{ id: 'administracao', rotulo: 'Administração' }],
  },
];

/**
 * OS ASSUNTOS DESTA PESSOA, cada um só com as telas dela. Assunto sem tela
 * não aparece na barra — o colaborador não vê "Pessoas e lojas" vazio.
 */
export const assuntosDe = (c: Colaborador, ctx: ContextoDoAcesso): Assunto[] => {
  const telas = telasQueVejo(c, ctx);
  return ASSUNTOS.map((a) => ({ ...a, telas: a.telas.filter((t) => telas.has(t.id)) })).filter(
    (a) => a.telas.length > 0
  );
};

// ============================================================
// PARA ONDE CADA CAMINHO LEVA, no computador
// ============================================================

/** As telas do computador: as da barra, mais o perfil (pelo menu da foto). */
export type TelaWeb = TelaId | 'perfil';

/** Em que assunto a tela mora — para a barra marcar o item certo. */
export const assuntoDaTela = (tela: TelaWeb): AssuntoId | null =>
  ASSUNTOS.find((a) => a.telas.some((t) => t.id === tela))?.id ?? null;

/**
 * O AVISO, O SINO E O LEMBRETE abrem a tela do assunto. É a tradução das
 * seções que já existem (`SECOES_DESTINO`, destinoDoAviso.ts) — nenhum
 * aviso novo, nenhum caminho novo.
 */
export const TELA_DO_DESTINO: Record<string, TelaId> = {
  aprovar_jornadas: 'equipe_pendencias',
  escala_folgas: 'escala_folgas',
  meu_ponto: 'meu_ponto',
  meus_holerites: 'meus_documentos',
  minhas_advertencias: 'meus_documentos',
};

/** Os atalhos do painel do RH ("Assinar →", "Ver quem →"), pela seção de lá. */
export const TELA_DA_SECAO_DO_RH: Record<string, TelaId> = {
  painel: 'inicio',
  assinaturas: 'assinaturas',
  holerites: 'holerites',
  atestados: 'atestados',
  advertencias: 'advertencias',
  escala: 'escala_folgas',
  ferias: 'ferias_planejamento',
  espelhos: 'ponto_rede',
};

/**
 * A TELA QUE ABRE DE FATO: a pedida, se a pessoa a alcança; senão o Início.
 * Um aviso antigo, ou uma permissão retirada com o aviso já no aparelho, não
 * pode abrir uma tela que a pessoa não tem — nem uma tela em branco.
 */
export const telaQueAbre = (pedida: TelaWeb | null | undefined, visiveis: Set<TelaId>): TelaWeb => {
  if (pedida === 'perfil') return 'perfil';
  if (pedida && visiveis.has(pedida)) return pedida;
  return 'inicio';
};
