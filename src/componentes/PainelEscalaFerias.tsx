/**
 * Escala de férias — CONECTA / Malachias Autopeças
 *
 * O ano inteiro numa tela: doze colunas, cada período no mês em que
 * começa, e quem está de férias com quem.
 *
 * ===================================================================
 * POR QUE O ANO, E NÃO O MÊS
 * ===================================================================
 *
 * Férias não se planejam de mês em mês. A pergunta do gestor é "quem já
 * tirou e quando", e ela só tem resposta olhando os doze — senão ele
 * autoriza julho sem lembrar que o mesmo setor esvaziou em janeiro.
 *
 * A escala de SÁBADO é o contrário: mês a mês, porque a folga é direito
 * mensal e o mês seguinte não depende do anterior. Duas telas com dois
 * recortes, de propósito.
 *
 * ===================================================================
 * AS REGRAS NÃO MORAM AQUI
 * ===================================================================
 *
 * Quem pode escalar quem é a ALÇADA, e ela chega pronta na prop
 * `equipe` — é ela que faz a separação por loja. Gravar é
 * `salvarEscalaDeFerias`, que chama `lancarAusenciaPelaLideranca`.
 *
 * O conflito e a contagem de dias do ano são MOSTRADOS, nunca
 * bloqueados: quantos podem sair juntos depende do movimento da loja, e
 * o direito de cada um depende do período aquisitivo dele, que o
 * sistema não acompanha. Recusar com dado incompleto negaria férias
 * legítimas.
 */

import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Eraser,
  Users,
} from 'lucide-react';
import { Colaborador, JustificativaAusencia, Setor } from '../tipos';
import { formatarDataBR } from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  /** Quem este gestor pode escalar. Já vem filtrado pela alçada. */
  equipe: Colaborador[];
  /** As férias da equipe, de qualquer ano. */
  ferias: JustificativaAusencia[];
  /** Conta os dias que a pessoa já tem lançados no ano aberto. */
  diasNoAno: (colaboradorId: string, ano: number) => number;
  /** Quem da equipe já tem férias encostando no período escolhido. */
  conflitos: (
    inicio: string,
    fim: string,
    ignorar: string[]
  ) => Array<{ colaborador: Colaborador; justificativa: JustificativaAusencia }>;
  diasDoPeriodo: (inicio: string, fim: string) => number;
  aoSalvar: (dados: {
    colaboradorIds: string[];
    dataInicio: string;
    dataFim: string;
    observacao?: string;
  }) => Promise<void>;
  /** Tira um período já lançado. Pendente é recusa; lançado é retirada. */
  aoRemover: (j: JustificativaAusencia) => void;
  salvando: boolean;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const PainelEscalaFerias: React.FC<Props> = ({
  equipe,
  ferias,
  diasNoAno,
  conflitos,
  diasDoPeriodo,
  aoSalvar,
  aoRemover,
  salvando,
}) => {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState<Setor | 'todos'>('todos');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [observacao, setObservacao] = useState('');

  const setores = useMemo(
    () => [...new Set(equipe.map((c) => c.setor))].sort(),
    [equipe]
  );

  const daBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return equipe.filter(
      (c) =>
        (filtroSetor === 'todos' || c.setor === filtroSetor) &&
        (!termo ||
          c.nome.toLowerCase().includes(termo) ||
          (c.cargo || '').toLowerCase().includes(termo))
    );
  }, [equipe, busca, filtroSetor]);

  /**
   * Cada período na coluna do mês em que COMEÇA.
   *
   * Um período de 28/12 a 10/01 aparece em dezembro, e não nos dois: a
   * coluna responde "quem saiu neste mês", e mostrar o mesmo período
   * duas vezes faria a contagem do ano parecer o dobro do que é.
   */
  const porMes = useMemo(() => {
    const mapa = new Map<number, JustificativaAusencia[]>();
    for (const j of ferias) {
      if (j.dataInicio.slice(0, 4) !== String(ano)) continue;
      const mes = Number(j.dataInicio.slice(5, 7)) - 1;
      const lista = mapa.get(mes) || [];
      lista.push(j);
      mapa.set(mes, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
    }
    return mapa;
  }, [ferias, ano]);

  const dias = inicio && fim ? diasDoPeriodo(inicio, fim) : 0;

  /**
   * Os conflitos do período em desenho, ignorando quem já está
   * selecionado: se três vão sair juntos de propósito, avisar que eles
   * conflitam entre si é ruído — o gestor acabou de dizer que quer isso.
   */
  const conflitosDoPeriodo = useMemo(
    () => (inicio && fim && dias > 0 ? conflitos(inicio, fim, selecionados) : []),
    [inicio, fim, dias, selecionados, conflitos]
  );

  const alternar = (id: string) =>
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    );

  const limpar = () => {
    setSelecionados([]);
    setInicio('');
    setFim('');
    setObservacao('');
  };

  const salvar = async () => {
    await aoSalvar({
      colaboradorIds: selecionados,
      dataInicio: inicio,
      dataFim: fim,
      observacao: observacao.trim() || undefined,
    });
    limpar();
  };

  const podeSalvar = selecionados.length > 0 && dias > 0 && !salvando;
  const nomeDe = (id: string) => equipe.find((c) => c.id === id)?.nome || id;

  return (
    <div className="flex flex-col gap-3">
      {/* ---------- O ANO ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="w-4 h-4 text-[var(--c-acento)]" />
        <span className="text-sm font-bold text-[var(--c-texto)]">
          Calendário de férias
        </span>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setAno((a) => a - 1)}
            aria-label="Ano anterior"
            className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 text-sm font-bold text-[var(--c-texto)] tabular-nums">
            {ano}
          </span>
          <button
            type="button"
            onClick={() => setAno((a) => a + 1)}
            aria-label="Próximo ano"
            className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/*
        DOZE COLUNAS QUE ROLAM DE LADO.

        Empilhar os meses tiraria justamente o que a tela existe para
        dar: a leitura do ano de uma vez. No celular rola; no monitor da
        loja cabem os doze.
      */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-[1100px]">
          {MESES.map((nome, indice) => {
            const doMes = porMes.get(indice) || [];

            return (
              <div key={nome} className="flex-1 min-w-[88px] flex flex-col gap-1.5">
                <div className="text-center pb-1.5 border-b border-[var(--c-borda)]">
                  <span className="block text-[11px] font-bold text-[var(--c-texto)]">
                    {nome}
                  </span>
                  <span className="block text-[10px] text-[var(--c-texto-3)]">
                    {doMes.length === 0
                      ? '—'
                      : `${doMes.length} ${doMes.length === 1 ? 'período' : 'períodos'}`}
                  </span>
                </div>

                <div className="flex flex-col gap-1 min-h-[60px]">
                  {doMes.map((j) => {
                    const pessoa = equipe.find((c) => c.id === j.colaboradorId);
                    const pendente = j.estado === 'pendente';

                    return (
                      <div
                        key={j.id}
                        className={`px-1.5 py-1 rounded-lg border text-left ${
                          pendente
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : 'bg-[var(--c-ok)]/5 border-[var(--c-ok)]/25'
                        }`}
                      >
                        <div className="flex items-start gap-1">
                          <span className="flex-1 min-w-0 text-[10px] font-bold text-[var(--c-texto)] truncate">
                            {pessoa?.nome || j.colaboradorId}
                          </span>
                          <button
                            type="button"
                            onClick={() => aoRemover(j)}
                            aria-label={`Tirar as férias de ${pessoa?.nome || ''} de ${formatarDataBR(j.dataInicio)}`}
                            className="p-0.5 rounded text-[var(--c-texto-3)] hover:text-[var(--c-erro)] transition-colors flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="block text-[9px] text-[var(--c-texto-3)] tabular-nums">
                          {formatarDataBR(j.dataInicio).slice(0, 5)} –{' '}
                          {formatarDataBR(j.dataFim).slice(0, 5)}
                        </span>
                        <span
                          className={`block text-[9px] font-semibold ${
                            pendente ? 'text-amber-600' : 'text-[var(--c-ok)]'
                          }`}
                        >
                          {diasDoPeriodo(j.dataInicio, j.dataFim)} dias
                          {pendente ? ' · aguarda' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- LANÇAR ---------- */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* A equipe */}
        <div className="lg:w-64 flex-shrink-0 flex flex-col gap-2 p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)]">
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

          {setores.length > 1 && (
            <select
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value as Setor | 'todos')}
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
            >
              <option value="todos">Todos os setores</option>
              {setores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          <span className="text-[11px] text-[var(--c-texto-3)] flex items-center gap-1 px-0.5">
            <Users className="w-3.5 h-3.5" />
            {daBusca.length} na sua equipe
          </span>

          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {daBusca.map((c) => {
              const marcado = selecionados.includes(c.id);
              const jaTem = diasNoAno(c.id, ano);

              return (
                <label
                  key={c.id}
                  className={`px-2 py-1.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors ${
                    marcado
                      ? 'bg-[var(--c-acento-suave)] border-[var(--c-acento)]/40'
                      : 'bg-[var(--c-canvas)] border-[var(--c-borda)] hover:border-[var(--c-borda-forte)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternar(c.id)}
                    className="w-3.5 h-3.5 accent-[var(--c-acento)] flex-shrink-0"
                  />
                  <FotoPresenca
                    foto={c.foto}
                    nome={c.nome}
                    presenca={c.presenca}
                    tamanho="w-7 h-7"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-bold text-[var(--c-texto)] truncate">
                      {c.nome}
                    </span>
                    <span className="block text-[10px] text-[var(--c-texto-3)] truncate">
                      {/*
                        OS DIAS JÁ LANÇADOS NO ANO, à vista na hora de
                        escolher. É o número que evita marcar um terceiro
                        período sem perceber — e ele informa, não impede:
                        o direito de cada um depende do período aquisitivo
                        dele, que o sistema não acompanha.
                      */}
                      {jaTem > 0 ? `${jaTem} dias em ${ano}` : c.setor}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* O período */}
        <div className="flex-1 p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col gap-3">
          <span className="text-sm font-bold text-[var(--c-texto)]">
            Período das férias
          </span>

          {selecionados.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selecionados.map((id) => (
                <span
                  key={id}
                  className="pl-2 pr-1 py-1 rounded-lg bg-[var(--c-acento-suave)] border border-[var(--c-acento)]/30 text-[11px] font-semibold text-[var(--c-texto)] flex items-center gap-1"
                >
                  {nomeDe(id)}
                  <button
                    type="button"
                    onClick={() => alternar(id)}
                    aria-label={`Tirar ${nomeDe(id)} da seleção`}
                    className="p-0.5 rounded text-[var(--c-texto-3)] hover:text-[var(--c-erro)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label
                htmlFor="ferias-inicio"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
              >
                Início
              </label>
              <input
                id="ferias-inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
              />
            </div>
            <div>
              <label
                htmlFor="ferias-fim"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
              >
                Fim
              </label>
              <input
                id="ferias-fim"
                type="date"
                value={fim}
                min={inicio || undefined}
                onChange={(e) => setFim(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
              />
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1">
                Total de dias
              </span>
              <div className="px-3 py-2 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)]">
                {dias > 0 ? `${dias} dias` : '—'}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="ferias-obs"
              className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
            >
              Observação (opcional)
            </label>
            <textarea
              id="ferias-obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] resize-none"
            />
          </div>

          {/*
            O CONFLITO APARECE, E NÃO TRAVA.

            Dois vendedores fora na mesma semana pode ser tranquilo numa
            loja e impossível noutra — quem sabe disso é quem está lá. O
            sistema mostra quem já está fora naquelas datas; a decisão
            continua de quem toca o negócio.
          */}
          {conflitosDoPeriodo.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/25 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[var(--c-texto-2)] leading-relaxed">
                <strong className="text-[var(--c-texto)]">
                  Já estão fora nestas datas:
                </strong>{' '}
                {conflitosDoPeriodo
                  .map(
                    (c) =>
                      `${c.colaborador.nome} (${formatarDataBR(
                        c.justificativa.dataInicio
                      ).slice(0, 5)}–${formatarDataBR(c.justificativa.dataFim).slice(0, 5)})`
                  )
                  .join(' · ')}
                . Confira a cobertura antes de salvar.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={limpar}
              disabled={salvando}
              className="px-3 py-2 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] disabled:opacity-50 flex items-center gap-1.5"
            >
              <Eraser className="w-3.5 h-3.5" />
              Limpar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={!podeSalvar}
              className="px-4 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {salvando
                ? 'Salvando…'
                : `Salvar férias${
                    selecionados.length > 1 ? ` (${selecionados.length})` : ''
                  }`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
