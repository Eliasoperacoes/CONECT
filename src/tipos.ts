/**
 * Tipos centrais do comunicador CONECTA — Malachias Autopeças
 * Todas as definições em português do Brasil conforme especificação
 */

export type Setor =
  | 'TI'
  | 'Diretoria'
  | 'Tesouraria'
  | 'Compras'
  | 'Garantia'
  | 'Callcenter'
  | 'Balcão'
  | 'Caixas'
  | 'Estoque';

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
}

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

export type AbaPrincipal = 'conversas' | 'grupos' | 'pessoas' | 'avisos' | 'admin' | 'eu';

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
