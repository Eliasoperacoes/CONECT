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
  | 'Estoque';

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
];

export type Loja =
  | 'Pirassununga'
  | 'Porto Ferreira'
  | 'Palmeiras'
  | 'Descalvado'
  | 'Santa Rita'
  | 'Rede';

export type NivelHierarquico = 1 | 2 | 3 | 4;
// 1 = Operador, 2 = Supervisor, 3 = Gestor, 4 = Administrador (só TI)

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
  departamento?: string;
  dataAdmissao?: string;
  permissoes?: string[];
  observacoes?: string;
  // Jornada contratada por dia útil, em minutos. Base do banco de horas.
  cargaHorariaDiariaMinutos?: number;
}

/** Jornada padrão quando o colaborador não tem carga própria cadastrada. */
export const CARGA_HORARIA_PADRAO_MINUTOS = 480; // 8h

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
  ehAvisoDirecao?: boolean;
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
