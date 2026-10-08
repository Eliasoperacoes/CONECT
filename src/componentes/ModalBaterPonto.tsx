/**
 * Modal de batida de ponto — CONECTA / Malachias Autopeças
 *
 * A câmera abre já lendo: o funcionário aponta para o QR da loja e o registro
 * acontece sozinho, sem botão de confirmar. Se a câmera não estiver disponível
 * ou o QR estiver danificado, o mesmo modal aceita o código de 6 caracteres
 * impresso embaixo do QR — nunca fica sem saída.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  ReceiptText,
  X,
  QrCode,
  Keyboard,
  CheckCircle2,
  AlertCircle,
  CameraOff,
  Inbox,
  Loader2,
} from 'lucide-react';
import { temComprovante } from '../servicos/comprovanteDeBatida';
import { RegistroPonto, ROTULO_MARCACAO, ROTULO_FORA_DA_JORNADA, precisaEscolherTurno } from '../tipos';
import { servicoPonto, dataDeHoje } from '../servicos/ponto';
import { bancoDados } from '../servicos/bancoDados';
import { enviarAnexo } from '../servicos/anexos';
import { abrirFluxo, soltarFluxo, assinarRetomada, CAPA_VAZIA_DO_VIDEO } from '../servicos/midia';
import { CardJustificarBatida } from './CardJustificarBatida';
import { EscolherTurno } from './EscolherTurno';
import { useVoltar } from '../servicos/voltar';
import { RelogioDaMarcacao } from './RelogioDaMarcacao';

interface PropsModalBaterPonto {
  aberto: boolean;
  /**
   * O código que já veio lido, quando a pessoa chegou pelo link do cartaz.
   *
   * Com ele a câmera nem precisa abrir: o QR já foi lido — pela câmera do
   * próprio sistema operacional, que foi o que trouxe a pessoa até aqui.
   * Abrir a câmera de novo seria pedir que ela lesse o mesmo cartaz duas
   * vezes.
   */
  codigoInicial?: string;
  rotuloProximaMarcacao: string | null;
  aoFechar: () => void;
  /** Abre o comprovante da batida que acabou de ser registrada. */
  aoVerComprovante?: (registro: RegistroPonto) => void;
  aoRegistrar: (registro: RegistroPonto) => void;
}

type EstadoLeitura = 'iniciando' | 'lendo' | 'registrando' | 'sucesso' | 'sem_camera';

export const ModalBaterPonto: React.FC<PropsModalBaterPonto> = ({
  aberto,
  codigoInicial,
  rotuloProximaMarcacao,
  aoFechar,
  aoRegistrar,
  aoVerComprovante,
}) => {
  useVoltar(aberto, aoFechar);
  const [estado, setEstado] = useState<EstadoLeitura>('iniciando');
  const [erro, setErro] = useState<string | null>(null);
  const [modoDigitar, setModoDigitar] = useState(false);
  const [codigoDigitado, setCodigoDigitado] = useState('');
  const [registroFeito, setRegistroFeito] = useState<RegistroPonto | null>(null);
  /**
   * A câmera já mandou imagem? Até lá o vídeo fica invisível: parado, o
   * WebView do Android desenha nele um quadro de "vídeo com erro".
   */
  const [imagemChegou, setImagemChegou] = useState(false);
  /** Batida segurada esperando o motivo. */
  const [pedindoMotivo, setPedindoMotivo] = useState<{
    conteudo: string;
    rotulo: string;
    descricao: string;
  } | null>(null);
  /** Batida segurada esperando a pessoa dizer o horário dela. */
  const [escolhendoTurno, setEscolhendoTurno] = useState<string | null>(null);
  // Pergunta uma vez por batida: quem respondeu "agora não" não é perguntado de novo aqui
  const refTurnoPerguntado = useRef(false);

  const refVideo = useRef<HTMLVideoElement>(null);
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const refStream = useRef<MediaStream | null>(null);
  const refQuadro = useRef<number | null>(null);
  // Trava para não registrar duas vezes enquanto o quadro seguinte é analisado
  const refProcessando = useRef(false);
  // O callback fica em ref para não entrar nas dependências do efeito: se
  // entrasse, cada renderização da tela de ponto reiniciaria a câmera.
  const refAoRegistrar = useRef(aoRegistrar);
  refAoRegistrar.current = aoRegistrar;

  const encerrarCamera = useCallback(() => {
    if (refQuadro.current !== null) {
      cancelAnimationFrame(refQuadro.current);
      refQuadro.current = null;
    }
    soltarFluxo(refStream.current);
    refStream.current = null;
    if (refVideo.current) {
      refVideo.current.srcObject = null;
    }
  }, []);

  /**
   * Efetiva a batida.
   *
   * Antes de registrar, pergunta ao serviço se ESTA marcação, AGORA, cai
   * fora da janela da jornada. Se cair, abre o card de motivo e só registra
   * depois que a pessoa escrever — o motivo viaja junto até a apuração.
   *
   * A pergunta vem antes do registro de propósito: depois de bater, a
   * batida já existe e o motivo viraria um remendo opcional que ninguém
   * preenche.
   */
  const confirmarCodigo = useCallback(
    async (conteudo: string, justificativa?: { motivo?: string; anexoCaminho?: string }) => {
      if (refProcessando.current) return;
      refProcessando.current = true;
      setEstado('registrando');
      setErro(null);

      const proxima = servicoPonto.obterProximaMarcacao(
        bancoDados.obterColaboradorAtual().id,
        dataDeHoje()
      );

      /**
       * O HORÁRIO VEM ANTES DO MOTIVO.
       *
       * Com a ficha no turno padrão que ninguém escolheu, a pergunta do
       * motivo cobrava de quem entra às 08:20 um atraso de 50 minutos — e
       * a batida ficava segurada até ela escrever. Quem ainda não
       * confirmou o horário diz qual é, e a batida é medida por ele.
       */
      const eu = bancoDados.obterColaboradorAtual();
      if (proxima && !justificativa && !refTurnoPerguntado.current && precisaEscolherTurno(eu)) {
        refTurnoPerguntado.current = true;
        setEscolhendoTurno(conteudo);
        setEstado(refStream.current ? 'lendo' : 'sem_camera');
        // A trava FICA: a câmera segue apontada para o cartaz, e uma
        // segunda leitura registraria a batida por baixo da pergunta
        return;
      }

      if (proxima && !justificativa) {
        const avaliacao = servicoPonto.avaliarMarcacao(
          bancoDados.obterColaboradorAtual().id,
          proxima
        );
        if (avaliacao.precisaMotivo) {
          // Segura o código e devolve a palavra para a pessoa
          setPedindoMotivo({
            conteudo,
            rotulo: ROTULO_MARCACAO[proxima],
            descricao: avaliacao.descricao,
          });
          setEstado(refStream.current ? 'lendo' : 'sem_camera');
          refProcessando.current = false;
          return;
        }
      }

      const resultado = await servicoPonto.registrarMarcacaoPorCodigo(
        conteudo,
        justificativa
      );

      if (resultado.sucesso && resultado.registro) {
        encerrarCamera();
        setRegistroFeito(resultado.registro);
        setEstado('sucesso');
        refAoRegistrar.current(resultado.registro);
        return;
      }

      // Fora da jornada: registrada (Portaria 671/2021), com comprovante, e vai ao RH
      if (resultado.sucesso && resultado.comprovante) {
        encerrarCamera();
        setRegistroFeito(resultado.comprovante);
        setEstado('sucesso');
        return;
      }

      setErro(resultado.erro || 'Não foi possível registrar o ponto.');
      // Volta a ler: um QR de outra loja ou danificado não deve encerrar a tela
      setEstado(refStream.current ? 'lendo' : 'sem_camera');
      refProcessando.current = false;
    },
    [encerrarCamera]
  );

  // Laço de leitura: analisa cada quadro do vídeo procurando um QR
  const analisarQuadro = useCallback(() => {
    const video = refVideo.current;
    const canvas = refCanvas.current;

    if (!video || !canvas || refProcessando.current) {
      refQuadro.current = requestAnimationFrame(analisarQuadro);
      return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const largura = video.videoWidth;
      const altura = video.videoHeight;

      if (largura > 0 && altura > 0) {
        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, largura, altura);
          const imagem = ctx.getImageData(0, 0, largura, altura);
          const achado = jsQR(imagem.data, largura, altura, {
            inversionAttempts: 'dontInvert',
          });

          if (achado && achado.data) {
            confirmarCodigo(achado.data);
            return;
          }
        }
      }
    }

    refQuadro.current = requestAnimationFrame(analisarQuadro);
  }, [confirmarCodigo]);

  const iniciarCamera = useCallback(async () => {
    setErro(null);
    setEstado('iniciando');
    setImagemChegou(false);

    try {
      // Sempre por `midia`, para o fluxo poder ser desligado de fora
      const stream = await abrirFluxo({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!stream) throw new Error('sem câmera');
      refStream.current = stream;

      if (refVideo.current) {
        refVideo.current.srcObject = stream;
        await refVideo.current.play().catch(() => undefined);
      }

      setEstado('lendo');
      refQuadro.current = requestAnimationFrame(analisarQuadro);
    } catch {
      // Sem câmera não é erro: o funcionário digita o código do cartaz
      setEstado('sem_camera');
      setModoDigitar(true);
    }
  }, [analisarQuadro]);

  useEffect(() => {
    if (!aberto) {
      encerrarCamera();
      refProcessando.current = false;
      refTurnoPerguntado.current = false;
      setEscolhendoTurno(null);
      setEstado('iniciando');
      setErro(null);
      setModoDigitar(false);
      setCodigoDigitado('');
      setRegistroFeito(null);
      return;
    }

    /**
     * Veio pelo cartaz: registra direto, sem abrir a câmera.
     *
     * A leitura já aconteceu — foi a câmera do celular que trouxe a pessoa
     * até aqui. Abrir a nossa em cima disso pediria o mesmo cartaz de novo,
     * e no aplicativo instalado ainda dispararia a permissão de câmera sem
     * necessidade.
     */
    if (codigoInicial) {
      void confirmarCodigo(codigoInicial);
      return;
    }

    iniciarCamera();
    return () => {
      encerrarCamera();
      refProcessando.current = false;
    };
  }, [aberto, encerrarCamera, iniciarCamera, codigoInicial]);

  /**
   * Volta a ler o QR quando o aplicativo retorna para a frente.
   *
   * `midia` desliga a câmera ao ir para segundo plano. Sem retomar, quem
   * trocou de aplicativo no meio da batida voltaria para um retângulo preto
   * e teria de fechar e abrir a tela.
   */
  useEffect(() => {
    if (!aberto) return;
    return assinarRetomada(() => {
      if (!refStream.current && estado === 'lendo') iniciarCamera();
    });
  }, [aberto, estado, iniciarCamera]);

  if (!aberto) return null;

  const submeterCodigo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoDigitado.trim()) {
      setErro('Digite o código impresso embaixo do QR.');
      return;
    }
    refProcessando.current = false;
    confirmarCodigo(codigoDigitado);
  };

  return (
    <>
    <div
      id="modal-bater-ponto"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
    >
      <div className="bg-[var(--c-superficie)] w-full max-w-md rounded-2xl border border-[var(--c-borda)] shadow-[var(--s-3)] overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b border-[var(--c-borda)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <QrCode className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-[var(--c-texto)] truncate">
                {estado === 'sucesso' ? 'Ponto registrado' : 'Bater ponto'}
              </h3>
              {rotuloProximaMarcacao && estado !== 'sucesso' && (
                <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
                  Registrando: {rotuloProximaMarcacao}
                </span>
              )}
            </div>
          </div>
          {/* O relógio com segundos no momento da marcação (Anexo IX, item 3) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {estado !== 'sucesso' && <RelogioDaMarcacao />}
          <button
            type="button"
            id="botao-fechar-bater-ponto"
            onClick={aoFechar}
            className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Confirmação */}
          {estado === 'sucesso' && registroFeito ? (
            <div className="p-6 flex flex-col items-center text-center gap-3">
              {registroFeito.foraDaJornada ? (
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center">
                  <Inbox className="w-8 h-8" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
              )}
              <div>
                <p className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                  {registroFeito.horaFormatada}
                </p>
                {/* Usa o tipo do próprio registro: a próxima marcação da
                    jornada já mudou assim que este ponto foi gravado. */}
                <p className="text-sm font-semibold text-[var(--c-texto-2)] mt-0.5">
                  {registroFeito.foraDaJornada
                    ? 'Marcação registrada e enviada ao RH'
                    : `${ROTULO_MARCACAO[registroFeito.tipo]} registrada`}
                </p>
                {registroFeito.foraDaJornada && (
                  <p id="motivo-fora-da-jornada" className="text-xs text-[var(--c-texto-3)] mt-1.5 max-w-[17rem] mx-auto leading-relaxed">
                    {ROTULO_FORA_DA_JORNADA[registroFeito.foraDaJornada]}. Ela fica no seu registro de ponto, e o RH decide
                    como entra na jornada.
                  </p>
                )}
                <p className="text-xs text-[var(--c-texto-3)] mt-1.5">
                  Loja {registroFeito.loja} ·{' '}
                  {registroFeito.metodo === 'qrcode' ? 'QR lido' : 'código digitado'}
                </p>
              </div>
              {/* O comprovante da batida, logo depois de bater (Portaria 671/2021) */}
              {aoVerComprovante && temComprovante(registroFeito) && (
                <button
                  type="button"
                  id="botao-ver-comprovante"
                  onClick={() => aoVerComprovante(registroFeito)}
                  className="mt-2 w-full py-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[var(--c-superficie-2)] transition-all"
                >
                  <ReceiptText className="w-4 h-4" />
                  Ver comprovante · NSR {String(registroFeito.nsr).padStart(9, '0')}
                </button>
              )}
              <button
                type="button"
                onClick={aoFechar}
                className="w-full py-3 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-sm hover:brightness-110 active:scale-[0.99] transition-all"
              >
                Concluir
              </button>
            </div>
          ) : (
            <>
              {/* Visor da câmera */}
              {!modoDigitar && (
                <div className="relative bg-black aspect-[4/3] flex items-center justify-center overflow-hidden">
                  <video
                    ref={refVideo}
                    playsInline
                    muted
                    poster={CAPA_VAZIA_DO_VIDEO}
                    onPlaying={() => setImagemChegou(true)}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      imagemChegou ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <canvas ref={refCanvas} className="hidden" />

                  {/* Mira de leitura */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                  </div>

                  {/* Fundo inteiro, e não translúcido: por trás não há nada que valha ver */}
                  {(estado === 'iniciando' || (estado === 'lendo' && !imagemChegou)) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-black">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-xs font-medium">Abrindo a câmera…</span>
                    </div>
                  )}

                  {estado === 'registrando' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-black/70">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-xs font-semibold">Registrando…</span>
                    </div>
                  )}

                  {estado === 'lendo' && (
                    <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-white bg-black/60 px-3 py-1.5 rounded-full">
                      Aponte para o QR da sua loja
                    </span>
                  )}
                </div>
              )}

              {/* Câmera indisponível */}
              {estado === 'sem_camera' && !modoDigitar && (
                <div className="p-6 flex flex-col items-center text-center gap-2">
                  <CameraOff className="w-8 h-8 text-[var(--c-texto-3)]" />
                  <p className="text-sm text-[var(--c-texto-2)]">
                    Câmera indisponível neste aparelho.
                  </p>
                </div>
              )}

              <div className="p-4 flex flex-col gap-3">
                {erro && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
                    <span>{erro}</span>
                  </div>
                )}

                {/* Código digitado à mão */}
                {modoDigitar ? (
                  <form onSubmit={submeterCodigo} className="flex flex-col gap-2.5">
                    <label
                      htmlFor="campo-codigo-ponto"
                      className="text-xs font-bold text-[var(--c-texto-2)] uppercase tracking-wider"
                    >
                      Código impresso no cartaz
                    </label>
                    <input
                      id="campo-codigo-ponto"
                      type="text"
                      value={codigoDigitado}
                      onChange={(e) => setCodigoDigitado(e.target.value.toUpperCase())}
                      placeholder="Ex: K7F2QM"
                      maxLength={6}
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="w-full px-3 py-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-center text-xl font-mono font-bold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                    />
                    <button
                      type="submit"
                      id="botao-confirmar-codigo-ponto"
                      disabled={estado === 'registrando'}
                      className="w-full py-3 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-sm hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all"
                    >
                      {estado === 'registrando' ? 'Registrando…' : 'Registrar ponto'}
                    </button>

                    {estado !== 'sem_camera' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModoDigitar(false);
                          setErro(null);
                        }}
                        className="text-[11px] font-semibold text-[var(--c-texto-3)] hover:text-[var(--c-acento)] transition-colors"
                      >
                        Voltar para a leitura do QR
                      </button>
                    )}
                  </form>
                ) : (
                  <button
                    type="button"
                    id="botao-digitar-codigo-ponto"
                    onClick={() => {
                      setModoDigitar(true);
                      setErro(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-semibold text-[var(--c-texto)] hover:border-[var(--c-acento)] flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    Não consigo ler o QR · digitar o código
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
      {/* Horário na primeira batida: escolhe uma vez, e a batida segue */}
      <EscolherTurno
        aberto={!!escolhendoTurno}
        colaborador={bancoDados.obterColaboradorAtual()}
        aoEscolher={async (turno) => {
          const res = await bancoDados.escolherMeuTurno(turno);
          if (!res.sucesso) return res.erro || 'Não foi possível gravar o horário.';
          const segurada = escolhendoTurno;
          setEscolhendoTurno(null);
          refProcessando.current = false;
          if (segurada) await confirmarCodigo(segurada);
          return null;
        }}
        aoPular={() => {
          const segurada = escolhendoTurno;
          setEscolhendoTurno(null);
          refProcessando.current = false;
          if (segurada) void confirmarCodigo(segurada);
        }}
      />

      {/* Motivo no ato: a batida fica segurada até a pessoa escrever */}
      <CardJustificarBatida
        aberto={!!pedindoMotivo}
        rotuloMarcacao={pedindoMotivo?.rotulo || ''}
        descricao={pedindoMotivo?.descricao || ''}
        aoCancelar={() => setPedindoMotivo(null)}
        aoConfirmar={async ({ motivo, anexo }) => {
          const segurada = pedindoMotivo;
          setPedindoMotivo(null);
          if (!segurada) return;

          /**
           * O comprovante sobe ANTES da batida.
           *
           * Se subisse depois, uma falha no envio deixaria a apuração
           * apontando para um arquivo que não existe — e o aprovador veria
           * um anexo quebrado, que é pior do que anexo nenhum.
           */
          let anexoCaminho: string | undefined;
          if (anexo) {
            const eu = bancoDados.obterColaboradorAtual();
            const enviado = await enviarAnexo(
              anexo.conteudo,
              `ponto/${eu.id}`,
              `${dataDeHoje()}-${Date.now()}`,
              anexo.nome
            );
            anexoCaminho = enviado?.caminho;
          }

          await confirmarCodigo(segurada.conteudo, { motivo, anexoCaminho });
        }}
      />

    </>
  );
};
