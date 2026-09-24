/**
 * Férias — CONECTA / Malachias Autopeças
 *
 * Tela própria, dentro de Recursos Humanos.
 *
 * ===================================================================
 * POR QUE ELA SAIU DA ESCALA DE FOLGAS
 * ===================================================================
 *
 * Eu havia posto férias como uma aba da escala de sábado, e estava
 * errado: são duas decisões diferentes, com dois donos e dois ritmos.
 *
 * A folga de sábado é direito MENSAL, decidida pelo gestor da loja
 * olhando quem cobre o balcão no dia 19. Férias é período de ANO, com
 * lançamento, recibo e programação — trabalho de RH. Juntá-las obrigava
 * quem ia resolver uma a atravessar a outra.
 *
 * ===================================================================
 * AS REGRAS NÃO MORAM AQUI
 * ===================================================================
 *
 * Quem pode escalar quem é a ALÇADA, e ela chega pronta em `equipe` —
 * é ela que faz a separação por loja. Gravar é `salvarEscalaDeFerias`.
 *
 * Conflito e contagem de dias são MOSTRADOS, nunca bloqueados: quantos
 * podem sair juntos depende do movimento da loja, e o direito de cada um
 * depende do período aquisitivo dele, que o sistema não acompanha.
 */

import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  Palmtree,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eraser,
  Users,
  Printer,
  Download,
} from 'lucide-react';
import { Colaborador, JustificativaAusencia, Setor } from '../tipos';
import { servicoPonto, formatarDataBR } from '../servicos/ponto';
import { lerJustificativas } from '../servicos/justificativasCache';
import {
  decidirAusencia,
  salvarEscalaDeFerias,
  conflitosDeFerias,
  diasDeFeriasNoAno,
  diasCorridos,
} from '../servicos/justificativas';
import { FotoPresenca } from './FotoPresenca';
import {
  montarDocumento,
  cabecalho,
  rodape,
  assinaturas,
  imprimirDocumento,
  emitidoHoje,
} from '../servicos/documento';

interface Props {
  colaboradorAtual: Colaborador;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const AbaFerias: React.FC<Props> = ({ colaboradorAtual }) => {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState<Setor | 'todos'>('todos');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  /**
   * O CALENDÁRIO NASCE RECOLHIDO.
   *
   * Com os doze meses cheios ele ocupa a tela inteira e empurra para
   * baixo o formulário, que é onde o trabalho acontece. Recolhido, o
   * cabeçalho ainda diz quantos períodos há no ano — quem precisa
   * conferir abre; quem veio lançar, lança.
   */
  const [calendarioAberto, setCalendarioAberto] = useState(false);

  const mostrar = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 6000);
  };

  /**
   * A equipe é a da ALÇADA — a mesma da escala de sábado e da fila de
   * aprovação. É ela que separa as lojas; um critério próprio aqui
   * divergiria dela no primeiro ajuste.
   */
  const equipe = useMemo(
    () =>
      servicoPonto
        .obterColaboradoresVisiveis()
        .filter((c) => servicoPonto.podeDecidirSobre(c))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradorAtual.id]
  );

  const ferias = useMemo(() => {
    void versao;
    const ids = new Set(equipe.map((c) => c.id));
    return lerJustificativas().filter(
      (j) => j.tipo === 'ferias' && j.estado !== 'recusada' && ids.has(j.colaboradorId)
    );
  }, [equipe, versao]);

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

  const totalDoAno = useMemo(
    () => [...porMes.values()].reduce((t, l) => t + l.length, 0),
    [porMes]
  );

  const dias = inicio && fim ? diasCorridos(inicio, fim) : 0;

  const conflitos = useMemo(
    () =>
      inicio && fim && dias > 0 ? conflitosDeFerias(inicio, fim, selecionados) : [],
    [inicio, fim, dias, selecionados, versao]
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
    setSalvando(true);
    const res = await salvarEscalaDeFerias({
      colaboradorIds: selecionados,
      dataInicio: inicio,
      dataFim: fim,
      observacao: observacao.trim() || undefined,
    });
    setSalvando(false);
    setVersao((v) => v + 1);

    if (res.falhas.length === 0) {
      mostrar(
        `Férias lançadas para ${res.aplicadas} pessoa(s): ${formatarDataBR(
          inicio
        )} a ${formatarDataBR(fim)}.`
      );
      limpar();
      return;
    }

    // Quem ficou de fora, e por quê: o lote não é tudo-ou-nada
    mostrar(
      `${res.aplicadas} lançada(s). Ficaram de fora: ${res.falhas
        .map((f) => `${f.nome} (${f.erro})`)
        .join(' · ')}`,
      true
    );
  };

  /**
   * Tira um período da escala.
   *
   * Vira recusado, e não apagado — férias é documento, e o que sai da
   * escala precisa continuar auditável.
   */
  const tirar = async (j: JustificativaAusencia) => {
    const res = await decidirAusencia(
      j.id,
      false,
      'Período retirado da escala pelo RH.'
    );
    setVersao((v) => v + 1);
    mostrar(
      res.sucesso ? 'Período retirado da escala.' : res.erro || 'Não foi possível retirar.',
      !res.sucesso
    );
  };

  const nomeDe = (id: string) => equipe.find((c) => c.id === id)?.nome || id;

  // ---------- DOCUMENTO ----------

  /**
   * A escala em papel, do ANO ou de UM MÊS.
   *
   * O ano é a programação que se arquiva; o mês é o que se prega no
   * quadro quando a equipe pergunta quem sai em julho. Os dois saem do
   * mesmo módulo de documento que o espelho de ponto e a escala de
   * sábado usam — é isso que faz os papéis da rede se parecerem.
   */
  const montarDocumentoDeFerias = (mesEscolhido: number | null): string => {
    const linhasDe = (lista: JustificativaAusencia[]) =>
      lista
        .map((j) => {
          const pessoa = equipe.find((c) => c.id === j.colaboradorId);
          return `<tr>
            <td>${pessoa?.nome || j.colaboradorId}</td>
            <td>${pessoa?.setor || ''}</td>
            <td>${pessoa?.loja || ''}</td>
            <td class="num">${formatarDataBR(j.dataInicio)}</td>
            <td class="num">${formatarDataBR(j.dataFim)}</td>
            <td class="num">${diasCorridos(j.dataInicio, j.dataFim)}</td>
            <td>${j.estado === 'pendente' ? 'Aguardando' : 'Programada'}</td>
          </tr>`;
        })
        .join('');

    const meses =
      mesEscolhido === null
        ? MESES.map((_, i) => i)
        : [mesEscolhido];

    const corpo = meses
      .map((i) => {
        const lista = porMes.get(i) || [];
        if (lista.length === 0) return '';
        return `<h2 class="mes">${MESES[i]} de ${ano}</h2>
          <table class="grade">
            <thead>
              <tr>
                <th>Colaborador</th><th>Setor</th><th>Unidade</th>
                <th>Início</th><th>Fim</th><th>Dias</th><th>Situação</th>
              </tr>
            </thead>
            <tbody>${linhasDe(lista)}</tbody>
          </table>`;
      })
      .join('');

    const titulo =
      mesEscolhido === null
        ? `Escala de Férias — ${ano}`
        : `Escala de Férias — ${MESES[mesEscolhido]} de ${ano}`;

    return montarDocumento({
      titulo,
      orientacao: 'retrato',
      estiloExtra: `
  .mes { font-size: 13px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .grade { width: 100%; font-size: 11px; border-collapse: collapse; }
  .grade th { background: #eee; border: 1px solid #999; padding: 5px 4px; font-size: 10px; text-transform: uppercase; text-align: left; }
  .grade td { border: 1px solid #bbb; padding: 4px; }
  .grade .num { text-align: center; white-space: nowrap; }
  .vazio { font-size: 11px; color: #666; }
      `,
      corpo: `
        ${cabecalho({ titulo, subtitulo: `${colaboradorAtual.loja} · emitido ${emitidoHoje()}` })}
        ${corpo || '<p class="vazio">Nenhuma férias programada neste período.</p>'}
        ${assinaturas(['Responsável', 'RH'])}
        ${rodape(`Escala de férias · ${colaboradorAtual.nome}`)}
      `,
    });
  };

  const imprimir = (mesEscolhido: number | null) => {
    if (!imprimirDocumento(montarDocumentoDeFerias(mesEscolhido))) {
      mostrar('O navegador bloqueou a janela de impressão. Libere o pop-up.', true);
    }
  };

  const exportarCsv = () => {
    // Ponto e vírgula: é o que o Excel em português abre sem perguntar
    const linhas = ['Mes;Colaborador;Setor;Unidade;Inicio;Fim;Dias;Situacao'];

    for (let i = 0; i < 12; i += 1) {
      for (const j of porMes.get(i) || []) {
        const pessoa = equipe.find((c) => c.id === j.colaboradorId);
        linhas.push(
          [
            MESES[i],
            pessoa?.nome || j.colaboradorId,
            pessoa?.setor || '',
            pessoa?.loja || '',
            formatarDataBR(j.dataInicio),
            formatarDataBR(j.dataFim),
            String(diasCorridos(j.dataInicio, j.dataFim)),
            j.estado === 'pendente' ? 'Aguardando' : 'Programada',
          ].join(';')
        );
      }
    }

    const url = URL.createObjectURL(
      new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ferias-${ano}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const podeSalvar = selecionados.length > 0 && dias > 0 && !salvando;

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-1.5">
            <Palmtree className="w-4 h-4 text-emerald-600" />
            Férias
          </h2>
          <p className="text-xs text-[var(--c-texto-3)]">
            Programe o ano da equipe. Selecione um ou mais colaboradores para o
            mesmo período.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={exportarCsv}
            className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar {ano}
          </button>
          <button
            type="button"
            onClick={() => imprimir(null)}
            className="px-3 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir ano
          </button>
        </div>
      </div>

      {aviso && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            aviso.erro
              ? 'bg-red-500/10 border border-red-500/20 text-red-600'
              : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/* ---------- CALENDÁRIO ---------- */}
      <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-hidden">
        <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 border-b border-[var(--c-borda)]">
          <button
            type="button"
            onClick={() => setCalendarioAberto((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--c-texto)]"
          >
            {calendarioAberto ? (
              <ChevronUp className="w-4 h-4 text-[var(--c-texto-3)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)]" />
            )}
            Calendário de {ano}
            <span className="font-normal text-[var(--c-texto-3)]">
              · {totalDoAno} {totalDoAno === 1 ? 'período' : 'períodos'}
            </span>
          </button>

          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setAno((a) => a - 1)}
              aria-label="Ano anterior"
              className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm font-bold text-[var(--c-texto)] tabular-nums">
              {ano}
            </span>
            <button
              type="button"
              onClick={() => setAno((a) => a + 1)}
              aria-label="Próximo ano"
              className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {calendarioAberto && (
          <div className="overflow-x-auto">
            <div className="flex min-w-[1140px]">
              {MESES.map((nome, indice) => {
                const doMes = porMes.get(indice) || [];

                return (
                  <div
                    key={nome}
                    /*
                      MESES PARES E ÍMPARES EM FUNDOS DIFERENTES.

                      Doze colunas de mesma cor viram uma mancha: o olho
                      não acha a divisa e o período de julho parece ser de
                      junho. A alternância é sutil de propósito — ela
                      separa sem competir com o conteúdo, que é o que
                      importa ler.
                    */
                    className={`flex-1 min-w-[95px] p-1.5 flex flex-col gap-1.5 ${
                      indice % 2 === 0
                        ? 'bg-[var(--c-superficie)]'
                        : 'bg-[var(--c-canvas)]'
                    }`}
                  >
                    <div className="text-center pb-1 border-b border-[var(--c-borda)]">
                      <span className="block text-[11px] font-bold text-[var(--c-texto)]">
                        {nome}
                      </span>
                      <button
                        type="button"
                        onClick={() => imprimir(indice)}
                        disabled={doMes.length === 0}
                        title={`Imprimir ${nome} de ${ano}`}
                        className="text-[10px] text-[var(--c-texto-3)] hover:text-[var(--c-acento)] disabled:hover:text-[var(--c-texto-3)] disabled:cursor-default"
                      >
                        {doMes.length === 0 ? '—' : `${doMes.length} · imprimir`}
                      </button>
                    </div>

                    <div className="flex flex-col gap-1 min-h-[52px]">
                      {doMes.map((j) => {
                        const pessoa = equipe.find((c) => c.id === j.colaboradorId);
                        const pendente = j.estado === 'pendente';
                        const nomeCompleto = pessoa?.nome || j.colaboradorId;

                        return (
                          <div
                            key={j.id}
                            /*
                              O NOME COMPLETO AO PASSAR O MOUSE.

                              Na coluna estreita só cabe o primeiro nome, e
                              numa rede com duas Marianas isso não
                              identifica ninguém. O `title` é a saída que
                              funciona em qualquer navegador, sem biblioteca
                              e sem quebrar o teclado — e o `group` deixa o
                              cartão inteiro reagir, não só o texto.
                            */
                            title={`${nomeCompleto}${
                              pessoa?.setor ? ` · ${pessoa.setor}` : ''
                            }\n${formatarDataBR(j.dataInicio)} a ${formatarDataBR(
                              j.dataFim
                            )} · ${diasCorridos(j.dataInicio, j.dataFim)} dias${
                              pendente ? '\nAguardando decisão' : ''
                            }`}
                            className={`group relative px-1.5 py-1 rounded-lg border cursor-default transition-shadow hover:shadow-md ${
                              pendente
                                ? 'bg-amber-500/10 border-amber-500/30'
                                : 'bg-emerald-500/10 border-emerald-500/25'
                            }`}
                          >
                            <div className="flex items-start gap-1">
                              <span className="flex-1 min-w-0 text-[10px] font-bold text-[var(--c-texto)] truncate">
                                {nomeCompleto}
                              </span>
                              <button
                                type="button"
                                onClick={() => tirar(j)}
                                aria-label={`Tirar as férias de ${nomeCompleto}`}
                                className="p-0.5 rounded text-[var(--c-texto-3)] hover:text-[var(--c-erro)] flex-shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="block text-[9px] text-[var(--c-texto-3)] tabular-nums">
                              {formatarDataBR(j.dataInicio).slice(0, 5)} –{' '}
                              {formatarDataBR(j.dataFim).slice(0, 5)}
                            </span>

                            {/*
                              A ETIQUETA QUE SOBE.

                              O `title` do navegador demora quase um segundo
                              para aparecer. Esta sobe na hora, com o nome
                              inteiro e o período — é o que resolve a coluna
                              estreita de verdade. O `title` fica como rede
                              de segurança para quem navega por teclado.
                            */}
                            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block z-20 px-2 py-1 rounded-lg bg-[var(--c-texto)] text-[var(--c-superficie)] text-[10px] font-semibold whitespace-nowrap shadow-lg">
                              {nomeCompleto}
                              <span className="block font-normal opacity-80">
                                {formatarDataBR(j.dataInicio)} a{' '}
                                {formatarDataBR(j.dataFim)} ·{' '}
                                {diasCorridos(j.dataInicio, j.dataFim)} dias
                              </span>
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
        )}
      </div>

      {/* ---------- LANÇAR ---------- */}
      <div className="flex flex-col lg:flex-row gap-3">
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
              const jaTem = diasDeFeriasNoAno(c.id, ano);

              return (
                <label
                  key={c.id}
                  title={`${c.nome} · ${c.cargo || c.setor}`}
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
                      {jaTem > 0 ? `${jaTem} dias em ${ano}` : c.setor}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex-1 p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col gap-3">
          <span className="text-sm font-bold text-[var(--c-texto)]">
            Período das férias
          </span>

          {selecionados.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selecionados.map((id) => (
                <span
                  key={id}
                  title={nomeDe(id)}
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
                htmlFor="fer-inicio"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
              >
                Início
              </label>
              <input
                id="fer-inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
              />
            </div>
            <div>
              <label
                htmlFor="fer-fim"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
              >
                Fim
              </label>
              <input
                id="fer-fim"
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
              htmlFor="fer-obs"
              className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
            >
              Observação (opcional)
            </label>
            <textarea
              id="fer-obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)] resize-none"
            />
          </div>

          {conflitos.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/25 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[var(--c-texto-2)] leading-relaxed">
                <strong className="text-[var(--c-texto)]">
                  Já estão fora nestas datas:
                </strong>{' '}
                {conflitos
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
              <Palmtree className="w-3.5 h-3.5" />
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
