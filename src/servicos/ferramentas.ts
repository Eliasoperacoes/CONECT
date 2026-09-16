/**
 * Catálogo de ferramentas — CONECTA / Malachias Autopeças
 *
 * Toda tela e toda aba do sistema estão listadas aqui, uma vez só, com o
 * nível mínimo que as enxerga por padrão. O painel de administração lê esta
 * lista para montar a grade de permissões; nenhuma tela decide sozinha quem
 * a vê.
 *
 * ===================================================================
 * O QUE ISTO CONTROLA — E O QUE NÃO CONTROLA
 * ===================================================================
 *
 * Controla QUAIS FERRAMENTAS a pessoa enxerga.
 *
 * NÃO controla QUAIS DADOS aparecem dentro delas. Quem o gerente vê no
 * Quadro de Equipe, de quem ele aprova hora, qual saldo ele consegue abrir
 * — isso continua vindo da alçada (`organograma.temAlcadaSobre`) e da RLS
 * do banco, e não de marcar uma caixinha aqui.
 *
 * A separação é proposital e não pode ser afrouxada. Se ligar uma
 * ferramenta desse painel passasse a mostrar dado de quem não é seu, o
 * administrador daria acesso a folha de ponto da rede inteira sem perceber,
 * só arrastando um interruptor. Ferramenta é porta; alçada é o que existe
 * dentro da sala.
 *
 * ===================================================================
 * ACRESCENTAR UMA FERRAMENTA NOVA
 * ===================================================================
 *
 * Cadastre-a aqui. Ela aparece sozinha no painel de permissões, já com o
 * padrão que você definir, e o `chave` é o que a tela pergunta em
 * `permissoes.podeUsar(...)`. Não há segunda lista para manter.
 */
import {
  NivelHierarquico,
  NIVEL_COLABORADOR,
  NIVEL_LIDER_SETOR,
  NIVEL_GERENTE,
  NIVEL_DIRETORIA,
  NIVEL_TI,
} from '../tipos';

/** Onde a ferramenta mora, para o painel agrupar a grade. */
export type AreaDaFerramenta = 'principal' | 'gestao' | 'administracao';

export interface Ferramenta {
  /** Identificador estável. É o que fica gravado na configuração. */
  chave: string;
  nome: string;
  /** O que ela faz, em uma linha, para quem configura entender o efeito */
  descricao: string;
  area: AreaDaFerramenta;
  /** Quem enxerga por padrão, quando ninguém configurou nada */
  nivelPadrao: NivelHierarquico;
  /**
   * Ferramenta que não pode ser desligada de quem está no topo. É o que
   * impede o administrador de se trancar para fora do próprio painel.
   */
  sempreParaTI?: boolean;
  /** Aviso mostrado no painel quando a ferramenta mexe em dado sensível */
  cuidado?: string;
}

export const FERRAMENTAS: Ferramenta[] = [
  // --- O dia a dia de qualquer pessoa ---
  {
    chave: 'conversas',
    nome: 'Conversas',
    descricao: 'Chat individual com os colegas da rede.',
    area: 'principal',
    nivelPadrao: NIVEL_COLABORADOR,
  },
  {
    chave: 'grupos',
    nome: 'Grupos e canais',
    descricao: 'Canais da loja e da rede.',
    area: 'principal',
    nivelPadrao: NIVEL_COLABORADOR,
  },
  {
    chave: 'ponto',
    nome: 'Meu ponto',
    descricao: 'Bater o ponto pelo QR e ver o próprio extrato.',
    area: 'principal',
    nivelPadrao: NIVEL_COLABORADOR,
  },
  {
    chave: 'eu',
    nome: 'Meu perfil',
    descricao: 'Foto, presença, dados cadastrais e preferências.',
    area: 'principal',
    nivelPadrao: NIVEL_COLABORADOR,
  },

  // --- Quem responde por alguém ---
  {
    chave: 'painel_gestao',
    nome: 'Minha Equipe',
    descricao:
      'Banco de horas, pendências e ficha de quem responde à pessoa. Mostra apenas a equipe dela.',
    area: 'gestao',
    nivelPadrao: NIVEL_LIDER_SETOR,
  },
  {
    chave: 'aprovar_jornadas',
    nome: 'Aprovar jornadas',
    descricao: 'A fila de horas extras e saídas antecipadas aguardando decisão.',
    area: 'gestao',
    nivelPadrao: NIVEL_LIDER_SETOR,
  },
  {
    chave: 'quadro_equipe',
    nome: 'Quadro de Equipe',
    descricao: 'A lista de pessoas com foto, ramal, setor e ficha.',
    area: 'gestao',
    nivelPadrao: NIVEL_LIDER_SETOR,
  },
  {
    chave: 'visao_lojas',
    nome: 'Visão & Lojas',
    descricao: 'Números da rede inteira: total por loja, por setor e quem está online.',
    area: 'gestao',
    nivelPadrao: NIVEL_DIRETORIA,
    cuidado: 'Mostra a rede toda, não só a loja de quem abre.',
  },
  {
    chave: 'organograma',
    nome: 'Organograma',
    descricao:
      'A cadeia de responsabilidade. Alterar aqui muda quem aprova a hora de quem.',
    area: 'gestao',
    nivelPadrao: NIVEL_DIRETORIA,
    cuidado: 'Editar continua restrito a RH, Diretoria e TI, mesmo para quem enxerga.',
  },
  {
    chave: 'banco_horas_rh',
    nome: 'Banco de Horas (RH)',
    descricao:
      'O painel de RH: espelho de ponto, correção de marcação e QR das lojas.',
    area: 'gestao',
    nivelPadrao: NIVEL_DIRETORIA,
    cuidado: 'Corrigir marcação é registro trabalhista — segue restrito ao RH.',
  },
  {
    chave: 'avisos_direcao',
    nome: 'Avisos & Direção',
    descricao: 'Central de comunicados oficiais da rede.',
    area: 'gestao',
    nivelPadrao: NIVEL_LIDER_SETOR,
  },

  // --- Administração do sistema ---
  {
    chave: 'adm_colaboradores',
    nome: 'ADM · Colaboradores',
    descricao: 'Cadastrar, editar e desligar pessoas.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
  },
  {
    chave: 'adm_planilha',
    nome: 'ADM · Carga por planilha',
    descricao: 'Importar colaboradores em lote.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
  },
  {
    chave: 'adm_lojas',
    nome: 'ADM · Lojas',
    descricao: 'Unidades da rede.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
  },
  {
    chave: 'adm_canais',
    nome: 'ADM · Canais',
    descricao: 'Criar e configurar os canais de mensagem.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
  },
  {
    chave: 'adm_avisos',
    nome: 'ADM · Avisos',
    descricao: 'Publicar e remover comunicados da direção.',
    area: 'administracao',
    nivelPadrao: NIVEL_DIRETORIA,
  },
  {
    chave: 'adm_parametros',
    nome: 'ADM · Parâmetros',
    descricao: 'Ajustes gerais do sistema.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
  },
  {
    chave: 'adm_permissoes',
    nome: 'ADM · Permissões',
    descricao: 'Esta tela: define quais ferramentas cada nível enxerga.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
    sempreParaTI: true,
    cuidado: 'Desligar isto trancaria o administrador para fora da própria configuração.',
  },
  {
    chave: 'adm_auditoria',
    nome: 'ADM · Auditoria',
    descricao: 'O registro do que cada pessoa fez no sistema.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
  },
  {
    chave: 'adm_banco',
    nome: 'ADM · Banco de dados',
    descricao: 'Uso de espaço e regra de limpeza do histórico.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
    sempreParaTI: true,
  },
  {
    chave: 'adm_backup',
    nome: 'ADM · Backup',
    descricao: 'Exportar e restaurar os dados do sistema.',
    area: 'administracao',
    nivelPadrao: NIVEL_TI,
    sempreParaTI: true,
    cuidado: 'Dá acesso ao conteúdo inteiro do sistema em arquivo.',
  },
];

export const ROTULO_AREA: Record<AreaDaFerramenta, string> = {
  principal: 'Uso geral',
  gestao: 'Gestão de equipe',
  administracao: 'Administração do sistema',
};

/** Busca pelo identificador. */
export const acharFerramenta = (chave: string): Ferramenta | undefined =>
  FERRAMENTAS.find((f) => f.chave === chave);

/**
 * O mapa padrão: para cada ferramenta, os níveis que a enxergam.
 *
 * Nasce de `nivelPadrao` — "deste nível para cima". O painel grava as
 * mudanças por cima disto, e ferramenta nova entra já com o padrão dela
 * sem precisar de migração.
 */
export const permissoesPadrao = (): Record<string, NivelHierarquico[]> => {
  const mapa: Record<string, NivelHierarquico[]> = {};
  const niveis: NivelHierarquico[] = [
    NIVEL_COLABORADOR,
    NIVEL_LIDER_SETOR,
    NIVEL_GERENTE,
    NIVEL_DIRETORIA,
    NIVEL_TI,
  ];

  for (const ferramenta of FERRAMENTAS) {
    mapa[ferramenta.chave] = niveis.filter((n) => n >= ferramenta.nivelPadrao);
  }
  return mapa;
};
