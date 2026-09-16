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
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Paperclip,
  X,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
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

interface Props {
  colaboradorAtual: Colaborador;
}

const TAMANHO_MAXIMO = 4 * 1024 * 1024;

const TIPOS: TipoAusencia[] = [
  'atestado',
  'falta_justificada',
  'comparecimento',
  'outro',
];

const SeloEstado: React.FC<{ j: JustificativaAusencia }> = ({ j }) => {
  if (j.estado === 'aprovada') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-700 border-emerald-500/20 inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Aprovada{j.aprovadorNome ? ` · ${j.aprovadorNome}` : ''}
      </span>
    );
  }
  if (j.estado === 'recusada') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-500/10 text-red-600 border-red-500/20 inline-flex items-center gap-1">
        <XCircle className="w-3 h-3" />
        Recusada
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-700 border-amber-500/20 inline-flex items-center gap-1">
      <Clock className="w-3 h-3" />
      Aguardando o responsável
    </span>
  );
};

export const AbaJustificar: React.FC<Props> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [tipo, setTipo] = useState<TipoAusencia>('atestado');
  const [dataInicio, setDataInicio] = useState(dataDeHoje());
  const [dataFim, setDataFim] = useState(dataDeHoje());
  const [observacao, setObservacao] = useState('');
  const [anexo, setAnexo] = useState<{ conteudo: string; nome: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  useEffect(() => {
    const cancelar = assinarJustificativas(() => setVersao((v) => v + 1));
    return () => cancelar();
  }, []);

  const historico = useMemo(() => {
    void versao;
    return minhasJustificativas();
  }, [versao]);

  const mostrar = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 5000);
  };

  const escolherArquivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAXIMO) {
      mostrar('Arquivo acima de 4 MB. Tire uma foto menor ou use um PDF.', true);
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => setAnexo({ conteudo: String(leitor.result), nome: arquivo.name });
    leitor.onerror = () => mostrar('Não foi possível ler o arquivo.', true);
    leitor.readAsDataURL(arquivo);
  };

  const enviar = async () => {
    setEnviando(true);

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
        mostrar('Falha ao enviar o comprovante. Tente de novo.', true);
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
      mostrar(res.erro || 'Não foi possível enviar.', true);
      return;
    }

    setObservacao('');
    setAnexo(null);
    setVersao((v) => v + 1);
    mostrar('Enviada. O responsável por você vai decidir.');
  };

  return (
    <div className="w-full flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Justificar ausência
        </h2>
        <p className="text-xs text-[var(--c-texto-3)]">
          Atestado, falta ou comparecimento — dias em que você não bateu ponto.
          Vai para quem responde por você.
        </p>
      </div>

      {aviso && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
            aviso.erro
              ? 'bg-red-500/10 border border-red-500/20 text-red-600'
              : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
          }`}
        >
          <span>{aviso.texto}</span>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col gap-3">
        <div>
          <span className="text-xs font-semibold text-[var(--c-texto-2)] block mb-1.5">
            Tipo
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tipo === t
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                    : 'bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto-2)]'
                }`}
              >
                {ROTULO_TIPO_AUSENCIA[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Um atestado de 3 dias é UMA solicitação, não três */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <label className="text-[var(--c-texto-3)]" htmlFor="ausencia-de">
            De
          </label>
          <input
            id="ausencia-de"
            type="date"
            value={dataInicio}
            onChange={(e) => {
              setDataInicio(e.target.value);
              // Fim antes do início é período negativo; acompanha o início
              if (e.target.value > dataFim) setDataFim(e.target.value);
            }}
            className="px-2 py-1.5 rounded-lg bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
          />
          <label className="text-[var(--c-texto-3)]" htmlFor="ausencia-ate">
            até
          </label>
          <input
            id="ausencia-ate"
            type="date"
            value={dataFim}
            min={dataInicio}
            onChange={(e) => setDataFim(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)]"
          />
        </div>

        <div>
          <label
            htmlFor="ausencia-obs"
            className="text-xs font-semibold text-[var(--c-texto-2)] block mb-1"
          >
            Observação
          </label>
          <textarea
            id="ausencia-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex.: consulta de retorno no posto"
            className="w-full px-3 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] resize-none"
          />
        </div>

        <div>
          <span className="text-xs font-semibold text-[var(--c-texto-2)] block mb-1">
            Documento
            {tipo === 'atestado' && <span className="text-red-500"> *</span>}
          </span>

          {anexo ? (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)]">
              <Paperclip className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
              <span className="text-xs text-[var(--c-texto)] truncate flex-1">
                {anexo.nome}
              </span>
              <button
                type="button"
                onClick={() => setAnexo(null)}
                className="p-1 rounded-lg text-[var(--c-texto-3)] hover:text-red-600"
                aria-label="Remover documento"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[var(--c-borda-forte)] text-xs text-[var(--c-texto-2)] cursor-pointer hover:bg-[var(--c-canvas)] transition-colors">
              <Paperclip className="w-4 h-4" />
              Anexar atestado ou declaração
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={escolherArquivo}
                className="hidden"
              />
            </label>
          )}
          {tipo === 'atestado' && (
            <span className="text-[11px] text-[var(--c-texto-3)] block mt-1">
              Atestado sem documento é palavra: quem decide precisa de algo em que
              se apoiar, e é isso que o RH guarda.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          className="py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-50 hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
        >
          <Send className="w-4 h-4" />
          {enviando ? 'Enviando…' : 'Enviar para aprovação'}
        </button>
      </div>

      {/* O histórico: a pessoa precisa ver em que pé está o que ela pediu */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-[var(--c-texto-3)]">
          Minhas solicitações
        </span>

        {historico.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--c-texto-3)]">
            Nenhuma solicitação ainda.
          </div>
        ) : (
          historico.map((j) => (
            <div
              key={j.id}
              className="p-3 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col gap-1"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[var(--c-texto)]">
                  {ROTULO_TIPO_AUSENCIA[j.tipo]}
                </span>
                <SeloEstado j={j} />
              </div>

              <span className="text-[11px] text-[var(--c-texto-3)]">
                {j.dataInicio === j.dataFim
                  ? formatarDataBR(j.dataInicio)
                  : `${formatarDataBR(j.dataInicio)} a ${formatarDataBR(j.dataFim)}`}
                {j.anexoNome && ` · ${j.anexoNome}`}
              </span>

              {j.observacao && (
                <span className="text-xs text-[var(--c-texto-2)]">{j.observacao}</span>
              )}

              {/* Recusa sem motivo à vista deixaria a pessoa sem saber o que
                  corrigir para tentar de novo */}
              {j.estado === 'recusada' && j.motivoRecusa && (
                <span className="text-xs text-red-600 mt-0.5">
                  <strong>Motivo da recusa:</strong> {j.motivoRecusa}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
