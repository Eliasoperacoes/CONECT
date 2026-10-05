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
  const telas = new Set<TelaId>(['inicio', 'central', 'meus_documentos', 'minhas_ausencias']);
  const se = (condicao: boolean, ...ids: TelaId[]) => condicao && ids.forEach((id) => telas.add(id));

  se(ctx.pode('conversas'), 'conversas');
  // Bater e justificar moram na mesma tela de hoje (AbaPonto)
  se(ctx.pode('ponto'), 'meu_ponto', 'pedir_ausencia');
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
      { id: 'pedir_ausencia', rotulo: 'Pedir' },
      { id: 'minhas_ausencias', rotulo: 'Minhas folgas e férias' },
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
