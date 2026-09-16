import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Users,
  Megaphone,
  Radio,
  Layers,
  ArrowRight,
  TrendingUp,
  Activity,
  CheckCircle,
  CheckCircle2,
  MapPin,
  PhoneCall,
  ShieldAlert,
  Clock,
  Network,
  ClipboardList,
} from 'lucide-react';
import { Colaborador, Loja, Setor, INFORMACOES_LOJAS, NIVEL_LIDER_SETOR } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { servicoPonto } from '../servicos/ponto';
import { QuadroFuncionarios } from './QuadroFuncionarios';
import { CentralAvisos } from './CentralAvisos';
import { BancoDeHoras } from './BancoDeHoras';
import { AprovacaoJornada } from './AprovacaoJornada';
import { Organograma } from './Organograma';
import { PainelGestao } from './PainelGestao';

interface PropsPainelRede {
  colaboradorAtual: Colaborador;
  aoAbrirConversa: (conversaId: string) => void;
  aoChamarRadio: (colegaId: string) => void;
  aoAlternarParaGestor?: () => void;
}

type SubAbaPainel =
  | 'visao_geral'
  | 'quadro'
  | 'gestao'
  | 'organograma'
  | 'aprovacoes'
  | 'ponto'
  | 'avisos';

export const PainelRede: React.FC<PropsPainelRede> = ({
  colaboradorAtual,
  aoAbrirConversa,
  aoChamarRadio,
  aoAlternarParaGestor,
}) => {
  const [subAbaAtiva, setSubAbaAtiva] = useState<SubAbaPainel>('visao_geral');
  const [estatisticas, setEstatisticas] = useState(bancoDados.obterEstatisticasRede());

  const atualizar = () => {
    setEstatisticas(bancoDados.obterEstatisticasRede());
  };

  useEffect(() => {
    atualizar();
    const cancelar = bancoDados.assinarAlteracoes(atualizar);
    return () => cancelar();
  }, []);

  /**
   * Unidades com equipe primeiro e, dentro disso, as maiores antes. As lojas
   * ainda sem ninguém cadastrado vão para o fim, para que a leitura comece
   * pelo que está em operação em vez de por cartões vazios.
   */
  const unidadesOrdenadas = useMemo(() => {
    return [...INFORMACOES_LOJAS].sort((a, b) => {
      const totalA = estatisticas.porLoja[a.nome]?.total || 0;
      const totalB = estatisticas.porLoja[b.nome]?.total || 0;
      if (totalA === 0 && totalB > 0) return 1;
      if (totalB === 0 && totalA > 0) return -1;
      if (totalA !== totalB) return totalB - totalA;
      return a.nome.localeCompare(b.nome);
    });
  }, [estatisticas]);

  /** Maior setor da rede, para as barras compararem entre si com honestidade. */
  const maiorSetor = useMemo(() => {
    const valores = Object.values(estatisticas.porSetor) as number[];
    return valores.length > 0 ? Math.max(...valores) : 0;
  }, [estatisticas]);

  /** Banco de horas e QR do ponto: só RH e Administrador. */
  const podeVerBancoDeHoras = servicoPonto.podeAcessarPainelRH(colaboradorAtual);

  /** Quantas jornadas esperam decisão minha. */
  const pendenciasParaDecidir = servicoPonto.obterPendenciasParaDecidir().length;

  /**
   * Painel de gestão: quem responde por alguém. Líder de setor e gerente
   * acompanham a própria equipe; RH, Diretoria e TI veem a rede — para eles
   * é o mesmo alcance do painel de RH, só que organizado por pessoa.
   */
  const temEquipe = servicoPonto.obterColaboradoresVisiveis().length > 1;
  const podeVerGestao = colaboradorAtual.nivel >= NIVEL_LIDER_SETOR && temEquipe;

  const lidarIniciarConversaColega = (colegaId: string) => {
    const conversa = bancoDados.obterOuCriarConversaIndividual(colegaId);
    aoAbrirConversa(conversa.id);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[var(--c-canvas)] overflow-y-auto pb-24">
      {/* Cabeçalho do Painel */}
      <header className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] p-4 sm:p-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-lg sm:text-xl font-black text-[var(--c-texto)] tracking-tight">
                Recursos Humanos & Rede
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[var(--c-texto-3)]">
              {estatisticas.totalColaboradores}{' '}
              {estatisticas.totalColaboradores === 1 ? 'colaborador' : 'colaboradores'} em{' '}
              {estatisticas.totalLojasComEquipe}{' '}
              {estatisticas.totalLojasComEquipe === 1 ? 'unidade' : 'unidades'} · Rádio PTT &
              Mensageria
            </p>
          </div>

          {/* Seletor de Sub-Abas do Painel */}
          <div className="flex items-center bg-[var(--c-canvas)] border border-[var(--c-borda)] p-1 rounded-xl gap-1 self-start sm:self-auto max-w-full overflow-x-auto">
            <button
              type="button"
              id="subaba-visao-geral"
              onClick={() => setSubAbaAtiva('visao_geral')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                subAbaAtiva === 'visao_geral'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Visão & Lojas</span>
            </button>

            <button
              type="button"
              id="subaba-quadro-funcionarios"
              onClick={() => setSubAbaAtiva('quadro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                subAbaAtiva === 'quadro'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Quadro de Equipe</span>
            </button>

            {/* Minha equipe: o dia a dia de quem responde por alguém */}
            {podeVerGestao && (
              <button
                type="button"
                id="subaba-gestao"
                onClick={() => setSubAbaAtiva('gestao')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  subAbaAtiva === 'gestao'
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                    : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Minha Equipe</span>
                {pendenciasParaDecidir > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {pendenciasParaDecidir}
                  </span>
                )}
              </button>
            )}

            {/* Organograma: quem responde por quem. Fica ao lado do quadro
                porque é a mesma equipe vista pela cadeia de responsabilidade
                — e é essa cadeia que decide a fila de aprovação de horas. */}
            <button
              type="button"
              id="subaba-organograma"
              onClick={() => setSubAbaAtiva('organograma')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                subAbaAtiva === 'organograma'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Organograma</span>
            </button>

            {/* Aprovações: todo mundo que responde por alguém tem fila. O
                contador existe para a fila não passar despercebida — hora
                parada aqui é hora que não entrou no banco de ninguém. */}
            {pendenciasParaDecidir > 0 && (
              <button
                type="button"
                id="subaba-aprovacoes"
                onClick={() => setSubAbaAtiva('aprovacoes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  subAbaAtiva === 'aprovacoes'
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                    : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Aprovar Jornadas</span>
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendenciasParaDecidir}
                </span>
              </button>
            )}

            {/* Banco de horas: só quem cuida de RH */}
            {podeVerBancoDeHoras && (
              <button
                type="button"
                id="subaba-banco-horas"
                onClick={() => setSubAbaAtiva('ponto')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  subAbaAtiva === 'ponto'
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                    : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Banco de Horas</span>
              </button>
            )}

            <button
              type="button"
              id="subaba-central-avisos"
              onClick={() => setSubAbaAtiva('avisos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all relative ${
                subAbaAtiva === 'avisos'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>Avisos & Direção</span>
              {estatisticas.avisosUrgentes > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--c-superficie)]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal do Painel */}
      <main className="flex-1 max-w-7xl w-full mx-auto">
        {/* SUB-ABA 1: VISÃO GERAL & SEPARAÇÕES POR LOJA E SETOR */}
        {subAbaAtiva === 'visao_geral' && (
          <div className="p-4 sm:p-6 flex flex-col gap-6 animate-in fade-in duration-150">
            {/* 4 Cards de Métricas Principais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Equipe em Turno</span>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.totalOnline}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      / {estatisticas.totalColaboradores} ativos
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{estatisticas.disponiveis} disponíveis no balcão/loja</span>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Lojas Interligadas</span>
                  <Building2 className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.totalLojasComEquipe}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      {estatisticas.totalLojasComEquipe === 1 ? 'com equipe' : 'com equipe'} de 5
                    </span>
                  </div>
                  <p className="text-xs text-[var(--c-texto-3)] mt-1">
                    Pirassununga (matriz), Porto Ferreira, Palmeiras, Descalvado, Sta. Rita
                  </p>
                </div>
              </div>

              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Comunicados Oficiais</span>
                  <Megaphone className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.totalAvisosVigentes}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      {estatisticas.totalAvisosVigentes === 1 ? 'aviso' : 'avisos'}
                    </span>
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                    {estatisticas.avisosUrgentes > 0 ? (
                      <span className="font-bold">⚠️ {estatisticas.avisosUrgentes} urgente da diretoria</span>
                    ) : (
                      'Todos comunicados em dia'
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Movimento de Hoje</span>
                  <Radio className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.mensagensHoje}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      {estatisticas.mensagensHoje === 1 ? 'mensagem' : 'mensagens'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--c-texto-3)] mt-1">
                    {estatisticas.chamadasHoje}{' '}
                    {estatisticas.chamadasHoje === 1 ? 'recado' : 'recados'} de voz no rádio PTT
                  </p>
                </div>
              </div>
            </div>

            {/* SEÇÃO 1: SEPARAÇÕES POR LOJA (5 LOJAS + CENTRAL) */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[var(--c-texto)] flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--c-acento)]" />
                    Separações por Loja & Filiais
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Status da operação, supervisão e equipe conectada em cada unidade
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSubAbaAtiva('quadro')}
                  className="text-xs font-bold text-[var(--c-acento)] hover:underline flex items-center gap-1"
                >
                  Ver quadro completo <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unidadesOrdenadas.map((loja) => {
                  const metricasLoja = estatisticas.porLoja[loja.nome] || { total: 0, online: 0 };
                  const semEquipe = metricasLoja.total === 0;

                  return (
                    <div
                      key={loja.nome}
                      className={`bg-[var(--c-superficie)] rounded-xl border p-4 shadow-xs transition-all flex flex-col justify-between gap-3 ${
                        semEquipe
                          ? 'border-dashed border-[var(--c-borda)] opacity-60'
                          : 'border-[var(--c-borda)] hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-[var(--c-texto)]">
                              Loja {loja.nome}
                            </h3>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                                loja.tipo === 'Matriz'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                                  : loja.tipo === 'Central'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {loja.tipo}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--c-texto-3)] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {loja.cidade}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {metricasLoja.online} online
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-[var(--c-texto-2)] bg-[var(--c-canvas)] p-2.5 rounded-lg border border-[var(--c-borda)] flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Supervisão:</span>
                          <strong className="text-[var(--c-texto)]">{loja.gerente}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Telefone:</span>
                          <span className="font-mono text-[var(--c-texto-2)]">{loja.telefone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Equipe cadastrada:</span>
                          <span>{metricasLoja.total} colaboradores</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {loja.grupoId && (
                          <button
                            type="button"
                            onClick={() => aoAbrirConversa(loja.grupoId!)}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--c-superficie-2)] hover:bg-[var(--c-borda)] text-[var(--c-texto)] font-semibold text-xs transition-colors flex items-center justify-center gap-1 border border-[var(--c-borda)]"
                          >
                            <span>Canal da Loja</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSubAbaAtiva('quadro')}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--c-acento)] hover:brightness-110 text-[var(--c-sobre-acento)] font-semibold text-xs transition-all flex items-center justify-center gap-1"
                        >
                          <span>Ver Funcionários</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SEÇÃO 2: SEPARAÇÕES POR SETOR OPERACIONAL */}
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-base font-bold text-[var(--c-texto)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--c-acento)]" />
                  Separações por Setor da Autopeças
                </h2>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Distribuição de colaboradores por atividade nas lojas e na matriz
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(Object.entries(estatisticas.porSetor) as [string, number][]).map(([setorNome, quantidade]) => {
                  const qtdNum = Number(quantidade) || 0;
                  return (
                    <div
                      key={setorNome}
                      onClick={() => setSubAbaAtiva('quadro')}
                      className="bg-[var(--c-superficie)] p-3.5 rounded-xl border border-[var(--c-borda)] shadow-xs hover:border-[var(--c-acento)] cursor-pointer transition-all flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-sm text-[var(--c-texto)]">{setorNome}</strong>
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                          {qtdNum} {qtdNum === 1 ? 'membro' : 'membros'}
                        </span>
                      </div>
                      <div className="w-full bg-[var(--c-canvas)] h-2 rounded-full overflow-hidden border border-[var(--c-borda)]">
                        <div
                          className="bg-[var(--c-acento)] h-full rounded-full"
                          style={{
                            // Proporcional ao maior setor: a barra compara
                            // setores entre si, sem fator de escala inventado
                            width: `${Math.round((qtdNum / Math.max(1, maiorSetor)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SEÇÃO 3: ATALHOS RÁPIDOS PARA AVISOS DA REDE */}
            <section className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Precisa emitir um aviso para as 5 lojas?</h3>
                  <p className="text-xs text-blue-200">
                    Comunique inventários, chegadas de peças e laudos de garantia com ciência obrigatória.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSubAbaAtiva('avisos')}
                className="px-4 py-2 rounded-lg bg-white text-blue-900 font-bold text-xs hover:bg-blue-50 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Acessar Central de Avisos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </section>
          </div>
        )}

        {/* SUB-ABA 2: QUADRO COMPLETO DE FUNCIONÁRIOS */}
        {subAbaAtiva === 'quadro' && (
          <QuadroFuncionarios
            colaboradorAtual={colaboradorAtual}
            aoIniciarConversa={lidarIniciarConversaColega}
            aoChamarRadio={aoChamarRadio}
          />
        )}

        {/* SUB-ABA 3: BANCO DE HORAS E QR DO PONTO */}
        {subAbaAtiva === 'aprovacoes' && (
          <AprovacaoJornada colaboradorAtual={colaboradorAtual} />
        )}

        {/* SUB-ABA: A EQUIPE DE QUEM RESPONDE POR ALGUÉM */}
        {subAbaAtiva === 'gestao' && (
          <PainelGestao
            colaboradorAtual={colaboradorAtual}
            aoAbrirConversa={lidarIniciarConversaColega}
          />
        )}

        {/* SUB-ABA: CADEIA DE RESPONSABILIDADE (decide quem aprova hora) */}
        {subAbaAtiva === 'organograma' && (
          <Organograma colaboradorAtual={colaboradorAtual} />
        )}

        {subAbaAtiva === 'ponto' && <BancoDeHoras colaboradorAtual={colaboradorAtual} />}

        {/* SUB-ABA 4: CENTRAL DE AVISOS DA DIREÇÃO */}
        {subAbaAtiva === 'avisos' && (
          <CentralAvisos
            colaboradorAtual={colaboradorAtual}
            aoAbrirConversaAvisos={() => aoAbrirConversa('grupo-avisos-da-rede')}
            aoAlternarParaGestor={aoAlternarParaGestor}
          />
        )}
      </main>
    </div>
  );
};
