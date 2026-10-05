/**
 * ASSINATURAS — a mesa do RH para assinar como responsável.
 *
 * Pedido do Elias (05/10/2026): "simplificar o trabalho do RH, tanto para
 * assinar a parte de responsável quanto ter acesso a todos os documentos".
 * Holerite e espelho assinados pelos colaboradores chegam aqui, mês a mês.
 * O RH assina como responsável SÓ O ESPELHO — todos de uma vez, uma senha,
 * um lote. O holerite leva apenas a assinatura do funcionário: aqui ele é
 * consulta e arquivo, não tarefa.
 *
 * O DESENHO, de cima para baixo, na ordem em que o RH pergunta:
 *
 *   1. O mês.
 *   2. Quanto espera por mim? — o número grande e UM botão. É a única ação
 *      da tela; o resto é consulta.
 *   3. As três listas: para assinar, assinados, falta o colaborador. O que
 *      não entra no lote (o próprio documento, o espelho alterado depois)
 *      aparece na lista com o motivo, e não some.
 *   4. Os assinados saem dali mesmo, juntos: os holerites num PDF, os
 *      espelhos numa impressão.
 *
 * A regra da fila mora em `assinaturasDoRH.ts`; quem decide o que entra
 * de fato é o banco (`assinar_como_responsavel`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  PenLine,
  Receipt,
  FileClock,
  CheckCircle2,
  Download,
  Printer,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Colaborador, Holerite, RecebimentoHolerite } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { servicoPonto, batePonto, dataDeHoje, AssinaturaNoEspelho } from '../servicos/ponto';
import { mesesFechados, rotuloDoMes, periodoDoMes, ESPELHO_ASSINADO_DESDE } from '../servicos/meuRH';
import {
  listarRecebimentos,
  assinaturasDoEspelho,
  listarAssinaturasDoResponsavel,
  assinarComoResponsavel,
  AssinaturaDoResponsavel,
} from '../servicos/assinatura';
import { listarHolerites, abrirDocumento, gerarComprovantes } from '../servicos/rh';
import {
  montarFilaDoMes,
  loteDaFila,
  descreverLote,
  ItemDeAssinatura,
  EstadoDaAssinatura,
} from '../servicos/assinaturasDoRH';
import { dataHoraDeBrasilia } from '../servicos/comprovanteDeHolerite';
import { mostrarDocumento, mostrarPdf, mostrarPdfGerado } from '../servicos/visorDeDocumento';
import { baixarArquivo } from '../servicos/compartilharArquivo';
import { nuvem } from '../servicos/nuvem';
import { usandoNuvem } from '../servicos/supabase';
import { FolhaDeAssinar } from './FolhaDeAssinar';
import { useTelaEmbutida, margemDaTela } from './TelaEmbutida';

type Lista = 'para_assinar' | 'assinados' | 'falta_colaborador';
type Tipo = 'todos' | 'holerite' | 'espelho';

/** Em que lista cada estado aparece. O que não entra no lote fica junto do lote, com o motivo. */
const LISTA_DO_ESTADO: Record<EstadoDaAssinatura, Lista> = {
  para_assinar: 'para_assinar',
  alterado: 'para_assinar',
  proprio: 'para_assinar',
  assinado: 'assinados',
  falta_colaborador: 'falta_colaborador',
};

/** Por que um documento da lista não entra no lote — dito na própria linha. */
const FORA_DO_LOTE: Partial<Record<EstadoDaAssinatura, string>> = {
  alterado: 'Alterado depois que o colaborador assinou',
  proprio: 'Espelho seu: outra pessoa do RH assina',
};

interface DadosDoMes {
  holerites: Holerite[];
  recebimentos: Map<string, RecebimentoHolerite>;
  espelhos: Map<string, AssinaturaNoEspelho>;
  responsaveis: Map<string, AssinaturaDoResponsavel>;
}

const VAZIO: DadosDoMes = { holerites: [], recebimentos: new Map(), espelhos: new Map(), responsaveis: new Map() };

/** "05/10 às 14:32" — o ano do mês já está no alto da tela. */
const quandoCurto = (iso: string) => dataHoraDeBrasilia(iso).replace(/\/\d{4}/, '');

export const AbaAssinaturas: React.FC<{ colaboradorAtual: Colaborador }> = ({ colaboradorAtual }) => {
  /** Dentro da estrutura do computador: sem o título próprio, na margem padrão. */
  const embutida = useTelaEmbutida();
  const meses = useMemo(() => mesesFechados(dataDeHoje()), []);
  const [mes, setMes] = useState(meses[0]);
  const [dados, setDados] = useState<DadosDoMes>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const [lista, setLista] = useState<Lista>('para_assinar');
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);

  const pessoas = useMemo(
    () =>
      bancoDados
        .obterColaboradores()
        .filter((c) => c.ativo !== false)
        .map((c) => ({
          id: c.id,
          nome: c.nome,
          // Tem espelho no mês quem bate ponto e já estava na casa
          temEspelho: batePonto(c) && (!c.dataAdmissao || c.dataAdmissao.slice(0, 7) <= mes),
        })),
    [mes]
  );

  /*
    O MÊS INTEIRO, de uma vez. As batidas do mês vêm antes: é com elas que
    se confere se o espelho de hoje ainda é o que a pessoa assinou.
  */
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    (async () => {
      const { inicio, fim } = periodoDoMes(mes);
      if (usandoNuvem()) await nuvem.sincronizarPonto({ inicio, fim });
      const [todos, responsaveis, espelhos] = await Promise.all([
        listarHolerites(),
        listarAssinaturasDoResponsavel({ mes }),
        assinaturasDoEspelho(
          pessoas.map((p) => p.id),
          mes
        ),
      ]);
      const holerites = todos.filter((h) => h.competencia === mes);
      const recebimentos = await listarRecebimentos({ holeriteIds: holerites.map((h) => h.id) });
      if (!vivo) return;
      setDados({ holerites, recebimentos, espelhos, responsaveis });
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [mes, versao, pessoas]);

  const fila = useMemo(
    () =>
      montarFilaDoMes({
        mes,
        eu: colaboradorAtual.id,
        pessoas,
        ...dados,
        cobraEspelho: mes >= ESPELHO_ASSINADO_DESDE,
      }),
    [mes, colaboradorAtual.id, pessoas, dados]
  );
  const lote = loteDaFila(fila);
  const noLote = lote.length;

  const contagem = (l: Lista) => fila.filter((i) => LISTA_DO_ESTADO[i.estado] === l).length;
  const visiveis = fila.filter(
    (i) => LISTA_DO_ESTADO[i.estado] === lista && (tipo === 'todos' || i.documento === tipo)
  );
  const assinados = fila.filter((i) => i.estado === 'assinado');
  const holeritesAssinados = assinados.filter((i) => i.documento === 'holerite');
  const espelhosAssinados = assinados.filter((i) => i.documento === 'espelho');

  const mostrarAviso = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 6000);
  };

  const indice = meses.indexOf(mes);
  const trocarMes = (passo: number) => {
    const proximo = meses[indice + passo];
    if (!proximo) return;
    setMes(proximo);
    setDados(VAZIO);
  };

  // --- Abrir um documento, para conferir antes de assinar ---
  const abrir = async (item: ItemDeAssinatura) => {
    const { inicio, fim } = periodoDoMes(mes);
    if (item.documento === 'espelho') {
      if (!mostrarDocumento(servicoPonto.gerarHtmlEspelho(inicio, fim, [item.colaboradorId], dados.espelhos))) {
        mostrarAviso('Permita as janelas pop-up para abrir o espelho.', true);
      }
      return;
    }
    const holerite = dados.holerites.find((h) => h.id === item.referencia);
    if (!holerite) return;
    const titulo = `Holerite · ${item.nome} · ${rotuloDoMes(mes)}`;
    setOcupado(item.chave);
    /*
      O QUE O RH CONFERE É O ASSINADO (Elias, 05/10/2026): o comprovante com
      o carimbo do colaborador — e o do responsável, depois de assinado. O
      PDF em branco só abre enquanto a pessoa não assinou.
    */
    const recebimento = dados.recebimentos.get(holerite.id);
    if (recebimento) {
      const res = await gerarComprovantes([{ holerite, recebimento, nome: item.nome }]);
      setOcupado(null);
      if (!res.pdf) return mostrarAviso(res.erro || 'Não foi possível montar o comprovante.', true);
      return mostrarPdfGerado(res.pdf, titulo, `Holerite assinado ${item.nome} ${mes}.pdf`);
    }
    const url = await abrirDocumento(holerite.arquivoCaminho);
    setOcupado(null);
    if (!url) return mostrarAviso('Não foi possível abrir o holerite. Tente de novo em instantes.', true);
    mostrarPdf(url, titulo, holerite.arquivoNome);
  };

  // --- Os assinados, juntos ---
  const baixarHolerites = async () => {
    setOcupado('baixar-holerites');
    const itens = holeritesAssinados.flatMap((i) => {
      const holerite = dados.holerites.find((h) => h.id === i.referencia);
      const recebimento = dados.recebimentos.get(i.referencia);
      return holerite && recebimento ? [{ holerite, recebimento, nome: i.nome }] : [];
    });
    const res = await gerarComprovantes(itens);
    setOcupado(null);
    if (!res.pdf) return mostrarAviso(res.erro || 'Não foi possível gerar os comprovantes.', true);
    baixarArquivo(res.pdf, `Holerites assinados ${mes}.pdf`, 'application/pdf');
  };

  const imprimirEspelhos = () => {
    const { inicio, fim } = periodoDoMes(mes);
    const ids = espelhosAssinados.map((i) => i.colaboradorId);
    if (!mostrarDocumento(servicoPonto.gerarHtmlEspelho(inicio, fim, ids, dados.espelhos), { imprimir: true })) {
      mostrarAviso('Permita as janelas pop-up para imprimir os espelhos.', true);
    }
  };

  const assinarLote = async (senha: string) => {
    const res = await assinarComoResponsavel(senha, lote);
    if (res.sucesso) {
      const feitos = res.espelhos || 0;
      mostrarAviso(
        feitos === noLote
          ? `${descreverLote(lote)} assinado${feitos === 1 ? '' : 's'} como responsável.`
          : `${feitos} de ${noLote} assinados. Os outros já tinham sido assinados por outra pessoa do RH.`
      );
    }
    return res;
  };

  const ABAS: Array<{ id: Lista; rotulo: string }> = [
    { id: 'para_assinar', rotulo: 'Para assinar' },
    { id: 'assinados', rotulo: 'Assinados' },
    { id: 'falta_colaborador', rotulo: 'Falta o colaborador' },
  ];

  return (
    <div className={`${margemDaTela(embutida)} flex flex-col gap-4 w-full max-w-3xl`}>
      {/* 1. O mês */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className={embutida ? 'hidden' : 'min-w-0'}>
          <h2 className="text-sm font-bold text-[var(--c-texto)]">Assinaturas do responsável</h2>
          <p className="text-xs text-[var(--c-texto-3)]">
            O espelho leva a sua assinatura; o holerite, só a do colaborador.
          </p>
        </div>
        <div className="flex items-center justify-between gap-1 flex-shrink-0 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-1">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => trocarMes(1)}
            disabled={indice >= meses.length - 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span id="assinaturas-mes" className="min-w-[124px] text-center text-xs font-bold text-[var(--c-texto)]">
            {rotuloDoMes(mes)}
          </span>
          <button
            type="button"
            aria-label="Mês seguinte"
            onClick={() => trocarMes(-1)}
            disabled={indice <= 0}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Quanto espera por mim — e o único botão de ação da tela */}
      {carregando ? (
        <div className="h-[104px] rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center justify-center gap-2 text-xs text-[var(--c-texto-3)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando os documentos do mês…
        </div>
      ) : noLote > 0 ? (
        <section
          id="assinaturas-lote"
          className="p-4 rounded-2xl border border-[var(--c-acento)]/30 bg-[var(--c-acento)]/5 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-3xl font-black tabular-nums text-[var(--c-acento)]">{noLote}</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[var(--c-texto)]">
                {noLote === 1 ? 'espelho de ponto aguarda' : 'espelhos de ponto aguardam'} a sua assinatura
              </span>
              <span className="block text-xs text-[var(--c-texto-3)]">
                Já assinado{noLote === 1 ? '' : 's'} pelos colaboradores · o holerite não precisa do responsável
              </span>
            </span>
          </div>
          <button
            type="button"
            id="assinar-lote"
            onClick={() => setFolhaAberta(true)}
            className="h-11 px-5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold flex items-center justify-center gap-2"
          >
            <PenLine className="w-4 h-4" />
            {noLote === 1 ? 'Assinar' : `Assinar os ${noLote}`}
          </button>
        </section>
      ) : (
        <div className="p-3.5 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[var(--c-ok)] flex-shrink-0" />
          <p className="text-xs text-[var(--c-texto-2)]">
            Nenhum espelho aguardando a sua assinatura em {rotuloDoMes(mes)}. Os que os colaboradores assinarem aparecem aqui.
          </p>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className={`p-3 rounded-xl text-xs font-semibold ${
            aviso.erro
              ? 'bg-red-500/10 border border-red-500/20 text-red-600'
              : 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/* 3. As listas */}
      <div className="flex flex-col gap-2">
        <div role="tablist" aria-label="Situação" className="grid grid-cols-3 p-1 rounded-xl bg-[var(--c-superficie-2)]">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`assinaturas-lista-${a.id}`}
              aria-selected={lista === a.id}
              onClick={() => setLista(a.id)}
              className={`min-h-[52px] px-1 py-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
                lista === a.id
                  ? 'bg-[var(--c-superficie)] text-[var(--c-texto)] shadow-[var(--s-1)]'
                  : 'text-[var(--c-texto-3)]'
              }`}
            >
              {/* O número em cima e o nome embaixo: o nome inteiro cabe no celular */}
              <span className="text-[15px] font-black tabular-nums leading-none">{carregando ? '–' : contagem(a.id)}</span>
              <span className="text-[11px] font-semibold leading-tight text-center">{a.rotulo}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {(
            [
              ['todos', 'Todos'],
              ['holerite', 'Holerites'],
              ['espelho', 'Espelhos'],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTipo(valor)}
              aria-pressed={tipo === valor}
              className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
                tipo === valor
                  ? 'bg-[var(--c-acento)]/10 border-[var(--c-acento)]/40 text-[var(--c-acento)]'
                  : 'border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {!carregando && (
          <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-hidden">
            {visiveis.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-[var(--c-texto-3)] leading-relaxed">
                {lista === 'para_assinar'
                  ? 'Nenhum espelho esperando o responsável neste filtro.'
                  : lista === 'assinados'
                    ? 'Nenhum documento com as duas assinaturas ainda.'
                    : 'Todos os colaboradores já assinaram neste filtro.'}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--c-borda)]">
                {visiveis.map((item) => (
                  <LinhaDoDocumento
                    key={item.chave}
                    item={item}
                    ocupado={ocupado === item.chave}
                    aoAbrir={() => abrir(item)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 4. Os assinados, juntos, para o arquivo */}
      {!carregando && lista === 'assinados' && assinados.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          {holeritesAssinados.length > 0 && (
            <button
              type="button"
              id="baixar-holerites-assinados"
              onClick={baixarHolerites}
              disabled={ocupado === 'baixar-holerites'}
              className="flex-1 h-11 px-4 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] text-sm font-semibold text-[var(--c-texto)] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {ocupado === 'baixar-holerites' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Baixar {holeritesAssinados.length} holerite{holeritesAssinados.length === 1 ? '' : 's'} (PDF)
            </button>
          )}
          {espelhosAssinados.length > 0 && (
            <button
              type="button"
              id="imprimir-espelhos-assinados"
              onClick={imprimirEspelhos}
              className="flex-1 h-11 px-4 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] text-sm font-semibold text-[var(--c-texto)] flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir {espelhosAssinados.length} espelho{espelhosAssinados.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      <FolhaDeAssinar
        aberta={folhaAberta}
        aoFechar={() => setFolhaAberta(false)}
        titulo="Assinar como responsável"
        declaracao="Declaro, como responsável pela Malachias Autopeças, que conferi os espelhos de ponto abaixo, já assinados pelos colaboradores."
        resumo={
          <div className="rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] p-3 text-xs text-[var(--c-texto-2)]">
            <strong className="text-[var(--c-texto)]">{rotuloDoMes(mes)}</strong> · {descreverLote(lote)}
          </div>
        }
        rotuloDoBotao={noLote === 1 ? 'Assinar 1 espelho' : `Assinar ${noLote} espelhos`}
        assinar={assinarLote}
        aoAssinar={() => {
          setFolhaAberta(false);
          setLista('assinados');
          setVersao((v) => v + 1);
        }}
      />
    </div>
  );
};

/** Uma linha da lista: quem, que documento, onde ele está — e o toque abre para conferir. */
const LinhaDoDocumento: React.FC<{ item: ItemDeAssinatura; ocupado: boolean; aoAbrir: () => void }> = ({
  item,
  ocupado,
  aoAbrir,
}) => {
  const ehHolerite = item.documento === 'holerite';
  const foraDoLote = FORA_DO_LOTE[item.estado];
  const detalhe =
    item.estado === 'assinado' && item.responsavel
      ? `${item.responsavel.nome} assinou em ${quandoCurto(item.responsavel.assinadoEm)}`
      : item.colaboradorAssinouEm
        ? `Colaborador assinou em ${quandoCurto(item.colaboradorAssinouEm)}`
        : 'Aguardando o colaborador';

  return (
    <li>
      <button
        type="button"
        onClick={aoAbrir}
        disabled={ocupado}
        className="w-full px-4 py-3 flex items-center gap-3 text-left min-h-[60px] hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors disabled:opacity-60"
      >
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            ehHolerite ? 'text-emerald-600 bg-emerald-500/10' : 'text-blue-600 bg-blue-500/10'
          }`}
        >
          {ehHolerite ? <Receipt className="w-5 h-5" /> : <FileClock className="w-5 h-5" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-[var(--c-texto)] truncate">{item.nome}</span>
          <span className="block text-xs text-[var(--c-texto-3)] truncate">
            {ehHolerite ? 'Holerite' : 'Espelho de ponto'} · {detalhe}
          </span>
          {foraDoLote && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {foraDoLote}
            </span>
          )}
        </span>
        <span className="flex-shrink-0 text-[var(--c-texto-3)]">
          {ocupado ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : item.estado === 'assinado' ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--c-ok)]" />
          ) : item.estado === 'falta_colaborador' ? (
            <Clock className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
      </button>
    </li>
  );
};
