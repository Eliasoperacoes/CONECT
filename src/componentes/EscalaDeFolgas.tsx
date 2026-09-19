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
  CalendarPlus,
  Palmtree,
} from 'lucide-react';
import { Colaborador, JustificativaAusencia } from '../tipos';
import { servicoPonto, formatarDataBR } from '../servicos/ponto';
import { lerJustificativas } from '../servicos/justificativasCache';
import { decidirAusencia, assinarJustificativas } from '../servicos/justificativas';
import { bancoDados } from '../servicos/bancoDados';
import { ModalLancarEscala } from './ModalLancarEscala';
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

  /** A lista de quem não marcou começa fechada: são 23 nomes. */
  const [semFolgaAberta, setSemFolgaAberta] = useState(false);
  /** O formulário de lançamento da liderança. */
  const [lancando, setLancando] = useState(false);

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

  /**
   * As FÉRIAS que tocam o mês aberto.
   *
   * Férias é um período, não um sábado, então não cabe na tabela acima —
   * mas precisa aparecer na mesma tela: quem monta a escala do mês decide
   * olhando quem vai estar fora, e férias é a maior ausência que existe.
   *
   * Basta ENCOSTAR no mês: um período que começa em 28/12 e termina em
   * 10/01 importa para os dois meses.
   */
  const feriasDoMes = useMemo(() => {
    void versao;
    const idsDaEquipe = new Set(equipe.map((c) => c.id));
    const primeiro = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    const ultimo = `${ano}-${String(mes + 1).padStart(2, '0')}-31`;

    return lerJustificativas()
      .filter(
        (j) =>
          j.tipo === 'ferias' &&
          j.estado !== 'recusada' &&
          idsDaEquipe.has(j.colaboradorId) &&
          j.dataInicio <= ultimo &&
          j.dataFim >= primeiro
      )
      .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  }, [equipe, ano, mes, versao]);

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

    /**
     * As férias entram no mesmo papel, em tabela própria.
     *
     * Quem prega a escala no quadro precisa das duas informações: quem
     * folga no sábado e quem está fora o mês inteiro.
     */
    const tabelaDeFerias = feriasDoMes.length
      ? `<h2 class="secao">Férias no período</h2>
         <table class="grade">
           <thead><tr><th>Colaborador</th><th>Início</th><th>Fim</th></tr></thead>
           <tbody>${feriasDoMes
             .map(
               (f) => `<tr>
                 <td>${nomeDe(f.colaboradorId)}</td>
                 <td class="centro hora">${formatarDataBR(f.dataInicio)}</td>
                 <td class="centro hora">${formatarDataBR(f.dataFim)}</td>
               </tr>`
             )
             .join('')}</tbody>
         </table>`
      : '';

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

      ${tabelaDeFerias}

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
          {/*
            MONTAR A ESCALA, e não só responder a pedidos.
            Fechar os sábados do mês e planejar as férias é trabalho de
            quem organiza a equipe — não há pedido nenhum a responder.
          */}
          <button
            type="button"
            onClick={() => setLancando(true)}
            className="px-3 py-2 rounded-xl border border-[var(--c-acento)] text-xs font-bold text-[var(--c-acento)] hover:bg-[var(--c-acento-suave)] transition-colors flex items-center gap-1.5"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Lançar
          </button>
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
        A ESCALA COMO ESCALA, e não como cartões soltos.

        Eram cartões numa grade que quebrava de linha: com 23 pessoas
        escolhendo folga, uns ficariam altos, outros vazios, e a grade
        desalinhava. Colunas lado a lado, de mesma altura, leem-se como um
        quadro de escala — que é o que isto é.

        Cada coluna diz o número que o gestor precisa: quantos folgam E
        quantos ficam na loja. "3 de folga" sozinho não decide nada; "3 de
        folga, 20 na loja" decide.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
        {sabados.map((sabado) => {
          const folgas = (porSabado.get(sabado) || []).filter(
            (f) => f.estado !== 'recusada'
          );
          const ficam = Math.max(equipe.length - folgas.length, 0);
          const proporcao = equipe.length
            ? Math.round((folgas.length / equipe.length) * 100)
            : 0;

          const dia = sabado.slice(8, 10);
          const mesCurto = NOMES_DOS_MESES[Number(sabado.slice(5, 7)) - 1].slice(0, 3);

          return (
            <div
              key={sabado}
              className="rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] overflow-hidden flex flex-col"
            >
              {/* Cabeçalho da coluna: o dia grande, como num calendário */}
              <div className="px-3 pt-3 pb-2.5 border-b border-[var(--c-borda)]">
                <div className="flex items-end justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold leading-none text-[var(--c-texto)]">
                      {dia}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                      {mesCurto}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      folgas.length === 0
                        ? 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)]'
                        : 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]'
                    }`}
                  >
                    {folgas.length} {folgas.length === 1 ? 'folga' : 'folgas'}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  {/* Quanto da equipe sai neste sábado, de relance */}
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--c-superficie-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--c-acento)] transition-all"
                      style={{ width: `${proporcao}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--c-texto-3)] whitespace-nowrap">
                    {ficam} na loja
                  </span>
                </div>
              </div>

              {/*
                A lista rola DENTRO da coluna.

                Sem isto, um sábado com dez folgas esticaria a coluna e
                deixaria as outras três com um vão embaixo — que é como a
                grade de cartões desalinhava.
              */}
              <div className="p-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
                {folgas.length === 0 ? (
                  <span className="px-1 py-3 text-xs text-[var(--c-texto-3)] italic text-center">
                    Equipe completa
                  </span>
                ) : (
                  folgas.map((f) => {
                    const pessoa = bancoDados.obterColaboradorPorId(f.colaboradorId);
                    const pendente = f.estado === 'pendente';

                    return (
                      <div
                        key={f.id}
                        className={`rounded-xl px-2 py-1.5 ${
                          pendente
                            ? 'bg-amber-500/10 border border-amber-500/30'
                            : 'bg-[var(--c-canvas)]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {pendente ? (
                            <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-[var(--c-texto)] truncate">
                              {pessoa?.nome || nomeDe(f.colaboradorId)}
                            </span>
                            {pessoa && (
                              <span className="block text-[10px] text-[var(--c-texto-3)] truncate">
                                {pessoa.setor}
                              </span>
                            )}
                          </div>
                        </div>

                        {/*
                          A DECISÃO FICA AQUI, e não numa fila à parte.
                          Autorizar folga é olhar a escala: quantos já estão
                          de folga neste sábado, e quem. Numa fila solta o
                          gestor decidiria sem ver nada disso.
                        */}
                        {pendente && podeDecidir(f) && (
                          <div className="flex items-center gap-1 mt-1.5 pl-5">
                            <button
                              type="button"
                              onClick={() => setRecusando(f)}
                              className="flex-1 px-2 py-1 rounded-lg border border-[var(--c-borda)] text-[11px] font-bold text-[var(--c-texto-2)] hover:text-red-600 hover:border-red-500/30 transition-colors"
                            >
                              Recusar
                            </button>
                            <button
                              type="button"
                              onClick={() => decidir(f, true)}
                              className="flex-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors"
                            >
                              Aprovar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        Quem ainda não marcou. É a cobrança que o gestor faz: folga é direito
        do mês, e mês fechado sem marcar é direito perdido — a pessoa
        raramente lembra sozinha.
      */}
      {/*
      {/*
        FÉRIAS, em bloco próprio.

        Não entra na tabela dos sábados porque não é um sábado: é um
        período. Mas fica na mesma tela, logo abaixo, porque quem fecha a
        escala do mês decide olhando quem vai estar fora — e férias é a
        maior ausência que existe.
      */}
      {feriasDoMes.length > 0 && (
        <div className="rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--c-borda)] flex items-center gap-2">
            <Palmtree className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-[var(--c-texto)]">
              Férias em {NOMES_DOS_MESES[mes]}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              {feriasDoMes.length}
            </span>
          </div>
          <div className="divide-y divide-[var(--c-borda)]">
            {feriasDoMes.map((f) => (
              <div
                key={f.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
              >
                <span className="text-xs font-semibold text-[var(--c-texto)]">
                  {nomeDe(f.colaboradorId)}
                </span>
                <span className="text-[11px] font-mono text-[var(--c-texto-2)]">
                  {formatarDataBR(f.dataInicio)} a {formatarDataBR(f.dataFim)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {lancando && (
        <ModalLancarEscala
          equipe={equipe}
          sabados={sabados}
          aoFechar={() => setLancando(false)}
          aoLancar={(texto, ehErro) => {
            mostrar(texto, ehErro);
            setVersao((v) => v + 1);
          }}
        />
      )}
    </div>
  );
};
