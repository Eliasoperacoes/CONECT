/**
 * CONECTA — Comunicador Interno da Malachias Autopeças
 * Estrutura: 3 abas (Conversas | Grupos | Eu), rádio ao vivo com WebRTC,
 * hierarquia Setor x Loja x Nível e responsividade rigorosa (360px até 1920px).
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users,
  User,
  Plus,
  LayoutDashboard,
  ShieldCheck,
  Radio,
  Building2,
  LogOut,
  Clock,
} from 'lucide-react';
import { AbaPrincipal, Colaborador, Conversa, Mensagem } from './tipos';
import { bancoDados } from './servicos/bancoDados';
import { ItemConversa } from './componentes/ItemConversa';
import { FaixaAvisoDirecao } from './componentes/FaixaAvisoDirecao';
import { TelaConversa } from './componentes/TelaConversa';
import { AbaEu } from './componentes/AbaEu';
import { PainelRede } from './componentes/PainelRede';
import { ModalNovaConversa } from './componentes/ModalNovaConversa';
import { ModalCriarGrupo } from './componentes/ModalCriarGrupo';
import { IndicadorOffline } from './componentes/IndicadorOffline';
import { TelaLogin } from './componentes/TelaLogin';
import { PainelAdministrativo } from './componentes/PainelAdministrativo';
import { AbaPonto } from './componentes/AbaPonto';
import { PainelRecursosHumanos } from './componentes/PainelRecursosHumanos';
import { servicoPonto } from './servicos/ponto';

export default function App() {
  const [autenticado, setAutenticado] = useState<boolean>(bancoDados.estaAutenticado());
  const [painelAdminAberto, setPainelAdminAberto] = useState<boolean>(false);
  const [painelRhAberto, setPainelRhAberto] = useState<boolean>(false);
  const [abaAtiva, setAbaAtiva] = useState<AbaPrincipal>('conversas');
  const [colaboradorAtual, setColaboradorAtual] = useState<Colaborador>(
    bancoDados.obterColaboradorAtual()
  );
  const [conversasIndividuais, setConversasIndividuais] = useState<Conversa[]>([]);
  const [grupos, setGrupos] = useState<Conversa[]>([]);
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null);
  const [avisoNaoLido, setAvisoNaoLido] = useState<Mensagem | null>(null);

  // Modais acionados pelo botão '+'
  const [modalNovaConversaAberto, setModalNovaConversaAberto] = useState(false);
  const [modalCriarGrupoAberto, setModalCriarGrupoAberto] = useState(false);

  // Carrega e sincroniza dados
  const recarregarDados = () => {
    const atual = bancoDados.obterColaboradorAtual();
    setColaboradorAtual(atual);
    setAutenticado(bancoDados.estaAutenticado());
    setConversasIndividuais(bancoDados.obterConversasIndividuais());
    setGrupos(bancoDados.obterGrupos());
    setAvisoNaoLido(bancoDados.obterAvisoDirecaoNaoLido());
  };

  useEffect(() => {
    recarregarDados();
    const cancelar = bancoDados.assinarAlteracoes(recarregarDados);
    return () => cancelar();
  }, []);

  // Se não estiver autenticado, exibe Tela de Login (Elias / 123)
  if (!autenticado) {
    return (
      <TelaLogin
        aoAutenticar={(colab) => {
          setColaboradorAtual(colab);
          setAutenticado(true);
        }}
      />
    );
  }

  // Painel de RH (banco de horas): setor RH e Administrador
  if (painelRhAberto) {
    return (
      <PainelRecursosHumanos
        colaboradorAtual={colaboradorAtual}
        aoFechar={() => setPainelRhAberto(false)}
      />
    );
  }

  // Se o Painel Administrativo Geral estiver aberto, exibe a tela completa de gestão
  if (painelAdminAberto) {
    return (
      <PainelAdministrativo
        colaboradorAtual={colaboradorAtual}
        aoFechar={() => setPainelAdminAberto(false)}
        aoAbrirConversa={(id) => {
          setConversaAtivaId(id);
          setPainelAdminAberto(false);
        }}
      />
    );
  }

  // Conversa ativa selecionada
  const conversaAtiva = conversaAtivaId
    ? bancoDados.obterConversaPorId(conversaAtivaId)
    : null;

  // Colegas para conversas (exceto o próprio colaborador)
  const outrosColegas = bancoDados
    .obterColaboradores()
    .filter((c) => c.id !== colaboradorAtual.id);

  // Ação ao selecionar um colega na lista de nova conversa
  const lidarSelecionarColega = (colegaId: string) => {
    const conversa = bancoDados.obterOuCriarConversaIndividual(colegaId);
    setConversaAtivaId(conversa.id);
  };

  // Ação de criação de grupo (apenas nível 2+)
  const lidarCriarGrupo = (nome: string, participantesIds: string[]) => {
    const resultado = bancoDados.criarGrupo(nome, participantesIds);
    if (resultado.sucesso && resultado.grupo) {
      setConversaAtivaId(resultado.grupo.id);
    }
  };

  // Alterna o colaborador logado na aba "Eu" para testes de permissão
  const lidarTrocarColaborador = (novoId: string) => {
    bancoDados.definirColaboradorAtual(novoId);
    setConversaAtivaId(null);
  };

  const lidarDeslogar = () => {
    bancoDados.deslogar();
    setAutenticado(false);
    setConversaAtivaId(null);
  };

  // Abre conversa de avisos ao clicar na faixa
  const abrirAvisosDirecao = () => {
    setConversaAtivaId('grupo-avisos-da-rede');
    if (avisoNaoLido) {
      bancoDados.marcarAvisoDirecaoComoLido(avisoNaoLido.id);
      setAvisoNaoLido(null);
    }
  };

  const ehAdmin = colaboradorAtual.nivel === 4;
  // RH e Administrador acessam o banco de horas de toda a rede
  const podeAbrirRh = servicoPonto.podeAcessarPainelRH(colaboradorAtual);

  // Determina visibilidade do botão flutuante '+'
  // Conversas: liberado para todos iniciarem bate-papo privado com colega
  // Grupos: liberado estritamente para o Administrador
  const deveExibirBotaoMais =
    (abaAtiva === 'conversas') ||
    (abaAtiva === 'grupos' && ehAdmin);

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-[var(--c-canvas)] text-[var(--c-texto)] overflow-hidden">
      <IndicadorOffline />

      {/* Topo Geral da Aplicação Principal */}
      <header className="px-4 py-2.5 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm tracking-tight text-[var(--c-texto)]">
                CONECTA
              </span>
              <span className="text-[10px] text-[var(--c-texto-3)] font-semibold hidden sm:inline">
                · Malachias Autopeças
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" title="Conectado à Rede" />
            </div>
            <span className="text-[11px] text-[var(--c-texto-3)] font-medium block -mt-0.5">
              {colaboradorAtual.loja} · {colaboradorAtual.cargo}
            </span>
          </div>
        </div>

        {/* Ações Rápidas do Topo: Painel ADM e Perfil */}
        <div className="flex items-center gap-2">
          {podeAbrirRh && (
            <button
              type="button"
              id="botao-topo-painel-rh"
              onClick={() => setPainelRhAberto(true)}
              className="px-2.5 py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              title="Banco de horas da rede (RH)"
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">RH</span>
            </button>
          )}

          {ehAdmin && (
            <button
              type="button"
              id="botao-topo-painel-adm"
              onClick={() => setPainelAdminAberto(true)}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              title="Abrir Painel Administrativo de TI"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Painel ADM</span>
            </button>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-[var(--c-borda)]">
            <button
              type="button"
              id="botao-topo-perfil-eu"
              onClick={() => {
                setAbaAtiva('eu');
                setConversaAtivaId(null);
              }}
              className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-[var(--c-superficie-2)] transition-colors text-xs"
              title="Meu Perfil"
            >
              <div className="w-6 h-6 rounded-full overflow-hidden bg-[var(--c-canvas)] border border-[var(--c-borda)] flex items-center justify-center font-bold text-[10px]">
                {colaboradorAtual.foto ? (
                  <img
                    src={colaboradorAtual.foto}
                    alt={colaboradorAtual.nome}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  colaboradorAtual.nome.charAt(0)
                )}
              </div>
              <span className="font-semibold text-[var(--c-texto)] hidden sm:inline max-w-[120px] truncate">
                {colaboradorAtual.nome}
              </span>
              {ehAdmin && (
                <span className="text-[9px] font-black uppercase bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30">
                  ADM
                </span>
              )}
            </button>

            <button
              type="button"
              id="botao-topo-sair"
              onClick={lidarDeslogar}
              className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-red-600 hover:bg-red-500/10 transition-colors"
              title="Sair do Sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Estrutura responsiva:
          - No celular (< 768px): ou vê a lista de abas, ou vê a conversa ativa
          - No PC (>= 768px): DUAS colunas (lista de 340px à esquerda + conversa à direita)
      */}
      <div className="flex-1 flex w-full h-full overflow-hidden">
        {/* COLUNA 1: Navegação e Listas (no celular fica escondida se houver conversa aberta) */}
        <div
          className={`flex flex-col w-full md:w-[340px] md:flex-shrink-0 md:border-r md:border-[var(--c-borda)] bg-[var(--c-superficie)] h-full relative ${
            conversaAtiva ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Faixa fixa no topo se houver aviso não lido da direção (apenas na aba Conversas) */}
          {abaAtiva === 'conversas' && avisoNaoLido && (
            <FaixaAvisoDirecao
              aviso={avisoNaoLido}
              aoAbrir={abrirAvisosDirecao}
              aoDispensar={() => {
                bancoDados.marcarAvisoDirecaoComoLido(avisoNaoLido.id);
                setAvisoNaoLido(null);
              }}
            />
          )}

          {/* Conteúdo da Aba Ativa */}
          <div className="flex-1 overflow-y-auto">
            {/* ABA 1: CONVERSAS (só conversas individuais) */}
            {abaAtiva === 'conversas' && (
              conversasIndividuais.length === 0 ? (
                <div className="p-8 text-center text-[var(--c-texto-3)] text-xs space-y-3">
                  <p>Nenhuma conversa individual iniciada ainda.</p>
                  <button
                    type="button"
                    onClick={() => setModalNovaConversaAberto(true)}
                    className="py-2 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-xs"
                  >
                    + Chamar um Colega
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--c-borda)]">
                  {conversasIndividuais.map((c) => (
                    <ItemConversa
                      key={c.id}
                      conversa={c}
                      selecionada={conversaAtivaId === c.id}
                      aoClicar={() => setConversaAtivaId(c.id)}
                    />
                  ))}
                </div>
              )
            )}

            {/* ABA 2: GRUPOS (canais operacionais) */}
            {abaAtiva === 'grupos' && (
              grupos.length === 0 ? (
                <div className="p-8 text-center text-[var(--c-texto-3)] text-xs">
                  Nenhum grupo disponível.
                </div>
              ) : (
                <div className="divide-y divide-[var(--c-borda)]">
                  {grupos.map((g) => (
                    <ItemConversa
                      key={g.id}
                      conversa={g}
                      selecionada={conversaAtivaId === g.id}
                      aoClicar={() => setConversaAtivaId(g.id)}
                    />
                  ))}
                </div>
              )
            )}

            {/* ABA 3: PAINEL DA REDE & GESTÃO DE PESSOAS (No mobile) */}
            {abaAtiva === 'painel' && (
              <div className="block md:hidden h-full">
                <PainelRede
                  colaboradorAtual={colaboradorAtual}
                  aoAbrirConversa={(id) => setConversaAtivaId(id)}
                  aoChamarRadio={(colegaId) => lidarSelecionarColega(colegaId)}
                  aoAlternarParaGestor={() => setPainelAdminAberto(true)}
                />
              </div>
            )}

            {/* ABA 3 (Desktop): Atalhos rápidos das 5 lojas e setores */}
            {abaAtiva === 'painel' && (
              <div className="hidden md:flex flex-col p-3 gap-3">
                <div className="p-3 bg-[var(--c-superficie-2)] rounded-xl border border-[var(--c-borda)]">
                  <span className="text-xs font-bold text-[var(--c-texto)] block">
                    Rede Malachias Autopeças
                  </span>
                  <span className="text-xs text-[var(--c-texto-3)]">
                    5 Lojas Interligadas · Pirassununga, Porto Ferreira, Palmeiras, Descalvado, Sta. Rita
                  </span>
                </div>

                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-[var(--c-texto-3)] uppercase tracking-wider">
                    Canais das Lojas
                  </span>
                  {ehAdmin && (
                    <button
                      type="button"
                      onClick={() => setPainelAdminAberto(true)}
                      className="text-xs text-indigo-600 font-bold hover:underline"
                    >
                      Gerenciar
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  {grupos.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setConversaAtivaId(g.id)}
                      className={`p-2.5 rounded-lg text-left text-xs font-semibold flex items-center justify-between border transition-all ${
                        conversaAtivaId === g.id
                          ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                          : 'bg-[var(--c-canvas)] text-[var(--c-texto)] border-[var(--c-borda)] hover:bg-[var(--c-superficie-2)]'
                      }`}
                    >
                      <span className="truncate">{g.nome}</span>
                      <span className="text-[10px] opacity-75 font-mono">
                        {g.tipo === 'grupo' ? 'Grupo' : 'Canal'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ABA PONTO: banco de horas individual do colaborador */}
            {abaAtiva === 'ponto' && <AbaPonto colaboradorAtual={colaboradorAtual} />}

            {/* ABA 4: EU (Meu perfil, ramal, preferências, logout) */}
            {abaAtiva === 'eu' && (
              <AbaEu
                colaboradorAtual={colaboradorAtual}
                aoTrocarColaborador={lidarTrocarColaborador}
                aoSair={lidarDeslogar}
                aoAbrirAdmin={() => setPainelAdminAberto(true)}
              />
            )}
          </div>

          {/* Botão flutuante '+' no canto inferior direito */}
          {deveExibirBotaoMais && (
            <button
              type="button"
              id="botao-flutuante-adicionar"
              onClick={() => {
                if (abaAtiva === 'conversas') {
                  setModalNovaConversaAberto(true);
                } else if (abaAtiva === 'grupos') {
                  setModalCriarGrupoAberto(true);
                }
              }}
              className="absolute right-4 bottom-20 z-30 w-14 h-14 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] flex items-center justify-center shadow-[var(--s-3)] hover:brightness-110 active:scale-95 transition-all"
              aria-label={abaAtiva === 'conversas' ? 'Nova conversa' : 'Novo grupo'}
            >
              <Plus className="w-6 h-6" />
            </button>
          )}

          {/* Barra inferior com as abas de navegação */}
          <nav
            id="barra-inferior-navegacao"
            className="w-full bg-[var(--c-superficie)] border-t border-[var(--c-borda)] h-16 flex items-center justify-around flex-shrink-0 z-20 pb-[env(safe-area-inset-bottom)]"
          >
            <button
              type="button"
              id="aba-navegacao-conversas"
              onClick={() => {
                setAbaAtiva('conversas');
              }}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                abaAtiva === 'conversas'
                  ? 'text-[var(--c-acento)] font-semibold'
                  : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-xs">Conversas</span>
            </button>

            <button
              type="button"
              id="aba-navegacao-grupos"
              onClick={() => {
                setAbaAtiva('grupos');
              }}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                abaAtiva === 'grupos'
                  ? 'text-[var(--c-acento)] font-semibold'
                  : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-xs">Grupos</span>
            </button>

            <button
              type="button"
              id="aba-navegacao-ponto"
              onClick={() => {
                setAbaAtiva('ponto');
                setConversaAtivaId(null);
              }}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                abaAtiva === 'ponto'
                  ? 'text-[var(--c-acento)] font-semibold'
                  : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
              }`}
            >
              <Clock className="w-5 h-5" />
              <span className="text-xs">Ponto</span>
            </button>

            <button
              type="button"
              id="aba-navegacao-painel"
              onClick={() => {
                setAbaAtiva('painel');
                setConversaAtivaId(null);
              }}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors relative ${
                abaAtiva === 'painel'
                  ? 'text-[var(--c-acento)] font-semibold'
                  : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-xs">Rede</span>
              {avisoNaoLido && (
                <span className="absolute top-2 right-1/4 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--c-superficie)]" />
              )}
            </button>

            {ehAdmin && (
              <button
                type="button"
                id="aba-navegacao-admin"
                onClick={() => {
                  setPainelAdminAberto(true);
                }}
                className="flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors text-indigo-600 hover:text-indigo-700"
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="text-xs font-bold">Admin</span>
              </button>
            )}

            <button
              type="button"
              id="aba-navegacao-eu"
              onClick={() => {
                setAbaAtiva('eu');
              }}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                abaAtiva === 'eu'
                  ? 'text-[var(--c-acento)] font-semibold'
                  : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
              }`}
            >
              <User className="w-5 h-5" />
              <span className="text-xs">Eu</span>
            </button>
          </nav>
        </div>

        {/* COLUNA 2: Tela de Conversa ou Painel da Rede */}
        <main
          className={`flex-1 h-full bg-[var(--c-canvas)] flex justify-center overflow-hidden ${
            conversaAtiva ? 'flex' : 'hidden md:flex'
          }`}
        >
          {conversaAtiva ? (
            <div className="w-full max-w-[760px] h-full flex flex-col bg-[var(--c-canvas)] border-x border-[var(--c-borda)]">
              <TelaConversa
                conversa={conversaAtiva}
                colaboradorAtual={colaboradorAtual}
                aoVoltar={() => setConversaAtivaId(null)}
              />
            </div>
          ) : abaAtiva === 'painel' ? (
            <div className="w-full h-full flex flex-col bg-[var(--c-canvas)] overflow-hidden">
              <PainelRede
                colaboradorAtual={colaboradorAtual}
                aoAbrirConversa={(id) => setConversaAtivaId(id)}
                aoChamarRadio={(colegaId) => lidarSelecionarColega(colegaId)}
                aoAlternarParaGestor={() => setPainelAdminAberto(true)}
              />
            </div>
          ) : (
            <div className="w-full max-w-[760px] h-full flex flex-col items-center justify-center text-center p-8 text-[var(--c-texto-3)]">
              <div className="w-20 h-20 rounded-full bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center justify-center mb-4 text-[var(--c-acento)]">
                <MessageSquare className="w-10 h-10" />
              </div>
              <h2 className="text-lg font-bold text-[var(--c-texto)] mb-1">
                CONECTA Malachias
              </h2>
              <p className="text-sm max-w-sm mb-4">
                Comunicação em tempo real, rádio walkie-talkie PTT e gestão integrada das 5 filiais da rede.
              </p>
              {ehAdmin && (
                <button
                  type="button"
                  id="botao-abrir-adm-banner"
                  onClick={() => setPainelAdminAberto(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-sm"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Acessar Painel Administrativo</span>
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modais do Botão '+' */}
      <ModalNovaConversa
        aberto={modalNovaConversaAberto}
        colegas={outrosColegas}
        aoSelecionar={lidarSelecionarColega}
        aoFechar={() => setModalNovaConversaAberto(false)}
      />

      <ModalCriarGrupo
        aberto={modalCriarGrupoAberto}
        colegas={outrosColegas}
        aoCriar={lidarCriarGrupo}
        aoFechar={() => setModalCriarGrupoAberto(false)}
      />
    </div>
  );
}
