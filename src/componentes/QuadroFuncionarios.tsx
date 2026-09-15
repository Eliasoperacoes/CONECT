import React, { useState, useMemo } from 'react';
import { NIVEL_GERENTE, ROTULO_NIVEL } from '../tipos';
import {
  Search,
  Radio,
  MessageSquare,
  Building2,
  Phone,
  LayoutGrid,
  List,
  Shield,
  Filter,
  CheckCircle2,
  Clock,
  X,
  ExternalLink,
  Camera,
  UserCog,
} from 'lucide-react';
import { Colaborador, Loja, Setor, EstadoPresenca, INFORMACOES_LOJAS } from '../tipos';
import { FotoPresenca } from './FotoPresenca';
import { bancoDados } from '../servicos/bancoDados';
import { ModalAlterarFoto } from './ModalAlterarFoto';
import { ModalCadastroColaborador } from './ModalCadastroColaborador';

interface PropsQuadroFuncionarios {
  colaboradorAtual: Colaborador;
  aoIniciarConversa: (colegaId: string) => void;
  aoChamarRadio: (colegaId: string) => void;
}

const LOJAS_LISTA: (Loja | 'Todas')[] = [
  'Todas',
  'Pirassununga',
  'Porto Ferreira',
  'Palmeiras',
  'Descalvado',
  'Santa Rita',
  'Rede',
];

const SETORES_LISTA: (Setor | 'Todos')[] = [
  'Todos',
  'Balcão',
  'Estoque',
  'Caixas',
  'Compras',
  'Callcenter',
  'TI',
  'Garantia',
  'Tesouraria',
  'RH',
  'Diretoria',
];

export const QuadroFuncionarios: React.FC<PropsQuadroFuncionarios> = ({
  colaboradorAtual,
  aoIniciarConversa,
  aoChamarRadio,
}) => {
  const [busca, setBusca] = useState('');
  const [lojaSelecionada, setLojaSelecionada] = useState<Loja | 'Todas'>('Todas');
  const [setorSelecionado, setSetorSelecionado] = useState<Setor | 'Todos'>('Todos');
  const [apenasDisponiveis, setApenasDisponiveis] = useState(false);
  const [modoVisualizacao, setModoVisualizacao] = useState<'grade' | 'lista'>('grade');
  const [colaboradorModal, setColaboradorModal] = useState<Colaborador | null>(null);
  const [colaboradorFotoAlvo, setColaboradorFotoAlvo] = useState<Colaborador | null>(null);
  const [colaboradorEmCadastro, setColaboradorEmCadastro] = useState<Colaborador | null>(null);
  const [avisoCadastro, setAvisoCadastro] = useState<string | null>(null);

  // RH e Administrador editam a ficha das pessoas sem sair do quadro
  const podeEditarCadastros = bancoDados.podeGerenciarPessoas(colaboradorAtual);

  const todosColaboradores = bancoDados.obterColaboradores();

  const colaboradoresFiltrados = useMemo(() => {
    return todosColaboradores.filter((c) => {
      // Busca textual
      if (busca.trim()) {
        const termo = busca.toLowerCase();
        const bateNome = c.nome.toLowerCase().includes(termo);
        const bateCargo = c.cargo.toLowerCase().includes(termo);
        const bateSetor = c.setor.toLowerCase().includes(termo);
        const bateLoja = c.loja.toLowerCase().includes(termo);
        const bateRamal = c.ramal ? c.ramal.includes(termo) : false;
        if (!bateNome && !bateCargo && !bateSetor && !bateLoja && !bateRamal) {
          return false;
        }
      }

      // Filtro de Loja
      if (lojaSelecionada !== 'Todas' && c.loja !== lojaSelecionada) {
        return false;
      }

      // Filtro de Setor
      if (setorSelecionado !== 'Todos' && c.setor !== setorSelecionado) {
        return false;
      }

      // Filtro de Presença
      if (apenasDisponiveis && c.presenca !== 'disponivel') {
        return false;
      }

      return true;
    });
  }, [todosColaboradores, busca, lojaSelecionada, setorSelecionado, apenasDisponiveis]);

  /**
   * Com 40+ pessoas, uma grade única vira uma parede de cartões. O quadro é
   * quebrado em blocos por unidade, na mesma ordem das lojas do painel: quem
   * tem equipe primeiro, unidades vazias nem aparecem.
   */
  const gruposPorLoja = useMemo(() => {
    const ordem = INFORMACOES_LOJAS.map((i) => i.nome);

    const porLoja = new Map<Loja, Colaborador[]>();
    for (const colaborador of colaboradoresFiltrados) {
      const lista = porLoja.get(colaborador.loja);
      if (lista) lista.push(colaborador);
      else porLoja.set(colaborador.loja, [colaborador]);
    }

    return Array.from(porLoja.entries())
      .map(([loja, pessoas]) => ({
        loja,
        info: INFORMACOES_LOJAS.find((i) => i.nome === loja),
        pessoas: pessoas.sort((a, b) => a.nome.localeCompare(b.nome)),
        online: pessoas.filter(
          (p) => p.presenca === 'disponivel' || p.presenca === 'ocupado'
        ).length,
      }))
      .sort((a, b) => {
        if (a.pessoas.length !== b.pessoas.length) return b.pessoas.length - a.pessoas.length;
        return ordem.indexOf(a.loja) - ordem.indexOf(b.loja);
      });
  }, [colaboradoresFiltrados]);

  /** Agrupar só ajuda quando há mais de uma unidade em tela. */
  const deveAgrupar = gruposPorLoja.length > 1;

  const obterBadgePresenca = (presenca: EstadoPresenca) => {
    switch (presenca) {
      case 'disponivel':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Disponível
          </span>
        );
      case 'ocupado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Ocupado
          </span>
        );
      case 'ausente':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Ausente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Desconectado
          </span>
        );
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 p-4 sm:p-6" id="quadro-de-funcionarios">
      {/* Barra de Topo com Busca e Contadores */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-sm">
        {/* Campo de Busca */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-texto-3)]" />
          <input
            type="text"
            id="campo-busca-funcionarios"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo, loja, setor ou ramal..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-lg text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)] hover:text-[var(--c-texto)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Alternância de Visualização e Filtro Rápido */}
        <div className="flex items-center justify-between sm:justify-end gap-2 flex-shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-[var(--c-texto-2)] select-none px-2 py-1 bg-[var(--c-canvas)] rounded-lg border border-[var(--c-borda)]">
            <input
              type="checkbox"
              checked={apenasDisponiveis}
              onChange={(e) => setApenasDisponiveis(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-[var(--c-acento)] focus:ring-[var(--c-acento)]"
            />
            <span>Apenas Online</span>
          </label>

          <div className="flex items-center bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-lg p-0.5">
            <button
              type="button"
              title="Visualização em Grade"
              onClick={() => setModoVisualizacao('grade')}
              className={`p-1.5 rounded-md transition-colors ${
                modoVisualizacao === 'grade'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                  : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto)]'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Visualização em Lista"
              onClick={() => setModoVisualizacao('lista')}
              className={`p-1.5 rounded-md transition-colors ${
                modoVisualizacao === 'lista'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                  : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto)]'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filtros em Abas de Lojas */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-xs font-medium text-[var(--c-texto-3)] mr-1 flex items-center gap-1">
          <Building2 className="w-3.5 h-3.5" /> Lojas:
        </span>
        {LOJAS_LISTA.map((loja) => {
          const selecionada = lojaSelecionada === loja;
          return (
            <button
              key={loja}
              type="button"
              onClick={() => setLojaSelecionada(loja)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                selecionada
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] border border-[var(--c-borda)]'
              }`}
            >
              {loja === 'Todas' ? 'Todas as Lojas' : loja}
            </button>
          );
        })}
      </div>

      {/* Filtros por Setor */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-xs font-medium text-[var(--c-texto-3)] mr-1 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" /> Setores:
        </span>
        {SETORES_LISTA.map((setor) => {
          const selecionado = setorSelecionado === setor;
          return (
            <button
              key={setor}
              type="button"
              onClick={() => setSetorSelecionado(setor)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selecionado
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-semibold'
                  : 'bg-[var(--c-superficie)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] border border-[var(--c-borda)]'
              }`}
            >
              {setor}
            </button>
          );
        })}
      </div>

      {/* Contador de Resultados */}
      <div className="flex items-center justify-between text-xs text-[var(--c-texto-3)] px-1">
        <span>
          Mostrando <strong>{colaboradoresFiltrados.length}</strong> de {todosColaboradores.length} colaboradores da rede
        </span>
        {lojaSelecionada !== 'Todas' && (
          <span className="font-medium text-[var(--c-acento)]">
            Filtrado por: Loja {lojaSelecionada}
          </span>
        )}
      </div>

      {/* Lista / Grade de Funcionários, quebrada por unidade */}
      {colaboradoresFiltrados.length === 0 ? (
        <div className="bg-[var(--c-superficie)] p-12 rounded-xl border border-[var(--c-borda)] text-center text-[var(--c-texto-3)] text-sm">
          Nenhum colaborador encontrado com os filtros selecionados.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {(deveAgrupar
            ? gruposPorLoja
            : [{ loja: colaboradoresFiltrados[0].loja, info: undefined, pessoas: colaboradoresFiltrados, online: 0 }]
          ).map((grupo) => (
            <section key={grupo.loja} className="flex flex-col gap-3">
              {deveAgrupar && (
                <div className="flex items-center gap-2.5 sticky top-0 z-10 bg-[var(--c-canvas)] py-1.5">
                  <Building2 className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
                  <h3 className="text-sm font-bold text-[var(--c-texto)]">
                    {grupo.loja === 'Rede' ? 'Operações Centrais' : `Loja ${grupo.loja}`}
                  </h3>
                  {grupo.info?.tipo === 'Matriz' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                      Matriz
                    </span>
                  )}
                  <span className="text-xs text-[var(--c-texto-3)] font-medium">
                    {grupo.pessoas.length}{' '}
                    {grupo.pessoas.length === 1 ? 'pessoa' : 'pessoas'}
                    {grupo.online > 0 && ` · ${grupo.online} online`}
                  </span>
                  <span className="flex-1 h-px bg-[var(--c-borda)]" />
                </div>
              )}

              {modoVisualizacao === 'grade' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grupo.pessoas.map((colaborador) => {
            const ehProprio = colaborador.id === colaboradorAtual.id;

            return (
              <div
                key={colaborador.id}
                id={`card-funcionario-${colaborador.id}`}
                className={`bg-[var(--c-superficie)] rounded-xl border p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3 ${
                  ehProprio ? 'border-[var(--c-acento)] ring-1 ring-[var(--c-acento)]/30' : 'border-[var(--c-borda)]'
                }`}
              >
                {/* Parte superior: Foto, Dados e Presença */}
                <div className="flex items-start gap-3">
                  <FotoPresenca
                    foto={colaborador.foto}
                    nome={colaborador.nome}
                    presenca={colaborador.presenca}
                    tamanho="w-12 h-12"
                    aoClicar={() => setColaboradorModal(colaborador)}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4
                        onClick={() => setColaboradorModal(colaborador)}
                        className="text-sm font-bold text-[var(--c-texto)] truncate cursor-pointer hover:text-[var(--c-acento)] transition-colors"
                      >
                        {colaborador.nome}
                      </h4>
                      {ehProprio && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                          Você
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[var(--c-texto-2)] truncate font-medium">
                      {colaborador.cargo}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--c-canvas)] text-[var(--c-texto-2)] border border-[var(--c-borda)]">
                        {colaborador.loja}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--c-canvas)] text-[var(--c-texto-3)] border border-[var(--c-borda)]">
                        {colaborador.setor}
                      </span>
                      {colaborador.ramal && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Ramal {colaborador.ramal}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status de Presença */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--c-borda)]">
                  <div>{obterBadgePresenca(colaborador.presenca)}</div>
                  <span className="text-[var(--c-texto-3)] text-[11px]">
                    {colaborador.vistoPorUltimo}
                  </span>
                </div>

                {/* Botões de Ação Imediata. O próprio usuário recebe um atalho
                    para o perfil, para o cartão não ficar com um vão vazio. */}
                {ehProprio ? (
                  <button
                    type="button"
                    onClick={() => setColaboradorModal(colaborador)}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[var(--c-texto-2)] font-semibold text-xs flex items-center justify-center gap-1.5 hover:border-[var(--c-acento)] transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ver meu cadastro</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {podeEditarCadastros && (
                      <button
                        type="button"
                        id={`botao-cadastro-funcionario-${colaborador.id}`}
                        onClick={() => setColaboradorEmCadastro(colaborador)}
                        className="col-span-2 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                        title="Abrir a ficha funcional deste colaborador"
                      >
                        <UserCog className="w-3.5 h-3.5" />
                        <span>Editar cadastro</span>
                      </button>
                    )}
                    <button
                      type="button"
                      id={`botao-radio-funcionario-${colaborador.id}`}
                      onClick={() => aoChamarRadio(colaborador.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                      title="Chamar no rádio walkie-talkie ao vivo"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Rádio</span>
                    </button>

                    <button
                      type="button"
                      id={`botao-conversa-funcionario-${colaborador.id}`}
                      onClick={() => aoIniciarConversa(colaborador.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--c-acento)] hover:brightness-110 text-[var(--c-sobre-acento)] font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                      title="Abrir conversa por mensagem"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Conversar</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
                </div>
              ) : (
                /* MODO LISTA */
                <div className="bg-[var(--c-superficie)] rounded-xl border border-[var(--c-borda)] overflow-hidden shadow-sm divide-y divide-[var(--c-borda)]">
                  {grupo.pessoas.map((colaborador) => {
            const ehProprio = colaborador.id === colaboradorAtual.id;

            return (
              <div
                key={colaborador.id}
                className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--c-superficie-2)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FotoPresenca
                    foto={colaborador.foto}
                    nome={colaborador.nome}
                    presenca={colaborador.presenca}
                    tamanho="w-10 h-10"
                    aoClicar={() => setColaboradorModal(colaborador)}
                  />

                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-[var(--c-texto)]">
                        {colaborador.nome}
                      </strong>
                      {ehProprio && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-blue-100 text-blue-800">
                          Você
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--c-texto-2)]">
                      {colaborador.cargo} · {colaborador.loja} ({colaborador.setor})
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <div className="flex items-center gap-2">
                    {colaborador.ramal && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Ramal {colaborador.ramal}
                      </span>
                    )}
                    {obterBadgePresenca(colaborador.presenca)}
                  </div>

                  {!ehProprio && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => aoChamarRadio(colaborador.id)}
                        className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                        title="Chamar no Rádio"
                      >
                        <Radio className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => aoIniciarConversa(colaborador.id)}
                        className="p-2 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] hover:brightness-110 transition-colors shadow-xs"
                        title="Abrir Conversa"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Modal de Detalhes do Colaborador */}
      {colaboradorModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setColaboradorModal(null)}
        >
          <div
            className="bg-[var(--c-superficie)] w-full max-w-md rounded-2xl border border-[var(--c-borda)] shadow-xl overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white flex flex-col items-center text-center">
              <button
                type="button"
                onClick={() => setColaboradorModal(null)}
                className="absolute right-4 top-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative group/avatar mb-3">
                <div className="w-20 h-20 rounded-full border-4 border-white overflow-hidden shadow-lg bg-white">
                  <img
                    src={colaboradorModal.foto}
                    alt={colaboradorModal.nome}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {(colaboradorAtual.id === colaboradorModal.id || colaboradorAtual.nivel >= 4) && (
                  <button
                    type="button"
                    onClick={() => setColaboradorFotoAlvo(colaboradorModal)}
                    className="absolute -bottom-1 -right-1 p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md border-2 border-white transition-transform hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer"
                    title="Alterar foto deste colaborador"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <h3 className="text-lg font-bold">{colaboradorModal.nome}</h3>
              <p className="text-sm text-blue-100">{colaboradorModal.cargo}</p>
              <div className="mt-2">{obterBadgePresenca(colaboradorModal.presenca)}</div>

              {(colaboradorAtual.id === colaboradorModal.id || colaboradorAtual.nivel >= 4) && (
                <button
                  type="button"
                  onClick={() => setColaboradorFotoAlvo(colaboradorModal)}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-white/95 hover:text-white bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full border border-white/30 transition-all font-medium"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Alterar Foto / Logo</span>
                </button>
              )}
            </div>

            <div className="p-6 flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                  <span className="text-xs text-[var(--c-texto-3)] block font-medium">Unidade / Loja</span>
                  <strong className="text-[var(--c-texto)]">{colaboradorModal.loja}</strong>
                </div>
                <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                  <span className="text-xs text-[var(--c-texto-3)] block font-medium">Setor de Atuação</span>
                  <strong className="text-[var(--c-texto)]">{colaboradorModal.setor}</strong>
                </div>
                <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                  <span className="text-xs text-[var(--c-texto-3)] block font-medium">Ramal Interno</span>
                  <strong className="text-blue-600 dark:text-blue-400 font-mono">
                    {colaboradorModal.ramal || 'Sem ramal'}
                  </strong>
                </div>
                <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                  <span className="text-xs text-[var(--c-texto-3)] block font-medium">Nível Hierárquico</span>
                  <strong className="text-[var(--c-texto)]">
                    N{colaboradorModal.nivel} ·{' '}
                    {ROTULO_NIVEL[colaboradorModal.nivel] || 'Colaborador'}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-[var(--c-texto-3)]">
                <Clock className="w-4 h-4" />
                <span>Última atividade: {colaboradorModal.vistoPorUltimo}</span>
              </div>

              {colaboradorModal.id !== colaboradorAtual.id && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const id = colaboradorModal.id;
                      setColaboradorModal(null);
                      aoChamarRadio(id);
                    }}
                    className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Radio className="w-4 h-4" /> Chamar Rádio
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const id = colaboradorModal.id;
                      setColaboradorModal(null);
                      aoIniciarConversa(id);
                    }}
                    className="py-2.5 rounded-xl bg-[var(--c-acento)] hover:brightness-110 text-[var(--c-sobre-acento)] font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <MessageSquare className="w-4 h-4" /> Mensagem
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal para alterar foto do colaborador */}
      {colaboradorFotoAlvo && (
        <ModalAlterarFoto
          aberto={!!colaboradorFotoAlvo}
          colaborador={colaboradorFotoAlvo}
          aoFechar={() => {
            if (colaboradorModal && colaboradorModal.id === colaboradorFotoAlvo.id) {
              const atualizado = bancoDados.obterColaboradorPorId(colaboradorFotoAlvo.id);
              if (atualizado) setColaboradorModal(atualizado);
            }
            setColaboradorFotoAlvo(null);
          }}
        />
      )}

      {/* Ficha funcional aberta pelo RH direto do quadro */}
      <ModalCadastroColaborador
        colaborador={colaboradorEmCadastro}
        aoFechar={() => setColaboradorEmCadastro(null)}
        aoSalvar={(nome) => {
          setAvisoCadastro(`Cadastro de ${nome} atualizado.`);
          setTimeout(() => setAvisoCadastro(null), 3500);
          // Mantém o modal de detalhes coerente com o que acabou de ser salvo
          if (colaboradorModal && colaboradorEmCadastro?.id === colaboradorModal.id) {
            const atualizado = bancoDados.obterColaboradorPorId(colaboradorModal.id);
            if (atualizado) setColaboradorModal(atualizado);
          }
        }}
      />

      {avisoCadastro && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] bg-[var(--c-superficie)] text-[var(--c-texto)] border border-[var(--c-borda)] shadow-xl px-4 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          {avisoCadastro}
        </div>
      )}
    </div>
  );
};
