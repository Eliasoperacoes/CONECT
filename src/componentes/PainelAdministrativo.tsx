import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Building2,
  Radio,
  MessageSquare,
  Megaphone,
  Settings,
  Shield,
  Plus,
  Trash2,
  Edit2,
  KeyRound,
  Download,
  Upload,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  UserPlus,
  Sparkles,
  Phone,
  Mail,
  Sliders,
  Check,
  X,
  Layers,
  FileSpreadsheet,
  RotateCcw,
  UserMinus,
  AlertCircle,
  Camera,
  Clock,
  Image as ImageIcon,
} from 'lucide-react';
import {
  Colaborador,
  Loja,
  Setor,
  NivelHierarquico,
  ConfiguracaoSistema,
  RegistroAuditoria,
  AvisoRede,
  PrioridadeAviso,
  CARGA_HORARIA_PADRAO_MINUTOS,
  SENHA_PADRAO_PRIMEIRO_ACESSO,
} from '../tipos';
import { bancoDados, FOTO_PADRAO_LOGO_EMPRESA, obterFotoColaborador } from '../servicos/bancoDados';
import { servicoPonto } from '../servicos/ponto';
import { usandoNuvem } from '../servicos/supabase';
import { ehArquivoDeImagem, comprimirImagem } from '../servicos/imagens';
import { ModalAlterarFoto } from './ModalAlterarFoto';
import { ImportacaoPlanilhaFuncionarios } from './ImportacaoPlanilhaFuncionarios';
import { baixarPlanilhaModeloExcel } from '../servicos/planilhaFuncionarios';

interface PropsPainelAdministrativo {
  colaboradorAtual: Colaborador;
  aoFechar: () => void;
  aoAbrirConversa: (conversaId: string) => void;
}

type AbaAdmin =
  | 'colaboradores'
  | 'planilha'
  | 'lojas'
  | 'canais'
  | 'avisos'
  | 'parametros'
  | 'auditoria'
  | 'backup';

const LOJAS_TODAS: Loja[] = [
  'Pirassununga',
  'Porto Ferreira',
  'Palmeiras',
  'Descalvado',
  'Santa Rita',
  'Rede',
];

const SETORES_TODOS: Setor[] = [
  'TI',
  'Diretoria',
  'Balcão',
  'Estoque',
  'Caixas',
  'Compras',
  'Garantia',
  'Callcenter',
  'Tesouraria',
  'RH',
];

export const PainelAdministrativo: React.FC<PropsPainelAdministrativo> = ({
  colaboradorAtual,
  aoFechar,
  aoAbrirConversa,
}) => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAdmin>('colaboradores');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [configuracoes, setConfiguracoes] = useState<ConfiguracaoSistema>(
    bancoDados.obterConfiguracoes()
  );
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [avisos, setAvisos] = useState<AvisoRede[]>([]);

  // Filtros de colaboradores
  const [buscaColab, setBuscaColab] = useState('');
  const [filtroLoja, setFiltroLoja] = useState<Loja | 'Todas'>('Todas');
  const [filtroSetor, setFiltroSetor] = useState<Setor | 'Todos'>('Todos');

  // Modal Novo/Editar Colaborador
  const [modalColabAberto, setModalColabAberto] = useState(false);
  const [colabEditando, setColabEditando] = useState<Colaborador | null>(null);
  const [formColab, setFormColab] = useState({
    nome: '',
    login: '',
    senha: '123',
    cargo: '',
    setor: 'Balcão' as Setor,
    loja: 'Pirassununga' as Loja,
    nivel: 1 as NivelHierarquico,
    ramal: '',
    telefone: '',
    email: '',
    foto: '',
    cargaHorariaDiariaMinutos: CARGA_HORARIA_PADRAO_MINUTOS,
  });

  // Modal Novo Canal/Grupo
  const [modalGrupoAberto, setModalGrupoAberto] = useState(false);
  const [nomeGrupo, setNomeGrupo] = useState('');
  const [descGrupo, setDescGrupo] = useState('');
  const [apenasGestoresGrupo, setApenasGestoresGrupo] = useState(false);

  // Modal Novo Comunicado Oficial
  const [modalAvisoAberto, setModalAvisoAberto] = useState(false);
  const [formAviso, setFormAviso] = useState({
    titulo: '',
    conteudo: '',
    prioridade: 'geral' as PrioridadeAviso,
    lojaDestino: 'Todas' as Loja | 'Todas',
    fixadoNoTopo: false,
  });

  // Notificação Toast
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Modal para Resetar Usuários de Teste (100% seguro em iframes)
  const [modalResetUsuariosAberto, setModalResetUsuariosAberto] = useState(false);
  // Modal para Alteração de Foto do Colaborador
  const [colaboradorParaAlterarFoto, setColaboradorParaAlterarFoto] = useState<Colaborador | null>(null);
  // Modal para Confirmar Exclusão de Colaborador
  const [colabParaExcluir, setColabParaExcluir] = useState<{ id: string; nome: string } | null>(null);
  // Modal para Confirmar Exclusão de Comunicado Oficial
  const [avisoParaExcluirId, setAvisoParaExcluirId] = useState<string | null>(null);

  const exibirToast = (msg: string, erro = false) => {
    if (erro) {
      setMensagemErro(msg);
      setTimeout(() => setMensagemErro(null), 4000);
    } else {
      setMensagemSucesso(msg);
      setTimeout(() => setMensagemSucesso(null), 3000);
    }
  };

  const recarregar = () => {
    setColaboradores(bancoDados.obterColaboradores());
    setConfiguracoes(bancoDados.obterConfiguracoes());
    setAuditoria(bancoDados.obterAuditoria());
    setAvisos(bancoDados.obterAvisosRede());
  };

  useEffect(() => {
    recarregar();
    const cancelar = bancoDados.assinarAlteracoes(recarregar);
    return () => cancelar();
  }, []);

  // Regra de segurança: somente Administrador (N4) tem todas as funções
  // liberadas. A checagem fica DEPOIS dos hooks — sair antes deles mudaria a
  // quantidade de hooks entre renderizações e quebraria o React caso o nível
  // do usuário conectado mudasse com o painel aberto.
  if (colaboradorAtual.nivel < 4) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--c-canvas)] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center mb-4 border border-red-500/20 shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[var(--c-texto)] mb-2">
          Acesso Restrito ao Administrador
        </h2>
        <p className="text-sm text-[var(--c-texto-3)] max-w-md mb-6 leading-relaxed">
          Somente o Administrador de TI possui todas as funções e permissões liberadas no sistema CONECTA.
          Cada usuário possui acesso individual e limitado de acordo com o que está liberado para seu perfil.
        </p>
        <button
          type="button"
          onClick={aoFechar}
          className="px-6 py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-semibold shadow-xs hover:brightness-110 active:scale-95 transition-all"
        >
          Retornar ao Comunicador
        </button>
      </div>
    );
  }

  // Abre modal para novo colaborador
  const abrirModalNovoColab = () => {
    setColabEditando(null);
    setFormColab({
      nome: '',
      login: '',
      senha: '123',
      cargo: '',
      setor: 'Balcão',
      loja: 'Pirassununga',
      nivel: 1,
      ramal: '',
      telefone: '',
      email: '',
      foto: FOTO_PADRAO_LOGO_EMPRESA,
      cargaHorariaDiariaMinutos: CARGA_HORARIA_PADRAO_MINUTOS,
    });
    setModalColabAberto(true);
  };

  // Abre modal para editar colaborador
  const abrirModalEditarColab = (colab: Colaborador) => {
    setColabEditando(colab);
    setFormColab({
      nome: colab.nome,
      login: colab.login || '',
      senha: colab.senha || '',
      cargo: colab.cargo,
      setor: colab.setor,
      loja: colab.loja,
      nivel: colab.nivel,
      ramal: colab.ramal || '',
      telefone: colab.telefone || '',
      email: colab.email || '',
      foto: colab.foto || FOTO_PADRAO_LOGO_EMPRESA,
      cargaHorariaDiariaMinutos:
        colab.cargaHorariaDiariaMinutos ?? CARGA_HORARIA_PADRAO_MINUTOS,
    });
    setModalColabAberto(true);
  };

  // Processa e otimiza foto para o formulário de cadastro/edição de colaborador
  const processarArquivoFotoForm = async (arquivo: File) => {
    if (!ehArquivoDeImagem(arquivo)) {
      exibirToast('Por favor, selecione um arquivo de imagem válido.', true);
      return;
    }

    // Foto de perfil é pequena na tela: 400px já basta e economiza espaço
    const dataUrl = await comprimirImagem(arquivo, 400, 0.85);
    if (!dataUrl) {
      exibirToast('Não foi possível ler esta imagem.', true);
      return;
    }

    setFormColab((prev) => ({ ...prev, foto: dataUrl }));
    exibirToast('Foto selecionada e otimizada com sucesso.');
  };

  // Salva colaborador (criação ou edição)
  const salvarColaborador = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formColab.nome.trim() || !formColab.login.trim()) {
      exibirToast('Nome e login são obrigatórios.', true);
      return;
    }

    if (colabEditando) {
      const res = bancoDados.atualizarColaborador(colabEditando.id, {
        nome: formColab.nome.trim(),
        login: formColab.login.trim(),
        senha: formColab.senha.trim(),
        cargo: formColab.cargo.trim(),
        setor: formColab.setor,
        loja: formColab.loja,
        nivel: formColab.nivel,
        ramal: formColab.ramal.trim(),
        telefone: formColab.telefone.trim(),
        email: formColab.email.trim(),
        foto: formColab.foto.trim() || colabEditando.foto,
        cargaHorariaDiariaMinutos: formColab.cargaHorariaDiariaMinutos,
      });
      if (res.sucesso) {
        exibirToast(`Colaborador ${formColab.nome} atualizado com sucesso.`);
        setModalColabAberto(false);
      } else {
        exibirToast(res.erro || 'Falha ao atualizar.', true);
      }
    } else {
      const res = bancoDados.criarColaborador(formColab);
      if (res.sucesso) {
        exibirToast(`Colaborador ${formColab.nome} cadastrado com sucesso.`);
        setModalColabAberto(false);
      } else {
        exibirToast(res.erro || 'Falha ao cadastrar.', true);
      }
    }
  };

  // Confirmar exclusão de colaborador via modal in-app
  const confirmarExclusaoColaborador = () => {
    if (!colabParaExcluir) return;
    const res = bancoDados.removerColaborador(colabParaExcluir.id);
    if (res.sucesso) {
      // Limpa também o banco de horas, senão sobrariam registros sem dono
      servicoPonto.removerRegistrosDoColaborador(colabParaExcluir.id);
      exibirToast(`Colaborador "${colabParaExcluir.nome}" removido com sucesso.`);
      recarregar();
    } else {
      exibirToast(res.erro || 'Falha ao remover colaborador.', true);
    }
    setColabParaExcluir(null);
  };

  // Povoar colaboradores de exemplo
  const povoarExemplos = () => {
    const res = bancoDados.gerarColaboradoresExemplo();
    if (res.sucesso) {
      exibirToast(`${res.totalAdicionados} colaboradores de demonstração foram adicionados à rede.`);
      recarregar();
    } else {
      exibirToast(res.erro || 'Colaboradores de exemplo já cadastrados na base.', !!res.erro);
    }
  };

  // Limpar mantendo exclusivamente a conta Admin Elias
  const executarResetManterElias = () => {
    const res = bancoDados.limparColaboradoresManterAdmin();
    setModalResetUsuariosAberto(false);
    recarregar();
    exibirToast(
      res.sucesso
        ? 'Base redefinida com sucesso. Apenas o Administrador Elias está ativo no sistema.'
        : res.erro || 'Falha ao redefinir a base.',
      !res.sucesso
    );
  };

  // Restaurar integralmente os usuários de teste padrão da rede
  const executarRestaurarPadraoTeste = () => {
    const res = bancoDados.resetarColaboradoresParaPadraoExemplo();
    setModalResetUsuariosAberto(false);
    recarregar();
    exibirToast(
      res.sucesso
        ? `Equipe de testes restaurada com sucesso (${res.total} colaboradores na rede).`
        : res.erro || 'Falha ao restaurar a equipe de testes.',
      !res.sucesso
    );
  };

  // Confirmar exclusão de comunicado oficial via modal in-app
  const confirmarExclusaoAviso = async () => {
    if (!avisoParaExcluirId) return;
    const res = await bancoDados.removerAviso(avisoParaExcluirId);
    setAvisoParaExcluirId(null);
    recarregar();
    exibirToast(
      res.sucesso ? 'Comunicado oficial removido da rede.' : res.erro || 'Falha ao remover.',
      !res.sucesso
    );
  };

  // Salvar parâmetros do sistema
  const salvarParametros = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await bancoDados.salvarConfiguracoes(configuracoes);
    if (res.sucesso) {
      exibirToast('Configurações do sistema salvas com sucesso.');
    } else {
      exibirToast(res.erro || 'Falha ao salvar configurações.', true);
    }
  };

  // Salvar novo grupo oficial
  const salvarNovoGrupo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeGrupo.trim()) {
      exibirToast('Informe o nome do canal.', true);
      return;
    }
    const res = bancoDados.criarGrupo({
      nome: nomeGrupo.trim(),
      descricao: descGrupo.trim(),
      participantesIds: colaboradores.map((c) => c.id),
      apenasGestoresPublicam: apenasGestoresGrupo,
    });
    if (res.sucesso && res.grupo) {
      exibirToast(`Canal "${res.grupo.nome}" criado com sucesso.`);
      setModalGrupoAberto(false);
      setNomeGrupo('');
      setDescGrupo('');
      aoAbrirConversa(res.grupo.id);
    } else {
      exibirToast(res.erro || 'Erro ao criar grupo.', true);
    }
  };

  // Salvar comunicado oficial
  const salvarComunicado = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await bancoDados.criarAvisoRede(formAviso);
    if (res.sucesso) {
      exibirToast('Comunicado oficial publicado na rede.');
      setModalAvisoAberto(false);
      setFormAviso({
        titulo: '',
        conteudo: '',
        prioridade: 'geral',
        lojaDestino: 'Todas',
        fixadoNoTopo: false,
      });
    } else {
      exibirToast(res.erro || 'Erro ao publicar.', true);
    }
  };

  // Exportar backup JSON
  const exportarBackup = () => {
    const jsonStr = bancoDados.exportarBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_conecta_malachias_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    exibirToast('Arquivo de backup exportado.');
  };

  // Importar backup JSON
  const importarBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = (evento) => {
      const conteudo = evento.target?.result as string;
      const res = bancoDados.importarBackup(conteudo);
      if (res.sucesso) {
        exibirToast('Backup importado com sucesso!');
        recarregar();
      } else {
        exibirToast(res.erro || 'Arquivo de backup inválido ou corrompido.', true);
      }
    };
    leitor.readAsText(arquivo);
  };

  // Filtro de colaboradores
  const colaboradoresFiltrados = colaboradores.filter((c) => {
    if (buscaColab.trim()) {
      const termo = buscaColab.toLowerCase();
      const match =
        c.nome.toLowerCase().includes(termo) ||
        (c.login && c.login.toLowerCase().includes(termo)) ||
        c.cargo.toLowerCase().includes(termo) ||
        (c.ramal && c.ramal.includes(termo));
      if (!match) return false;
    }
    if (filtroLoja !== 'Todas' && c.loja !== filtroLoja) return false;
    if (filtroSetor !== 'Todos' && c.setor !== filtroSetor) return false;
    return true;
  });

  return (
    <div
      id="painel-administrativo-conecta"
      className="w-full h-full flex flex-col bg-[var(--c-canvas)] text-[var(--c-texto)] overflow-hidden"
    >
      {/* Toast Feedback */}
      {mensagemSucesso && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5" />
          <span>{mensagemSucesso}</span>
        </div>
      )}
      {mensagemErro && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-in fade-in slide-in-from-top-4">
          <AlertTriangle className="w-5 h-5" />
          <span>{mensagemErro}</span>
        </div>
      )}

      {/* Topo do Painel Administrativo */}
      <header className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-4 sm:px-6 py-4 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-[var(--c-texto)] tracking-tight">
                Painel Administrativo CONECTA
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                Gestão Geral
              </span>
            </div>
            <p className="text-xs text-[var(--c-texto-3)]">
              Malachias Autopeças · Controle de Usuários, Lojas, Canais e Parâmetros
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-2 bg-[var(--c-superficie-2)] px-3 py-1.5 rounded-xl border border-[var(--c-borda)] text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[var(--c-texto-2)]">Conectado como:</span>
            <strong className="text-[var(--c-texto)]">{colaboradorAtual.nome}</strong>
            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded">
              Nível {colaboradorAtual.nivel}
            </span>
          </div>

          <button
            type="button"
            id="botao-fechar-painel-adm"
            onClick={aoFechar}
            className="p-2 rounded-xl text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] border border-[var(--c-borda)] transition-colors"
            title="Voltar ao Comunicador"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Menu Superior de Ferramentas / Abas ADM */}
      <div className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-4 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
        {[
          { id: 'colaboradores', rotulo: 'Colaboradores & Acessos', icone: Users, contador: colaboradores.length },
          { id: 'planilha', rotulo: 'Subir Planilha Excel', icone: FileSpreadsheet },
          { id: 'lojas', rotulo: 'Lojas & Unidades', icone: Building2, contador: 5 },
          { id: 'canais', rotulo: 'Canais & Grupos', icone: MessageSquare },
          { id: 'avisos', rotulo: 'Comunicados Oficiais', icone: Megaphone, contador: avisos.length },
          { id: 'parametros', rotulo: 'Parâmetros & Rádio PTT', icone: Sliders },
          { id: 'auditoria', rotulo: 'Auditoria & Logs', icone: FileText, contador: auditoria.length },
          { id: 'backup', rotulo: 'Backup & Dados', icone: Download },
        ].map((tab) => {
          const Icone = tab.icone;
          const ativo = abaAtiva === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              id={`aba-adm-${tab.id}`}
              onClick={() => setAbaAtiva(tab.id as AbaAdmin)}
              className={`px-3.5 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                ativo
                  ? 'border-[var(--c-acento)] text-[var(--c-acento)]'
                  : 'border-transparent text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:border-[var(--c-borda)]'
              }`}
            >
              <Icone className="w-4 h-4" />
              <span>{tab.rotulo}</span>
              {tab.contador !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    ativo
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)]'
                  }`}
                >
                  {tab.contador}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo Dinâmico da Aba Selecionada */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[var(--c-canvas)]">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* ================= ABA 1: COLABORADORES & ACESSOS ================= */}
          {abaAtiva === 'colaboradores' && (
            <div className="space-y-4">
              {/* Barra de Ações Rápidas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--c-superficie)] p-4 rounded-2xl border border-[var(--c-borda)] shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-[var(--c-texto)]">
                    Quadro Geral de Colaboradores & Logins
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Gerencie credenciais, filiais de trabalho, ramais e níveis hierárquicos de acesso.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    id="botao-ir-para-planilha"
                    onClick={() => setAbaAtiva('planilha')}
                    className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                    title="Importar ou atualizar funcionários em lote com planilha Excel"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Subir Planilha Excel</span>
                  </button>

                  <button
                    type="button"
                    id="botao-baixar-modelo-rapido"
                    onClick={baixarPlanilhaModeloExcel}
                    className="py-2 px-3 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-canvas)] flex items-center gap-1.5 transition-all"
                    title="Baixar planilha modelo do Excel (.xlsx) com as colunas necessárias"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Baixar Modelo (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    id="botao-novo-colaborador"
                    onClick={abrirModalNovoColab}
                    className="py-2 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 shadow-sm transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Novo Colaborador</span>
                  </button>

                  <button
                    type="button"
                    id="botao-resetar-usuarios-teste"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setModalResetUsuariosAberto(true);
                    }}
                    className="py-2 px-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    title="Resetar, restaurar ou limpar os colaboradores de teste do sistema"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Resetar Usuários Teste</span>
                  </button>
                </div>
              </div>

              {/* Filtros e Busca */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--c-texto-3)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar por nome, login, cargo ou ramal..."
                    value={buscaColab}
                    onChange={(e) => setBuscaColab(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] placeholder-[var(--c-texto-3)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  />
                </div>

                <div>
                  <select
                    value={filtroLoja}
                    onChange={(e) => setFiltroLoja(e.target.value as Loja | 'Todas')}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  >
                    <option value="Todas">Todas as Lojas (Rede)</option>
                    {LOJAS_TODAS.map((l) => (
                      <option key={l} value={l}>
                        Loja: {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={filtroSetor}
                    onChange={(e) => setFiltroSetor(e.target.value as Setor | 'Todos')}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  >
                    <option value="Todos">Todos os Setores</option>
                    {SETORES_TODOS.map((s) => (
                      <option key={s} value={s}>
                        Setor: {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabela de Colaboradores */}
              <div className="bg-[var(--c-superficie)] rounded-2xl border border-[var(--c-borda)] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--c-superficie-2)] border-b border-[var(--c-borda)] text-[var(--c-texto-3)] font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Colaborador</th>
                        <th className="py-3 px-3">Login / Senha</th>
                        <th className="py-3 px-3">Loja / Filial</th>
                        <th className="py-3 px-3">Setor</th>
                        <th className="py-3 px-3">Ramal</th>
                        <th className="py-3 px-3">Nível Hierárquico</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--c-borda)] text-[var(--c-texto)]">
                      {colaboradoresFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-[var(--c-texto-3)]">
                            Nenhum colaborador encontrado com os filtros atuais.
                          </td>
                        </tr>
                      ) : (
                        colaboradoresFiltrados.map((colab) => {
                          const ehAdminPrincipal = colab.id === 'colab-admin-elias';
                          return (
                            <tr key={colab.id} className="hover:bg-[var(--c-superficie-2)] transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setColaboradorParaAlterarFoto(colab)}
                                    className="group/foto relative w-9 h-9 rounded-full overflow-hidden bg-white border border-[var(--c-borda)] flex-shrink-0 flex items-center justify-center font-bold text-xs cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all text-left"
                                    title="Clique para alterar a foto ou redefinir para a logo"
                                  >
                                    <img
                                      src={colab.foto || FOTO_PADRAO_LOGO_EMPRESA}
                                      alt={colab.nome}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/foto:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <Camera className="w-3.5 h-3.5" />
                                    </div>
                                  </button>
                                  <div>
                                    <div className="font-bold flex items-center gap-1.5">
                                      <span>{colab.nome}</span>
                                      {ehAdminPrincipal && (
                                        <span className="text-[9px] bg-indigo-500/10 text-indigo-600 font-mono px-1 rounded font-bold border border-indigo-500/20">
                                          ADMIN MESTRE
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-[var(--c-texto-3)] block">
                                      {colab.cargo}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3 px-3 font-mono">
                                <div className="text-[var(--c-texto)] font-semibold">
                                  {colab.login || '—'}
                                </div>
                                {/* No modo rede a senha vive na autenticação e
                                    ninguém a lê, nem o administrador. O que
                                    interessa aqui é se o acesso já foi ativado. */}
                                {usandoNuvem() ? (
                                  <span className="text-[10px] text-[var(--c-texto-3)]">
                                    Senha definida pelo colaborador
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-[var(--c-texto-3)]">
                                    Senha: {colab.senha || SENHA_PADRAO_PRIMEIRO_ACESSO}
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded-full bg-[var(--c-canvas)] border border-[var(--c-borda)] font-medium text-[11px]">
                                  {colab.loja}
                                </span>
                              </td>

                              <td className="py-3 px-3 font-medium text-[11px] text-[var(--c-texto-2)]">
                                {colab.setor}
                              </td>

                              <td className="py-3 px-3 font-mono font-bold text-emerald-600">
                                {colab.ramal ? `Ramal ${colab.ramal}` : '—'}
                              </td>

                              <td className="py-3 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    colab.nivel === 4
                                      ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                                      : colab.nivel === 3
                                      ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                                      : colab.nivel === 2
                                      ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                      : 'bg-zinc-500/10 text-zinc-600 border border-zinc-500/20'
                                  }`}
                                >
                                  {colab.nivel === 4
                                    ? '4 - Administrador'
                                    : colab.nivel === 3
                                    ? '3 - Gestor'
                                    : colab.nivel === 2
                                    ? '2 - Supervisor'
                                    : '1 - Operador'}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setColaboradorParaAlterarFoto(colab)}
                                    className="p-1.5 rounded-lg hover:bg-blue-500/10 text-[var(--c-texto-2)] hover:text-blue-600 transition-colors"
                                    title="Alterar Foto / Usar Logo Padrão"
                                  >
                                    <Camera className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => abrirModalEditarColab(colab)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--c-canvas)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
                                    title="Editar Dados e Acesso"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>

                                  {!ehAdminPrincipal && (
                                    <button
                                      type="button"
                                      onClick={() => setColabParaExcluir({ id: colab.id, nome: colab.nome })}
                                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--c-texto-3)] hover:text-red-600 transition-colors"
                                      title="Remover Colaborador"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= ABA: SUBIR PLANILHA EXCEL ================= */}
          {abaAtiva === 'planilha' && (
            <ImportacaoPlanilhaFuncionarios
              colaboradoresAtuais={colaboradores}
              aoConcluirImportacao={(msg) => {
                exibirToast(msg);
                recarregar();
              }}
              aoIrParaColaboradores={() => setAbaAtiva('colaboradores')}
            />
          )}

          {/* ================= ABA 2: LOJAS & UNIDADES ================= */}
          {abaAtiva === 'lojas' && (
            <div className="space-y-4">
              <div className="bg-[var(--c-superficie)] p-4 rounded-2xl border border-[var(--c-borda)] shadow-sm">
                <h2 className="text-sm font-bold text-[var(--c-texto)]">
                  Rede de Lojas Malachias Autopeças (5 Unidades)
                </h2>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Estrutura operacional física interligada via canal de dados central e rádio comunicador.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    nome: 'Pirassununga',
                    tipo: 'Matriz Principal & Doca Central',
                    endereco: 'Av. Painguás, 1200 - Centro, Pirassununga - SP',
                    telefone: '(19) 3561-1000',
                    ramalGeral: '100',
                    gerente: 'Carlos Malachias / Elias (Admin)',
                    grupoId: 'grupo-loja-pirassununga',
                  },
                  {
                    nome: 'Porto Ferreira',
                    tipo: 'Filial 01',
                    endereco: 'Rua Dona Balbina, 450 - Centro, Porto Ferreira - SP',
                    telefone: '(19) 3581-2000',
                    ramalGeral: '200',
                    gerente: 'Roberto Fagundes',
                    grupoId: 'grupo-loja-porto-ferreira',
                  },
                  {
                    nome: 'Palmeiras',
                    tipo: 'Filial 02',
                    endereco: 'Rua XV de Novembro, 310 - Centro, Santa Cruz das Palmeiras - SP',
                    telefone: '(19) 3672-3000',
                    ramalGeral: '300',
                    gerente: 'Lucas Mendonça',
                    grupoId: 'grupo-loja-palmeiras',
                  },
                  {
                    nome: 'Descalvado',
                    tipo: 'Filial 03',
                    endereco: 'Av. Guerino Oswaldo, 780 - Centro, Descalvado - SP',
                    telefone: '(19) 3583-4000',
                    ramalGeral: '400',
                    gerente: 'Fernanda Alves',
                    grupoId: 'grupo-loja-descalvado',
                  },
                  {
                    nome: 'Santa Rita',
                    tipo: 'Filial 04',
                    endereco: 'Rua Inácio Ribeiro, 220 - Centro, Santa Rita do Passa Quatro - SP',
                    telefone: '(19) 3582-5000',
                    ramalGeral: '500',
                    gerente: 'André Villanova',
                    grupoId: 'grupo-loja-santa-rita',
                  },
                  {
                    nome: 'Rede',
                    tipo: 'Operações Corporativas & SAC',
                    endereco: 'Central Integrada Malachias',
                    telefone: '(19) 3561-9900',
                    ramalGeral: '900',
                    gerente: 'Vanessa Toledo / Marcelo Guimarães',
                    grupoId: 'grupo-avisos-da-rede',
                  },
                ].map((loja) => {
                  const qtdColabs = colaboradores.filter((c) => c.loja === loja.nome).length;
                  return (
                    <div
                      key={loja.nome}
                      className="p-5 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-base font-black text-[var(--c-texto)]">
                            {loja.nome}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            {loja.tipo}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--c-texto-3)] mb-4">{loja.endereco}</p>

                        <div className="space-y-2 text-xs border-t border-[var(--c-borda)] pt-3">
                          <div className="flex items-center justify-between text-[var(--c-texto-2)]">
                            <span>Telefone Central:</span>
                            <strong className="text-[var(--c-texto)]">{loja.telefone}</strong>
                          </div>
                          <div className="flex items-center justify-between text-[var(--c-texto-2)]">
                            <span>Ramal Matriz:</span>
                            <span className="font-mono text-emerald-600 font-bold">{loja.ramalGeral}</span>
                          </div>
                          <div className="flex items-center justify-between text-[var(--c-texto-2)]">
                            <span>Responsável:</span>
                            <strong className="text-[var(--c-texto)]">{loja.gerente}</strong>
                          </div>
                          <div className="flex items-center justify-between text-[var(--c-texto-2)]">
                            <span>Colaboradores na Loja:</span>
                            <span className="font-bold text-[var(--c-acento)]">{qtdColabs} cadastrados</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[var(--c-borda)] flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            bancoDados.garantirGruposDoSistemaPara(colaboradorAtual.id);
                            aoAbrirConversa(loja.grupoId);
                            aoFechar();
                          }}
                          className="w-full py-2 rounded-xl bg-[var(--c-superficie-2)] hover:bg-[var(--c-acento)] hover:text-[var(--c-sobre-acento)] text-xs font-bold text-[var(--c-texto)] border border-[var(--c-borda)] transition-all flex items-center justify-center gap-1.5"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>Abrir Canal da Loja</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= ABA 3: CANAIS & GRUPOS ================= */}
          {abaAtiva === 'canais' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--c-superficie)] p-4 rounded-2xl border border-[var(--c-borda)] shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-[var(--c-texto)]">
                    Canais e Grupos de Comunicação
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Canais operacionais por loja, setor e transmissões de diretoria.
                  </p>
                </div>

                <button
                  type="button"
                  id="botao-criar-canal-oficial"
                  onClick={() => setModalGrupoAberto(true)}
                  className="py-2 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 shadow-sm transition-all self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Criar Novo Canal da Rede</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bancoDados.obterGrupos().map((grupo) => (
                  <div
                    key={grupo.id}
                    className="p-4 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-sm flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-[var(--c-texto)] truncate">
                          {grupo.nome}
                        </span>
                        {grupo.ehSistemaPadrao && (
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">
                            Oficial
                          </span>
                        )}
                        {grupo.apenasGestoresPublicam && (
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Só Gestão Publica
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--c-texto-3)] line-clamp-2">
                        {grupo.descricao || 'Canal operacional da rede Malachias Autopeças.'}
                      </p>
                      <span className="text-[11px] text-[var(--c-texto-2)] font-mono block mt-2">
                        {grupo.participantesIds.length} participantes vinculados
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        aoAbrirConversa(grupo.id);
                        aoFechar();
                      }}
                      className="p-2 rounded-xl bg-[var(--c-superficie-2)] hover:bg-[var(--c-canvas)] text-[var(--c-texto)] border border-[var(--c-borda)] text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Abrir</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= ABA 4: COMUNICADOS OFICIAIS ================= */}
          {abaAtiva === 'avisos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--c-superficie)] p-4 rounded-2xl border border-[var(--c-borda)] shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-[var(--c-texto)]">
                    Central de Comunicados & Avisos Corporativos
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Envie comunicados gerais, alertas urgentes ou procedimentos operacionais para todas as lojas.
                  </p>
                </div>

                <button
                  type="button"
                  id="botao-novo-comunicado-adm"
                  onClick={() => setModalAvisoAberto(true)}
                  className="py-2 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 shadow-sm transition-all self-start sm:self-auto"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>+ Publicar Comunicado Oficial</span>
                </button>
              </div>

              <div className="space-y-3">
                {avisos.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--c-texto-3)] bg-[var(--c-superficie)] rounded-2xl border border-[var(--c-borda)]">
                    Nenhum comunicado ativo no momento.
                  </div>
                ) : (
                  avisos.map((aviso) => (
                    <div
                      key={aviso.id}
                      className={`p-5 rounded-2xl bg-[var(--c-superficie)] border shadow-sm ${
                        aviso.prioridade === 'urgente'
                          ? 'border-red-500/40'
                          : aviso.prioridade === 'atencao'
                          ? 'border-amber-500/40'
                          : 'border-[var(--c-borda)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              aviso.prioridade === 'urgente'
                                ? 'bg-red-500/10 text-red-600'
                                : aviso.prioridade === 'atencao'
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-blue-500/10 text-blue-600'
                            }`}
                          >
                            Prioridade: {aviso.prioridade}
                          </span>
                          <span className="text-xs text-[var(--c-texto-3)]">
                            Destino: {aviso.lojaDestino}
                          </span>
                          {aviso.fixadoNoTopo && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-600 font-bold px-1.5 py-0.2 rounded">
                              📌 Fixado
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => bancoDados.alternarFixadoAviso(aviso.id)}
                            className="text-xs text-[var(--c-texto-3)] hover:text-[var(--c-texto)] underline"
                          >
                            {aviso.fixadoNoTopo ? 'Desafixar' : 'Fixar no topo'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvisoParaExcluirId(aviso.id)}
                            className="text-xs text-red-500 hover:text-red-700 p-1"
                            title="Remover comunicado"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-[var(--c-texto)] mb-1">
                        {aviso.titulo}
                      </h3>
                      <p className="text-xs text-[var(--c-texto-2)] leading-relaxed whitespace-pre-line mb-3">
                        {aviso.conteudo}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-[var(--c-texto-3)] pt-2 border-t border-[var(--c-borda)]">
                        <span>
                          Autor: <strong>{aviso.autorNome}</strong> ({aviso.autorCargo}) · {aviso.horaFormatada}
                        </span>
                        <span>
                          {aviso.lidoPorIds.length} leituras · {aviso.confirmacoesIds.length} confirmações de ciência
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ================= ABA 5: PARÂMETROS & RÁDIO PTT ================= */}
          {abaAtiva === 'parametros' && (
            <form onSubmit={salvarParametros} className="space-y-4">
              <div className="bg-[var(--c-superficie)] p-5 rounded-2xl border border-[var(--c-borda)] shadow-sm space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-[var(--c-texto)]">
                    Parâmetros Globais do CONECTA
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Ajuste o comportamento do rádio PTT, permissões de grupo e políticas da rede.
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Nome da Empresa */}
                  <div>
                    <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1.5">
                      Nome da Organização
                    </label>
                    <input
                      type="text"
                      value={configuracoes.nomeEmpresa}
                      onChange={(e) =>
                        setConfiguracoes({ ...configuracoes, nomeEmpresa: e.target.value })
                      }
                      className="w-full max-w-md px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
                    />
                  </div>

                  {/* Bipe do Rádio Walkie-Talkie */}
                  <div className="flex items-center justify-between max-w-md p-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)]">
                    <div>
                      <span className="font-bold text-[var(--c-texto)] block">
                        Bipes Sonoros do Rádio (PTT)
                      </span>
                      <span className="text-[11px] text-[var(--c-texto-3)]">
                        Emite sinal sonoro clássico de rádio ao iniciar e soltar o botão de transmissão.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={configuracoes.bipeRadioAtivo}
                      onChange={(e) =>
                        setConfiguracoes({ ...configuracoes, bipeRadioAtivo: e.target.checked })
                      }
                      className="w-5 h-5 rounded text-[var(--c-acento)]"
                    />
                  </div>

                  {/* Tempo Máximo de Transmissão */}
                  <div>
                    <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1.5">
                      Tempo Limite por Transmissão de Voz (Rádio)
                    </label>
                    <select
                      value={configuracoes.tempoMaximoRadioSegundos}
                      onChange={(e) =>
                        setConfiguracoes({
                          ...configuracoes,
                          tempoMaximoRadioSegundos: Number(e.target.value),
                        })
                      }
                      className="w-full max-w-md px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
                    >
                      <option value={30}>30 Segundos (Foco operacional rápido)</option>
                      <option value={45}>45 Segundos (Recomendado)</option>
                      <option value={60}>60 Segundos (1 Minuto)</option>
                      <option value={120}>120 Segundos (2 Minutos)</option>
                    </select>
                  </div>

                  {/* Criação de Grupos por Operadores */}
                  <div className="flex items-center justify-between max-w-md p-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)]">
                    <div>
                      <span className="font-bold text-[var(--c-texto)] block">
                        Permitir que Nível 1 crie novos grupos
                      </span>
                      <span className="text-[11px] text-[var(--c-texto-3)]">
                        Por padrão desativado: apenas supervisores (2+) e gestão organizam os canais.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={configuracoes.permitirCriacaoGruposPorOperadores}
                      onChange={(e) =>
                        setConfiguracoes({
                          ...configuracoes,
                          permitirCriacaoGruposPorOperadores: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded text-[var(--c-acento)]"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--c-borda)]">
                  <button
                    type="submit"
                    id="botao-salvar-parametros-adm"
                    className="py-2.5 px-5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-xs hover:brightness-110 shadow-sm transition-all"
                  >
                    Salvar Parâmetros
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ================= ABA 6: AUDITORIA & LOGS ================= */}
          {abaAtiva === 'auditoria' && (
            <div className="space-y-4">
              <div className="bg-[var(--c-superficie)] p-4 rounded-2xl border border-[var(--c-borda)] shadow-sm">
                <h2 className="text-sm font-bold text-[var(--c-texto)]">
                  Trilha de Auditoria & Segurança do Sistema
                </h2>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Histórico de ações administrativas, cadastros e acessos registrados em tempo real.
                </p>
              </div>

              <div className="bg-[var(--c-superficie)] rounded-2xl border border-[var(--c-borda)] shadow-sm divide-y divide-[var(--c-borda)] overflow-hidden">
                {auditoria.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--c-texto-3)]">
                    Nenhum registro de auditoria gravado ainda.
                  </div>
                ) : (
                  auditoria.map((reg) => (
                    <div key={reg.id} className="p-3.5 flex items-start gap-3 text-xs">
                      <div className="w-8 h-8 rounded-lg bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center justify-center text-[var(--c-texto-2)] flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <strong className="text-[var(--c-texto)] font-bold truncate">
                            {reg.acao}
                          </strong>
                          <span className="font-mono text-[10px] text-[var(--c-texto-3)]">
                            {reg.dataHora}
                          </span>
                        </div>
                        <p className="text-[var(--c-texto-2)] text-[11px]">{reg.detalhes}</p>
                        <span className="text-[10px] text-[var(--c-texto-3)] font-mono block mt-1">
                          Responsável: {reg.usuarioNome} · Categoria: {reg.categoria}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ================= ABA 7: BACKUP & DADOS ================= */}
          {abaAtiva === 'backup' && (
            <div className="space-y-4">
              <div className="bg-[var(--c-superficie)] p-5 rounded-2xl border border-[var(--c-borda)] shadow-sm space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-[var(--c-texto)]">
                    Backup e Restauração de Dados
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Exporte uma cópia completa de segurança de todos os colaboradores, mensagens e comunicados.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] space-y-2">
                    <span className="font-bold text-xs text-[var(--c-texto)] block">
                      Exportar Cópia de Segurança (JSON)
                    </span>
                    <p className="text-[11px] text-[var(--c-texto-3)]">
                      Gera um arquivo com todos os dados atuais do CONECTA para preservação externa.
                    </p>
                    <button
                      type="button"
                      id="botao-exportar-backup-adm"
                      onClick={exportarBackup}
                      className="w-full mt-2 py-2 px-3 rounded-lg bg-[var(--c-superficie-2)] hover:bg-[var(--c-acento)] hover:text-[var(--c-sobre-acento)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] flex items-center justify-center gap-2 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <span>Baixar Arquivo de Backup</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] space-y-2">
                    <span className="font-bold text-xs text-[var(--c-texto)] block">
                      Restaurar a partir de Arquivo (JSON)
                    </span>
                    <p className="text-[11px] text-[var(--c-texto-3)]">
                      Selecione um arquivo de backup previamente gerado para restaurar os dados do sistema.
                    </p>
                    <label
                      htmlFor="input-restaurar-backup"
                      className="w-full mt-2 py-2 px-3 rounded-lg bg-[var(--c-superficie-2)] hover:bg-[var(--c-superficie)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Carregar Arquivo JSON</span>
                      <input
                        id="input-restaurar-backup"
                        type="file"
                        accept=".json"
                        onChange={importarBackup}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Redefinição e Gestão de Usuários de Teste */}
              <div className="bg-[var(--c-superficie)] p-5 rounded-2xl border border-[var(--c-borda)] shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-[var(--c-texto)]">
                    Gerenciamento e Reset de Usuários de Teste
                  </h2>
                </div>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Redefina a base de dados rapidamente: restaure todos os usuários de teste padrão nas 5 filiais ou limpe a base mantendo exclusivamente o Administrador Geral Elias.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="p-4 rounded-xl bg-[var(--c-canvas)] border border-amber-500/20 space-y-2">
                    <span className="font-bold text-xs text-[var(--c-texto)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Restaurar Equipe Completa de Demonstração
                    </span>
                    <p className="text-[11px] text-[var(--c-texto-3)]">
                      Restaura todos os 20+ colaboradores de teste nas 5 filiais da rede com senhas padrão e cargos pré-configurados.
                    </p>
                    <button
                      type="button"
                      id="botao-restaurar-equipe-teste-backup"
                      onClick={executarRestaurarPadraoTeste}
                      className="w-full mt-2 py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center justify-center gap-2 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restaurar Usuários Teste</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--c-canvas)] border border-red-500/20 space-y-2">
                    <span className="font-bold text-xs text-[var(--c-texto)] flex items-center gap-1.5">
                      <UserMinus className="w-3.5 h-3.5 text-red-500" />
                      Limpar Base (Manter Apenas Elias)
                    </span>
                    <p className="text-[11px] text-[var(--c-texto-3)]">
                      Remove todos os usuários mock e deixa o sistema com acesso exclusivo do Administrador Elias, pronto para importação via Excel.
                    </p>
                    <button
                      type="button"
                      id="botao-limpar-manter-elias-backup"
                      onClick={executarResetManterElias}
                      className="w-full mt-2 py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-bold text-red-600 dark:text-red-400 flex items-center justify-center gap-2 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar (Manter Só Elias)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL: NOVO/EDITAR COLABORADOR ================= */}
      {modalColabAberto && (
        <div
          id="modal-cadastro-colaborador"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="bg-[var(--c-superficie)] w-full max-w-md rounded-2xl max-h-[90dvh] flex flex-col overflow-hidden border border-[var(--c-borda)] shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b border-[var(--c-borda)] flex items-center justify-between">
              <h3 className="font-black text-sm text-[var(--c-texto)]">
                {colabEditando ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h3>
              <button
                type="button"
                onClick={() => setModalColabAberto(false)}
                className="text-[var(--c-texto-3)] hover:text-[var(--c-texto)] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={salvarColaborador} className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
              {/* Foto do Colaborador */}
              <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)] flex items-center gap-3.5">
                <div className="relative w-14 h-14 rounded-full overflow-hidden bg-white border border-[var(--c-borda)] flex-shrink-0 flex items-center justify-center shadow-xs">
                  <img
                    src={formColab.foto || FOTO_PADRAO_LOGO_EMPRESA}
                    alt="Foto do colaborador"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="font-bold text-[var(--c-texto)] text-xs">Foto de Exibição</span>
                    {(!formColab.foto || formColab.foto === FOTO_PADRAO_LOGO_EMPRESA) ? (
                      <span className="text-[10px] bg-blue-500/10 text-blue-600 font-bold px-1.5 py-0.5 rounded border border-blue-500/20">
                        Logo Oficial (Padrão)
                      </span>
                    ) : (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-bold px-1.5 py-0.5 rounded border border-emerald-500/20">
                        Foto Personalizada
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="cursor-pointer py-1 px-2.5 rounded-lg bg-[var(--c-superficie)] hover:bg-[var(--c-borda)] border border-[var(--c-borda)] text-[11px] font-semibold text-[var(--c-texto)] flex items-center gap-1 transition-all">
                      <Upload className="w-3 h-3 text-blue-600" />
                      <span>Carregar Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const arq = e.target.files?.[0];
                          if (arq) processarArquivoFotoForm(arq);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {formColab.foto !== FOTO_PADRAO_LOGO_EMPRESA && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormColab((prev) => ({ ...prev, foto: FOTO_PADRAO_LOGO_EMPRESA }));
                          exibirToast('Foto redefinida para o Logo da Malachias.');
                        }}
                        className="py-1 px-2 rounded-lg text-[11px] font-semibold text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 border border-amber-500/20 flex items-center gap-1 transition-all"
                        title="Restaurar para a logo oficial"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Usar Logo Malachias</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formColab.nome}
                  onChange={(e) => setFormColab({ ...formColab, nome: e.target.value })}
                  placeholder="Ex: Carlos Eduardo Silveira"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                />
              </div>

              {/* Login e Senha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Login de Acesso *
                  </label>
                  <input
                    type="text"
                    required
                    value={formColab.login}
                    onChange={(e) => setFormColab({ ...formColab, login: e.target.value })}
                    placeholder="Ex: carloseduardo"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Senha Inicial
                  </label>

                  {/* No modo rede o administrador não define senha de ninguém:
                      a pessoa ativa o acesso com a padrão e cria a dela. */}
                  {usandoNuvem() ? (
                    <div className="w-full px-3 py-2 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[11px] text-[var(--c-texto-3)] leading-snug">
                      Entra com{' '}
                      <strong className="font-mono text-[var(--c-texto-2)]">
                        {SENHA_PADRAO_PRIMEIRO_ACESSO}
                      </strong>{' '}
                      e cria a própria senha na primeira entrada.
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={formColab.senha}
                      onChange={(e) => setFormColab({ ...formColab, senha: e.target.value })}
                      placeholder={SENHA_PADRAO_PRIMEIRO_ACESSO}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] font-mono"
                    />
                  )}
                </div>
              </div>

              {/* Cargo e Ramal */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Cargo / Função *
                  </label>
                  <input
                    type="text"
                    required
                    value={formColab.cargo}
                    onChange={(e) => setFormColab({ ...formColab, cargo: e.target.value })}
                    placeholder="Ex: Balconista Especialista"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Ramal Telefônico
                  </label>
                  <input
                    type="text"
                    value={formColab.ramal}
                    onChange={(e) => setFormColab({ ...formColab, ramal: e.target.value })}
                    placeholder="Ex: 105"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] font-mono"
                  />
                </div>
              </div>

              {/* Loja e Setor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Loja / Filial *
                  </label>
                  <select
                    value={formColab.loja}
                    onChange={(e) => setFormColab({ ...formColab, loja: e.target.value as Loja })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  >
                    {LOJAS_TODAS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Setor Operacional *
                  </label>
                  <select
                    value={formColab.setor}
                    onChange={(e) => setFormColab({ ...formColab, setor: e.target.value as Setor })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  >
                    {SETORES_TODOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nível de Acesso */}
              <div>
                <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                  Nível de Permissão Hierárquica *
                </label>
                <select
                  value={formColab.nivel}
                  onChange={(e) =>
                    setFormColab({ ...formColab, nivel: Number(e.target.value) as NivelHierarquico })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] font-semibold"
                >
                  <option value={1}>Nível 1 - Operador (Balcão, Caixa, Estoque)</option>
                  <option value={2}>Nível 2 - Supervisor (Líder de Filial, Estoque)</option>
                  <option value={3}>Nível 3 - Gestor (Diretoria, Compras, Gerência)</option>
                  <option value={4}>Nível 4 - Administrador Geral (TI & Acesso Total)</option>
                </select>
              </div>

              {/* Jornada contratada — base do cálculo do banco de horas */}
              <div>
                <label
                  htmlFor="campo-carga-horaria"
                  className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1"
                >
                  Jornada Diária (Banco de Horas)
                </label>
                <select
                  id="campo-carga-horaria"
                  value={formColab.cargaHorariaDiariaMinutos}
                  onChange={(e) =>
                    setFormColab({
                      ...formColab,
                      cargaHorariaDiariaMinutos: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] font-semibold"
                >
                  <option value={240}>4h00 por dia útil</option>
                  <option value={360}>6h00 por dia útil</option>
                  <option value={396}>6h36 por dia útil (44h semanais em 6 dias)</option>
                  <option value={440}>7h20 por dia útil</option>
                  <option value={480}>8h00 por dia útil (padrão)</option>
                  <option value={528}>8h48 por dia útil (44h semanais em 5 dias)</option>
                </select>
                <p className="mt-1 text-[11px] text-[var(--c-texto-3)]">
                  Saldo positivo ou negativo é calculado contra esta jornada. Sábados e domingos
                  não geram jornada prevista.
                </p>
              </div>

              {/* Telefone e Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Telefone / Celular
                  </label>
                  <input
                    type="text"
                    value={formColab.telefone}
                    onChange={(e) => setFormColab({ ...formColab, telefone: e.target.value })}
                    placeholder="(19) 99999-0000"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Email Corporativo
                  </label>
                  <input
                    type="email"
                    value={formColab.email}
                    onChange={(e) => setFormColab({ ...formColab, email: e.target.value })}
                    placeholder="nome@malachiasautopecas.com.br"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--c-borda)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalColabAberto(false)}
                  className="py-2 px-3.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="botao-salvar-colaborador-modal"
                  className="py-2 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 shadow-sm"
                >
                  {colabEditando ? 'Atualizar Dados' : 'Cadastrar Colaborador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: NOVO GRUPO ================= */}
      {modalGrupoAberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[var(--c-superficie)] w-full max-w-md rounded-2xl overflow-hidden border border-[var(--c-borda)] shadow-2xl p-5 space-y-4 animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--c-borda)] pb-3">
              <h3 className="font-bold text-sm text-[var(--c-texto)]">Criar Novo Canal da Rede</h3>
              <button
                type="button"
                onClick={() => setModalGrupoAberto(false)}
                className="text-[var(--c-texto-3)] hover:text-[var(--c-texto)] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={salvarNovoGrupo} className="space-y-3">
              <div>
                <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                  Nome do Canal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compras & Cotações Urgentes"
                  value={nomeGrupo}
                  onChange={(e) => setNomeGrupo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                  Descrição e Finalidade
                </label>
                <textarea
                  rows={2}
                  placeholder="Descreva quem participa e qual a finalidade deste canal..."
                  value={descGrupo}
                  onChange={(e) => setDescGrupo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="check-gestores-publicam"
                  checked={apenasGestoresGrupo}
                  onChange={(e) => setApenasGestoresGrupo(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--c-acento)]"
                />
                <label htmlFor="check-gestores-publicam" className="text-[var(--c-texto-2)]">
                  Canal de transmissão: apenas Nível 3+ (Gestores/Admin) podem publicar
                </label>
              </div>

              <div className="pt-3 border-t border-[var(--c-borda)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalGrupoAberto(false)}
                  className="py-2 px-3.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold hover:brightness-110 shadow-sm"
                >
                  Criar Canal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: NOVO COMUNICADO ================= */}
      {modalAvisoAberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[var(--c-superficie)] w-full max-w-md rounded-2xl overflow-hidden border border-[var(--c-borda)] shadow-2xl p-5 space-y-4 animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--c-borda)] pb-3">
              <h3 className="font-bold text-sm text-[var(--c-texto)]">Publicar Comunicado Oficial</h3>
              <button
                type="button"
                onClick={() => setModalAvisoAberto(false)}
                className="text-[var(--c-texto-3)] hover:text-[var(--c-texto)] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={salvarComunicado} className="space-y-3">
              <div>
                <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                  Título do Comunicado *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Horário de Funcionamento no Feriado"
                  value={formAviso.titulo}
                  onChange={(e) => setFormAviso({ ...formAviso, titulo: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                  Conteúdo da Mensagem *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Descreva as instruções, procedimentos ou avisos da diretoria..."
                  value={formAviso.conteudo}
                  onChange={(e) => setFormAviso({ ...formAviso, conteudo: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Prioridade
                  </label>
                  <select
                    value={formAviso.prioridade}
                    onChange={(e) =>
                      setFormAviso({ ...formAviso, prioridade: e.target.value as PrioridadeAviso })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                  >
                    <option value="geral">Geral (Informativo)</option>
                    <option value="atencao">Atenção (Procedimento)</option>
                    <option value="urgente">Urgente (Ação Imediata)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1">
                    Loja Destino
                  </label>
                  <select
                    value={formAviso.lojaDestino}
                    onChange={(e) =>
                      setFormAviso({ ...formAviso, lojaDestino: e.target.value as Loja | 'Todas' })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                  >
                    <option value="Todas">Toda a Rede (5 Lojas)</option>
                    {LOJAS_TODAS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="check-fixar-aviso"
                  checked={formAviso.fixadoNoTopo}
                  onChange={(e) => setFormAviso({ ...formAviso, fixadoNoTopo: e.target.checked })}
                  className="w-4 h-4 rounded text-[var(--c-acento)]"
                />
                <label htmlFor="check-fixar-aviso" className="text-[var(--c-texto-2)]">
                  Fixar este comunicado no topo do mural
                </label>
              </div>

              <div className="pt-3 border-t border-[var(--c-borda)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalAvisoAberto(false)}
                  className="py-2 px-3.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold hover:brightness-110 shadow-sm"
                >
                  Publicar Comunicado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: RESETAR USUÁRIOS TESTE ================= */}
      {modalResetUsuariosAberto && (
        <div
          id="modal-resetar-usuarios"
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalResetUsuariosAberto(false);
          }}
        >
          <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--c-texto)]">
                    Resetar / Redefinir Usuários
                  </h3>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Escolha como deseja redefinir a base de colaboradores do sistema:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalResetUsuariosAberto(false)}
                className="p-1 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-canvas)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Opção 1: Restaurar equipe completa de testes */}
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-[var(--c-texto)]">
                      Restaurar Equipe de Demonstração (Todas as 5 Lojas)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30">
                    Modo Teste Completo
                  </span>
                </div>
                <p className="text-[11px] text-[var(--c-texto-2)] leading-relaxed">
                  Recarrega todos os colaboradores de teste com distribuição completa nas 5 filiais (Pirassununga, Porto Ferreira, Palmeiras, Descalvado e Santa Rita), recria os canais das 5 lojas e define a senha padrão <code className="bg-[var(--c-canvas)] px-1 rounded font-bold">123</code>.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    id="botao-confirmar-restaurar-padrao"
                    onClick={(e) => {
                      e.preventDefault();
                      executarRestaurarPadraoTeste();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Restaurar Equipe Completa de Teste (5 Lojas)</span>
                  </button>
                </div>
              </div>

              {/* Opção 2: Limpar mantendo Elias */}
              <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserMinus className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-[var(--c-texto)]">
                      Limpar Base (Manter Apenas Elias)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-600 font-bold">
                    Base Limpa para Excel
                  </span>
                </div>
                <p className="text-[11px] text-[var(--c-texto-2)] leading-relaxed">
                  Remove todos os usuários de teste, mantendo exclusivamente a conta do <strong>Administrador Elias</strong>. Deixa a base limpa e pronta para você subir a planilha Excel oficial da empresa.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    id="botao-confirmar-reset-manter-elias"
                    onClick={(e) => {
                      e.preventDefault();
                      executarResetManterElias();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Limpar Usuários de Teste (Só Elias)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setModalResetUsuariosAberto(false)}
                className="py-2 px-4 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CONFIRMAR EXCLUSÃO COLABORADOR ================= */}
      {colabParaExcluir && (
        <div
          id="modal-confirmar-exclusao-colaborador"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--c-texto)]">
                  Excluir Colaborador
                </h3>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Confirmação de segurança
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--c-texto-2)] leading-relaxed">
              Tem certeza que deseja excluir o colaborador <strong>{colabParaExcluir.nome}</strong>? O acesso será revogado e ele será removido dos canais.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setColabParaExcluir(null)}
                className="py-2 px-3.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="botao-confirmar-exclusao-definitiva"
                onClick={confirmarExclusaoColaborador}
                className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CONFIRMAR EXCLUSÃO AVISO ================= */}
      {avisoParaExcluirId && (
        <div
          id="modal-confirmar-exclusao-aviso"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--c-texto)]">
                  Excluir Comunicado
                </h3>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Confirmação de remoção
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--c-texto-2)] leading-relaxed">
              Deseja realmente remover este comunicado oficial do mural da rede?
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAvisoParaExcluirId(null)}
                className="py-2 px-3.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarExclusaoAviso}
                className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Comunicado</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ALTERAR FOTO / LOGO ================= */}
      {colaboradorParaAlterarFoto && (
        <ModalAlterarFoto
          aberto={!!colaboradorParaAlterarFoto}
          colaborador={colaboradorParaAlterarFoto}
          aoFechar={() => {
            setColaboradorParaAlterarFoto(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
};
