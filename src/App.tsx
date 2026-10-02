/**
 * CONECTA — Comunicador Interno da Malachias Autopeças
 * Estrutura: 3 abas (Conversas | Grupos | Eu), mensagens com voz gravada,
 * hierarquia Setor x Loja x Nível e responsividade rigorosa (360px até 1920px).
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Megaphone,
  ChevronUp,
  ChevronDown,
  Search,
  X,
} from 'lucide-react';
import { ABAS_PRINCIPAIS, AbaPrincipal, Colaborador, Conversa, Mensagem } from './tipos';

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
import { manterSeIgual } from './servicos/igualdade';
import { ehTelaDeCelular } from './servicos/tela';
import {
  ondeParei,
  lembrarOndeParei,
  esquecerOndeParei,
} from './servicos/navegacaoLembrada';
import { ItemConversa } from './componentes/ItemConversa';
import { ResultadosDaBusca } from './componentes/ResultadosDaBusca';
import { FaixaAvisoDirecao } from './componentes/FaixaAvisoDirecao';
import { TelaConversa } from './componentes/TelaConversa';
import { ConviteAvisos } from './componentes/ConviteAvisos';
import { VisorDeDocumento } from './componentes/VisorDeDocumento';
import { TituloDaPagina } from './componentes/TituloDaPagina';
import { AbaEu } from './componentes/AbaEu';
import { PainelRede } from './componentes/PainelRede';
import { CentralAvisos } from './componentes/CentralAvisos';
import {
  idsDasPendenciasParaMim,
  type DestinoNotificacao,
  type SecaoDestino,
} from './servicos/centralDeNotificacoes';
import { pedirFolhaDoMeuRH } from './servicos/folhaPedida';
import { ModalNovaConversa } from './componentes/ModalNovaConversa';
import { ModalCriarGrupo } from './componentes/ModalCriarGrupo';
import { IndicadorOffline } from './componentes/IndicadorOffline';
import { vigiarVersao } from './servicos/versao';
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
import { assinarJustificativas } from './servicos/justificativas';
import { servicoPonto } from './servicos/ponto';
import { vigiarRelogio } from './servicos/relogio';
import { usandoNuvem } from './servicos/supabase';
import { nuvem } from './servicos/nuvem';
import { ligarAvisoNativo, desligarAvisoNativo } from './servicos/pushNativo';
import { encerrarEspera } from './servicos/telaDeEspera';
import {
  acompanharTemaNasBarras,
  ligarBotaoVoltar,
  ouvirEnderecosDoAplicativo,
} from './servicos/aplicativo';
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
  /** Quantas coisas esperam a pessoa nesta aba. */
  contador?: number;
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
  /** Saiu publicação nova enquanto esta aba estava aberta. */
  const [saiuVersaoNova, setSaiuVersaoNova] = useState(false);
  const [painelAdminAberto, setPainelAdminAberto] = useState<boolean>(false);
  /**
   * A aba começa onde a pessoa parou, e não na inicial.
   *
   * Atualizar a página é rotina aqui: o navegador da loja recarrega
   * sozinho, e quem está no meio de uma lista de vinte espelhos de ponto
   * voltava para Conversas e recomeçava a navegação.
   *
   * Lido uma vez, na montagem — função dentro do `useState` para não ler
   * `localStorage` a cada desenho da tela. Permissão não entra aqui:
   * quem filtra é `abaAtiva`, lá embaixo, porque a escolha guardada pode
   * ser de uma aba que a pessoa perdeu desde ontem.
   */
  const [abaAtivaEscolhida, setAbaAtiva] = useState<AbaPrincipal>(() =>
    ondeParei(
      bancoDados.obterColaboradorAtual()?.id || '',
      'aba-principal',
      ABAS_PRINCIPAIS,
      'conversas'
    )
  );

  /**
   * A seção que o sino pediu, esperando o painel montar.
   *
   * Precisa de estado porque a troca de aba e a escolha da sub-aba
   * acontecem em desenhos diferentes: quando o toque ocorre, o
   * `PainelRede` sequer está na tela para receber o recado.
   *
   * Volta a `null` assim que o destino é alcançado — alvo que não se
   * limpa reabre a mesma aba a cada desenho e prende a pessoa nela.
   */
  const [secaoAlvo, setSecaoAlvo] = useState<SecaoDestino | null>(null);

  /**
   * Estável de propósito.
   *
   * Esta função entra na lista de dependências dos efeitos que levam ao
   * destino, lá embaixo. Escrita solta no JSX, ela nasceria diferente a
   * cada desenho da tela e faria os efeitos correrem de novo sem que
   * nada tivesse mudado — inclusive reabrindo a aba por cima da escolha
   * de quem estava navegando.
   */
  const consumirSecaoAlvo = useCallback(() => setSecaoAlvo(null), []);
  /** O código do cartaz de ponto, quando a pessoa chegou por ele. */
  const [codigoDoCartaz, setCodigoDoCartaz] = useState<string | null>(null);
  /**
   * A aba que o endereço pediu (atalho do ícone, cartaz de ponto).
   *
   * A sessão do banco é conferida DEPOIS de o endereço ser lido, e ao
   * terminar restaura a última aba usada. Sem guardar o pedido, a
   * restauração passava por cima dele. Ref, e não estado: é recado para
   * a restauração, não coisa a desenhar.
   */
  const abaPedidaNaEntrada = useRef<AbaPrincipal | null>(null);
  /* "Bater ponto" pedido pelo atalho do ícone; a aba de ponto o consome,
     como consome o código do cartaz, para não abrir duas vezes */
  const [pedidoDeBater, setPedidoDeBater] = useState(false);

  /**
   * A publicação que o botão do chat pediu para abrir.
   *
   * Mesmo padrão do código do cartaz: a Central consome e limpa. Sem
   * limpar, ela reabriria a mesma publicação a cada desenho.
   */
  const [publicacaoAAbrir, setPublicacaoAAbrir] = useState<string | null>(null);

  /** Troca para a Central e manda abrir a publicação. */
  const abrirPublicacao = useCallback((publicacaoId: string) => {
    setPublicacaoAAbrir(publicacaoId);
    setAbaAtiva('central');
    setConversaAtivaId(null);
  }, []);
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

  /**
   * OS GRUPOS RECOLHEM, e nascem recolhidos.
   *
   * Eles entraram na lista de conversas, e numa loja com cinco canais
   * mais o de avisos isso empurraria as conversas de gente para fora
   * da primeira tela — que é o oposto do que se quis ao juntar as
   * duas listas.
   */
  const [gruposAbertos, setGruposAbertos] = useState(false);

  /** O que o cabeçalho diz RECOLHIDO: é o número que faz abrir. */
  const naoLidasDosGrupos = grupos.reduce((soma, g) => soma + (g.naoLidas || 0), 0);


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
     * NO CELULAR NÃO HÁ JANELA: A CONVERSA ABRE EM TELA CHEIA.
     *
     * A janela flutuante é do computador. No celular ela também ocupava a
     * tela inteira, mas por fora do caminho da lista — e o voltar do
     * Android só conhece a conversa aberta pela lista. Aberta pelo aviso,
     * pelo sino, por "Nova conversa" ou pelo Painel, o primeiro voltar
     * fechava a conversa ESCONDIDA embaixo (nada mudava na tela) e o
     * segundo minimizava o aplicativo. Relatado pelo Elias como "voltar
     * fantasma". Um caminho só no celular, e o voltar sempre sabe o que
     * está na frente.
     */
    if (ehTelaDeCelular()) {
      abrirConversaEmTelaCheia(id);
      return;
    }

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

    /**
     * Lê o que veio no endereço. Serve à barra do navegador e aos atalhos
     * do ícone no Android (`ouvirEnderecosDoAplicativo`) — os dois falam
     * `?atalho=`, e um só trecho os interpreta.
     *
     * `daBarra`: só o endereço da barra precisa ser limpo. O do atalho
     * nativo nunca esteve nela.
     */
    const lerEndereco = (endereco: URL, daBarra: boolean) => {
      const tirar = (chave: string) => {
        endereco.searchParams.delete(chave);
        if (daBarra) window.history.replaceState({}, '', endereco.toString());
      };

      const pedida = endereco.searchParams.get('conversa');
      if (pedida) {
        tirar('conversa');
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
        tirar('ponto');
        setCodigoDoCartaz(doCartaz);
        setAbaAtiva('ponto');
        abaPedidaNaEntrada.current = 'ponto';
      }

      /**
       * CHEGOU PELO ATALHO DO ÍCONE.
       *
       * No celular, segurar o ícone do aplicativo abre os atalhos que o
       * manifesto declara — "Bater ponto" e "Conversas". Eles chegam
       * aqui como `?atalho=`, e sem este trecho abririam o sistema na
       * última aba usada, como um toque comum: o atalho seria enfeite.
       *
       * Sai da barra de endereços junto, senão a aba lembrada perderia
       * para ele a cada recarga.
       */
      const atalho = endereco.searchParams.get('atalho');
      if (atalho && (ABAS_PRINCIPAIS as readonly string[]).includes(atalho)) {
        tirar('atalho');
        setAbaAtiva(atalho as AbaPrincipal);
        abaPedidaNaEntrada.current = atalho as AbaPrincipal;
        /* "Bater ponto" abre a batida com a câmera pronta, e não só a
           aba: quem segura o ícone e escolhe o atalho quer bater */
        if (atalho === 'ponto') setPedidoDeBater(true);
      }
    };

    try {
      lerEndereco(new URL(window.location.href), true);
    } catch {
      // Endereço estranho: não vale derrubar a abertura do sistema por isso
    }

    const pararDeOuvir = ouvirEnderecosDoAplicativo((endereco) => lerEndereco(endereco, false));

    return () => {
      navigator.serviceWorker?.removeEventListener('message', aoReceberDoTrabalhador);
      pararDeOuvir();
    };
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
        // Da lista viva primeiro: é ela que traz as não lidas de agora. Só
        // pela janela, o número parava no instante em que ela encolheu.
        .map(
          (j) =>
            conversasIndividuais.find((c) => c.id === j.id) ||
            grupos.find((c) => c.id === j.id) ||
            bancoDados.obterConversaPorId(j.id)
        )
        .filter((c): c is Conversa => !!c),
    [janelas, conversasIndividuais, grupos]
  );

  // Qual seção da lista flutuante está aberta no computador (nenhuma = fechada)
  const [secaoListaAberta, setSecaoListaAberta] = useState<'individuais' | 'grupos' | null>(null);

  /**
   * Muda quando alguém fixa ou oculta uma conversa. As preferências vivem
   * fora do React (armazenamento do aparelho), então a lista precisa de um
   * empurrão para se redesenhar.
   */
  const [versaoPreferencias, setVersaoPreferencias] = useState(0);
  /**
   * A BUSCA DA LISTA DE CONVERSAS (estilo WhatsApp) e a mensagem a abrir.
   * Fica no App porque sobrevive a abrir e voltar da conversa: quem
   * procura algo costuma conferir mais de um resultado.
   */
  const [buscaConversas, setBuscaConversas] = useState('');
  const [mensagemAlvo, setMensagemAlvo] = useState<{ conversaId: string; mensagemId: string } | null>(null);

  /**
   * QUANTAS PUBLICAÇÕES AINDA NÃO LI.
   *
   * É o número na aba Central. Sem ele, a publicação chega e a pessoa
   * só descobre se abrir a aba por conta própria — e um comunicado
   * que depende disso não é comunicado, é arquivo.
   *
   * Conta o que ME ALCANÇA e eu não li: a lista já vem filtrada por
   * destino, e a leitura é a mesma marca que a Central usa.
   */
  const publicacoesNaoLidas = useMemo(() => {
    void versaoPreferencias;
    if (!autenticado) return 0;
    return bancoDados
      .obterAvisosVisiveisParaUsuarioAtual()
      .filter((p) => !(p.lidoPorIds || []).includes(colaboradorAtual.id))
      .length;
  }, [autenticado, colaboradorAtual.id, conversasIndividuais, versaoPreferencias]);
  const [avisoNaoLido, setAvisoNaoLido] = useState<Mensagem | null>(null);

  // Modais acionados pelo botão '+'
  const [modalNovaConversaAberto, setModalNovaConversaAberto] = useState(false);
  const [modalCriarGrupoAberto, setModalCriarGrupoAberto] = useState(false);

  /**
   * A TELA É DE QUEM ENTROU.
   *
   * O Elias saiu de uma conta, entrou em outra no mesmo navegador, e a
   * janela de conversa da primeira continuou aberta — o nome do colega à
   * vista, as mensagens não (o banco não as entrega a quem não participa).
   * As janelas vivem na memória da tela, e nem o sair nem o entrar as
   * limpavam.
   *
   * Tudo o que é da pessoa, e não do aparelho, sai aqui: as conversas
   * abertas, a lista, a busca, o que ia ser aberto.
   */
  const limparTelaDaSessao = () => {
    setJanelas([]);
    setConversaAtivaId(null);
    setSecaoListaAberta(null);
    setBuscaConversas('');
    setMensagemAlvo(null);
    setPublicacaoAAbrir(null);
    setSecaoAlvo(null);
    setPainelAdminAberto(false);
    setModalNovaConversaAberto(false);
    setModalCriarGrupoAberto(false);
  };

  // Trocou a pessoa (outra conta, ou a sessão restaurada era de outra):
  // o que estava aberto era da anterior. A primeira vez não conta — o
  // endereço de uma notificação pode ter acabado de abrir uma conversa.
  const refPessoaDaTela = useRef(colaboradorAtual.id);
  useEffect(() => {
    if (refPessoaDaTela.current === colaboradorAtual.id) return;
    refPessoaDaTela.current = colaboradorAtual.id;
    limparTelaDaSessao();
  }, [colaboradorAtual.id]);

  /**
   * Carrega e sincroniza dados — SÓ TROCANDO O QUE MUDOU DE VERDADE.
   *
   * Isto roda a cada notificação do banco, e são 34 lugares que
   * notificam: presença, mensagem que chega, sincronização da nuvem.
   *
   * O problema é que `obterColaboradores()` lê do `localStorage` com
   * `JSON.parse` e ainda faz `.map(c => ({ ...c }))` — devolve objetos
   * NOVOS toda vez, mesmo sem um byte ter mudado. React compara por
   * identidade, então a aplicação inteira redesenhava sozinha várias
   * vezes por minuto.
   *
   * O sintoma não parecia isso: "o clique não pega de primeira" nas
   * abas de dentro. O navegador só emite `click` quando o `mousedown` e
   * o `mouseup` caem no MESMO elemento — se o redesenho acontece entre
   * os dois, o clique não existe.
   */
  const recarregarDados = () => {
    setColaboradorAtual((anterior) =>
      manterSeIgual(anterior, bancoDados.obterColaboradorAtual())
    );
    // No modo rede a sessão do banco é a fonte da verdade
    if (!usandoNuvem()) setAutenticado(bancoDados.estaAutenticado());

    setConversasIndividuais((anterior) =>
      manterSeIgual(anterior, bancoDados.obterConversasIndividuais())
    );
    setGrupos((anterior) => manterSeIgual(anterior, bancoDados.obterGrupos()));
    setAvisoNaoLido((anterior) =>
      manterSeIgual(anterior, bancoDados.obterAvisoDirecaoNaoLido())
    );
  };

  useEffect(() => {
    recarregarDados();
    const cancelar = bancoDados.assinarAlteracoes(recarregarDados);
    return () => cancelar();
  }, []);

  /**
   * Avisa quando sai versão nova.
   *
   * A aba que já estava aberta na hora da publicação continua com o pacote
   * velho — e sem isto ninguém tinha como saber. "Atualizei e não
   * apareceu" nasceu daí.
   *
   * Não recarrega sozinho: apagaria a mensagem pela metade de quem está
   * digitando. Avisa, e quem decide é a pessoa.
   */
  useEffect(() => vigiarVersao(() => setSaiuVersaoNova(true)), []);

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
  /**
   * ===============================================================
   * O AVISO NATIVO LIGA DEPOIS DO LOGIN, e não antes.
   * ===============================================================
   *
   * Antes do login não há a quem entregar — o endereço do aparelho é
   * guardado NO NOME de alguém, e sem alguém a linha não existe.
   *
   * E pedir permissão de notificação na tela de senha é o tipo de coisa
   * que faz a pessoa negar por reflexo. No Android, negado é negado: o
   * aplicativo não pode perguntar de novo, e a partir dali só se
   * conserta nos Ajustes do aparelho.
   *
   * NO NAVEGADOR ISTO NÃO FAZ NADA. `ligarAvisoNativo` sai pela porta
   * quando não há casca nativa — e hoje todo mundo está no navegador.
   */
  /* Recebe `irParaNotificacao` lá embaixo, depois que ela existe. O hook
     fica aqui porque abaixo há `return` condicional (tela de login) */
  const irParaRef = useRef<(destino: DestinoNotificacao) => void>(() => {});

  /**
   * O VOLTAR DO ANDROID, quando nenhum modal está aberto.
   *
   * Os modais se fecham sozinhos pela pilha (`useVoltar`). Aqui fica o
   * que é do App: a conversa aberta fecha; fora das Conversas, volta para
   * elas; nas Conversas já, devolve falso e o aparelho minimiza.
   *
   * Pela referência, e não pelo estado direto: o ouvinte é ligado uma
   * vez só, e leria para sempre a conversa e a aba do primeiro render.
   */
  /* As barras do Android na cor do tema do CONECTA (aplicativo.ts) */
  useEffect(() => acompanharTemaNasBarras(), []);

  const estadoParaVoltar = useRef({ conversaAtivaId, abaAtivaEscolhida });
  estadoParaVoltar.current = { conversaAtivaId, abaAtivaEscolhida };
  useEffect(
    () =>
      ligarBotaoVoltar(() => {
        const { conversaAtivaId: aberta, abaAtivaEscolhida: aba } = estadoParaVoltar.current;
        if (aberta) {
          setConversaAtivaId(null);
          return true;
        }
        if (aba !== 'conversas') {
          setAbaAtiva('conversas');
          return true;
        }
        return false;
      }),
    []
  );
  useEffect(() => {
    if (!autenticado) return;

    /* `irParaRef` e não `irParaNotificacao` direto: a função é recriada a
       cada render, e o ouvinte do plugin ficaria preso à primeira */
    ligarAvisoNativo((destino) => irParaRef.current(destino)).then((res) => {
      if (!res.ligado && res.motivo) console.info('Aviso nativo:', res.motivo);
    });
  }, [autenticado, colaboradorAtual.id]);

  /**
   * AS PENDÊNCIAS JÁ AVISADAS, por identificador — e não a contagem.
   *
   * Comparando números, a fila oscilando entre 1 e 6 (01/10/2026) virava
   * um aviso a cada subida, sem parar. O conjunto só cresce: o pedido que
   * some e volta não é novidade, e não avisa de novo.
   */
  const refPendenciasVistas = useRef<Set<string> | null>(null);
  /** O número da aba Painel: as decisões do ponto que esperam por mim. */
  const [pendenciasParaMim, setPendenciasParaMim] = useState(0);
  useEffect(() => {
    const conferir = () => {
      /* Sem sessão, a conta recomeça: o próximo a entrar começa calado,
         e não comparado com o número de quem saiu */
      if (!bancoDados.estaAutenticado()) {
        refPendenciasVistas.current = null;
        return;
      }
      /**
       * A MESMA CONTA DO NÚMERO DA ABA E DO AVISO DO CELULAR.
       *
       * Contava tudo o que a pessoa PODE decidir; o celular avisa quem
       * ACOMPANHA (a cadeia de cada um). O TI, que pode decidir sobre
       * todos, recebia aviso da rede inteira no computador e nada no
       * celular. Uma conta só, a de `idsDasPendenciasParaMim`.
       */
      const ids = idsDasPendenciasParaMim();
      setPendenciasParaMim(ids.length);
      const vistas = refPendenciasVistas.current;
      refPendenciasVistas.current = new Set([...(vistas || []), ...ids]);

      /**
       * A PRIMEIRA PASSADA VOLTOU A FICAR CALADA.
       *
       * Ela avisava de propósito: quem abria o sistema de manhã com cinco
       * jornadas paradas não ficava sabendo de nenhuma, porque o aviso só
       * existia para quem já estava com a tela aberta quando a sexta
       * chegasse.
       *
       * O remédio ficou pior que a doença. A cada login vinha a mesma
       * notificação da mesma pendência de sempre — e aviso que repete
       * coisa velha é aviso que a pessoa aprende a ignorar, inclusive os
       * novos.
       *
       * O NÚMERO NA ABA PAINEL resolve a necessidade original sem o
       * barulho: mostra o que está esperando o tempo todo. Aqui fica só o
       * que é novidade de verdade.
       *
       * Este aviso é o do NAVEGADOR (computador e iPhone). No aplicativo
       * Android quem avisa é o servidor (`avisosDePonto`), e
       * `mostrarAvisoDeMensagem` não roda lá.
       */
      const primeiraPassada = vistas === null;
      if (primeiraPassada) return;
      const novas = ids.filter((id) => !vistas.has(id)).length;
      if (novas === 0) return;

      mostrarAvisoDeMensagem({
        titulo:
          novas === 1
            ? 'Um pedido do ponto aguarda sua decisão'
            : `${novas} pedidos do ponto aguardam sua decisão`,
        corpo: 'Ajuste de jornada, ausência ou folga. Toque para decidir.',
        conversaId: 'fila-de-aprovacao',
        // Levava a lugar nenhum: o toque abria o sistema na tela em que estava
        aoClicar: () =>
          irParaRef.current({ tipo: 'secao', secao: 'aprovar_jornadas' }),
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
  /**
   * ACERTA O RELÓGIO ANTES DE QUALQUER BATIDA.
   *
   * Todo o ponto saía de `new Date()` — a hora que o aparelho achava que
   * era. Celular de balcão é compartilhado, tem bateria velha e o relógio
   * a três toques de qualquer um; a batida era gravada com a hora errada
   * e ninguém tinha como saber depois.
   *
   * Fica fora do bloco de autenticação de propósito: quem chega pelo QR
   * do cartaz bate o ponto na tela de login, antes de qualquer sessão, e
   * é justamente essa batida que não pode sair torta.
   */
  useEffect(() => vigiarRelogio(), []);

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

  /**
   * DE QUEM SÃO OS AVISOS JÁ DADOS.
   *
   * Ao sair, o sistema esquece quem estava logado e o "colaborador atual"
   * cai no primeiro da lista — com a tela ainda montada. As mensagens não
   * lidas DESSA outra pessoa chegavam aqui como novas: tocava o som ao
   * fazer logout, e o aviso podia mostrar a prévia da mensagem de outro.
   * Sem sessão não se avisa nada; trocou a pessoa, a conta recomeça.
   */
  const donoDosAvisos = useRef<string | null>(null);

  useEffect(() => {
    const sessao = autenticado && bancoDados.estaAutenticado() ? colaboradorAtual.id : null;
    if (sessao !== donoDosAvisos.current) {
      donoDosAvisos.current = sessao;
      jaAvisadas.current = null;
    }
    if (!sessao) {
      atualizarTituloDaAba(0);
      return;
    }

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
  }, [conversasIndividuais, grupos, conversaAtivaId, conversaFlutuanteId, autenticado, colaboradorAtual.id]);

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
         * SÓ AGORA DÁ PARA SABER ONDE A PESSOA PAROU.
         *
         * No modo rede, na montagem ainda não se sabe quem entrou — a
         * sessão vem do banco, e a memória de navegação é por pessoa. Ler
         * lá em cima devolveria sempre o padrão, e a aba lembrada nunca
         * seria restaurada.
         */
        /*
         * O ATALHO VENCE A MEMÓRIA. Quem entrou pelo atalho "Bater ponto"
         * do ícone pediu o ponto; restaurar a última aba por cima desfazia
         * o pedido meio segundo depois — o atalho só abria o aplicativo.
         */
        setAbaAtiva(
          abaPedidaNaEntrada.current ??
            ondeParei(eu.id, 'aba-principal', ABAS_PRINCIPAIS, 'conversas')
        );
        abaPedidaNaEntrada.current = null;

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
   *
   * MORA AQUI EM CIMA, e não junto do resto da navegação, por causa do
   * efeito logo abaixo: hook depois de um `return` condicional derruba o
   * React inteiro — tela branca, sem erro de compilação. Já aconteceu
   * antes neste arquivo, e há teste cobrando.
   */
  /**
   * AS ABAS SEM FERRAMENTA NO CATÁLOGO.
   *
   * `podeUsar` responde NÃO para qualquer chave que não esteja no
   * catálogo — e está certo: erro de digitação numa tela não pode virar
   * tela aberta. Mas isso vale para as abas que TÊM ferramenta.
   *
   * "Painel" nunca teve (ele é a soma de várias), e a Central deixou de
   * ter de propósito: ler o que foi endereçado a você não é privilégio.
   *
   * SEM ESTA LISTA, clicar em Central não fazia nada: a aba aparecia,
   * a pessoa clicava, e o filtro abaixo a devolvia para o painel —
   * porque `podeUsar('central', ...)` é `false` por a chave não existir.
   */
  const ABAS_SEM_FERRAMENTA: AbaPrincipal[] = ['painel', 'central'];

  const abaAtiva: AbaPrincipal = (() => {
    if (abaAtivaEscolhida === 'painel' && !podeVerRede) return 'eu';

    if (
      !ABAS_SEM_FERRAMENTA.includes(abaAtivaEscolhida) &&
      !podeUsar(abaAtivaEscolhida, colaboradorAtual)
    ) {
      if (podeVerRede) return 'painel';
      return podeUsar('conversas', colaboradorAtual) ? 'conversas' : 'eu';
    }
    return abaAtivaEscolhida;
  })();

  /**
   * Guarda a aba que VALE, não a que foi escolhida.
   *
   * São diferentes quando a pessoa perde uma permissão: a escolhida
   * continua sendo a antiga, e gravá-la faria a pessoa voltar a cair no
   * desvio a cada recarga, para sempre.
   */
  useEffect(() => {
    if (!autenticado || !colaboradorAtual.id) return;
    lembrarOndeParei(colaboradorAtual.id, 'aba-principal', abaAtiva);
  }, [autenticado, colaboradorAtual.id, abaAtiva]);

  /* Sessão conferida: a tela de espera do index.html sai de cima */
  useEffect(() => {
    if (!verificandoSessao) encerrarEspera();
  }, [verificandoSessao]);

  // Enquanto a sessão do banco não é conferida, não dá para saber se mostra
  // o login ou o sistema. Piscar uma tela e trocar pela outra é pior. Quem
  // cobre este intervalo é a tela de espera do index.html, com o losango.
  if (verificandoSessao) return null;

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

  /*
    QUALQUER PESSOA CRIA GRUPO (Elias, 03/10/2026, no modelo do WhatsApp):
    quem cria é o administrador dele. O banco confere e responde; a tela
    só fecha quando o grupo existe, e já o abre.
  */
  const lidarCriarGrupo = async (nome: string, participantesIds: string[]) => {
    const resultado = await bancoDados.criarGrupoDePessoas(nome, '', participantesIds);
    if (resultado.sucesso && resultado.grupoId) abrirJanela(resultado.grupoId);
    return resultado;
  };

  // Alterna o colaborador logado na aba "Eu" para testes de permissão
  const lidarTrocarColaborador = (novoId: string) => {
    bancoDados.definirColaboradorAtual(novoId);
    setConversaAtivaId(null);
  };

  const lidarDeslogar = async () => {
    /**
     * O APARELHO SAI DA LISTA DE ENTREGA ANTES DA SESSÃO CAIR.
     *
     * Só a própria pessoa apaga o próprio aparelho. Depois do `sair()`
     * o delete afeta zero linhas e devolve sucesso — e o celular do
     * balcão seguiria recebendo o chat de quem já foi embora.
     */
    await desligarAvisoNativo();

    bancoDados.deslogar();
    // No modo rede a sessão vive no banco e também precisa ser encerrada
    if (usandoNuvem()) nuvem.sair();
    /**
     * A tela lembrada sai junto com a sessão.
     *
     * Nas lojas o mesmo computador atende o balcão inteiro. Quem entrar
     * depois começa na tela inicial dele — e não na ficha que o colega
     * estava conferindo.
     */
    esquecerOndeParei();
    limparTelaDaSessao();
    setPrecisaTrocarSenha(false);
    setAutenticado(false);
    setAbaAtiva('conversas');
  };

  /**
   * O toque numa notificação, virando navegação.
   *
   * Conversa abre a janela, como sempre abriu. Seção é o caminho novo: o
   * alvo desce por `PainelRede` até `PainelGestao`, que é quem conhece as
   * abas e as permissões de cada uma.
   *
   * O App não escolhe a aba de ninguém aqui de cima. Se escolhesse,
   * passaria a existir uma segunda cópia da regra de quem enxerga a
   * escala de folgas — e regra duplicada neste sistema já divergiu quatro
   * vezes.
   */
  /**
   * TOCAR NA NOTIFICAÇÃO LEVA ATÉ ELA, e não à tela onde ela mora.
   *
   * Cada tipo tem um destino próprio, e todos existiam antes — o que
   * faltava era a publicação, que caía no `else` e mandava a pessoa
   * para o painel de gestão, onde o aviso dela não estava.
   *
   * `abrirPublicacao` é o mesmo caminho do botão "Abrir publicação" do
   * chat: troca para a Central E abre aquela publicação. Levar só até a
   * Central deixaria a pessoa procurando entre dez avisos qual era o
   * que tocou — e um atalho que obriga a procurar não é atalho.
   */
  const irParaNotificacao = (destino: DestinoNotificacao) => {
    if (destino.tipo === 'conversa') {
      abrirJanela(destino.conversaId);
      return;
    }

    if (destino.tipo === 'publicacao') {
      abrirPublicacao(destino.publicacaoId);
      return;
    }

    // O aviso da decisão leva ao ponto de quem pediu, onde ela aparece
    if (destino.secao === 'meu_ponto') {
      setConversaAtivaId(null);
      setAbaAtiva('ponto');
      return;
    }

    // Holerite e documento do RH: a aba Eu, com a folha já aberta
    if (destino.secao === 'meus_holerites' || destino.secao === 'minhas_advertencias') {
      setConversaAtivaId(null);
      setAbaAtiva('eu');
      pedirFolhaDoMeuRH(destino.secao === 'meus_holerites' ? 'holerites' : 'advertencias');
      return;
    }

    setAbaAtiva('painel');
    setConversaAtivaId(null);
    setSecaoAlvo(destino.secao);
  };
  irParaRef.current = irParaNotificacao;

  // Abre conversa de avisos ao clicar na faixa
  const abrirAvisosDirecao = () => {
    setConversaAtivaId('grupo-avisos-da-rede');
    if (avisoNaoLido) {
      bancoDados.marcarAvisoDirecaoComoLido(avisoNaoLido.id);
      setAvisoNaoLido(null);
    }
  };

  const ehAdmin = colaboradorAtual.nivel >= NIVEL_TI;

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
      /**
       * A CENTRAL É DE TODO MUNDO.
       *
       * Ela morava dentro de "Gerenciar", atrás de uma permissão de
       * liderança — publicava-se para as 89 pessoas e umas 70 não
       * tinham onde ver. Aqui ela não passa por `podeUsar`: quem
       * PUBLICA continua sendo filtrado lá dentro, mas quem RECEBE é
       * qualquer um, e é para isso que a tela existe.
       */
      id: 'central', rotulo: 'Central', icone: Megaphone,
      visivel: true, alvo: 'central',
      contador: publicacoesNaoLidas,
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
      // O número que o sino mostrava: as decisões do ponto que esperam por mim
      contador: pendenciasParaMim,
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
    abaAtiva === 'conversas'
      ? podeVerRede
        ? 'painel'
        : 'ponto'
      : abaAtiva;

  // Determina visibilidade do botão flutuante '+'
  // Conversas: liberado para todos iniciarem bate-papo privado com colega
  // Grupos: liberado estritamente para o Administrador
  /* Grupos deixou de ser aba: criar grupo mora dentro de Conversas */
  // Durante a busca o "+" sai: os resultados ocupam a tela, e a ação principal é abrir um deles
  const deveExibirBotaoMais = abaAtiva === 'conversas' && !buscaConversas.trim();

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-[var(--c-canvas)] text-[var(--c-texto)] overflow-hidden">
      <IndicadorOffline />

      {/*
        VERSÃO NOVA NO AR.
        Fica no topo, acima de tudo, porque a pessoa pode estar vendo uma
        tela que já foi corrigida. Recarregar é escolha dela: fazer isso
        sozinho apagaria a mensagem pela metade de quem está digitando.
      */}
      {saiuVersaoNova && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full px-4 py-2 bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all flex-shrink-0"
        >
          Uma versão nova do CONECTA foi publicada — toque para atualizar
        </button>
      )}

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

      {/*
        Topo Geral da Aplicação — SÓ NO COMPUTADOR.

        No celular ele saiu de vez, pedido do Elias: tudo o que tinha já
        mora na aba Eu (perfil, Painel ADM, sair, o modo local) e na barra
        de baixo (a navegação). Sobrava uma faixa de 60px repetindo o nome
        do sistema em cima de cada tela.

        No computador ele É a navegação — lá não há barra de baixo nem aba
        Eu na lateral —, então fica.

        O SINO SAIU DOS DOIS. Os avisos são os do sistema (Android e
        navegador), e cada pendência já tem o número na própria aba.
      */}
      <header className="hidden md:flex px-4 py-2.5 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] items-center justify-between flex-shrink-0 z-10">
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
              /*
                Compara com a tela MOSTRADA (`abaDesktop`), e não com a
                escolhida: a sessão nasce em "conversas", que no computador
                não é tela e vira o painel — e o menu não marcava nada.
              */
              const ativa = ehLista
                ? secaoListaAberta === (aba.id === 'grupos' ? 'grupos' : 'individuais')
                : abaDesktop === aba.alvo;

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

                  {/* O mesmo número da barra do celular. Sem ele, no
                      computador a publicação chega e nada avisa. */}
                  {!!aba.contador && aba.contador > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {aba.contador > 9 ? '9+' : aba.contador}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>

        <div className="flex-1" />

        {/* Ações Rápidas do Topo: Conversas, Painel ADM e Perfil */}
        <div className="flex items-center gap-2">
          {/*
            CONVERSAS NO CABEÇALHO, e não num botão flutuando por cima da
            tela. O flutuante cobria o fim de toda lista — na Equipe e
            ponto, o saldo das últimas pessoas ficava embaixo dele. Aqui ele
            está sempre à vista, com as não lidas, e não esconde nada.
          */}
          <button
            type="button"
            id="botao-abrir-conversas"
            onClick={() => setSecaoListaAberta(secaoListaAberta ? null : 'individuais')}
            aria-pressed={!!secaoListaAberta}
            title="Conversas e grupos"
            className={`relative px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              secaoListaAberta
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Conversas</span>
            {totalNaoLidas > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
              </span>
            )}
          </button>

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

      {/* Só no computador, só enquanto dá para pedir: ver `deveConvidarParaAvisos` */}
      <ConviteAvisos />

      {/* O espelho, a escala, as férias: no celular abrem aqui, e não por cima
          do sistema (ver `mostrarDocumento`) */}
      <VisorDeDocumento />

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
          {/*
            A BARRA DE BUSCA, no alto da lista — pedido do Elias, estilo
            WhatsApp. Procura no nome das conversas e dentro das mensagens.
          */}
          {abaAtiva === 'conversas' && (
            <div className="px-3 pt-3 pb-2 bg-[var(--c-superficie)] flex-shrink-0">
              <label className="flex items-center gap-2.5 h-11 px-4 rounded-full bg-[var(--c-superficie-2)] border border-transparent focus-within:border-[var(--c-acento)] transition-colors">
                <Search className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
                <input
                  id="busca-conversas"
                  type="search"
                  value={buscaConversas}
                  onChange={(e) => setBuscaConversas(e.target.value)}
                  placeholder="Pesquisar conversas e mensagens"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-[var(--c-texto)] placeholder:text-[var(--c-texto-3)] [&::-webkit-search-cancel-button]:hidden"
                />
                {buscaConversas && (
                  <button
                    type="button"
                    onClick={() => setBuscaConversas('')}
                    aria-label="Limpar a busca"
                    className="w-7 h-7 -mr-1.5 rounded-full flex items-center justify-center text-[var(--c-texto-3)] active:bg-[var(--c-canvas)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </label>
            </div>
          )}

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
            {/*
              CONVERSAS E GRUPOS NA MESMA ABA.

              Grupo é conversa. Ocupava uma aba inteira da barra para
              mostrar uma lista que cabe aqui — e a pessoa tinha de
              lembrar em qual das duas abas estava a mensagem que
              procurava.

              Os grupos ficam numa seção que RECOLHE, para não roubar
              o espaço das conversas: o cabeçalho continua dizendo
              quantas não lidas há dentro, que é o que faz alguém
              abrir.
            */}
            {abaAtiva === 'conversas' && buscaConversas.trim() && (
              <ResultadosDaBusca
                termo={buscaConversas}
                conversas={[...conversasIndividuais, ...grupos]}
                aoAbrir={(conversaId, mensagemId) => {
                  setMensagemAlvo(mensagemId ? { conversaId, mensagemId } : null);
                  abrirConversaEmTelaCheia(conversaId);
                }}
              />
            )}
            {abaAtiva === 'conversas' && !buscaConversas.trim() && (
              <>
                {conversasIndividuais.length === 0 && grupos.length === 0 ? (
                  <div className="p-8 text-center text-[var(--c-texto-3)] text-xs space-y-3">
                    <p>Nenhuma conversa iniciada ainda.</p>
                    <button
                      type="button"
                      onClick={() => setModalNovaConversaAberto(true)}
                      className="py-2 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-xs"
                    >
                      + Nova conversa
                    </button>
                  </div>
                ) : (
                  <>
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

                    {gruposVisiveis.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setGruposAbertos((v) => !v)
                          }
                          className="w-full px-4 py-2.5 border-y border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center gap-2 text-left active:bg-[var(--c-superficie-2)] transition-colors"
                        >
                          {gruposAbertos ? (
                            <ChevronUp className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
                          )}
                          <Users className="w-3.5 h-3.5 text-[var(--c-texto-3)] shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--c-texto-2)]">
                            Grupos
                          </span>
                          <span className="text-[11px] text-[var(--c-texto-3)]">
                            {gruposVisiveis.length}
                          </span>

                          <div className="flex-1" />

                          {/* Recolhido, o número de não lidas é o que faz abrir */}
                          {naoLidasDosGrupos > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[11px] font-bold flex items-center justify-center">
                              {naoLidasDosGrupos}
                            </span>
                          )}
                        </button>

                        {gruposAbertos && (
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
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* ABA 3: PAINEL DA REDE & GESTÃO DE PESSOAS (No mobile) */}
            {abaAtiva === 'painel' && (
              <div className="block md:hidden h-full">
                <PainelRede
                  colaboradorAtual={colaboradorAtual}
                  aoAbrirConversa={(id) => abrirJanela(id)}
                  aoAlternarParaGestor={() => setPainelAdminAberto(true)}
                  secaoAlvo={secaoAlvo}
                  aoConsumirSecao={consumirSecaoAlvo}
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
            {/*
              A CENTRAL, no celular.

              É a tela onde a pessoa encontra o que foi publicado para
              ela — comunicado, documento, tutorial. Antes isso morava
              dentro de "Gerenciar", que a maior parte da rede não
              alcança: publicava-se para 89 e umas 70 não tinham onde
              ver.
            */}
            {abaAtiva === 'central' && (
              <div className="block md:hidden h-full overflow-y-auto">
                <CentralAvisos
                  colaboradorAtual={colaboradorAtual}
                  publicacaoAAbrir={publicacaoAAbrir}
                  aoConsumirPublicacao={() => setPublicacaoAAbrir(null)}
                />
              </div>
            )}

            {abaAtiva === 'ponto' && (
              <div className="block md:hidden h-full">
                <AbaPonto
                  colaboradorAtual={colaboradorAtual}
                  codigoDoEndereco={codigoDoCartaz}
                  aoConsumirCodigo={() => setCodigoDoCartaz(null)}
                  pedidoDeBater={pedidoDeBater}
                  aoAtenderPedido={() => setPedidoDeBater(false)}
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

                  {/* Número, e não bolinha: "3 para ler" faz abrir; um
                      ponto vermelho só diz que existe alguma coisa */}
                  {!!aba.contador && aba.contador > 0 && (
                    <span className="absolute top-0.5 right-1/4 translate-x-1/2 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--c-superficie)]">
                      {aba.contador > 9 ? '9+' : aba.contador}
                    </span>
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
                mensagemAlvoId={
                  mensagemAlvo?.conversaId === conversaAtiva.id ? mensagemAlvo.mensagemId : undefined
                }
                aoVoltar={() => setConversaAtivaId(null)}
                aoAbrirPublicacao={abrirPublicacao}
              />
            </div>
          ) : abaDesktop === 'painel' ? (
            <div className="w-full h-full flex flex-col bg-[var(--c-canvas)] overflow-hidden">
              <PainelRede
                colaboradorAtual={colaboradorAtual}
                aoAbrirConversa={(id) => abrirJanela(id)}
                aoAlternarParaGestor={() => setPainelAdminAberto(true)}
                secaoAlvo={secaoAlvo}
                aoConsumirSecao={consumirSecaoAlvo}
              />
            </div>
          ) : abaDesktop === 'central' ? (
            <div className="w-full h-full flex flex-col bg-[var(--c-canvas)] overflow-y-auto">
              <CentralAvisos
                  colaboradorAtual={colaboradorAtual}
                  publicacaoAAbrir={publicacaoAAbrir}
                  aoConsumirPublicacao={() => setPublicacaoAAbrir(null)}
                />
            </div>
          ) : abaDesktop === 'ponto' ? (
            /*
              A MESMA LARGURA DAS OUTRAS TELAS, e o mesmo título.
              Eram 900px no meio da tela, sem título: trocar de Gerenciar
              para Ponto parecia trocar de sistema.
            */
            <div className="w-full h-full bg-[var(--c-canvas)] overflow-y-auto">
              <div className="w-full max-w-7xl mx-auto">
              <TituloDaPagina
                className="px-6 pt-6"
                titulo="Meu ponto"
                subtitulo="Suas batidas de hoje, o seu banco de horas e as suas justificativas"
              />
              <div className="px-2">
              <AbaPonto
                  colaboradorAtual={colaboradorAtual}
                  codigoDoEndereco={codigoDoCartaz}
                  aoConsumirCodigo={() => setCodigoDoCartaz(null)}
                  pedidoDeBater={pedidoDeBater}
                  aoAtenderPedido={() => setPedidoDeBater(false)}
                />
              </div>
              </div>
            </div>
          ) : abaDesktop === 'eu' ? (
            <div className="w-full h-full bg-[var(--c-canvas)] overflow-y-auto">
              <div className="w-full max-w-7xl mx-auto">
              <TituloDaPagina
                className="px-6 pt-6"
                titulo="Meu perfil"
                subtitulo="Seus documentos da empresa, seus dados e as preferências deste aparelho"
              />
              <AbaEu
                colaboradorAtual={colaboradorAtual}
                aoTrocarColaborador={lidarTrocarColaborador}
                aoSair={lidarDeslogar}
                aoAbrirAdmin={() => setPainelAdminAberto(true)}
              />
              </div>
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
        aoNovoGrupo={() => {
          setModalNovaConversaAberto(false);
          setModalCriarGrupoAberto(true);
        }}
      />

      <ModalCriarGrupo
        aberto={modalCriarGrupoAberto}
        colegas={outrosColegas}
        aoCriar={lidarCriarGrupo}
        aoFechar={() => setModalCriarGrupoAberto(false)}
      />

      {/* Lista de conversas por cima, no lugar da antiga coluna fixa */}
      {secaoListaAberta && (
        <PainelConversas
          secaoInicial={secaoListaAberta}
          conversas={conversasIndividuais}
          grupos={grupos}
          conversaAbertaId={conversaFlutuanteId}
          colaboradorId={colaboradorAtual.id}
          podeCriarGrupo
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
            /* Fecha a janela ao ir para a publicação: deixá-la aberta
               por cima da Central esconderia o que se foi ler */
            aoAbrirPublicacao={(id) => {
              fecharJanela(janela.id);
              abrirPublicacao(id);
            }}
          />
        );
      })}
    </div>
  );
}
