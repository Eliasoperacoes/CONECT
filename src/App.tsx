/**
 * CONECTA — Comunicador Interno da Malachias Autopeças
 * Estrutura: 3 abas (Conversas | Grupos | Eu), rádio ao vivo com WebRTC,
 * hierarquia Setor x Loja x Nível e responsividade rigorosa (360px até 1920px).
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NIVEL_TI, NIVEL_GERENTE, vePainelDeRede } from './tipos';
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
  ClipboardList,
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
import { IndicadorNuvem } from './componentes/IndicadorNuvem';
import { TelaLogin } from './componentes/TelaLogin';
import { TelaDefinirSenha } from './componentes/TelaDefinirSenha';
import { PainelAdministrativo } from './componentes/PainelAdministrativo';
import { AbaPonto } from './componentes/AbaPonto';
import { JanelaChat } from './componentes/JanelaChat';
import { PainelConversas } from './componentes/PainelConversas';
import { podeUsar } from './servicos/permissoes';
import { aplicarPreferencias, assinarPreferencias } from './servicos/preferenciasConversa';
import { servicoPonto } from './servicos/ponto';
import { usandoNuvem } from './servicos/supabase';
import { nuvem } from './servicos/nuvem';
import { montarPreviaDaMensagem } from './servicos/nuvemComunicacao';
import {
  atualizarTituloDaAba,
  janelaEstaVisivel,
  mostrarAvisoDeMensagem,
  prepararAvisos,
  prepararSom,
  tocarAvisoDeMensagem,
} from './servicos/notificacoes';

/** Uma aba da barra inferior. `alvo` troca de aba; `acao` abre um painel. */
interface ItemNavegacao {
  id: string;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
  visivel: boolean;
  alvo?: AbaPrincipal;
  acao?: () => void;
  exibeAviso?: boolean;
  classeFixa?: string;
}

export default function App() {
  // No modo rede quem decide se há sessão é o banco, não o navegador: sem
  // isto a aplicação abria já dentro da conta guardada localmente.
  const [autenticado, setAutenticado] = useState<boolean>(
    usandoNuvem() ? false : bancoDados.estaAutenticado()
  );
  const [verificandoSessao, setVerificandoSessao] = useState<boolean>(usandoNuvem());
  const [precisaTrocarSenha, setPrecisaTrocarSenha] = useState(false);
  const [painelAdminAberto, setPainelAdminAberto] = useState<boolean>(false);
  const [abaAtivaEscolhida, setAbaAtiva] = useState<AbaPrincipal>('conversas');
  const [colaboradorAtual, setColaboradorAtual] = useState<Colaborador>(
    bancoDados.obterColaboradorAtual()
  );
  const [conversasIndividuais, setConversasIndividuais] = useState<Conversa[]>([]);
  const [grupos, setGrupos] = useState<Conversa[]>([]);
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null);
  // Conversa aberta POR CIMA do que estiver na tela, sem trocar de aba.
  // Usada quando a pessoa pede o chat de dentro do RH ou do ponto.
  /**
   * As conversas abertas por cima, na ordem em que foram abertas.
   *
   * Lista, e não um id só: dá para acompanhar duas pessoas ao mesmo tempo
   * sem fechar uma para abrir a outra — que era o que obrigava a voltar na
   * lista a cada troca. A posição de cada janela sai daqui.
   */
  const [janelas, setJanelas] = useState<Array<{ id: string; encolhida: boolean }>>([]);

  /** A janela do topo, para o que ainda pensa em "a conversa aberta". */
  const conversaFlutuanteId = janelas.length > 0 ? janelas[janelas.length - 1].id : null;

  /**
   * Abre — ou traz para a frente, se já estiver aberta.
   *
   * Clicar de novo numa conversa já aberta não pode criar uma segunda
   * janela dela: seriam duas caixas do mesmo diálogo, cada uma com a sua
   * rolagem.
   */
  const abrirJanela = (id: string) =>
    setJanelas((atuais) => {
      const existente = atuais.find((j) => j.id === id);
      if (existente) {
        // Já aberta: desencolhe e vai para o fim (a ponta visível)
        return [...atuais.filter((j) => j.id !== id), { id, encolhida: false }];
      }
      // Quatro janelas já enchem a largura de um monitor comum; a mais
      // antiga sai para a nova caber sem cobrir as outras
      const cabem = atuais.length >= 4 ? atuais.slice(1) : atuais;
      return [...cabem, { id, encolhida: false }];
    });

  const fecharJanela = (id: string) =>
    setJanelas((atuais) => atuais.filter((j) => j.id !== id));

  const alternarEncolhida = (id: string) =>
    setJanelas((atuais) =>
      atuais.map((j) => (j.id === id ? { ...j, encolhida: !j.encolhida } : j))
    );

  /**
   * Onde cada janela fica, da direita para a esquerda.
   *
   * Começa depois do painel de contatos (372px) e acumula a largura de cada
   * uma — 420 aberta, 210 encolhida. Sem acumular, duas janelas cairiam no
   * mesmo lugar e uma esconderia a outra.
   */
  const posicoesDasJanelas = useMemo(() => {
    const LARGURA_ABERTA = 420;
    const LARGURA_ENCOLHIDA = 210;
    const ESPACO = 12;

    let direita = 372;
    return janelas.map((j) => {
      const minha = direita;
      direita += (j.encolhida ? LARGURA_ENCOLHIDA : LARGURA_ABERTA) + ESPACO;
      return { ...j, direita: minha };
    });
  }, [janelas]);
  // Qual seção da lista flutuante está aberta no computador (nenhuma = fechada)
  const [secaoListaAberta, setSecaoListaAberta] = useState<'individuais' | 'grupos' | null>(null);

  /**
   * Muda quando alguém fixa ou oculta uma conversa. As preferências vivem
   * fora do React (armazenamento do aparelho), então a lista precisa de um
   * empurrão para se redesenhar.
   */
  const [versaoPreferencias, setVersaoPreferencias] = useState(0);
  const [avisoNaoLido, setAvisoNaoLido] = useState<Mensagem | null>(null);

  // Modais acionados pelo botão '+'
  const [modalNovaConversaAberto, setModalNovaConversaAberto] = useState(false);
  const [modalCriarGrupoAberto, setModalCriarGrupoAberto] = useState(false);

  // Carrega e sincroniza dados
  const recarregarDados = () => {
    const atual = bancoDados.obterColaboradorAtual();
    setColaboradorAtual(atual);
    // No modo rede a sessão do banco é a fonte da verdade
    if (!usandoNuvem()) setAutenticado(bancoDados.estaAutenticado());
    setConversasIndividuais(bancoDados.obterConversasIndividuais());
    setGrupos(bancoDados.obterGrupos());
    setAvisoNaoLido(bancoDados.obterAvisoDirecaoNaoLido());
  };

  useEffect(() => {
    recarregarDados();
    const cancelar = bancoDados.assinarAlteracoes(recarregarDados);
    return () => cancelar();
  }, []);

  /**
   * As preferências de conversa mudam fora do React — pela tela, e também
   * quando a sincronização traz as do banco. Sem escutar, fixar no celular
   * só apareceria no computador depois de recarregar a página.
   */
  useEffect(() => {
    const cancelar = assinarPreferencias(() => setVersaoPreferencias((v) => v + 1));
    return () => cancelar();
  }, []);

  /**
   * Prepara os avisos: o trabalhador de segundo plano na abertura, e o som no
   * primeiro toque na tela.
   *
   * O som precisa do gesto porque o navegador só libera áudio depois de um —
   * e a mensagem que chega não é gesto nenhum. Sem isto, o primeiro aviso sai
   * mudo, que foi o que aconteceu.
   */
  useEffect(() => {
    prepararAvisos();

    const aoPrimeiroToque = () => prepararSom();
    window.addEventListener('pointerdown', aoPrimeiroToque, { once: true });
    window.addEventListener('keydown', aoPrimeiroToque, { once: true });

    return () => {
      window.removeEventListener('pointerdown', aoPrimeiroToque);
      window.removeEventListener('keydown', aoPrimeiroToque);
    };
  }, []);

  /**
   * Avisa quando chega mensagem nova.
   *
   * Guarda quais mensagens já foram vistas nesta sessão, em vez de comparar
   * contagens: sem os identificadores, abrir o sistema com vinte mensagens
   * pendentes dispararia vinte avisos de coisas antigas. Na primeira leitura
   * tudo entra como "já visto" — o aviso vale para o que chega DEPOIS.
   */
  const jaAvisadas = useRef<Set<string> | null>(null);

  useEffect(() => {
    const porLer = bancoDados.obterMensagensPorLer();
    atualizarTituloDaAba(porLer.length);

    // Primeira passagem: registra o que já existia, sem avisar
    if (jaAvisadas.current === null) {
      jaAvisadas.current = new Set(porLer.map((m) => m.id));
      return;
    }

    const novas = porLer.filter((m) => !jaAvisadas.current!.has(m.id));
    novas.forEach((m) => jaAvisadas.current!.add(m.id));
    if (novas.length === 0) return;

    // Quem está com a conversa aberta na frente já está vendo chegar
    const ultima = novas[novas.length - 1];
    const olhandoEsta =
      janelaEstaVisivel() &&
      (conversaAtivaId === ultima.conversaId || conversaFlutuanteId === ultima.conversaId);
    if (olhandoEsta) return;

    tocarAvisoDeMensagem();

    const conversa = bancoDados.obterConversaPorId(ultima.conversaId);
    const remetente = bancoDados.obterColaboradorPorId(ultima.remetenteId);
    const ehGrupo = conversa?.tipo === 'grupo';

    mostrarAvisoDeMensagem({
      titulo: ehGrupo ? `${conversa?.nome}` : remetente?.nome || 'Nova mensagem',
      corpo: ehGrupo
        ? `${remetente?.nome || 'Alguém'}: ${montarPreviaDaMensagem(ultima)}`
        : montarPreviaDaMensagem(ultima),
      conversaId: ultima.conversaId,
      aoClicar: () => abrirJanela(ultima.conversaId),
    });
  }, [conversasIndividuais, grupos, conversaAtivaId, conversaFlutuanteId]);

  // Recupera a sessão do banco antes de decidir o que mostrar
  useEffect(() => {
    if (!usandoNuvem()) return;

    let cancelado = false;
    (async () => {
      const eu = await nuvem.obterMeuColaborador();
      if (cancelado) return;

      if (eu) {
        setColaboradorAtual(eu);
        setPrecisaTrocarSenha(await nuvem.precisaTrocarSenha());
        setAutenticado(true);

        // A regra de guarda das imagens roda aqui, em segundo plano: é a
        // única sessão que tem direito de limpar, e esperar por ela seria
        // segurar a abertura do sistema por uma tarefa de manutenção.
        bancoDados.aplicarRegraDeLimpeza().catch(() => {});
      }
      setVerificandoSessao(false);
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  // Enquanto a sessão do banco não é conferida, não dá para saber se mostra
  // o login ou o sistema. Piscar uma tela e trocar pela outra é pior.
  if (verificandoSessao) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center gap-3 bg-[var(--c-canvas)] text-[var(--c-texto-3)]">
        <div className="w-8 h-8 border-2 border-[var(--c-acento)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Conectando à rede Malachias…</span>
      </div>
    );
  }

  if (!autenticado) {
    return (
      <TelaLogin
        aoAutenticar={(colab, trocarSenha) => {
          setColaboradorAtual(colab);
          setPrecisaTrocarSenha(!!trocarSenha);
          setAutenticado(true);
        }}
      />
    );
  }

  // Quem entrou com a senha padrão não passa daqui sem definir a própria
  if (precisaTrocarSenha) {
    return (
      <TelaDefinirSenha
        colaborador={colaboradorAtual}
        aoConcluir={() => setPrecisaTrocarSenha(false)}
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
          abrirJanela(id);
          setPainelAdminAberto(false);
        }}
      />
    );
  }

  // Conversa ativa selecionada
  const conversaAtiva = conversaAtivaId
    ? bancoDados.obterConversaPorId(conversaAtivaId)
    : null;

  const conversaFlutuante = conversaFlutuanteId
    ? bancoDados.obterConversaPorId(conversaFlutuanteId)
    : undefined;
  void conversaFlutuante;

  // Colegas para conversas (exceto o próprio colaborador)
  const outrosColegas = bancoDados
    .obterColaboradores()
    .filter((c) => c.id !== colaboradorAtual.id);

  // Ação ao selecionar um colega na lista de nova conversa
  // Toda conversa aberta a partir de um atalho (nova conversa, radio, RH)
  // sobe como janela: quem pediu estava no meio de outra coisa.
  const lidarSelecionarColega = (colegaId: string) => {
    const conversa = bancoDados.obterOuCriarConversaIndividual(colegaId);
    abrirJanela(conversa.id);
  };

  // Ação de criação de grupo (apenas nível 2+)
  const lidarCriarGrupo = (nome: string, participantesIds: string[]) => {
    const resultado = bancoDados.criarGrupo(nome, participantesIds);
    if (resultado.sucesso && resultado.grupo) {
      abrirJanela(resultado.grupo.id);
    }
  };

  // Alterna o colaborador logado na aba "Eu" para testes de permissão
  const lidarTrocarColaborador = (novoId: string) => {
    bancoDados.definirColaboradorAtual(novoId);
    setConversaAtivaId(null);
  };

  const lidarDeslogar = () => {
    bancoDados.deslogar();
    // No modo rede a sessão vive no banco e também precisa ser encerrada
    if (usandoNuvem()) nuvem.sair();
    setPrecisaTrocarSenha(false);
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

  const ehAdmin = colaboradorAtual.nivel >= NIVEL_TI;

  // A aba RH reúne indicadores da rede, quadro de equipe, banco de horas e
  // comunicados: é informação de gestão, restrita a Administrador, RH e
  // gestores (nível 3+). Dentro dela, o banco de horas ainda exige RH ou
  // Administrador — um gestor vê a rede, não o ponto de todo mundo.
  const podeVerRede = vePainelDeRede(colaboradorAtual);

  // Se o colaborador estiver na aba RH e perder o acesso (por troca de conta
  // ou mudança de cargo pela gestão), a navegação volta sozinha para Conversas.
  /**
   * A aba que vale. Nunca uma que a pessoa não enxergue — nem por escolha
   * antiga guardada, nem por permissão retirada com a tela aberta.
   */
  const abaAtiva: AbaPrincipal = (() => {
    if (abaAtivaEscolhida === 'painel' && !podeVerRede) return 'eu';
    if (abaAtivaEscolhida !== 'painel' && !podeUsar(abaAtivaEscolhida, colaboradorAtual)) {
      if (podeVerRede) return 'painel';
      return podeUsar('conversas', colaboradorAtual) ? 'conversas' : 'eu';
    }
    return abaAtivaEscolhida;
  })();

  // Abas da barra inferior, montadas conforme a permissão de cada colaborador
  const todasAsAbas: ItemNavegacao[] = [
    /**
     * A visibilidade vem do painel de Permissões, não de `true` escrito
     * aqui. Era o que faltava para "gerente não bate ponto" valer de fato:
     * o catálogo já dizia isso, mas esta lista não perguntava a ninguém e a
     * aba continuava aparecendo.
     */
    {
      id: 'conversas', rotulo: 'Conversas', icone: MessageSquare,
      visivel: podeUsar('conversas', colaboradorAtual), alvo: 'conversas',
    },
    {
      id: 'grupos', rotulo: 'Grupos', icone: Users,
      visivel: podeUsar('grupos', colaboradorAtual), alvo: 'grupos',
    },
    {
      id: 'ponto', rotulo: 'Ponto', icone: Clock,
      visivel: podeUsar('ponto', colaboradorAtual), alvo: 'ponto',
    },
    {
      // Painel único de RH & Rede: visão das lojas, quadro de equipe, banco de
      // horas (para RH e Administrador) e comunicados da direção.
      id: 'painel',
      rotulo: 'Gerenciar',
      icone: ClipboardList,
      visivel: podeVerRede,
      alvo: 'painel',
      exibeAviso: true,
    },
    {
      id: 'admin',
      rotulo: 'Admin',
      icone: ShieldCheck,
      visivel: ehAdmin,
      acao: () => setPainelAdminAberto(true),
      classeFixa: 'text-indigo-600 hover:text-indigo-700 font-bold',
    },
    {
      id: 'eu', rotulo: 'Eu', icone: User,
      // "Eu" é a saída de emergência da navegação: se tudo o mais for
      // desligado, ainda há uma tela com o próprio perfil e o botão de sair.
      visivel: true, alvo: 'eu',
    },
  ];

  const abasNavegacao = todasAsAbas.filter((aba) => aba.visivel);

  /**
   * As listas do celular passando pelas mesmas preferências do computador:
   * fixadas no topo, ocultas fora. Antes só o painel flutuante aplicava
   * isso, então fixar no PC não refletia no aparelho.
   */
  const conversasVisiveis = useMemo(() => {
    void versaoPreferencias;
    return aplicarPreferencias(colaboradorAtual.id, conversasIndividuais);
  }, [conversasIndividuais, colaboradorAtual.id, versaoPreferencias]);

  const gruposVisiveis = useMemo(() => {
    void versaoPreferencias;
    return aplicarPreferencias(colaboradorAtual.id, grupos);
  }, [grupos, colaboradorAtual.id, versaoPreferencias]);

  const totalNaoLidas = conversasIndividuais.reduce((soma, c) => soma + (c.naoLidas || 0), 0);

  /**
   * Aba mostrada na área principal do computador.
   *
   * Lá, Conversas e Grupos não são tela — são lista que abre por cima. Então
   * quando a escolha é uma delas, a área principal mostra o painel da rede,
   * que é informação útil, em vez do aviso vazio de "escolha uma conversa".
   */
  const abaDesktop: AbaPrincipal =
    abaAtiva === 'conversas' || abaAtiva === 'grupos'
      ? podeVerRede
        ? 'painel'
        : 'ponto'
      : abaAtiva;

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
              <IndicadorNuvem />
            </div>
            <span className="text-[11px] text-[var(--c-texto-3)] font-medium block -mt-0.5">
              {colaboradorAtual.loja} · {colaboradorAtual.cargo}
            </span>
          </div>
        </div>

        {/* Navegação do computador. No celular ela continua na barra de baixo,
            que é onde o polegar alcança. */}
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {abasNavegacao
            /**
             * No computador, Conversas e Grupos não são tela nem item de
             * menu: vivem no botão do canto inferior direito, junto do chat,
             * que é de onde eles já abriam por cima. Ter os dois no topo era
             * um caminho a mais para a mesma janela.
             *
             * No celular nada muda — lá eles continuam na barra de baixo,
             * que é onde o polegar alcança.
             */
            .filter((aba) => aba.id !== 'admin')
            .filter((aba) => aba.id !== 'conversas' && aba.id !== 'grupos')
            .map((aba) => {
              const ehLista = aba.id === 'conversas' || aba.id === 'grupos';
              const ativa = ehLista
                ? secaoListaAberta === (aba.id === 'grupos' ? 'grupos' : 'individuais')
                : abaAtiva === aba.alvo;

              return (
                <button
                  key={aba.id}
                  type="button"
                  id={`aba-topo-${aba.id}`}
                  onClick={() => {
                    if (ehLista) {
                      const alvo = aba.id === 'grupos' ? 'grupos' : 'individuais';
                      setSecaoListaAberta(secaoListaAberta === alvo ? null : alvo);
                      return;
                    }
                    setSecaoListaAberta(null);
                    if (aba.alvo) setAbaAtiva(aba.alvo);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    ativa
                      ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]'
                  }`}
                >
                  <aba.icone className="w-3.5 h-3.5" />
                  {/* Entre 768 e 1024px o topo fica apertado com logo, abas e
                      perfil: ali ficam só os ícones. */}
                  <span className="hidden lg:inline">{aba.rotulo}</span>
                  {aba.id === 'conversas' && totalNaoLidas > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {totalNaoLidas}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>

        <div className="flex-1" />

        {/* Ações Rápidas do Topo: Painel ADM e Perfil */}
        <div className="flex items-center gap-2">
          {ehAdmin && (
            <button
              type="button"
              id="botao-topo-painel-adm"
              onClick={() => setPainelAdminAberto(true)}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              title="Abrir Painel Administrativo de TI"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Painel ADM</span>
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
        {/* COLUNA ÚNICA DO CELULAR: navegação e listas.
            No computador ela não existe mais. Com a conversa abrindo por cima,
            ela virava um terço da tela ocupado por uma lista consultada só na
            hora de escolher com quem falar — a navegação subiu para o topo e a
            lista virou painel flutuante. */}
        <div
          className={`md:hidden flex-col w-full bg-[var(--c-superficie)] h-full relative ${
            conversaAtiva ? 'hidden' : 'flex'
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
                  {conversasVisiveis.map((c) => (
                    <ItemConversa
                      key={c.id}
                      conversa={c}
                      selecionada={conversaAtivaId === c.id}
                      aoClicar={() => setConversaAtivaId(c.id)}
                      colaboradorId={colaboradorAtual.id}
                      aoMudarPreferencia={() => setVersaoPreferencias((v) => v + 1)}
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
                  {gruposVisiveis.map((g) => (
                    <ItemConversa
                      key={g.id}
                      conversa={g}
                      selecionada={conversaAtivaId === g.id}
                      aoClicar={() => setConversaAtivaId(g.id)}
                      colaboradorId={colaboradorAtual.id}
                      aoMudarPreferencia={() => setVersaoPreferencias((v) => v + 1)}
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
                  aoAbrirConversa={(id) => abrirJanela(id)}
                  aoChamarRadio={(colegaId) => lidarSelecionarColega(colegaId)}
                  aoAlternarParaGestor={() => setPainelAdminAberto(true)}
                />
              </div>
            )}

            {/* ABA 3 (Desktop): Atalhos rápidos das 5 lojas e setores */}
            {abaAtiva === 'painel' && (
              <>
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
                      onClick={() => abrirJanela(g.id)}
                      className={`p-2.5 rounded-lg text-left text-xs font-semibold flex items-center justify-between border transition-all cursor-pointer ${
                        conversaFlutuanteId === g.id
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
              </>
            )}

            {/* PONTO e EU: no celular moram aqui, na coluna única. No
                computador vão para a área principal, que é larga — espremer
                o banco de horas em 340px deixava metade da tela vazia. */}
            {abaAtiva === 'ponto' && (
              <div className="block md:hidden h-full">
                <AbaPonto colaboradorAtual={colaboradorAtual} />
              </div>
            )}

            {abaAtiva === 'eu' && (
              <div className="block md:hidden h-full">
                <AbaEu
                  colaboradorAtual={colaboradorAtual}
                  aoTrocarColaborador={lidarTrocarColaborador}
                  aoSair={lidarDeslogar}
                  aoAbrirAdmin={() => setPainelAdminAberto(true)}
                />
              </div>
            )}

            {/* Com o ponto e o "eu" ocupando a área principal no computador,
                esta coluna serviria de nada. Ela passa a dar acesso ao chat. */}
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
            {abasNavegacao.map((aba) => {
              const selecionada = !!aba.alvo && abaAtiva === aba.alvo;

              return (
                <button
                  key={aba.id}
                  type="button"
                  id={`aba-navegacao-${aba.id}`}
                  onClick={() => {
                    if (aba.acao) {
                      aba.acao();
                      return;
                    }
                    if (aba.alvo) {
                      setAbaAtiva(aba.alvo);
                      // Abas de painel não convivem com uma conversa aberta
                      if (aba.alvo === 'ponto' || aba.alvo === 'painel') {
                        setConversaAtivaId(null);
                      }
                    }
                  }}
                  className={`flex-1 min-w-0 h-full flex flex-col items-center justify-center gap-1 transition-colors relative ${
                    aba.classeFixa
                      ? aba.classeFixa
                      : selecionada
                      ? 'text-[var(--c-acento)] font-semibold'
                      : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
                  }`}
                >
                  <aba.icone className="w-5 h-5" />
                  <span className="text-[11px] leading-none max-w-full truncate px-0.5">
                    {aba.rotulo}
                  </span>
                  {aba.exibeAviso && avisoNaoLido && (
                    <span className="absolute top-2 right-1/4 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--c-superficie)]" />
                  )}
                </button>
              );
            })}
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
          ) : abaDesktop === 'painel' ? (
            <div className="w-full h-full flex flex-col bg-[var(--c-canvas)] overflow-hidden">
              <PainelRede
                colaboradorAtual={colaboradorAtual}
                aoAbrirConversa={(id) => abrirJanela(id)}
                aoChamarRadio={(colegaId) => lidarSelecionarColega(colegaId)}
                aoAlternarParaGestor={() => setPainelAdminAberto(true)}
              />
            </div>
          ) : abaDesktop === 'ponto' ? (
            <div className="w-full max-w-[900px] h-full flex flex-col bg-[var(--c-canvas)] overflow-hidden">
              <AbaPonto colaboradorAtual={colaboradorAtual} />
            </div>
          ) : abaDesktop === 'eu' ? (
            <div className="w-full max-w-[900px] h-full flex flex-col bg-[var(--c-canvas)] overflow-hidden">
              <AbaEu
                colaboradorAtual={colaboradorAtual}
                aoTrocarColaborador={lidarTrocarColaborador}
                aoSair={lidarDeslogar}
                aoAbrirAdmin={() => setPainelAdminAberto(true)}
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

      {/* O acesso às conversas no computador: um botão só, no canto de
          baixo à direita, onde a janela do chat já abre. Some quando a
          lista está aberta, para não ficar um botão em cima do painel. */}
      {!secaoListaAberta && (
        <button
          type="button"
          id="botao-abrir-conversas"
          onClick={() => setSecaoListaAberta('individuais')}
          title="Conversas e grupos"
          className="hidden md:flex fixed bottom-6 right-6 z-40 items-center gap-2 px-4 py-3 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Conversas</span>
          {totalNaoLidas > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center">
              {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
            </span>
          )}
        </button>
      )}

      {/* Lista de conversas por cima, no lugar da antiga coluna fixa */}
      {secaoListaAberta && (
        <PainelConversas
          secaoInicial={secaoListaAberta}
          conversas={conversasIndividuais}
          grupos={grupos}
          conversaAbertaId={conversaFlutuanteId}
          colaboradorId={colaboradorAtual.id}
          podeCriarGrupo={ehAdmin}
          aoAbrir={(id) => abrirJanela(id)}
          aoNovaConversa={() => setModalNovaConversaAberto(true)}
          aoNovoGrupo={() => setModalCriarGrupoAberto(true)}
          aoFechar={() => setSecaoListaAberta(null)}
        />
      )}

      {/* As conversas por cima do que estiver aberto — quem pediu o chat de
          dentro do RH não perde a consulta que estava fazendo. No computador
          elas ficam lado a lado; no celular só a da frente aparece, porque
          empilhar telas cheias esconderia umas às outras sem aviso. */}
      {posicoesDasJanelas.map((janela, indice) => {
        const conversa = bancoDados.obterConversaPorId(janela.id);
        if (!conversa) return null;

        return (
          <JanelaChat
            key={janela.id}
            conversa={conversa}
            colaboradorAtual={colaboradorAtual}
            direita={janela.direita}
            encolhida={janela.encolhida}
            visivelNoCelular={indice === posicoesDasJanelas.length - 1}
            aoAlternarEncolher={() => alternarEncolhida(janela.id)}
            aoFechar={() => fecharJanela(janela.id)}
          />
        );
      })}
    </div>
  );
}
