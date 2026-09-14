/**
 * Painel de Recursos Humanos — CONECTA / Malachias Autopeças
 *
 * Reúne o banco de horas de toda a rede: espelho de ponto por colaborador,
 * saldo do período e acumulado, correção de marcações com justificativa e os
 * QRs de ponto de cada loja, prontos para imprimir e afixar.
 *
 * Acesso: setor RH e Administrador (nível 4).
 */

import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Users,
  CalendarRange,
  QrCode,
  Download,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Pencil,
  Trash2,
  Printer,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';
import {
  Colaborador,
  JornadaDia,
  Loja,
  ResumoPontoColaborador,
  TipoMarcacao,
  ORDEM_MARCACOES,
  ROTULO_MARCACAO,
  CARGA_HORARIA_PADRAO_MINUTOS,
} from '../tipos';
import { obterFotoColaborador } from '../servicos/bancoDados';
import {
  servicoPonto,
  LOJAS_COM_PONTO,
  dataDeHoje,
  formatarDataBR,
  formatarDiaCurto,
  formatarMinutos,
  formatarSaldo,
  primeiroDiaDoMes,
} from '../servicos/ponto';

interface PropsPainelRecursosHumanos {
  colaboradorAtual: Colaborador;
  aoFechar: () => void;
}

type AbaRH = 'banco_horas' | 'qrcodes';

export const PainelRecursosHumanos: React.FC<PropsPainelRecursosHumanos> = ({
  colaboradorAtual,
  aoFechar,
}) => {
  const [abaAtiva, setAbaAtiva] = useState<AbaRH>('banco_horas');
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(dataDeHoje());
  const [busca, setBusca] = useState('');
  const [filtroLoja, setFiltroLoja] = useState<Loja | 'Todas'>('Todas');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [versaoDados, setVersaoDados] = useState(0);
  const [toast, setToast] = useState<{ texto: string; erro: boolean } | null>(null);

  // Ajuste de marcação
  const [ajuste, setAjuste] = useState<{
    colaboradorId: string;
    data: string;
    tipo: TipoMarcacao;
    hora: string;
    justificativa: string;
  } | null>(null);

  const [qrcodes, setQrcodes] = useState<Array<{ loja: Loja; codigo: string; imagem: string }>>([]);

  useEffect(() => {
    const cancelar = servicoPonto.assinarAlteracoes(() => setVersaoDados((v) => v + 1));
    return () => cancelar();
  }, []);

  const exibirToast = (texto: string, erro = false) => {
    setToast({ texto, erro });
    setTimeout(() => setToast(null), 3500);
  };

  const temAcesso = servicoPonto.podeAcessarPainelRH(colaboradorAtual);

  // Gera as imagens dos QRs sempre que a aba é aberta ou um código muda
  useEffect(() => {
    if (!temAcesso || abaAtiva !== 'qrcodes') return;

    let cancelado = false;
    const gerar = async () => {
      const gerados = await Promise.all(
        LOJAS_COM_PONTO.map(async (loja) => {
          const conteudo = servicoPonto.montarConteudoQr(loja);
          const codigo = servicoPonto.obterCodigoDaLoja(loja).codigo;
          const imagem = await QRCode.toDataURL(conteudo, {
            width: 420,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0E1216', light: '#FFFFFF' },
          });
          return { loja, codigo, imagem };
        })
      );
      if (!cancelado) setQrcodes(gerados);
    };

    gerar().catch(() => exibirToast('Falha ao gerar os QR Codes.', true));
    return () => {
      cancelado = true;
    };
  }, [abaAtiva, versaoDados, temAcesso]);

  const resumos: ResumoPontoColaborador[] = useMemo(() => {
    if (!temAcesso) return [];
    return servicoPonto.obterResumoDoPeriodo(dataInicio, dataFim);
  }, [dataInicio, dataFim, versaoDados, temAcesso]);

  const resumosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return resumos.filter((r) => {
      if (filtroLoja !== 'Todas' && r.colaborador.loja !== filtroLoja) return false;
      if (!termo) return true;
      return (
        r.colaborador.nome.toLowerCase().includes(termo) ||
        r.colaborador.cargo.toLowerCase().includes(termo) ||
        r.colaborador.setor.toLowerCase().includes(termo)
      );
    });
  }, [resumos, busca, filtroLoja]);

  const totais = useMemo(() => {
    return resumosFiltrados.reduce(
      (acc, r) => ({
        pessoas: acc.pessoas + 1,
        presentesHoje: acc.presentesHoje + (r.registrouHoje ? 1 : 0),
        pendencias: acc.pendencias + r.diasComPendencia,
        saldo: acc.saldo + r.saldoPeriodoMinutos,
      }),
      { pessoas: 0, presentesHoje: 0, pendencias: 0, saldo: 0 }
    );
  }, [resumosFiltrados]);

  const detalhe = useMemo(
    () => resumosFiltrados.find((r) => r.colaborador.id === detalheId) || null,
    [resumosFiltrados, detalheId]
  );

  // Barreira de acesso
  if (!temAcesso) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--c-canvas)] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center mb-4 border border-red-500/20">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[var(--c-texto)] mb-2">Acesso Restrito</h2>
        <p className="text-sm text-[var(--c-texto-3)] max-w-md mb-6 leading-relaxed">
          O banco de horas da rede é acessível apenas ao setor de RH e ao Administrador de TI.
        </p>
        <button
          type="button"
          onClick={aoFechar}
          className="px-6 py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-semibold hover:brightness-110 active:scale-95 transition-all"
        >
          Retornar ao Comunicador
        </button>
      </div>
    );
  }

  const baixarCsv = () => {
    const csv = servicoPonto.gerarCsvDoPeriodo(dataInicio, dataFim);
    // BOM para o Excel abrir os acentos corretamente
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ponto-${dataInicio}-a-${dataFim}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    exibirToast('Espelho de ponto exportado.');
  };

  const regenerarCodigo = (loja: Loja) => {
    const res = servicoPonto.regenerarCodigoDaLoja(loja);
    if (res.sucesso) {
      exibirToast(`Novo código gerado para ${loja}. Reimprima o cartaz.`);
    } else {
      exibirToast(res.erro || 'Falha ao gerar novo código.', true);
    }
  };

  const salvarAjuste = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ajuste) return;

    const res = servicoPonto.ajustarMarcacao({
      colaboradorId: ajuste.colaboradorId,
      data: ajuste.data,
      tipo: ajuste.tipo,
      hora: ajuste.hora,
      justificativa: ajuste.justificativa,
    });

    if (res.sucesso) {
      exibirToast('Marcação ajustada e registrada na auditoria.');
      setAjuste(null);
    } else {
      exibirToast(res.erro || 'Falha ao ajustar marcação.', true);
    }
  };

  const removerMarcacao = (registroId: string) => {
    const motivo = window.prompt('Justifique a remoção desta marcação:');
    if (motivo === null) return;
    const res = servicoPonto.removerMarcacao(registroId, motivo);
    if (res.sucesso) {
      exibirToast('Marcação removida.');
    } else {
      exibirToast(res.erro || 'Falha ao remover.', true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--c-canvas)] flex flex-col text-[var(--c-texto)]">
      {/* Cabeçalho */}
      <header className="px-4 py-3 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white shadow-xs flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-sm tracking-tight truncate">
              Recursos Humanos · Banco de Horas
            </h1>
            <span className="text-[11px] text-[var(--c-texto-3)] font-medium block -mt-0.5 truncate">
              {colaboradorAtual.nome} · {colaboradorAtual.setor}
            </span>
          </div>
        </div>
        <button
          type="button"
          id="botao-fechar-painel-rh"
          onClick={aoFechar}
          className="p-2 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors flex-shrink-0"
          aria-label="Fechar painel"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Abas */}
      <nav className="px-3 pt-2 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex gap-1.5 flex-shrink-0 overflow-x-auto">
        {([
          { id: 'banco_horas' as const, rotulo: 'Banco de Horas', icone: Users },
          { id: 'qrcodes' as const, rotulo: 'QR das Lojas', icone: QrCode },
        ]).map((aba) => (
          <button
            key={aba.id}
            type="button"
            id={`aba-rh-${aba.id}`}
            onClick={() => {
              setAbaAtiva(aba.id);
              setDetalheId(null);
            }}
            className={`px-3.5 py-2 rounded-t-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border-b-2 ${
              abaAtiva === aba.id
                ? 'border-[var(--c-acento)] text-[var(--c-acento)]'
                : 'border-transparent text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
            }`}
          >
            <aba.icone className="w-3.5 h-3.5" />
            {aba.rotulo}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto">
        {/* ---------- BANCO DE HORAS ---------- */}
        {abaAtiva === 'banco_horas' && !detalhe && (
          <div className="p-4 flex flex-col gap-4">
            {/* Período e filtros */}
            <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--c-texto-3)] uppercase tracking-wider">
                <CalendarRange className="w-3.5 h-3.5" />
                Período apurado
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="rh-data-inicio" className="text-[11px] font-semibold text-[var(--c-texto-3)] block mb-1">
                    De
                  </label>
                  <input
                    id="rh-data-inicio"
                    type="date"
                    value={dataInicio}
                    max={dataFim}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  />
                </div>
                <div>
                  <label htmlFor="rh-data-fim" className="text-[11px] font-semibold text-[var(--c-texto-3)] block mb-1">
                    Até
                  </label>
                  <input
                    id="rh-data-fim"
                    type="date"
                    value={dataFim}
                    min={dataInicio}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)] pointer-events-none" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar pessoa"
                    className="w-full pl-8 pr-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  />
                </div>
                <select
                  value={filtroLoja}
                  onChange={(e) => setFiltroLoja(e.target.value as Loja | 'Todas')}
                  className="w-full px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                >
                  <option value="Todas">Todas as lojas</option>
                  {LOJAS_COM_PONTO.map((loja) => (
                    <option key={loja} value={loja}>
                      {loja}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                id="botao-exportar-ponto"
                onClick={baixarCsv}
                className="w-full py-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-acento)] flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar espelho em CSV
              </button>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { rotulo: 'Colaboradores', valor: String(totais.pessoas), cor: 'text-[var(--c-texto)]' },
                { rotulo: 'Bateram hoje', valor: String(totais.presentesHoje), cor: 'text-emerald-600' },
                { rotulo: 'Pendências', valor: String(totais.pendencias), cor: totais.pendencias > 0 ? 'text-amber-600' : 'text-[var(--c-texto)]' },
                { rotulo: 'Saldo do período', valor: formatarSaldo(totais.saldo), cor: totais.saldo >= 0 ? 'text-emerald-600' : 'text-red-600' },
              ].map((ind) => (
                <div
                  key={ind.rotulo}
                  className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3"
                >
                  <span className="text-[10px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider block">
                    {ind.rotulo}
                  </span>
                  <span className={`text-lg font-black tabular-nums ${ind.cor}`}>{ind.valor}</span>
                </div>
              ))}
            </div>

            {/* Lista de colaboradores */}
            {resumosFiltrados.length === 0 ? (
              <p className="py-10 text-center text-xs text-[var(--c-texto-3)]">
                Nenhum colaborador encontrado para este filtro.
              </p>
            ) : (
              <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] divide-y divide-[var(--c-borda)] overflow-hidden">
                {resumosFiltrados.map((resumo) => (
                  <button
                    key={resumo.colaborador.id}
                    type="button"
                    id={`linha-rh-${resumo.colaborador.id}`}
                    onClick={() => setDetalheId(resumo.colaborador.id)}
                    className="w-full px-3.5 py-3 flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)] transition-colors"
                  >
                    <img
                      src={obterFotoColaborador(resumo.colaborador)}
                      alt={resumo.colaborador.nome}
                      className="w-10 h-10 rounded-full object-cover border border-[var(--c-borda)] bg-[var(--c-canvas)] flex-shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-[var(--c-texto)] truncate">
                          {resumo.colaborador.nome}
                        </span>
                        {resumo.registrouHoje && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"
                            title="Registrou ponto hoje"
                          />
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
                        {resumo.colaborador.cargo} · {resumo.colaborador.loja}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[var(--c-texto-3)] font-medium">
                          {resumo.diasCompletos} dias completos
                        </span>
                        {resumo.diasComPendencia > 0 && (
                          <span className="text-[10px] font-bold text-amber-600">
                            {resumo.diasComPendencia} pendente
                            {resumo.diasComPendencia > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xs text-[var(--c-texto-3)] block">Período</span>
                      <span
                        className={`text-sm font-black tabular-nums block ${
                          resumo.saldoPeriodoMinutos >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatarSaldo(resumo.saldoPeriodoMinutos)}
                      </span>
                      <span className="text-[10px] text-[var(--c-texto-3)] block">
                        Acum. {formatarSaldo(resumo.saldoAcumuladoMinutos)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------- ESPELHO INDIVIDUAL ---------- */}
        {abaAtiva === 'banco_horas' && detalhe && (
          <div className="p-4 flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setDetalheId(null)}
              className="self-start text-xs font-bold text-[var(--c-acento)] flex items-center gap-1 hover:underline"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Voltar para a lista
            </button>

            {/* Identificação */}
            <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 flex items-center gap-3">
              <img
                src={obterFotoColaborador(detalhe.colaborador)}
                alt={detalhe.colaborador.nome}
                className="w-14 h-14 rounded-full object-cover border border-[var(--c-borda)] bg-[var(--c-canvas)] flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-[var(--c-texto)] truncate">
                  {detalhe.colaborador.nome}
                </h2>
                <p className="text-xs text-[var(--c-texto-3)] truncate">
                  {detalhe.colaborador.cargo} · {detalhe.colaborador.setor} ·{' '}
                  {detalhe.colaborador.loja}
                </p>
                <p className="text-[11px] text-[var(--c-texto-3)] mt-0.5">
                  Jornada diária:{' '}
                  {formatarMinutos(
                    detalhe.colaborador.cargaHorariaDiariaMinutos ?? CARGA_HORARIA_PADRAO_MINUTOS
                  )}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {detalhe.saldoAcumuladoMinutos >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600 inline" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 inline" />
                )}
                <span
                  className={`block text-lg font-black tabular-nums ${
                    detalhe.saldoAcumuladoMinutos >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {formatarSaldo(detalhe.saldoAcumuladoMinutos)}
                </span>
                <span className="text-[10px] text-[var(--c-texto-3)]">acumulado</span>
              </div>
            </div>

            {/* Espelho do período */}
            <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-[var(--c-borda)] flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--c-texto)] uppercase tracking-wider">
                  Espelho de {formatarDataBR(dataInicio)} a {formatarDataBR(dataFim)}
                </span>
                <span
                  className={`text-xs font-black tabular-nums ${
                    detalhe.saldoPeriodoMinutos >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {formatarSaldo(detalhe.saldoPeriodoMinutos)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="bg-[var(--c-superficie-2)] text-[var(--c-texto-3)]">
                      <th className="text-left font-bold px-3 py-2">Dia</th>
                      {ORDEM_MARCACOES.map((tipo) => (
                        <th key={tipo} className="text-center font-bold px-2 py-2 whitespace-nowrap">
                          {ROTULO_MARCACAO[tipo].replace(' para almoço', ' alm.').replace(' do almoço', ' alm.')}
                        </th>
                      ))}
                      <th className="text-right font-bold px-3 py-2">Total</th>
                      <th className="text-right font-bold px-3 py-2">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--c-borda)]">
                    {detalhe.jornadas
                      .filter(
                        (j: JornadaDia) =>
                          Object.keys(j.marcacoes).length > 0 || j.minutosPrevistos > 0
                      )
                      .map((jornada: JornadaDia) => {
                        const vazio = Object.keys(jornada.marcacoes).length === 0;
                        return (
                          <tr
                            key={jornada.data}
                            className={vazio ? 'opacity-50' : 'hover:bg-[var(--c-superficie-2)]'}
                          >
                            <td className="px-3 py-2 font-semibold text-[var(--c-texto)] whitespace-nowrap capitalize">
                              {formatarDiaCurto(jornada.data)}
                            </td>

                            {ORDEM_MARCACOES.map((tipo) => {
                              const reg = jornada.marcacoes[tipo];
                              return (
                                <td key={tipo} className="px-2 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAjuste({
                                        colaboradorId: detalhe.colaborador.id,
                                        data: jornada.data,
                                        tipo,
                                        hora: reg?.horaFormatada || '',
                                        justificativa: '',
                                      })
                                    }
                                    title={
                                      reg?.metodo === 'ajuste_rh'
                                        ? `Ajustado por ${reg.ajustadoPorNome}: ${reg.justificativa}`
                                        : 'Clique para lançar ou corrigir'
                                    }
                                    className={`font-mono tabular-nums px-1.5 py-0.5 rounded hover:bg-[var(--c-acento-suave)] transition-colors ${
                                      reg
                                        ? reg.metodo === 'ajuste_rh'
                                          ? 'text-amber-600 font-bold'
                                          : 'text-[var(--c-texto)]'
                                        : 'text-[var(--c-texto-3)]'
                                    }`}
                                  >
                                    {reg?.horaFormatada || '--:--'}
                                  </button>
                                  {reg && (
                                    <button
                                      type="button"
                                      onClick={() => removerMarcacao(reg.id)}
                                      title="Remover marcação"
                                      className="ml-0.5 text-[var(--c-texto-3)] hover:text-red-600 transition-colors align-middle"
                                    >
                                      <Trash2 className="w-3 h-3 inline" />
                                    </button>
                                  )}
                                </td>
                              );
                            })}

                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--c-texto)]">
                              {formatarMinutos(jornada.minutosTrabalhados)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-bold tabular-nums ${
                                jornada.minutosTrabalhados === 0
                                  ? 'text-[var(--c-texto-3)]'
                                  : jornada.saldoMinutos >= 0
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {jornada.minutosTrabalhados === 0
                                ? '—'
                                : formatarSaldo(jornada.saldoMinutos)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <p className="px-3.5 py-2.5 text-[11px] text-[var(--c-texto-3)] border-t border-[var(--c-borda)] leading-relaxed">
                Clique em qualquer horário para lançar ou corrigir. Correções ficam em
                <span className="text-amber-600 font-semibold"> âmbar</span>, exigem justificativa e
                são gravadas na auditoria.
              </p>
            </div>
          </div>
        )}

        {/* ---------- QR CODES ---------- */}
        {abaAtiva === 'qrcodes' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3.5">
              <h2 className="text-sm font-bold text-[var(--c-texto)] mb-1">
                Cartazes de ponto das lojas
              </h2>
              <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
                Imprima o QR da loja e afixe no ponto de entrada. O funcionário aponta a câmera e a
                marcação é registrada. O código de 6 caracteres serve quando a câmera falha — deixe
                ele visível no cartaz. Se o cartaz for fotografado ou copiado, gere um código novo:
                o anterior deixa de funcionar na hora.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {qrcodes.map((item) => (
                <div
                  key={item.loja}
                  className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 flex flex-col items-center gap-2.5"
                >
                  <span className="text-sm font-black text-[var(--c-texto)]">{item.loja}</span>
                  <img
                    src={item.imagem}
                    alt={`QR de ponto da loja ${item.loja}`}
                    className="w-40 h-40 rounded-xl border border-[var(--c-borda)] bg-white"
                  />
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider block">
                      Código manual
                    </span>
                    <span className="text-xl font-mono font-black tracking-[0.2em] text-[var(--c-texto)]">
                      {item.codigo}
                    </span>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const janela = window.open('', '_blank');
                        if (!janela) {
                          exibirToast('Permita as janelas pop-up para imprimir.', true);
                          return;
                        }
                        janela.document.write(
                          `<title>Ponto ${item.loja}</title>` +
                            `<div style="font-family:system-ui,sans-serif;text-align:center;padding:40px">` +
                            `<h1 style="margin:0 0 4px">CONECTA · Registro de Ponto</h1>` +
                            `<h2 style="margin:0 0 24px;font-weight:500">Loja ${item.loja}</h2>` +
                            `<img src="${item.imagem}" style="width:340px;height:340px" />` +
                            `<p style="margin:24px 0 4px;font-size:14px">Sem câmera? Digite o código:</p>` +
                            `<p style="font-family:monospace;font-size:44px;letter-spacing:10px;margin:0;font-weight:700">${item.codigo}</p>` +
                            `</div>`
                        );
                        janela.document.close();
                        janela.focus();
                        janela.print();
                      }}
                      className="py-2 rounded-lg bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[11px] font-bold text-[var(--c-texto)] hover:border-[var(--c-acento)] flex items-center justify-center gap-1 transition-all"
                    >
                      <Printer className="w-3 h-3" />
                      Imprimir
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerarCodigo(item.loja)}
                      className="py-2 rounded-lg bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[11px] font-bold text-amber-600 hover:border-amber-500 flex items-center justify-center gap-1 transition-all"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Novo código
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de ajuste de marcação */}
      {ajuste && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={salvarAjuste}
            className="bg-[var(--c-superficie)] w-full max-w-sm rounded-2xl border border-[var(--c-borda)] shadow-[var(--s-3)] overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--c-borda)] flex items-center gap-2">
              <Pencil className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-[var(--c-texto)]">
                {ROTULO_MARCACAO[ajuste.tipo]} · {formatarDataBR(ajuste.data)}
              </h3>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <div>
                <label
                  htmlFor="ajuste-hora"
                  className="text-[11px] font-bold text-[var(--c-texto-2)] uppercase tracking-wider block mb-1"
                >
                  Horário
                </label>
                <input
                  id="ajuste-hora"
                  type="time"
                  required
                  value={ajuste.hora}
                  onChange={(e) => setAjuste({ ...ajuste, hora: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                />
              </div>

              <div>
                <label
                  htmlFor="ajuste-justificativa"
                  className="text-[11px] font-bold text-[var(--c-texto-2)] uppercase tracking-wider block mb-1"
                >
                  Justificativa (obrigatória)
                </label>
                <textarea
                  id="ajuste-justificativa"
                  required
                  rows={3}
                  value={ajuste.justificativa}
                  onChange={(e) => setAjuste({ ...ajuste, justificativa: e.target.value })}
                  placeholder="Ex: esqueceu de bater na saída; confirmado com o gestor."
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAjuste(null)}
                  className="py-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-borda-forte)] transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 active:scale-[0.99] transition-all"
                >
                  Salvar ajuste
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-xl border ${
            toast.erro
              ? 'bg-red-500/10 border-red-500/30 text-red-600'
              : 'bg-[var(--c-superficie)] border-[var(--c-borda)] text-[var(--c-texto)]'
          }`}
        >
          {toast.erro ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          )}
          {toast.texto}
        </div>
      )}
    </div>
  );
};
