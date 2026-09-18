/**
 * Banco de Dados e Serviços do CONECTA — Malachias Autopeças
 *
 * No modo rede, TUDO vive no Supabase: pessoas, conversas, mensagens,
 * leituras, avisos, configurações, auditoria e ponto. O armazenamento do
 * navegador continua no papel de cache — é o que deixa a leitura instantânea
 * e segura a oscilação de wi-fi da loja —, mas nada nasce e morre só nele.
 *
 * Fica de propósito preso ao aparelho apenas o que É do aparelho: quem está
 * logado nele e a sugestão de conta do último acesso.
 */

import { usandoNuvem, temSessaoViva } from './supabase';
import {
  NIVEL_TI,
  NIVEL_DIRETORIA,
  NIVEL_GERENTE,
  publicaComunicado,
} from '../tipos';
import { nuvem } from './nuvem';
import { podeSerResponsavelDe } from './organograma';
import {
  nuvemComunicacao,
  conversaJaEstaNoBanco,
  esquecerConversaDoBanco,
  montarPreviaDaMensagem,
  carimboDeAuditoria,
} from './nuvemComunicacao';
import { enviarAnexo, apagarAnexos } from './anexos';
import {
  Colaborador,
  Conversa,
  Mensagem,
  NivelHierarquico,
  EstadoPresenca,
  TipoMensagem,
  AvisoRede,
  PrioridadeAviso,
  Loja,
  Setor,
  RegistroAuditoria,
  ConfiguracaoSistema,
  CARGA_HORARIA_PADRAO_MINUTOS,
  TURNO_PADRAO,
  SENHA_PADRAO_PRIMEIRO_ACESSO,
} from '../tipos';

const CHAVE_COLABORADORES = 'conecta_v4_colaboradores';
const CHAVE_CONVERSAS = 'conecta_v4_conversas';
const CHAVE_MENSAGENS = 'conecta_v4_mensagens';
const CHAVE_COLABORADOR_ATUAL = 'conecta_v4_colaborador_atual';
const CHAVE_AVISO_LIDO = 'conecta_v4_aviso_direcao_lido';
const CHAVE_AVISOS_REDE = 'conecta_v4_avisos_rede';
const CHAVE_CONFIGURACOES = 'conecta_v4_configuracoes';
const CHAVE_AUDITORIA = 'conecta_v4_auditoria';
// Guarda apenas o ID do último colaborador que entrou NESTE dispositivo,
// para sugerir a conta no próximo acesso. Nenhuma senha é armazenada.
const CHAVE_ULTIMO_ACESSO_DISPOSITIVO = 'conecta_v4_ultimo_acesso_dispositivo';

// Logo oficial da Malachias Autopeças como padrão de foto de usuário da rede
export const FOTO_PADRAO_LOGO_EMPRESA = '/logo-malachias.svg';

/**
 * Resposta das ferramentas de demonstração quando o sistema está ligado ao
 * banco. Elas mexiam só no armazenamento deste aparelho: rodar uma delas na
 * rede criaria gente que não existe para o banco e sumiria na sincronização
 * seguinte — parecendo que o sistema perdeu dados.
 */
/** AAAA-MM-DD no fuso local — comparável como texto, sem tropeçar em UTC. */
const emIso = (data: Date): string =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(
    data.getDate()
  ).padStart(2, '0')}`;

const hojeEmIso = (): string => emIso(new Date());

const RECUSA_MODO_REDE =
  'Indisponível com o banco da rede ligado. Os dados agora vêm do Supabase, e esta ferramenta só altera este aparelho.';

export const obterFotoColaborador = (colaborador?: { foto?: string } | null): string => {
  if (!colaborador || !colaborador.foto || !colaborador.foto.trim() || colaborador.foto.includes('unsplash.com')) {
    return FOTO_PADRAO_LOGO_EMPRESA;
  }
  return colaborador.foto;
};

// Conta mestre de administrador solicitada pelo cliente: Login: Elias / Senha: 123
export const COLABORADOR_ADMIN_ELIAS: Colaborador = {
  id: 'colab-admin-elias',
  nome: 'Elias Malachias',
  login: 'Elias',
  senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
  cargo: 'Administrador Geral',
  setor: 'TI',
  loja: 'Pirassununga',
  nivel: 4, // 4 = Administrador com poder total
  foto: FOTO_PADRAO_LOGO_EMPRESA,
  presenca: 'disponivel',
  vistoPorUltimo: 'Agora',
  ramal: '100',
  telefone: '(19) 3561-1000',
  email: 'elias@malachiasautopecas.com.br',
  ativo: true,
  criadoEm: new Date().toISOString(),
};

const CONFIGURACAO_PADRAO: ConfiguracaoSistema = {
  nomeEmpresa: 'Malachias Autopeças',
  mesesHistoricoConversas: 2,
  modoManutencao: false,
  permitirCriacaoGruposPorOperadores: false,
};

// Equipe exemplo para demonstração opcional no Painel ADM
const COLABORADORES_EXEMPLO_REDE: Omit<Colaborador, 'id'>[] = [
  {
    nome: 'Carlos Malachias',
    login: 'carlos',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Diretor de Operações',
    setor: 'Diretoria',
    loja: 'Pirassununga',
    nivel: 3,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '101',
    telefone: '(19) 3561-1001',
    email: 'carlos@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Rodrigo Lima',
    login: 'rodrigo',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Balconista Especialista',
    setor: 'Balcão',
    loja: 'Pirassununga',
    nivel: 1,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '102',
    telefone: '(19) 3561-1002',
    email: 'rodrigo.balcao@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Marcos Silveira',
    login: 'marcos',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Supervisor de Estoque',
    setor: 'Estoque',
    loja: 'Pirassununga',
    nivel: 2,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'ocupado',
    vistoPorUltimo: 'Há 2 min',
    ramal: '103',
    telefone: '(19) 3561-1003',
    email: 'marcos.estoque@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Renata Souza',
    login: 'renata',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Operadora de Caixa',
    setor: 'Caixas',
    loja: 'Pirassununga',
    nivel: 1,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '104',
    telefone: '(19) 3561-1004',
    email: 'renata.caixa@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Juliana Costa',
    login: 'juliana',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Balconista Líder',
    setor: 'Balcão',
    loja: 'Porto Ferreira',
    nivel: 1,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Há 5 min',
    ramal: '201',
    telefone: '(19) 3581-2001',
    email: 'juliana.pf@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Roberto Fagundes',
    login: 'roberto',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Gerente de Filial',
    setor: 'Balcão',
    loja: 'Porto Ferreira',
    nivel: 3,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '200',
    telefone: '(19) 3581-2000',
    email: 'roberto.pf@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Lucas Mendonça',
    login: 'lucas',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Supervisor de Filial',
    setor: 'Balcão',
    loja: 'Palmeiras',
    nivel: 2,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '301',
    telefone: '(19) 3672-3001',
    email: 'lucas.palmeiras@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Fernanda Alves',
    login: 'fernanda',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Gerente de Filial',
    setor: 'Balcão',
    loja: 'Descalvado',
    nivel: 3,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '400',
    telefone: '(19) 3583-4000',
    email: 'fernanda.descalvado@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Tiago Rocha',
    login: 'tiago',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Balconista Peças Linha Diesel',
    setor: 'Balcão',
    loja: 'Descalvado',
    nivel: 1,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Há 10 min',
    ramal: '402',
    telefone: '(19) 3583-4002',
    email: 'tiago.descalvado@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'André Villanova',
    login: 'andre',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Gerente de Filial',
    setor: 'Balcão',
    loja: 'Santa Rita',
    nivel: 3,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '500',
    telefone: '(19) 3582-5000',
    email: 'andre.santarita@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Mariana Castro',
    login: 'mariana',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Balconista Especialista',
    setor: 'Balcão',
    loja: 'Santa Rita',
    nivel: 1,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Há 2 min',
    ramal: '502',
    telefone: '(19) 3582-5002',
    email: 'mariana.santarita@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Vanessa Toledo',
    login: 'vanessa',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Supervisora de Callcenter',
    setor: 'Callcenter',
    loja: 'Rede',
    nivel: 2,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '901',
    telefone: '(19) 3561-9001',
    email: 'vanessa.sac@malachiasautopecas.com.br',
    ativo: true,
  },
  {
    nome: 'Marcelo Guimarães',
    login: 'marcelo',
    senha: SENHA_PADRAO_PRIMEIRO_ACESSO,
    cargo: 'Comprador Sênior da Rede',
    setor: 'Compras',
    loja: 'Rede',
    nivel: 3,
    foto: FOTO_PADRAO_LOGO_EMPRESA,
    presenca: 'disponivel',
    vistoPorUltimo: 'Agora',
    ramal: '903',
    telefone: '(19) 3561-9003',
    email: 'marcelo.compras@malachiasautopecas.com.br',
    ativo: true,
  },
];

export const DEFINICAO_CANAIS_LOJAS_REDE: Array<{
  id: string;
  loja: Loja;
  nome: string;
  descricao: string;
  mensagemBoasVindas: string;
}> = [
  {
    id: 'grupo-loja-pirassununga',
    loja: 'Pirassununga',
    nome: 'Pirassununga (Matriz)',
    descricao: 'Canal operacional da loja Matriz de Pirassununga.',
    mensagemBoasVindas: 'Canal operacional da loja Matriz de Pirassununga ativo no CONECTA.',
  },
  {
    id: 'grupo-loja-porto-ferreira',
    loja: 'Porto Ferreira',
    nome: 'Porto Ferreira (Filial 01)',
    descricao: 'Canal operacional da filial 01 de Porto Ferreira.',
    mensagemBoasVindas: 'Canal operacional da filial 01 de Porto Ferreira ativo no CONECTA.',
  },
  {
    id: 'grupo-loja-palmeiras',
    loja: 'Palmeiras',
    nome: 'Palmeiras (Filial 02)',
    descricao: 'Canal operacional da filial 02 de Santa Cruz das Palmeiras.',
    mensagemBoasVindas: 'Canal operacional da filial 02 de Santa Cruz das Palmeiras ativo no CONECTA.',
  },
  {
    id: 'grupo-loja-descalvado',
    loja: 'Descalvado',
    nome: 'Descalvado (Filial 03)',
    descricao: 'Canal operacional da filial 03 de Descalvado.',
    mensagemBoasVindas: 'Canal operacional da filial 03 de Descalvado ativo no CONECTA.',
  },
  {
    id: 'grupo-loja-santa-rita',
    loja: 'Santa Rita',
    nome: 'Santa Rita (Filial 04)',
    descricao: 'Canal operacional da filial 04 de Santa Rita do Passa Quatro.',
    mensagemBoasVindas: 'Canal operacional da filial 04 de Santa Rita do Passa Quatro ativo no CONECTA.',
  },
];

export const DEFINICAO_CANAIS_CORPORATIVOS: Array<{
  id: string;
  nome: string;
  descricao: string;
  apenasGestoresPublicam: boolean;
  mensagemBoasVindas: string;
}> = [
  {
    id: 'grupo-avisos-da-rede',
    nome: 'Avisos da Rede',
    descricao: 'Canal oficial de comunicados corporativos da Diretoria e TI da Malachias Autopeças.',
    apenasGestoresPublicam: true,
    mensagemBoasVindas: 'Sistema CONECTA pronto para uso da rede de lojas Malachias Autopeças.',
  },
  {
    id: 'grupo-setor-ti-rede',
    nome: 'TI & Operações — Rede',
    descricao: 'Coordenação técnica, infraestrutura e sistemas das 5 lojas.',
    apenasGestoresPublicam: false,
    mensagemBoasVindas: 'Servidores de comunicação e rádio ativos para todas as filiais.',
  },
];

class BancoDadosConecta {
  private ouvintes: (() => void)[] = [];

  constructor() {
    this.inicializarSeVazio();

    // O que os outros aparelhos mudarem no banco tem que chegar nas telas
    if (usandoNuvem()) {
      nuvemComunicacao.assinarAtualizacoes(() => this.notificar());
    }
  }

  // Notifica componentes React sobre alterações no banco
  assinarAlteracoes(ouvinte: () => void): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      this.ouvintes = this.ouvintes.filter((o) => o !== ouvinte);
    };
  }

  private notificar(): void {
    this.ouvintes.forEach((o) => o());
  }

  /**
   * Empurra conversas para o banco sem segurar a tela. Usado no preparo dos
   * canais oficiais, que acontece durante a entrada e o cadastro — momentos
   * em que travar a interface esperando a rede seria pior do que deixar o
   * envio terminar sozinho. Quem depende da conversa existir no banco (o
   * envio de mensagem) garante isso por conta própria antes de gravar.
   */
  private empurrarConversas(lista: Conversa[]): void {
    if (!usandoNuvem()) return;

    // A aplicação monta as telas antes de a sessão estar de pé, e o preparo
    // dos canais acontece nessa montagem. Gravar aí sairia sem credencial e
    // seria recusado pela RLS. O que ficou de fora sobe no próximo preparo,
    // já com a pessoa autenticada.
    if (!temSessaoViva()) return;

    Promise.all(
      lista.map((conversa) =>
        nuvemComunicacao
          .salvarConversa(this.comParticipantesQueExistem(conversa), this.obterColaboradorAtual().id)
          .catch(() => ({ sucesso: false }))
      )
    ).then((resultados) => {
      // Recarregar troca o cache pela visão do banco. Fazer isso depois de
      // uma gravação que falhou apagaria da tela a conversa que acabou de ser
      // aberta — ela sumiria no meio do uso, sem explicação.
      if (resultados.every((r) => r.sucesso)) {
        this.recarregarConversasEmBreve();
      }
    });
  }

  /**
   * Tira da conversa quem não está na lista de colaboradores.
   *
   * `participantes.colaborador_id` aponta para `colaboradores(id)`: um id que
   * não existe derruba a gravação inteira, não só aquela linha — e o sintoma
   * que aparece na tela é "falha ao abrir a conversa", que não diz nada sobre
   * a causa. Melhor inscrever quem existe do que perder a conversa toda.
   */
  private comParticipantesQueExistem(conversa: Conversa): Conversa {
    const conhecidos = new Set(this.obterColaboradores().map((c) => c.id));
    const participantesIds = conversa.participantesIds.filter((id) => conhecidos.has(id));

    if (participantesIds.length === conversa.participantesIds.length) return conversa;
    return { ...conversa, participantesIds };
  }

  /**
   * Recarrega o cache de conversa depois de entrar em canais novos — sem isso
   * a pessoa vira participante no banco mas continua sem enxergar o que já
   * foi dito lá.
   *
   * O intervalo mínimo existe porque isto é disparado durante a montagem das
   * telas: sem ele, recarregar avisaria as telas, que chamariam de novo, e o
   * sistema ficaria girando sozinho.
   */
  private ultimaRecarga = 0;

  private recarregarConversasEmBreve(): void {
    const agora = Date.now();
    if (agora - this.ultimaRecarga < 3000) return;
    this.ultimaRecarga = agora;
    nuvemComunicacao.sincronizarConversas().catch(() => {});
  }

  // Inicializa dados no localStorage removendo todos os usuários antigos e mantendo apenas Elias
  private inicializarSeVazio(): void {
    if (typeof window === 'undefined') return;

    // No modo rede quem manda é o banco. Semear um Elias local aqui criaria
    // um usuário fantasma e faria a aplicação abrir já "logada" nele, sem
    // nunca passar pela tela de acesso.
    if (usandoNuvem()) return;

    // Remove versões antigas de dados para limpar usuários mock antigos
    ['conecta_colaboradores_v2', 'conecta_conversas_v2', 'conecta_mensagens_v2', 'conecta_colaborador_atual_id_v2'].forEach(
      (chave) => localStorage.removeItem(chave)
    );

    if (!localStorage.getItem(CHAVE_COLABORADORES)) {
      // Começa EXCLUSIVAMENTE com o usuário Admin solicitado: Elias
      localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify([COLABORADOR_ADMIN_ELIAS]));
    } else {
      // Migra fotos antigas ou ausentes para a logo oficial da empresa
      try {
        const colabsSalvos = localStorage.getItem(CHAVE_COLABORADORES);
        if (colabsSalvos) {
          const lista: Colaborador[] = JSON.parse(colabsSalvos);
          let houveMudanca = false;
          lista.forEach((c) => {
            if (!c.foto || c.foto.includes('unsplash.com')) {
              c.foto = FOTO_PADRAO_LOGO_EMPRESA;
              houveMudanca = true;
            }
          });
          if (houveMudanca) {
            localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(lista));
          }
        }
      } catch {
        // Ignora erro de parsing
      }
    }

    if (!localStorage.getItem(CHAVE_COLABORADOR_ATUAL)) {
      localStorage.setItem(CHAVE_COLABORADOR_ATUAL, COLABORADOR_ADMIN_ELIAS.id);
    }

    if (!localStorage.getItem(CHAVE_CONFIGURACOES)) {
      localStorage.setItem(CHAVE_CONFIGURACOES, JSON.stringify(CONFIGURACAO_PADRAO));
    }

    if (!localStorage.getItem(CHAVE_AUDITORIA)) {
      const registroInicial: RegistroAuditoria = {
        id: `aud-${Date.now()}`,
        dataHora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        usuarioNome: 'Sistema',
        acao: 'Inicialização do Sistema CONECTA',
        categoria: 'sistema',
        detalhes: 'Conta Administrador (Elias) provisionada com sucesso.',
      };
      localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify([registroInicial]));
    }

    if (!localStorage.getItem(CHAVE_AVISOS_REDE)) {
      const avisoInicial: AvisoRede = {
        id: 'aviso-1',
        titulo: 'Bem-vindo ao CONECTA — Malachias Autopeças',
        conteudo:
          'Sistema interno de comunicação, rádio PTT e gestão de pessoas iniciado. Utilize o Painel ADM para cadastrar os colaboradores das 5 lojas, criar novos canais e gerenciar comunicados oficiais.',
        prioridade: 'urgente',
        autorId: COLABORADOR_ADMIN_ELIAS.id,
        autorNome: COLABORADOR_ADMIN_ELIAS.nome,
        autorCargo: COLABORADOR_ADMIN_ELIAS.cargo,
        criadoEm: new Date().toISOString(),
        horaFormatada: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        dataPorExtenso: 'Hoje',
        fixadoNoTopo: true,
        lojaDestino: 'Todas',
        lidoPorIds: [COLABORADOR_ADMIN_ELIAS.id],
        confirmacoesIds: [COLABORADOR_ADMIN_ELIAS.id],
      };
      localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify([avisoInicial]));
    }

    if (!localStorage.getItem(CHAVE_CONVERSAS) || !localStorage.getItem(CHAVE_MENSAGENS)) {
      this.gerarConversasIniciais();
    }

    // Garante que todas as 5 lojas da rede tenham seus canais criados e ativos
    this.garantirCanaisTodasLojas();
  }

  // Gera os canais oficiais para todas as 5 lojas da rede e os canais corporativos
  private gerarConversasIniciais(): void {
    const agora = new Date();
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const colaboradores = this.obterColaboradores();
    const adminId = COLABORADOR_ADMIN_ELIAS.id;

    const conversasIniciais: Conversa[] = [];
    const mensagensIniciais: Mensagem[] = [];

    // 1. Avisos da Rede (todos os colaboradores participam)
    const todosIds = colaboradores.map((c) => c.id);
    if (!todosIds.includes(adminId)) todosIds.push(adminId);

    conversasIniciais.push({
      id: 'grupo-avisos-da-rede',
      tipo: 'grupo',
      nome: 'Avisos da Rede',
      foto: FOTO_PADRAO_LOGO_EMPRESA,
      participantesIds: todosIds,
      naoLidas: 0,
      atualizadoEm: agora.toISOString(),
      ehSistemaPadrao: true,
      apenasGestoresPublicam: true,
      descricao: 'Canal oficial de comunicados corporativos da Diretoria e TI da Malachias Autopeças.',
      ultimaMensagem: {
        texto: 'Sistema CONECTA pronto para uso da rede de lojas Malachias Autopeças.',
        hora,
        remetenteId: adminId,
        tipo: 'texto',
      },
    });

    mensagensIniciais.push({
      id: 'msg-inicio-avisos-rede',
      conversaId: 'grupo-avisos-da-rede',
      remetenteId: adminId,
      texto: 'Sistema CONECTA pronto para uso da rede de lojas Malachias Autopeças.',
      tipo: 'texto',
      criadoEm: agora.toISOString(),
      horaFormatada: hora,
      lida: true,
      ehAvisoDirecao: true,
    });

    // 2. Cria os canais de cada uma das 5 lojas da rede
    for (const def of DEFINICAO_CANAIS_LOJAS_REDE) {
      const membrosLoja = colaboradores
        .filter((c) => c.loja === def.loja || c.nivel >= NIVEL_GERENTE || c.id === adminId)
        .map((c) => c.id);
      if (adminId && !membrosLoja.includes(adminId)) membrosLoja.push(adminId);

      conversasIniciais.push({
        id: def.id,
        tipo: 'grupo',
        nome: def.nome,
        foto: FOTO_PADRAO_LOGO_EMPRESA,
        participantesIds: membrosLoja,
        naoLidas: 0,
        atualizadoEm: agora.toISOString(),
        ehSistemaPadrao: true,
        descricao: def.descricao,
        ultimaMensagem: {
          texto: def.mensagemBoasVindas,
          hora,
          remetenteId: adminId,
          tipo: 'texto',
        },
      });

      mensagensIniciais.push({
        id: `msg-inicio-${def.id}`,
        conversaId: def.id,
        remetenteId: adminId,
        texto: def.mensagemBoasVindas,
        tipo: 'texto',
        criadoEm: agora.toISOString(),
        horaFormatada: hora,
        lida: true,
      });
    }

    // 3. TI & Operações — Rede
    const membrosTI = colaboradores
      .filter((c) => c.setor === 'TI' || c.nivel >= NIVEL_GERENTE || c.id === adminId)
      .map((c) => c.id);
    if (adminId && !membrosTI.includes(adminId)) membrosTI.push(adminId);

    conversasIniciais.push({
      id: 'grupo-setor-ti-rede',
      tipo: 'grupo',
      nome: 'TI & Operações — Rede',
      foto: FOTO_PADRAO_LOGO_EMPRESA,
      participantesIds: membrosTI,
      naoLidas: 0,
      atualizadoEm: agora.toISOString(),
      ehSistemaPadrao: true,
      descricao: 'Coordenação técnica, infraestrutura e sistemas das 5 lojas.',
      ultimaMensagem: {
        texto: 'Servidores de comunicação e rádio ativos para todas as filiais.',
        hora,
        remetenteId: adminId,
        tipo: 'texto',
      },
    });

    mensagensIniciais.push({
      id: 'msg-inicio-ti-rede',
      conversaId: 'grupo-setor-ti-rede',
      remetenteId: adminId,
      texto: 'Servidores de comunicação e rádio ativos para todas as filiais.',
      tipo: 'texto',
      criadoEm: agora.toISOString(),
      horaFormatada: hora,
      lida: true,
    });

    localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversasIniciais));
    localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(mensagensIniciais));
  }

  // --- AUTENTICAÇÃO E SESSÃO ---

  autenticar(
    login: string,
    senha: string
  ): { sucesso: boolean; colaborador?: Colaborador; erro?: string } {
    const limpoLogin = login.trim().toLowerCase();
    const limpoSenha = senha.trim();

    if (!limpoLogin || !limpoSenha) {
      return { sucesso: false, erro: 'Informe o login e a senha.' };
    }

    const colaboradores = this.obterColaboradores();
    const encontrado = colaboradores.find(
      (c) => c.login && c.login.toLowerCase() === limpoLogin
    );

    if (!encontrado) {
      return { sucesso: false, erro: 'Usuário não encontrado.' };
    }

    if (!encontrado.ativo) {
      return { sucesso: false, erro: 'Esta conta está desativada pela administração.' };
    }

    // Conta sem senha definida não entra: senão a comparação seria pulada e
    // qualquer senha digitada abriria o acesso.
    if (!encontrado.senha) {
      return { sucesso: false, erro: 'Esta conta está sem senha definida. Procure o TI.' };
    }

    if (encontrado.senha !== limpoSenha) {
      return { sucesso: false, erro: 'Senha incorreta.' };
    }

    localStorage.setItem(CHAVE_COLABORADOR_ATUAL, encontrado.id);
    this.salvarUltimoAcessoDoDispositivo(encontrado.id, limpoSenha);
    this.garantirGruposDoSistemaPara(encontrado.id);
    this.registrarAuditoria('Login de Usuário', 'seguranca', `${encontrado.nome} (${encontrado.cargo}) entrou no sistema.`);
    this.notificar();
    return { sucesso: true, colaborador: encontrado };
  }

  /**
   * Grava a conta do último login deste dispositivo junto com a senha, para que
   * o acesso seguinte seja de um clique só. Uso interno em aparelhos da rede:
   * a senha fica no localStorage do próprio dispositivo, no mesmo nível de
   * exposição do cadastro de colaboradores.
   */
  private salvarUltimoAcessoDoDispositivo(id: string, senha: string): void {
    localStorage.setItem(
      CHAVE_ULTIMO_ACESSO_DISPOSITIVO,
      JSON.stringify({ id, senha })
    );
  }

  /**
   * Registra a conta do último acesso a partir do login pelo banco. No modo
   * rede quem autentica é o Supabase, então a gravação precisa vir de fora —
   * sem isto a sugestão do aparelho nunca seria atualizada.
   */
  registrarAcessoDoDispositivo(id: string, senha: string): void {
    this.salvarUltimoAcessoDoDispositivo(id, senha);
  }

  /** Senha guardada neste aparelho para o acesso de um clique, se houver. */
  obterSenhaSugeridaDoDispositivo(): string | null {
    const salvo = this.lerUltimoAcessoDoDispositivo();
    return salvo?.senha || null;
  }

  /**
   * Retorna o colaborador que fez o último login neste dispositivo, para que a
   * tela de acesso possa sugerir a conta. Retorna null se nunca houve login
   * aqui, se a conta foi removida ou se ela foi desativada pela administração.
   */
  obterUltimoAcessoDoDispositivo(): Colaborador | null {
    const salvo = this.lerUltimoAcessoDoDispositivo();
    if (!salvo) return null;
    const colaborador = this.obterColaboradorPorId(salvo.id);
    if (!colaborador || !colaborador.ativo) {
      this.esquecerUltimoAcessoDoDispositivo();
      return null;
    }
    return colaborador;
  }

  private lerUltimoAcessoDoDispositivo(): { id: string; senha: string } | null {
    if (typeof window === 'undefined') return null;
    const bruto = localStorage.getItem(CHAVE_ULTIMO_ACESSO_DISPOSITIVO);
    if (!bruto) return null;
    try {
      const dados = JSON.parse(bruto);
      if (!dados || typeof dados.id !== 'string') return null;
      return { id: dados.id, senha: typeof dados.senha === 'string' ? dados.senha : '' };
    } catch {
      // Registros do formato antigo guardavam apenas o ID em texto puro.
      return { id: bruto, senha: '' };
    }
  }

  /**
   * Entra direto com a conta sugerida, sem digitar a senha. Se a senha tiver
   * sido alterada pela administração desde o último acesso, a sugestão é
   * descartada e o usuário volta a informar os dados manualmente.
   */
  autenticarContaSugerida(): { sucesso: boolean; colaborador?: Colaborador; erro?: string } {
    // No modo rede quem valida a senha é o Supabase. Entrar por aqui deixaria
    // a pessoa dentro do app SEM sessão no banco: a tela abriria normalmente,
    // mas toda leitura voltaria vazia e toda gravação seria recusada pela
    // RLS. Quem cuida do acesso de um clique na rede é a tela de login.
    if (usandoNuvem()) {
      return { sucesso: false, erro: 'Entre pelo banco da rede.' };
    }

    const salvo = this.lerUltimoAcessoDoDispositivo();
    const colaborador = salvo ? this.obterColaboradorPorId(salvo.id) : undefined;

    if (!salvo || !colaborador || !salvo.senha) {
      this.esquecerUltimoAcessoDoDispositivo();
      return { sucesso: false, erro: 'Informe a senha para entrar.' };
    }

    const resultado = this.autenticar(colaborador.login, salvo.senha);
    if (!resultado.sucesso) {
      this.esquecerUltimoAcessoDoDispositivo();
    }
    return resultado;
  }

  /** Esquece a conta sugerida neste dispositivo (opção "Não sou eu"). */
  esquecerUltimoAcessoDoDispositivo(): void {
    localStorage.removeItem(CHAVE_ULTIMO_ACESSO_DISPOSITIVO);
  }

  deslogar(): void {
    const atual = this.obterColaboradorAtual();
    this.registrarAuditoria('Logout de Usuário', 'seguranca', `${atual.nome} encerrou a sessão.`);
    localStorage.removeItem(CHAVE_COLABORADOR_ATUAL);
    this.notificar();
  }

  estaAutenticado(): boolean {
    if (typeof window === 'undefined') return false;
    const idAtual = localStorage.getItem(CHAVE_COLABORADOR_ATUAL);
    if (!idAtual) return false;
    return !!this.obterColaboradorPorId(idAtual);
  }

  // --- COLABORADORES ---

  obterColaboradores(): Colaborador[] {
    try {
      const bruto = localStorage.getItem(CHAVE_COLABORADORES);
      const lista: Colaborador[] = bruto ? JSON.parse(bruto) : [COLABORADOR_ADMIN_ELIAS];
      return lista.map((c) => ({
        ...c,
        foto: c.foto && !c.foto.includes('unsplash.com') ? c.foto : FOTO_PADRAO_LOGO_EMPRESA,
      }));
    } catch {
      return [COLABORADOR_ADMIN_ELIAS];
    }
  }

  obterColaboradorPorId(id: string): Colaborador | undefined {
    return this.obterColaboradores().find((c) => c.id === id);
  }

  obterColaboradorAtual(): Colaborador {
    const idAtual = localStorage.getItem(CHAVE_COLABORADOR_ATUAL);
    const colaboradores = this.obterColaboradores();
    if (idAtual) {
      const encontrado = colaboradores.find((c) => c.id === idAtual);
      if (encontrado) return encontrado;
    }
    return colaboradores[0] || COLABORADOR_ADMIN_ELIAS;
  }

  definirColaboradorAtual(colaboradorId: string): void {
    localStorage.setItem(CHAVE_COLABORADOR_ATUAL, colaboradorId);
    this.garantirGruposDoSistemaPara(colaboradorId);
    this.notificar();
  }

  atualizarPresenca(colaboradorId: string, presenca: EstadoPresenca): void {
    const todos = this.obterColaboradores();
    const indice = todos.findIndex((c) => c.id === colaboradorId);
    if (indice !== -1) {
      todos[indice].presenca = presenca;
      todos[indice].vistoPorUltimo = presenca === 'disponivel' ? 'Agora' : 'Recente';
      localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(todos));

      // Estar disponível é informação para os colegas: não pode ficar só aqui
      if (usandoNuvem()) {
        nuvem.salvarColaborador(todos[indice]).catch(() => {});
      }

      this.notificar();
    }
  }

  // Criar colaborador via Painel ADM
  async criarColaborador(dados: {
    nome: string;
    login: string;
    senha?: string;
    cargo: string;
    setor: Setor;
    loja: Loja;
    nivel: NivelHierarquico;
    ramal?: string;
    telefone?: string;
    email?: string;
    foto?: string;
    cargaHorariaDiariaMinutos?: number;
  }): Promise<{ sucesso: boolean; colaborador?: Colaborador; erro?: string }> {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) {
      return { sucesso: false, erro: 'Apenas o Administrador de TI possui permissão para cadastrar colaboradores.' };
    }

    if (!dados.nome.trim() || !dados.login.trim()) {
      return { sucesso: false, erro: 'Nome e login são obrigatórios.' };
    }

    /**
     * A SENHA DE CADASTRO NÃO É ESCOLHIDA.
     *
     * Todo colaborador novo nasce com a senha padrão da rede e é obrigado a
     * trocá-la no primeiro acesso.
     *
     * Deixar o administrador digitar uma senha aqui só produziu problema: o
     * formulário nascia com "123", abaixo do mínimo de 6 da autenticação, e
     * criava uma ficha perfeita no banco com uma conta que nunca conseguia
     * ativar. Uma senha a menos para errar é uma senha a menos para
     * explicar depois.
     */
    const senhaEscolhida = SENHA_PADRAO_PRIMEIRO_ACESSO;

    const colaboradores = this.obterColaboradores();
    /**
     * Quem já usa o login precisa ser NOMEADO.
     *
     * "Já existe um colaborador com este login" não diz quem, e o login some
     * da tela de quem cadastra assim que a recusa aparece — sobra procurar
     * no Quadro de Equipe. Pior: o gatilho de primeiro acesso acha a ficha
     * PELO LOGIN, com `limit 1`. Dois cadastros com o mesmo login e quem
     * entra é sorteio; o outro nunca entra, sem explicação em lugar nenhum.
     *
     * O `trim()` dos dois lados é o mesmo que o banco faz em
     * `lower(trim(login))`: " fabio" e "fabio" são o mesmo login para ele.
     */
    const loginPretendido = dados.login.trim().toLowerCase();
    const jaUsado = colaboradores.find(
      (c) => c.login && c.login.trim().toLowerCase() === loginPretendido
    );

    if (jaUsado) {
      return {
        sucesso: false,
        erro: `O login "${dados.login.trim()}" já é de ${jaUsado.nome} (${jaUsado.loja}). Escolha outro: dois cadastros com o mesmo login impedem os dois de entrar.`,
      };
    }

    const novoId = `colab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const novoColab: Colaborador = {
      id: novoId,
      nome: dados.nome.trim(),
      login: dados.login.trim(),
      senha: senhaEscolhida,
      cargo: dados.cargo.trim() || 'Colaborador',
      setor: dados.setor,
      loja: dados.loja,
      nivel: dados.nivel || 1,
      foto: dados.foto?.trim() || FOTO_PADRAO_LOGO_EMPRESA,
      presenca: 'disponivel',
      vistoPorUltimo: 'Agora',
      ramal: dados.ramal?.trim() || '',
      telefone: dados.telefone?.trim() || '',
      email: dados.email?.trim() || '',
      cargaHorariaDiariaMinutos:
        dados.cargaHorariaDiariaMinutos ?? CARGA_HORARIA_PADRAO_MINUTOS,
      /**
       * Preenchido aqui, e não deixado para o padrão do banco.
       *
       * A coluna `turno` é `not null`, e o cadastro nascia sem ela: o código
       * mandava null explícito, que anula o default e viola o not null. Todo
       * cadastro era recusado — em silêncio. Preencher na origem é mais
       * barato do que confiar que o outro lado conserte.
       */
      turno: TURNO_PADRAO,
      ativo: true,
      criadoEm: new Date().toISOString(),
    };

    /**
     * O BANCO PRIMEIRO.
     *
     * Antes a ficha ia para o banco sem ninguém esperar a resposta: se a
     * gravação falhasse, o painel dizia "cadastrado" e a pessoa existia só
     * naquele navegador. Ela então tentava entrar e ouvia "login não
     * cadastrado na rede" — sem ninguém entender por quê, porque o nome
     * estava lá na tela de quem cadastrou.
     */
    if (usandoNuvem()) {
      const res = await nuvem.salvarColaborador({
        ...novoColab,
        /**
         * A senha de PRIMEIRO ACESSO vai junto: é o que o gatilho confere
         * quando a pessoa entra. E a obrigação de trocar vai explícita, em
         * vez de depender do padrão da coluna — cadastro que nasce sem essa
         * marca deixa a pessoa usando a senha da rede para sempre.
         */
        senhaAtivacao: novoColab.senha,
        precisaTrocarSenha: true,
      } as Colaborador);

      if (!res.sucesso) {
        return {
          sucesso: false,
          erro: `O cadastro não foi gravado no banco: ${
            res.erro || 'motivo não informado'
          }. A pessoa não conseguiria entrar.`,
        };
      }
    }

    colaboradores.push(novoColab);
    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(colaboradores));

    // Adiciona o novo colaborador automaticamente aos canais padrões da loja e da rede
    this.garantirGruposDoSistemaPara(novoId);

    this.registrarAuditoria(
      'Cadastro de Colaborador',
      'usuario',
      `${atual.nome} cadastrou ${novoColab.nome} (${novoColab.cargo} - ${novoColab.loja}).`
    );

    this.notificar();
    return { sucesso: true, colaborador: novoColab };
  }

  // Importação em lote a partir de planilha Excel
  async importarColaboradoresEmLote(
    linhasParaImportar: Array<{
      nome: string;
      login: string;
      senha?: string;
      cargo: string;
      loja: Loja;
      setor: Setor;
      nivel: NivelHierarquico;
      ramal?: string;
      telefone?: string;
      email?: string;
      matricula?: string;
      cnpj?: string;
      dataAdmissao?: string;
      observacoes?: string;
    }>,
    atualizarExistentes: boolean = true
  ): Promise<{
    sucesso: boolean;
    criados: number;
    atualizados: number;
    ignorados: number;
    erros: string[];
  }> {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) {
      return {
        sucesso: false,
        criados: 0,
        atualizados: 0,
        ignorados: 0,
        erros: ['Apenas o Administrador de TI possui permissão para importar colaboradores em lote.'],
      };
    }

    const colaboradores = this.obterColaboradores();
    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;
    const erros: string[] = [];
    const idsNovos: string[] = [];

    for (const linha of linhasParaImportar) {
      if (!linha.nome || !linha.login) {
        erros.push(`Linha ignorada: nome ou login ausentes (${linha.nome || 'sem nome'}).`);
        ignorados++;
        continue;
      }

      const loginLimpo = linha.login.toLowerCase().trim();
      const indiceExistente = colaboradores.findIndex(
        (c) => c.login && c.login.toLowerCase().trim() === loginLimpo
      );

      if (indiceExistente !== -1) {
        if (atualizarExistentes) {
          const colabExistente = colaboradores[indiceExistente];

          /**
           * Quem está importando não perde o próprio acesso.
           *
           * Antes a proteção comparava com o id fixo do modo de demonstração
           * — que não existe no banco real, onde o id nasce do cadastro. Na
           * prática, a linha do próprio administrador vindo com nível 1 o
           * rebaixaria, e só um TI pode devolver o nível: ele ficaria
           * trancado do lado de fora do sistema que administra.
           */
          const souEu = colabExistente.id === atual.id;
          const ehAdminElias = souEu || colabExistente.id === COLABORADOR_ADMIN_ELIAS.id;
          colaboradores[indiceExistente] = {
            ...colabExistente,
            nome: linha.nome.trim(),
            cargo: linha.cargo.trim() || colabExistente.cargo,
            loja: linha.loja || colabExistente.loja,
            setor: linha.setor || colabExistente.setor,
            nivel: ehAdminElias
              ? colabExistente.nivel
              : linha.nivel || colabExistente.nivel,
            ramal: linha.ramal?.trim() || colabExistente.ramal,
            telefone: linha.telefone?.trim() || colabExistente.telefone,
            email: linha.email?.trim() || colabExistente.email,
            senha: linha.senha?.trim() || colabExistente.senha || SENHA_PADRAO_PRIMEIRO_ACESSO,
            matricula: linha.matricula?.trim() || colabExistente.matricula,
            cnpj: linha.cnpj?.trim() || colabExistente.cnpj,
            dataAdmissao: linha.dataAdmissao?.trim() || colabExistente.dataAdmissao,
            observacoes: linha.observacoes?.trim() || colabExistente.observacoes,
          };
          atualizados++;
        } else {
          ignorados++;
        }
      } else {
        const novoId = `colab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const novoColab: Colaborador = {
          id: novoId,
          nome: linha.nome.trim(),
          login: linha.login.trim(),
          senha: linha.senha?.trim() || SENHA_PADRAO_PRIMEIRO_ACESSO,
          cargo: linha.cargo.trim() || 'Colaborador',
          setor: linha.setor,
          loja: linha.loja,
          nivel: linha.nivel || 1,
          foto: FOTO_PADRAO_LOGO_EMPRESA,
          presenca: 'disponivel',
          vistoPorUltimo: 'Agora',
          ramal: linha.ramal?.trim() || '',
          telefone: linha.telefone?.trim() || '',
          email: linha.email?.trim() || '',
          matricula: linha.matricula?.trim() || '',
          cnpj: linha.cnpj?.trim() || '',
          dataAdmissao: linha.dataAdmissao?.trim() || '',
          observacoes: linha.observacoes?.trim() || '',
          ativo: true,
          criadoEm: new Date().toISOString(),
        };

        colaboradores.push(novoColab);
        idsNovos.push(novoId);
        criados++;
      }
    }

    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(colaboradores));

    // A inscrição nos canais só pode acontecer DEPOIS de gravar a lista: o
    // método lê o colaborador do armazenamento e, antes disso, não o encontra.
    for (const novoId of idsNovos) {
      this.garantirGruposDoSistemaPara(novoId);
    }

    // No modo rede as fichas precisam existir no banco, senão a importação
    // ficaria presa neste navegador e ninguém conseguiria entrar.
    if (usandoNuvem()) {
      const enviados = colaboradores.filter(
        (c) => idsNovos.includes(c.id) || linhasParaImportar.some(
          (l) => l.login.trim().toLowerCase() === (c.login || '').toLowerCase()
        )
      );
      /**
       * A PLANILHA É O CAMINHO DAS 88 PESSOAS. Ela não pode falhar em
       * silêncio.
       *
       * Antes a gravação subia sem ninguém esperar e o erro ia só para o
       * console: a tela dizia "88 colaboradores criados" e o banco podia
       * não ter recebido nenhum. Isso só apareceria no dia em que as
       * pessoas tentassem entrar — o mesmo estrago do cadastro individual,
       * multiplicado por 88.
       */
      const res = await nuvem.salvarColaboradoresEmLote(enviados);
      if (!res.sucesso) {
        return {
          sucesso: false,
          criados: 0,
          atualizados: 0,
          ignorados: 0,
          erros: [
            `A importação não chegou ao banco: ${
              res.erro || 'motivo não informado'
            }. Ninguém conseguiria entrar — corrija e importe de novo.`,
          ],
        };
      }
    }

    this.registrarAuditoria(
      'Importação de Planilha Excel',
      'usuario',
      `${atual.nome} importou planilha de colaboradores: ${criados} cadastrados, ${atualizados} atualizados, ${ignorados} ignorados.`
    );
    this.notificar();

    return {
      sucesso: true,
      criados,
      atualizados,
      ignorados,
      erros,
    };
  }

  // Atualizar colaborador existente
  /**
   * Quem cuida da ficha das pessoas: Administrador (TI) e o setor de RH.
   * O RH mexe nos dados funcionais; hierarquia e credenciais seguem sendo do
   * Administrador.
   */
  podeGerenciarPessoas(colaborador?: Colaborador): boolean {
    const alvo = colaborador || this.obterColaboradorAtual();
    return alvo.nivel >= NIVEL_TI || alvo.setor === 'RH';
  }

  async atualizarColaborador(
    id: string,
    dados: Partial<Colaborador>
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const atual = this.obterColaboradorAtual();
    const ehAdmin = atual.nivel >= NIVEL_TI;
    const ehRh = !ehAdmin && atual.setor === 'RH';

    if (!ehAdmin && !ehRh && atual.id !== id) {
      return {
        sucesso: false,
        erro: 'Apenas o Administrador de TI e o RH possuem permissão para editar outros colaboradores.',
      };
    }

    const colaboradores = this.obterColaboradores();
    const indice = colaboradores.findIndex((c) => c.id === id);
    if (indice === -1) {
      return { sucesso: false, erro: 'Colaborador não encontrado.' };
    }

    // Fora do Administrador, a pessoa só mexe nos próprios dados de contato e
    // perfil. Cargo, nível, loja, setor e situação são decisões da gestão — e
    // trocar a própria loja daria acesso ao canal de outra filial.
    let dadosParaAplicar: Partial<Colaborador> = { ...dados };

    // Campo de senha em branco significa "não mexer", nunca "apagar a senha" —
    // uma conta sem senha ficaria acessível a qualquer um.
    if (typeof dadosParaAplicar.senha === 'string' && !dadosParaAplicar.senha.trim()) {
      delete dadosParaAplicar.senha;
    }

    if (!ehAdmin) {
      // O RH cuida da ficha funcional (cargo, setor, loja, jornada, admissão e
      // desligamento). Nível hierárquico, login e senha continuam com o TI,
      // senão o RH poderia se promover ou assumir a conta de outra pessoa.
      const CAMPOS_RH: Array<keyof Colaborador> = [
        'nome',
        'cargo',
        'setor',
        'loja',
        'ramal',
        'telefone',
        'email',
        'foto',
        'matricula',
        // O CNPJ é ficha funcional: é o empregador da pessoa, e é o RH que
        // corrige quando a planilha sobe com ele em branco
        'cnpj',
        'departamento',
        // O organograma é decisão de quem cuida de pessoas. Fica aqui e NÃO
        // em CAMPOS_PROPRIOS: se a pessoa pudesse escolher o próprio
        // responsável, escolheria quem aprova a hora dela.
        'responsavelId',
        'dataAdmissao',
        'observacoes',
        'cargaHorariaDiariaMinutos',
        // O turno decide o horário cobrado e o previsto do dia: é ficha
        // funcional, do mesmo tipo que cargo e jornada
        'turno',
        'ativo',
      ];
      // Fora do RH, cada pessoa só mexe nos próprios dados de contato e perfil.
      const CAMPOS_PROPRIOS: Array<keyof Colaborador> = [
        'foto',
        'senha',
        'ramal',
        'telefone',
        'email',
        'presenca',
        'vistoPorUltimo',
        'observacoes',
      ];

      // Editando a si mesmo, o RH também pode trocar a própria senha
      const liberados =
        ehRh && atual.id !== id
          ? CAMPOS_RH
          : ehRh
          ? [...new Set([...CAMPOS_RH, ...CAMPOS_PROPRIOS])]
          : CAMPOS_PROPRIOS;

      const filtrados: Partial<Colaborador> = {};
      for (const campo of liberados) {
        if (campo in dadosParaAplicar) {
          (filtrados as Record<string, unknown>)[campo] = dadosParaAplicar[campo];
        }
      }
      dadosParaAplicar = filtrados;
    }

    // Se mudou login, valida se não duplica
    if (dadosParaAplicar.login && dadosParaAplicar.login.toLowerCase() !== colaboradores[indice].login?.toLowerCase()) {
      const duplicado = colaboradores.some(
        (c) => c.id !== id && c.login?.toLowerCase() === dadosParaAplicar.login?.toLowerCase()
      );
      if (duplicado) return { sucesso: false, erro: 'Login já em uso por outro colaborador.' };
    }

    colaboradores[indice] = {
      ...colaboradores[indice],
      ...dadosParaAplicar,
    };

    /**
     * O BANCO PRIMEIRO, como no cadastro e na remoção.
     *
     * Editar a ficha ia para o banco sem ninguém esperar a resposta: o
     * painel dizia "atualizado" e a alteração podia ter ficado só naquele
     * navegador. Aqui dentro se mexe em nível, loja, responsável e agora na
     * JORNADA — carga semanal, sábado, intervalo. Uma jornada que não sobe
     * deixa a pessoa sendo cobrada pela errada, e ninguém desconfia porque a
     * tela mostrou o valor certo.
     */
    if (usandoNuvem()) {
      const res = await nuvem.salvarColaborador(colaboradores[indice]);
      if (!res.sucesso) {
        return {
          sucesso: false,
          erro: `A alteração não foi gravada no banco: ${
            res.erro || 'motivo não informado'
          }. Ela valeria só neste aparelho.`,
        };
      }
    }

    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(colaboradores));

    this.registrarAuditoria(
      'Atualização de Colaborador',
      'usuario',
      `${atual.nome} atualizou os dados de ${colaboradores[indice].nome}.`
    );
    this.notificar();
    return { sucesso: true };
  }

  /**
   * Move alguém no organograma — ou o solta dele.
   *
   * Passa por `atualizarColaborador`, então herda a permissão de lá (só quem
   * cuida de pessoas mexe em `responsavelId`). O que esta camada acrescenta
   * é a checagem de ciclo, que a lista de campos liberados não faz: pendurar
   * o chefe debaixo do próprio subordinado deixaria os dois sem ninguém
   * acima — e, pela regra nova, sem aprovador.
   */
  async definirResponsavel(
    colaboradorId: string,
    responsavelId: string | null
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!this.podeGerenciarPessoas()) {
      return {
        sucesso: false,
        erro: 'Apenas RH, Diretoria e TI organizam a cadeia de responsabilidade.',
      };
    }

    const todos = this.obterColaboradores();
    const alvo = todos.find((c) => c.id === colaboradorId);
    if (!alvo) return { sucesso: false, erro: 'Colaborador não encontrado.' };

    if (responsavelId) {
      const candidato = todos.find((c) => c.id === responsavelId);
      if (!candidato) return { sucesso: false, erro: 'Responsável não encontrado.' };

      const veredito = podeSerResponsavelDe(candidato, alvo, todos);
      if (!veredito.pode) return { sucesso: false, erro: veredito.motivo };
    }

    // `undefined` sai do objeto ao serializar e a pessoa continuaria
    // pendurada; a soltura tem que gravar o campo vazio de propósito
    const resultado = await this.atualizarColaborador(colaboradorId, {
      responsavelId: responsavelId || undefined,
    });
    if (!resultado.sucesso) return resultado;

    if (!responsavelId) {
      const colaboradores = this.obterColaboradores();
      const indice = colaboradores.findIndex((c) => c.id === colaboradorId);
      if (indice !== -1) {
        delete colaboradores[indice].responsavelId;

        // O organograma decide QUEM APROVA hora. Uma mudança que fica só
        // neste navegador põe a fila de aprovação de duas pessoas diferentes
        // em dois aparelhos diferentes.
        if (usandoNuvem()) {
          const res = await nuvem.salvarColaborador(colaboradores[indice]);
          if (!res.sucesso) {
            return {
              sucesso: false,
              erro: `A alteração não foi gravada no banco: ${
                res.erro || 'motivo não informado'
              }.`,
            };
          }
        }

        localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(colaboradores));
        this.notificar();
      }
    }

    const nomeDoChefe = responsavelId
      ? todos.find((c) => c.id === responsavelId)?.nome
      : null;
    this.registrarAuditoria(
      'Organograma',
      'usuario',
      nomeDoChefe
        ? `${alvo.nome} passou a responder a ${nomeDoChefe}.`
        : `${alvo.nome} foi retirado da cadeia de responsabilidade.`
    );

    return { sucesso: true };
  }

  // Atualiza especificamente a foto de um colaborador (usado na edição de perfil, quadro ou ADM)
  async atualizarFotoColaborador(
    id: string,
    novaFoto: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const fotoFinal = novaFoto.trim() || FOTO_PADRAO_LOGO_EMPRESA;
    return this.atualizarColaborador(id, { foto: fotoFinal });
  }

  // Excluir ou desativar colaborador
  async removerColaborador(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) {
      return { sucesso: false, erro: 'Apenas Administradores podem excluir colaboradores.' };
    }

    if (id === COLABORADOR_ADMIN_ELIAS.id || id === atual.id) {
      return { sucesso: false, erro: 'A conta do Administrador principal não pode ser removida.' };
    }

    const colaboradores = this.obterColaboradores();
    const colabAlvo = colaboradores.find((c) => c.id === id);
    if (!colabAlvo) {
      return { sucesso: false, erro: 'Colaborador não encontrado.' };
    }

    const listaFiltrada = colaboradores.filter((c) => c.id !== id);
    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(listaFiltrada));

    // Remove das conversas. As conversas individuais dele são descartadas por
    // inteiro (junto das mensagens), senão sobrariam conversas sem interlocutor
    // na lista do outro participante.
    const conversas = this.obterTodasConversas();
    const conversasRemovidas = conversas
      .filter((conv) => conv.tipo === 'individual' && conv.participantesIds.includes(id))
      .map((conv) => conv.id);

    const conversasRestantes = conversas
      .filter((conv) => !conversasRemovidas.includes(conv.id))
      .map((conv) => ({
        ...conv,
        participantesIds: conv.participantesIds.filter((pId) => pId !== id),
      }));
    localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversasRestantes));

    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todasMensagens: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      const mensagensRestantes = todasMensagens
        .filter((m) => !conversasRemovidas.includes(m.conversaId))
        // Em grupos as mensagens permanecem como histórico; só a marcação de
        // leitura do colaborador removido sai, para não inflar os contadores.
        .map((m) => ({
          ...m,
          lidaPor: m.lidaPor ? m.lidaPor.filter((pId) => pId !== id) : m.lidaPor,
        }));
      localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(mensagensRestantes));
    } catch {
      // Mantém as mensagens como estão se o armazenamento falhar
    }

    // Se o aparelho tinha a conta removida como sugestão de acesso, esquece
    const ultimoAcesso = this.lerUltimoAcessoDoDispositivo();
    if (ultimoAcesso && ultimoAcesso.id === id) {
      this.esquecerUltimoAcessoDoDispositivo();
    }

    /**
     * O BANCO PRIMEIRO, igual ao cadastro.
     *
     * Antes a remoção ia para o banco sem ninguém esperar a resposta. Se ela
     * falhasse, a ficha sumia da tela e CONTINUAVA no banco — com o login
     * ocupado e a senha de primeiro acesso antiga. Quem tentasse recadastrar
     * a mesma pessoa esbarrava num login já usado, e quem tentasse entrar
     * continuava batendo na senha velha. Foi exatamente o que aconteceu ao
     * apagar e recriar um cadastro para tentar consertá-lo.
     */
    if (usandoNuvem()) {
      const res = await nuvem.removerColaborador(id);
      if (!res.sucesso) {
        // A ficha volta para a lista: o banco ainda a tem, e fingir que não
        // seria mentir para quem for recadastrar
        localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(colaboradores));
        this.notificar();
        return {
          sucesso: false,
          erro: `A remoção não foi gravada no banco: ${
            res.erro || 'motivo não informado'
          }. O cadastro continua lá e o login segue ocupado.`,
        };
      }
    }

    this.registrarAuditoria(
      'Remoção de Colaborador',
      'usuario',
      `${atual.nome} removeu o colaborador ${colabAlvo.nome}.`
    );

    this.notificar();
    return { sucesso: true };
  }

  // Povoar equipe de exemplo para testes no Painel ADM
  gerarColaboradoresExemplo(): {
    sucesso: boolean;
    totalAdicionados: number;
    erro?: string;
  } {
    if (usandoNuvem()) {
      return { sucesso: false, totalAdicionados: 0, erro: RECUSA_MODO_REDE };
    }

    const colaboradores = this.obterColaboradores();
    const idsNovos: string[] = [];
    let adicionados = 0;

    COLABORADORES_EXEMPLO_REDE.forEach((exemplo, idx) => {
      const jaExiste = colaboradores.some(
        (c) => c.login?.toLowerCase() === exemplo.login.toLowerCase()
      );
      if (!jaExiste) {
        const id = `colab-exemplo-${idx + 1}-${Date.now()}`;
        const novo: Colaborador = {
          id,
          ...exemplo,
          criadoEm: new Date().toISOString(),
        };
        colaboradores.push(novo);
        idsNovos.push(id);
        adicionados++;
      }
    });

    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(colaboradores));

    // Inscrição nos canais só depois de gravar a lista (ver importação em lote)
    for (const id of idsNovos) {
      this.garantirGruposDoSistemaPara(id);
    }

    this.registrarAuditoria(
      'Carga de Demonstração',
      'sistema',
      `${this.obterColaboradorAtual().nome} carregou ${adicionados} colaboradores de exemplo da rede.`
    );
    this.notificar();
    return { sucesso: true, totalAdicionados: adicionados };
  }

  // Restaura integralmente a equipe de testes padrão (Elias + todos os exemplos da rede)
  resetarColaboradoresParaPadraoExemplo(): { sucesso: boolean; total: number; erro?: string } {
    if (usandoNuvem()) {
      return { sucesso: false, total: 0, erro: RECUSA_MODO_REDE };
    }

    const listaCompleta: Colaborador[] = [
      COLABORADOR_ADMIN_ELIAS,
      ...COLABORADORES_EXEMPLO_REDE.map((ex, idx) => ({
        id: `colab-exemplo-${idx + 1}`,
        ...ex,
        criadoEm: new Date().toISOString(),
      })),
    ];
    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(listaCompleta));
    localStorage.setItem(CHAVE_COLABORADOR_ATUAL, COLABORADOR_ADMIN_ELIAS.id);
    
    // Regera todas as conversas e canais para as 5 lojas
    this.gerarConversasIniciais();
    this.garantirCanaisTodasLojas();

    // Vincula cada colaborador aos canais de sua respectiva loja
    listaCompleta.forEach((c) => this.garantirGruposDoSistemaPara(c.id));

    this.registrarAuditoria(
      'Reset de Usuários Teste',
      'sistema',
      `Equipe de testes padrão restaurada com sucesso (${listaCompleta.length} colaboradores distribuídos nas 5 lojas).`
    );
    this.notificar();
    return { sucesso: true, total: listaCompleta.length };
  }

  // Limpa todos os colaboradores mantendo exclusivamente a conta Admin Elias
  limparColaboradoresManterAdmin(): { sucesso: boolean; erro?: string } {
    if (usandoNuvem()) {
      return { sucesso: false, erro: RECUSA_MODO_REDE };
    }

    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify([COLABORADOR_ADMIN_ELIAS]));
    localStorage.setItem(CHAVE_COLABORADOR_ATUAL, COLABORADOR_ADMIN_ELIAS.id);
    this.gerarConversasIniciais();
    this.garantirCanaisTodasLojas();
    this.registrarAuditoria(
      'Limpeza de Usuários Teste',
      'sistema',
      'Todos os colaboradores de teste foram removidos, mantendo unicamente o Admin Elias. Canais das 5 lojas prontos para a importação.'
    );
    this.notificar();
    return { sucesso: true };
  }

  // --- CONVERSAS E GRUPOS ---

  obterTodasConversas(): Conversa[] {
    try {
      const bruto = localStorage.getItem(CHAVE_CONVERSAS);
      return bruto ? JSON.parse(bruto) : [];
    } catch {
      return [];
    }
  }

  // Conta as mensagens que ESTE usuário ainda não leu numa conversa.
  // A contagem nunca é gravada: é derivada de `lidaPor`, que é por pessoa.
  /**
   * Mensagens que chegaram para o usuário logado e ele ainda não leu, das mais
   * antigas para as mais novas.
   *
   * É o que sustenta o aviso de mensagem nova: a conta de não lidas por
   * conversa diz QUANTAS, mas para avisar é preciso saber QUAIS — sem os
   * identificadores não dá para distinguir o que acabou de chegar do que já
   * estava lá quando o sistema abriu.
   */
  obterMensagensPorLer(): Mensagem[] {
    const atual = this.obterColaboradorAtual();
    const conversasMinhas = new Set(
      this.obterTodasConversas()
        .filter((c) => c.participantesIds.includes(atual.id))
        .map((c) => c.id)
    );

    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      return todas
        .filter(
          (m) =>
            conversasMinhas.has(m.conversaId) &&
            m.remetenteId !== atual.id &&
            (!m.lidaPor || !m.lidaPor.includes(atual.id))
        )
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    } catch {
      return [];
    }
  }

  private contarNaoLidasPara(conversaId: string, usuarioId: string): number {
    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      return todas.filter(
        (m) =>
          m.conversaId === conversaId &&
          m.remetenteId !== usuarioId &&
          (!m.lidaPor || !m.lidaPor.includes(usuarioId))
      ).length;
    } catch {
      return 0;
    }
  }

  // Formata os dados de exibição da conversa (nome, foto e contagem de não lidas) sob a perspectiva do usuário logado
  private formatarConversaParaUsuario(conversa: Conversa, usuarioId: string): Conversa {
    const naoLidas = this.contarNaoLidasPara(conversa.id, usuarioId);

    // Grupos e canais mantêm nome e foto próprios; só muda a contagem individual
    if (conversa.tipo !== 'individual') {
      return { ...conversa, naoLidas };
    }

    // Encontra o outro participante da conversa individual
    const outroId = conversa.participantesIds.find((id) => id !== usuarioId) || usuarioId;
    const outroColab = this.obterColaboradorPorId(outroId);

    return {
      ...conversa,
      nome: outroColab ? outroColab.nome : conversa.nome,
      foto: outroColab?.foto || conversa.foto,
      naoLidas,
    };
  }

  // Cada usuário tem seu próprio chat individual — apenas conversas nas quais participa
  obterConversasIndividuais(): Conversa[] {
    const atual = this.obterColaboradorAtual();
    const todas = this.obterTodasConversas();
    return todas
      .filter((c) => c.tipo === 'individual' && c.participantesIds.includes(atual.id))
      .map((c) => this.formatarConversaParaUsuario(c, atual.id))
      .sort((a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());
  }

  /**
   * Grupos e canais do usuário logado. A inclusão é sempre por participação:
   * um colaborador de Descalvado não enxerga o canal de Palmeiras, mesmo os
   * canais sendo padrão do sistema. A inscrição nos canais que lhe cabem
   * (a própria loja, Avisos da Rede e TI/gestão) é garantida antes da leitura.
   */
  obterGrupos(): Conversa[] {
    const atual = this.obterColaboradorAtual();
    this.garantirGruposDoSistemaPara(atual.id);
    const todas = this.obterTodasConversas();
    return todas
      .filter((c) => c.tipo === 'grupo' && c.participantesIds.includes(atual.id))
      .map((c) => this.formatarConversaParaUsuario(c, atual.id))
      .sort((a, b) => {
        if (a.id === 'grupo-avisos-da-rede') return -1;
        if (b.id === 'grupo-avisos-da-rede') return 1;
        return new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime();
      });
  }

  // Apenas os participantes da conversa individual têm permissão para acessá-la
  obterConversaPorId(id: string): Conversa | undefined {
    const atual = this.obterColaboradorAtual();
    const todas = this.obterTodasConversas();
    const c = todas.find((conv) => conv.id === id);
    if (!c) return undefined;

    // Regra estrita: conversa individual SÓ pode ser vista pelos dois usuários comunicantes
    if (c.tipo === 'individual') {
      if (!c.participantesIds.includes(atual.id)) {
        return undefined; // Acesso bloqueado para qualquer outro usuário!
      }
      return this.formatarConversaParaUsuario(c, atual.id);
    }

    // Canais e grupos: a auto-inscrição vale só para o canal da rede inteira
    // (Avisos da Rede). Canais de loja e grupos comuns exigem participação —
    // do contrário qualquer um abriria o canal de outra filial pelo ID.
    if (c.tipo === 'grupo' && !c.participantesIds.includes(atual.id)) {
      if (c.id !== 'grupo-avisos-da-rede') {
        return undefined;
      }
      c.participantesIds.push(atual.id);
      const todasAtualizadas = this.obterTodasConversas();
      const idx = todasAtualizadas.findIndex((conv) => conv.id === c.id);
      if (idx !== -1) {
        todasAtualizadas[idx] = c;
        localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(todasAtualizadas));
        // A inscrição vale para a rede, não só para este aparelho
        this.empurrarConversas([c]);
      }
    }

    return this.formatarConversaParaUsuario(c, atual.id);
  }

  // Inicia ou abre uma conversa individual direta e estrita entre dois colegas
  iniciarConversaCom(colaboradorId: string): Conversa {
    const atual = this.obterColaboradorAtual();
    const conversas = this.obterTodasConversas();
    const colega = this.obterColaboradorPorId(colaboradorId);

    // Impede conversa consigo mesmo
    if (colaboradorId === atual.id) {
      const existenteProprio = conversas.find(
        (c) => c.tipo === 'individual' && c.participantesIds.includes(atual.id)
      );
      if (existenteProprio) return this.formatarConversaParaUsuario(existenteProprio, atual.id);
    }

    // Procura conversa individual existente entre os dois
    let existente = conversas.find(
      (c) =>
        c.tipo === 'individual' &&
        c.participantesIds.length === 2 &&
        c.participantesIds.includes(atual.id) &&
        c.participantesIds.includes(colaboradorId)
    );

    if (existente) {
      return this.formatarConversaParaUsuario(existente, atual.id);
    }

    // ID determinístico baseado nos IDs dos 2 usuários para garantir conversa única e sem duplicação
    const idsOrdenados = [atual.id, colaboradorId].sort();
    const idConversa = `conv-ind-${idsOrdenados[0]}-${idsOrdenados[1]}`;

    existente = conversas.find((c) => c.id === idConversa);
    if (existente) {
      return this.formatarConversaParaUsuario(existente, atual.id);
    }

    // Cria nova conversa estrita entre os dois
    const novaConversa: Conversa = {
      id: idConversa,
      tipo: 'individual',
      nome: colega ? colega.nome : 'Conversa Privada',
      foto: colega?.foto,
      participantesIds: [atual.id, colaboradorId],
      naoLidas: 0,
      atualizadoEm: new Date().toISOString(),
    };

    conversas.push(novaConversa);
    localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas));
    this.empurrarConversas([novaConversa]);
    this.notificar();
    return this.formatarConversaParaUsuario(novaConversa, atual.id);
  }

  // Alias compatível com chamadas existentes
  obterOuCriarConversaIndividual(colaboradorId: string): Conversa {
    return this.iniciarConversaCom(colaboradorId);
  }

  // Criação de novos grupos: exclusiva do Administrador
  criarGrupo(
    dadosOuNome:
      | string
      | {
          nome: string;
          descricao?: string;
          participantesIds: string[];
          apenasGestoresPublicam?: boolean;
        },
    participantesSeString?: string[]
  ): { sucesso: boolean; grupo?: Conversa; erro?: string } {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) {
      return { sucesso: false, erro: 'Apenas o Administrador de TI possui permissão para criar novos grupos na rede.' };
    }

    const dados =
      typeof dadosOuNome === 'string'
        ? {
            nome: dadosOuNome,
            participantesIds: participantesSeString || [],
            descricao: '',
            apenasGestoresPublicam: false,
          }
        : dadosOuNome;

    if (!dados.nome.trim()) {
      return { sucesso: false, erro: 'Informe o nome do grupo.' };
    }

    const conversas = this.obterTodasConversas();
    const ids = Array.from(new Set([atual.id, ...dados.participantesIds]));

    const novoGrupo: Conversa = {
      id: `grupo-custom-${Date.now()}`,
      tipo: 'grupo',
      nome: dados.nome.trim(),
      descricao: dados.descricao?.trim(),
      participantesIds: ids,
      naoLidas: 0,
      atualizadoEm: new Date().toISOString(),
      criadoPorId: atual.id,
      apenasGestoresPublicam: !!dados.apenasGestoresPublicam,
    };

    conversas.push(novoGrupo);
    localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas));
    this.empurrarConversas([novoGrupo]);

    this.registrarAuditoria(
      'Criação de Grupo',
      'grupo',
      `${atual.nome} criou o canal '${novoGrupo.nome}' com ${ids.length} participantes.`
    );

    this.notificar();
    return { sucesso: true, grupo: novoGrupo };
  }

  // Garante que os canais de todas as 5 lojas e corporativos existam no sistema
  garantirCanaisTodasLojas(): void {
    const conversas = this.obterTodasConversas();
    const todosColabs = this.obterColaboradores();

    /**
     * O administrador dos canais precisa ser uma pessoa que EXISTE na lista.
     *
     * O `COLABORADOR_ADMIN_ELIAS` é uma ficha fixa do modo de demonstração.
     * No banco, o id de cada colaborador nasce do gatilho de cadastro
     * ('colab-' + o id da autenticação), então aquela ficha fixa não existe
     * lá. Inscrevê-la num canal quebrava a chave estrangeira de
     * `participantes` e derrubava a gravação da conversa inteira.
     */
    const adminId =
      todosColabs.find((c) => c.id === COLABORADOR_ADMIN_ELIAS.id)?.id ||
      todosColabs.find((c) => c.nivel >= NIVEL_TI)?.id ||
      todosColabs[0]?.id;

    let houveAlteracao = false;

    // 1. Avisos da Rede
    let grupoAvisos = conversas.find((c) => c.id === 'grupo-avisos-da-rede');
    const todosIds = todosColabs.map((c) => c.id);
    if (adminId && !todosIds.includes(adminId)) todosIds.push(adminId);

    if (!grupoAvisos) {
      grupoAvisos = {
        id: 'grupo-avisos-da-rede',
        tipo: 'grupo',
        nome: 'Avisos da Rede',
        foto: FOTO_PADRAO_LOGO_EMPRESA,
        participantesIds: todosIds,
        naoLidas: 0,
        atualizadoEm: new Date().toISOString(),
        ehSistemaPadrao: true,
        apenasGestoresPublicam: true,
        descricao: 'Canal oficial de comunicados corporativos da Diretoria e TI da Malachias Autopeças.',
      };
      conversas.push(grupoAvisos);
      houveAlteracao = true;
    } else {
      if (!grupoAvisos.foto) {
        grupoAvisos.foto = FOTO_PADRAO_LOGO_EMPRESA;
        houveAlteracao = true;
      }
      for (const colabId of todosIds) {
        if (!grupoAvisos.participantesIds.includes(colabId)) {
          grupoAvisos.participantesIds.push(colabId);
          houveAlteracao = true;
        }
      }
    }

    // 2. Canais de cada uma das 5 lojas da rede
    for (const def of DEFINICAO_CANAIS_LOJAS_REDE) {
      let grupoLoja = conversas.find((c) => c.id === def.id);
      const membrosLoja = todosColabs
        .filter((c) => c.loja === def.loja || c.nivel >= NIVEL_GERENTE || c.id === adminId)
        .map((c) => c.id);
      if (adminId && !membrosLoja.includes(adminId)) membrosLoja.push(adminId);

      if (!grupoLoja) {
        grupoLoja = {
          id: def.id,
          tipo: 'grupo',
          nome: def.nome,
          foto: FOTO_PADRAO_LOGO_EMPRESA,
          participantesIds: membrosLoja,
          naoLidas: 0,
          atualizadoEm: new Date().toISOString(),
          ehSistemaPadrao: true,
          descricao: def.descricao,
          ultimaMensagem: {
            texto: def.mensagemBoasVindas,
            hora: '08:00',
            remetenteId: adminId,
            tipo: 'texto',
          },
        };
        conversas.push(grupoLoja);
        houveAlteracao = true;
      } else {
        if (!grupoLoja.foto) {
          grupoLoja.foto = FOTO_PADRAO_LOGO_EMPRESA;
          houveAlteracao = true;
        }
        if (!grupoLoja.nome || grupoLoja.nome === def.loja) {
          grupoLoja.nome = def.nome;
          houveAlteracao = true;
        }
        for (const mId of membrosLoja) {
          if (!grupoLoja.participantesIds.includes(mId)) {
            grupoLoja.participantesIds.push(mId);
            houveAlteracao = true;
          }
        }
      }
    }

    // 3. TI & Operações — Rede
    let grupoTI = conversas.find((c) => c.id === 'grupo-setor-ti-rede');
    const membrosTI = todosColabs
      .filter((c) => c.setor === 'TI' || c.nivel >= NIVEL_GERENTE || c.id === adminId)
      .map((c) => c.id);
    if (adminId && !membrosTI.includes(adminId)) membrosTI.push(adminId);

    if (!grupoTI) {
      grupoTI = {
        id: 'grupo-setor-ti-rede',
        tipo: 'grupo',
        nome: 'TI & Operações — Rede',
        foto: FOTO_PADRAO_LOGO_EMPRESA,
        participantesIds: membrosTI,
        naoLidas: 0,
        atualizadoEm: new Date().toISOString(),
        ehSistemaPadrao: true,
        descricao: 'Coordenação técnica, infraestrutura e sistemas das 5 lojas.',
        ultimaMensagem: {
          texto: 'Servidores de comunicação e rádio ativos para todas as filiais.',
          hora: '08:00',
          remetenteId: adminId,
          tipo: 'texto',
        },
      };
      conversas.push(grupoTI);
      houveAlteracao = true;
    } else {
      if (!grupoTI.foto) {
        grupoTI.foto = FOTO_PADRAO_LOGO_EMPRESA;
        houveAlteracao = true;
      }
      for (const tId of membrosTI) {
        if (!grupoTI.participantesIds.includes(tId)) {
          grupoTI.participantesIds.push(tId);
          houveAlteracao = true;
        }
      }
    }

    if (houveAlteracao) {
      localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas));
      this.empurrarConversas(conversas.filter((c) => c.ehSistemaPadrao));
    }
  }

  // Garante os grupos do sistema para qualquer colaborador
  garantirGruposDoSistemaPara(colaboradorId: string): void {
    const colab = this.obterColaboradorPorId(colaboradorId);
    if (!colab) return;

    this.garantirCanaisTodasLojas();

    const conversas = this.obterTodasConversas();
    let houveAlteracao = false;

    // 1. Grupo da Loja
    const idGrupoLoja = `grupo-loja-${colab.loja.toLowerCase().replace(/\s+/g, '-')}`;
    const grupoLoja = conversas.find((c) => c.id === idGrupoLoja);
    if (grupoLoja && !grupoLoja.participantesIds.includes(colab.id)) {
      grupoLoja.participantesIds.push(colab.id);
      houveAlteracao = true;
    }

    // 2. Avisos da Rede
    const grupoAvisos = conversas.find((c) => c.id === 'grupo-avisos-da-rede');
    if (grupoAvisos && !grupoAvisos.participantesIds.includes(colab.id)) {
      grupoAvisos.participantesIds.push(colab.id);
      houveAlteracao = true;
    }

    // 3. TI ou Gestor
    if (colab.setor === 'TI' || colab.nivel >= NIVEL_GERENTE) {
      const grupoTI = conversas.find((c) => c.id === 'grupo-setor-ti-rede');
      if (grupoTI && !grupoTI.participantesIds.includes(colab.id)) {
        grupoTI.participantesIds.push(colab.id);
        houveAlteracao = true;
      }
    }

    if (houveAlteracao) {
      localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas));
      this.empurrarConversas(conversas.filter((c) => c.ehSistemaPadrao));
    }
  }

  // --- MENSAGENS ---

  obterMensagens(conversaId: string): Mensagem[] {
    try {
      const atual = this.obterColaboradorAtual();
      const todasConversas = this.obterTodasConversas();
      const conv = todasConversas.find((c) => c.id === conversaId);

      // Proteção estrita: se for conversa individual, somente os 2 participantes podem ler as mensagens
      if (conv && conv.tipo === 'individual') {
        if (!conv.participantesIds.includes(atual.id)) {
          return [];
        }
      }

      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      return todas.filter((m) => m.conversaId === conversaId);
    } catch {
      return [];
    }
  }

  podePublicarNaConversa(conversaId: string): boolean {
    const atual = this.obterColaboradorAtual();
    const conversa = this.obterConversaPorId(conversaId);
    if (!conversa) return false;

    // Conversa individual: somente os 2 participantes
    if (conversa.tipo === 'individual') {
      return conversa.participantesIds.includes(atual.id);
    }

    /**
     * Avisos da Rede: quem publica aqui é quem publica na Central.
     *
     * Eram dois números diferentes para a mesma pergunta — o líder podia
     * publicar num lugar e não no outro, para o mesmo canal.
     */
    if (conversaId === 'grupo-avisos-da-rede') {
      return publicaComunicado(atual);
    }

    // Grupos restritos a gestores/admin
    if (conversa.apenasGestoresPublicam && atual.nivel < NIVEL_TI) {
      return false;
    }

    return conversa.participantesIds.includes(atual.id);
  }

  async enviarMensagem(
    conversaId: string,
    conteudo: {
      texto?: string;
      tipo: TipoMensagem;
      audioUrl?: string;
      audioDuracao?: number;
      arquivoNome?: string;
      arquivoTamanho?: string;
      arquivoUrl?: string;
      imagemUrl?: string;
      legenda?: string;
      ehEncaminhada?: boolean;
      respondendoA?: string;
    }
  ): Promise<{ sucesso: boolean; mensagem?: Mensagem; erro?: string }> {
    if (!this.podePublicarNaConversa(conversaId)) {
      return { sucesso: false, erro: 'Permissão negada para publicar nesta conversa.' };
    }

    const atual = this.obterColaboradorAtual();
    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const novaMensagem: Mensagem = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      conversaId,
      remetenteId: atual.id,
      texto: conteudo.texto,
      tipo: conteudo.tipo,
      audioUrl: conteudo.audioUrl,
      audioDuracao: conteudo.audioDuracao,
      arquivoNome: conteudo.arquivoNome,
      arquivoTamanho: conteudo.arquivoTamanho,
      arquivoUrl: conteudo.arquivoUrl,
      imagemUrl: conteudo.imagemUrl,
      legenda: conteudo.legenda,
      criadoEm: agora.toISOString(),
      horaFormatada,
      lida: false,
      lidaPor: [atual.id],
      ehEncaminhada: !!conteudo.ehEncaminhada,
      respondendoA: conteudo.respondendoA,
      ehAvisoDirecao: conversaId === 'grupo-avisos-da-rede',
    };

    const conversas = this.obterTodasConversas();
    const indice = conversas.findIndex((c) => c.id === conversaId);

    if (usandoNuvem() && !temSessaoViva()) {
      return {
        sucesso: false,
        erro: 'Sua sessão terminou. Saia e entre de novo para enviar mensagens.',
      };
    }

    // O anexo vai para o armazenamento antes da mensagem. A linha guarda só o
    // caminho: foto embutida na tabela incha o banco e faz cada abertura de
    // conversa baixar tudo de novo.
    if (usandoNuvem()) {
      const conteudoAnexo =
        conteudo.imagemUrl || conteudo.arquivoUrl || conteudo.audioUrl;

      if (conteudoAnexo?.startsWith('data:')) {
        const enviado = await enviarAnexo(
          conteudoAnexo,
          conversaId,
          novaMensagem.id,
          conteudo.arquivoNome
        );

        if (!enviado) {
          return {
            sucesso: false,
            erro: 'Não foi possível enviar o anexo. Verifique a conexão e tente de novo.',
          };
        }

        novaMensagem.anexoCaminho = enviado.caminho;
        // A tela usa o endereço assinado na hora; o banco recebe o caminho
        if (conteudo.tipo === 'imagem') novaMensagem.imagemUrl = enviado.url;
        else if (conteudo.tipo === 'recado_voz') novaMensagem.audioUrl = enviado.url;
        else novaMensagem.arquivoUrl = enviado.url;
      }
    }

    /**
     * A MENSAGEM APARECE ANTES DE SUBIR.
     *
     * Antes o texto só surgia na tela depois de até cinco idas ao banco — a
     * conversa (quatro) e a mensagem. No celular isso é quase um segundo de
     * caixa parada, e a pessoa aperta enviar de novo achando que falhou.
     *
     * Agora ela entra na hora marcada como 'enviando' e o relógio ao lado
     * diz que ainda não confirmou. O compromisso de "só vale depois de
     * entrar no banco" continua valendo: o que muda é que a espera fica
     * VISÍVEL em vez de ser uma tela travada.
     */
    if (usandoNuvem()) novaMensagem.envio = 'enviando';
    this.guardarMensagemLocal(novaMensagem, conversas, indice, agora, horaFormatada);
    this.notificar();

    if (usandoNuvem()) {
      // A conversa só sobe na primeira vez: depois disso ela já existe, e
      // regravá-la a cada mensagem custava quatro viagens por nada
      if (indice !== -1 && !conversaJaEstaNoBanco(conversaId)) {
        const resConversa = await nuvemComunicacao.salvarConversa(
          this.comParticipantesQueExistem(conversas[indice]),
          atual.id
        );
        if (!resConversa.sucesso) {
          this.marcarFalhaDeEnvio(novaMensagem.id);
          return {
            sucesso: false,
            erro: `Não foi possível abrir a conversa no banco: ${
              resConversa.erro || 'motivo não informado'
            }`,
          };
        }
      }

      let res = await nuvemComunicacao.salvarMensagem(novaMensagem);

      /**
       * Referência quebrada quer dizer que o atalho mentiu: a conversa não
       * estava lá. Refaz e tenta uma vez — melhor do que devolver erro para
       * quem só queria mandar um "bom dia".
       */
      if (!res.sucesso && res.conversaAusente && indice !== -1) {
        esquecerConversaDoBanco(conversaId);
        const refeita = await nuvemComunicacao.salvarConversa(
          this.comParticipantesQueExistem(conversas[indice]),
          atual.id
        );
        if (refeita.sucesso) res = await nuvemComunicacao.salvarMensagem(novaMensagem);
      }

      if (!res.sucesso) {
        this.marcarFalhaDeEnvio(novaMensagem.id);
        return {
          sucesso: false,
          erro: 'Não foi possível enviar. Verifique a conexão e tente de novo.',
        };
      }

      this.confirmarEnvio(novaMensagem.id);
      return { sucesso: true, mensagem: novaMensagem };
    }

    return { sucesso: true, mensagem: novaMensagem };
  }

  /** Põe a mensagem no cache e atualiza a prévia da conversa. */
  private guardarMensagemLocal(
    mensagem: Mensagem,
    conversas: Conversa[],
    indice: number,
    agora: Date,
    horaFormatada: string
  ): void {
    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      todas.push(mensagem);
      localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(todas));

      if (indice !== -1) {
        conversas[indice].atualizadoEm = agora.toISOString();
        conversas[indice].ultimaMensagem = {
          texto: montarPreviaDaMensagem(mensagem),
          hora: horaFormatada,
          remetenteId: mensagem.remetenteId,
          tipo: mensagem.tipo,
        };
        localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas));
      }
    } catch (erro) {
      /**
       * O cache do aparelho encheu.
       *
       * No modo rede isso não impede o envio: a mensagem ainda vai para o
       * banco no passo seguinte, e é de lá que ela volta na próxima
       * sincronização. Quem falhou foi o cache.
       */
      const nome = erro instanceof Error ? erro.name : '';
      if (nome === 'QuotaExceededError' || nome === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.error('Armazenamento do aparelho cheio ao guardar a mensagem.');
      }
    }
  }

  /**
   * A confirmação do banco: tira o relógio de "enviando".
   *
   * Não regrava a mensagem inteira — só apaga a marca, que é local e nunca
   * foi para o banco.
   */
  private confirmarEnvio(mensagemId: string): void {
    this.trocarEstadoDeEnvio(mensagemId, undefined);
  }

  /**
   * O banco recusou: a mensagem SAI do aparelho.
   *
   * Deixá-la na tela, mesmo marcada, criaria uma mensagem que existe só
   * aqui — e a próxima sincronização a apagaria sem explicação. A regra da
   * rede é que mensagem não gravada no banco não foi enviada, e a tela tem
   * de dizer isso removendo o que não subiu.
   */
  private marcarFalhaDeEnvio(mensagemId: string): void {
    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      if (!bruto) return;
      const todas: Mensagem[] = JSON.parse(bruto);
      localStorage.setItem(
        CHAVE_MENSAGENS,
        JSON.stringify(todas.filter((m) => m.id !== mensagemId))
      );
      this.notificar();
    } catch {
      // Sem cache não há o que remover
    }
  }

  private trocarEstadoDeEnvio(
    mensagemId: string,
    estado: 'enviando' | undefined
  ): void {
    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      if (!bruto) return;
      const todas: Mensagem[] = JSON.parse(bruto);
      const indice = todas.findIndex((m) => m.id === mensagemId);
      if (indice === -1) return;

      if (estado) todas[indice].envio = estado;
      else delete todas[indice].envio;

      localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(todas));
      this.notificar();
    } catch {
      // Sem cache não há marca para trocar
    }
  }

  /**
   * Editar é diferente de apagar: só o autor pode, nem o Administrador.
   * Reescrever a fala de outra pessoa mantendo o nome dela seria falsificar
   * o que ela disse. O Administrador continua podendo remover.
   *
   * Vale apenas para texto — em foto, arquivo e recado de voz não há o que
   * reescrever.
   */
  podeEditarMensagem(mensagem: Mensagem): boolean {
    const atual = this.obterColaboradorAtual();
    if (mensagem.remetenteId !== atual.id) return false;
    if (mensagem.tipo !== 'texto') return false;
    return this.podePublicarNaConversa(mensagem.conversaId);
  }

  /** Reescreve o texto da própria mensagem e marca que ela foi editada. */
  async editarMensagem(
    mensagemId: string,
    novoTexto: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const texto = novoTexto.trim();
    if (!texto) {
      return { sucesso: false, erro: 'A mensagem não pode ficar vazia.' };
    }

    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      const indice = todas.findIndex((m) => m.id === mensagemId);

      if (indice === -1) return { sucesso: false, erro: 'Mensagem não encontrada.' };
      if (!this.podeEditarMensagem(todas[indice])) {
        return { sucesso: false, erro: 'Só o autor pode editar a própria mensagem.' };
      }
      if (todas[indice].texto === texto) {
        return { sucesso: true }; // Nada mudou: não marca como editada à toa
      }

      todas[indice] = { ...todas[indice], texto, editadaEm: new Date().toISOString() };

      if (usandoNuvem()) {
        const res = await nuvemComunicacao.atualizarMensagem(todas[indice]);
        if (!res.sucesso) {
          return { sucesso: false, erro: 'Falha ao salvar a edição no banco.' };
        }
      }

      localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(todas));

      // Se era a última da conversa, a prévia da lista precisa acompanhar
      const conversas = this.obterTodasConversas();
      const iConversa = conversas.findIndex((c) => c.id === todas[indice].conversaId);
      if (iConversa !== -1) {
        const daConversa = todas
          .filter((m) => m.conversaId === todas[indice].conversaId)
          .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
        const ultima = daConversa[daConversa.length - 1];
        if (ultima && ultima.id === mensagemId) {
          conversas[iConversa].ultimaMensagem = {
            texto: montarPreviaDaMensagem(ultima),
            hora: ultima.horaFormatada,
            remetenteId: ultima.remetenteId,
            tipo: ultima.tipo,
          };
          localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas));
        }
      }

      this.notificar();
      return { sucesso: true };
    } catch {
      return { sucesso: false, erro: 'Falha ao salvar a edição.' };
    }
  }

  /**
   * Quem pode apagar uma mensagem: quem a enviou e o Administrador, que
   * precisa poder remover conteúdo indevido de qualquer conversa.
   */
  /**
   * Quem pode fixar uma mensagem no alto da conversa.
   *
   * Quem pode PUBLICAR ali pode fixar. É a mesma alçada: num canal onde só
   * a gestão fala, só a gestão fixa; numa conversa entre dois, os dois.
   *
   * Não é "só o autor": fixar não é sobre a mensagem, é sobre destacá-la
   * para o grupo — e quem destaca costuma ser quem coordena, não quem
   * escreveu.
   */
  podeFixarMensagem(mensagem: Mensagem): boolean {
    return this.podePublicarNaConversa(mensagem.conversaId);
  }

  /**
   * Fixa ou desafixa. Guarda quem fixou: num grupo de 30 pessoas, "quem pôs
   * isso aqui" é a primeira pergunta, e sem autoria ninguém sabe a quem
   * pedir para tirar.
   */
  async alternarFixarMensagem(
    mensagemId: string
  ): Promise<{ sucesso: boolean; fixada?: boolean; erro?: string }> {
    const atual = this.obterColaboradorAtual();

    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      const indice = todas.findIndex((m) => m.id === mensagemId);

      if (indice === -1) return { sucesso: false, erro: 'Mensagem não encontrada.' };
      if (!this.podeFixarMensagem(todas[indice])) {
        return { sucesso: false, erro: 'Você não pode fixar mensagem nesta conversa.' };
      }

      const fixando = !todas[indice].fixadaEm;
      const atualizada: Mensagem = {
        ...todas[indice],
        fixadaEm: fixando ? new Date().toISOString() : undefined,
        fixadaPorId: fixando ? atual.id : undefined,
      };

      // O banco primeiro: uma mensagem que não subiu fixada apareceria
      // fixada só para quem clicou, e o combinado é que todos vejam
      if (usandoNuvem()) {
        const res = await nuvemComunicacao.atualizarMensagem(atualizada);
        if (!res.sucesso) {
          return { sucesso: false, erro: 'Falha ao salvar no banco.' };
        }
      }

      todas[indice] = atualizada;
      localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(todas));
      this.notificar();

      return { sucesso: true, fixada: fixando };
    } catch {
      return { sucesso: false, erro: 'Não foi possível fixar a mensagem.' };
    }
  }

  /** As fixadas de uma conversa, a mais recente primeiro. */
  obterMensagensFixadas(conversaId: string): Mensagem[] {
    return this.obterMensagens(conversaId)
      .filter((m: Mensagem) => !!m.fixadaEm)
      .sort((a: Mensagem, b: Mensagem) => (b.fixadaEm || '').localeCompare(a.fixadaEm || ''));
  }

  podeExcluirMensagem(mensagem: Mensagem): boolean {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel >= NIVEL_TI) return true;
    if (mensagem.remetenteId !== atual.id) return false;
    // Só é possível apagar o que está numa conversa da qual se participa
    const conversa = this.obterConversaPorId(mensagem.conversaId);
    return !!conversa;
  }

  /**
   * Apaga uma mensagem e recalcula a prévia da conversa, para a lista não
   * continuar mostrando o texto de algo que não existe mais.
   */
  async excluirMensagem(mensagemId: string): Promise<{ sucesso: boolean; erro?: string }> {
    const atual = this.obterColaboradorAtual();

    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      const alvo = todas.find((m) => m.id === mensagemId);

      if (!alvo) return { sucesso: false, erro: 'Mensagem não encontrada.' };
      if (!this.podeExcluirMensagem(alvo)) {
        return { sucesso: false, erro: 'Você só pode apagar as próprias mensagens.' };
      }

      if (usandoNuvem()) {
        const res = await nuvemComunicacao.removerMensagem(mensagemId);
        if (!res.sucesso) {
          return { sucesso: false, erro: 'Falha ao apagar a mensagem no banco.' };
        }
      }

      const restantes = todas.filter((m) => m.id !== mensagemId);
      localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(restantes));

      // Atualiza a prévia da conversa com a última mensagem que sobrou
      const conversas = this.obterTodasConversas();
      const indice = conversas.findIndex((c) => c.id === alvo.conversaId);
      if (indice !== -1) {
        const daConversa = restantes
          .filter((m) => m.conversaId === alvo.conversaId)
          .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
        const ultima = daConversa[daConversa.length - 1];

        conversas[indice].ultimaMensagem = ultima
          ? {
              texto: montarPreviaDaMensagem(ultima),
              hora: ultima.horaFormatada,
              remetenteId: ultima.remetenteId,
              tipo: ultima.tipo,
            }
          : undefined;
        localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas));
      }

      this.registrarAuditoria(
        'Exclusão de Mensagem',
        'seguranca',
        `${atual.nome} apagou uma mensagem${
          alvo.remetenteId !== atual.id ? ' de outro colaborador' : ''
        } na conversa ${alvo.conversaId}.`
      );
      this.notificar();
      return { sucesso: true };
    } catch {
      return { sucesso: false, erro: 'Falha ao apagar a mensagem.' };
    }
  }

  /** Texto curto da mensagem, como aparece na lista de conversas. */
  obterMensagemPorId(mensagemId: string): Mensagem | undefined {
    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      return todas.find((m) => m.id === mensagemId);
    } catch {
      return undefined;
    }
  }

  /**
   * Marca como lidas, SOMENTE para o usuário logado, as mensagens da conversa.
   * A leitura é registrada em `lidaPor` (por pessoa) — o contador `naoLidas`
   * gravado na conversa nunca é alterado aqui, senão a leitura de um usuário
   * apagaria o aviso de não lidas de todos os outros.
   */
  marcarConversaComoLida(conversaId: string): void {
    const atual = this.obterColaboradorAtual();
    let houveAlteracao = false;
    const recemLidas: string[] = [];

    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      const agoraIso = new Date().toISOString();

      todas.forEach((m) => {
        if (m.conversaId === conversaId && m.remetenteId !== atual.id) {
          if (!m.lidaPor) {
            m.lidaPor = [];
          }
          if (!m.lidaPor.includes(atual.id)) {
            m.lidaPor.push(atual.id);
            recemLidas.push(m.id);
            houveAlteracao = true;
          }
          // `lida` é o indicador de "visto" mostrado ao remetente
          if (!m.lida) {
            m.lida = true;
            m.visualizadaEm = agoraIso;
            houveAlteracao = true;
          }
        }
      });

      if (houveAlteracao) {
        localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(todas));

        // Abrir a conversa não pode esperar a rede: a marcação sobe sozinha,
        // e o "visto" aparece para o remetente quando chegar.
        if (usandoNuvem() && recemLidas.length > 0) {
          nuvemComunicacao.marcarLeitura(recemLidas, atual.id).catch(() => {});
        }

        this.notificar();
      }
    } catch (err) {
      console.error('Erro ao marcar mensagens como lidas:', err);
    }
  }

  // Encaminha uma ou mais mensagens para conversas de destino selecionadas
  /**
   * As mensagens pedidas que esta pessoa realmente pode ler.
   *
   * O filtro é o mesmo para encaminhar por dentro e para compartilhar por
   * fora, e por isso mora num lugar só: id de mensagem é adivinhável, e
   * duas cópias desta regra divergindo deixaria um dos dois caminhos
   * entregando conversa de quem não é da pessoa.
   */
  obterMensagensPorIds(mensagensIds: string[]): Mensagem[] {
    if (mensagensIds.length === 0) return [];

    const atual = this.obterColaboradorAtual();
    const todasConversas = this.obterTodasConversas();
    const bruto = localStorage.getItem(CHAVE_MENSAGENS);
    const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];

    return todas.filter((m) => {
      if (!mensagensIds.includes(m.id)) return false;
      const convOrigem = todasConversas.find((c) => c.id === m.conversaId);
      return convOrigem ? convOrigem.participantesIds.includes(atual.id) : false;
    });
  }

  /**
   * Deixa registrado o que saiu da empresa.
   *
   * O envio acontece no WhatsApp da pessoa e o sistema não tem como
   * acompanhá-lo. O que ele consegue afirmar — e é o que fica gravado — é
   * QUEM pediu para sair, QUANTAS mensagens e DE QUAL conversa.
   */
  registrarCompartilhamentoExterno(dados: {
    totalMensagens: number;
    conversaNome: string;
    comArquivos: number;
  }): void {
    const atual = this.obterColaboradorAtual();
    const anexos =
      dados.comArquivos > 0 ? ` com ${dados.comArquivos} anexo(s)` : ' (somente texto)';

    this.registrarAuditoria(
      'Compartilhado no WhatsApp',
      'seguranca',
      `${atual.nome} enviou ${dados.totalMensagens} mensagem(ns) da conversa "${dados.conversaNome}" para o WhatsApp${anexos}.`
    );
  }

  async encaminharMensagens(
    mensagensIds: string[],
    destinosConversasIds: string[]
  ): Promise<{ sucesso: boolean; totalEncaminhadas: number; erro?: string }> {
    if (mensagensIds.length === 0 || destinosConversasIds.length === 0) {
      return { sucesso: false, totalEncaminhadas: 0, erro: 'Selecione mensagens e destinatários.' };
    }

    try {
      // O filtro de quem pode ler o quê é o mesmo do compartilhamento
      // externo, e vive em `obterMensagensPorIds`
      const msgsParaEncaminhar = this.obterMensagensPorIds(mensagensIds);

      if (msgsParaEncaminhar.length === 0) {
        return { sucesso: false, totalEncaminhadas: 0, erro: 'Mensagens não encontradas ou sem permissão.' };
      }

      let count = 0;
      for (const destinoId of destinosConversasIds) {
        if (!this.podePublicarNaConversa(destinoId)) continue;

        for (const msg of msgsParaEncaminhar) {
          const enviado = await this.enviarMensagem(destinoId, {
            texto: msg.texto,
            tipo: msg.tipo,
            audioUrl: msg.audioUrl,
            audioDuracao: msg.audioDuracao,
            arquivoNome: msg.arquivoNome,
            arquivoTamanho: msg.arquivoTamanho,
            arquivoUrl: msg.arquivoUrl,
            imagemUrl: msg.imagemUrl,
            legenda: msg.legenda,
            ehEncaminhada: true,
          });
          if (enviado.sucesso) count++;
        }
      }

      this.registrarAuditoria(
        'Mensagem Encaminhada',
        'sistema',
        `${this.obterColaboradorAtual().nome} encaminhou ${mensagensIds.length} mensagem(ns) para ${destinosConversasIds.length} conversa(s).`
      );

      this.notificar();
      return { sucesso: true, totalEncaminhadas: count };
    } catch {
      return { sucesso: false, totalEncaminhadas: 0, erro: 'Falha ao processar encaminhamento.' };
    }
  }

  adicionarReacaoMensagem(conversaId: string, mensagemId: string, emoji: string): void {
    const atual = this.obterColaboradorAtual();
    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      const indice = todas.findIndex((m) => m.id === mensagemId);
      if (indice !== -1) {
        const reacoes = todas[indice].reacoes || {};
        const usuariosNoEmoji = reacoes[emoji] || [];

        if (usuariosNoEmoji.includes(atual.id)) {
          reacoes[emoji] = usuariosNoEmoji.filter((id) => id !== atual.id);
          if (reacoes[emoji].length === 0) delete reacoes[emoji];
        } else {
          reacoes[emoji] = [...usuariosNoEmoji, atual.id];
        }

        todas[indice].reacoes = reacoes;
        localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(todas));

        if (usandoNuvem()) {
          nuvemComunicacao.atualizarMensagem(todas[indice]).catch(() => {});
        }

        this.notificar();
      }
    } catch {
      // Ignora erro
    }
  }

  // --- AVISOS DA REDE ---

  obterAvisosRede(): AvisoRede[] {
    try {
      const bruto = localStorage.getItem(CHAVE_AVISOS_REDE);
      const lista: AvisoRede[] = bruto ? JSON.parse(bruto) : [];
      return lista.sort((a, b) => {
        if (a.fixadoNoTopo && !b.fixadoNoTopo) return -1;
        if (!a.fixadoNoTopo && b.fixadoNoTopo) return 1;
        return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
      });
    } catch {
      return [];
    }
  }

  /**
   * Avisos que o usuário logado deve enxergar: os da rede toda, os da própria
   * loja e os que ele mesmo publicou. Administrador (N4) vê tudo para gestão.
   * `obterAvisosRede()` segue devolvendo a lista bruta, usada no Painel ADM.
   */
  obterAvisosVisiveisParaUsuarioAtual(): AvisoRede[] {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel >= NIVEL_TI) return this.obterAvisosRede();

    return this.obterAvisosRede().filter(
      (a) =>
        a.lojaDestino === 'Todas' ||
        a.lojaDestino === atual.loja ||
        a.autorId === atual.id
    );
  }

  async criarAvisoRede(dados: {
    titulo: string;
    conteudo: string;
    prioridade: PrioridadeAviso;
    lojaDestino?: Loja | 'Todas';
    fixadoNoTopo?: boolean;
  }): Promise<{ sucesso: boolean; aviso?: AvisoRede; erro?: string }> {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_DIRETORIA) {
      return { sucesso: false, erro: 'Permissão restrita à gestão e supervisão.' };
    }

    if (!dados.titulo.trim() || !dados.conteudo.trim()) {
      return { sucesso: false, erro: 'Título e conteúdo são obrigatórios.' };
    }

    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const novoAviso: AvisoRede = {
      id: `aviso-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      titulo: dados.titulo.trim(),
      conteudo: dados.conteudo.trim(),
      prioridade: dados.prioridade || 'geral',
      autorId: atual.id,
      autorNome: atual.nome,
      autorCargo: atual.cargo,
      criadoEm: agora.toISOString(),
      horaFormatada,
      dataPorExtenso: 'Hoje',
      fixadoNoTopo: !!dados.fixadoNoTopo,
      lojaDestino: dados.lojaDestino || 'Todas',
      lidoPorIds: [atual.id],
      confirmacoesIds: [atual.id],
    };

    if (usandoNuvem()) {
      const res = await nuvemComunicacao.salvarAviso(novoAviso);
      if (!res.sucesso) {
        return { sucesso: false, erro: 'Falha ao publicar o comunicado no banco.' };
      }
      await nuvemComunicacao.marcarLeituraAviso(novoAviso.id, atual.id, true);
    }

    const lista = this.obterAvisosRede();
    lista.unshift(novoAviso);
    localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(lista));

    // Publica no grupo "Avisos da Rede"
    await this.enviarMensagem('grupo-avisos-da-rede', {
      tipo: 'texto',
      texto: `📢 [${dados.titulo.trim().toUpperCase()}]\n${dados.conteudo.trim()}`,
    });

    this.registrarAuditoria('Publicação de Comunicado', 'aviso', `${atual.nome} publicou '${novoAviso.titulo}'.`);
    this.notificar();
    return { sucesso: true, aviso: novoAviso };
  }

  confirmarLeituraAviso(avisoId: string): void {
    const atual = this.obterColaboradorAtual();
    const lista = this.obterAvisosRede();
    const indice = lista.findIndex((a) => a.id === avisoId);
    if (indice !== -1) {
      if (!lista[indice].lidoPorIds.includes(atual.id)) {
        lista[indice].lidoPorIds.push(atual.id);
        localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(lista));

        if (usandoNuvem()) {
          const confirmou = lista[indice].confirmacoesIds.includes(atual.id);
          nuvemComunicacao
            .marcarLeituraAviso(avisoId, atual.id, confirmou)
            .catch(() => {});
        }

        this.notificar();
      }
    }
  }

  alternarConfirmacaoAviso(avisoId: string): void {
    const atual = this.obterColaboradorAtual();
    const lista = this.obterAvisosRede();
    const indice = lista.findIndex((a) => a.id === avisoId);
    if (indice !== -1) {
      const confirmados = lista[indice].confirmacoesIds || [];
      if (confirmados.includes(atual.id)) {
        lista[indice].confirmacoesIds = confirmados.filter((id) => id !== atual.id);
      } else {
        lista[indice].confirmacoesIds = [...confirmados, atual.id];
      }
      if (!lista[indice].lidoPorIds.includes(atual.id)) {
        lista[indice].lidoPorIds.push(atual.id);
      }
      localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(lista));

      // Confirmar ciência é um ato da pessoa: a linha no banco é dela
      if (usandoNuvem()) {
        const confirmou = lista[indice].confirmacoesIds.includes(atual.id);
        nuvemComunicacao.marcarLeituraAviso(avisoId, atual.id, confirmou).catch(() => {});
      }

      this.notificar();
    }
  }

  alternarFixadoAviso(avisoId: string): void {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_DIRETORIA) return;

    const lista = this.obterAvisosRede();
    const indice = lista.findIndex((a) => a.id === avisoId);
    if (indice !== -1) {
      lista[indice].fixadoNoTopo = !lista[indice].fixadoNoTopo;
      localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(lista));

      if (usandoNuvem()) {
        nuvemComunicacao.salvarAviso(lista[indice]).catch(() => {});
      }

      this.notificar();
    }
  }

  async removerAviso(avisoId: string): Promise<{ sucesso: boolean; erro?: string }> {
    const atual = this.obterColaboradorAtual();
    const lista = this.obterAvisosRede();
    const aviso = lista.find((a) => a.id === avisoId);
    if (!aviso) return { sucesso: false, erro: 'Aviso não encontrado.' };

    if (atual.nivel < NIVEL_DIRETORIA && aviso.autorId !== atual.id) {
      return { sucesso: false, erro: 'Permissão negada para excluir este aviso.' };
    }

    if (usandoNuvem()) {
      const res = await nuvemComunicacao.removerAviso(avisoId);
      if (!res.sucesso) {
        return { sucesso: false, erro: 'Falha ao remover o comunicado no banco.' };
      }
    }

    const filtrada = lista.filter((a) => a.id !== avisoId);
    localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(filtrada));
    this.registrarAuditoria('Remoção de Comunicado', 'aviso', `${atual.nome} removeu o aviso '${aviso.titulo}'.`);
    this.notificar();
    return { sucesso: true };
  }

  // Mapa { colaboradorId: ultimoAvisoDispensado } — cada pessoa dispensa a faixa
  // por conta própria, sem sumir para os demais colaboradores.
  private obterMapaAvisosDirecaoLidos(): Record<string, string> {
    try {
      const bruto = localStorage.getItem(CHAVE_AVISO_LIDO);
      if (!bruto) return {};
      const dados = JSON.parse(bruto);
      return dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};
    } catch {
      // Formato antigo guardava só o ID do aviso, valendo para todos. Descartado.
      return {};
    }
  }

  obterAvisoDirecaoNaoLido(): Mensagem | null {
    const atual = this.obterColaboradorAtual();
    const msgsAvisos = this.obterMensagens('grupo-avisos-da-rede');
    if (msgsAvisos.length === 0) return null;

    const ultimoAviso = msgsAvisos[msgsAvisos.length - 1];

    // Quem publicou o aviso não precisa ser avisado do próprio comunicado
    if (ultimoAviso.remetenteId === atual.id) return null;

    // No modo rede quem responde "já vi isso" é a própria leitura da
    // mensagem, que vale em qualquer aparelho. O mapa local só continua
    // valendo no modo de demonstração.
    if (usandoNuvem()) {
      return ultimoAviso.lidaPor?.includes(atual.id) ? null : ultimoAviso;
    }

    const idJaLido = this.obterMapaAvisosDirecaoLidos()[atual.id];
    if (ultimoAviso.id === idJaLido) return null;
    return ultimoAviso;
  }

  marcarAvisoDirecaoComoLido(avisoId: string): void {
    const atual = this.obterColaboradorAtual();

    if (usandoNuvem()) {
      // Dispensar a faixa é dizer que leu — e isso é da pessoa, não do
      // aparelho: dispensou no celular, não reaparece no computador.
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todas: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      const indice = todas.findIndex((m) => m.id === avisoId);
      if (indice !== -1) {
        todas[indice].lidaPor = [...(todas[indice].lidaPor || []), atual.id];
        todas[indice].lida = true;
        localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(todas));
      }
      nuvemComunicacao.marcarLeitura([avisoId], atual.id).catch(() => {});
      this.notificar();
      return;
    }

    const mapa = this.obterMapaAvisosDirecaoLidos();
    mapa[atual.id] = avisoId;
    localStorage.setItem(CHAVE_AVISO_LIDO, JSON.stringify(mapa));
    this.notificar();
  }

  // --- CONFIGURAÇÃO E AUDITORIA DO PAINEL ADM ---

  obterConfiguracoes(): ConfiguracaoSistema {
    try {
      const bruto = localStorage.getItem(CHAVE_CONFIGURACOES);
      return bruto ? JSON.parse(bruto) : CONFIGURACAO_PADRAO;
    } catch {
      return CONFIGURACAO_PADRAO;
    }
  }

  async salvarConfiguracoes(
    config: ConfiguracaoSistema
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) {
      return { sucesso: false, erro: 'Apenas o Administrador de TI altera as diretrizes do sistema.' };
    }

    // Diretriz que vale para a rede tem que valer para a rede inteira
    if (usandoNuvem()) {
      const res = await nuvemComunicacao.salvarConfiguracoes(config);
      if (!res.sucesso) {
        return { sucesso: false, erro: 'Falha ao salvar as diretrizes no banco.' };
      }
    }

    localStorage.setItem(CHAVE_CONFIGURACOES, JSON.stringify(config));
    this.registrarAuditoria(
      'Alteração de Configurações',
      'sistema',
      `${atual.nome} atualizou as diretrizes do sistema.`
    );
    this.notificar();
    return { sucesso: true };
  }

  obterAuditoria(): RegistroAuditoria[] {
    try {
      const bruto = localStorage.getItem(CHAVE_AUDITORIA);
      return bruto ? JSON.parse(bruto) : [];
    } catch {
      return [];
    }
  }

  registrarAuditoria(
    acao: string,
    categoria: RegistroAuditoria['categoria'],
    detalhes: string
  ): void {
    try {
      const atual = this.obterColaboradorAtual();
      const registros = this.obterAuditoria();
      const agora = new Date().toISOString();
      const novo: RegistroAuditoria = {
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        dataHora: carimboDeAuditoria(agora),
        usuarioNome: atual ? atual.nome : 'Sistema',
        acao,
        categoria,
        detalhes,
      };

      // A auditoria sobe sozinha e nunca derruba a ação que ela registra:
      // travar uma exclusão de mensagem porque o log falhou seria pior do
      // que perder a linha do log.
      if (usandoNuvem()) {
        nuvemComunicacao
          .registrarAuditoria({ ...novo, dataHora: agora })
          .catch(() => {});
      }

      registros.unshift(novo);
      // Mantém últimos 100 registros
      if (registros.length > 100) registros.pop();
      localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify(registros));
    } catch {
      // Ignora erro
    }
  }

  /**
   * Apaga as mensagens anteriores à data de corte: texto, foto, áudio e
   * documento. A conversa passa a começar na data de corte.
   *
   * NADA FORA DA CONVERSA É TOCADO — ponto e banco de horas, cadastro de
   * colaboradores, comunicados da rede, códigos das lojas, configurações e
   * auditoria ficam intactos. A função do banco só conhece a tabela de
   * mensagens; não é uma verificação que alguém possa desligar por engano.
   *
   * O banco devolve os caminhos dos arquivos que ficaram órfãos, porque
   * apagar a linha não alcança o armazenamento: sem isso o espaço
   * continuaria ocupado por anexos que nenhuma mensagem mais aponta.
   */
  async limparConversasAntigas(
    dataCorte: string
  ): Promise<{ sucesso: boolean; mensagens?: number; arquivos?: number; erro?: string }> {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) {
      return { sucesso: false, erro: 'Apenas o Administrador pode limpar o histórico.' };
    }
    if (!usandoNuvem()) {
      return { sucesso: false, erro: 'Disponível apenas com o banco da rede ligado.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCorte)) {
      return { sucesso: false, erro: 'Informe a data de corte no formato AAAA-MM-DD.' };
    }
    if (dataCorte >= hojeEmIso()) {
      return { sucesso: false, erro: 'A data de corte precisa ser anterior a hoje.' };
    }

    const resultado = await nuvemComunicacao.limparConversasAte(dataCorte);
    if (!resultado.sucesso) {
      return { sucesso: false, erro: resultado.erro || 'Falha ao limpar o histórico.' };
    }

    const arquivos = await apagarAnexos(resultado.caminhos || []);

    this.registrarAuditoria(
      'Limpeza de Histórico',
      'seguranca',
      `${atual.nome} apagou ${resultado.removidas} mensagem(ns) anteriores a ${dataCorte}, liberando ${arquivos} arquivo(s). Ponto e cadastros não foram tocados.`
    );

    await nuvemComunicacao.sincronizarConversas();
    return { sucesso: true, mensagens: resultado.removidas, arquivos };
  }

  /**
   * Aplica a regra da casa: guardar os últimos N meses de conversa e apagar
   * o que passou disso.
   *
   * Roda na sessão de um Administrador e no máximo uma vez por dia. A marca
   * da última execução fica nas configurações da REDE, não no aparelho —
   * senão cada computador rodaria a sua.
   *
   * Nada acontece sem regra escrita: com `mesesHistoricoConversas` em zero a
   * limpeza automática fica desligada e só a ação manual funciona.
   */
  async aplicarRegraDeLimpeza(): Promise<{ executou: boolean; mensagens?: number }> {
    if (!usandoNuvem()) return { executou: false };

    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) return { executou: false };

    const config = this.obterConfiguracoes();
    const meses = config.mesesHistoricoConversas ?? 0;
    if (meses <= 0) return { executou: false };

    // Uma vez por dia basta: a regra é mensal, não de minuto em minuto
    if (config.ultimaLimpezaConversas?.slice(0, 10) === hojeEmIso()) {
      return { executou: false };
    }

    const corte = new Date();
    corte.setMonth(corte.getMonth() - meses);

    const res = await this.limparConversasAntigas(emIso(corte));
    if (!res.sucesso) return { executou: false };

    await this.salvarConfiguracoes({
      ...config,
      ultimaLimpezaConversas: new Date().toISOString(),
    });

    return { executou: true, mensagens: res.mensagens };
  }

  exportarBackup(): string {
    const dados = {
      exportadoEm: new Date().toISOString(),
      versao: 'conecta-v4',
      colaboradores: this.obterColaboradores(),
      conversas: this.obterTodasConversas(),
      mensagens: (() => {
        try {
          return JSON.parse(localStorage.getItem(CHAVE_MENSAGENS) || '[]');
        } catch {
          return [];
        }
      })(),
      avisos: this.obterAvisosRede(),
      configuracoes: this.obterConfiguracoes(),
      auditoria: this.obterAuditoria(),
    };
    return JSON.stringify(dados, null, 2);
  }

  importarBackup(jsonStr: string): { sucesso: boolean; erro?: string } {
    const atual = this.obterColaboradorAtual();
    if (atual.nivel < NIVEL_TI) {
      return { sucesso: false, erro: 'Apenas o Administrador pode importar um backup.' };
    }
    if (usandoNuvem()) {
      return { sucesso: false, erro: RECUSA_MODO_REDE };
    }

    try {
      const dados = JSON.parse(jsonStr);
      if (!Array.isArray(dados.colaboradores) || !Array.isArray(dados.conversas)) {
        return { sucesso: false, erro: 'Arquivo de backup inválido ou corrompido.' };
      }

      localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(dados.colaboradores));
      localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(dados.conversas));
      if (dados.mensagens) localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(dados.mensagens));
      if (dados.avisos) localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(dados.avisos));
      if (dados.configuracoes) localStorage.setItem(CHAVE_CONFIGURACOES, JSON.stringify(dados.configuracoes));
      if (dados.auditoria) localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify(dados.auditoria));

      // Se a conta logada não existe no backup restaurado, encerra a sessão em
      // vez de deixar o sistema cair no primeiro colaborador da lista.
      if (!this.obterColaboradorPorId(atual.id)) {
        localStorage.removeItem(CHAVE_COLABORADOR_ATUAL);
        this.esquecerUltimoAcessoDoDispositivo();
      }

      this.registrarAuditoria('Restauração de Backup', 'seguranca', 'Backup restaurado com sucesso.');
      this.notificar();
      return { sucesso: true };
    } catch {
      return { sucesso: false, erro: 'Arquivo de backup inválido ou corrompido.' };
    }
  }

  // Estatísticas consolidada para Painel e Gestão
  obterEstatisticasRede() {
    const colaboradores = this.obterColaboradores();
    const avisos = this.obterAvisosRede();
    const conversas = this.obterTodasConversas();

    let disponiveis = 0;
    let ocupados = 0;
    let ausentes = 0;
    let desconectados = 0;

    const porLoja: Record<string, { total: number; online: number }> = {
      Pirassununga: { total: 0, online: 0 },
      'Porto Ferreira': { total: 0, online: 0 },
      Palmeiras: { total: 0, online: 0 },
      Descalvado: { total: 0, online: 0 },
      'Santa Rita': { total: 0, online: 0 },
      Rede: { total: 0, online: 0 },
    };

    const porSetor: Record<string, number> = {};

    colaboradores.forEach((c) => {
      if (c.presenca === 'disponivel') disponiveis++;
      else if (c.presenca === 'ocupado') ocupados++;
      else if (c.presenca === 'ausente') ausentes++;
      else if (c.presenca === 'desconectado') desconectados++;

      if (!porLoja[c.loja]) {
        porLoja[c.loja] = { total: 0, online: 0 };
      }
      porLoja[c.loja].total++;
      if (c.presenca === 'disponivel' || c.presenca === 'ocupado') {
        porLoja[c.loja].online++;
      }

      porSetor[c.setor] = (porSetor[c.setor] || 0) + 1;
    });

    let totalMensagens = 0;
    let mensagensHoje = 0;
    let chamadasHoje = 0;
    try {
      const bruto = localStorage.getItem(CHAVE_MENSAGENS);
      const todasMensagens: Mensagem[] = bruto ? JSON.parse(bruto) : [];
      totalMensagens = todasMensagens.length;

      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);
      const doDia = todasMensagens.filter(
        (m) => new Date(m.criadoEm).getTime() >= inicioDoDia.getTime()
      );
      mensagensHoje = doDia.length;
      chamadasHoje = doDia.filter((m) => m.tipo === 'recado_voz').length;
    } catch {
      totalMensagens = 0;
    }

    return {
      totalColaboradores: colaboradores.length,
      disponiveis,
      ocupados,
      ausentes,
      desconectados,
      totalOnline: disponiveis + ocupados,
      porLoja,
      porSetor,
      totalAvisosVigentes: avisos.length,
      avisosUrgentes: avisos.filter((a) => a.prioridade === 'urgente').length,
      totalConversas: conversas.length,
      totalMensagens,
      mensagensHoje,
      // Recados de voz do dia. Antes era um número fixo de demonstração.
      chamadasHoje,
      totalLojasComEquipe: Object.values(porLoja).filter((l) => l.total > 0).length,
    };
  }
}

export const bancoDados = new BancoDadosConecta();
