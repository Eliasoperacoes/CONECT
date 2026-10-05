/**
 * Quadro da escala de folgas — CONECTA / Malachias Autopeças
 *
 * Arrastar gente para o sábado em que ela folga, vários de uma vez.
 *
 * ===================================================================
 * POR QUE RASCUNHO, E NÃO GRAVAR A CADA ARRASTÃO
 * ===================================================================
 *
 * Montar a escala do mês é um trabalho de tentativa: põe três no dia 12,
 * vê que a loja fica vazia, tira dois. Gravar cada movimento encheria o
 * banco de folga que o gestor desfaz no segundo seguinte — e cada uma
 * delas é um documento, com aprovador e data.
 *
 * Então o quadro monta LOCAL e grava de uma vez. O que está por salvar
 * aparece marcado, e o "Desfazer" joga fora o rascunho inteiro sem
 * encostar no que já estava gravado.
 *
 * ===================================================================
 * AS REGRAS NÃO MORAM AQUI
 * ===================================================================
 *
 * Quem pode ser escalado por quem, o limite de uma folga por mês, só
 * sábado — tudo isso é `salvarEscalaDeFolgas`, que por sua vez chama
 * `lancarAusenciaPelaLideranca`. Esta tela só desenha e pergunta.
 *
 * É de propósito: a separação por loja vem da ALÇADA, e uma segunda
 * regra escrita aqui divergiria dela no primeiro ajuste — que é o
 * defeito que já apareceu quatro vezes nesta base.
 */

import React, { useMemo, useState } from 'react';
import {
  Search,
  GripVertical,
  X,
  Save,
  Undo2,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Colaborador, JustificativaAusencia, Loja } from '../tipos';
import { formatarDataBR } from '../servicos/ponto';
import { folgasPermitidasNoMes } from '../servicos/justificativas';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  /** Quem este gestor pode escalar. Já vem filtrado pela alçada. */
  equipe: Colaborador[];
  sabados: string[];
  /** O que já está gravado, por sábado. */
  porSabado: Map<string, JustificativaAusencia[]>;
  aoSalvar: (alteracoes: {
    adicionar: Array<{ colaboradorId: string; sabado: string }>;
    remover: Array<{ justificativaId: string }>;
  }) => Promise<void>;
  salvando: boolean;
  /**
   * DECIDIR O QUE A PESSOA PEDIU, e não o que o gestor montou.
   *
   * Folga pendente é pedido do colaborador esperando resposta — coisa
   * diferente do rascunho, que é a escala que o gestor está desenhando.
   * Os dois convivem no mesmo sábado e precisam de ações diferentes:
   * rascunho se desfaz, pedido se aprova ou se recusa com motivo.
   *
   * Sem isto, arrastar teria custado a única porta de aprovação que a
   * tela tinha — e os pedidos ficariam parados sem ninguém notar.
   */
  aoAprovar: (j: JustificativaAusencia) => void;
  aoRecusar: (j: JustificativaAusencia) => void;
}

/** As iniciais que aparecem no círculo quando não há foto. */
const iniciais = (nome: string): string =>
  nome
    .split(' ')
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || nome.slice(0, 2).toUpperCase();

export const QuadroEscalaFolgas: React.FC<Props> = ({
  equipe,
  sabados,
  porSabado,
  aoSalvar,
  salvando,
  aoAprovar,
  aoRecusar,
}) => {
  const [busca, setBusca] = useState('');
  const [filtroLoja, setFiltroLoja] = useState<Loja | 'todas'>('todas');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  /**
   * O RASCUNHO, em duas metades.
   *
   * `aAdicionar` é colaborador → os sábados novos dele. Era colaborador →
   * UM sábado, porque a folga era uma por mês — e a escala não conseguia
   * pôr a Fernanda em 03/10 e 31/10, a folga trocada e a dela (Elias,
   * 05/10/2026). Quantas cabem é `folgasPermitidasNoMes`: uma, ou mais
   * uma para cada folga trabalhada no mês anterior. Com o direito cheio,
   * arrastar MOVE, como sempre foi.
   */
  const [aAdicionar, setAAdicionar] = useState<Map<string, string[]>>(new Map());
  const [aRemover, setARemover] = useState<Set<string>>(new Set());
  /** Quem não coube no sábado pedido, para a tela dizer por quê. */
  const [aviso, setAviso] = useState<string | null>(null);

  const totalAAdicionar = [...aAdicionar.values()].reduce((t, l) => t + l.length, 0);
  const temRascunho = totalAAdicionar > 0 || aRemover.size > 0;

  /** Quantas folgas cada pessoa pode ter no mês desta escala. */
  const capacidade = (colaboradorId: string): number =>
    sabados.length > 0 ? folgasPermitidasNoMes(colaboradorId, sabados[0]) : 1;

  /** As lojas que aparecem no filtro: só as que a equipe de fato tem. */
  const lojas = useMemo(
    () => [...new Set(equipe.map((c) => c.loja))].sort(),
    [equipe]
  );

  /**
   * Onde cada pessoa está no mês, considerando o rascunho.
   *
   * Uma fonte só para as duas perguntas da tela — "quem está neste
   * sábado" e "esta pessoa já tem folga" —, senão as duas divergem e a
   * lista mostra alguém como livre enquanto a coluna já o tem.
   */
  const folgasDaPessoa = useMemo(() => {
    const mapa = new Map<
      string,
      Array<{ sabado: string; justificativa?: JustificativaAusencia; novo: boolean }>
    >();
    const juntar = (id: string, f: { sabado: string; justificativa?: JustificativaAusencia; novo: boolean }) =>
      mapa.set(id, [...(mapa.get(id) || []), f].sort((a, b) => a.sabado.localeCompare(b.sabado)));

    for (const [sabado, lista] of porSabado) {
      for (const j of lista) {
        if (aRemover.has(j.id)) continue;
        juntar(j.colaboradorId, { sabado, justificativa: j, novo: false });
      }
    }
    for (const [colaboradorId, novos] of aAdicionar) {
      for (const sabado of novos) juntar(colaboradorId, { sabado, novo: true });
    }
    return mapa;
  }, [porSabado, aAdicionar, aRemover]);

  const daBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return equipe.filter(
      (c) =>
        (filtroLoja === 'todas' || c.loja === filtroLoja) &&
        (!termo ||
          c.nome.toLowerCase().includes(termo) ||
          (c.cargo || '').toLowerCase().includes(termo) ||
          (c.setor || '').toLowerCase().includes(termo))
    );
  }, [equipe, busca, filtroLoja]);

  const alternarSelecao = (id: string) =>
    setSelecionados((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });

  /**
   * ARRASTAR LEVA A SELEÇÃO INTEIRA.
   *
   * Quem marcou cinco pessoas e arrasta uma delas quer as cinco no dia —
   * é o que o gesto diz. Arrastar alguém de FORA da seleção leva só ele,
   * porque aí a seleção não era sobre ele.
   */
  const aoComecarArrasto = (evento: React.DragEvent, colaboradorId: string) => {
    const carga = selecionados.has(colaboradorId)
      ? [...selecionados]
      : [colaboradorId];

    evento.dataTransfer.setData('text/plain', carga.join(','));
    evento.dataTransfer.effectAllowed = 'move';
  };

  const [sabadoAlvo, setSabadoAlvo] = useState<string | null>(null);

  const aoSoltar = (evento: React.DragEvent, sabado: string) => {
    evento.preventDefault();
    setSabadoAlvo(null);

    const ids = (evento.dataTransfer.getData('text/plain') || '')
      .split(',')
      .filter(Boolean);
    if (ids.length === 0) return;

    const adicionar = new Map([...aAdicionar].map(([id, l]) => [id, [...l]]));
    const remover = new Set(aRemover);
    const naoCouberam: string[] = [];

    for (const id of ids) {
      const atuais = folgasDaPessoa.get(id) || [];
      /**
       * Já está NESTE sábado: não há o que fazer. Sem esta saída, arrastar
       * alguém de volta para onde ele já está criaria uma remoção e uma
       * adição do mesmo dia — trabalho para o banco e uma recusa no
       * histórico, por nada.
       */
      if (atuais.some((f) => f.sabado === sabado)) continue;

      /*
        CABE MAIS UMA: acrescenta. É a folga trocada — a Fernanda em 03/10
        além da de 31/10. Não cabe: MOVE, como sempre foi — a que está no
        rascunho primeiro; a gravada só quando o direito é de uma folga
        (aí não há dúvida de qual mover). Com duas gravadas e o direito
        cheio, o gestor tira a que quer antes: adivinhar seria tirar a
        errada.

        Mover a gravada é uma retirada e uma adição: `salvarEscalaDeFolgas`
        remove antes de adicionar, senão o limite recusaria a própria troca.
      */
      if (atuais.length >= capacidade(id)) {
        const doRascunho = atuais.filter((f) => f.novo);
        const gravadas = atuais.filter((f) => !f.novo && f.justificativa);
        if (doRascunho.length > 0) {
          const ultimo = doRascunho[doRascunho.length - 1].sabado;
          adicionar.set(id, (adicionar.get(id) || []).filter((s) => s !== ultimo));
        } else if (capacidade(id) === 1 && gravadas.length > 0) {
          remover.add(gravadas[0].justificativa!.id);
        } else {
          naoCouberam.push(equipe.find((c) => c.id === id)?.nome.split(' ')[0] || 'Alguém');
          continue;
        }
      }
      adicionar.set(id, [...(adicionar.get(id) || []), sabado]);
    }

    setAAdicionar(new Map([...adicionar].filter(([, l]) => l.length > 0)));
    setARemover(remover);
    setAviso(
      naoCouberam.length > 0
        ? `${naoCouberam.join(', ')} já ${naoCouberam.length === 1 ? 'tem' : 'têm'} todas as folgas do mês. Tire uma antes de pôr em outro sábado.`
        : null
    );
    setSelecionados(new Set());
  };

  /** Tira alguém DESTE sábado: some do rascunho, ou entra na fila de retirada. */
  const tirar = (colaboradorId: string, sabado: string) => {
    const folga = (folgasDaPessoa.get(colaboradorId) || []).find((f) => f.sabado === sabado);
    if (!folga) return;

    if (folga.novo) {
      setAAdicionar((atual) => {
        const nova = new Map(atual);
        const resto = (nova.get(colaboradorId) || []).filter((s) => s !== sabado);
        if (resto.length > 0) nova.set(colaboradorId, resto);
        else nova.delete(colaboradorId);
        return nova;
      });
    } else if (folga.justificativa) {
      setARemover((atual) => new Set(atual).add(folga.justificativa!.id));
    }
  };

  const desfazer = () => {
    setAAdicionar(new Map());
    setARemover(new Set());
    setSelecionados(new Set());
    setAviso(null);
  };

  const salvar = async () => {
    await aoSalvar({
      adicionar: [...aAdicionar].flatMap(([colaboradorId, novos]) =>
        novos.map((sabado) => ({ colaboradorId, sabado }))
      ),
      remover: [...aRemover].map((justificativaId) => ({ justificativaId })),
    });
    desfazer();
  };

  /**
   * Quanto da equipe sai naquele sábado, em porcentagem.
   *
   * Serve só para a barrinha: número puro se lê devagar, barra se lê de
   * relance — e a pergunta "a loja aguenta mais uma?" é de relance.
   */
  const proporcaoFora = (quantos: number): number =>
    equipe.length === 0 ? 0 : Math.round((quantos / equipe.length) * 100);

  /** Quem está num sábado, com o que veio do banco e o que é rascunho. */
  const doSabado = (sabado: string) =>
    equipe
      .map((c) => ({ c, folga: (folgasDaPessoa.get(c.id) || []).find((f) => f.sabado === sabado) }))
      .filter(({ folga }) => !!folga)
      .map(({ c, folga }) => ({ colaborador: c, ...folga! }))
      .sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome));

  return (
    <div className="flex flex-col gap-3">
      {/* A barra do rascunho: só aparece quando há o que salvar */}
      {aviso && (
        <div role="status" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-[11px] font-bold underline">
            Entendi
          </button>
        </div>
      )}

      {temRascunho && (
        <div className="p-3 rounded-xl bg-[var(--c-acento-suave)] border border-[var(--c-acento)]/30 flex flex-wrap items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
          <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--c-texto)]">
            {totalAAdicionar > 0 && `${totalAAdicionar} folga(s) a marcar`}
            {totalAAdicionar > 0 && aRemover.size > 0 && ' · '}
            {aRemover.size > 0 && `${aRemover.size} a retirar`}
            <span className="font-normal text-[var(--c-texto-3)]">
              {' '}
              — nada foi gravado ainda
            </span>
          </span>

          <button
            type="button"
            onClick={desfazer}
            disabled={salvando}
            className="px-3 py-1.5 rounded-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-borda-forte)] disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Desfazer
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="px-3 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        {/* ---------- A EQUIPE ---------- */}
        <div className="lg:w-72 flex-shrink-0 flex flex-col gap-2 p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)]" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar colaborador…"
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
            />
          </div>

          {/*
            O filtro de unidade só aparece quando há mais de uma: para o
            gerente de uma loja só, ele seria um campo que nunca muda nada.
          */}
          {lojas.length > 1 && (
            <select
              value={filtroLoja}
              onChange={(e) => setFiltroLoja(e.target.value as Loja | 'todas')}
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
            >
              <option value="todas">Todas as unidades</option>
              {lojas.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center justify-between text-[11px] text-[var(--c-texto-3)] px-0.5">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {daBusca.length} na sua equipe
            </span>
            {selecionados.size > 0 && (
              <span className="font-bold text-[var(--c-acento)]">
                {selecionados.size} marcados
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1 max-h-[520px] overflow-y-auto">
            {daBusca.map((c) => {
              const folgas = folgasDaPessoa.get(c.id) || [];
              const direito = capacidade(c.id);
              const marcado = selecionados.has(c.id);

              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => aoComecarArrasto(e, c.id)}
                  className={`px-2 py-1.5 rounded-xl border flex items-center gap-2 cursor-grab active:cursor-grabbing transition-colors ${
                    marcado
                      ? 'bg-[var(--c-acento-suave)] border-[var(--c-acento)]/40'
                      : 'bg-[var(--c-canvas)] border-[var(--c-borda)] hover:border-[var(--c-borda-forte)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternarSelecao(c.id)}
                    aria-label={`Selecionar ${c.nome}`}
                    className="w-3.5 h-3.5 accent-[var(--c-acento)] flex-shrink-0"
                  />

                  <FotoPresenca
                    foto={c.foto}
                    nome={c.nome}
                    presenca={c.presenca}
                    tamanho="w-7 h-7"
                  />

                  <div className="flex-1 min-w-0">
                    <span className="block text-[11px] font-bold text-[var(--c-texto)] truncate">
                      {c.nome}
                    </span>
                    <span className="block text-[10px] text-[var(--c-texto-3)] truncate">
                      {folgas.length > 0 ? (
                        <span className="text-[var(--c-ok)] font-semibold">
                          folga {folgas.map((f) => formatarDataBR(f.sabado).slice(0, 5)).join(' e ')}
                          {folgas.some((f) => f.novo) ? ' · a salvar' : ''}
                        </span>
                      ) : (
                        c.setor
                      )}
                    </span>
                  </div>

                  {/*
                    A FOLGA TROCADA À VISTA: quem trabalhou a folga do mês
                    anterior tem direito a mais uma, e o gestor precisa
                    saber disso antes de arrastar — senão parece erro a
                    pessoa aceitar dois sábados.
                  */}
                  {direito > 1 && (
                    <span
                      title={`Direito a ${direito} folgas neste mês: trabalhou a folga do mês anterior`}
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0 ${
                        folgas.length < direito
                          ? 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]'
                          : 'bg-[var(--c-canvas)] text-[var(--c-texto-3)]'
                      }`}
                    >
                      {folgas.length}/{direito}
                    </span>
                  )}

                  <GripVertical className="w-3.5 h-3.5 text-[var(--c-texto-3)] flex-shrink-0" />
                </div>
              );
            })}

            {daBusca.length === 0 && (
              <p className="py-6 text-center text-[11px] text-[var(--c-texto-3)]">
                Ninguém bate com essa busca.
              </p>
            )}
          </div>
        </div>

        {/* ---------- OS SÁBADOS ---------- */}
        <div className="flex-1 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {sabados.map((sabado) => {
            const gente = doSabado(sabado);
            const recebendo = sabadoAlvo === sabado;

            return (
              <div
                key={sabado}
                data-sabado={sabado}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (sabadoAlvo !== sabado) setSabadoAlvo(sabado);
                }}
                onDragLeave={() => setSabadoAlvo((s) => (s === sabado ? null : s))}
                onDrop={(e) => aoSoltar(e, sabado)}
                className={`rounded-2xl border-2 p-2.5 flex flex-col gap-2 min-h-[220px] transition-colors ${
                  recebendo
                    ? 'border-dashed border-[var(--c-acento)] bg-[var(--c-acento-suave)]'
                    : 'border-[var(--c-borda)] bg-[var(--c-superficie)]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-black text-[var(--c-texto)] leading-none">
                    {sabado.slice(8, 10)}
                    <span className="text-[10px] font-bold text-[var(--c-texto-3)] uppercase ml-1">
                      {formatarDataBR(sabado).slice(3, 5) === '01' ? 'jan' : ''}
                      {sabado.slice(5, 7)}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      gente.length === 0
                        ? 'bg-[var(--c-canvas)] text-[var(--c-texto-3)]'
                        : 'bg-[var(--c-ok)]/10 text-[var(--c-ok)]'
                    }`}
                  >
                    {gente.length} {gente.length === 1 ? 'folga' : 'folgas'}
                  </span>
                </div>

                {/*
                  QUANTOS FICAM, e não só quantos saem.

                  "3 de folga" sozinho não decide nada; "3 de folga, 20 na
                  loja" decide — é o número que o gestor precisa para
                  autorizar mais uma no mesmo dia.

                  Quase perdi isto ao trocar a grade antiga pelo quadro: o
                  teste que o protegia é que acusou. O desenho que o Elias
                  mandou dizia "6 de 6 vagas", mas a rede não tem limite de
                  vagas por sábado cadastrado em lugar nenhum — inventar um
                  seria criar regra de negócio por conta própria.
                */}
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 rounded-full bg-[var(--c-canvas)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--c-acento)] rounded-full"
                      style={{ width: `${proporcaoFora(gente.length)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--c-texto-3)] whitespace-nowrap">
                    {Math.max(equipe.length - gente.length, 0)} na loja
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {gente.map(({ colaborador, justificativa, novo }) => (
                    <div
                      key={colaborador.id}
                      className={`px-2 py-1.5 rounded-xl border flex items-center gap-2 ${
                        novo
                          ? 'bg-[var(--c-acento-suave)] border-dashed border-[var(--c-acento)]/50'
                          : justificativa?.estado === 'pendente'
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : 'bg-[var(--c-canvas)] border-[var(--c-borda)]'
                      }`}
                    >
                      <FotoPresenca
                        foto={colaborador.foto}
                        nome={colaborador.nome}
                        presenca={colaborador.presenca}
                        tamanho="w-6 h-6"
                      />

                      <div className="flex-1 min-w-0">
                        <span className="block text-[11px] font-bold text-[var(--c-texto)] truncate">
                          {colaborador.nome}
                        </span>
                        <span className="block text-[10px] text-[var(--c-texto-3)] truncate">
                          {novo ? (
                            <span className="text-[var(--c-acento)] font-semibold">
                              a salvar
                            </span>
                          ) : justificativa?.estado === 'pendente' ? (
                            <span className="text-amber-600 font-semibold">
                              aguarda decisão
                            </span>
                          ) : (
                            colaborador.setor
                          )}
                        </span>
                      </div>

                      {/*
                        PEDIDO PENDENTE GANHA O VISTO, e não só o "x".

                        Quem pediu está esperando resposta: aprovar é a
                        ação principal, e recusar pede motivo — a pessoa
                        precisa saber por quê para escolher outro sábado.

                        No cartão que o próprio gestor montou não há o que
                        aprovar: ele já é a decisão, e ali só cabe tirar.
                      */}
                      {justificativa?.estado === 'pendente' && (
                        <button
                          type="button"
                          onClick={() => aoAprovar(justificativa)}
                          aria-label={`Aprovar a folga de ${colaborador.nome}`}
                          title="Aprovar este pedido"
                          className="p-1 rounded-lg text-[var(--c-ok)] hover:bg-[var(--c-ok)]/10 transition-colors flex-shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          justificativa?.estado === 'pendente'
                            ? aoRecusar(justificativa)
                            : tirar(colaborador.id, sabado)
                        }
                        aria-label={
                          justificativa?.estado === 'pendente'
                            ? `Recusar a folga de ${colaborador.nome}`
                            : `Tirar ${colaborador.nome} do sábado ${formatarDataBR(sabado)}`
                        }
                        title={
                          justificativa?.estado === 'pendente'
                            ? 'Recusar este pedido'
                            : 'Tirar da escala'
                        }
                        className="p-1 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-erro)] hover:bg-[var(--c-erro)]/10 transition-colors flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {gente.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-1 text-[var(--c-texto-3)] border border-dashed border-[var(--c-borda)] rounded-xl py-6">
                    <span className="text-[11px]">Arraste aqui</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
