/**
 * Banco de Horas — seção do painel de RH / Malachias Autopeças
 *
 * Renderizada como uma aba dentro do painel de RH, junto de Visão & Lojas,
 * Quadro de Equipe e Avisos. Reúne o espelho de ponto por colaborador, saldo
 * do período e acumulado, correção de marcações com justificativa e os QRs de
 * ponto de cada loja, prontos para imprimir e afixar.
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
  Building2,
  MapPin,
  ArrowRight,
  UserCog,
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
  INFORMACOES_LOJAS,
} from '../tipos';
import { bancoDados, obterFotoColaborador } from '../servicos/bancoDados';
import { ModalCadastroColaborador } from './ModalCadastroColaborador';
import { FotoPresenca } from './FotoPresenca';
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
import { podeUsar } from '../servicos/permissoes';

interface PropsBancoDeHoras {
  colaboradorAtual: Colaborador;
}

type AbaRH = 'banco_horas' | 'qrcodes';

export const BancoDeHoras: React.FC<PropsBancoDeHoras> = ({ colaboradorAtual }) => {
  const [abaAtiva, setAbaAtiva] = useState<AbaRH>('banco_horas');
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(dataDeHoje());
  const [busca, setBusca] = useState('');
  // Navegação em três níveis: lojas -> equipe da loja -> espelho da pessoa.
  // Com mais de 40 colaboradores, a lista única fica impraticável.
  const [lojaSelecionada, setLojaSelecionada] = useState<Loja | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [colaboradorEmCadastro, setColaboradorEmCadastro] = useState<Colaborador | null>(null);

  // Quem pode abrir o painel de RH também cuida da ficha das pessoas
  const podeEditarCadastros = bancoDados.podeGerenciarPessoas(colaboradorAtual);
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

  /**
   * Quem VÊ esta tela é decidido no painel de Permissões, e só lá.
   *
   * Antes havia dois guardiões: a permissão e um `podeAcessarPainelRH`
   * escrito aqui. Ligar a ferramenta para o gerente no painel não adiantava
   * nada — o segundo guardião continuava recusando, sem dizer por quê.
   *
   * O que continua restrito ao RH não é a TELA, são as AÇÕES: corrigir
   * marcação e publicar código de ponto seguem barrados dentro do serviço,
   * que é onde a trava sobrevive a qualquer configuração.
   */
  /**
   * Duas ferramentas distintas moram nesta tela:
   *
   *   banco_horas_rh -> espelho de ponto, saldo, correção de marcação
   *   qr_ponto       -> só o cartaz da loja
   *
   * Separadas porque o gerente precisa do cartaz e NÃO precisa do painel de
   * RH. Enquanto era tudo uma coisa só, dar o cartaz a ele significava dar
   * junto a folha de ponto.
   */
  const veBancoDeHoras = podeUsar('banco_horas_rh', colaboradorAtual);
  const veQr = podeUsar('qr_ponto', colaboradorAtual);
  const temAcesso = veBancoDeHoras || veQr;
  const podeCorrigirMarcacao = servicoPonto.podeAcessarPainelRH(colaboradorAtual);

  /** As lojas cujo cartaz esta pessoa cuida. O gerente tem uma; o RH, cinco. */
  const lojasDoQr = servicoPonto.lojasComQrQuePosso(colaboradorAtual);

  /**
   * Quem só tem o cartaz não pode cair na aba do banco de horas, que é a
   * primeira do estado — abriria numa tela que ele não enxerga.
   */
  const abaEfetiva: AbaRH = veBancoDeHoras ? abaAtiva : 'qrcodes';

  // Gera as imagens dos QRs sempre que a aba é aberta ou um código muda
  useEffect(() => {
    if (!temAcesso || abaEfetiva !== 'qrcodes') return;

    let cancelado = false;
    const gerar = async () => {
      // O código do cartaz é publicado pelo RH e vale para a rede inteira.
      // Quem bate ponto não cria código nenhum no próprio aparelho.
      await servicoPonto.garantirCodigosDasLojas();

      // Só as lojas dela: o gerente não imprime o cartaz de outra unidade
      const gerados = await Promise.all(
        lojasDoQr.map(async (loja) => {
          const conteudo = servicoPonto.montarConteudoQr(loja);
          const registroCodigo = servicoPonto.obterCodigoDaLoja(loja);
          if (!conteudo || !registroCodigo) return null;

          const imagem = await QRCode.toDataURL(conteudo, {
            width: 420,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0E1216', light: '#FFFFFF' },
          });
          return { loja, codigo: registroCodigo.codigo, imagem };
        })
      );
      if (!cancelado) {
        setQrcodes(gerados.filter((q): q is NonNullable<typeof q> => !!q));
      }
    };

    gerar().catch(() => exibirToast('Falha ao gerar os QR Codes.', true));
    return () => {
      cancelado = true;
    };
  }, [abaEfetiva, versaoDados, temAcesso]);

  const resumos: ResumoPontoColaborador[] = useMemo(() => {
    if (!temAcesso) return [];
    return servicoPonto.obterResumoDoPeriodo(dataInicio, dataFim);
  }, [dataInicio, dataFim, versaoDados, temAcesso]);

  const termoBusca = busca.trim().toLowerCase();

  /** Busca atravessa as lojas: quem procura um nome não quer navegar até ele. */
  const buscando = termoBusca.length > 0;

  const atendeBusca = (r: ResumoPontoColaborador) =>
    r.colaborador.nome.toLowerCase().includes(termoBusca) ||
    r.colaborador.cargo.toLowerCase().includes(termoBusca) ||
    r.colaborador.setor.toLowerCase().includes(termoBusca);

  /** Totaliza um conjunto de colaboradores para os cartões de indicador. */
  const totalizar = (lista: ResumoPontoColaborador[]) =>
    lista.reduce(
      (acc, r) => ({
        pessoas: acc.pessoas + 1,
        presentesHoje: acc.presentesHoje + (r.registrouHoje ? 1 : 0),
        pendencias: acc.pendencias + r.diasComPendencia,
        saldo: acc.saldo + r.saldoPeriodoMinutos,
      }),
      { pessoas: 0, presentesHoje: 0, pendencias: 0, saldo: 0 }
    );

  /** Uma linha por unidade, com os números consolidados da equipe dela. */
  const unidades = useMemo(() => {
    return INFORMACOES_LOJAS.filter((info) => LOJAS_COM_PONTO.includes(info.nome))
      .map((info) => {
        const equipe = resumos.filter((r) => r.colaborador.loja === info.nome);
        return { info, equipe, ...totalizar(equipe) };
      })
      .filter((u) => u.pessoas > 0);
  }, [resumos]);

  /** Colaboradores sem loja física cadastrada não podem sumir do painel. */
  const semUnidade = useMemo(
    () => resumos.filter((r) => !LOJAS_COM_PONTO.includes(r.colaborador.loja)),
    [resumos]
  );

  /** Lista exibida no nível de equipe: por busca ou pela loja escolhida. */
  const equipeExibida = useMemo(() => {
    if (buscando) return resumos.filter(atendeBusca);
    if (lojaSelecionada === 'Rede') return semUnidade;
    if (lojaSelecionada) return resumos.filter((r) => r.colaborador.loja === lojaSelecionada);
    return [];
  }, [resumos, buscando, termoBusca, lojaSelecionada, semUnidade]);

  const totaisRede = useMemo(() => totalizar(resumos), [resumos]);
  const totaisEquipe = useMemo(() => totalizar(equipeExibida), [equipeExibida]);

  const detalhe = useMemo(
    () => resumos.find((r) => r.colaborador.id === detalheId) || null,
    [resumos, detalheId]
  );

  /** Em que nível a aba está: lojas, equipe de uma loja ou espelho individual. */
  const nivelVisao: 'unidades' | 'equipe' | 'espelho' = detalhe
    ? 'espelho'
    : buscando || lojaSelecionada
    ? 'equipe'
    : 'unidades';

  // Barreira de acesso
  if (!temAcesso) {
    return (
      <div className="p-10 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center border border-red-500/20">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-base font-bold text-[var(--c-texto)]">Acesso Restrito</h2>
        <p className="text-xs text-[var(--c-texto-3)] max-w-md leading-relaxed">
          O banco de horas da rede é acessível apenas ao setor de RH e ao Administrador de TI.
        </p>
      </div>
    );
  }

  const baixarCsv = () => {
    // Exporta o que está em tela: a rede toda, a loja aberta ou a busca
    const emTela = nivelVisao === 'unidades' ? resumos : equipeExibida;
    const csv = servicoPonto.gerarCsvDoPeriodo(
      dataInicio,
      dataFim,
      emTela.map((r) => r.colaborador.id)
    );

    const sufixo =
      nivelVisao === 'unidades'
        ? 'rede'
        : buscando
        ? 'busca'
        : String(lojaSelecionada).toLowerCase().replace(/\s+/g, '-');

    // BOM para o Excel abrir os acentos corretamente
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ponto-${sufixo}-${dataInicio}-a-${dataFim}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    exibirToast('Espelho de ponto exportado.');
  };

  /** CSV de uma pessoa só, usado no espelho individual. */
  const baixarCsvDe = (colaboradorId: string, nome: string) => {
    const csv = servicoPonto.gerarCsvDoPeriodo(dataInicio, dataFim, [colaboradorId]);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ponto-${nome.toLowerCase().replace(/\s+/g, '-')}-${dataInicio}-a-${dataFim}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    exibirToast(`Espelho de ${nome} exportado.`);
  };

  /**
   * Abre a folha de ponto formatada numa janela e dispara a impressão.
   * `ids` vazio imprime o que está em tela; passando um id, imprime só ele.
   */
  const imprimirEspelho = (ids?: string[]) => {
    const alvos =
      ids ?? (nivelVisao === 'unidades' ? resumos : equipeExibida).map((r) => r.colaborador.id);

    if (alvos.length === 0) {
      exibirToast('Nenhum colaborador para imprimir.', true);
      return;
    }

    const janela = window.open('', '_blank');
    if (!janela) {
      exibirToast('Permita as janelas pop-up para imprimir o espelho.', true);
      return;
    }

    janela.document.write(servicoPonto.gerarHtmlEspelho(dataInicio, dataFim, alvos));
    janela.document.close();
    janela.focus();
    // Espera o layout fechar antes de chamar a impressão
    setTimeout(() => janela.print(), 250);
  };

  const regenerarCodigo = async (loja: Loja) => {
    const res = await servicoPonto.regenerarCodigoDaLoja(loja);
    if (res.sucesso) {
      exibirToast(`Novo código gerado para ${loja}. Reimprima o cartaz.`);
    } else {
      exibirToast(res.erro || 'Falha ao gerar novo código.', true);
    }
  };

  const salvarAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ajuste) return;

    const res = await servicoPonto.ajustarMarcacao({
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

  const removerMarcacao = async (registroId: string) => {
    const motivo = window.prompt('Justifique a remoção desta marcação:');
    if (motivo === null) return;
    const res = await servicoPonto.removerMarcacao(registroId, motivo);
    if (res.sucesso) {
      exibirToast('Marcação removida.');
    } else {
      exibirToast(res.erro || 'Falha ao remover.', true);
    }
  };

  return (
    <div className="w-full flex flex-col text-[var(--c-texto)]">
      {/* Alternância entre o banco de horas e os cartazes de QR das lojas */}
      <nav className="px-4 sm:px-6 pt-4 flex gap-1.5 overflow-x-auto">
        {([
          ...(veBancoDeHoras
            ? [{ id: 'banco_horas' as const, rotulo: 'Banco de Horas', icone: Clock }]
            : []),
          ...(veQr
            ? [{ id: 'qrcodes' as const, rotulo: 'QR do Ponto', icone: QrCode }]
            : []),
        ]).map((aba) => (
          <button
            key={aba.id}
            type="button"
            id={`aba-rh-${aba.id}`}
            onClick={() => {
              setAbaAtiva(aba.id);
              setDetalheId(null);
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${
              abaEfetiva === aba.id
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)] shadow-xs'
                : 'bg-[var(--c-superficie)] text-[var(--c-texto-3)] border-[var(--c-borda)] hover:text-[var(--c-texto-2)]'
            }`}
          >
            <aba.icone className="w-3.5 h-3.5" />
            {aba.rotulo}
          </button>
        ))}
      </nav>

      <div className="px-0 sm:px-2">
        {/* ---------- BANCO DE HORAS ---------- */}
        {abaEfetiva === 'banco_horas' && !detalhe && (
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

              {/* A busca atravessa as lojas: quem procura um nome específico
                  não deveria ter que adivinhar em qual unidade a pessoa está. */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)] pointer-events-none" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar pessoa em toda a rede"
                  className="w-full pl-8 pr-8 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                />
                {buscando && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)] hover:text-[var(--c-texto)]"
                    aria-label="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                id="botao-exportar-ponto"
                onClick={baixarCsv}
                className="w-full py-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-acento)] flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                {nivelVisao === 'unidades'
                  ? 'Exportar espelho da rede em CSV'
                  : buscando
                  ? 'Exportar resultado da busca em CSV'
                  : `Exportar espelho de ${lojaSelecionada} em CSV`}
              </button>

              <button
                type="button"
                id="botao-imprimir-espelho"
                onClick={() => imprimirEspelho()}
                className="w-full py-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-acento)] flex items-center justify-center gap-1.5 transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                {nivelVisao === 'unidades'
                  ? 'Imprimir espelhos da rede'
                  : buscando
                  ? 'Imprimir espelhos do resultado'
                  : `Imprimir espelhos de ${lojaSelecionada}`}
              </button>
            </div>

            {/* Indicadores: da rede no nível das lojas, da equipe ao entrar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(() => {
                const t = nivelVisao === 'unidades' ? totaisRede : totaisEquipe;
                return [
                  { rotulo: 'Colaboradores', valor: String(t.pessoas), cor: 'text-[var(--c-texto)]' },
                  { rotulo: 'Bateram hoje', valor: String(t.presentesHoje), cor: 'text-emerald-600' },
                  {
                    rotulo: 'Pendências',
                    valor: String(t.pendencias),
                    cor: t.pendencias > 0 ? 'text-amber-600' : 'text-[var(--c-texto)]',
                  },
                  {
                    rotulo: 'Saldo do período',
                    valor: formatarSaldo(t.saldo),
                    cor: t.saldo >= 0 ? 'text-emerald-600' : 'text-red-600',
                  },
                ];
              })().map((ind) => (
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

            {/* NÍVEL 1: cartões por unidade */}
            {nivelVisao === 'unidades' && (
              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--c-texto)] flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--c-acento)]" />
                    Banco de horas por unidade
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Escolha a loja para ver a equipe e os espelhos de ponto
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {unidades.map((unidade) => (
                    <button
                      key={unidade.info.nome}
                      type="button"
                      id={`unidade-rh-${unidade.info.nome}`}
                      onClick={() => setLojaSelecionada(unidade.info.nome)}
                      className="text-left bg-[var(--c-superficie)] rounded-xl border border-[var(--c-borda)] p-4 shadow-xs hover:shadow-sm hover:border-[var(--c-acento)] transition-all flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-[var(--c-texto)] truncate">
                              Loja {unidade.info.nome}
                            </h3>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider flex-shrink-0 ${
                                unidade.info.tipo === 'Matriz'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {unidade.info.tipo}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--c-texto-3)] flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3 h-3 flex-shrink-0" /> {unidade.info.cidade}
                          </p>
                        </div>

                        <span
                          className={`text-sm font-black tabular-nums flex-shrink-0 ${
                            unidade.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                          title="Saldo da equipe no período"
                        >
                          {formatarSaldo(unidade.saldo)}
                        </span>
                      </div>

                      <div className="text-xs bg-[var(--c-canvas)] p-2.5 rounded-lg border border-[var(--c-borda)] flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Equipe:</span>
                          <strong className="text-[var(--c-texto)]">
                            {unidade.pessoas} colaboradores
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Bateram hoje:</span>
                          <span className="font-semibold text-emerald-600">
                            {unidade.presentesHoje} de {unidade.pessoas}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Pendências:</span>
                          <span
                            className={
                              unidade.pendencias > 0
                                ? 'font-bold text-amber-600'
                                : 'text-[var(--c-texto-2)]'
                            }
                          >
                            {unidade.pendencias === 0 ? 'Nenhuma' : unidade.pendencias}
                          </span>
                        </div>
                      </div>

                      <span className="px-2.5 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-semibold text-xs flex items-center justify-center gap-1">
                        Ver equipe <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  ))}

                  {/* Pessoal sem loja física (operações centrais) */}
                  {semUnidade.length > 0 && (
                    <button
                      type="button"
                      id="unidade-rh-central"
                      onClick={() => setLojaSelecionada('Rede')}
                      className="text-left bg-[var(--c-superficie)] rounded-xl border border-dashed border-[var(--c-borda-forte)] p-4 hover:border-[var(--c-acento)] transition-all flex flex-col gap-3"
                    >
                      <div>
                        <h3 className="font-bold text-sm text-[var(--c-texto)]">
                          Operações Centrais
                        </h3>
                        <p className="text-xs text-[var(--c-texto-3)]">
                          Colaboradores sem loja física cadastrada
                        </p>
                      </div>
                      <div className="text-xs bg-[var(--c-canvas)] p-2.5 rounded-lg border border-[var(--c-borda)] flex justify-between">
                        <span className="text-[var(--c-texto-3)]">Equipe:</span>
                        <strong className="text-[var(--c-texto)]">
                          {semUnidade.length} colaboradores
                        </strong>
                      </div>
                      <span className="px-2.5 py-1.5 rounded-lg bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[var(--c-texto)] font-semibold text-xs flex items-center justify-center gap-1">
                        Ver equipe <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  )}
                </div>

                {unidades.length === 0 && semUnidade.length === 0 && (
                  <p className="py-10 text-center text-xs text-[var(--c-texto-3)]">
                    Nenhum colaborador ativo cadastrado.
                  </p>
                )}
              </section>
            )}

            {/* NÍVEL 2: equipe da unidade escolhida (ou resultado da busca) */}
            {nivelVisao === 'equipe' && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[var(--c-texto)] truncate">
                      {buscando
                        ? `Resultados para "${busca.trim()}"`
                        : lojaSelecionada === 'Rede'
                        ? 'Operações Centrais'
                        : `Loja ${lojaSelecionada}`}
                    </h2>
                    <p className="text-xs text-[var(--c-texto-3)]">
                      {equipeExibida.length} colaborador
                      {equipeExibida.length === 1 ? '' : 'es'}
                    </p>
                  </div>

                  {!buscando && (
                    <button
                      type="button"
                      onClick={() => setLojaSelecionada(null)}
                      className="flex-shrink-0 text-xs font-bold text-[var(--c-acento)] flex items-center gap-1 hover:underline"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Todas as lojas
                    </button>
                  )}
                </div>

                {equipeExibida.length === 0 ? (
                  <p className="py-10 text-center text-xs text-[var(--c-texto-3)]">
                    Nenhum colaborador encontrado.
                  </p>
                ) : (
                  /* Cartões no mesmo formato do Quadro de Equipe, trocando os
                     dados de contato pelos números do banco de horas. */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {equipeExibida.map((resumo) => (
                      <div
                        key={resumo.colaborador.id}
                        id={`cartao-rh-${resumo.colaborador.id}`}
                        className="bg-[var(--c-superficie)] rounded-xl border border-[var(--c-borda)] p-4 shadow-xs hover:shadow-sm transition-all flex flex-col gap-3"
                      >
                        {/* Identificação */}
                        <div className="flex items-start gap-3">
                          <FotoPresenca
                            foto={obterFotoColaborador(resumo.colaborador)}
                            nome={resumo.colaborador.nome}
                            presenca={resumo.colaborador.presenca}
                            tamanho="w-12 h-12"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-sm font-bold text-[var(--c-texto)] truncate">
                                {resumo.colaborador.nome}
                              </h4>
                              {/* "Bateu hoje" é informação de ponto, não de
                                  presença: fica ao lado do nome, não na foto */}
                              {resumo.registrouHoje && (
                                <span
                                  title="Registrou ponto hoje"
                                  className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                                >
                                  Hoje
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--c-texto-2)] truncate font-medium">
                              {resumo.colaborador.cargo}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--c-canvas)] text-[var(--c-texto-2)] border border-[var(--c-borda)]">
                                {resumo.colaborador.loja}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--c-canvas)] text-[var(--c-texto-3)] border border-[var(--c-borda)]">
                                {resumo.colaborador.setor}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Números do banco de horas */}
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="rounded-lg bg-[var(--c-canvas)] border border-[var(--c-borda)] p-2">
                            <span className="text-[10px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider block">
                              Período
                            </span>
                            <span
                              className={`text-base font-black tabular-nums ${
                                resumo.saldoPeriodoMinutos >= 0
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {formatarSaldo(resumo.saldoPeriodoMinutos)}
                            </span>
                          </div>
                          <div className="rounded-lg bg-[var(--c-canvas)] border border-[var(--c-borda)] p-2">
                            <span className="text-[10px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider block">
                              Acumulado
                            </span>
                            <span
                              className={`text-base font-black tabular-nums ${
                                resumo.saldoAcumuladoMinutos >= 0
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {formatarSaldo(resumo.saldoAcumuladoMinutos)}
                            </span>
                          </div>
                        </div>

                        {/* Situação do período */}
                        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[var(--c-borda)]">
                          <span className="text-[var(--c-texto-3)] font-medium">
                            {resumo.diasCompletos} dia
                            {resumo.diasCompletos === 1 ? '' : 's'} completo
                            {resumo.diasCompletos === 1 ? '' : 's'}
                          </span>
                          {resumo.diasComPendencia > 0 ? (
                            <span className="font-bold text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {resumo.diasComPendencia} pendente
                              {resumo.diasComPendencia > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-semibold">Sem pendências</span>
                          )}
                        </div>

                        {/* Ações */}
                        <div
                          className={`grid gap-2 ${podeEditarCadastros ? 'grid-cols-2' : 'grid-cols-1'}`}
                        >
                          <button
                            type="button"
                            id={`botao-espelho-${resumo.colaborador.id}`}
                            onClick={() => setDetalheId(resumo.colaborador.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--c-acento)] hover:brightness-110 text-[var(--c-sobre-acento)] font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                          >
                            <CalendarRange className="w-3.5 h-3.5" />
                            <span>Espelho</span>
                          </button>

                          {podeEditarCadastros && (
                            <button
                              type="button"
                              id={`botao-cadastro-rh-${resumo.colaborador.id}`}
                              onClick={() => setColaboradorEmCadastro(resumo.colaborador)}
                              className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                            >
                              <UserCog className="w-3.5 h-3.5" />
                              <span>Cadastro</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* ---------- ESPELHO INDIVIDUAL ---------- */}
        {abaEfetiva === 'banco_horas' && detalhe && (
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setDetalheId(null)}
                className="text-xs font-bold text-[var(--c-acento)] flex items-center gap-1 hover:underline"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Voltar para a lista
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="botao-csv-individual"
                  onClick={() => baixarCsvDe(detalhe.colaborador.id, detalhe.colaborador.nome)}
                  className="py-2 px-3 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-acento)] flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  id="botao-imprimir-espelho-individual"
                  onClick={() => imprimirEspelho([detalhe.colaborador.id])}
                  className="py-2 px-3 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 active:scale-[0.99] flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir espelho
                </button>
              </div>
            </div>

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
                      <th className="text-left font-bold px-3 py-2 whitespace-nowrap">
                        Origem
                      </th>
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
                                    disabled={!podeCorrigirMarcacao}
                                    onClick={() =>
                                      podeCorrigirMarcacao &&
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
                                        : podeCorrigirMarcacao
                                        ? 'Clique para lançar ou corrigir'
                                        : 'Corrigir marcação é do RH. Avise o RH pelo chat.'
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

                            {/* Como cada ponto do dia foi comprovado */}
                            <td className="px-3 py-2 text-left">
                              <div className="flex flex-wrap gap-1">
                                {ORDEM_MARCACOES.map((tipo) => {
                                  const reg = jornada.marcacoes[tipo];
                                  if (!reg) return null;
                                  const ehAjuste = reg.metodo === 'ajuste_rh';
                                  return (
                                    <span
                                      key={tipo}
                                      title={
                                        ehAjuste
                                          ? `${ROTULO_MARCACAO[tipo]} · ajustada por ${reg.ajustadoPorNome}: ${reg.justificativa}`
                                          : `${ROTULO_MARCACAO[tipo]} · ${
                                              reg.metodo === 'qrcode'
                                                ? 'QR lido'
                                                : 'código digitado'
                                            } na loja ${reg.loja}`
                                      }
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                        ehAjuste
                                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                          : reg.metodo === 'codigo_manual'
                                          ? 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)] border-[var(--c-borda)]'
                                          : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                      }`}
                                    >
                                      {ehAjuste
                                        ? 'RH'
                                        : reg.metodo === 'codigo_manual'
                                        ? 'Código'
                                        : 'QR'}
                                    </span>
                                  );
                                })}
                              </div>
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
        {abaEfetiva === 'qrcodes' && (
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

      {/* Ficha funcional do colaborador, aberta pelos cartões da equipe */}
      <ModalCadastroColaborador
        colaborador={colaboradorEmCadastro}
        aoFechar={() => setColaboradorEmCadastro(null)}
        aoSalvar={(nome) => {
          exibirToast(`Cadastro de ${nome} atualizado.`);
          setVersaoDados((v) => v + 1);
        }}
      />

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
