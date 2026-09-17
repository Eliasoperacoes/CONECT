/**
 * Escala de folgas — CONECTA / Malachias Autopeças
 *
 * A folga de sábado é direito mensal de cada colaborador, mas a loja não
 * pode ficar vazia: o gestor precisa ver o mês inteiro de uma vez para saber
 * quantas pessoas já estão de folga em cada sábado antes de autorizar mais
 * uma.
 *
 * Por isso a tela é um CALENDÁRIO do mês, e não uma lista de pedidos. Uma
 * lista responde "quem pediu"; a pergunta do gestor é "quem falta no dia 19".
 */
import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Colaborador, JustificativaAusencia } from '../tipos';
import { servicoPonto, formatarDataBR } from '../servicos/ponto';
import { lerJustificativas } from '../servicos/justificativasCache';
import { bancoDados } from '../servicos/bancoDados';

interface Props {
  colaboradorAtual: Colaborador;
}

const NOMES_DOS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Os sábados de um mês, em AAAA-MM-DD. */
const sabadosDoMes = (ano: number, mes: number): string[] => {
  const dias: string[] = [];
  const d = new Date(ano, mes, 1, 12);
  while (d.getMonth() === mes) {
    if (d.getDay() === 6) {
      dias.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`
      );
    }
    d.setDate(d.getDate() + 1);
  }
  return dias;
};

export const EscalaDeFolgas: React.FC<Props> = ({ colaboradorAtual }) => {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());

  /**
   * A equipe é a mesma da alçada: quem o gestor aprova é quem ele escala.
   * Montar a escala com gente que ele não aprova seria planejar a folga de
   * quem responde a outro.
   */
  const equipe = useMemo(
    () =>
      servicoPonto
        .obterColaboradoresVisiveis()
        .filter((c) => c.id !== colaboradorAtual.id)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradorAtual.id]
  );

  const sabados = useMemo(() => sabadosDoMes(ano, mes), [ano, mes]);

  /** As folgas do mês, por sábado. Só de quem é da equipe. */
  const porSabado = useMemo(() => {
    const idsDaEquipe = new Set(equipe.map((c) => c.id));
    const mapa = new Map<string, JustificativaAusencia[]>();

    for (const j of lerJustificativas()) {
      if (j.tipo !== 'folga_sabado' || j.estado === 'recusada') continue;
      if (!idsDaEquipe.has(j.colaboradorId)) continue;
      if (!sabados.includes(j.dataInicio)) continue;

      const lista = mapa.get(j.dataInicio) || [];
      lista.push(j);
      mapa.set(j.dataInicio, lista);
    }
    return mapa;
  }, [equipe, sabados]);

  /** Quem ainda não marcou folga no mês — é a cobrança que o gestor faz. */
  const semFolga = useMemo(() => {
    const comFolga = new Set(
      [...porSabado.values()].flat().map((j) => j.colaboradorId)
    );
    return equipe.filter((c) => !comFolga.has(c.id));
  }, [equipe, porSabado]);

  const nomeDe = (id: string) => bancoDados.obterColaboradorPorId(id)?.nome || id;

  const mudarMes = (passo: number) => {
    const d = new Date(ano, mes + passo, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  };

  /**
   * O documento da escala.
   *
   * Sai em HTML numa janela à parte, pronto para imprimir ou salvar em PDF
   * pelo próprio navegador: a loja imprime e prega no quadro, e quem não
   * abre o sistema também fica sabendo.
   */
  const montarDocumento = (): string => {
    const linhas = sabados
      .map((sabado) => {
        const folgas = porSabado.get(sabado) || [];
        const pessoas = folgas.length
          ? folgas
              .map(
                (f) =>
                  `${nomeDe(f.colaboradorId)}${
                    f.estado === 'pendente' ? ' (aguardando aprovação)' : ''
                  }`
              )
              .join('<br>')
          : '<span class="vazio">Ninguém de folga</span>';

        return `<tr>
          <td class="dia">${formatarDataBR(sabado)}</td>
          <td class="qtd">${folgas.length}</td>
          <td>${pessoas}</td>
        </tr>`;
      })
      .join('');

    const pendentes = [...porSabado.values()]
      .flat()
      .filter((f) => f.estado === 'pendente').length;

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Escala de folgas · ${NOMES_DOS_MESES[mes]} de ${ano}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 28px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #555; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #f1f3f5; padding: 8px; border: 1px solid #dee2e6; }
  td { padding: 8px; border: 1px solid #dee2e6; vertical-align: top; }
  .dia { white-space: nowrap; font-weight: 600; width: 110px; }
  .qtd { text-align: center; width: 60px; }
  .vazio { color: #868e96; font-style: italic; }
  .aviso { margin-top: 16px; font-size: 12px; color: #555; }
  .falta { margin-top: 20px; font-size: 12px; }
  .falta strong { display: block; margin-bottom: 4px; }
  @media print { body { margin: 12px; } }
</style></head><body>
<h1>Escala de folgas de sábado</h1>
<div class="sub">
  ${NOMES_DOS_MESES[mes]} de ${ano} · ${colaboradorAtual.loja} ·
  equipe de ${colaboradorAtual.nome} · ${equipe.length} pessoas ·
  emitida em ${formatarDataBR(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(
      hoje.getDate()
    ).padStart(2, '0')}`
  )}
</div>

<table>
  <thead><tr><th>Sábado</th><th>Folgas</th><th>Quem</th></tr></thead>
  <tbody>${linhas}</tbody>
</table>

${
  pendentes > 0
    ? `<div class="aviso"><strong>Atenção:</strong> ${pendentes} folga(s) ainda aguardando aprovação. Só as aprovadas valem.</div>`
    : ''
}

${
  semFolga.length > 0
    ? `<div class="falta"><strong>Ainda sem folga marcada neste mês (${semFolga.length}):</strong>
       ${semFolga.map((c) => c.nome).join(' · ')}</div>`
    : ''
}
</body></html>`;
  };

  const imprimir = () => {
    const janela = window.open('', '_blank');
    if (!janela) return;
    janela.document.write(montarDocumento());
    janela.document.close();
    janela.focus();
    janela.print();
  };

  const exportarCsv = () => {
    // Ponto e vírgula: é o que o Excel em português abre sem perguntar nada
    const linhas = ['Sabado;Quantidade;Colaborador;Situacao'];
    for (const sabado of sabados) {
      const folgas = porSabado.get(sabado) || [];
      if (folgas.length === 0) {
        linhas.push(`${formatarDataBR(sabado)};0;;sem folga`);
        continue;
      }
      for (const f of folgas) {
        linhas.push(
          `${formatarDataBR(sabado)};${folgas.length};${nomeDe(f.colaboradorId)};${
            f.estado === 'aprovada' ? 'aprovada' : 'aguardando'
          }`
        );
      }
    }

    // ﻿: sem ele o Excel come os acentos
    const conteudo = '﻿' + linhas.join('\r\n');
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `escala-folgas-${ano}-${String(mes + 1).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Escala de folgas
          </h2>
          <p className="text-xs text-[var(--c-texto-3)]">
            Cada pessoa tem uma folga de sábado por mês. Veja o mês inteiro antes
            de autorizar mais uma no mesmo dia.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={exportarCsv}
            className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
          <button
            type="button"
            onClick={imprimir}
            className="px-3 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Navegação do mês */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => mudarMes(-1)}
          className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)]"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-[var(--c-texto)] min-w-[160px] text-center">
          {NOMES_DOS_MESES[mes]} de {ano}
        </span>
        <button
          type="button"
          onClick={() => mudarMes(1)}
          className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)]"
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Um cartão por sábado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sabados.map((sabado) => {
          const folgas = porSabado.get(sabado) || [];
          return (
            <div
              key={sabado}
              className="p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-[var(--c-texto)]">
                  {formatarDataBR(sabado)}
                </span>
                <span className="text-[11px] text-[var(--c-texto-3)]">
                  {folgas.length === 0
                    ? 'ninguém'
                    : `${folgas.length} ${folgas.length === 1 ? 'folga' : 'folgas'}`}
                </span>
              </div>

              {folgas.length === 0 ? (
                <span className="text-xs text-[var(--c-texto-3)] italic">
                  Equipe completa
                </span>
              ) : (
                folgas.map((f) => (
                  <div key={f.id} className="flex items-center gap-1.5 text-xs">
                    {f.estado === 'aprovada' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    )}
                    <span className="text-[var(--c-texto)] truncate">
                      {nomeDe(f.colaboradorId)}
                    </span>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {/*
        Quem ainda não marcou. É a cobrança que o gestor faz: folga é direito
        do mês, e mês fechado sem marcar é direito perdido — a pessoa
        raramente lembra sozinha.
      */}
      {semFolga.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/25 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-xs font-bold text-[var(--c-texto)] block">
              {semFolga.length} sem folga marcada em {NOMES_DOS_MESES[mes]}
            </span>
            <span className="text-[11px] text-[var(--c-texto-2)]">
              {semFolga.map((c) => c.nome).join(' · ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
