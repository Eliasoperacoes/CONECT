/**
 * Tipos centrais do comunicador CONECTA — Malachias Autopeças
 * Todas as definições em português do Brasil conforme especificação
 */

export type Setor =
  | 'TI'
  | 'Diretoria'
  | 'RH'
  | 'Tesouraria'
  | 'Compras'
  | 'Garantia'
  | 'Callcenter'
  | 'Balcão'
  | 'Caixas'
  | 'Estoque'
  | 'Logística'
  | 'Estágio'
  | 'Administrativo'
  | 'Gerência';

// Lista única usada nos formulários e filtros, para não repetir os setores
export const SETORES: Setor[] = [
  'TI',
  'Diretoria',
  'RH',
  'Tesouraria',
  'Compras',
  'Garantia',
  'Callcenter',
  'Balcão',
  'Caixas',
  'Estoque',
  'Logística',
  'Estágio',
  'Administrativo',
  'Gerência',
];

export type Loja =
  | 'Pirassununga'
  | 'Porto Ferreira'
  | 'Palmeiras'
  | 'Descalvado'
  | 'Santa Rita'
  | 'Rede';

/**
 * Hierarquia da rede, do chão para a cúpula.
 *
 * Na matriz (Pirassununga) existem líderes de setor além do gerente. Nas
 * filiais essa responsabilidade fica com o gerente — mas o nível continua
 * disponível em qualquer loja, porque há exceção real: a liderança de
 * Compras atua nas cinco lojas.
 */
export type NivelHierarquico = 1 | 2 | 3 | 4 | 5;

export const NIVEL_COLABORADOR = 1;
export const NIVEL_LIDER_SETOR = 2;
export const NIVEL_GERENTE = 3;
export const NIVEL_DIRETORIA = 4;
export const NIVEL_TI = 5;

export const ROTULO_NIVEL: Record<NivelHierarquico, string> = {
  1: 'Colaborador',
  2: 'Líder de Setor',
  3: 'Gerente',
  4: 'Diretoria',
  5: 'TI',
};

export const DESCRICAO_NIVEL: Record<NivelHierarquico, string> = {
  1: 'Conversa com a equipe e bate o próprio ponto.',
  2: 'Acompanha o próprio setor — inclusive em outras lojas, quando o setor é da rede.',
  3: 'Responde pela loja inteira.',
  4: 'Enxerga a rede e publica comunicados oficiais.',
  5: 'Administra o sistema, os cadastros e o banco de dados.',
};

export const NIVEIS_EM_ORDEM: NivelHierarquico[] = [1, 2, 3, 4, 5];

/**
 * Cargos usados na rede, para sugerir no cadastro e manter a grafia igual.
 *
 * O campo continua aceitando qualquer texto: a lista existe para evitar que a
 * mesma função apareça como "Balconista", "balconista" e "Balconista(a)" nos
 * filtros e relatórios, não para proibir um cargo novo.
 *
 * CARGO NÃO DEFINE NÍVEL. Todos abaixo são de gente de nível 1; quem responde
 * por equipe recebe o nível à parte, no campo próprio.
 */
export const CARGOS_SUGERIDOS: string[] = [
  'Administrativo',
  'Balconista',
  'Caixa',
  'Comprador(a)',
  'Conferente',
  'Estagiário(a)',
  'Estoquista',
  'Motoboy',
  'Operador(a) de Caixa',
  'Telefonista',
  'Vendedor(a)',
];

/**
 * Quem cuida de pessoas: RH, Diretoria e TI. É a permissão que abre o
 * cadastro de colaborador e o ajuste de ponto dos outros.
 */
export const cuidaDePessoas = (c: { nivel: number; setor: string }): boolean =>
  c.nivel >= NIVEL_DIRETORIA || c.setor === 'RH';

/** Administra o sistema: só o TI. */
export const ehAdministrador = (c: { nivel: number }): boolean => c.nivel >= NIVEL_TI;

/**
 * Enxerga o painel de RH & Rede. O líder de setor entra aqui, mas o que ele
 * vê lá dentro é o setor dele, não a rede.
 */
export const vePainelDeRede = (c: { nivel: number; setor: string }): boolean =>
  c.nivel >= NIVEL_LIDER_SETOR || c.setor === 'RH';

/** Publica comunicado oficial da rede: Diretoria e TI. */
export const publicaComunicado = (c: { nivel: number }): boolean => c.nivel >= NIVEL_DIRETORIA;

export type EstadoPresenca = 'disponivel' | 'ocupado' | 'ausente' | 'desconectado';

export interface Colaborador {
  id: string;
  nome: string;
  login: string;
  senha?: string;
  cargo: string;
  setor: Setor;
  loja: Loja;
  nivel: NivelHierarquico;
  foto: string;
  presenca: EstadoPresenca;
  vistoPorUltimo: string;
  ramal?: string;
  telefone?: string;
  email?: string;
  ativo: boolean;
  criadoEm?: string;
  // Campos complementares para dados individuais e permissões do sistema
  matricula?: string;
  /** CNPJ em que o colaborador esta registrado. O grupo tem mais de um, e
   *  nem sempre e o da loja onde a pessoa trabalha. */
  cnpj?: string;
  departamento?: string;
  /**
   * Responsável direto no organograma. É quem aprova a hora desta pessoa —
   * quando preenchido, substitui o alcance automático por setor/loja.
   * Vazio = ainda não posicionado, vale a regra automática.
   */
  responsavelId?: string;
  dataAdmissao?: string;
  permissoes?: string[];
  observacoes?: string;
  // Jornada contratada por dia útil, em minutos. Base do banco de horas.
  cargaHorariaDiariaMinutos?: number;
}

/** Jornada padrão quando o colaborador não tem carga própria cadastrada. */
export const CARGA_HORARIA_PADRAO_MINUTOS = 480; // 8h

/**
 * Tolerancia diaria padrao, em minutos.
 *
 * Dez minutos e o limite do art. 58 par. 1 da CLT: variacoes de ate 5 minutos
 * por marcacao, limitadas a 10 no dia, nao sao jornada extraordinaria. O
 * numero fica configuravel, mas o padrao sai da lei e nao de gosto.
 */
export const TOLERANCIA_PONTO_PADRAO_MINUTOS = 10;

/** Comeco da jornada, quando a rede nao configurou outro. */
export const HORARIO_ENTRADA_PADRAO = '08:00';

/** Intervalo de almoco contratado, quando nao configurado. */
export const INTERVALO_ALMOCO_PADRAO_MINUTOS = 60;

export type TipoMensagem = 'texto' | 'recado_voz' | 'arquivo' | 'imagem';

export interface Mensagem {
  id: string;
  conversaId: string;
  remetenteId: string;
  texto?: string;
  tipo: TipoMensagem;
  audioUrl?: string;
  audioDuracao?: number; // em segundos
  arquivoNome?: string;
  arquivoTamanho?: string;
  // Conteúdo do anexo em data URL. Sem ele o download não teria o que entregar.
  arquivoUrl?: string;
  imagemUrl?: string;
  legenda?: string;
  criadoEm: string; // ISO string
  horaFormatada: string; // ex: "14:35"
  lida: boolean;
  lidaPor?: string[]; // IDs dos colaboradores que visualizaram
  visualizadaEm?: string; // Data/hora da confirmação de visualização
  ehEncaminhada?: boolean; // Indicador de mensagem encaminhada
  editadaEm?: string; // Quando foi alterada pelo autor, se foi
  // Caminho do anexo no armazenamento. As URLs acima trazem o conteudo
  // pronto para exibir; este campo e o endereco permanente dele no banco.
  anexoCaminho?: string;
  ehAvisoDirecao?: boolean;
  /**
   * Fixada no alto da conversa, a vista de todos os participantes.
   * Diferente de fixar CONVERSA na lista, que e preferencia de cada um.
   */
  fixadaEm?: string;
  fixadaPorId?: string;
  reacoes?: Record<string, string[]>; // ex: { '👍': ['colab-1', 'colab-2'], '✅': ['colab-3'] }
}

export type TipoConversa = 'individual' | 'grupo';

export interface Conversa {
  id: string;
  tipo: TipoConversa;
  nome: string;
  foto?: string;
  participantesIds: string[];
  ultimaMensagem?: {
    texto: string;
    hora: string;
    remetenteId: string;
    tipo: TipoMensagem;
  };
  naoLidas: number;
  atualizadoEm: string;
  // Campos específicos de grupo
  descricao?: string;
  criadoPorId?: string;
  apenasGestoresPublicam?: boolean; // ex: "Avisos da Rede" onde só nível 3+ publica
  ehSistemaPadrao?: boolean;
}

// Abas da barra inferior: Conversas | Grupos | Rede (painel) | Eu
export type AbaPrincipal = 'conversas' | 'grupos' | 'ponto' | 'painel' | 'eu';

export interface RegistroAuditoria {
  id: string;
  dataHora: string;
  usuarioNome: string;
  acao: string;
  categoria: 'usuario' | 'grupo' | 'aviso' | 'sistema' | 'seguranca';
  detalhes: string;
}

export interface ConfiguracaoSistema {
  nomeEmpresa: string;
  bipeRadioAtivo: boolean;
  tempoMaximoRadioSegundos: number;
  /**
   * Quais ferramentas cada nivel enxerga. Chave da ferramenta -> niveis.
   *
   * E configuracao da REDE, nao do aparelho: o administrador muda num lugar
   * e vale em todos. Vazio significa "vale o padrao do catalogo", nunca
   * "ninguem ve nada" nem "todo mundo ve tudo".
   */
  permissoesFerramentas?: Record<string, number[]>;
  /**
   * Tolerancia diaria, em minutos, sobre a diferenca AGREGADA do dia.
   *
   * Dentro dela a diferenca entra no banco sem passar por ninguem; fora
   * dela, o dia inteiro vira pendencia com o valor CHEIO — a tolerancia e
   * tudo-ou-nada por dia, nao um desconto.
   *
   * Configuravel de proposito: era um numero fixo espalhado pelo codigo, e
   * mudar exigia deploy.
   */
  toleranciaPontoMinutos?: number;
  /** Horario em que a jornada comeca, para saber se a entrada atrasou. */
  horarioEntradaPadrao?: string;
  /** Intervalo de almoco contratado, para saber se o retorno atrasou. */
  intervaloAlmocoPadraoMinutos?: number;
  /** Meses de conversa guardados antes da limpeza automatica. */
  mesesHistoricoConversas: number;
  /** Quando a limpeza rodou pela ultima vez. */
  ultimaLimpezaConversas?: string;
  modoManutencao: boolean;
  permitirCriacaoGruposPorOperadores: boolean;
}

export type PrioridadeAviso = 'geral' | 'atencao' | 'urgente';

export interface AvisoRede {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: PrioridadeAviso;
  autorId: string;
  autorNome: string;
  autorCargo: string;
  criadoEm: string;
  horaFormatada: string;
  dataPorExtenso: string;
  fixadoNoTopo: boolean;
  lojaDestino: Loja | 'Todas';
  lidoPorIds: string[];
  confirmacoesIds: string[];
}

export type EstadoTransmissaoRadio =
  | 'ocioso'
  | 'chamando'
  | 'falando'
  | 'ouvindo'
  | 'recado_automatico'
  | 'ocupado_outro';

export interface SolicitacaoRadioAoVivo {
  deId: string;
  paraId?: string; // se conversa individual
  grupoId?: string; // se grupo
  conversaId: string;
  nomeFalante: string;
  fotoFalante: string;
  iniciadoEm: number;
}

// ============================================================
// BANCO DE HORAS E REGISTRO DE PONTO
// ============================================================

/** As quatro marcações da jornada, sempre nesta ordem. */
export type TipoMarcacao = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';

export const ORDEM_MARCACOES: TipoMarcacao[] = [
  'entrada',
  'saida_almoco',
  'retorno_almoco',
  'saida',
];

export const ROTULO_MARCACAO: Record<TipoMarcacao, string> = {
  entrada: 'Entrada',
  saida_almoco: 'Saída para almoço',
  retorno_almoco: 'Retorno do almoço',
  saida: 'Saída',
};

/** Como a marcação foi comprovada. */
export type MetodoMarcacao = 'qrcode' | 'codigo_manual' | 'ajuste_rh';

export interface RegistroPonto {
  id: string;
  colaboradorId: string;
  data: string; // AAAA-MM-DD no fuso local
  tipo: TipoMarcacao;
  horario: string; // ISO completo do instante da marcação
  horaFormatada: string; // ex: "08:03"
  metodo: MetodoMarcacao;
  loja: Loja; // loja onde o ponto foi comprovado
  criadoEm: string;
  // Preenchidos apenas quando o RH lança ou corrige uma marcação
  ajustadoPorId?: string;
  ajustadoPorNome?: string;
  justificativa?: string;
}

/** Jornada consolidada de um dia para um colaborador. */
export interface JornadaDia {
  data: string; // AAAA-MM-DD
  colaboradorId: string;
  marcacoes: Partial<Record<TipoMarcacao, RegistroPonto>>;
  minutosTrabalhados: number;
  minutosIntervalo: number;
  minutosPrevistos: number;
  saldoMinutos: number; // trabalhados - previstos
  completa: boolean; // as quatro marcações registradas
  emAndamento: boolean; // começou e ainda não encerrou
}

// ============================================================
// APURAÇÃO DO DIA E APROVAÇÃO
//
// A jornada fechada que não bate com as 8h contratadas não vira saldo
// sozinha. O sistema levanta a diferença e manda para o responsável decidir
// — hora extra foi autorizada? a saída mais cedo foi combinada? Só depois do
// aval é que entra no banco de horas.
//
// O caminho é sempre o mesmo, sem atalho:
//   colaborador bate o ponto → líder ou gerente decide → banco de horas
// ============================================================

/** Sobra ou falta em relação à jornada contratada do dia. */
export type TipoAjuste = 'hora_extra' | 'debito';

export type EstadoAjuste = 'pendente' | 'aprovado' | 'recusado';

export const ROTULO_TIPO_AJUSTE: Record<TipoAjuste, string> = {
  hora_extra: 'Hora extra',
  debito: 'Saída antecipada / atraso',
};

export const ROTULO_ESTADO_AJUSTE: Record<EstadoAjuste, string> = {
  pendente: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

/**
 * De onde veio a apuracao.
 *
 * 'tolerancia_automatica' nasce ja aprovada, sem aprovador humano: e a
 * diferenca pequena que a CLT (art. 58 par. 1) manda desprezar. Guardamos a
 * origem para o espelho conseguir dizer que ninguem carimbou aquilo — e para
 * o RH separar o que foi decisao de gente do que foi regra.
 */
export type OrigemAjuste = 'pendencia' | 'tolerancia_automatica';

export interface AjusteJornada {
  id: string;
  colaboradorId: string;
  data: string; // AAAA-MM-DD
  tipo: TipoAjuste;
  /** Sempre positivo. O sinal vem do tipo, para não haver dois jeitos de ler. */
  minutos: number;
  /** O que a batida apurou, guardado junto para a conferência não depender
   *  de recalcular o dia meses depois. */
  minutosTrabalhados: number;
  minutosPrevistos: number;
  estado: EstadoAjuste;
  aprovadorId?: string;
  aprovadorNome?: string;
  decididoEm?: string;
  observacao?: string;
  /** Vazio nas antigas: elas nasceram antes de a tolerancia existir. */
  origem?: OrigemAjuste;
  /**
   * O que o colaborador escreveu no ato da batida.
   *
   * Sem isto o aprovador decide no escuro: ve "trabalhou 9h10 de 8h00" e nao
   * sabe se foi entrega atrasada, cliente no balcao ou esquecimento.
   */
  motivoColaborador?: string;
  /** Comprovante que ele anexou junto, no armazenamento privado. */
  anexoCaminho?: string;
  criadoEm: string;
}

// ============================================================
// AUSENCIA JUSTIFICADA
//
// O que NAO passa por batida: atestado, falta, comparecimento. Segue a mesma
// cadeia de aprovacao da jornada, e pela mesma razao — quem responde pela
// pessoa e quem decide.
// ============================================================

export type TipoAusencia =
  | 'atestado'
  | 'falta_justificada'
  | 'comparecimento'
  | 'outro';

export const ROTULO_TIPO_AUSENCIA: Record<TipoAusencia, string> = {
  atestado: 'Atestado médico',
  falta_justificada: 'Falta justificada',
  comparecimento: 'Comparecimento (declaração)',
  outro: 'Outro',
};

export type EstadoJustificativa = 'pendente' | 'aprovada' | 'recusada';

export interface JustificativaAusencia {
  id: string;
  colaboradorId: string;
  /** AAAA-MM-DD. Um atestado de 3 dias e UMA solicitacao, nao tres. */
  dataInicio: string;
  dataFim: string;
  tipo: TipoAusencia;
  observacao?: string;
  anexoCaminho?: string;
  anexoNome?: string;
  estado: EstadoJustificativa;
  aprovadorId?: string;
  aprovadorNome?: string;
  decididoEm?: string;
  motivoRecusa?: string;
  criadoEm: string;
}

/**
 * Situacao de um dia que nao tem jornada batida.
 *
 * Existe para o dia deixar de ser so "sem batida" depois que a ausencia e
 * aprovada — senao o espelho de ponto sai com um buraco e ninguem sabe se
 * foi falta, atestado ou esquecimento.
 */
export type SituacaoDoDia =
  | 'normal'
  | 'abonado_atestado'
  | 'falta_justificada'
  | 'comparecimento'
  | 'abonado_outro';

export const SITUACAO_POR_TIPO: Record<TipoAusencia, SituacaoDoDia> = {
  atestado: 'abonado_atestado',
  falta_justificada: 'falta_justificada',
  comparecimento: 'comparecimento',
  outro: 'abonado_outro',
};

export const ROTULO_SITUACAO: Record<SituacaoDoDia, string> = {
  normal: '',
  abonado_atestado: 'Atestado',
  falta_justificada: 'Falta justificada',
  comparecimento: 'Comparecimento',
  abonado_outro: 'Abonado',
};

/** Quanto o ajuste soma ou subtrai do banco de horas. */
export const minutosComSinal = (ajuste: AjusteJornada): number =>
  ajuste.tipo === 'debito' ? -ajuste.minutos : ajuste.minutos;

/** Código de ponto de uma loja, materializado no QR impresso. */
export interface CodigoPontoLoja {
  loja: Loja;
  codigo: string; // 6 caracteres, digitáveis à mão
  atualizadoEm: string;
  atualizadoPorNome?: string;
}

/** Linha do painel de RH: colaborador + números do período. */
export interface ResumoPontoColaborador {
  colaborador: Colaborador;
  jornadas: JornadaDia[];
  minutosTrabalhados: number;
  minutosPrevistos: number;
  saldoPeriodoMinutos: number;
  saldoAcumuladoMinutos: number;
  diasCompletos: number;
  diasComPendencia: number;
  registrouHoje: boolean;
}

// ============================================================
// UNIDADES DA REDE
// ============================================================

export interface InfoLoja {
  nome: Loja;
  tipo: 'Matriz' | 'Filial' | 'Central';
  cidade: string;
  gerente: string;
  telefone: string;
  grupoId?: string;
}

/** Cadastro único das unidades, usado pelo Painel da Rede e pelo RH. */
export const INFORMACOES_LOJAS: InfoLoja[] = [
  {
    nome: 'Pirassununga',
    tipo: 'Matriz',
    cidade: 'Pirassununga - SP',
    gerente: 'Carlos Malachias / Marcos',
    telefone: '(19) 3561-1000',
    grupoId: 'grupo-loja-pirassununga',
  },
  {
    nome: 'Porto Ferreira',
    tipo: 'Filial',
    cidade: 'Porto Ferreira - SP',
    gerente: 'Roberto Fagundes',
    telefone: '(19) 3581-2000',
    grupoId: 'grupo-loja-porto-ferreira',
  },
  {
    nome: 'Palmeiras',
    tipo: 'Filial',
    cidade: 'Santa Cruz das Palmeiras - SP',
    gerente: 'Márcio Prado',
    telefone: '(19) 3672-3000',
    grupoId: 'grupo-loja-palmeiras',
  },
  {
    nome: 'Descalvado',
    tipo: 'Filial',
    cidade: 'Descalvado - SP',
    gerente: 'Fernanda Alves',
    telefone: '(19) 3583-4000',
    grupoId: 'grupo-loja-descalvado',
  },
  {
    nome: 'Santa Rita',
    tipo: 'Filial',
    cidade: 'Santa Rita do Passa Quatro - SP',
    gerente: 'André Villanova',
    telefone: '(19) 3582-5000',
    grupoId: 'grupo-loja-santa-rita',
  },
  {
    nome: 'Rede',
    tipo: 'Central',
    cidade: 'Operações Centrais',
    gerente: 'Vanessa / Marcelo',
    telefone: '(19) 3561-9900',
    grupoId: 'grupo-avisos-da-rede',
  },
];

/**
 * Senha entregue pelo RH para o primeiro acesso de cada colaborador.
 * Trocá-la é obrigatório na primeira entrada. O mínimo de 6 caracteres é
 * exigência da autenticação do Supabase, por isso não pode ser menor.
 */
export const SENHA_PADRAO_PRIMEIRO_ACESSO = '123456';
