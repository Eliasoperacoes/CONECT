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
  ChevronDown,
} from 'lucide-react';
import { Colaborador, JustificativaAusencia } from '../tipos';
import { servicoPonto, formatarDataBR } from '../servicos/ponto';
import { lerJustificativas } from '../servicos/justificativasCache';
import {
  decidirAusencia,
  assinarJustificativas,
  salvarEscalaDeFolgas,
} from '../servicos/justificativas';
import { QuadroEscalaFolgas } from './QuadroEscalaFolgas';
import { bancoDados } from '../servicos/bancoDados';
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
  const [versao, setVersao] = useState(0);
  const [recusando, setRecusando] = useState<JustificativaAusencia | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  const mostrar = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 5000);
  };

  const podeDecidir = (j: JustificativaAusencia): boolean => {
    const dono = bancoDados.obterColaboradorPorId(j.colaboradorId);
    return !!dono && servicoPonto.podeDecidirSobre(dono);
  };

  const decidir = async (j: JustificativaAusencia, aprovar: boolean, motivoRecusa?: string) => {
    const res = await decidirAusencia(j.id, aprovar, motivoRecusa);
    setVersao((v) => v + 1);
    if (!res.sucesso) {
      mostrar(res.erro || 'Não foi possível registrar.', true);
      return false;
    }
    mostrar(
      aprovar
        ? `Folga de ${nomeDe(j.colaboradorId)} aprovada para ${formatarDataBR(j.dataInicio)}.`
        : 'Folga recusada. A pessoa pode escolher outro sábado no mesmo mês.'
    );
    return true;
  };

  /**
   * A equipe é a mesma da alçada: quem o gestor aprova é quem ele escala.
   * Montar a escala com gente que ele não aprova seria planejar a folga de
   * quem responde a outro.
   *
   * E ELE MESMO ENTRA NA LISTA.
   *
   * Antes havia um `filter` tirando o próprio da relação — escrito quando
   * ninguém decidia sobre a própria jornada. Essa regra mudou: quem
   * responde por alguém aprova as próprias horas, e por isso também lança
   * as próprias férias. A líder abria a escala e via só a subordinada,
   * sem ter por onde marcar as dela.
   *
   * `podeDecidirSobre` é quem responde isso, igual à relação semanal e à
   * fila de aprovação. Quem não responde por ninguém continua fora da
   * própria lista, e depende de quem responde por ele.
   */
  const equipe = useMemo(
    () =>
      servicoPonto
        .obterColaboradoresVisiveis()
        .filter((c) => servicoPonto.podeDecidirSobre(c))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradorAtual.id]
  );

  const [salvandoEscala, setSalvandoEscala] = useState(false);

  /**
   * Grava o rascunho do quadro.
   *
   * O resultado NÃO é um "salvo com sucesso" seco: o lote não é
   * tudo-ou-nada, e quem montou a escala de doze pessoas precisa saber
   * exatamente qual delas ficou de fora e por quê. Dizer só "algumas
   * falharam" obrigaria a conferir as doze na mão.
   */
  const gravarEscala = async (alteracoes: {
    adicionar: Array<{ colaboradorId: string; sabado: string }>;
    remover: Array<{ justificativaId: string }>;
  }) => {
    setSalvandoEscala(true);
    const res = await salvarEscalaDeFolgas(alteracoes);
    setSalvandoEscala(false);
    setVersao((v) => v + 1);

    if (res.falhas.length === 0) {
      mostrar(
        res.aplicadas === 0
          ? 'Nada a salvar.'
          : `Escala salva: ${res.aplicadas} alteração(ões).`
      );
      return;
    }

    mostrar(
      `${res.aplicadas} salva(s). Ficaram de fora: ${res.falhas
        .map((f) => `${f.nome} (${f.erro})`)
        .join(' · ')}`,
      true
    );
  };

  /**
   * FÉRIAS SAÍRAM DESTA TELA.
   *
   * Eram uma aba aqui dentro, e estava errado: são duas decisões
   * diferentes, com dois donos e dois ritmos. A folga de sábado é
   * direito MENSAL, decidida pelo gestor da loja olhando quem cobre o
   * balcão no dia 19; férias é período de ANO, com lançamento e
   * programação — trabalho de RH.
   *
   * Agora moram em Recursos Humanos > Férias, com calendário do ano,
   * exportação e impressão por mês ou por ano.
   */
  /** A lista de quem não marcou começa fechada: são 23 nomes. */
  const [semFolgaAberta, setSemFolgaAberta] = useState(false);

  const sabados = useMemo(() => sabadosDoMes(ano, mes), [ano, mes]);

  /** As folgas do mês, por sábado. Só de quem é da equipe. */
  const porSabado = useMemo(() => {
    void versao;
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
  }, [equipe, sabados, versao]);

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
   * O DOCUMENTO DA ESCALA.
   *
   * Sai com o mesmo desenho do espelho de ponto: mesma régua preta no
   * cabeçalho, mesma grade, mesmas assinaturas. Antes tinha HTML e CSS
   * próprios — título de 30px, cinzas claros, etiquetas arredondadas — e
   * na mesa do RH os dois papéis não pareciam sair do mesmo sistema.
   *
   * O que é comum mora em `servicos/documento`. Aqui fica só o miolo.
   */
  const montarEscala = (): string => {
    const linhasDaTabela = sabados
      .map((sabado) => {
        const folgas = (porSabado.get(sabado) || []).filter(
          (f) => f.estado !== 'recusada'
        );

        const pessoas = folgas.length
          ? folgas
              .map(
                (f) =>
                  `${nomeDe(f.colaboradorId)}${
                    f.estado === 'pendente' ? ' (aguardando aprovação)' : ''
                  }`
              )
              .join('<br>')
          : '<span class="vazio">Equipe completa</span>';

        return `<tr>
          <td class="centro"><strong>${formatarDataBR(sabado)}</strong></td>
          <td class="centro num">${folgas.length}</td>
          <td>${pessoas}</td>
        </tr>`;
      })
      .join('');


    const pendentes = [...porSabado.values()]
      .flat()
      .filter((f) => f.estado === 'pendente').length;

    const corpo = `<div class="folha">
      ${cabecalho({
        titulo: 'ESCALA DE FOLGAS',
        subtitulo: colaboradorAtual.loja,
        periodo: `${NOMES_DOS_MESES[mes]} de ${ano}<br>Equipe de ${colaboradorAtual.nome} · ${equipe.length} pessoas`,
      })}

      <table class="grade">
        <thead>
          <tr><th class="centro">Sábado</th><th class="centro">Folgas</th><th>Quem folga</th></tr>
        </thead>
        <tbody>${linhasDaTabela}</tbody>
      </table>


      ${
        pendentes > 0
          ? `<p class="nota"><strong>${pendentes} folga(s) ainda aguardando aprovação.</strong> Só as aprovadas valem.</p>`
          : ''
      }

      <p class="nota">
        Cada colaborador tem direito a uma folga de sábado por mês.
      </p>

      ${assinaturas(['Responsável pela escala', 'Ciência da equipe'])}
      ${rodape(`Emitida em ${emitidoHoje()}`)}
    </div>`;

    return montarDocumento({
      titulo: `Escala de folgas · ${NOMES_DOS_MESES[mes]} de ${ano}`,
      corpo,
      orientacao: 'retrato',
      estiloExtra: `
        .secao { font-size: 13px; margin: 18px 0 6px; letter-spacing: 1px; text-transform: uppercase; }
      `,
    });
  };

  const imprimir = () => {
    if (!imprimirDocumento(montarEscala())) {
      mostrar('O navegador bloqueou a janela de impressão. Libere o pop-up.', true);
    }
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

      {/*
        O QUADRO DA ESCALA.

        Eram colunas de leitura: mostravam quem já tinha pedido folga e
        davam os botões de aprovar e recusar. Montar a escala de doze
        pessoas exigia abrir um formulário doze vezes.

        Agora arrasta. A regra de quem pode ser escalado por quem NÃO
        veio junto — ela continua em `salvarEscalaDeFolgas`, que chama
        `lancarAusenciaPelaLideranca`. Esta tela passa a equipe que a
        alçada já filtrou e pergunta; o banco responde.
      */}
      <QuadroEscalaFolgas
        equipe={equipe}
        sabados={sabados}
        porSabado={porSabado}
        salvando={salvandoEscala}
        aoSalvar={gravarEscala}
        aoAprovar={(j) => decidir(j, true)}
        aoRecusar={(j) => setRecusando(j)}
      />

      {/*
        Quem ainda não marcou. É a cobrança que o gestor faz: folga é direito
        do mês, e mês fechado sem marcar é direito perdido — a pessoa
        raramente lembra sozinha.
      */}
      {/*
        FÉRIAS DO MÊS saíram daqui.

        Eram uma lista do mês corrente, embaixo da escala de sábado. A
        pergunta que ela respondia — "quem está fora agora" — é a menos
        útil das duas: quem planeja precisa do ANO, e o ano ganhou aba
        própria logo acima.
      */}

      {/*
        RECOLHIDA POR PADRÃO.

        São 23 nomes numa loja como Pirassununga. Abertos, ocupam mais
        espaço do que a escala inteira e empurram para baixo justamente o
        que se veio olhar. O número já é o aviso; a lista é o detalhe de
        quem vai cobrar.
      */}
      {semFolga.length > 0 && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/25 overflow-hidden">
          <button
            type="button"
            onClick={() => setSemFolgaAberta((v) => !v)}
            className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-amber-500/5 transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-xs font-bold text-[var(--c-texto)]">
              {semFolga.length} sem folga marcada em {NOMES_DOS_MESES[mes]}
            </span>
            <span className="text-[11px] font-semibold text-[var(--c-texto-3)] whitespace-nowrap">
              {semFolgaAberta ? 'ocultar' : 'ver quem'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0 transition-transform ${
                semFolgaAberta ? 'rotate-180' : ''
              }`}
            />
          </button>

          {semFolgaAberta && (
            <div className="px-3 pb-3 pt-0.5 flex flex-wrap gap-1.5 border-t border-amber-500/20">
              {semFolga.map((c) => (
                <span
                  key={c.id}
                  className="text-[11px] px-2 py-1 rounded-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto-2)]"
                  title={`${c.cargo} · ${c.setor}`}
                >
                  {c.nome}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recusar exige motivo: a pessoa precisa saber para escolher outro
          sábado — e recusada não queima o direito do mês */}
      {recusando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--c-superficie)] w-full max-w-sm rounded-2xl border border-[var(--c-borda)] shadow-xl p-4 flex flex-col gap-3">
            <span className="text-sm font-bold text-[var(--c-texto)]">
              Recusar a folga de {nomeDe(recusando.colaboradorId)}
            </span>
            <span className="text-[11px] text-[var(--c-texto-3)]">
              {formatarDataBR(recusando.dataInicio)} · ela poderá escolher outro
              sábado no mesmo mês.
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ex.: sábado de balanço, precisamos da equipe completa"
              className="w-full px-3 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecusando(null);
                  setMotivo('');
                }}
                className="flex-1 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)]"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await decidir(recusando, false, motivo)) {
                    setRecusando(null);
                    setMotivo('');
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
              >
                Recusar
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        O MODAL "LANÇAR" SAIU.

        Ele servia para as duas escalas: escolhia o tipo, a pessoa e o
        período. Férias mudou de lugar e ganhou tela própria no RH; a
        folga de sábado passou a se montar arrastando no quadro acima.

        Sobrou um formulário que fazia pior o que duas telas passaram a
        fazer melhor — e uma terceira porta para o mesmo trabalho é o
        que faz a pessoa perder tempo descobrindo qual das três é a
        certa.
      */}
    </div>
  );
};
