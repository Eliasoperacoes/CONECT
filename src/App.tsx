/**
 * CONECTA — Comunicador Interno da Malachias Autopeças
 * Estrutura: 3 abas (Conversas | Grupos | Eu), mensagens com voz gravada,
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
  Building2,
  LogOut,
  Clock,
  ClipboardList,
} from 'lucide-react';
import { AbaPrincipal, Colaborador, Conversa, Mensagem } from './tipos';

/**
 * As medidas das janelas de conversa, num lugar só.
 *
 * Estavam soltas dentro do cálculo de posição, e havia uma segunda medida
 * para a janela encolhida que não batia com a largura desenhada na tela —
 * foi o que embaralhou a fila de conversas minimizadas. Agora a encolhida
 * não tem medida aqui: quem a enfileira é a barra, com largura própria.
 */
/** Onde a primeira janela começa: depois do painel de contatos. */
const INICIO_DAS_JANELAS = 372;
const LARGURA_JANELA_ABERTA = 420;
const ESPACO_ENTRE_JANELAS = 12;

/**
 * Quantas conversas ficam ABERTAS lado a lado.
 *
 * Três de 420px já enchem a largura útil de um monitor comum ao lado do
 * painel de contatos. A quarta não é recusada nem descartada: a mais antiga
 * encolhe e desce para a barra, onde continua a um clique.
 */
const MAXIMO_JANELAS_ABERTAS = 3;
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
import { ConversasEmEspera } from './componentes/ConversasEmEspera';
import { FaixaDeTeste } from './componentes/FaixaDeTeste';
import { PainelConversas } from './componentes/PainelConversas';
import { podeUsar } from './servicos/permissoes';
import {
  aplicarPreferencias,
  assinarPreferencias,
  reexibirConversa,
} from './servicos/preferenciasConversa';
import {
  pendenciasParaDecidir as pendenciasDeAusencia,
  pendenciasDeFolga,
  assinarJustificativas,
} from './servicos/justificativas';
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
  /** O código do cartaz de ponto, quando a pessoa chegou por ele. */
  const [codigoDoCartaz, setCodigoDoCartaz] = useState<string | null>(null);
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
  /**
   * Abre a conversa NO PRIMEIRO LUGAR, ao lado do painel de contatos.
   *
   * É onde o olho vai: quem acaba de escolher uma conversa quer vê-la, não
   * procurá-la na ponta esquerda de uma fileira. Antes ela entrava no fim, e
   * escolher da lista abria a conversa no canto mais distante da tela.
   *
   * Três lugares abertos, e só. O que passa disso ENCOLHE — nunca fecha. A
   * conversa continua a um clique no botão de espera, em vez de sumir sem
   * aviso como sumia antes.
   */
  const abrirJanela = (id: string) => {
    /**
     * ABRIR É O PEDIDO DE TRAZER DE VOLTA.
     *
     * Conversa excluída sai da lista e não volta sozinha — nem com mensagem
     * nova. A única coisa que a traz de volta é a pessoa chamar o colega
     * outra vez, e é exatamente isto aqui.
     *
     * Vale para qualquer abertura, e é de propósito: uma conversa que já
     * está na lista não muda nada com isso, e assim não há um segundo lugar
     * decidindo quando a remoção acaba.
     */
    reexibirConversa(colaboradorAtual.id, id);

    setJanelas((atuais) => {
      const outras = atuais.filter((j) => j.id !== id);
      let abertas = 0;

      return [{ id, encolhida: false }, ...outras].map((j) => {
        if (j.encolhida) return j;
        abertas += 1;
        return abertas <= MAXIMO_JANELAS_ABERTAS ? j : { ...j, encolhida: true };
      });
    });
  };

  /** A mesma abertura do computador, para a tela cheia do celular. */
  const abrirConversaEmTelaCheia = (id: string) => {
    reexibirConversa(colaboradorAtual.id, id);
    setConversaAtivaId(id);
  };

  const fecharJanela = (id: string) =>
    setJanelas((atuais) => atuais.filter((j) => j.id !== id));

  /**
   * O TOQUE NO AVISO ABRE A CONVERSA DO AVISO.
   *
   * O aviso dizia "Fabio: chegou a peça", a pessoa tocava, e o CONECTA só
   * vinha para a frente na tela em que estivesse — lista, ponto, onde fosse.
   * Ela tinha de achar a conversa na mão, depois de já ter tocado no aviso
   * daquela conversa. No celular, que é onde o aviso chega, isso é o
   * caminho inteiro de novo.
   *
   * Dois caminhos até aqui, porque o celular tem os dois casos:
   *
   *  - o sistema já estava aberto: o trabalhador manda um recado com a
   *    conversa e a janela abre;
   *  - o sistema estava fechado: ele abre com a conversa no endereço, que é
   *    lido uma vez e apagado da barra — senão recarregar a página
   *    reabriria a mesma conversa para sempre.
   */
  useEffect(() => {
    const abrirSeExistir = (id: string) => {
      // O aviso de jornadas usa um id que não é conversa nenhuma. Abrir uma
      // janela vazia seria pior do que não abrir nada.
      if (!id || !bancoDados.obterConversaPorId(id)) return;
      abrirJanela(id);
    };

    const aoReceberDoTrabalhador = (evento: MessageEvent) => {
      if (evento.data?.tipo !== 'conecta:abrir-conversa') return;
      abrirSeExistir(String(evento.data.conversaId || ''));
    };

    navigator.serviceWorker?.addEventListener('message', aoReceberDoTrabalhador);

    try {
      const endereco = new URL(window.location.href);
      const pedida = endereco.searchParams.get('conversa');
      if (pedida) {
        endereco.searchParams.delete('conversa');
        window.history.replaceState({}, '', endereco.toString());
        abrirSeExistir(pedida);
      }

      /**
       * CHEGOU PELO CARTAZ DE PONTO.
       *
       * O QR da loja é o endereço do sistema com o código embutido. A
       * câmera do celular abre o aplicativo instalado — onde a pessoa já
       * está conectada — e é aqui que o código é recolhido para a aba de
       * ponto abrir com a batida pronta.
       *
       * Sai da barra de endereços na mesma hora: recarregar a página com o
       * código ainda lá bateria o ponto de novo.
       */
      const doCartaz = endereco.searchParams.get('ponto');
      if (doCartaz) {
        endereco.searchParams.delete('ponto');
        window.history.replaceState({}, '', endereco.toString());
        setCodigoDoCartaz(doCartaz);
        setAbaAtiva('ponto');
      }
    } catch {
      // Endereço estranho: não vale derrubar a abertura do sistema por isso
    }

    return () =>
      navigator.serviceWorker?.removeEventListener('message', aoReceberDoTrabalhador);
  }, []);

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
    let direita = INICIO_DAS_JANELAS;
    return janelas
      .filter((j) => !j.encolhida)
      .map((j) => {
        const minha = direita;
        direita += LARGURA_JANELA_ABERTA + ESPACO_ENTRE_JANELAS;
        return { ...j, direita: minha };
      });
  }, [janelas]);

  /**
   * As encolhidas, na ordem em que foram encolhidas.
   *
   * Elas NÃO entram na conta acima. Antes entravam, e era essa a causa da
   * bagunça na tela: o App somava 210px por barra encolhida, enquanto a
   * barra desenhada crescia com o nome de quem estava do outro lado — umas
   * caíam por cima das outras e sobrava vão no fim.
   *
   * Agora elas nem são desenhadas uma a uma: viram uma contagem só, num
   * botão fixo no canto. Ninguém calcula posição de conversa encolhida, em
   * nenhum lugar — e sem conta não há duas contas para discordarem.
   */
  const conversasEncolhidas = useMemo(
    () =>
      janelas
        .filter((j) => j.encolhida)
        .map((j) => bancoDados.obterConversaPorId(j.id))
        .filter((c): c is Conversa => !!c),
    [janelas]
  );

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
   * CIÊNCIA AUTOMÁTICA DA FILA.
   *
   * O gestor precisa saber que chegou decisão para ele SEM abrir a fila.
   * Antes só o número na aba dizia, e quem não abrisse o painel não ficava
   * sabendo — a hora do colaborador parava lá sem ninguém perceber.
   *
   * Avisa só quando a fila CRESCE: notificar a cada sincronização, com o
   * mesmo total de sempre, viraria ruído e a pessoa desligaria o aviso.
   */
  const refPendenciasVistas = useRef<number | null>(null);
  useEffect(() => {
    const conferir = () => {
      if (!bancoDados.estaAutenticado()) return;
      const total =
        servicoPonto.obterPendenciasParaDecidir().length +
        pendenciasDeAusencia().length +
        pendenciasDeFolga().length;
      const antes = refPendenciasVistas.current;
      refPendenciasVistas.current = total;

      /**
       * A PRIMEIRA PASSADA TAMBÉM AVISA, quando há o que decidir.
       *
       * Ela ficava calada de propósito, para não dar susto com coisa
       * antiga. Só que o efeito prático era outro: quem abria o sistema de
       * manhã com cinco jornadas paradas não era avisado de nenhuma — o
       * aviso só existia para quem já estava com a tela aberta quando a
       * sexta chegasse. Na prática, ninguém.
       *
       * Uma vez na abertura, e depois só quando aumenta. É o mínimo para o
       * responsável saber que há algo esperando por ele, e pouco o bastante
       * para não virar barulho.
       */
      const primeiraPassada = antes === null;
      if (primeiraPassada && total === 0) return;
      if (!primeiraPassada && total <= antes) return;

      const novas = primeiraPassada ? total : total - antes;
      mostrarAvisoDeMensagem({
        titulo:
          novas === 1
            ? 'Uma jornada aguarda sua decisão'
            : `${novas} jornadas aguardam você`,
        corpo: 'Abra Equipe & Ponto e decida em Aprovar jornadas.',
        conversaId: 'fila-de-aprovacao',
      });
      tocarAvisoDeMensagem();
    };

    conferir();
    const cancelar = servicoPonto.assinarAlteracoes(conferir);
    const cancelarAusencias = assinarJustificativas(conferir);
    return () => {
      cancelar();
      cancelarAusencias();
    };
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

        /**
         * A REGRA DE GUARDA DO HISTÓRICO roda aqui, em segundo plano.
         *
         * Apaga a mensagem inteira — texto, foto, recado de voz e documento
         * — passado o prazo das configurações (2 meses por padrão). Ponto,
         * cadastros e banco de horas não são tocados nunca.
         *
         * É a única sessão com direito de limpar, e no máximo uma vez por
         * dia: a marca da última execução fica nas configurações da REDE,
         * não no aparelho, senão cada computador rodaria a sua. Esperar por
         * ela seria segurar a abertura do sistema por manutenção.
         */
        bancoDados.aplicarRegraDeLimpeza().catch(() => {});

        /**
         * O DIA INCOMPLETO PRECISA EXISTIR ANTES DE ALGUÉM PROCURAR POR ELE.
         *
         * Este levantamento só rodava DENTRO da aba "Aprovar jornadas". Ou
         * seja: a pendência só nascia se o responsável abrisse exatamente a
         * tela que a lista — e o aviso que deveria chamá-lo até lá depende
         * dela existir. Um esperava o outro, e nenhum acontecia.
         *
         * Aqui ele roda na abertura, para quem tem gente sob a
         * responsabilidade. A tela continua levantando também: quem abre a
         * fila quer o quadro do momento, não o de quando o sistema abriu.
         */
        servicoPonto.levantarDiasIncompletos().catch(() => {});
      }
      setVerificandoSessao(false);
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  /**
   * As listas passando pelas mesmas preferências nos dois lados: fixadas no
   * topo, ocultas fora.
   *
   * FICA AQUI, ANTES DOS `return` DE BAIXO, e não junto de onde é usado.
   * React conta os hooks a cada render e exige o mesmo número sempre; um
   * `useMemo` depois de um `return` condicional roda uma vez e não roda na
   * outra, e o React derruba a aplicação inteira — tela branca, sem nada no
   * lugar. Foi o que aconteceu: eu declarei os dois no meio do JSX.
   */
  const conversasVisiveis = useMemo(() => {
    void versaoPreferencias;
    return aplicarPreferencias(colaboradorAtual.id, conversasIndividuais);
  }, [conversasIndividuais, colaboradorAtual.id, versaoPreferencias]);

  const gruposVisiveis = useMemo(() => {
    void versaoPreferencias;
    return aplicarPreferencias(colaboradorAtual.id, grupos);
  }, [grupos, colaboradorAtual.id, versaoPreferencias]);

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
  // Toda conversa aberta a partir de um atalho (nova conversa, quadro, RH)
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

      {/*
        A FAIXA DE TESTE, ligada pelo painel ADM.
        
        "Avisar" abre a conversa com quem cuida do sistema. Aviso sem
        caminho de volta é só um aviso: a pessoa lê, concorda, e não sabe
        para onde levar o defeito que acabou de encontrar.
      */}
      {bancoDados.obterConfiguracoes().emPeriodoDeTeste && (
        <FaixaDeTeste
          aoAvisarProblema={() => {
            const cuidador = bancoDados
              .obterColaboradores()
              .find((c) => c.nivel >= NIVEL_TI && c.id !== colaboradorAtual.id);
            if (cuidador) lidarSelecionarColega(cuidador.id);
          }}
        />
      )}

      {/* Topo Geral da Aplicação Principal */}
      <header className="px-4 py-2.5 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs">
            <MessageSquare className="w-4 h-4" />
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
                      aoClicar={() => abrirConversaEmTelaCheia(c.id)}
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
                      aoClicar={() => abrirConversaEmTelaCheia(g.id)}
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
                  aoConversarCom={(colegaId) => lidarSelecionarColega(colegaId)}
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
                <AbaPonto
                  colaboradorAtual={colaboradorAtual}
                  codigoDoEndereco={codigoDoCartaz}
                  aoConsumirCodigo={() => setCodigoDoCartaz(null)}
                />
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
                aoConversarCom={(colegaId) => lidarSelecionarColega(colegaId)}
                aoAlternarParaGestor={() => setPainelAdminAberto(true)}
              />
            </div>
          ) : abaDesktop === 'ponto' ? (
            <div className="w-full max-w-[900px] h-full flex flex-col bg-[var(--c-canvas)] overflow-hidden">
              <AbaPonto
                  colaboradorAtual={colaboradorAtual}
                  codigoDoEndereco={codigoDoCartaz}
                  aoConsumirCodigo={() => setCodigoDoCartaz(null)}
                />
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
                Comunicação em tempo real e gestão integrada das 5 filiais da rede.
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
      {/*
        Tudo que não coube nos três lugares abertos, num botão só no canto.
        Nada se espalha para a esquerda porque não há nada para espalhar.
      */}
      <ConversasEmEspera
        conversas={conversasEncolhidas}
        aoAbrir={(id) => abrirJanela(id)}
        aoFechar={(id) => fecharJanela(id)}
      />

      {posicoesDasJanelas.map((janela, indice) => {
        const conversa = bancoDados.obterConversaPorId(janela.id);
        if (!conversa) return null;

        return (
          <JanelaChat
            key={janela.id}
            conversa={conversa}
            colaboradorAtual={colaboradorAtual}
            direita={janela.direita}
            visivelNoCelular={indice === posicoesDasJanelas.length - 1}
            aoEncolher={() => alternarEncolhida(janela.id)}
            aoFechar={() => fecharJanela(janela.id)}
          />
        );
      })}
    </div>
  );
}
