/**
 * Justificar ausência — CONECTA / Malachias Autopeças
 *
 * O que NÃO passa por batida: atestado, falta justificada, comparecimento.
 * O fluxo automático da jornada nunca enxerga esses dias — sem esta tela,
 * eles ficam como "dia sem batida" para sempre, e ninguém sabe se foi
 * atestado, falta ou esquecimento.
 *
 * Vai para a fila do MESMO responsável da hora extra. Não há uma segunda
 * cadeia de aprovação: quem responde pela pessoa decide as duas coisas.
 *
 * ===================================================================
 * COM CARA DE APLICATIVO (pedido do Elias: "uma porcaria, organize")
 * ===================================================================
 *
 * Era um formulário sempre aberto no alto, com cinco chips quebrando
 * linha, datas espremidas e o histórico lá embaixo. Agora:
 *
 *   · a TELA é o que a pessoa volta para ver — em que pé está o que ela
 *     pediu —, com o que espera decisão em cima;
 *   · PEDIR é uma ação: um botão, e a folha que sobe de baixo em dois
 *     passos — primeiro o motivo (cada um explicado), depois os dados
 *     daquele motivo, com o botão de enviar fixo no rodapé.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Stethoscope,
  UserX,
  FileSignature,
  HelpCircle,
  Paperclip,
  Camera,
  X,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  ChevronRight,
  FileText,
  Palmtree,
} from 'lucide-react';
import {
  Colaborador,
  TipoAusencia,
  ROTULO_TIPO_AUSENCIA,
  JustificativaAusencia,
} from '../tipos';
import {
  solicitarAusencia,
  minhasJustificativas,
  assinarJustificativas,
} from '../servicos/justificativas';
import { enviarAnexo } from '../servicos/anexos';
import { formatarDataBR, dataDeHoje } from '../servicos/ponto';
import { FolhaInferior } from './FolhaInferior';

interface Props {
  colaboradorAtual: Colaborador;
}

const TAMANHO_MAXIMO = 4 * 1024 * 1024;

/**
 * OS MOTIVOS, cada um com o que ele é e o que pede. Escolher entre cinco
 * palavras soltas fazia a pessoa adivinhar qual servia; a frase embaixo
 * de cada uma responde antes da dúvida.
 */
const MOTIVOS: Array<{
  tipo: TipoAusencia;
  Icone: React.FC<{ className?: string }>;
  descricao: string;
  cor: string;
}> = [
  {
    tipo: 'folga_sabado',
    Icone: CalendarCheck,
    descricao: 'Uma por mês, sempre num sábado. Não mexe no seu banco de horas.',
    cor: 'text-sky-600 bg-sky-500/10',
  },
  {
    tipo: 'atestado',
    Icone: Stethoscope,
    descricao: 'Consulta ou afastamento médico. Anexe o atestado.',
    cor: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    tipo: 'falta_justificada',
    Icone: UserX,
    descricao: 'Faltou por um motivo que o seu responsável vai avaliar.',
    cor: 'text-amber-600 bg-amber-500/10',
  },
  {
    tipo: 'comparecimento',
    Icone: FileSignature,
    descricao: 'Declaração de horas: consulta, audiência, exame.',
    cor: 'text-violet-600 bg-violet-500/10',
  },
  {
    tipo: 'outro',
    Icone: HelpCircle,
    descricao: 'Qualquer outra ausência. Explique na observação.',
    cor: 'text-slate-500 bg-slate-500/10',
  },
];

/**
 * Férias não se pedem por aqui — a liderança e o RH as lançam —, mas o
 * mesmo cartão as mostra na aba Eu. Sem isto elas sairiam com o ícone
 * de "Outro".
 */
const APARENCIA_DAS_FERIAS = {
  tipo: 'ferias' as TipoAusencia,
  Icone: Palmtree,
  descricao: '',
  cor: 'text-teal-600 bg-teal-500/10',
};

const motivoDe = (tipo: TipoAusencia) =>
  tipo === 'ferias'
    ? APARENCIA_DAS_FERIAS
    : MOTIVOS.find((m) => m.tipo === tipo) || MOTIVOS[4];

/** O sábado de uma data, para o campo já nascer numa data válida. */
const proximoSabado = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

const ehSabado = (data: string): boolean => {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12).getDay() === 6;
};

const periodo = (j: { dataInicio: string; dataFim: string }) =>
  j.dataInicio === j.dataFim
    ? formatarDataBR(j.dataInicio)
    : `${formatarDataBR(j.dataInicio)} a ${formatarDataBR(j.dataFim)}`;

const SeloEstado: React.FC<{ j: JustificativaAusencia }> = ({ j }) => {
  if (j.estado === 'aprovada') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-600 inline-flex items-center gap-1 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" />
        Aprovada
      </span>
    );
  }
  if (j.estado === 'recusada') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/12 text-red-600 inline-flex items-center gap-1 whitespace-nowrap">
        <XCircle className="w-3 h-3" />
        Recusada
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-600 inline-flex items-center gap-1 whitespace-nowrap">
      <Clock className="w-3 h-3" />
      Em análise
    </span>
  );
};

/**
 * Uma solicitação na lista: o motivo, a data, a situação.
 *
 * Exportado: a aba Eu mostra folgas, férias e documentos com ESTE cartão,
 * e não com um segundo desenho do mesmo pedido.
 */
export const CartaoSolicitacao: React.FC<{
  j: JustificativaAusencia;
  /** Quando existe, o nome do anexo vira botão para abrir o arquivo. */
  aoAbrirAnexo?: (caminho: string) => void;
}> = ({ j, aoAbrirAnexo }) => {
  const { Icone, cor } = motivoDe(j.tipo);
  return (
    <li className="flex gap-3 px-4 py-3.5 border-b border-[var(--c-borda)] last:border-b-0">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cor}`}>
        <Icone className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[15px] font-semibold text-[var(--c-texto)] leading-tight">
            {ROTULO_TIPO_AUSENCIA[j.tipo]}
          </span>
          <SeloEstado j={j} />
        </div>
        <p className="text-[13px] text-[var(--c-texto-2)] mt-0.5 tabular-nums">{periodo(j)}</p>
        {j.observacao && (
          <p className="text-[13px] text-[var(--c-texto-3)] mt-1 line-clamp-2">{j.observacao}</p>
        )}
        {j.anexoNome &&
          (aoAbrirAnexo && j.anexoCaminho ? (
            <button
              type="button"
              onClick={() => aoAbrirAnexo(j.anexoCaminho!)}
              className="mt-1 max-w-full text-xs font-semibold text-[var(--c-acento)] flex items-center gap-1 min-h-[32px]"
            >
              <Paperclip className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{j.anexoNome}</span>
            </button>
          ) : (
            <p className="text-xs text-[var(--c-texto-3)] mt-1 flex items-center gap-1 truncate">
              <Paperclip className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{j.anexoNome}</span>
            </p>
          ))}
        {j.estado === 'aprovada' && j.aprovadorNome && (
          <p className="text-xs text-[var(--c-texto-3)] mt-1">por {j.aprovadorNome}</p>
        )}
        {/* Recusa sem motivo à vista deixaria a pessoa sem saber o que
            corrigir para tentar de novo */}
        {j.estado === 'recusada' && j.motivoRecusa && (
          <p className="text-[13px] text-red-600 mt-1.5 p-2 rounded-lg bg-red-500/8">
            {j.motivoRecusa}
          </p>
        )}
      </div>
    </li>
  );
};

const campo =
  'w-full h-12 px-3.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[15px] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-acento)]';
const rotulo = 'text-[13px] font-semibold text-[var(--c-texto-2)] mb-1.5 block';

export const AbaJustificar: React.FC<Props> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [passo, setPasso] = useState<'motivo' | 'dados'>('motivo');
  const [tipo, setTipo] = useState<TipoAusencia>('atestado');
  const [dataInicio, setDataInicio] = useState(dataDeHoje());
  const [dataFim, setDataFim] = useState(dataDeHoje());
  const [observacao, setObservacao] = useState('');
  const [anexo, setAnexo] = useState<{ conteudo: string; nome: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);

  useEffect(() => {
    const cancelar = assinarJustificativas(() => setVersao((v) => v + 1));
    return () => cancelar();
  }, []);

  const historico = useMemo(() => {
    void versao;
    return minhasJustificativas();
  }, [versao]);

  // O que espera decisão vem primeiro: é o que a pessoa volta para conferir
  const emAnalise = historico.filter((j) => j.estado === 'pendente');
  const decididas = historico.filter((j) => j.estado !== 'pendente');

  const abrir = () => {
    setPasso('motivo');
    setErro(null);
    setFolhaAberta(true);
  };

  const fechar = () => {
    setFolhaAberta(false);
    setErro(null);
  };

  const escolherMotivo = (t: TipoAusencia) => {
    setTipo(t);
    setErro(null);
    // A folga é de UM sábado: o campo já nasce num sábado válido, em vez
    // de deixar a pessoa descobrir no erro
    if (t === 'folga_sabado') {
      const sabado = ehSabado(dataInicio) ? dataInicio : proximoSabado();
      setDataInicio(sabado);
      setDataFim(sabado);
    }
    setPasso('dados');
  };

  const escolherArquivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAXIMO) {
      setErro('Arquivo acima de 4 MB. Tire uma foto menor ou use um PDF.');
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => setAnexo({ conteudo: String(leitor.result), nome: arquivo.name });
    leitor.onerror = () => setErro('Não foi possível ler o arquivo.');
    leitor.readAsDataURL(arquivo);
  };

  const enviar = async () => {
    setEnviando(true);
    setErro(null);

    // O comprovante sobe primeiro: solicitação apontando para arquivo que
    // não existe faria o aprovador ver um anexo quebrado
    let anexoCaminho: string | undefined;
    if (anexo) {
      const enviado = await enviarAnexo(
        anexo.conteudo,
        `ausencias/${colaboradorAtual.id}`,
        `${dataInicio}-${Date.now()}`,
        anexo.nome
      );
      if (!enviado) {
        setEnviando(false);
        setErro('Falha ao enviar o comprovante. Tente de novo.');
        return;
      }
      anexoCaminho = enviado.caminho;
    }

    const res = await solicitarAusencia({
      dataInicio,
      dataFim,
      tipo,
      observacao,
      anexoCaminho,
      anexoNome: anexo?.nome,
    });
    setEnviando(false);

    if (!res.sucesso) {
      setErro(res.erro || 'Não foi possível enviar.');
      return;
    }

    setObservacao('');
    setAnexo(null);
    setVersao((v) => v + 1);
    setFolhaAberta(false);
    setConfirmacao('Enviada. O seu responsável vai decidir.');
    setTimeout(() => setConfirmacao(null), 3500);
  };

  const motivo = motivoDe(tipo);
  const ehFolga = tipo === 'folga_sabado';

  return (
    <div className="w-full flex flex-col pb-28">
      {/* A ação principal da tela, onde o polegar alcança logo de cara */}
      <div className="px-4 pt-4 pb-2">
        <button
          type="button"
          id="botao-nova-justificativa"
          onClick={abrir}
          className="w-full h-14 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[15px] font-bold flex items-center justify-center gap-2 shadow-[var(--s-2)] active:scale-[0.99] transition-transform"
        >
          <Plus className="w-5 h-5" />
          Nova solicitação
        </button>
        <p className="text-xs text-[var(--c-texto-3)] text-center mt-2 px-4">
          Atestado, folga, falta ou comparecimento — vai para quem responde por você.
        </p>
      </div>

      {historico.length === 0 ? (
        <div className="mx-4 mt-6 px-6 py-10 rounded-2xl border border-dashed border-[var(--c-borda)] flex flex-col items-center text-center gap-2">
          <FileText className="w-8 h-8 text-[var(--c-texto-3)]" />
          <p className="text-sm font-semibold text-[var(--c-texto-2)]">Nenhuma solicitação ainda</p>
          <p className="text-xs text-[var(--c-texto-3)]">
            O que você pedir aparece aqui, com a situação de cada uma.
          </p>
        </div>
      ) : (
        <>
          {emAnalise.length > 0 && (
            <section className="mt-4">
              <h3 className="px-4 pb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                Em análise · {emAnalise.length}
              </h3>
              <ul className="mx-4 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] overflow-hidden">
                {emAnalise.map((j) => (
                  <CartaoSolicitacao key={j.id} j={j} />
                ))}
              </ul>
            </section>
          )}
          {decididas.length > 0 && (
            <section className="mt-5">
              <h3 className="px-4 pb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                Decididas
              </h3>
              <ul className="mx-4 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] overflow-hidden">
                {decididas.map((j) => (
                  <CartaoSolicitacao key={j.id} j={j} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {confirmacao && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--c-superficie)] text-[var(--c-texto)] border border-[var(--c-borda)] shadow-[var(--s-3)] px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {confirmacao}
        </div>
      )}

      <FolhaInferior
        aberto={folhaAberta}
        titulo={passo === 'motivo' ? 'Qual é o motivo?' : ROTULO_TIPO_AUSENCIA[tipo]}
        subtitulo={passo === 'motivo' ? 'Nova solicitação' : 'Nova solicitação · confira e envie'}
        aoFechar={fechar}
        aoVoltar={passo === 'dados' ? () => setPasso('motivo') : undefined}
        rodape={
          passo === 'dados' ? (
            <button
              type="button"
              id="botao-enviar-justificativa"
              onClick={enviar}
              disabled={enviando}
              className="w-full h-12 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[15px] font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            >
              <Send className="w-4 h-4" />
              {enviando ? 'Enviando…' : 'Enviar para aprovação'}
            </button>
          ) : undefined
        }
      >
        {passo === 'motivo' ? (
          /* PASSO 1: cada motivo com o que ele é, e um toque para seguir */
          <ul className="py-2">
            {MOTIVOS.map(({ tipo: t, Icone, descricao, cor }) => (
              <li key={t}>
                <button
                  type="button"
                  id={`motivo-${t}`}
                  onClick={() => escolherMotivo(t)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--c-superficie-2)]"
                >
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${cor}`}>
                    <Icone className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--c-texto)]">
                      {ROTULO_TIPO_AUSENCIA[t]}
                    </span>
                    <span className="block text-[13px] text-[var(--c-texto-3)] leading-snug">{descricao}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-[var(--c-texto-3)] flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          /* PASSO 2: só o que este motivo pede */
          <div className="p-4 flex flex-col gap-4">
            <div className={`flex items-start gap-3 p-3 rounded-xl ${motivo.cor}`}>
              <motivo.Icone className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-[13px] leading-snug">{motivo.descricao}</p>
            </div>

            {/* Um atestado de 3 dias é UMA solicitação, não três */}
            {ehFolga ? (
              <div>
                <label htmlFor="ausencia-de" className={rotulo}>
                  Qual sábado?
                </label>
                <input
                  id="ausencia-de"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => {
                    setDataInicio(e.target.value);
                    // Folga é de um dia só: o fim acompanha sempre
                    setDataFim(e.target.value);
                  }}
                  className={campo}
                />
                {!ehSabado(dataInicio) && (
                  <p className="text-xs text-amber-600 mt-1.5">A folga é sempre num sábado.</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ausencia-de" className={rotulo}>
                    De
                  </label>
                  <input
                    id="ausencia-de"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => {
                      setDataInicio(e.target.value);
                      // O fim só acompanha para não ficar antes do início
                      if (e.target.value > dataFim) setDataFim(e.target.value);
                    }}
                    className={`${campo} px-2.5`}
                  />
                </div>
                <div>
                  <label htmlFor="ausencia-ate" className={rotulo}>
                    Até
                  </label>
                  <input
                    id="ausencia-ate"
                    type="date"
                    value={dataFim}
                    min={dataInicio}
                    onChange={(e) => setDataFim(e.target.value)}
                    className={`${campo} px-2.5`}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="ausencia-obs" className={rotulo}>
                Observação <span className="font-normal text-[var(--c-texto-3)]">(opcional)</span>
              </label>
              <textarea
                id="ausencia-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder={ehFolga ? 'Ex.: casamento na família' : 'Ex.: consulta de retorno no posto'}
                className="w-full px-3.5 py-3 text-[15px] bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-acento)] resize-none"
              />
            </div>

            {/* Folga não tem documento: é um direito, não uma justificativa */}
            {!ehFolga && (
              <div>
                <span className={rotulo}>
                  Documento{' '}
                  {tipo === 'atestado' ? (
                    <span className="text-red-500">*</span>
                  ) : (
                    <span className="font-normal text-[var(--c-texto-3)]">(se tiver)</span>
                  )}
                </span>

                {anexo ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)]">
                    <span className="w-9 h-9 rounded-lg bg-[var(--c-acento-suave)] text-[var(--c-acento)] flex items-center justify-center flex-shrink-0">
                      <Paperclip className="w-4 h-4" />
                    </span>
                    <span className="text-sm text-[var(--c-texto)] truncate flex-1">{anexo.nome}</span>
                    <button
                      type="button"
                      onClick={() => setAnexo(null)}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--c-texto-3)] active:bg-[var(--c-superficie-2)]"
                      aria-label="Remover documento"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* Duas portas: a câmera, que é como o atestado costuma chegar,
                     e o arquivo, para quem recebeu o PDF */
                  <div className="grid grid-cols-2 gap-3">
                    <label className="h-20 rounded-xl border border-dashed border-[var(--c-borda-forte)] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold text-[var(--c-texto-2)] cursor-pointer active:bg-[var(--c-canvas)]">
                      <Camera className="w-5 h-5" />
                      Tirar foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={escolherArquivo}
                        className="hidden"
                      />
                    </label>
                    <label className="h-20 rounded-xl border border-dashed border-[var(--c-borda-forte)] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold text-[var(--c-texto-2)] cursor-pointer active:bg-[var(--c-canvas)]">
                      <Paperclip className="w-5 h-5" />
                      Escolher arquivo
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={escolherArquivo}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
                {tipo === 'atestado' && !anexo && (
                  <p className="text-xs text-[var(--c-texto-3)] mt-1.5">
                    Sem o documento, quem decide não tem em que se apoiar — e é ele que o RH guarda.
                  </p>
                )}
              </div>
            )}

            {erro && (
              <div className="p-3 rounded-xl bg-red-500/10 text-red-600 text-[13px] font-semibold">{erro}</div>
            )}
          </div>
        )}
      </FolhaInferior>
    </div>
  );
};
