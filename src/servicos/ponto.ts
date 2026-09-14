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

  /** Exportação do espelho de ponto do período em CSV. */
  gerarCsvDoPeriodo(dataInicio: string, dataFim: string): string {
    const linhas: string[] = [
      'Colaborador;Loja;Setor;Data;Entrada;Saida almoco;Retorno almoco;Saida;Trabalhado;Previsto;Saldo do dia',
    ];

    for (const resumo of this.obterResumoDoPeriodo(dataInicio, dataFim)) {
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
}

export const servicoPonto = new ServicoPonto();
