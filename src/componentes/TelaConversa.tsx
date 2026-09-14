import React, { useState, useEffect, useRef } from 'react';
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
  Copy,
  CheckSquare,
} from 'lucide-react';
import {
  Conversa,
  Colaborador,
  Mensagem,
  EstadoTransmissaoRadio,
} from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { servicoAudioRadio } from '../servicos/audioRadio';
import { TelaRadioAoVivo } from './TelaRadioAoVivo';
import { ModalCamera } from './ModalCamera';
import { ModalVisualizadorImagem } from './ModalVisualizadorImagem';
import { ModalEncaminharMensagem } from './ModalEncaminharMensagem';

interface PropsTelaConversa {
  conversa: Conversa;
  colaboradorAtual: Colaborador;
  aoVoltar: () => void;
}

const REACOES_RAPIDAS = ['👍', '✅', '📦', '🚗'];

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
  const [mensagemReagindoId, setMensagemReagindoId] = useState<string | null>(null);
  const [modalCameraAberto, setModalCameraAberto] = useState(false);
  const [imagemAmpliada, setImagemAmpliada] = useState<{ url: string; legenda?: string } | null>(null);

  // Estados para Seleção e Encaminhamento de Mensagens
  const [modoSelecao, setModoSelecao] = useState(false);
  const [mensagensSelecionadasIds, setMensagensSelecionadasIds] = useState<string[]>([]);
  const [modalEncaminharAberto, setModalEncaminharAberto] = useState(false);
  const [mensagensParaEncaminhar, setMensagensParaEncaminhar] = useState<string[]>([]);
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);

  /** Aviso rápido no rodapé da conversa. */
  const exibirToast = (texto: string) => {
    setToastFeedback(texto);
    setTimeout(() => setToastFeedback(null), 4000);
  };

  const refFimMensagens = useRef<HTMLDivElement>(null);
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

  // Rola para a última mensagem sempre que chegarem novas
  useEffect(() => {
    refFimMensagens.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

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
  const lidarEnvioTexto = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textoLimpo = textoMensagem.trim();
    if (!textoLimpo) return;

    bancoDados.enviarMensagem(conversa.id, {
      tipo: 'texto',
      texto: textoLimpo,
    });
    setTextoMensagem('');
  };

  /**
   * Envio de arquivo anexado. O conteúdo vai junto em data URL — antes só o
   * nome e o tamanho eram guardados, e o download entregava um texto no lugar
   * do arquivo original.
   */
  const LIMITE_ANEXO_BYTES = 2 * 1024 * 1024; // 2 MB

  const lidarEnvioArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = e.target.files;
    if (!arquivos || arquivos.length === 0) return;
    const arquivo = arquivos[0];

    const limparCampo = () => {
      if (refInputArquivo.current) refInputArquivo.current.value = '';
    };

    if (arquivo.size > LIMITE_ANEXO_BYTES) {
      exibirToast('Arquivo acima de 2 MB. Envie um menor ou compartilhe o link.');
      limparCampo();
      return;
    }

    const tamanhoKb = Math.round(arquivo.size / 1024);
    const tamanhoFormatado =
      tamanhoKb > 1024 ? `${(tamanhoKb / 1024).toFixed(1)} MB` : `${tamanhoKb} KB`;

    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = bancoDados.enviarMensagem(conversa.id, {
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

      const enviado = bancoDados.enviarMensagem(conversa.id, {
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
    setMensagemReagindoId(null);
  };

  const lidarConfirmarFoto = (fotoDataUrl: string, legenda?: string) => {
    bancoDados.enviarMensagem(conversa.id, {
      tipo: 'imagem',
      imagemUrl: fotoDataUrl,
      legenda: legenda,
    });
  };

  // Mensagens filtradas se busca estiver ativa
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

            {/* Foto clicável para abrir detalhes */}
            <div
              onClick={() => setModalDetalhesAberto(true)}
              className="relative w-10 h-10 rounded-full overflow-hidden bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex-shrink-0 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
              title="Ver detalhes"
            >
              {conversa.foto || colegaDestinatario?.foto ? (
                <img
                  src={conversa.foto || colegaDestinatario?.foto}
                  alt={conversa.nome}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="font-semibold text-sm text-[var(--c-texto-2)]">
                  {conversa.nome.charAt(0)}
                </span>
              )}
              {/* Presença para conversa individual */}
              {colegaDestinatario && (
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[var(--c-superficie)] ${
                    colegaDestinatario.presenca === 'disponivel'
                      ? 'bg-[var(--c-ok)]'
                      : colegaDestinatario.presenca === 'ocupado'
                      ? 'bg-[var(--c-atencao)]'
                      : 'bg-[var(--c-texto-3)]'
                  }`}
                />
              )}
            </div>

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
                  <button
                    type="button"
                    onClick={() => {
                      setMenuAberto(false);
                      setModoSelecao(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] flex items-center gap-2"
                  >
                    <CheckSquare className="w-4 h-4 text-[var(--c-texto-3)]" />
                    Selecionar mensagens
                  </button>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {mensagensExibidas.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--c-texto-3)] text-sm">
            {termoBusca ? 'Nenhuma mensagem encontrada.' : 'Nenhuma mensagem ainda.'}
          </div>
        ) : (
          mensagensExibidas.map((msg) => {
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
                <div
                  className={`flex items-center gap-2 max-w-full ${
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
                    className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm shadow-[var(--s-1)] ${
                      ehMinha
                        ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] rounded-br-xs'
                        : 'bg-[var(--c-superficie)] text-[var(--c-texto)] border border-[var(--c-borda)] rounded-bl-xs'
                    }`}
                  >
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
                    {msg.tipo === 'texto' && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed text-base sm:text-sm">
                        {msg.texto}
                      </p>
                    )}

                    {/* Tipo: Recado de Voz */}
                    {msg.tipo === 'recado_voz' && (
                      <div className="flex items-center gap-3 min-w-[200px] py-1">
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
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium flex items-center gap-1">
                              <Volume2 className="w-3.5 h-3.5 inline" />
                              Recado de voz
                            </span>
                            <span className="font-mono">
                              {audioTocandoId === msg.id && tempoAudioAtual[msg.id] !== undefined
                                ? `0:0${tempoAudioAtual[msg.id]}`
                                : `0:0${msg.audioDuracao || 3}`}
                            </span>
                          </div>
                          {/* Linha de progresso */}
                          <div
                            className={`h-1.5 rounded-full overflow-hidden ${
                              ehMinha ? 'bg-white/30' : 'bg-[var(--c-superficie-2)]'
                            }`}
                          >
                            <div
                              className={`h-full transition-all duration-200 ${
                                ehMinha ? 'bg-white' : 'bg-[var(--c-acento)]'
                              } ${audioTocandoId === msg.id ? 'w-full animate-pulse' : 'w-1/3'}`}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tipo: Arquivo */}
                    {msg.tipo === 'arquivo' && (
                      <div className="flex items-center gap-3 py-1 min-w-[200px]">
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

                    {/* Tipo: Imagem / Foto tirada pela câmera */}
                    {msg.tipo === 'imagem' && msg.imagemUrl && (
                      <div className="flex flex-col gap-1.5 py-1 min-w-[180px] max-w-xs sm:max-w-sm">
                        <div
                          onClick={() =>
                            setImagemAmpliada({
                              url: msg.imagemUrl!,
                              legenda: msg.legenda,
                            })
                          }
                          className="relative rounded-xl overflow-hidden cursor-pointer group/foto max-h-72 bg-black/10 border border-black/5 dark:border-white/10"
                          title="Clique para ampliar a foto"
                        >
                          <img
                            src={msg.imagemUrl}
                            alt={msg.legenda || 'Foto'}
                            className="w-full h-auto max-h-72 object-cover transition-transform duration-200 group-hover/foto:scale-[1.02]"
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

                    {/* Horário, Reação e Confirmação de Visualização */}
                    <div className="flex items-center justify-end gap-1.5 mt-1 select-none">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMensagemReagindoId(mensagemReagindoId === msg.id ? null : msg.id);
                        }}
                        className={`text-xs opacity-60 hover:opacity-100 transition-opacity ${
                          ehMinha ? 'text-white' : 'text-[var(--c-texto-3)]'
                        }`}
                        title="Reagir com emoji"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>

                      <span
                        className={`text-[10px] font-mono ${
                          ehMinha ? 'text-white/80' : 'text-[var(--c-texto-3)]'
                        }`}
                      >
                        {msg.horaFormatada}
                      </span>

                      {/* Confirmação de Visualização (Visto / Lido) */}
                      {ehMinha && (
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

                    {/* Picker de Reações Rápidas */}
                    {mensagemReagindoId === msg.id && (
                      <div
                        className={`absolute -top-9 ${
                          ehMinha ? 'right-0' : 'left-0'
                        } bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-full px-2 py-1 flex items-center gap-1.5 shadow-lg z-30 animate-in zoom-in-90`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {REACOES_RAPIDAS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => lidarReagirMensagem(msg.id, emoji)}
                            className="text-base hover:scale-125 transition-transform p-0.5"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ações Rápidas ao passar o mouse ou focar (Encaminhar e Selecionar) */}
                  {!modoSelecao && (
                    <div
                      className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => abrirModalEncaminhar([msg.id])}
                        className="w-7 h-7 rounded-full bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-blue-600 hover:bg-[var(--c-superficie-2)] flex items-center justify-center shadow-xs transition-colors"
                        title="Encaminhar esta mensagem"
                        aria-label="Encaminhar mensagem"
                      >
                        <Forward className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModoSelecao(true);
                          setMensagensSelecionadasIds([msg.id]);
                        }}
                        className="w-7 h-7 rounded-full bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] flex items-center justify-center shadow-xs transition-colors"
                        title="Selecionar mensagem"
                        aria-label="Selecionar"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

      {/* 3. Rodapé com Ação: Câmera à esquerda, Barra de Texto no meio e Anexo no outro lado */}
      {podePublicar ? (
        <footer className="w-full bg-[var(--c-superficie)] border-t border-[var(--c-borda)] p-3 flex flex-col gap-2 pb-[max(12px,env(safe-area-inset-bottom))]">
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
            <form onSubmit={lidarEnvioTexto} className="flex-1 flex items-center gap-2 min-w-0">
              <input
                id="campo-mensagem-texto"
                type="text"
                value={textoMensagem}
                onChange={(e) => setTextoMensagem(e.target.value)}
                placeholder="Mensagem"
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
