/**
 * ACERVO DE DOCUMENTOS DE AUSÊNCIA — CONECTA / Malachias Autopeças
 *
 * O QUE ESTA TELA É, e o que ela deixou de ser.
 *
 * Ela nasceu como uma segunda fila de aprovação e virou um mural de
 * avisos: entrava tudo que não fosse folga de sábado — férias, recusas,
 * pedidos sem papel nenhum — e a pergunta que o RH faz ali não era
 * respondida por nada disso.
 *
 * A pergunta é: QUAL COLABORADOR JUSTIFICOU A AUSÊNCIA DELE, COM QUAL
 * DOCUMENTO E DE QUANDO. É o arquivo que se consulta na homologação e
 * que se mostra na fiscalização. Por isso o documento é o assunto da
 * linha — miniatura à vista, aberto aqui dentro, com o nome de quem
 * entregou e as datas ao lado.
 *
 * Quem entra é a lista de `SE_COMPROVA_COM_DOCUMENTO` (`tipos.ts`), que
 * é a fonte única. Férias e folga de sábado têm tela própria e se julgam
 * por calendário, não por papel.
 *
 * Decidir continua aqui porque o atestado é do RH — foi por não ter
 * tela que o atestado ficava esperando uma fila de gestão que o RH não
 * alcança. Mas o que já foi recusado sai da frente: é arquivo, não
 * notificação.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Stethoscope,
  Check,
  X,
  Clock,
  Paperclip,
  Search,
  FileText,
  ExternalLink,
  AlertTriangle,
  Download,
} from 'lucide-react';
import {
  Colaborador,
  JustificativaAusencia,
  ROTULO_TIPO_AUSENCIA,
  SE_COMPROVA_COM_DOCUMENTO,
} from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import {
  lerJustificativas,
  assinarJustificativas,
} from '../servicos/justificativasCache';
import { decidirAusencia } from '../servicos/justificativas';
import { abrirDocumento } from '../servicos/rh';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  colaboradorAtual: Colaborador;
}

const formatarData = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Quantos dias o documento cobre, contando as duas pontas. */
const diasCobertos = (j: JustificativaAusencia): number => {
  const inicio = new Date(`${j.dataInicio}T12:00:00`).getTime();
  const fim = new Date(`${j.dataFim}T12:00:00`).getTime();
  return Math.max(1, Math.round((fim - inicio) / 86400000) + 1);
};

/**
 * Foto ou PDF — muda o que dá para mostrar.
 *
 * Foto de atestado é o caso comum: a pessoa fotografa o papel no celular
 * e envia. Essa a gente mostra em miniatura, e é o que faz a tela ser um
 * acervo em vez de uma lista de links.
 */
const ehImagem = (nome?: string): boolean =>
  /\.(png|jpe?g|webp|gif|heic|bmp)$/i.test(nome || '');

/**
 * O endereço do anexo, resolvido uma vez e guardado.
 *
 * O link do Supabase é assinado e vence; pedir um por card a cada
 * repintura encheria a tela de requisições. Este guarda por documento.
 */
const useEnderecoDoAnexo = (caminho?: string): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!caminho) {
      setUrl(null);
      return;
    }
    abrirDocumento(caminho).then((u) => {
      if (vivo) setUrl(u);
    });
    return () => {
      vivo = false;
    };
  }, [caminho]);

  return url;
};

/** A miniatura do documento entregue — ou o aviso de que não veio papel. */
const Miniatura: React.FC<{
  justificativa: JustificativaAusencia;
  aoAbrir: () => void;
}> = ({ justificativa, aoAbrir }) => {
  const url = useEnderecoDoAnexo(justificativa.anexoCaminho);

  if (!justificativa.anexoCaminho) {
    return (
      <div className="shrink-0 w-16 h-20 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 flex flex-col items-center justify-center gap-1 text-center px-1">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span className="text-[9px] font-bold leading-tight text-amber-700 dark:text-amber-500">
          Sem documento
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={aoAbrir}
      title={justificativa.anexoNome || 'Abrir o documento'}
      className="shrink-0 w-16 h-20 rounded-lg border border-[var(--c-borda)] bg-[var(--c-canvas)] overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-[var(--c-acento)] transition-shadow"
    >
      {ehImagem(justificativa.anexoNome) && url ? (
        <img
          src={url}
          alt={`Documento de ${formatarData(justificativa.dataInicio)}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-1">
          <FileText className="w-5 h-5 text-[var(--c-acento)]" />
          <span className="text-[9px] font-bold text-[var(--c-texto-3)]">
            {ehImagem(justificativa.anexoNome) ? '...' : 'PDF'}
          </span>
        </div>
      )}
    </button>
  );
};

/** O documento em tamanho de leitura, sem sair do sistema. */
const VisorDocumento: React.FC<{
  justificativa: JustificativaAusencia;
  nomeDaPessoa: string;
  aoFechar: () => void;
}> = ({ justificativa, nomeDaPessoa, aoFechar }) => {
  const url = useEnderecoDoAnexo(justificativa.anexoCaminho);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={aoFechar}
    >
      <div
        className="bg-[var(--c-superficie)] w-full max-w-3xl max-h-[90vh] rounded-2xl border border-[var(--c-borda)] shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--c-borda)] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-[var(--c-texto)] truncate">
              {nomeDaPessoa}
            </span>
            <span className="block text-[11px] text-[var(--c-texto-3)]">
              {ROTULO_TIPO_AUSENCIA[justificativa.tipo]} ·{' '}
              {formatarData(justificativa.dataInicio)}
              {justificativa.dataFim !== justificativa.dataInicio
                ? ` a ${formatarData(justificativa.dataFim)}`
                : ''}
            </span>
          </div>

          {url && (
            <>
              <a
                href={url}
                download={justificativa.anexoNome || 'documento'}
                className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-acento)]"
                title="Baixar"
              >
                <Download className="w-4 h-4" />
              </a>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-acento)]"
                title="Abrir em outra aba"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </>
          )}

          <button
            type="button"
            onClick={aoFechar}
            className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)]"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[var(--c-canvas)] flex items-center justify-center p-3">
          {!url ? (
            <span className="text-xs text-[var(--c-texto-3)]">Abrindo o documento...</span>
          ) : ehImagem(justificativa.anexoNome) ? (
            <img
              src={url}
              alt={`Documento de ${nomeDaPessoa}`}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          ) : (
            <iframe
              src={url}
              title={`Documento de ${nomeDaPessoa}`}
              className="w-full h-[70vh] rounded-lg bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const AbaAtestados: React.FC<Props> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState('');
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [verRecusados, setVerRecusados] = useState(false);
  const [vendo, setVendo] = useState<JustificativaAusencia | null>(null);
  const [recusando, setRecusando] = useState<JustificativaAusencia | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  void colaboradorAtual;

  useEffect(() => {
    const cancelar = assinarJustificativas(() => setVersao((v) => v + 1));
    return () => cancelar();
  }, []);

  /**
   * O ACERVO: só o que se comprova com papel.
   *
   * O critério vem de `tipos.ts`, não daqui. Escrito à mão nesta tela,
   * ele divergiria do resto no dia em que um tipo novo aparecesse — que
   * é exatamente como férias entrou aqui da primeira vez.
   */
  const acervo = useMemo(() => {
    void versao;
    return lerJustificativas().filter((j) => SE_COMPROVA_COM_DOCUMENTO[j.tipo]);
  }, [versao]);

  const recusados = useMemo(
    () => acervo.filter((j) => j.estado === 'recusada'),
    [acervo]
  );

  /**
   * RECUSADO SAI DA FRENTE.
   *
   * O documento recusado não some — ele é histórico, e some seria apagar
   * prova. Mas ele também não é o assunto: a tela mostrava a recusa como
   * se fosse recado, e recado é trabalho do sino de notificações.
   */
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return acervo
      .filter((j) => (verRecusados ? true : j.estado !== 'recusada'))
      .filter((j) => !somentePendentes || j.estado === 'pendente')
      .filter((j) => {
        if (!termo) return true;
        const pessoa = bancoDados.obterColaboradorPorId(j.colaboradorId);
        return (pessoa?.nome || '').toLowerCase().includes(termo);
      })
      .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  }, [acervo, busca, somentePendentes, verRecusados]);

  const totais = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    return {
      pendentes: acervo.filter((j) => j.estado === 'pendente').length,
      doMes: acervo.filter((j) => j.dataInicio.slice(0, 7) === mes).length,
      /**
       * Documento entregue é o número que interessa na fiscalização:
       * ausência abonada sem papel no arquivo é o que gera autuação.
       */
      semDocumento: acervo.filter(
        (j) => !j.anexoCaminho && j.estado !== 'recusada'
      ).length,
      diasDoMes: acervo
        .filter((j) => j.dataInicio.slice(0, 7) === mes && j.estado === 'aprovada')
        .reduce((t, j) => t + diasCobertos(j), 0),
    };
  }, [acervo]);

  const decidir = async (j: JustificativaAusencia, aprovada: boolean, motivo?: string) => {
    const res = await decidirAusencia(j.id, aprovada, motivo);
    setAviso(res.sucesso ? null : res.erro || 'Não foi possível decidir.');
    if (res.sucesso) {
      setRecusando(null);
      setMotivoRecusa('');
      setVersao((v) => v + 1);
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-1.5">
          <Stethoscope className="w-4 h-4 text-[var(--c-acento)]" />
          Documentos de ausência
        </h2>
        <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
          O arquivo de atestados, declarações de comparecimento e faltas justificadas —
          quem entregou, de quando e o documento. Férias e folga de sábado têm tela
          própria: elas se decidem pelo calendário, não por documento.
        </p>
      </div>

      {/* Os números do mês */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className={`p-3 rounded-2xl border ${
            totais.pendentes > 0
              ? 'bg-amber-500/5 border-amber-500/25'
              : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Aguardando
          </span>
          <span
            className={`block text-xl font-black ${
              totais.pendentes > 0 ? 'text-amber-600' : 'text-[var(--c-texto)]'
            }`}
          >
            {totais.pendentes}
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)]">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Entregues no mês
          </span>
          <span className="block text-xl font-black text-[var(--c-texto)]">
            {totais.doMes}
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)]">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Dias abonados
          </span>
          <span className="block text-xl font-black text-[var(--c-texto)]">
            {totais.diasDoMes}
          </span>
        </div>

        <div
          className={`p-3 rounded-2xl border ${
            totais.semDocumento > 0
              ? 'bg-red-500/5 border-red-500/25'
              : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
            Sem papel no arquivo
          </span>
          <span
            className={`block text-xl font-black ${
              totais.semDocumento > 0 ? 'text-red-600' : 'text-[var(--c-texto)]'
            }`}
          >
            {totais.semDocumento}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
          />
        </div>

        <button
          type="button"
          onClick={() => setSomentePendentes((v) => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
            somentePendentes
              ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
              : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
          }`}
        >
          Só os que aguardam
        </button>

        {recusados.length > 0 && (
          <button
            type="button"
            onClick={() => setVerRecusados((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
              verRecusados
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-[var(--c-superficie)] text-[var(--c-texto-3)] border-[var(--c-borda)]'
            }`}
          >
            {verRecusados ? 'Ocultar recusados' : `Ver recusados (${recusados.length})`}
          </button>
        )}
      </div>

      {aviso && (
        <div className="px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/25 text-xs text-red-700 dark:text-red-400">
          {aviso}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {lista.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--c-texto-3)] flex flex-col items-center gap-2">
            <Paperclip className="w-5 h-5" />
            {somentePendentes
              ? 'Nada aguardando decisão.'
              : 'Nenhum documento de ausência no arquivo.'}
          </div>
        ) : (
          lista.map((j) => {
            const pessoa = bancoDados.obterColaboradorPorId(j.colaboradorId);
            const dias = diasCobertos(j);

            return (
              <div
                key={j.id}
                className={`p-3 rounded-xl border flex gap-3 ${
                  j.estado === 'pendente'
                    ? 'bg-amber-500/5 border-amber-500/25'
                    : j.estado === 'recusada'
                      ? 'bg-[var(--c-canvas)] border-[var(--c-borda)] opacity-70'
                      : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
                }`}
              >
                <Miniatura justificativa={j} aoAbrir={() => setVendo(j)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {pessoa && (
                      <FotoPresenca
                        foto={pessoa.foto}
                        nome={pessoa.nome}
                        presenca={pessoa.presenca}
                        tamanho="w-6 h-6"
                      />
                    )}
                    <span className="text-xs font-bold text-[var(--c-texto)]">
                      {pessoa?.nome || j.colaboradorId}
                    </span>
                    {pessoa && (
                      <span className="text-[10px] text-[var(--c-texto-3)]">
                        {pessoa.setor}
                        {pessoa.loja ? ` · ${pessoa.loja}` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--c-superficie-2)] text-[var(--c-texto-2)]">
                      {ROTULO_TIPO_AUSENCIA[j.tipo]}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
                      {formatarData(j.dataInicio)}
                      {j.dataFim !== j.dataInicio ? ` a ${formatarData(j.dataFim)}` : ''}
                      {dias > 1 ? ` · ${dias} dias` : ''}
                    </span>
                    {/* Quando o papel chegou — é o que responde "entregou a tempo?" */}
                    <span className="text-[10px] text-[var(--c-texto-3)]">
                      entregue em {formatarData(j.criadoEm)}
                    </span>
                  </div>

                  {j.observacao && (
                    <p className="text-xs text-[var(--c-texto-2)] leading-snug mt-1 break-words">
                      {j.observacao}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {j.estado === 'aprovada' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3 h-3" /> Aceito
                        {j.aprovadorNome ? ` por ${j.aprovadorNome}` : ''}
                      </span>
                    )}
                    {j.estado === 'recusada' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400">
                        <X className="w-3 h-3" /> Recusado
                        {j.motivoRecusa ? ` · ${j.motivoRecusa}` : ''}
                      </span>
                    )}
                    {j.estado === 'pendente' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <Clock className="w-3 h-3" /> Aguardando
                      </span>
                    )}

                    {j.anexoCaminho && (
                      <button
                        type="button"
                        onClick={() => setVendo(j)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--c-acento)]"
                      >
                        <Paperclip className="w-3 h-3" />
                        {j.anexoNome || 'Ver documento'}
                      </button>
                    )}
                  </div>

                  {j.estado === 'pendente' && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => setRecusando(j)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--c-borda)] text-[11px] font-bold text-[var(--c-texto-2)] hover:text-red-600 hover:border-red-500/30 transition-colors"
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => decidir(j, true)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors"
                      >
                        Aceitar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {vendo && (
        <VisorDocumento
          justificativa={vendo}
          nomeDaPessoa={
            bancoDados.obterColaboradorPorId(vendo.colaboradorId)?.nome ||
            vendo.colaboradorId
          }
          aoFechar={() => setVendo(null)}
        />
      )}

      {/* Recusar exige motivo: a pessoa precisa saber o que fazer em seguida */}
      {recusando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--c-superficie)] w-full max-w-sm rounded-2xl border border-[var(--c-borda)] shadow-xl p-4 flex flex-col gap-3">
            <span className="text-sm font-bold text-[var(--c-texto)]">
              Recusar o documento de{' '}
              {bancoDados.obterColaboradorPorId(recusando.colaboradorId)?.nome}
            </span>
            <textarea
              value={motivoRecusa}
              onChange={(e) => setMotivoRecusa(e.target.value)}
              rows={3}
              placeholder="Diga o motivo. A pessoa precisa saber o que fazer em seguida."
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecusando(null);
                  setMotivoRecusa('');
                }}
                className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!motivoRecusa.trim()}
                onClick={() => decidir(recusando, false, motivoRecusa.trim())}
                className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40"
              >
                Recusar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
