/**
 * MEU RH — as informações corporativas da própria pessoa, na aba Eu.
 *
 * Pedido do Elias: "cada usuário terá documentos, folga, férias,
 * holerite, advertência, espelho do ponto (disponível no fechamento do
 * mês), de maneira organizada".
 *
 * A ORGANIZAÇÃO: seis cartões, cada um já dizendo o que importa ("último:
 * Agosto", "1 aguardando sua ciência") — a pessoa sabe se precisa abrir
 * sem abrir. O toque sobe uma folha com a lista inteira. É o desenho de
 * aplicativo que o sistema já usa no Justificar e na Central.
 *
 * NADA É GUARDADO AQUI. Cada dado tem dono (ver `servicos/meuRH.ts`), e
 * esta tela só pede e mostra. Ela substitui "Meus documentos", que
 * mostrava só holerite e advertência.
 *
 * A CIÊNCIA DA ADVERTÊNCIA É DADA AQUI, e só aqui. Quem confirma que leu
 * é quem leu; o RH apenas enxerga se já houve.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  FileClock,
  Receipt,
  Palmtree,
  CalendarCheck,
  FileText,
  AlertTriangle,
  ChevronRight,
  Check,
  Clock,
  Loader2,
} from 'lucide-react';
import { Colaborador, Holerite, Advertencia, ROTULO_ADVERTENCIA, RecebimentoHolerite } from '../tipos';
import { listarRecebimentos } from '../servicos/assinatura';
import { dataHoraDeBrasilia } from '../servicos/comprovanteDeHolerite';
import { AssinarHolerite } from './AssinarHolerite';
import { ouvirFolhaPedida, tomarFolhaPedida } from '../servicos/folhaPedida';
import { listarHolerites, listarAdvertencias, abrirDocumento, darCienciaNaAdvertencia } from '../servicos/rh';
import { lerJustificativas, assinarJustificativas } from '../servicos/justificativasCache';
import { formatarDataBR, dataDeHoje, batePonto } from '../servicos/ponto';
import {
  mesesFechados,
  rotuloDoMes,
  liberacaoDoMesAtual,
  separarMinhasAusencias,
  situacaoDasFerias,
  prepararMeuEspelho,
  pendenciasDoMeuRH,
} from '../servicos/meuRH';
import { FolhaInferior } from './FolhaInferior';
import { CartaoSolicitacao } from './AbaJustificar';
import { mostrarDocumento, mostrarPdf, usaVisor } from '../servicos/visorDeDocumento';
import { rodandoNoAplicativo } from '../servicos/aplicativo';

interface Props {
  colaboradorAtual: Colaborador;
}

type Folha = 'espelho' | 'holerites' | 'ferias' | 'folgas' | 'documentos' | 'advertencias';

/**
 * ABRE A JANELA NO TOQUE, e só depois busca o conteúdo.
 *
 * O navegador só deixa abrir janela como resposta direta ao toque. Buscar
 * o endereço primeiro e abrir depois do `await` é bloqueado como pop-up —
 * e a pessoa toca no holerite e nada acontece.
 */
const abrirJanelaParaDepois = (): Window | null => {
  const janela = window.open('', '_blank');
  if (janela) {
    janela.document.write(
      '<p style="font-family:system-ui;padding:24px;color:#555">Carregando…</p>'
    );
  }
  return janela;
};

/** Um cartão da grade: o nome, o que importa agora, e o sinal de ação pendente. */
const Cartao: React.FC<{
  id: string;
  titulo: string;
  resumo: string;
  icone: React.ReactNode;
  cor: string;
  alerta?: boolean;
  aoAbrir: () => void;
}> = ({ id, titulo, resumo, icone, cor, alerta, aoAbrir }) => (
  <button
    type="button"
    id={id}
    onClick={aoAbrir}
    className={`relative text-left p-3.5 rounded-2xl border flex flex-col gap-2.5 min-h-[112px] active:scale-[0.98] transition-all ${
      alerta
        ? 'bg-amber-500/8 border-amber-500/40'
        : 'bg-[var(--c-superficie)] border-[var(--c-borda)] hover:border-[var(--c-borda-forte)]'
    }`}
  >
    <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${cor}`}>{icone}</span>
    <span className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[15px] font-bold text-[var(--c-texto)] leading-tight">{titulo}</span>
      <span
        className={`text-xs leading-snug line-clamp-2 ${
          alerta ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-[var(--c-texto-3)]'
        }`}
      >
        {resumo}
      </span>
    </span>
    {alerta && (
      <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden />
    )}
  </button>
);

/** A lista vazia diz o que ali vai aparecer — e não só "nada". */
const Vazio: React.FC<{ texto: string }> = ({ texto }) => (
  <p className="px-6 py-10 text-center text-sm text-[var(--c-texto-3)] leading-relaxed">{texto}</p>
);

/** Uma linha de lista com ação: grande o bastante para o dedo. */
const Linha: React.FC<{
  titulo: string;
  detalhe?: string;
  icone: React.ReactNode;
  acao: React.ReactNode;
  aoTocar: () => void;
  ocupado?: boolean;
  id?: string;
}> = ({ titulo, detalhe, icone, acao, aoTocar, ocupado, id }) => (
  <li>
    <button
      type="button"
      id={id}
      onClick={aoTocar}
      disabled={ocupado}
      className="w-full px-4 py-3 flex items-center gap-3 text-left min-h-[60px] active:bg-[var(--c-superficie-2)] hover:bg-[var(--c-superficie-2)] transition-colors disabled:opacity-60"
    >
      <span className="w-10 h-10 rounded-xl bg-[var(--c-superficie-2)] text-[var(--c-acento)] flex items-center justify-center flex-shrink-0">
        {icone}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-[var(--c-texto)] truncate">{titulo}</span>
        {detalhe && <span className="block text-xs text-[var(--c-texto-3)] truncate">{detalhe}</span>}
      </span>
      <span className="flex-shrink-0 text-[var(--c-texto-3)]">
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : acao}
      </span>
    </button>
  </li>
);

export const MeuRH: React.FC<Props> = ({ colaboradorAtual }) => {
  const eu = colaboradorAtual;
  const hoje = dataDeHoje();

  const [holerites, setHolerites] = useState<Holerite[]>([]);
  const [advertencias, setAdvertencias] = useState<Advertencia[]>([]);
  const [recebimentos, setRecebimentos] = useState<Map<string, RecebimentoHolerite>>(new Map());
  const [versao, setVersao] = useState(0);
  const [versaoAusencias, setVersaoAusencias] = useState(0);
  const [folha, setFolha] = useState<Folha | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Holerite e advertência: pede SÓ os da pessoa — a lista da rede nem chega ao aparelho
  useEffect(() => {
    let cancelado = false;
    Promise.all([
      listarHolerites(eu.id),
      listarAdvertencias(eu.id),
      listarRecebimentos({ colaboradorId: eu.id }),
    ]).then(([h, a, r]) => {
      if (cancelado) return;
      setHolerites(h);
      setAdvertencias(a);
      setRecebimentos(r);
    });
    return () => {
      cancelado = true;
    };
  }, [eu.id, versao]);

  // Ausências chegam pelo tempo real: a decisão do gestor aparece sem recarregar
  useEffect(() => assinarJustificativas(() => setVersaoAusencias((v) => v + 1)), []);

  const ausencias = useMemo(() => {
    void versaoAusencias;
    return separarMinhasAusencias(lerJustificativas(), eu.id);
  }, [eu.id, versaoAusencias]);

  const ferias = situacaoDasFerias(ausencias.ferias, hoje);
  const meses = mesesFechados(hoje, eu.dataAdmissao);
  const { semCiencia, holeritesParaAssinar } = pendenciasDoMeuRH(holerites, recebimentos, advertencias);
  const documentosEmAnalise = ausencias.documentos.filter((j) => j.estado === 'pendente');
  /**
   * A folga que interessa: a deste mês, ou a próxima que vem. "Nenhuma
   * neste mês" com um pedido em análise para o mês que vem esconde
   * justamente a resposta que a pessoa está esperando.
   */
  const folgaEmDestaque =
    ausencias.folgas.find(
      (j) => j.dataInicio.slice(0, 7) === hoje.slice(0, 7) && j.estado !== 'recusada'
    ) ||
    [...ausencias.folgas]
      .filter((j) => j.dataInicio > hoje && j.estado !== 'recusada')
      .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0];

  /**
   * Abrir a folha busca de novo holerite e advertência. Eles não vêm pelo
   * tempo real: o que o RH publicou com esta aba já aberta só apareceria
   * trocando de aba. Um pedido por toque é barato; ouvir cada aviso do
   * banco para isso não seria.
   */
  const abrirFolha = (qual: Folha) => {
    if (qual === 'holerites' || qual === 'advertencias') setVersao((v) => v + 1);
    setFolha(qual);
  };

  // O toque no aviso de holerite (ou de documento do RH) pede a folha
  useEffect(() => {
    const atender = () => {
      const pedida = tomarFolhaPedida();
      if (pedida) abrirFolha(pedida);
    };
    atender();
    return ouvirFolhaPedida(atender);
  }, []);

  const mostrarAviso = (texto: string) => {
    setAviso(texto);
    setTimeout(() => setAviso(null), 6000);
  };

  const abrirArquivo = async (caminho: string, chave: string) => {
    /*
      No aplicativo não se abre janela antes: ela seria a própria tela do
      sistema, coberta pelo "Carregando…". O endereço do arquivo é de fora
      do sistema, e o aplicativo o entrega ao navegador do celular.
    */
    const janela = rodandoNoAplicativo() ? null : abrirJanelaParaDepois();
    setAbrindo(chave);
    const url = await abrirDocumento(caminho);
    setAbrindo(null);
    if (!url) {
      janela?.close();
      return mostrarAviso('Não foi possível abrir o arquivo. Tente de novo em instantes.');
    }
    if (janela) janela.location.href = url;
    else window.location.href = url;
  };

  /*
    O HOLERITE ABRE NO VISOR, dentro do sistema, em qualquer aparelho:
    nada de baixar para ver, nem de sair do aplicativo. É ali que a
    assinatura digital vai entrar.
  */
  const abrirHolerite = async (h: Holerite) => {
    setAbrindo(h.id);
    const url = await abrirDocumento(h.arquivoCaminho);
    setAbrindo(null);
    if (!url) return mostrarAviso('Não foi possível abrir o holerite. Tente de novo em instantes.');
    mostrarPdf(url, `Holerite · ${rotuloDoMes(h.competencia)}`, h.arquivoNome, (dados) => (
      <AssinarHolerite holerite={h} dados={dados} aoAssinar={() => setVersao((v) => v + 1)} />
    ));
  };

  const abrirEspelho = async (mes: string) => {
    /*
      NO CELULAR, O VISOR — e nenhuma janela aberta antes. No aplicativo
      Android a "janela" é a própria página: o "Carregando…" e depois o
      espelho eram escritos por cima do sistema, e não havia como voltar.
    */
    const noVisor = usaVisor();
    const janela = noVisor ? null : abrirJanelaParaDepois();
    setAbrindo(mes);
    const res = await prepararMeuEspelho(eu.id, mes, hoje);
    setAbrindo(null);
    if (!res.html) {
      janela?.close();
      return mostrarAviso(res.erro || 'Não foi possível montar o espelho.');
    }
    if (noVisor) {
      mostrarDocumento(res.html);
      return;
    }
    if (!janela) return mostrarAviso('O navegador bloqueou a janela. Permita pop-ups para o CONECTA.');
    janela.document.open();
    janela.document.write(res.html);
    janela.document.close();
  };

  const darCiencia = async (a: Advertencia) => {
    setAbrindo(a.id);
    const res = await darCienciaNaAdvertencia(a);
    setAbrindo(null);
    if (res.sucesso) setVersao((v) => v + 1);
    else mostrarAviso(res.erro || 'A ciência não foi registrada.');
  };

  const caixaDeAviso = (
    <div
      role="status"
      className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600"
    >
      {aviso}
    </div>
  );

  const resumoFerias = ferias.emCurso
    ? `Em férias até ${formatarDataBR(ferias.emCurso.dataFim)}`
    : ferias.proxima
      ? `Próximas: ${formatarDataBR(ferias.proxima.dataInicio)}${
          ferias.proxima.estado === 'pendente' ? ' · em análise' : ''
        }`
      : ferias.diasNoAno > 0
        ? `${ferias.diasNoAno} dias em ${hoje.slice(0, 4)}`
        : 'Nenhuma programada';

  const TITULOS: Record<Folha, { titulo: string; subtitulo: string }> = {
    espelho: {
      titulo: 'Espelho de ponto',
      subtitulo: `Sai no fechamento do mês · o atual em ${formatarDataBR(liberacaoDoMesAtual(hoje))}`,
    },
    holerites: { titulo: 'Holerites', subtitulo: 'Publicados pelo RH, do mais recente' },
    ferias: {
      titulo: 'Férias',
      subtitulo: `${ferias.diasNoAno} dia${ferias.diasNoAno === 1 ? '' : 's'} lançados em ${hoje.slice(0, 4)}`,
    },
    folgas: { titulo: 'Folgas de sábado', subtitulo: 'Uma por mês, pedida no Ponto' },
    documentos: { titulo: 'Documentos', subtitulo: 'Atestados e declarações que você entregou' },
    advertencias: { titulo: 'Advertências', subtitulo: 'Dar ciência é dizer que leu, não que concorda' },
  };

  return (
    <section id="meu-rh" className="px-4 pt-5 pb-1 lg:px-0 lg:pt-0">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-bold text-[var(--c-texto)]">Meu RH</h2>
        <span className="text-xs text-[var(--c-texto-3)]">Só você vê</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Espelho e folga de sábado são do ponto: quem não bate não tem */}
        {batePonto(eu) && (
          <Cartao
            id="meu-rh-espelho"
            titulo="Espelho de ponto"
            resumo={meses.length ? `Último fechado: ${rotuloDoMes(meses[0])}` : 'O primeiro sai no fim do mês'}
            icone={<FileClock className="w-5 h-5" />}
            cor="text-blue-600 bg-blue-500/10"
            aoAbrir={() => abrirFolha('espelho')}
          />
        )}
        <Cartao
          id="meu-rh-holerites"
          titulo="Holerites"
          resumo={
            holeritesParaAssinar.length
              ? `${holeritesParaAssinar.length} para assinar`
              : holerites.length
                ? `Último: ${rotuloDoMes(holerites[0].competencia)}`
                : 'Nenhum publicado ainda'
          }
          alerta={holeritesParaAssinar.length > 0}
          icone={<Receipt className="w-5 h-5" />}
          cor="text-emerald-600 bg-emerald-500/10"
          aoAbrir={() => abrirFolha('holerites')}
        />
        <Cartao
          id="meu-rh-ferias"
          titulo="Férias"
          resumo={resumoFerias}
          icone={<Palmtree className="w-5 h-5" />}
          cor="text-teal-600 bg-teal-500/10"
          aoAbrir={() => abrirFolha('ferias')}
        />
        {batePonto(eu) && (
          <Cartao
            id="meu-rh-folgas"
            titulo="Folgas"
            resumo={
              folgaEmDestaque
                ? `${
                    folgaEmDestaque.dataInicio.slice(0, 7) === hoje.slice(0, 7) ? 'Este mês' : 'Próxima'
                  }: ${formatarDataBR(folgaEmDestaque.dataInicio)}${
                    folgaEmDestaque.estado === 'pendente' ? ' · em análise' : ''
                  }`
                : 'Nenhuma marcada'
            }
            icone={<CalendarCheck className="w-5 h-5" />}
            cor="text-sky-600 bg-sky-500/10"
            aoAbrir={() => abrirFolha('folgas')}
          />
        )}
        <Cartao
          id="meu-rh-documentos"
          titulo="Documentos"
          resumo={
            documentosEmAnalise.length
              ? `${documentosEmAnalise.length} em análise`
              : ausencias.documentos.length
                ? `${ausencias.documentos.length} entregue${ausencias.documentos.length === 1 ? '' : 's'}`
                : 'Nenhum entregue'
          }
          icone={<FileText className="w-5 h-5" />}
          cor="text-violet-600 bg-violet-500/10"
          aoAbrir={() => abrirFolha('documentos')}
        />
        <Cartao
          id="meu-rh-advertencias"
          titulo="Advertências"
          resumo={
            semCiencia.length
              ? `${semCiencia.length} aguardando sua ciência`
              : advertencias.length
                ? `${advertencias.length} registrada${advertencias.length === 1 ? '' : 's'}`
                : 'Nenhuma'
          }
          icone={<AlertTriangle className="w-5 h-5" />}
          cor="text-amber-600 bg-amber-500/10"
          alerta={semCiencia.length > 0}
          aoAbrir={() => abrirFolha('advertencias')}
        />
      </div>

      {/* Com a folha aberta o aviso vai para dentro dela: atrás, ninguém o veria */}
      {aviso && !folha && <div className="mt-3">{caixaDeAviso}</div>}

      <FolhaInferior
        aberto={!!folha}
        titulo={folha ? TITULOS[folha].titulo : ''}
        subtitulo={folha ? TITULOS[folha].subtitulo : undefined}
        aoFechar={() => setFolha(null)}
      >
        {aviso && <div className="px-4 pt-3">{caixaDeAviso}</div>}

        {folha === 'espelho' &&
          (meses.length === 0 ? (
            <Vazio texto="O seu primeiro espelho fica disponível quando o mês da sua admissão fechar." />
          ) : (
            <ul className="divide-y divide-[var(--c-borda)]">
              {meses.map((mes) => (
                <Linha
                  key={mes}
                  id={`espelho-${mes}`}
                  titulo={rotuloDoMes(mes)}
                  detalhe="Marcações, jornada e saldo do mês"
                  icone={<FileClock className="w-5 h-5" />}
                  acao={<ChevronRight className="w-4 h-4" />}
                  ocupado={abrindo === mes}
                  aoTocar={() => abrirEspelho(mes)}
                />
              ))}
            </ul>
          ))}

        {folha === 'holerites' &&
          (holerites.length === 0 ? (
            <Vazio texto="Quando o RH publicar o seu holerite, ele aparece aqui — só você e o RH têm acesso." />
          ) : (
            <ul className="divide-y divide-[var(--c-borda)]">
              {holerites.map((h) => (
                <Linha
                  key={h.id}
                  titulo={rotuloDoMes(h.competencia)}
                  detalhe={
                    recebimentos.has(h.id)
                      ? `Assinado em ${dataHoraDeBrasilia(recebimentos.get(h.id)!.assinadoEm)}`
                      : 'Falta assinar o recebimento'
                  }
                  icone={<Receipt className="w-5 h-5" />}
                  acao={<ChevronRight className="w-4 h-4" />}
                  ocupado={abrindo === h.id}
                  aoTocar={() => abrirHolerite(h)}
                />
              ))}
            </ul>
          ))}

        {folha === 'ferias' &&
          (ausencias.ferias.length === 0 ? (
            <Vazio texto="As férias são lançadas pelo seu responsável ou pelo RH, e aparecem aqui assim que forem programadas." />
          ) : (
            <ul>
              {ausencias.ferias.map((j) => (
                <CartaoSolicitacao key={j.id} j={j} />
              ))}
            </ul>
          ))}

        {folha === 'folgas' &&
          (ausencias.folgas.length === 0 ? (
            <Vazio texto="Nenhuma folga de sábado ainda. Para pedir, vá em Ponto → Justificar ausência." />
          ) : (
            <ul>
              {ausencias.folgas.map((j) => (
                <CartaoSolicitacao key={j.id} j={j} />
              ))}
            </ul>
          ))}

        {folha === 'documentos' &&
          (ausencias.documentos.length === 0 ? (
            <Vazio texto="Atestados e declarações que você enviar em Ponto → Justificar ausência ficam guardados aqui." />
          ) : (
            <ul>
              {ausencias.documentos.map((j) => (
                <CartaoSolicitacao key={j.id} j={j} aoAbrirAnexo={(c) => abrirArquivo(c, j.id)} />
              ))}
            </ul>
          ))}

        {folha === 'advertencias' &&
          (advertencias.length === 0 ? (
            <Vazio texto="Nenhuma advertência registrada." />
          ) : (
            <ul className="divide-y divide-[var(--c-borda)]">
              {advertencias.map((a) => (
                <li key={a.id} className="px-4 py-3.5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-semibold text-[var(--c-texto)] leading-tight">
                      {ROTULO_ADVERTENCIA[a.tipo]}
                      {a.tipo === 'suspensao' && a.diasSuspensao ? ` · ${a.diasSuspensao} dias` : ''}
                    </span>
                    <span className="text-xs text-[var(--c-texto-3)] tabular-nums flex-shrink-0">
                      {formatarDataBR(a.data)}
                    </span>
                  </div>
                  <p className="text-[13px] text-[var(--c-texto-2)] leading-snug break-words">{a.motivo}</p>
                  {a.arquivoCaminho && (
                    <button
                      type="button"
                      onClick={() => abrirArquivo(a.arquivoCaminho!, `doc-${a.id}`)}
                      className="self-start text-xs font-semibold text-[var(--c-acento)] min-h-[32px]"
                    >
                      Abrir documento
                    </button>
                  )}
                  {a.cienciaEm ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      Você deu ciência em {formatarDataBR(a.cienciaEm.slice(0, 10))}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/25">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        Aguardando sua ciência
                      </span>
                      <button
                        type="button"
                        id={`dar-ciencia-${a.id}`}
                        onClick={() => darCiencia(a)}
                        disabled={abrindo === a.id}
                        className="h-11 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-60"
                      >
                        {abrindo === a.id ? 'Registrando…' : 'Li e tomei ciência'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </FolhaInferior>
    </section>
  );
};
