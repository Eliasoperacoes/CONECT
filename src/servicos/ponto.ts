/**
 * Banco de Horas e Registro de Ponto do CONECTA — Malachias Autopeças
 *
 * O funcionário comprova a marcação lendo o QR afixado na sua loja (ou digitando
 * o código impresso embaixo dele, quando a câmera falha). O sistema decide
 * sozinho qual das quatro marcações do dia está sendo batida, então para o
 * funcionário é sempre um toque só.
 *
 * Nenhuma marcação é apagada: correções do RH entram como novo valor no mesmo
 * registro, sempre com justificativa e autoria.
 */

import {
  Colaborador,
  CodigoPontoLoja,
  JornadaDia,
  Loja,
  MetodoMarcacao,
  RegistroPonto,
  ResumoPontoColaborador,
  TipoMarcacao,
  ORDEM_MARCACOES,
  ROTULO_MARCACAO,
  CARGA_HORARIA_PADRAO_MINUTOS,
} from '../tipos';
import { bancoDados } from './bancoDados';

const CHAVE_REGISTROS_PONTO = 'conecta_v4_registros_ponto';
const CHAVE_CODIGOS_PONTO = 'conecta_v4_codigos_ponto_loja';

/** Lojas físicas que possuem QR de ponto ('Rede' é agrupador, não tem ponto). */
export const LOJAS_COM_PONTO: Loja[] = [
  'Pirassununga',
  'Porto Ferreira',
  'Palmeiras',
  'Descalvado',
  'Santa Rita',
];

/** Prefixo do conteúdo do QR, para não confundir com outros códigos. */
const PREFIXO_QR = 'CONECTA-PONTO';

// --- Utilidades de data e hora (fuso local, sem depender de UTC) ---

/** Data no formato AAAA-MM-DD a partir de um Date local. */
export const paraDataLocal = (data: Date): string => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

/** AAAA-MM-DD de hoje. */
export const dataDeHoje = (): string => paraDataLocal(new Date());

/** Converte AAAA-MM-DD em Date local ao meio-dia (evita viradas por fuso). */
export const deDataLocal = (data: string): Date => {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12, 0, 0);
};

/** "2026-09-14" -> "14/09/2026" */
export const formatarDataBR = (data: string): string => {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
};

/** "seg, 14/09" — rótulo curto para listas. */
export const formatarDiaCurto = (data: string): string => {
  const d = deDataLocal(data);
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const [, mes, dia] = data.split('-');
  return `${semana}, ${dia}/${mes}`;
};

/** Sábado e domingo não geram jornada prevista. */
export const ehFimDeSemana = (data: string): boolean => {
  const diaSemana = deDataLocal(data).getDay();
  return diaSemana === 0 || diaSemana === 6;
};

/** 95 -> "1h35"; -95 -> "-1h35"; 0 -> "0h00" */
export const formatarMinutos = (minutos: number): string => {
  const sinal = minutos < 0 ? '-' : '';
  const absoluto = Math.abs(Math.round(minutos));
  const horas = Math.floor(absoluto / 60);
  const resto = absoluto % 60;
  return `${sinal}${horas}h${String(resto).padStart(2, '0')}`;
};

/** Saldo com sinal explícito, como se lê num extrato: "+2h10" / "-0h45". */
export const formatarSaldo = (minutos: number): string => {
  const arredondado = Math.round(minutos);
  if (arredondado === 0) return '0h00';
  return arredondado > 0 ? `+${formatarMinutos(arredondado)}` : formatarMinutos(arredondado);
};

/** Lista de datas AAAA-MM-DD entre dois dias, inclusive. */
export const listarDatasDoPeriodo = (dataInicio: string, dataFim: string): string[] => {
  const datas: string[] = [];
  const fim = deDataLocal(dataFim);
  let atual = deDataLocal(dataInicio);
  let limite = 0;
  while (atual <= fim && limite < 400) {
    datas.push(paraDataLocal(atual));
    atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + 1, 12);
    limite++;
  }
  return datas;
};

/** Primeiro dia do mês corrente. */
export const primeiroDiaDoMes = (referencia: Date = new Date()): string =>
  paraDataLocal(new Date(referencia.getFullYear(), referencia.getMonth(), 1));

const gerarCodigoAleatorio = (): string => {
  // Sem 0/O e 1/I para não gerar dúvida na hora de digitar da placa impressa
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 6; i++) {
    codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return codigo;
};

class ServicoPonto {
  private ouvintes: Array<() => void> = [];

  /** Assina mudanças no ponto (marcações e códigos de loja). */
  assinarAlteracoes(ouvinte: () => void): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      this.ouvintes = this.ouvintes.filter((o) => o !== ouvinte);
    };
  }

  private notificar(): void {
    this.ouvintes.forEach((ouvinte) => ouvinte());
  }

  // --- CÓDIGOS DE PONTO DAS LOJAS ---

  private lerCodigos(): CodigoPontoLoja[] {
    try {
      const bruto = localStorage.getItem(CHAVE_CODIGOS_PONTO);
      const lista = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }

  private gravarCodigos(codigos: CodigoPontoLoja[]): void {
    localStorage.setItem(CHAVE_CODIGOS_PONTO, JSON.stringify(codigos));
  }

  /** Código da loja, criado na primeira vez que alguém precisa dele. */
  obterCodigoDaLoja(loja: Loja): CodigoPontoLoja {
    const codigos = this.lerCodigos();
    const existente = codigos.find((c) => c.loja === loja);
    if (existente) return existente;

    const novo: CodigoPontoLoja = {
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
    };
    codigos.push(novo);
    this.gravarCodigos(codigos);
    return novo;
  }

  /** Todos os códigos, garantindo que as cinco lojas tenham o seu. */
  obterTodosCodigos(): CodigoPontoLoja[] {
    return LOJAS_COM_PONTO.map((loja) => this.obterCodigoDaLoja(loja));
  }

  /**
   * Gera um código novo para a loja, invalidando o QR anterior. Usado quando o
   * cartaz é fotografado ou alguém passa a bater ponto de fora da loja.
   */
  regenerarCodigoDaLoja(loja: Loja): { sucesso: boolean; codigo?: CodigoPontoLoja; erro?: string } {
    const atual = bancoDados.obterColaboradorAtual();
    if (!this.podeAcessarPainelRH(atual)) {
      return { sucesso: false, erro: 'Apenas RH e Administrador podem gerar um novo código.' };
    }

    const codigos = this.lerCodigos().filter((c) => c.loja !== loja);
    const novo: CodigoPontoLoja = {
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
      atualizadoPorNome: atual.nome,
    };
    codigos.push(novo);
    this.gravarCodigos(codigos);

    bancoDados.registrarAuditoria(
      'Novo Código de Ponto',
      'seguranca',
      `${atual.nome} gerou um novo código de ponto para a loja ${loja}.`
    );
    this.notificar();
    return { sucesso: true, codigo: novo };
  }

  /** Conteúdo gravado no QR impresso da loja. */
  montarConteudoQr(loja: Loja): string {
    const codigo = this.obterCodigoDaLoja(loja);
    return `${PREFIXO_QR}:${loja}:${codigo.codigo}`;
  }

  /**
   * Aceita tanto o conteúdo completo do QR quanto o código de 6 caracteres
   * digitado à mão, e devolve a loja correspondente.
   */
  private resolverLojaDoCodigo(
    conteudo: string
  ): { loja: Loja; metodo: MetodoMarcacao } | null {
    const limpo = conteudo.trim();
    if (!limpo) return null;

    if (limpo.toUpperCase().startsWith(`${PREFIXO_QR}:`)) {
      const partes = limpo.split(':');
      if (partes.length < 3) return null;
      const loja = partes[1] as Loja;
      const codigo = partes[2].toUpperCase();
      const oficial = this.lerCodigos().find((c) => c.loja === loja);
      if (!oficial || oficial.codigo.toUpperCase() !== codigo) return null;
      return { loja, metodo: 'qrcode' };
    }

    const digitado = limpo.toUpperCase().replace(/\s/g, '');
    const porCodigo = this.obterTodosCodigos().find((c) => c.codigo.toUpperCase() === digitado);
    return porCodigo ? { loja: porCodigo.loja, metodo: 'codigo_manual' } : null;
  }

  // --- REGISTROS ---

  private lerRegistros(): RegistroPonto[] {
    try {
      const bruto = localStorage.getItem(CHAVE_REGISTROS_PONTO);
      const lista = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }

  private gravarRegistros(registros: RegistroPonto[]): void {
    localStorage.setItem(CHAVE_REGISTROS_PONTO, JSON.stringify(registros));
  }

  /** Marcações de um colaborador num dia, na ordem da jornada. */
  obterMarcacoesDoDia(colaboradorId: string, data: string): RegistroPonto[] {
    return this.lerRegistros()
      .filter((r) => r.colaboradorId === colaboradorId && r.data === data)
      .sort(
        (a, b) => ORDEM_MARCACOES.indexOf(a.tipo) - ORDEM_MARCACOES.indexOf(b.tipo)
      );
  }

  /**
   * Qual marcação vem agora para esta pessoa hoje. Devolve null quando a
   * jornada do dia já está completa.
   */
  obterProximaMarcacao(colaboradorId: string, data: string = dataDeHoje()): TipoMarcacao | null {
    const registradas = this.obterMarcacoesDoDia(colaboradorId, data).map((r) => r.tipo);
    return ORDEM_MARCACOES.find((tipo) => !registradas.includes(tipo)) || null;
  }

  /** Rótulo do próximo passo, pronto para o botão da tela. */
  obterRotuloProximaMarcacao(colaboradorId: string, data: string = dataDeHoje()): string | null {
    const proxima = this.obterProximaMarcacao(colaboradorId, data);
    return proxima ? ROTULO_MARCACAO[proxima] : null;
  }

  /**
   * Registra a marcação do usuário logado a partir do QR lido (ou do código
   * digitado). O tipo não é escolhido pelo funcionário: é sempre o próximo
   * passo pendente da jornada do dia.
   */
  registrarMarcacaoPorCodigo(
    conteudoLido: string
  ): { sucesso: boolean; registro?: RegistroPonto; erro?: string } {
    const atual = bancoDados.obterColaboradorAtual();
    if (!bancoDados.estaAutenticado()) {
      return { sucesso: false, erro: 'Sessão expirada. Entre novamente para bater o ponto.' };
    }
    if (!atual.ativo) {
      return { sucesso: false, erro: 'Esta conta está desativada. Procure o RH.' };
    }

    const resolvido = this.resolverLojaDoCodigo(conteudoLido);
    if (!resolvido) {
      return {
        sucesso: false,
        erro: 'Código não reconhecido. Use o QR afixado na sua loja.',
      };
    }

    const agora = new Date();
    const data = paraDataLocal(agora);
    const proxima = this.obterProximaMarcacao(atual.id, data);
    if (!proxima) {
      return {
        sucesso: false,
        erro: 'Sua jornada de hoje já está completa. Procure o RH se precisar de ajuste.',
      };
    }

    const registro: RegistroPonto = {
      id: `ponto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      colaboradorId: atual.id,
      data,
      tipo: proxima,
      horario: agora.toISOString(),
      horaFormatada: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      metodo: resolvido.metodo,
      loja: resolvido.loja,
      criadoEm: agora.toISOString(),
    };

    const registros = this.lerRegistros();
    registros.push(registro);
    this.gravarRegistros(registros);

    bancoDados.registrarAuditoria(
      'Registro de Ponto',
      'sistema',
      `${atual.nome} registrou ${ROTULO_MARCACAO[proxima].toLowerCase()} às ${registro.horaFormatada} na loja ${resolvido.loja}.`
    );
    this.notificar();
    return { sucesso: true, registro };
  }

  // --- JORNADA E SALDO ---

  private cargaPrevistaEmMinutos(colaborador: Colaborador | undefined, data: string): number {
    if (ehFimDeSemana(data)) return 0;
    return colaborador?.cargaHorariaDiariaMinutos ?? CARGA_HORARIA_PADRAO_MINUTOS;
  }

  /** Consolida um dia: horas trabalhadas, intervalo e saldo contra a jornada. */
  obterJornadaDoDia(colaboradorId: string, data: string): JornadaDia {
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const registros = this.obterMarcacoesDoDia(colaboradorId, data);

    const marcacoes: Partial<Record<TipoMarcacao, RegistroPonto>> = {};
    registros.forEach((r) => {
      marcacoes[r.tipo] = r;
    });

    const minutosDe = (tipo: TipoMarcacao): number | null => {
      const reg = marcacoes[tipo];
      if (!reg) return null;
      const d = new Date(reg.horario);
      return d.getHours() * 60 + d.getMinutes();
    };

    const entrada = minutosDe('entrada');
    const saidaAlmoco = minutosDe('saida_almoco');
    const retornoAlmoco = minutosDe('retorno_almoco');
    const saida = minutosDe('saida');

    let minutosIntervalo = 0;
    if (saidaAlmoco !== null && retornoAlmoco !== null && retornoAlmoco > saidaAlmoco) {
      minutosIntervalo = retornoAlmoco - saidaAlmoco;
    }

    // Só conta jornada fechada: entrada e saída registradas
    let minutosTrabalhados = 0;
    if (entrada !== null && saida !== null && saida > entrada) {
      minutosTrabalhados = saida - entrada - minutosIntervalo;
    }

    const minutosPrevistos = this.cargaPrevistaEmMinutos(colaborador, data);
    const completa = ORDEM_MARCACOES.every((tipo) => !!marcacoes[tipo]);
    const emAndamento = entrada !== null && saida === null;

    // Dia sem nenhuma marcação em fim de semana não é falta nem saldo negativo;
    // dia útil sem jornada fechada também não gera saldo até o RH tratar.
    const saldoMinutos = minutosTrabalhados > 0 ? minutosTrabalhados - minutosPrevistos : 0;

    return {
      data,
      colaboradorId,
      marcacoes,
      minutosTrabalhados,
      minutosIntervalo,
      minutosPrevistos,
      saldoMinutos,
      completa,
      emAndamento,
    };
  }

  /** Jornadas de um período, um item por dia do intervalo. */
  obterJornadasDoPeriodo(colaboradorId: string, dataInicio: string, dataFim: string): JornadaDia[] {
    return listarDatasDoPeriodo(dataInicio, dataFim).map((data) =>
      this.obterJornadaDoDia(colaboradorId, data)
    );
  }

  /** Saldo total acumulado do colaborador desde a primeira marcação. */
  obterSaldoAcumulado(colaboradorId: string): number {
    const datas = Array.from(
      new Set(
        this.lerRegistros()
          .filter((r) => r.colaboradorId === colaboradorId)
          .map((r) => r.data)
      )
    );
    return datas.reduce(
      (total, data) => total + this.obterJornadaDoDia(colaboradorId, data).saldoMinutos,
      0
    );
  }

  /** Dias com marcação registrada, do mais recente para o mais antigo. */
  obterDatasComRegistro(colaboradorId: string): string[] {
    return Array.from(
      new Set(
        this.lerRegistros()
          .filter((r) => r.colaboradorId === colaboradorId)
          .map((r) => r.data)
      )
    ).sort((a, b) => b.localeCompare(a));
  }

  // --- PAINEL DE RH ---

  /** RH e Administrador enxergam o painel completo de banco de horas. */
  podeAcessarPainelRH(colaborador: Colaborador): boolean {
    return colaborador.nivel === 4 || colaborador.setor === 'RH';
  }

  /**
   * Colaboradores que o usuário logado pode acompanhar. Administrador e RH
   * veem a rede inteira; gestor (N3) vê apenas a própria loja.
   */
  obterColaboradoresVisiveis(): Colaborador[] {
    const atual = bancoDados.obterColaboradorAtual();
    const todos = bancoDados.obterColaboradores().filter((c) => c.ativo);

    if (this.podeAcessarPainelRH(atual)) return todos;
    if (atual.nivel >= 3) return todos.filter((c) => c.loja === atual.loja);
    return todos.filter((c) => c.id === atual.id);
  }

  /** Linhas consolidadas do painel de RH para o período escolhido. */
  obterResumoDoPeriodo(dataInicio: string, dataFim: string): ResumoPontoColaborador[] {
    const hoje = dataDeHoje();

    return this.obterColaboradoresVisiveis()
      .map((colaborador) => {
        const jornadas = this.obterJornadasDoPeriodo(colaborador.id, dataInicio, dataFim);

        const minutosTrabalhados = jornadas.reduce((t, j) => t + j.minutosTrabalhados, 0);
        const minutosPrevistos = jornadas
          .filter((j) => j.minutosTrabalhados > 0 || j.completa)
          .reduce((t, j) => t + j.minutosPrevistos, 0);
        const saldoPeriodoMinutos = jornadas.reduce((t, j) => t + j.saldoMinutos, 0);

        const diasCompletos = jornadas.filter((j) => j.completa).length;
        // Pendência: começou o dia e não fechou, ou dia útil passado sem jornada
        const diasComPendencia = jornadas.filter((j) => {
          if (j.completa) return false;
          const temAlgo = Object.keys(j.marcacoes).length > 0;
          if (temAlgo) return j.data !== hoje;
          return false;
        }).length;

        return {
          colaborador,
          jornadas,
          minutosTrabalhados,
          minutosPrevistos,
          saldoPeriodoMinutos,
          saldoAcumuladoMinutos: this.obterSaldoAcumulado(colaborador.id),
          diasCompletos,
          diasComPendencia,
          registrouHoje: this.obterMarcacoesDoDia(colaborador.id, hoje).length > 0,
        };
      })
      .sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome));
  }

  /**
   * Lança ou corrige uma marcação pelo RH. Exige justificativa e fica marcada
   * como ajuste, com o nome de quem alterou — nunca se confunde com uma
   * marcação feita pelo próprio funcionário no QR.
   */
  ajustarMarcacao(dados: {
    colaboradorId: string;
    data: string;
    tipo: TipoMarcacao;
    hora: string; // "HH:MM"
    justificativa: string;
  }): { sucesso: boolean; registro?: RegistroPonto; erro?: string } {
    const atual = bancoDados.obterColaboradorAtual();
    if (!this.podeAcessarPainelRH(atual)) {
      return { sucesso: false, erro: 'Apenas RH e Administrador podem ajustar marcações.' };
    }

    const colaborador = bancoDados.obterColaboradorPorId(dados.colaboradorId);
    if (!colaborador) {
      return { sucesso: false, erro: 'Colaborador não encontrado.' };
    }
    if (!dados.justificativa.trim()) {
      return { sucesso: false, erro: 'Informe a justificativa do ajuste.' };
    }

    const partes = dados.hora.split(':');
    const horas = Number(partes[0]);
    const minutos = Number(partes[1]);
    if (!Number.isInteger(horas) || !Number.isInteger(minutos) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
      return { sucesso: false, erro: 'Horário inválido. Use o formato HH:MM.' };
    }

    const base = deDataLocal(dados.data);
    const horario = new Date(base.getFullYear(), base.getMonth(), base.getDate(), horas, minutos, 0);

    const registros = this.lerRegistros();
    const indice = registros.findIndex(
      (r) => r.colaboradorId === dados.colaboradorId && r.data === dados.data && r.tipo === dados.tipo
    );

    const registroAjustado: RegistroPonto = {
      id: indice !== -1 ? registros[indice].id : `ponto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      colaboradorId: dados.colaboradorId,
      data: dados.data,
      tipo: dados.tipo,
      horario: horario.toISOString(),
      horaFormatada: `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`,
      metodo: 'ajuste_rh',
      loja: indice !== -1 ? registros[indice].loja : colaborador.loja,
      criadoEm: indice !== -1 ? registros[indice].criadoEm : new Date().toISOString(),
      ajustadoPorId: atual.id,
      ajustadoPorNome: atual.nome,
      justificativa: dados.justificativa.trim(),
    };

    if (indice !== -1) {
      registros[indice] = registroAjustado;
    } else {
      registros.push(registroAjustado);
    }
    this.gravarRegistros(registros);

    bancoDados.registrarAuditoria(
      indice !== -1 ? 'Correção de Ponto' : 'Lançamento Manual de Ponto',
      'seguranca',
      `${atual.nome} ${indice !== -1 ? 'corrigiu' : 'lançou'} ${ROTULO_MARCACAO[dados.tipo].toLowerCase()} de ${colaborador.nome} em ${formatarDataBR(dados.data)} para ${registroAjustado.horaFormatada}. Motivo: ${registroAjustado.justificativa}`
    );
    this.notificar();
    return { sucesso: true, registro: registroAjustado };
  }

  /** Remove uma marcação lançada por engano. Só RH/Administrador. */
  removerMarcacao(
    registroId: string,
    justificativa: string
  ): { sucesso: boolean; erro?: string } {
    const atual = bancoDados.obterColaboradorAtual();
    if (!this.podeAcessarPainelRH(atual)) {
      return { sucesso: false, erro: 'Apenas RH e Administrador podem remover marcações.' };
    }
    if (!justificativa.trim()) {
      return { sucesso: false, erro: 'Informe a justificativa da remoção.' };
    }

    const registros = this.lerRegistros();
    const alvo = registros.find((r) => r.id === registroId);
    if (!alvo) return { sucesso: false, erro: 'Marcação não encontrada.' };

    const colaborador = bancoDados.obterColaboradorPorId(alvo.colaboradorId);
    this.gravarRegistros(registros.filter((r) => r.id !== registroId));

    bancoDados.registrarAuditoria(
      'Remoção de Marcação de Ponto',
      'seguranca',
      `${atual.nome} removeu ${ROTULO_MARCACAO[alvo.tipo].toLowerCase()} de ${colaborador?.nome || 'colaborador removido'} em ${formatarDataBR(alvo.data)}. Motivo: ${justificativa.trim()}`
    );
    this.notificar();
    return { sucesso: true };
  }

  /** Apaga os registros de um colaborador removido do sistema. */
  removerRegistrosDoColaborador(colaboradorId: string): void {
    const registros = this.lerRegistros();
    const restantes = registros.filter((r) => r.colaboradorId !== colaboradorId);
    if (restantes.length !== registros.length) {
      this.gravarRegistros(restantes);
      this.notificar();
    }
  }

  /**
   * Exportação do espelho de ponto em CSV. Passando `colaboradorIds`, exporta
   * só quem está em tela (a loja aberta ou o resultado da busca).
   */
  gerarCsvDoPeriodo(dataInicio: string, dataFim: string, colaboradorIds?: string[]): string {
    const linhas: string[] = [
      'Colaborador;Loja;Setor;Data;Entrada;Saida almoco;Retorno almoco;Saida;Trabalhado;Previsto;Saldo do dia',
    ];

    const todos = this.obterResumoDoPeriodo(dataInicio, dataFim);
    const selecionados = colaboradorIds
      ? todos.filter((r) => colaboradorIds.includes(r.colaborador.id))
      : todos;

    for (const resumo of selecionados) {
      for (const jornada of resumo.jornadas) {
        const temAlgo = Object.keys(jornada.marcacoes).length > 0;
        if (!temAlgo) continue;

        linhas.push(
          [
            resumo.colaborador.nome,
            resumo.colaborador.loja,
            resumo.colaborador.setor,
            formatarDataBR(jornada.data),
            jornada.marcacoes.entrada?.horaFormatada || '',
            jornada.marcacoes.saida_almoco?.horaFormatada || '',
            jornada.marcacoes.retorno_almoco?.horaFormatada || '',
            jornada.marcacoes.saida?.horaFormatada || '',
            formatarMinutos(jornada.minutosTrabalhados),
            formatarMinutos(jornada.minutosPrevistos),
            formatarSaldo(jornada.saldoMinutos),
          ].join(';')
        );
      }
    }

    return linhas.join('\n');
  }

  /** Origem da marcação, por extenso, para o espelho impresso. */
  private descreverOrigem(registro: RegistroPonto): string {
    if (registro.metodo === 'ajuste_rh') {
      return `Ajuste RH — ${registro.ajustadoPorNome || 'RH'}${
        registro.justificativa ? `: ${registro.justificativa}` : ''
      }`;
    }
    if (registro.metodo === 'codigo_manual') return `Código digitado — ${registro.loja}`;
    return `QR — ${registro.loja}`;
  }

  /**
   * Espelho de ponto pronto para impressão, uma folha por colaborador.
   * Traz a jornada dia a dia, a origem de cada marcação, os totais do período
   * e as linhas de assinatura do colaborador e do responsável.
   */
  gerarHtmlEspelho(dataInicio: string, dataFim: string, colaboradorIds?: string[]): string {
    const todos = this.obterResumoDoPeriodo(dataInicio, dataFim);
    const selecionados = colaboradorIds
      ? todos.filter((r) => colaboradorIds.includes(r.colaborador.id))
      : todos;

    const escapar = (texto: string): string =>
      texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const folhas = selecionados
      .map((resumo) => {
        const c = resumo.colaborador;
        const jornadaContratada =
          c.cargaHorariaDiariaMinutos ?? CARGA_HORARIA_PADRAO_MINUTOS;

        // Só entram os dias com alguma marcação ou com jornada prevista
        const dias = resumo.jornadas.filter(
          (j) => Object.keys(j.marcacoes).length > 0 || j.minutosPrevistos > 0
        );

        const linhas = dias
          .map((j) => {
            const origens = ORDEM_MARCACOES.map((t) => j.marcacoes[t])
              .filter((r): r is RegistroPonto => !!r)
              .map((r) => `${ROTULO_MARCACAO[r.tipo]}: ${this.descreverOrigem(r)}`)
              .join(' | ');

            const celulas = ORDEM_MARCACOES.map((t) => {
              const reg = j.marcacoes[t];
              const ajuste = reg?.metodo === 'ajuste_rh' ? ' *' : '';
              return `<td class="hora">${reg ? reg.horaFormatada + ajuste : '--:--'}</td>`;
            }).join('');

            const semMarcacao = Object.keys(j.marcacoes).length === 0;

            return `<tr class="${semMarcacao ? 'vazio' : ''}">
              <td class="dia">${formatarDataBR(j.data)}<br><span class="semana">${formatarDiaCurto(j.data).split(',')[0]}</span></td>
              ${celulas}
              <td class="num">${formatarMinutos(j.minutosTrabalhados)}</td>
              <td class="num">${formatarMinutos(j.minutosPrevistos)}</td>
              <td class="num ${j.saldoMinutos < 0 ? 'neg' : ''}">${
                j.minutosTrabalhados === 0 ? '—' : formatarSaldo(j.saldoMinutos)
              }</td>
              <td class="origem">${escapar(origens)}</td>
            </tr>`;
          })
          .join('');

        return `<section class="folha">
          <header class="topo">
            <div>
              <h1>ESPELHO DE PONTO</h1>
              <p class="empresa">Malachias Autopeças · CONECTA</p>
            </div>
            <div class="periodo">
              <strong>Período apurado</strong><br>
              ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}
            </div>
          </header>

          <table class="ficha">
            <tr>
              <td><strong>Colaborador:</strong> ${escapar(c.nome)}</td>
              <td><strong>Matrícula:</strong> ${escapar(c.matricula || '—')}</td>
            </tr>
            <tr>
              <td><strong>Cargo:</strong> ${escapar(c.cargo)}</td>
              <td><strong>Setor:</strong> ${escapar(c.setor)}</td>
            </tr>
            <tr>
              <td><strong>Unidade:</strong> ${escapar(c.loja)}</td>
              <td><strong>Jornada contratada:</strong> ${formatarMinutos(jornadaContratada)} por dia útil</td>
            </tr>
            <tr>
              <td><strong>Admissão:</strong> ${escapar(c.dataAdmissao ? formatarDataBR(c.dataAdmissao) : '—')}</td>
              <td><strong>Emitido em:</strong> ${formatarDataBR(dataDeHoje())}</td>
            </tr>
          </table>

          <table class="marcacoes">
            <thead>
              <tr>
                <th>Data</th>
                <th>Entrada</th>
                <th>Saída<br>almoço</th>
                <th>Retorno<br>almoço</th>
                <th>Saída</th>
                <th>Trabalhado</th>
                <th>Previsto</th>
                <th>Saldo</th>
                <th>Origem das marcações</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>

          <table class="totais">
            <tr>
              <td>Total trabalhado no período</td>
              <td class="num">${formatarMinutos(resumo.minutosTrabalhados)}</td>
            </tr>
            <tr>
              <td>Total previsto no período</td>
              <td class="num">${formatarMinutos(resumo.minutosPrevistos)}</td>
            </tr>
            <tr class="destaque">
              <td>Saldo do período</td>
              <td class="num ${resumo.saldoPeriodoMinutos < 0 ? 'neg' : ''}">${formatarSaldo(
                resumo.saldoPeriodoMinutos
              )}</td>
            </tr>
            <tr class="destaque">
              <td>Saldo acumulado no banco de horas</td>
              <td class="num ${resumo.saldoAcumuladoMinutos < 0 ? 'neg' : ''}">${formatarSaldo(
                resumo.saldoAcumuladoMinutos
              )}</td>
            </tr>
          </table>

          <p class="nota">
            (*) Marcação lançada ou corrigida pelo RH, com justificativa registrada na coluna de
            origem e na auditoria do sistema.
          </p>

          <div class="assinaturas">
            <div><span class="linha"></span>Assinatura do colaborador</div>
            <div><span class="linha"></span>Responsável / RH</div>
          </div>
        </section>`;
      })
      .join('');

    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Espelho de Ponto — ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; color: #111; margin: 0; padding: 16px; background: #fff; }
  .folha { page-break-after: always; max-width: 1000px; margin: 0 auto 32px; }
  .folha:last-child { page-break-after: auto; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .topo h1 { font-size: 18px; margin: 0; letter-spacing: 1px; }
  .empresa { margin: 2px 0 0; font-size: 12px; color: #444; }
  .periodo { font-size: 12px; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  .ficha { margin-bottom: 12px; font-size: 12px; }
  .ficha td { border: 1px solid #bbb; padding: 5px 8px; width: 50%; }
  .marcacoes { font-size: 11px; }
  .marcacoes th { background: #eee; border: 1px solid #999; padding: 5px 4px; font-size: 10px; text-transform: uppercase; }
  .marcacoes td { border: 1px solid #bbb; padding: 4px; text-align: center; }
  .marcacoes .dia { text-align: left; white-space: nowrap; font-weight: 600; }
  .semana { font-weight: 400; color: #666; text-transform: capitalize; }
  .hora { font-family: ui-monospace, Consolas, monospace; }
  .num { font-family: ui-monospace, Consolas, monospace; text-align: right; padding-right: 8px; }
  .neg { color: #b00020; }
  .origem { text-align: left; font-size: 9px; color: #555; }
  .vazio td { color: #999; background: #fafafa; }
  .totais { margin-top: 12px; width: 60%; font-size: 12px; }
  .totais td { border: 1px solid #bbb; padding: 5px 8px; }
  .totais .destaque td { font-weight: 700; background: #f2f2f2; }
  .nota { font-size: 10px; color: #555; margin-top: 10px; }
  .assinaturas { display: flex; gap: 48px; margin-top: 44px; font-size: 11px; text-align: center; }
  .assinaturas div { flex: 1; }
  .linha { display: block; border-top: 1px solid #111; margin-bottom: 4px; }
  @media print {
    body { padding: 0; }
    @page { size: A4 landscape; margin: 12mm; }
  }
</style></head><body>${
      folhas || '<p>Nenhum colaborador no período selecionado.</p>'
    }</body></html>`;
  }
}

export const servicoPonto = new ServicoPonto();
