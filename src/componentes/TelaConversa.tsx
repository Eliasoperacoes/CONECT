import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  ArrowLeft,
  MoreVertical,
  Paperclip,
  Camera,
  ZoomIn,
  Send,
  Play,
  Pause,
  Volume2,
  FileText,
  Download,
  Search,
  X,
  Radio,
  Building2,
  Shield,
  Smile,
  Check,
  CheckCheck,
  Forward,
  Clock,
  AlertTriangle,
  Pin,
  PinOff,
  Copy,
  CheckSquare,
  Trash2,
  ImageOff,
  Pencil,
  Reply,
} from 'lucide-react';
import {
  Conversa,
  Colaborador,
  Mensagem,
  EstadoTransmissaoRadio,
} from '../tipos';
import { FotoPresenca } from './FotoPresenca';
import {
  ehArquivoDeImagem,
  ehDataUrlDeImagem,
  ehNomeDeImagem,
  comprimirImagem,
} from '../servicos/imagens';
import { bancoDados } from '../servicos/bancoDados';
import { servicoAudioRadio } from '../servicos/audioRadio';
import { TelaRadioAoVivo } from './TelaRadioAoVivo';
import { ModalCamera } from './ModalCamera';
import { ModalVisualizadorImagem } from './ModalVisualizadorImagem';
import { ModalEncaminharMensagem } from './ModalEncaminharMensagem';
import { montarPreviaDaMensagem } from '../servicos/nuvemComunicacao';

interface PropsTelaConversa {
  conversa: Conversa;
  colaboradorAtual: Colaborador;
  aoVoltar: () => void;
}

/**
 * Os emoji de reação.
 *
 * Eram QUATRO. "Mais opções", como o Elias pediu — e escolhidos para o que
 * se responde numa loja de autopeças: confirmar, negar, urgência, peça,
 * entrega, prazo. Emoji bonito que ninguém usa só faz procurar mais.
 *
 * Oito por linha, cinco linhas. Uma grade só, sem abas nem busca: a tela
 * inteira aparece de uma vez e escolher é um toque.
 */
const EMOJIS_DE_REACAO = [
  '👍', '👎', '✅', '❌', '❗', '❓', '🔥', '⭐',
  '😀', '😂', '😅', '😊', '😍', '😎', '🤔', '😴',
  '😢', '😡', '🙏', '👏', '💪', '🤝', '👌', '🫡',
  '📦', '🚗', '🔧', '🔩', '🛠️', '⚙️', '🚚', '🏁',
  '💰', '📄', '📅', '⏰', '📌', '⚠️', '🎉', '❤️',
];

/** Oito colunas de 30px, mais o respiro das bordas. */
const PAINEL_EMOJI_LARGURA = 268;
const PAINEL_EMOJI_ALTURA = 190;

/** Largura e altura aproximada do menu de ações, para caber na janela. */
const MENU_LARGURA = 164;
const MENU_ALTURA_ITEM = 32;

/**
 * Uma linha do menu de ações.
 *
 * Compacta de propósito. A primeira versão tinha 208px de largura e linhas
 * de 44px: seis delas passavam de 260px de altura e, perto do topo da
 * conversa, o menu aparecia cortado ao meio. Ícone pequeno, texto de 12 e
 * pouco respiro dão o mesmo alcance em pouco mais de um terço do espaço.
 */
const ItemDoMenu: React.FC<{
  icone: React.ReactNode;
  rotulo: string;
  perigo?: boolean;
  aoClicar: () => void;
}> = ({ icone, rotulo, perigo, aoClicar }) => (
  <button
    type="button"
    onClick={aoClicar}
    className={`w-full px-3 h-8 flex items-center gap-2.5 text-xs font-semibold text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-canvas)] transition-colors ${
      perigo ? 'text-red-600 dark:text-red-400' : 'text-[var(--c-texto)]'
    }`}
  >
    <span className="flex-shrink-0 opacity-80">{icone}</span>
    <span className="truncate">{rotulo}</span>
  </button>
);

/** Segundos em M:SS — 3 vira "0:03" e 75 vira "1:15". */
const formatarSegundos = (total: number): string => {
  const seguros = Math.max(0, Math.round(total));
  const minutos = Math.floor(seguros / 60);
  const segundos = seguros % 60;
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
};

/** Converte o áudio gravado em data URL, para sobreviver ao recarregamento. */
const blobParaDataUrl = (blob: Blob): Promise<string | undefined> =>
  new Promise((resolver) => {
    const leitor = new FileReader();
    leitor.onload = () =>
      resolver(typeof leitor.result === 'string' ? leitor.result : undefined);
    leitor.onerror = () => resolver(undefined);
    leitor.readAsDataURL(blob);
  });

export const TelaConversa: React.FC<PropsTelaConversa> = ({
  conversa,
  colaboradorAtual,
  aoVoltar,
}) => {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [textoMensagem, setTextoMensagem] = useState('');
  const [estadoRadio, setEstadoRadio] = useState<EstadoTransmissaoRadio>('ocioso');
  const [volumeVoz, setVolumeVoz] = useState(0);
  const [outroFalandoNome, setOutroFalandoNome] = useState<string | null>(null);
  const [avisoRecadoTexto, setAvisoRecadoTexto] = useState<string | null>(null);
  const [audioTocandoId, setAudioTocandoId] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [tempoAudioAtual, setTempoAudioAtual] = useState<Record<string, number>>({});
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');
  const [modalDetalhesAberto, setModalDetalhesAberto] = useState(false);
  /**
   * O painel de emoji aberto, ancorado na JANELA.
   *
   * O seletor antigo era `absolute -top-9` dentro da mensagem: na primeira
   * mensagem da conversa ele abria para cima e a borda da lista o cortava,
   * igualzinho ao menu de ações antes de sair de lá.
   */
  const [painelReacao, setPainelReacao] = useState<{
    msg: Mensagem;
    x: number;
    y: number;
  } | null>(null);
  const fecharPainelReacao = () => setPainelReacao(null);
  const [modalCameraAberto, setModalCameraAberto] = useState(false);
  const [imagemAmpliada, setImagemAmpliada] = useState<{ url: string; legenda?: string } | null>(null);

  // Estados para Seleção e Encaminhamento de Mensagens
  const [modoSelecao, setModoSelecao] = useState(false);
  const [mensagensSelecionadasIds, setMensagensSelecionadasIds] = useState<string[]>([]);
  /** Qual mensagem está com o menu aberto no celular. */
  /**
   * O menu de ações aberto: a mensagem E o ponto da tela onde ancorá-lo.
   *
   * A posição é guardada em coordenadas da JANELA, não do balão. O menu
   * antes era `absolute` dentro da lista de mensagens, que rola e tem
   * `overflow`: perto do topo ele era CORTADO ao meio pela borda da lista, e
   * abrir um menu alto ainda empurrava a rolagem. Fora da lista, ancorado na
   * janela, não há o que o corte.
   */
  const [menuMensagem, setMenuMensagem] = useState<{
    msg: Mensagem;
    x: number;
    y: number;
  } | null>(null);
  const fecharMenuMensagem = () => setMenuMensagem(null);
  /** A mensagem que está sendo respondida, enquanto a resposta é escrita. */
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [modalEncaminharAberto, setModalEncaminharAberto] = useState(false);
  const [mensagensParaEncaminhar, setMensagensParaEncaminhar] = useState<string[]>([]);
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);
  const [mensagemParaExcluir, setMensagemParaExcluir] = useState<Mensagem | null>(null);
  // Mensagem sendo editada no próprio balão, e o texto em andamento
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState('');

  /** Aviso rápido no rodapé da conversa. */
  const exibirToast = (texto: string) => {
    setToastFeedback(texto);
    setTimeout(() => setToastFeedback(null), 4000);
  };

  const iniciarEdicao = (msg: Mensagem) => {
    setEditandoId(msg.id);
    setTextoEditado(msg.texto || '');
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setTextoEditado('');
  };

  const salvarEdicao = async (msgId: string) => {
    const res = await bancoDados.editarMensagem(msgId, textoEditado);
    if (res.sucesso) {
      cancelarEdicao();
    } else {
      exibirToast(res.erro || 'Não foi possível editar a mensagem.');
    }
  };

  const refFimMensagens = useRef<HTMLDivElement>(null);
  const refLista = useRef<HTMLDivElement>(null);
  /**
   * Enquanto true, a conversa fica grudada no fim.
   *
   * Vira false quando a pessoa rola para cima para ler o passado — senão
   * cada mensagem nova a arrancaria de onde ela está lendo. Volta a true
   * quando ela desce de novo até o fim.
   */
  const grudadoNoFim = useRef(true);
  const refTemporizadorPressione = useRef<NodeJS.Timeout | null>(null);
  const refAudioElemento = useRef<HTMLAudioElement | null>(null);
  const refInputArquivo = useRef<HTMLInputElement>(null);
  // Instante em que a gravação do recado começou, para medir a duração real
  const refInicioGravacao = useRef<number | null>(null);

  // Identifica o colega destinatário em conversas individuais
  const colegaDestinatario: Colaborador | undefined =
    conversa.tipo === 'individual'
      ? bancoDados
          .obterColaboradores()
          .find((c) => conversa.participantesIds.includes(c.id) && c.id !== colaboradorAtual.id)
      : undefined;

  // Carrega mensagens e assina atualizações
  useEffect(() => {
    const carregar = () => {
      const msgs = bancoDados.obterMensagens(conversa.id);
      setMensagens(msgs);
      bancoDados.marcarConversaComoLida(conversa.id);
    };

    carregar();
    const cancelarAssinatura = bancoDados.assinarAlteracoes(carregar);

    // Meta: Conexão em < 1 segundo em Wi-Fi -> prepara o microfone quando a conversa abre!
    servicoAudioRadio.prepararMicrofone();

    return () => {
      cancelarAssinatura();
      // Desliga o microfone ao sair da conversa, senão ele fica aberto
      servicoAudioRadio.liberarMicrofone();
    };
  }, [conversa.id]);

  /**
   * ABRIR UMA CONVERSA CAI NA ÚLTIMA MENSAGEM.
   *
   * Não caía: parava no meio do histórico, ou no começo. Duas causas, e as
   * duas vinham do mesmo `scrollIntoView({ behavior: 'smooth' })`:
   *
   *  - suave é uma ANIMAÇÃO. Ela leva centenas de milissegundos e é
   *    cancelada por qualquer rolagem que aconteça no meio — inclusive a que
   *    o próprio navegador faz ao montar a lista. A conversa parava onde a
   *    animação foi interrompida;
   *  - a altura da lista ainda ia MUDAR. Foto e áudio só ocupam o espaço
   *    deles depois de carregar, e cada um que chega empurra o fim para
   *    baixo. Rolar antes disso é mirar num alvo que ainda vai se mexer.
   *
   * Ao abrir, agora é um salto direto: `scrollTop = scrollHeight`, sem
   * animação, sem alvo que se move. Durante a conversa, mensagem nova
   * continua suave — ali é acompanhar, não chegar.
   */
  useLayoutEffect(() => {
    const lista = refLista.current;
    if (!lista) return;

    if (grudadoNoFim.current) {
      lista.scrollTop = lista.scrollHeight;
    }
  }, [mensagens]);

  // Trocar de conversa volta a grudar no fim
  useLayoutEffect(() => {
    grudadoNoFim.current = true;
    const lista = refLista.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [conversa.id]);

  /**
   * A segunda causa, tratada na fonte: foto e áudio que terminam de carregar.
   *
   * O evento `load` de `<img>` não sobe pela árvore, então é preciso ouvir
   * na CAPTURA. Sem isto, abrir uma conversa cheia de fotos parava a rolagem
   * na altura que a lista tinha antes de as imagens existirem.
   */
  useEffect(() => {
    const lista = refLista.current;
    if (!lista) return;

    const aoCarregarAlgo = () => {
      if (grudadoNoFim.current) lista.scrollTop = lista.scrollHeight;
    };

    lista.addEventListener('load', aoCarregarAlgo, true);
    return () => lista.removeEventListener('load', aoCarregarAlgo, true);
  }, [conversa.id]);

  // Ouve transmissões ao vivo de rádio de colegas (WebRTC / BroadcastChannel)
  useEffect(() => {
    const cancelarRadio = servicoAudioRadio.assinarSinaisRadio((evento) => {
      if (evento.conversaId === conversa.id || evento.paraId === colaboradorAtual.id) {
        if (evento.tipo === 'iniciar_transmissao' && evento.deId !== colaboradorAtual.id) {
          // Chegou transmissão ao vivo do colega!
          servicoAudioRadio.tocarBipeInicio();
          setOutroFalandoNome(evento.nomeFalante);
          setEstadoRadio('ouvindo');
        } else if (evento.tipo === 'finalizar_transmissao' && evento.deId !== colaboradorAtual.id) {
          servicoAudioRadio.tocarBipeFim();
          setEstadoRadio('ocioso');
          setOutroFalandoNome(null);
        }
      }
    });

    return () => {
      cancelarRadio();
    };
  }, [conversa.id, colaboradorAtual.id]);

  // Envio de mensagem de texto normal
  const lidarEnvioTexto = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textoLimpo = textoMensagem.trim();
    if (!textoLimpo) return;

    // A caixa esvazia antes da ida ao banco para a digitação não travar. Se o
    // envio falhar, o texto volta para a caixa em vez de se perder.
    setTextoMensagem('');
    // A citação sai da caixa junto com o texto. Se o envio falhar ela volta,
    // senão a resposta reenviada perderia justamente o contexto.
    const citada = respondendoId;
    setRespondendoId(null);

    const res = await bancoDados.enviarMensagem(conversa.id, {
      tipo: 'texto',
      texto: textoLimpo,
      respondendoA: citada || undefined,
    });
    if (!res.sucesso) {
      setTextoMensagem(textoLimpo);
      setRespondendoId(citada);
      exibirToast(res.erro || 'Não foi possível enviar a mensagem.');
    }
  };

  /**
   * Começa a responder: guarda a mensagem citada e põe o foco na caixa.
   *
   * O foco importa mais do que parece — no celular é o que abre o teclado.
   * Sem ele a pessoa toca em "Responder", a citação aparece e ela ainda
   * precisa de um segundo toque para começar a escrever.
   */
  const responderMensagem = (msg: Mensagem) => {
    setRespondendoId(msg.id);
    fecharMenuMensagem();
    setTimeout(() => {
      document.getElementById('campo-mensagem-texto')?.focus();
    }, 0);
  };

  /**
   * Leva a conversa até a mensagem citada e a destaca por um instante.
   *
   * Citação que não leva a lugar nenhum obriga a rolar procurando — que é
   * exatamente o trabalho que responder deveria poupar.
   */
  const irAteMensagem = (id: string) => {
    const alvo = document.getElementById(`mensagem-${id}`);
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    alvo.classList.add('destaque-citacao');
    setTimeout(() => alvo.classList.remove('destaque-citacao'), 1600);
  };

  /**
   * Envio de arquivo anexado. O conteúdo vai junto em data URL — antes só o
   * nome e o tamanho eram guardados, e o download entregava um texto no lugar
   * do arquivo original.
   */
  const LIMITE_ANEXO_BYTES = 2 * 1024 * 1024; // 2 MB

  /**
   * Manda um arquivo de imagem para a conversa como FOTO.
   *
   * Existe separado porque agora tem dois caminhos até aqui: o clipe de
   * anexo e o Ctrl+V. Devolve false quando o navegador não conseguiu abrir
   * a imagem — aí quem chamou decide se tenta como anexo comum.
   */
  const enviarComoImagem = async (arquivo: File): Promise<boolean> => {
    const imagem = await comprimirImagem(arquivo);
    if (!imagem) return false;

    const resultado = await bancoDados.enviarMensagem(conversa.id, {
      tipo: 'imagem',
      imagemUrl: imagem,
    });
    if (!resultado.sucesso) {
      exibirToast(resultado.erro || 'Não foi possível enviar a foto.');
    }
    return true;
  };

  const lidarEnvioArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = e.target.files;
    if (!arquivos || arquivos.length === 0) return;
    const arquivo = arquivos[0];

    const limparCampo = () => {
      if (refInputArquivo.current) refInputArquivo.current.value = '';
    };

    // Foto anexada é foto: entra na conversa como imagem, não como documento
    // para baixar. Vai reduzida, porque foto de celular estoura o navegador.
    if (ehArquivoDeImagem(arquivo)) {
      if (await enviarComoImagem(arquivo)) {
        limparCampo();
        return;
      }
      // Formato de imagem que o navegador não abriu: segue como anexo comum
    }

    if (arquivo.size > LIMITE_ANEXO_BYTES) {
      exibirToast('Arquivo acima de 2 MB. Envie um menor ou compartilhe o link.');
      limparCampo();
      return;
    }

    const tamanhoKb = Math.round(arquivo.size / 1024);
    const tamanhoFormatado =
      tamanhoKb > 1024 ? `${(tamanhoKb / 1024).toFixed(1)} MB` : `${tamanhoKb} KB`;

    const leitor = new FileReader();
    leitor.onload = async () => {
      const resultado = await bancoDados.enviarMensagem(conversa.id, {
        tipo: 'arquivo',
        arquivoNome: arquivo.name,
        arquivoTamanho: tamanhoFormatado,
        arquivoUrl: typeof leitor.result === 'string' ? leitor.result : undefined,
      });
      if (!resultado.sucesso) {
        exibirToast(resultado.erro || 'Não foi possível enviar o arquivo.');
      }
      limparCampo();
    };
    leitor.onerror = () => {
      exibirToast('Não foi possível ler o arquivo.');
      limparCampo();
    };
    leitor.readAsDataURL(arquivo);
  };

  // Ação de segurar a BARRA DO RÁDIO
  const lidarInicioPressioneRadio = async () => {
    if (outroFalandoNome) {
      // Bloqueio de concorrência: se o outro já está falando, trava
      return;
    }

    // Verifica se o destinatário está ocupado, desconectado ou ausente
    const destinatarioIndisponivel =
      conversa.tipo === 'individual' &&
      colegaDestinatario &&
      (colegaDestinatario.presenca === 'ocupado' ||
        colegaDestinatario.presenca === 'desconectado' ||
        colegaDestinatario.presenca === 'ausente');

    // Toca o bipe imediato de walkie-talkie
    servicoAudioRadio.tocarBipeInicio();

    if (destinatarioIndisponivel) {
      // Vira recado de voz automaticamente
      setEstadoRadio('recado_automatico');
    } else {
      setEstadoRadio('chamando');
      // Em menos de 200ms vira FALANDO
      refTemporizadorPressione.current = setTimeout(() => {
        setEstadoRadio('falando');
      }, 150);

      // Notifica canal ao vivo
      servicoAudioRadio.enviarSinalRadio({
        tipo: 'iniciar_transmissao',
        deId: colaboradorAtual.id,
        paraId: colegaDestinatario?.id,
        conversaId: conversa.id,
        nomeFalante: colaboradorAtual.nome,
        fotoFalante: colaboradorAtual.foto,
      });
    }

    // Inicia captura de voz e onda de áudio
    refInicioGravacao.current = Date.now();
    await servicoAudioRadio.iniciarCapturaVoz((vol) => {
      setVolumeVoz(vol);
    });
  };

  // Ação de soltar a BARRA DO RÁDIO
  const lidarSolturaRadio = async () => {
    if (refTemporizadorPressione.current) {
      clearTimeout(refTemporizadorPressione.current);
    }

    const estadoAntesDeSoltar = estadoRadio;
    if (estadoAntesDeSoltar === 'ocioso') return;

    // Para captura e recupera áudio se foi gravado
    const resultadoAudio = await servicoAudioRadio.pararCapturaVoz();
    servicoAudioRadio.tocarBipeFim();

    // Se estava transmitindo ao vivo, avisa aos peers que soltou
    if (estadoAntesDeSoltar === 'falando' || estadoAntesDeSoltar === 'chamando') {
      servicoAudioRadio.enviarSinalRadio({
        tipo: 'finalizar_transmissao',
        deId: colaboradorAtual.id,
        paraId: colegaDestinatario?.id,
        conversaId: conversa.id,
        nomeFalante: colaboradorAtual.nome,
        fotoFalante: colaboradorAtual.foto,
      });
    }

    // Se virou recado automático porque o destinatário estava ocupado/offline
    if (estadoAntesDeSoltar === 'recado_automatico') {
      const nomeDest = colegaDestinatario?.nome || 'O destinatário';
      setAvisoRecadoTexto(`${nomeDest} não está disponível — virou recado`);

      // Duração real da gravação, em vez de um valor fixo
      const segundosGravados = refInicioGravacao.current
        ? Math.max(1, Math.round((Date.now() - refInicioGravacao.current) / 1000))
        : 1;
      refInicioGravacao.current = null;

      // O áudio vai em data URL: um blob: URL morre ao recarregar a página e o
      // recado ficaria mudo para sempre.
      let urlAudio: string | undefined = undefined;
      if (resultadoAudio?.blob) {
        urlAudio = await blobParaDataUrl(resultadoAudio.blob);
      }

      const enviado = await bancoDados.enviarMensagem(conversa.id, {
        tipo: 'recado_voz',
        audioUrl: urlAudio,
        audioDuracao: segundosGravados,
      });
      if (!enviado.sucesso) {
        exibirToast(enviado.erro || 'Não foi possível salvar o recado de voz.');
      }

      setTimeout(() => {
        setAvisoRecadoTexto(null);
      }, 4000);
    }

    setEstadoRadio('ocioso');
    setVolumeVoz(0);
  };

  // Tocar / pausar mensagem de recado de voz
  const alternarReproducaoAudio = (mensagem: Mensagem) => {
    if (audioTocandoId === mensagem.id) {
      refAudioElemento.current?.pause();
      setAudioTocandoId(null);
    } else {
      if (refAudioElemento.current) {
        refAudioElemento.current.pause();
      }

      if (mensagem.audioUrl) {
        const audio = new Audio(mensagem.audioUrl);
        refAudioElemento.current = audio;
        // Recados gravados antes da correção usavam blob: e não tocam mais
        audio.onerror = () => {
          setAudioTocandoId(null);
          exibirToast('Este recado foi gravado antes da correção e não pode mais ser reproduzido.');
        };
        audio.play().catch(() => {
          setAudioTocandoId(null);
          exibirToast('Não foi possível reproduzir este recado de voz.');
        });
        setAudioTocandoId(mensagem.id);

        audio.ontimeupdate = () => {
          setTempoAudioAtual((prev) => ({
            ...prev,
            [mensagem.id]: Math.floor(audio.currentTime),
          }));
        };

        audio.onended = () => {
          setAudioTocandoId(null);
          setTempoAudioAtual((prev) => ({
            ...prev,
            [mensagem.id]: 0,
          }));
        };
      } else {
        // Áudio sintético / simulação sonora caso o dispositivo não tenha gerado blob
        servicoAudioRadio.tocarBipeInicio();
        setAudioTocandoId(mensagem.id);
        setTimeout(() => {
          setAudioTocandoId(null);
        }, (mensagem.audioDuracao || 3) * 1000);
      }
    }
  };

  // Download de arquivo com Blob simulado
  /** Baixa o anexo de verdade. Sem conteúdo guardado, avisa em vez de entregar
   *  um arquivo falso com o nome certo. */
  const lidarDownloadArquivo = (nome: string, arquivoUrl?: string) => {
    if (!arquivoUrl) {
      exibirToast('Este anexo foi enviado antes do sistema guardar arquivos e não pode ser baixado.');
      return;
    }

    const link = document.createElement('a');
    link.href = arquivoUrl;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const lidarReagirMensagem = (msgId: string, emoji: string) => {
    bancoDados.adicionarReacaoMensagem(conversa.id, msgId, emoji);
    fecharPainelReacao();
  };

  const lidarConfirmarFoto = async (fotoDataUrl: string, legenda?: string) => {
    const res = await bancoDados.enviarMensagem(conversa.id, {
      tipo: 'imagem',
      imagemUrl: fotoDataUrl,
      legenda: legenda,
    });
    if (!res.sucesso) {
      exibirToast(res.erro || 'Não foi possível enviar a foto.');
    }
  };

  // Mensagens filtradas se busca estiver ativa
  /**
   * As fixadas desta conversa, a mais recente primeiro.
   *
   * Sai de `mensagens`, que já é o estado sincronizado — assim fixar num
   * aparelho aparece no outro sem tratamento à parte.
   */
  const mensagensFixadas = mensagens
    .filter((m) => !!m.fixadaEm)
    .sort((a, b) => (b.fixadaEm || '').localeCompare(a.fixadaEm || ''));

  /** Rola até a mensagem e a pisca, para o clique na faixa levar a algum lugar. */
  const irParaMensagem = (id: string) => {
    const alvo = document.getElementById(`mensagem-${id}`);
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    alvo.classList.add('ring-2', 'ring-[var(--c-acento)]', 'rounded-xl');
    setTimeout(
      () => alvo.classList.remove('ring-2', 'ring-[var(--c-acento)]', 'rounded-xl'),
      1600
    );
  };

  const mensagensExibidas = mensagens.filter((m) => {
    if (!termoBusca.trim()) return true;
    const termo = termoBusca.toLowerCase();
    if (m.tipo === 'texto' && m.texto) {
      return m.texto.toLowerCase().includes(termo);
    }
    if (m.tipo === 'arquivo' && m.arquivoNome) {
      return m.arquivoNome.toLowerCase().includes(termo);
    }
    if (m.tipo === 'imagem' && m.legenda) {
      return m.legenda.toLowerCase().includes(termo);
    }
    return false;
  });

  // Regra no banco: apenas pessoas com permissão veem os botões de envio
  const podePublicar = bancoDados.podePublicarNaConversa(conversa.id);

  /**
   * CTRL+V MANDA O PRINT.
   *
   * Tirar print e colar é como se manda uma tela de sistema, um pedido ou um
   * código de peça no computador. Sem isto era preciso salvar o arquivo,
   * achar a pasta e anexar — três passos para o que devia ser um atalho.
   *
   * O ouvinte fica na JANELA, não no campo de texto: quem acaba de apertar
   * PrintScreen não clicou em lugar nenhum, e exigir foco no campo faria o
   * Ctrl+V parecer quebrado metade das vezes.
   *
   * Colar texto continua sendo colar texto: só imagem é interceptada, e só
   * quando não se está digitando dentro de outro campo.
   */
  useEffect(() => {
    if (!podePublicar) return;

    const aoColar = (evento: ClipboardEvent) => {
      const itens = evento.clipboardData?.items;
      if (!itens) return;

      // Colar dentro de outro campo de texto é do campo, não da conversa
      const alvo = evento.target as HTMLElement | null;
      const etiqueta = alvo?.tagName;
      const digitandoEmOutroLugar =
        (etiqueta === 'INPUT' && alvo?.id !== 'campo-mensagem-texto') ||
        etiqueta === 'TEXTAREA' ||
        alvo?.isContentEditable === true;
      if (digitandoEmOutroLugar) return;

      const daImagem = Array.from(itens).find((i) => i.type.startsWith('image/'));
      if (!daImagem) return;

      const arquivo = daImagem.getAsFile();
      if (!arquivo) return;

      // Só agora: até aqui podia ser texto, e texto colado é do campo
      evento.preventDefault();

      void enviarComoImagem(arquivo).then((foi) => {
        if (!foi) exibirToast('Não foi possível ler a imagem colada.');
      });
    };

    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
  }, [podePublicar, conversa.id]);

  const participantesGrupo = conversa.tipo === 'grupo'
    ? bancoDados.obterColaboradores().filter((c) => conversa.participantesIds.includes(c.id))
    : [];

  // Funções de Seleção e Encaminhamento de Mensagens
  const alternarSelecaoMensagem = (msgId: string) => {
    setMensagensSelecionadasIds((prev) => {
      if (prev.includes(msgId)) {
        const novo = prev.filter((id) => id !== msgId);
        if (novo.length === 0) setModoSelecao(false);
        return novo;
      } else {
        return [...prev, msgId];
      }
    });
  };

  const cancelarSelecao = () => {
    setMensagensSelecionadasIds([]);
    setModoSelecao(false);
  };

  const abrirModalEncaminhar = (ids: string[]) => {
    setMensagensParaEncaminhar(ids);
    setModalEncaminharAberto(true);
  };

  const copiarMensagensSelecionadas = () => {
    const selecionadas = mensagens.filter((m) => mensagensSelecionadasIds.includes(m.id));
    const textos = selecionadas
      .map((m) => {
        if (m.tipo === 'texto') return m.texto;
        if (m.tipo === 'arquivo') return `[Arquivo: ${m.arquivoNome}]`;
        if (m.tipo === 'imagem') return `[Foto${m.legenda ? `: ${m.legenda}` : ''}]`;
        if (m.tipo === 'recado_voz') return '[Recado de voz gravado no Rádio CONECTA]';
        return '';
      })
      .filter(Boolean)
      .join('\n\n');

    if (textos) {
      navigator.clipboard.writeText(textos).then(() => {
        setToastFeedback('Mensagem(ns) copiada(s) para a área de transferência');
        setTimeout(() => setToastFeedback(null), 3000);
      }).catch(() => {});
    }
  };

  const lidarSucessoEncaminhamento = (total: number, destinoNome: string) => {
    cancelarSelecao();
    setToastFeedback(`Encaminhada com sucesso para ${destinoNome}`);
    setTimeout(() => setToastFeedback(null), 3500);
  };

  return (
    <div
      id="tela-conversa-ativa"
      className="flex flex-col w-full h-[100dvh] bg-[var(--c-canvas)] overflow-hidden"
    >
      {/* 1. Cabeçalho: Alterna entre Barra Normal (com rádio menor próximo à lupa) e Barra de Seleção */}
      {mensagensSelecionadasIds.length > 0 ? (
        <header
          id="cabecalho-selecao-mensagens"
          className="w-full bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-3 py-2 flex items-center justify-between gap-2 z-20 min-h-[58px] animate-in fade-in"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="botao-cancelar-selecao"
              onClick={cancelarSelecao}
              className="w-9 h-9 flex items-center justify-center text-[var(--c-texto)] rounded-full hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)]"
              title="Cancelar seleção"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="font-semibold text-sm text-[var(--c-texto)]">
              {mensagensSelecionadasIds.length} selecionada(s)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="botao-copiar-selecionadas"
              onClick={copiarMensagensSelecionadas}
              className="w-9 h-9 flex items-center justify-center text-[var(--c-texto-2)] hover:text-[var(--c-texto)] rounded-full hover:bg-[var(--c-superficie-2)] transition-colors"
              title="Copiar texto das mensagens selecionadas"
            >
              <Copy className="w-4 h-4" />
            </button>

            <button
              type="button"
              id="botao-encaminhar-selecionadas"
              onClick={() => abrirModalEncaminhar(mensagensSelecionadasIds)}
              className="px-3.5 py-1.5 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:brightness-105 active:scale-95 transition-all"
              title="Encaminhar mensagens selecionadas para outros colaboradores"
            >
              <Forward className="w-3.5 h-3.5" />
              <span>Encaminhar</span>
            </button>
          </div>
        </header>
      ) : (
        <header className="w-full bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-3 py-2 flex items-center justify-between gap-2 z-20 min-h-[58px]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              id="botao-voltar-conversa"
              onClick={aoVoltar}
              className="w-9 h-9 flex items-center justify-center text-[var(--c-texto)] rounded-full hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] -ml-1 flex-shrink-0"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Foto clicável para abrir detalhes. Em grupo não há presença. */}
            <FotoPresenca
              foto={conversa.foto || colegaDestinatario?.foto}
              nome={conversa.nome}
              presenca={colegaDestinatario?.presenca}
              tamanho="w-10 h-10"
              aoClicar={() => setModalDetalhesAberto(true)}
              titulo="Ver detalhes"
            />

            {/* Nome em destaque e cargo · loja em cinza pequeno - Clicável */}
            <div
              onClick={() => setModalDetalhesAberto(true)}
              className="min-w-0 flex-1 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <h1 className="text-base font-semibold text-[var(--c-texto)] truncate leading-tight">
                {conversa.nome}
              </h1>
              <p className="text-xs text-[var(--c-texto-3)] truncate leading-tight">
                {conversa.tipo === 'individual' && colegaDestinatario ? (
                  `${colegaDestinatario.cargo} · ${colegaDestinatario.loja}`
                ) : conversa.tipo === 'grupo' ? (
                  conversa.ehSistemaPadrao ? 'Grupo da rede' : `${conversa.participantesIds.length} participantes`
                ) : (
                  'Malachias Autopeças'
                )}
              </p>
            </div>
          </div>

          {/* Ações da direita: Botão Chamar Rádio Menor Deslocado à Esquerda da Lupa, Botão Busca e Menu ⋮ */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* BOTÃO CHAMAR RÁDIO — Menor, aba superior, à esquerda da lupa com espaçamento equilibrado */}
            <button
              type="button"
              id="botao-chamar-radio-topo"
              onMouseDown={lidarInicioPressioneRadio}
              onMouseUp={lidarSolturaRadio}
              onMouseLeave={lidarSolturaRadio}
              onTouchStart={lidarInicioPressioneRadio}
              onTouchEnd={lidarSolturaRadio}
              onTouchCancel={lidarSolturaRadio}
              disabled={!!outroFalandoNome}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-xs transition-all select-none mr-1.5 shadow-2xs ${
                outroFalandoNome
                  ? 'bg-[var(--c-superficie-2)] text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-not-allowed'
                  : estadoRadio === 'falando' || estadoRadio === 'chamando'
                  ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-400'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
              }`}
              title={
                outroFalandoNome
                  ? `${outroFalandoNome} está falando no rádio`
                  : 'Segure para falar no Rádio PTT'
              }
              aria-label="Chamar no rádio"
            >
              <Radio className={`w-3.5 h-3.5 ${estadoRadio !== 'ocioso' ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {outroFalandoNome ? 'Ocupado' : estadoRadio !== 'ocioso' ? 'Ao vivo' : 'Rádio'}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  outroFalandoNome ? 'bg-amber-400' : 'bg-emerald-200'
                } animate-pulse`}
              />
            </button>

            {/* Lupa de busca */}
            <button
              type="button"
              id="botao-abrir-busca-chat"
              onClick={() => {
                setBuscaAberta(!buscaAberta);
                if (buscaAberta) setTermoBusca('');
              }}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                buscaAberta
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                  : 'text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]'
              }`}
              title="Buscar mensagens nesta conversa"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Menu ⋮ */}
            <div className="relative">
              <button
                type="button"
                id="botao-menu-opcoes-conversa"
                onClick={() => setMenuAberto(!menuAberto)}
                className="w-9 h-9 flex items-center justify-center text-[var(--c-texto-2)] rounded-full hover:bg-[var(--c-superficie-2)]"
                aria-label="Opções da conversa"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {menuAberto && (
                <div className="absolute right-0 top-10 w-52 bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl shadow-[var(--s-3)] py-1 z-30 divide-y divide-[var(--c-borda)] animate-in fade-in duration-100">
                  {/* "Selecionar mensagens" saiu daqui: a própria mensagem já
                      oferece Selecionar, e ter o mesmo comando em dois lugares
                      faz a pessoa procurar qual dos dois é o certo. */}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuAberto(false);
                      setModalDetalhesAberto(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]"
                  >
                    {conversa.tipo === 'grupo' ? 'Dados do grupo' : 'Ver perfil'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuAberto(false);
                      setBuscaAberta(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]"
                  >
                    Buscar na conversa
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Barra de Busca de Mensagens Interna */}
      {buscaAberta && (
        <div className="bg-[var(--c-superficie-2)] p-2 px-3 border-b border-[var(--c-borda)] flex items-center gap-2 animate-in slide-in-from-top duration-150 z-10">
          <Search className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
          <input
            type="text"
            id="campo-busca-conversa-texto"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="Buscar por peça, código ou mensagem..."
            className="flex-1 bg-transparent text-xs text-[var(--c-texto)] outline-none"
            autoFocus
          />
          {termoBusca && (
            <span className="text-[11px] text-[var(--c-texto-3)] font-mono">
              {mensagensExibidas.length} resultado(s)
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setBuscaAberta(false);
              setTermoBusca('');
            }}
            className="p-1 text-[var(--c-texto-3)] hover:text-[var(--c-texto)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notificação toast quando chamada vira recado automático */}
      {avisoRecadoTexto && (
        <div
          id="toast-aviso-recado"
          className="w-full bg-[var(--c-atencao)] text-[var(--c-sobre-acento)] text-xs font-medium px-4 py-2 text-center animate-in slide-in-from-top duration-200"
        >
          {avisoRecadoTexto}
        </div>
      )}

      {/* 2. Área de Mensagens (balões) */}
      {/*
        A faixa da mensagem fixada.

        Fica FORA da rolagem, colada no alto: uma mensagem fixada que rolasse
        junto com o resto some na primeira tela de conversa, e aí não fixa
        nada. Mostra a mais recente e diz quantas outras existem.
      */}
      {mensagensFixadas.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 bg-[var(--c-acento)]/8 border-b border-[var(--c-acento)]/25 flex items-start gap-2">
          <Pin className="w-3.5 h-3.5 text-[var(--c-acento)] flex-shrink-0 mt-0.5" />

          <button
            type="button"
            onClick={() => irParaMensagem(mensagensFixadas[0].id)}
            className="flex-1 min-w-0 text-left"
            title="Ir até a mensagem"
          >
            <span className="text-[10px] font-bold text-[var(--c-acento)] uppercase tracking-wider block">
              Fixada
              {mensagensFixadas.length > 1 && ` · e mais ${mensagensFixadas.length - 1}`}
              {(() => {
                // Quem fixou, para o grupo saber a quem pedir para tirar
                const quem = mensagensFixadas[0].fixadaPorId
                  ? bancoDados.obterColaboradorPorId(mensagensFixadas[0].fixadaPorId)
                  : null;
                return quem ? ` · por ${quem.nome}` : '';
              })()}
            </span>
            <span className="text-xs text-[var(--c-texto)] block truncate">
              {montarPreviaDaMensagem(mensagensFixadas[0])}
            </span>
          </button>

          {bancoDados.podeFixarMensagem(mensagensFixadas[0]) && (
            <button
              type="button"
              onClick={async () => {
                const res = await bancoDados.alternarFixarMensagem(mensagensFixadas[0].id);
                if (!res.sucesso) exibirToast(res.erro || 'Não foi possível desafixar.');
              }}
              className="p-1 rounded-lg text-[var(--c-texto-3)] hover:text-red-600 flex-shrink-0"
              title="Desafixar"
              aria-label="Desafixar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div
        ref={refLista}
        /**
         * `overflow-x-hidden` é a garantia final do "sempre alinhado".
         *
         * O conserto de verdade está nos `min-w-0` acima. Isto aqui existe
         * para o dia em que alguém acrescentar um conteúdo novo ao balão e
         * esquecer: em vez de a conversa inteira ganhar barra de rolagem
         * horizontal, só aquele conteúdo fica cortado.
         */
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3"
        onScroll={(e) => {
          /**
           * Quem subiu para ler o passado não pode ser arrancado de lá pela
           * próxima mensagem. A folga de 80px é para o caso comum de estar
           * "quase" no fim — ali ainda vale acompanhar.
           */
          const el = e.currentTarget;
          grudadoNoFim.current =
            el.scrollHeight - el.scrollTop - el.clientHeight <= 80;

          if (menuMensagem) fecharMenuMensagem();
          if (painelReacao) fecharPainelReacao();
        }}
      >
        {mensagensExibidas.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--c-texto-3)] text-sm">
            {termoBusca ? 'Nenhuma mensagem encontrada.' : 'Nenhuma mensagem ainda.'}
          </div>
        ) : (
          mensagensExibidas.map((msg, indiceDaMensagem) => {
            const ehMinha = msg.remetenteId === colaboradorAtual.id;
            const remetenteInfo = !ehMinha ? bancoDados.obterColaboradorPorId(msg.remetenteId) : null;
            // reacoes é gravado como { emoji: [idsDeQuemReagiu] }; aqui vira lista para exibir
            const reacoes = Object.entries(msg.reacoes || {})
              .filter(([, ids]) => ids.length > 0)
              .map(([emoji, ids]) => ({
                emoji,
                quantidade: ids.length,
                euReagi: ids.includes(colaboradorAtual.id),
              }));
            const estaSelecionada = mensagensSelecionadasIds.includes(msg.id);

            /**
             * Nas últimas mensagens o menu abre para CIMA.
             *
             * Abrindo para baixo, ele passaria do fim da conversa e ficaria
             * fora da tela — e é justamente nas mensagens recentes que as
             * pessoas apagam e encaminham.
             */

            // Fotos anexadas antes desta correção foram gravadas como arquivo.
            // Se o conteúdo é uma imagem, mostra como foto em vez de download.
            const ehFoto =
              msg.tipo === 'imagem' ||
              (msg.tipo === 'arquivo' &&
                (ehDataUrlDeImagem(msg.arquivoUrl) || ehNomeDeImagem(msg.arquivoNome)));
            const urlDaFoto = msg.tipo === 'imagem' ? msg.imagemUrl : msg.arquivoUrl;

            return (
              <div
                key={msg.id}
                id={`mensagem-${msg.id}`}
                onClick={modoSelecao ? () => alternarSelecaoMensagem(msg.id) : undefined}
                className={`flex flex-col group relative transition-colors ${
                  ehMinha ? 'items-end' : 'items-start'
                } ${modoSelecao ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 py-1 px-1 rounded-xl' : ''} ${
                  estaSelecionada ? 'bg-blue-500/10 dark:bg-blue-500/20 py-1 px-1 rounded-xl' : ''
                }`}
              >
                {/* Em GRUPO, acima da mensagem do outro aparece "Nome · Cargo" em cinza pequeno */}
                {!ehMinha && conversa.tipo === 'grupo' && remetenteInfo && (
                  <span className="text-xs text-[var(--c-texto-3)] mb-1 px-2">
                    {remetenteInfo.nome} · {remetenteInfo.cargo}
                  </span>
                )}

                {/* Linha da Mensagem com Checkbox (se em modo seleção) e Ações Rápidas (se hover) */}
                {/*
                  O `min-w-0` aqui e no balão é o que segura o layout.

                  Item de flex não encolhe abaixo do conteúdo dele por
                  padrão (`min-width: auto`). Então uma foto larga fazia o
                  balão ignorar o próprio `max-w`, esticar além da conversa
                  e criar barra de rolagem horizontal na lista inteira —
                  foi o que aconteceu com a foto do cadastro da peça.

                  Com `min-w-0`, o `max-w` do balão volta a valer e a foto
                  se ajusta a ele.
                */}
                <div
                  className={`flex items-center gap-2 max-w-full min-w-0 ${
                    ehMinha ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Checkbox em Modo de Seleção */}
                  {modoSelecao && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        alternarSelecaoMensagem(msg.id);
                      }}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all flex-shrink-0 ${
                        estaSelecionada
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-[var(--c-borda)] bg-[var(--c-superficie)] text-transparent hover:border-blue-400'
                      }`}
                      aria-label="Selecionar mensagem"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  )}

                  {/* Balão de Mensagem */}
                  <div
                    className={`relative max-w-[85%] sm:max-w-[70%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm shadow-[var(--s-1)] ${
                      ehMinha
                        ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] rounded-br-xs'
                        : 'bg-[var(--c-superficie)] text-[var(--c-texto)] border border-[var(--c-borda)] rounded-bl-xs'
                    }`}
                  >
                    {/*
                      A CITAÇÃO DA MENSAGEM RESPONDIDA.

                      Fica DENTRO do balão, no alto, e leva até a original ao
                      ser tocada. Citação que não leva a lugar nenhum obriga
                      a rolar procurando — que é o trabalho que responder
                      deveria poupar.

                      O texto é montado na hora a partir da mensagem
                      original. Copiá-lo junto pareceria mais simples e
                      criaria uma segunda verdade: original editado, e a
                      citação continuaria mostrando o que já não existe.
                    */}
                    {msg.respondendoA && (() => {
                      const citada = mensagens.find((m) => m.id === msg.respondendoA);
                      const autor = citada
                        ? bancoDados.obterColaboradorPorId(citada.remetenteId)
                        : undefined;

                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (citada) irAteMensagem(citada.id);
                          }}
                          disabled={!citada}
                          className={`w-full text-left mb-1.5 pl-2 py-1 border-l-[3px] rounded-r-md text-[11px] leading-snug ${
                            ehMinha
                              ? 'border-white/60 bg-white/15'
                              : 'border-[var(--c-acento)] bg-[var(--c-acento-suave)]'
                          } ${citada ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
                        >
                          <span
                            className={`block font-bold ${
                              ehMinha ? 'text-white/90' : 'text-[var(--c-acento)]'
                            }`}
                          >
                            {citada
                              ? autor?.nome || 'Colaborador'
                              : 'Mensagem apagada'}
                          </span>
                          <span
                            className={`block truncate ${
                              ehMinha ? 'text-white/75' : 'text-[var(--c-texto-2)]'
                            }`}
                          >
                            {citada
                              ? montarPreviaDaMensagem(citada)
                              : 'A mensagem original não está mais na conversa.'}
                          </span>
                        </button>
                      );
                    })()}

                    {/* Indicador de Mensagem Encaminhada */}
                    {msg.ehEncaminhada && (
                      <div
                        className={`flex items-center gap-1 text-[11px] mb-1 italic select-none font-medium ${
                          ehMinha ? 'text-white/80' : 'text-[var(--c-texto-3)]'
                        }`}
                      >
                        <Forward className="w-3 h-3 flex-shrink-0" />
                        <span>Encaminhada</span>
                      </div>
                    )}

                    {/* Tipo: Texto */}
                    {msg.tipo === 'texto' && editandoId !== msg.id && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed text-base sm:text-sm">
                        {msg.texto}
                      </p>
                    )}

                    {/* Edição acontece no próprio balão, para a pessoa ver o
                        texto no contexto da conversa enquanto reescreve. */}
                    {msg.tipo === 'texto' && editandoId === msg.id && (
                      <div className="flex flex-col gap-2 w-full min-w-0">
                        <textarea
                          id={`campo-edicao-${msg.id}`}
                          value={textoEditado}
                          onChange={(e) => setTextoEditado(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelarEdicao();
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              salvarEdicao(msg.id);
                            }
                          }}
                          rows={Math.min(6, textoEditado.split('\n').length + 1)}
                          autoFocus
                          className={`w-full rounded-lg px-2.5 py-2 text-sm resize-none outline-none border ${
                            ehMinha
                              ? 'bg-white/15 border-white/30 text-[var(--c-sobre-acento)] placeholder-white/50'
                              : 'bg-[var(--c-canvas)] border-[var(--c-borda)] text-[var(--c-texto)]'
                          }`}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelarEdicao}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                              ehMinha
                                ? 'text-white/80 hover:text-white hover:bg-white/15'
                                : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]'
                            }`}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            id={`botao-salvar-edicao-${msg.id}`}
                            onClick={() => salvarEdicao(msg.id)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                              ehMinha
                                ? 'bg-white text-[var(--c-acento)]'
                                : 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                            }`}
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tipo: Recado de Voz */}
                    {msg.tipo === 'recado_voz' && (
                      <div className="flex items-center gap-3 w-[220px] max-w-full py-1">
                        <button
                          type="button"
                          id={`botao-play-recado-${msg.id}`}
                          onClick={() => alternarReproducaoAudio(msg)}
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            ehMinha
                              ? 'bg-white/20 text-[var(--c-sobre-acento)] hover:bg-white/30'
                              : 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                          }`}
                          aria-label="Reproduzir recado de voz"
                        >
                          {audioTocandoId === msg.id ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 text-xs mb-1">
                            <span className="font-medium flex items-center gap-1 min-w-0">
                              <Volume2 className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">Recado de voz</span>
                            </span>
                            {/* Antes era montado como `0:0${segundos}`, que virava
                                "0:015" em qualquer recado de 10 segundos ou mais */}
                            <span className="font-mono tabular-nums flex-shrink-0">
                              {formatarSegundos(
                                audioTocandoId === msg.id && tempoAudioAtual[msg.id] !== undefined
                                  ? tempoAudioAtual[msg.id]
                                  : msg.audioDuracao || 0
                              )}
                            </span>
                          </div>

                          {/* Linha de progresso acompanhando a reprodução */}
                          <div
                            className={`h-1.5 rounded-full overflow-hidden ${
                              ehMinha ? 'bg-white/30' : 'bg-[var(--c-superficie-2)]'
                            }`}
                          >
                            <div
                              className={`h-full transition-all duration-200 ${
                                ehMinha ? 'bg-white' : 'bg-[var(--c-acento)]'
                              }`}
                              style={{
                                width: `${
                                  audioTocandoId === msg.id && msg.audioDuracao
                                    ? Math.min(
                                        100,
                                        ((tempoAudioAtual[msg.id] || 0) / msg.audioDuracao) * 100
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tipo: Arquivo (documentos; fotos caem no bloco de imagem) */}
                    {msg.tipo === 'arquivo' && !ehFoto && (
                      <div className="flex items-center gap-3 py-1 w-full min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            ehMinha ? 'bg-white/20' : 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]'
                          }`}
                        >
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{msg.arquivoNome}</p>
                          <span className="text-xs opacity-75">{msg.arquivoTamanho}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            lidarDownloadArquivo(msg.arquivoNome || 'documento', msg.arquivoUrl)
                          }
                          className="p-1.5 opacity-80 hover:opacity-100 rounded-lg hover:bg-black/10 transition-colors"
                          title="Baixar arquivo"
                          aria-label="Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Foto enviada antes do sistema guardar o conteúdo: a
                        imagem não existe, mas continua sendo uma foto — melhor
                        dizer isso do que oferecer um download que não entrega
                        nada. */}
                    {ehFoto && !urlDaFoto && (
                      <div className="flex items-center gap-3 w-[220px] max-w-full py-1">
                        <div
                          className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            ehMinha ? 'bg-white/20' : 'bg-[var(--c-superficie-2)]'
                          }`}
                        >
                          <ImageOff className="w-5 h-5 opacity-70" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {msg.legenda || msg.arquivoNome || 'Foto'}
                          </p>
                          <span
                            className={`text-[11px] leading-snug block ${
                              ehMinha ? 'text-white/75' : 'text-[var(--c-texto-3)]'
                            }`}
                          >
                            Foto indisponível · peça para reenviar
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Tipo: Imagem — foto da câmera ou anexada pelo clipe */}
                    {ehFoto && urlDaFoto && (
                      <div
                        /**
                         * Largura em PORCENTAGEM do balão, não em rem.
                         *
                         * Era `max-w-xs sm:max-w-sm` — 384px a partir do
                         * `sm:`. E `sm:` responde ao tamanho da JANELA, não
                         * ao do balão: numa conversa flutuante de 420px a
                         * foto pedia 384px dentro de um balão de 270px, e o
                         * `min-w-[180px]` ainda impedia o encolhimento.
                         */
                        className="flex flex-col gap-1.5 py-1 w-full max-w-full min-w-0"
                      >
                        <div
                          onClick={() =>
                            setImagemAmpliada({
                              url: urlDaFoto,
                              legenda: msg.legenda,
                            })
                          }
                          className="relative rounded-xl overflow-hidden cursor-pointer group/foto max-h-72 bg-black/10 border border-black/5 dark:border-white/10"
                          title="Clique para ampliar a foto"
                        >
                          <img
                            src={urlDaFoto}
                            alt={msg.legenda || 'Foto'}
                            className="w-full max-w-full h-auto max-h-72 object-cover transition-transform duration-200 group-hover/foto:scale-[1.02]"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover/foto:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/foto:opacity-100">
                            <span className="bg-black/75 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-xs flex items-center gap-1 font-medium shadow-md">
                              <ZoomIn className="w-3.5 h-3.5" />
                              Ampliar Foto
                            </span>
                          </div>
                        </div>

                        {msg.legenda && (
                          <p
                            className={`text-xs sm:text-sm font-medium px-0.5 leading-snug break-words ${
                              ehMinha ? 'text-white' : 'text-[var(--c-texto)]'
                            }`}
                          >
                            {msg.legenda}
                          </p>
                        )}
                      </div>
                    )}

                    {/*
                      A LINHA DE BAIXO DO BALÃO É SÓ INFORMAÇÃO: edição, hora
                      e selo de envio. Nada de botão.

                      O botão de reagir ficava aqui, e era o que deformava o
                      balão. O balão tem a largura do maior filho — com
                      "Editada" no meio, esta linha passava a ser mais larga
                      que o próprio texto, o balão esticava e o emoji ficava
                      colado na borda de dentro, com cara de defeito. Foi
                      exatamente o que apareceu em "Essa já chegou ?".

                      Só texto miúdo aqui, e a linha volta a caber embaixo de
                      quase qualquer mensagem. Reagir virou ação, e ação mora
                      no menu — como as outras seis.

                      O `flex-wrap` é a garantia do "sempre": numa janela
                      estreita, com "Editada" e o selo de visto juntos, a
                      linha passa para baixo em vez de transbordar o balão.
                      Transbordar é o que produz a aparência de defeito.
                    */}
                    <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 mt-1 select-none">
                      {/* Marca de edição: quem lê precisa saber que o texto
                          mudou depois de enviado. */}
                      {msg.editadaEm && (
                        <span
                          title={`Editada às ${new Date(msg.editadaEm).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`}
                          className={`text-[10px] italic ${
                            ehMinha ? 'text-white/70' : 'text-[var(--c-texto-3)]'
                          }`}
                        >
                          Editada
                        </span>
                      )}

                      <span
                        className={`text-[10px] font-mono ${
                          ehMinha ? 'text-white/80' : 'text-[var(--c-texto-3)]'
                        }`}
                      >
                        {msg.horaFormatada}
                      </span>

                      {/*
                        O SELO DO ENVIO.

                        A mensagem aparece na tela antes de o banco confirmar,
                        para a caixa não ficar parada. O relógio diz que ainda
                        está subindo, e o triângulo diz que não subiu — sem
                        ele, "apareceu" pareceria "enviado", que é pior do
                        que a espera. Se o banco recusar, a mensagem some — e
                        o aviso de erro explica por quê.
                      */}
                      {ehMinha && msg.envio === 'enviando' && (
                        <span className="inline-flex items-center ml-0.5" title="Enviando…">
                          <Clock className="w-3.5 h-3.5 text-white/70 animate-pulse" />
                        </span>
                      )}

                      {/* Confirmação de Visualização (Visto / Lido) */}
                      {ehMinha && !msg.envio && (
                        <span
                          className="inline-flex items-center ml-0.5"
                          title={
                            msg.lida
                              ? `Visualizada${
                                  msg.visualizadaEm
                                    ? ` em ${new Date(msg.visualizadaEm).toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}`
                                    : ''
                                }`
                              : 'Entregue'
                          }
                        >
                          <CheckCheck
                            className={`w-3.5 h-3.5 ${
                              msg.lida
                                ? 'text-sky-300 dark:text-sky-400'
                                : 'text-white/60'
                            }`}
                          />
                        </span>
                      )}
                    </div>

                  </div>

                  {/*
                    AS AÇÕES DA MENSAGEM FICAM ATRÁS DE UM BOTÃO SÓ.

                    Antes o computador mostrava as seis de uma vez — responder,
                    fixar, encaminhar, selecionar, editar, apagar — numa
                    fileira de ícones sem rótulo que aparecia a cada passada
                    de mouse. Seis alvos pequenos e parecidos ao lado de cada
                    balão: a conversa virava painel de controle, e escolher
                    exigia parar para decifrar qual desenho era qual.

                    E havia DOIS menus para o mesmo conjunto: a fileira do
                    computador e este painel, escrito para o celular. Duas
                    listas da mesma coisa é como funções passam a divergir —
                    já aconteceu aqui com setor, ficha e alçada.

                    Agora é um só, com rótulo em texto, nos dois aparelhos. No
                    computador ele aparece ao passar o mouse; no celular fica
                    sempre à mão, porque `group-hover` nunca dispara em toque.
                  */}
                  {!modoSelecao && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (menuMensagem?.msg.id === msg.id) {
                          fecharMenuMensagem();
                          return;
                        }
                        // O canto do botão é a âncora; quem decide de que
                        // lado o menu cabe é o cálculo na hora de desenhar
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenuMensagem({ msg, x: r.left, y: r.bottom });
                      }}
                      className="w-7 h-7 rounded-full bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto-2)] flex items-center justify-center flex-shrink-0 active:scale-95 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-all"
                      title="Opções da mensagem"
                      aria-label="Opções da mensagem"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  )}

                </div>

                {/* Badges de Reações Exibidas */}
                {reacoes.length > 0 && (
                  <div
                    className={`flex items-center gap-1 mt-1 ${
                      ehMinha ? 'justify-end pr-1' : 'justify-start pl-1'
                    }`}
                  >
                    {reacoes.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => lidarReagirMensagem(msg.id, r.emoji)}
                        title={r.euReagi ? 'Remover sua reação' : 'Reagir'}
                        className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full shadow-xs hover:scale-105 transition-transform ${
                          r.euReagi
                            ? 'bg-[var(--c-acento-suave)] border border-[var(--c-acento)]'
                            : 'bg-[var(--c-superficie)] border border-[var(--c-borda)]'
                        }`}
                      >
                        <span>{r.emoji}</span>
                        <span className="font-semibold text-[10px] text-[var(--c-texto-2)]">
                          {r.quantidade}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={refFimMensagens} />
      </div>

      {/*
        O MENU DAS AÇÕES — um só, para computador e celular, e FORA da lista.

        Ele morava dentro da lista de mensagens, posicionado em relação ao
        balão. Duas consequências, as duas relatadas por quem usa: perto do
        topo da conversa ele saía CORTADO ao meio pela borda da lista, que
        tem `overflow`; e abrir um menu alto atrapalhava a rolagem.

        Aqui fora, ancorado na janela pelo canto do botão, não há borda que o
        corte. O cálculo abaixo só garante que ele não passe do rodapé nem da
        lateral: se não couber embaixo, abre para cima.

        A rolagem FECHA o menu — a âncora é um ponto da tela, e rolar move o
        botão para longe dela.
      */}
      {menuMensagem && (() => {
        const msg = menuMensagem.msg;

        const itens: React.ReactNode[] = [];

        /**
         * Reagir vem PRIMEIRO e é a ação mais leve das sete: não escreve
         * nada, não move nada, e é a que se usa para dizer "recebi" sem
         * ocupar a conversa com mais uma mensagem.
         *
         * Ela morava no rodapé do balão, e era de lá que vinha a deformação
         * do layout. Aqui dentro não disputa largura com o texto.
         */
        itens.push(
          <ItemDoMenu
            key="reagir"
            icone={<Smile className="w-3.5 h-3.5" />}
            rotulo="Reagir"
            aoClicar={() => {
              const ancora = { msg, x: menuMensagem.x, y: menuMensagem.y };
              fecharMenuMensagem();
              setPainelReacao(ancora);
            }}
          />
        );

        if (podePublicar) {
          itens.push(
            <ItemDoMenu
              key="responder"
              icone={<Reply className="w-3.5 h-3.5" />}
              rotulo="Responder"
              aoClicar={() => responderMensagem(msg)}
            />
          );
        }
        if (bancoDados.podeFixarMensagem(msg)) {
          itens.push(
            <ItemDoMenu
              key="fixar"
              icone={
                msg.fixadaEm ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />
              }
              rotulo={msg.fixadaEm ? 'Desafixar' : 'Fixar para todos'}
              aoClicar={async () => {
                fecharMenuMensagem();
                const res = await bancoDados.alternarFixarMensagem(msg.id);
                if (!res.sucesso) exibirToast(res.erro || 'Não foi possível fixar.');
                else
                  exibirToast(
                    res.fixada ? 'Fixada no alto da conversa, para todos.' : 'Desafixada.'
                  );
              }}
            />
          );
        }
        itens.push(
          <ItemDoMenu
            key="encaminhar"
            icone={<Forward className="w-3.5 h-3.5" />}
            rotulo="Encaminhar"
            aoClicar={() => {
              fecharMenuMensagem();
              abrirModalEncaminhar([msg.id]);
            }}
          />,
          <ItemDoMenu
            key="selecionar"
            icone={<CheckSquare className="w-3.5 h-3.5" />}
            rotulo="Selecionar"
            aoClicar={() => {
              fecharMenuMensagem();
              setModoSelecao(true);
              setMensagensSelecionadasIds([msg.id]);
            }}
          />
        );
        if (bancoDados.podeEditarMensagem(msg)) {
          itens.push(
            <ItemDoMenu
              key="editar"
              icone={<Pencil className="w-3.5 h-3.5" />}
              rotulo="Editar"
              aoClicar={() => {
                fecharMenuMensagem();
                iniciarEdicao(msg);
              }}
            />
          );
        }
        if (bancoDados.podeExcluirMensagem(msg)) {
          itens.push(
            <ItemDoMenu
              key="apagar"
              icone={<Trash2 className="w-3.5 h-3.5" />}
              rotulo="Apagar"
              perigo
              aoClicar={() => {
                fecharMenuMensagem();
                setMensagemParaExcluir(msg);
              }}
            />
          );
        }

        // Cabe embaixo? Senão abre para cima. E nunca passa da lateral.
        const altura = itens.length * MENU_ALTURA_ITEM + 8;
        const cabeAbaixo = menuMensagem.y + altura + 12 <= window.innerHeight;
        const topo = cabeAbaixo ? menuMensagem.y + 6 : Math.max(8, menuMensagem.y - altura - 40);
        const esquerda = Math.min(
          Math.max(8, menuMensagem.x),
          window.innerWidth - MENU_LARGURA - 8
        );

        return (
          <>
            <div className="fixed inset-0 z-[60]" onClick={fecharMenuMensagem} />
            <div
              id="menu-acoes-mensagem"
              style={{ top: topo, left: esquerda, width: MENU_LARGURA }}
              className="fixed z-[61] py-1 rounded-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {itens}
            </div>
          </>
        );
      })()}

      {/*
        O PAINEL DE EMOJI — fora da lista, igual ao menu de ações.

        O seletor antigo era `absolute -top-9` dentro da mensagem: na
        primeira mensagem da conversa ele abria para cima e a borda da lista
        o cortava. Mesmo defeito do menu, mesma correção — e o mesmo cálculo,
        para não haver duas contas de "cabe embaixo?" discordando.
      */}
      {painelReacao && (() => {
        const cabeAbaixo =
          painelReacao.y + PAINEL_EMOJI_ALTURA + 12 <= window.innerHeight;
        const topo = cabeAbaixo
          ? painelReacao.y + 6
          : Math.max(8, painelReacao.y - PAINEL_EMOJI_ALTURA - 40);
        const esquerda = Math.min(
          Math.max(8, painelReacao.x),
          window.innerWidth - PAINEL_EMOJI_LARGURA - 8
        );

        return (
          <>
            <div className="fixed inset-0 z-[60]" onClick={fecharPainelReacao} />
            <div
              id="painel-emoji-reacao"
              style={{ top: topo, left: esquerda, width: PAINEL_EMOJI_LARGURA }}
              className="fixed z-[61] p-2 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS_DE_REACAO.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      lidarReagirMensagem(painelReacao.msg.id, emoji);
                      fecharPainelReacao();
                    }}
                    className="h-[30px] text-lg leading-none rounded-md hover:bg-[var(--c-superficie-2)] active:scale-90 transition-transform"
                    title={`Reagir com ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* 3. Rodapé com Ação: Câmera à esquerda, Barra de Texto no meio e Anexo no outro lado */}
      {podePublicar ? (
        <footer className="w-full bg-[var(--c-superficie)] border-t border-[var(--c-borda)] p-3 flex flex-col gap-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          {/*
            A CITAÇÃO ENQUANTO A RESPOSTA É ESCRITA.

            Fica acima da caixa, e não dentro dela: a caixa é o lugar do que
            se está escrevendo, e misturar as duas coisas faria a citação
            parecer texto a ser apagado.

            O X sai da resposta sem apagar o que já foi digitado — desistir
            de citar não é desistir de escrever.
          */}
          {respondendoId && (() => {
            const citada = mensagens.find((m) => m.id === respondendoId);
            if (!citada) return null;
            const autor = bancoDados.obterColaboradorPorId(citada.remetenteId);

            return (
              <div className="flex items-center gap-2 bg-[var(--c-superficie-2)] border-l-[3px] border-[var(--c-acento)] rounded-r-lg px-2.5 py-1.5">
                <div className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold text-[var(--c-acento)]">
                    Respondendo {autor?.nome || 'Colaborador'}
                  </span>
                  <span className="block text-xs text-[var(--c-texto-2)] truncate">
                    {montarPreviaDaMensagem(citada)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRespondendoId(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:bg-[var(--c-canvas)] flex-shrink-0"
                  title="Deixar de responder"
                  aria-label="Deixar de responder"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })()}

          {/* Linha de digitação de texto com câmera à esquerda, texto no meio e anexo no outro lado */}
          <div className="flex items-center gap-2">
            {/* Lado Esquerdo: Botão de Tirar Foto com a Câmera */}
            <button
              type="button"
              id="botao-abrir-camera-chat"
              onClick={() => setModalCameraAberto(true)}
              className="w-11 h-11 flex items-center justify-center text-[var(--c-texto-2)] hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-[var(--c-superficie-2)] flex-shrink-0 transition-colors"
              title="Tirar foto da peça com a câmera"
              aria-label="Tirar foto com a câmera"
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* Centro: Barra de Texto no Meio */}
            <form
              onSubmit={lidarEnvioTexto}
              autoComplete="off"
              className="flex-1 flex items-center gap-2 min-w-0"
            >
              <input
                id="campo-mensagem-texto"
                type="text"
                value={textoMensagem}
                onChange={(e) => setTextoMensagem(e.target.value)}
                placeholder="Mensagem"
                /**
                 * O navegador abria uma lista com tudo que já foi digitado
                 * aqui, por cima da conversa. É o histórico de formulário
                 * dele, não uma função nossa — e num campo de conversa não
                 * serve para nada: ninguém quer reenviar a mensagem de
                 * ontem, e a lista tapa justamente o que se está lendo.
                 */
                autoComplete="off"
                className="w-full bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-base sm:text-sm rounded-full px-4 py-2.5 outline-none border border-transparent focus:border-[var(--c-acento)] placeholder:text-[var(--c-texto-3)] min-h-[44px]"
              />
            </form>

            {/* Outro Lado (Direita): Botão de Anexar Arquivo */}
            <input
              type="file"
              ref={refInputArquivo}
              onChange={lidarEnvioArquivo}
              className="hidden"
              id="input-anexo-arquivo"
            />
            <button
              type="button"
              id="botao-anexo"
              onClick={() => refInputArquivo.current?.click()}
              className="w-11 h-11 flex items-center justify-center text-[var(--c-texto-2)] hover:text-[var(--c-texto)] rounded-full hover:bg-[var(--c-superficie-2)] flex-shrink-0 transition-colors"
              title="Enviar arquivo ou documento"
              aria-label="Enviar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Botão de Enviar (visível quando há texto digitado) */}
            {textoMensagem.trim() && (
              <button
                type="button"
                onClick={lidarEnvioTexto}
                id="botao-enviar-mensagem"
                className="w-11 h-11 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                aria-label="Enviar mensagem"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            )}
          </div>
        </footer>
      ) : (
        /* Se não pode publicar (ex: Avisos da Rede para operador), respeita: sem cadeado, sem aviso */
        <footer className="w-full bg-[var(--c-superficie)] border-t border-[var(--c-borda)] p-3 text-center text-xs text-[var(--c-texto-3)] pb-[max(12px,env(safe-area-inset-bottom))]">
          Somente a gestão pode publicar avisos.
        </footer>
      )}

      {/* Overlay do Rádio ao Vivo em tela cheia ao segurar o botão */}
      <TelaRadioAoVivo
        estado={estadoRadio}
        colaboradorAlvo={colegaDestinatario}
        nomeConversa={conversa.nome}
        fotoConversa={conversa.foto}
        volumeVoz={volumeVoz}
        nomeQuemFala={outroFalandoNome || undefined}
      />

      {/* Modal de Detalhes da Conversa / Grupo / Contato */}
      {modalDetalhesAberto && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setModalDetalhesAberto(false)}
        >
          <div
            className="bg-[var(--c-superficie)] w-full max-w-md rounded-2xl border border-[var(--c-borda)] shadow-xl overflow-hidden animate-in zoom-in-95 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo do Modal */}
            <div className="relative bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex flex-col items-center text-center flex-shrink-0">
              <button
                type="button"
                onClick={() => setModalDetalhesAberto(false)}
                className="absolute right-4 top-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-20 h-20 rounded-full border-4 border-white overflow-hidden shadow-lg mb-3 bg-white/10 flex items-center justify-center">
                {conversa.foto || colegaDestinatario?.foto ? (
                  <img
                    src={conversa.foto || colegaDestinatario?.foto}
                    alt={conversa.nome}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-2xl font-bold text-white">
                    {conversa.nome.charAt(0)}
                  </span>
                )}
              </div>

              <h3 className="text-lg font-bold">{conversa.nome}</h3>
              <p className="text-xs text-blue-200">
                {conversa.tipo === 'individual' && colegaDestinatario
                  ? `${colegaDestinatario.cargo} · Loja ${colegaDestinatario.loja}`
                  : conversa.tipo === 'grupo'
                  ? `Grupo Interno Malachias · ${conversa.participantesIds.length} colaboradores`
                  : 'Canal Oficial'}
              </p>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs sm:text-sm">
              {conversa.tipo === 'individual' && colegaDestinatario ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                      <span className="text-[11px] text-[var(--c-texto-3)] block font-medium">
                        Loja / Unidade
                      </span>
                      <strong className="text-[var(--c-texto)]">{colegaDestinatario.loja}</strong>
                    </div>
                    <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                      <span className="text-[11px] text-[var(--c-texto-3)] block font-medium">
                        Setor
                      </span>
                      <strong className="text-[var(--c-texto)]">{colegaDestinatario.setor}</strong>
                    </div>
                    <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                      <span className="text-[11px] text-[var(--c-texto-3)] block font-medium">
                        Ramal Telefônico
                      </span>
                      <strong className="text-blue-600 dark:text-blue-400 font-mono">
                        {colegaDestinatario.ramal || 'Sem ramal'}
                      </strong>
                    </div>
                    <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)]">
                      <span className="text-[11px] text-[var(--c-texto-3)] block font-medium">
                        Presença Agora
                      </span>
                      <strong className="capitalize text-[var(--c-texto)]">
                        {colegaDestinatario.presenca}
                      </strong>
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] text-xs">
                    Visto por último: {colegaDestinatario.vistoPorUltimo}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <span className="font-bold text-xs text-[var(--c-texto-2)] uppercase tracking-wider">
                    Participantes do Grupo ({participantesGrupo.length})
                  </span>

                  <div className="divide-y divide-[var(--c-borda)] border border-[var(--c-borda)] rounded-xl overflow-hidden">
                    {participantesGrupo.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 flex items-center justify-between hover:bg-[var(--c-superficie-2)]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={p.foto}
                            alt={p.nome}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <strong className="text-xs text-[var(--c-texto)] block truncate">
                              {p.nome}
                            </strong>
                            <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
                              {p.cargo} · {p.loja}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            p.presenca === 'disponivel'
                              ? 'bg-emerald-500'
                              : p.presenca === 'ocupado'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setModalDetalhesAberto(false)}
                className="w-full py-2.5 rounded-xl bg-[var(--c-superficie-2)] hover:bg-[var(--c-borda)] font-semibold text-xs text-[var(--c-texto)] transition-colors mt-2"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal da Câmera ao Vivo para Tirar Foto */}
      <ModalCamera
        aberto={modalCameraAberto}
        aoFechar={() => setModalCameraAberto(false)}
        aoConfirmarFoto={lidarConfirmarFoto}
      />

      {/* Modal Visualizador / Lightbox de Imagem Ampliada */}
      <ModalVisualizadorImagem
        imagemUrl={imagemAmpliada?.url || null}
        legenda={imagemAmpliada?.legenda}
        aoFechar={() => setImagemAmpliada(null)}
      />

      {/* Modal de Encaminhamento de Mensagens */}
      <ModalEncaminharMensagem
        aberto={modalEncaminharAberto}
        mensagensIds={mensagensParaEncaminhar}
        aoFechar={() => setModalEncaminharAberto(false)}
        aoSucesso={lidarSucessoEncaminhamento}
      />

      {/* Confirmação de exclusão de mensagem */}
      {mensagemParaExcluir && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setMensagemParaExcluir(null)}
        >
          <div
            className="bg-[var(--c-superficie)] w-full max-w-sm rounded-2xl border border-[var(--c-borda)] shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-600 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-[var(--c-texto)]">Apagar mensagem?</h3>
              <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
                {mensagemParaExcluir.remetenteId === colaboradorAtual.id
                  ? 'A mensagem sai da conversa para todos os participantes e não pode ser recuperada.'
                  : 'Você está apagando a mensagem de outro colaborador. A ação fica registrada na auditoria.'}
              </p>
            </div>

            <div className="p-4 pt-0 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMensagemParaExcluir(null)}
                className="py-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-borda-forte)] transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="botao-confirmar-exclusao-mensagem"
                onClick={async () => {
                  const res = await bancoDados.excluirMensagem(mensagemParaExcluir.id);
                  setMensagemParaExcluir(null);
                  exibirToast(res.sucesso ? 'Mensagem apagada.' : res.erro || 'Falha ao apagar.');
                }}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold active:scale-[0.99] transition-all"
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de Feedback Notificando Ação Realizada */}
      {toastFeedback && (
        <div
          id="toast-feedback-chat"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--c-superficie)] text-[var(--c-texto)] border border-[var(--c-borda)] shadow-xl px-4 py-2.5 rounded-full text-xs font-medium flex items-center gap-2 animate-in slide-in-from-bottom-3 fade-in duration-200"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{toastFeedback}</span>
        </div>
      )}
    </div>
  );
};
