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
 *
 * O BANCO DE HORAS É DA PESSOA, NÃO DO APARELHO. No modo rede as marcações
 * vivem no banco: quem bate a entrada no celular e a saída no computador tem
 * um único dia de trabalho, não dois. O armazenamento do navegador segue
 * servindo de cache para a leitura ser instantânea, mas quem decide é o banco
 * — inclusive recusando a batida repetida do mesmo passo, pela restrição
 * `unique (colaborador_id, data, tipo)`.
 */

import {
  TOLERANCIA_PONTO_PADRAO_MINUTOS,
  HORARIO_ENTRADA_PADRAO,
  INTERVALO_ALMOCO_PADRAO_MINUTOS,
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
  NIVEL_TI,
  NIVEL_GERENTE,
  NIVEL_LIDER_SETOR,
  cuidaDePessoas,
  AjusteJornada,
  EstadoAjuste,
  ROTULO_TIPO_AJUSTE,
  minutosComSinal,
} from '../tipos';
import { bancoDados } from './bancoDados';
import { linhasDeIdentificacao, contatoEmLinha } from './fichaColaborador';
import { temAlcadaSobre, regraAutomaticaDeAlcada } from './organograma';
import { nuvem } from './nuvem';
import { usandoNuvem } from './supabase';

const CHAVE_REGISTROS_PONTO = 'conecta_v4_registros_ponto';
const CHAVE_CODIGOS_PONTO = 'conecta_v4_codigos_ponto_loja';
const CHAVE_AJUSTES = 'conecta_v4_ajustes_jornada';
/** Rascunho do motivo entre a batida do meio do dia e o fechamento. */
const CHAVE_JUSTIFICATIVA_DO_DIA = 'conecta_v4_justificativa_do_dia';

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

  constructor() {
    // Quando o banco traz mudança de outro aparelho, as telas de ponto
    // precisam saber junto com o resto do sistema.
    if (usandoNuvem()) {
      nuvem.assinarAtualizacoes(() => this.notificar());
    }
  }

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

  /**
   * Código da loja. No modo rede ele vive no banco e é o mesmo em todos os
   * aparelhos — devolve `null` enquanto o RH não tiver publicado o da loja.
   * No modo local, nasce na primeira vez que alguém precisa dele.
   */
  obterCodigoDaLoja(loja: Loja): CodigoPontoLoja | null {
    const codigos = this.lerCodigos();
    const existente = codigos.find((c) => c.loja === loja);
    if (existente) return existente;
    if (usandoNuvem()) return null;

    const novo: CodigoPontoLoja = {
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
    };
    codigos.push(novo);
    this.gravarCodigos(codigos);
    return novo;
  }

  /** Códigos das lojas. No modo rede, apenas os que o banco já publicou. */
  obterTodosCodigos(): CodigoPontoLoja[] {
    return LOJAS_COM_PONTO.map((loja) => this.obterCodigoDaLoja(loja)).filter(
      (c): c is CodigoPontoLoja => !!c
    );
  }

  /**
   * Publica no banco o código das lojas que ainda não têm um. Só RH e
   * Administrador conseguem — para os demais a RLS recusa, e é justamente
   * isso que impede o código do cartaz de ser inventado no aparelho de quem
   * bate o ponto.
   */
  async garantirCodigosDasLojas(): Promise<void> {
    if (!usandoNuvem()) {
      this.obterTodosCodigos();
      return;
    }

    const publicados = this.lerCodigos();
    const faltando: CodigoPontoLoja[] = LOJAS_COM_PONTO.filter(
      (loja) => !publicados.some((c) => c.loja === loja)
    ).map((loja) => ({
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
    }));

    if (faltando.length === 0) return;
    if (await nuvem.provisionarCodigosPonto(faltando)) {
      await nuvem.sincronizarPonto();
    }
  }

  /**
   * Gera um código novo para a loja, invalidando o QR anterior. Usado quando o
   * cartaz é fotografado ou alguém passa a bater ponto de fora da loja.
   */
  async regenerarCodigoDaLoja(
    loja: Loja
  ): Promise<{ sucesso: boolean; codigo?: CodigoPontoLoja; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    if (!this.podeCuidarDoQrDaLoja(atual, loja)) {
      return {
        sucesso: false,
        erro:
          'Você só troca o cartaz da sua loja. Para outra unidade, procure o RH ou o gerente de lá.',
      };
    }

    const codigos = this.lerCodigos().filter((c) => c.loja !== loja);
    const novo: CodigoPontoLoja = {
      loja,
      codigo: gerarCodigoAleatorio(),
      atualizadoEm: new Date().toISOString(),
      atualizadoPorNome: atual.nome,
    };
    // O banco primeiro: um código que não subiu não pode valer no cartaz
    if (usandoNuvem()) {
      const res = await nuvem.salvarCodigoPonto(novo);
      if (!res.sucesso) {
        return { sucesso: false, erro: res.erro || 'Falha ao publicar o código no banco.' };
      }
    }

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

  /** Conteúdo gravado no QR impresso da loja; null se ainda não há código. */
  montarConteudoQr(loja: Loja): string | null {
    const codigo = this.obterCodigoDaLoja(loja);
    if (!codigo) return null;
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
  async registrarMarcacaoPorCodigo(
    conteudoLido: string,
    /**
     * O que o colaborador escreveu e anexou no ato, quando a batida caiu
     * fora da janela. Viaja junto até a apuração para o aprovador não ter
     * de adivinhar o motivo depois.
     */
    justificativa?: { motivo?: string; anexoCaminho?: string }
  ): Promise<{ sucesso: boolean; registro?: RegistroPonto; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    if (!bancoDados.estaAutenticado()) {
      return { sucesso: false, erro: 'Sessão expirada. Entre novamente para bater o ponto.' };
    }
    if (!atual.ativo) {
      return { sucesso: false, erro: 'Esta conta está desativada. Procure o RH.' };
    }

    // A jornada do dia pode ter avançado em outro aparelho. Antes de decidir
    // qual é a próxima marcação, busca o que o banco já tem.
    if (usandoNuvem()) {
      await nuvem.sincronizarPonto();
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

    // No modo rede quem confirma a batida é o banco. A restrição de um
    // registro por passo do dia vale para a pessoa, não para o aparelho:
    // é ela que impede a batida repetida vinda do celular e do computador.
    if (usandoNuvem()) {
      const res = await nuvem.salvarRegistroPonto(registro);
      if (res.duplicado) {
        await nuvem.sincronizarPonto();
        return {
          sucesso: false,
          erro: `${ROTULO_MARCACAO[proxima]} já foi registrada hoje, em outro aparelho.`,
        };
      }
      if (!res.sucesso) {
        return {
          sucesso: false,
          erro: 'Não foi possível gravar a marcação. Verifique a conexão e tente de novo.',
        };
      }
    }

    const registros = this.lerRegistros();
    registros.push(registro);
    this.gravarRegistros(registros);

    /**
     * Motivo dado numa batida do MEIO do dia (entrada atrasada, almoço
     * esticado) precisa sobreviver até o fechamento — é só lá que a
     * pendência nasce. Sem guardar, a pessoa escreveria a explicação na
     * entrada e o aprovador receberia o dia mudo às 18h.
     */
    if (justificativa?.motivo?.trim() || justificativa?.anexoCaminho) {
      this.guardarJustificativaDoDia(atual.id, data, justificativa);
    }

    // Fechou a jornada: levanta a diferença e manda para o responsável.
    // É aqui que o caminho começa — sem este passo, hora extra viraria saldo
    // sozinha e ninguém teria decidido nada.
    if (proxima === 'saida') {
      await this.apurarDia(atual.id, data, justificativa);
    }

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

  // --- APURAÇÃO DO DIA E APROVAÇÃO ---

  private lerAjustes(): AjusteJornada[] {
    try {
      const bruto = localStorage.getItem(CHAVE_AJUSTES);
      const lista = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }

  private gravarAjustes(ajustes: AjusteJornada[]): void {
    localStorage.setItem(CHAVE_AJUSTES, JSON.stringify(ajustes));
  }

  /** Apuração de um dia, se já existir. */
  obterAjusteDoDia(colaboradorId: string, data: string): AjusteJornada | null {
    return (
      this.lerAjustes().find((a) => a.colaboradorId === colaboradorId && a.data === data) || null
    );
  }

  /** Apurações do colaborador, da mais recente para a mais antiga. */
  obterAjustesDoColaborador(colaboradorId: string): AjusteJornada[] {
    return this.lerAjustes()
      .filter((a) => a.colaboradorId === colaboradorId)
      .sort((a, b) => b.data.localeCompare(a.data));
  }

  /**
   * Levanta a diferença do dia e manda para aprovação.
   *
   * Chamado quando a jornada fecha. A batida diz o que aconteceu; o saldo só
   * nasce depois que o responsável disser se a hora extra estava autorizada
   * ou se a saída mais cedo estava combinada. É este passo que faz o caminho
   * não ter atalho.
   *
   * Dia que bate certo com a carga contratada não gera nada — não há o que
   * decidir, e encher a fila do gerente com dias normais faria ele parar de
   * olhar a fila.
   */
  /**
   * A tolerância diária em vigor, em minutos.
   *
   * Vem da configuração da rede; o padrão sai do art. 58 §1º da CLT. Nunca
   * negativa: uma tolerância negativa faria TODO dia virar pendência, que é
   * exatamente o que ela existe para evitar.
   */
  /**
   * Guarda o motivo dado numa batida do meio do dia até o fechamento.
   *
   * Fica no aparelho de propósito: é rascunho de algumas horas, some quando
   * a apuração do dia o absorve, e não vale a pena ocupar linha no banco
   * para isso. Se a pessoa trocar de aparelho no meio do dia, o motivo
   * volta a ser pedido no fechamento — que é o comportamento certo.
   */
  private guardarJustificativaDoDia(
    colaboradorId: string,
    data: string,
    dados: { motivo?: string; anexoCaminho?: string }
  ): void {
    try {
      const bruto = localStorage.getItem(CHAVE_JUSTIFICATIVA_DO_DIA);
      const mapa = bruto ? JSON.parse(bruto) : {};
      const chave = `${colaboradorId}_${data}`;
      mapa[chave] = {
        motivo: dados.motivo?.trim() || mapa[chave]?.motivo,
        anexoCaminho: dados.anexoCaminho || mapa[chave]?.anexoCaminho,
      };
      localStorage.setItem(CHAVE_JUSTIFICATIVA_DO_DIA, JSON.stringify(mapa));
    } catch {
      // Sem armazenamento: o motivo será pedido de novo no fechamento
    }
  }

  private lerJustificativaDoDia(
    colaboradorId: string,
    data: string
  ): { motivo?: string; anexoCaminho?: string } | undefined {
    try {
      const bruto = localStorage.getItem(CHAVE_JUSTIFICATIVA_DO_DIA);
      if (!bruto) return undefined;
      return JSON.parse(bruto)[`${colaboradorId}_${data}`];
    } catch {
      return undefined;
    }
  }

  obterToleranciaMinutos(): number {
    const valor = bancoDados.obterConfiguracoes().toleranciaPontoMinutos;
    if (typeof valor !== 'number' || Number.isNaN(valor) || valor < 0) {
      return TOLERANCIA_PONTO_PADRAO_MINUTOS;
    }
    return Math.floor(valor);
  }

  /**
   * Esta batida, agora, exige motivo do colaborador?
   *
   * Chamada ANTES de confirmar. O dia só fecha na 4ª batida, então nem
   * sempre dá para conhecer a diferença agregada — e esperar as 4 para pedir
   * o motivo de um atraso óbvio de entrada seria pedir tarde demais, quando
   * a pessoa já não lembra o porquê.
   *
   * Por isso cada marcação é medida contra o que se espera dela:
   *
   *   entrada         → atraso sobre o horário de entrada da rede
   *   retorno almoço  → intervalo maior que o contratado
   *   saída           → a diferença do dia, que aí já é conhecida por inteiro
   *   saída p/ almoço → nunca: sair para almoçar cedo ou tarde não é jornada
   *                     a mais nem a menos; quem decide isso é o fechamento
   *                     do dia.
   */
  avaliarMarcacao(
    colaboradorId: string,
    tipo: TipoMarcacao,
    agora: Date = new Date()
  ): { precisaMotivo: boolean; minutos: number; descricao: string } {
    const semMotivo = { precisaMotivo: false, minutos: 0, descricao: '' };
    const tolerancia = this.obterToleranciaMinutos();
    const data = paraDataLocal(agora);
    const config = bancoDados.obterConfiguracoes();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

    if (tipo === 'saida_almoco') return semMotivo;

    if (tipo === 'entrada') {
      // Fim de semana não tem horário de entrada a cumprir
      if (ehFimDeSemana(data)) return semMotivo;

      const [h, m] = (config.horarioEntradaPadrao || HORARIO_ENTRADA_PADRAO)
        .split(':')
        .map(Number);
      if (!Number.isInteger(h) || !Number.isInteger(m)) return semMotivo;

      const atraso = minutosAgora - (h * 60 + m);
      if (atraso <= tolerancia) return semMotivo;
      return {
        precisaMotivo: true,
        minutos: atraso,
        descricao: `Entrada ${formatarMinutos(atraso)} depois do horário (${
          config.horarioEntradaPadrao || HORARIO_ENTRADA_PADRAO
        }).`,
      };
    }

    if (tipo === 'retorno_almoco') {
      const jornada = this.obterJornadaDoDia(colaboradorId, data);
      const saida = jornada.marcacoes.saida_almoco;
      if (!saida) return semMotivo;

      const saiuEm = new Date(saida.horario);
      const intervalo = minutosAgora - (saiuEm.getHours() * 60 + saiuEm.getMinutes());
      const contratado =
        config.intervaloAlmocoPadraoMinutos ?? INTERVALO_ALMOCO_PADRAO_MINUTOS;

      const excedente = intervalo - contratado;
      if (excedente <= tolerancia) return semMotivo;
      return {
        precisaMotivo: true,
        minutos: excedente,
        descricao: `Intervalo de ${formatarMinutos(intervalo)} — ${formatarMinutos(
          excedente
        )} além do contratado.`,
      };
    }

    // saída: o dia inteiro já é conhecido, então mede-se a diferença real
    const jornada = this.obterJornadaDoDia(colaboradorId, data);
    const entrada = jornada.marcacoes.entrada;
    if (!entrada) return semMotivo;

    const entrouEm = new Date(entrada.horario);
    const trabalhado =
      minutosAgora -
      (entrouEm.getHours() * 60 + entrouEm.getMinutes()) -
      jornada.minutosIntervalo;
    const diferenca = trabalhado - jornada.minutosPrevistos;

    if (Math.abs(diferenca) <= tolerancia) return semMotivo;
    return {
      precisaMotivo: true,
      minutos: Math.abs(diferenca),
      descricao:
        diferenca > 0
          ? `${formatarMinutos(diferenca)} além da jornada prevista.`
          : `${formatarMinutos(Math.abs(diferenca))} a menos que a jornada prevista.`,
    };
  }

  async apurarDia(
    colaboradorId: string,
    data: string,
    dadosDoColaborador?: { motivo?: string; anexoCaminho?: string }
  ): Promise<{ criou: boolean; ajuste?: AjusteJornada }> {
    const jornada = this.obterJornadaDoDia(colaboradorId, data);
    if (!jornada.completa) return { criou: false };

    const diferenca = jornada.minutosTrabalhados - jornada.minutosPrevistos;
    const existente = this.obterAjusteDoDia(colaboradorId, data);

    // Dia certo: nada a decidir. Se havia apuração pendente de uma versão
    // anterior do dia, ela perde sentido e sai da fila.
    if (diferenca === 0) {
      if (existente && existente.estado === 'pendente') {
        await this.removerAjuste(existente.id);
      }
      return { criou: false };
    }

    // Já decidido: não reabre sozinho. Quem corrige marcação depois da
    // decisão é o RH, e aí a decisão é dele.
    if (existente && existente.estado !== 'pendente') return { criou: false };

    /**
     * A TOLERÂNCIA.
     *
     * Dentro dela a diferença entra no banco sem passar por ninguém. Fora
     * dela, o dia inteiro vira pendência com o valor CHEIO — não se desconta
     * a tolerância do excedente. É tudo-ou-nada por dia, como manda o art.
     * 58 §1º da CLT: ou a variação é desprezível, ou o dia é extraordinário.
     *
     * Sem isto, qualquer minuto virava fila: ~1.800 aprovações por mês numa
     * rede de 85 pessoas que batem ponto. Fila desse tamanho vira carimbo, e
     * aprovação que vira carimbo não controla nada.
     */
    const dentroDaTolerancia = Math.abs(diferenca) <= this.obterToleranciaMinutos();
    const guardada = this.lerJustificativaDoDia(colaboradorId, data);
    const agora = new Date().toISOString();

    const ajuste: AjusteJornada = {
      id: existente?.id || `ajuste-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      colaboradorId,
      data,
      tipo: diferenca > 0 ? 'hora_extra' : 'debito',
      minutos: Math.abs(diferenca),
      minutosTrabalhados: jornada.minutosTrabalhados,
      minutosPrevistos: jornada.minutosPrevistos,
      estado: dentroDaTolerancia ? 'aprovado' : 'pendente',
      origem: dentroDaTolerancia ? 'tolerancia_automatica' : 'pendencia',
      // Sem aprovadorId: ninguém carimbou. O nome existe para o espelho
      // conseguir dizer que aquilo foi regra, e não decisão de gente.
      aprovadorNome: dentroDaTolerancia ? 'Tolerância automática' : undefined,
      decididoEm: dentroDaTolerancia ? agora : undefined,
      motivoColaborador:
        dadosDoColaborador?.motivo?.trim() ||
        guardada?.motivo ||
        existente?.motivoColaborador,
      anexoCaminho:
        dadosDoColaborador?.anexoCaminho ||
        guardada?.anexoCaminho ||
        existente?.anexoCaminho,
      criadoEm: existente?.criadoEm || agora,
    };

    if (usandoNuvem()) {
      const res = await nuvem.salvarAjuste(ajuste);
      if (!res.sucesso) return { criou: false };
    }

    const lista = this.lerAjustes().filter((a) => a.id !== ajuste.id);
    lista.push(ajuste);
    this.gravarAjustes(lista);
    this.notificar();

    return { criou: true, ajuste };
  }

  private async removerAjuste(id: string): Promise<void> {
    this.gravarAjustes(this.lerAjustes().filter((a) => a.id !== id));
    this.notificar();
  }

  /**
   * Eu respondo pela jornada desta pessoa?
   *
   * Espelha a regra que vale no banco. Aqui ela serve para a tela não
   * oferecer um botão que o banco vai recusar — quem manda é a RLS.
   */
  podeDecidirSobre(solicitante: Colaborador): boolean {
    const eu = bancoDados.obterColaboradorAtual();

    // Quem decide é o organograma; a regra automática (líder do setor,
    // gerente da loja) só entra onde ele cala — para quem ainda não foi
    // posicionado na cadeia.
    return temAlcadaSobre(
      eu,
      solicitante,
      bancoDados.obterColaboradores(),
      regraAutomaticaDeAlcada
    );
  }

  /** Fila de quem aguarda decisão minha, da mais antiga para a mais nova. */
  obterPendenciasParaDecidir(): { ajuste: AjusteJornada; colaborador: Colaborador }[] {
    return this.lerAjustes()
      .filter((a) => a.estado === 'pendente')
      .map((ajuste) => ({
        ajuste,
        colaborador: bancoDados.obterColaboradorPorId(ajuste.colaboradorId),
      }))
      .filter(
        (item): item is { ajuste: AjusteJornada; colaborador: Colaborador } =>
          !!item.colaborador && this.podeDecidirSobre(item.colaborador)
      )
      .sort((a, b) => a.ajuste.data.localeCompare(b.ajuste.data));
  }

  /** Aprova ou recusa. Só entra no banco de horas o que for aprovado. */
  async decidirAjuste(
    ajusteId: string,
    aprovado: boolean,
    observacao?: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const eu = bancoDados.obterColaboradorAtual();
    const ajuste = this.lerAjustes().find((a) => a.id === ajusteId);
    if (!ajuste) return { sucesso: false, erro: 'Apuração não encontrada.' };

    const solicitante = bancoDados.obterColaboradorPorId(ajuste.colaboradorId);
    if (!solicitante || !this.podeDecidirSobre(solicitante)) {
      return {
        sucesso: false,
        erro: 'Você não responde por esta pessoa. A decisão cabe ao líder do setor ou ao gerente da loja.',
      };
    }

    if (!aprovado && !observacao?.trim()) {
      return { sucesso: false, erro: 'Informe o motivo da recusa.' };
    }

    const estado: EstadoAjuste = aprovado ? 'aprovado' : 'recusado';

    if (usandoNuvem()) {
      const res = await nuvem.decidirAjuste(
        ajusteId,
        estado,
        { id: eu.id, nome: eu.nome },
        observacao
      );
      if (!res.sucesso) return res;
    }

    const lista = this.lerAjustes().map((a) =>
      a.id === ajusteId
        ? {
            ...a,
            estado,
            aprovadorId: eu.id,
            aprovadorNome: eu.nome,
            decididoEm: new Date().toISOString(),
            observacao: observacao?.trim() || undefined,
          }
        : a
    );
    this.gravarAjustes(lista);

    bancoDados.registrarAuditoria(
      aprovado ? 'Aprovação de Jornada' : 'Recusa de Jornada',
      'seguranca',
      `${eu.nome} ${aprovado ? 'aprovou' : 'recusou'} ${formatarMinutos(ajuste.minutos)} de ${
        ROTULO_TIPO_AJUSTE[ajuste.tipo].toLowerCase()
      } de ${solicitante.nome} em ${formatarDataBR(ajuste.data)}.${
        observacao ? ` Motivo: ${observacao.trim()}` : ''
      }`
    );
    this.notificar();
    return { sucesso: true };
  }

  /**
   * Saldo total do colaborador no banco de horas.
   *
   * Conta SÓ O QUE FOI APROVADO. A jornada que fechou fora da carga fica
   * pendente até alguém decidir — hora extra não autorizada não vira crédito,
   * e saída mais cedo não combinada não vira desconto por conta própria.
   */
  obterSaldoAcumulado(colaboradorId: string): number {
    return this.lerAjustes()
      .filter((a) => a.colaboradorId === colaboradorId && a.estado === 'aprovado')
      .reduce((total, a) => total + minutosComSinal(a), 0);
  }

  /** O que está esperando decisão, em minutos com sinal. */
  obterSaldoPendente(colaboradorId: string): number {
    return this.lerAjustes()
      .filter((a) => a.colaboradorId === colaboradorId && a.estado === 'pendente')
      .reduce((total, a) => total + minutosComSinal(a), 0);
  }

  /** Saldo apurado pelas batidas, antes de qualquer decisão. */
  obterSaldoApuradoPelasBatidas(colaboradorId: string): number {
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
    return cuidaDePessoas(colaborador);
  }

  /**
   * Quem publica e troca o código do cartaz de ponto de uma loja.
   *
   * RH, Diretoria e TI cuidam das cinco. O gerente cuida da DELE, e só —
   * trocar o código de outra unidade derrubaria o ponto de gente por quem
   * ele não responde.
   *
   * O líder de setor fica de fora: o cartaz é da loja, não do setor, e a
   * liderança de Compras atua em todas elas.
   */
  podeCuidarDoQrDaLoja(colaborador: Colaborador, loja: Loja): boolean {
    if (cuidaDePessoas(colaborador)) return true;
    return colaborador.nivel >= NIVEL_GERENTE && colaborador.loja === loja;
  }

  /** As lojas cujo cartaz esta pessoa pode ver e trocar. */
  lojasComQrQuePosso(colaborador: Colaborador): Loja[] {
    return LOJAS_COM_PONTO.filter((loja) => this.podeCuidarDoQrDaLoja(colaborador, loja));
  }

  /**
   * Colaboradores que o usuário logado pode acompanhar.
   *
   * É EXATAMENTE quem ele pode aprovar, mais ele mesmo. Antes esta lista
   * tinha a própria regra — o gerente aprovava pela cadeia mas enxergava a
   * loja inteira, e via saldo de gente sobre quem não decidia nada. Quem
   * aprova acompanha; quem não aprova não acompanha.
   *
   * Isso faz o organograma valer aqui também: pessoa posicionada só aparece
   * para a cadeia dela (e para RH, Diretoria e TI).
   */
  obterColaboradoresVisiveis(): Colaborador[] {
    const atual = bancoDados.obterColaboradorAtual();
    const todos = bancoDados.obterColaboradores().filter((c) => c.ativo);

    // RH, Diretoria e TI: a rede inteira
    if (cuidaDePessoas(atual)) return todos;

    // A própria pessoa sempre se vê: é o extrato dela
    return todos.filter(
      (c) =>
        c.id === atual.id ||
        temAlcadaSobre(atual, c, todos, regraAutomaticaDeAlcada)
    );
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
  async ajustarMarcacao(dados: {
    colaboradorId: string;
    data: string;
    tipo: TipoMarcacao;
    hora: string; // "HH:MM"
    justificativa: string;
  }): Promise<{ sucesso: boolean; registro?: RegistroPonto; erro?: string }> {
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

    // Corrigir exige saber o que está gravado agora: se a pessoa bateu o ponto
    // enquanto o RH tinha a tela aberta, o cache antigo criaria uma segunda
    // marcação em vez de corrigir a que existe.
    if (usandoNuvem()) {
      await nuvem.sincronizarPonto();
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

    if (usandoNuvem()) {
      const res = await nuvem.salvarAjustePonto(registroAjustado);
      if (!res.sucesso) {
        return {
          sucesso: false,
          erro: 'Não foi possível gravar o ajuste no banco. Verifique a conexão.',
        };
      }
    }

    if (indice !== -1) {
      registros[indice] = registroAjustado;
    } else {
      registros.push(registroAjustado);
    }
    this.gravarRegistros(registros);

    // Corrigir marcação muda o dia: a apuração é refeita para a fila do
    // responsável refletir o horário certo, e não o que estava errado.
    await this.apurarDia(dados.colaboradorId, dados.data);

    bancoDados.registrarAuditoria(
      indice !== -1 ? 'Correção de Ponto' : 'Lançamento Manual de Ponto',
      'seguranca',
      `${atual.nome} ${indice !== -1 ? 'corrigiu' : 'lançou'} ${ROTULO_MARCACAO[dados.tipo].toLowerCase()} de ${colaborador.nome} em ${formatarDataBR(dados.data)} para ${registroAjustado.horaFormatada}. Motivo: ${registroAjustado.justificativa}`
    );
    this.notificar();
    return { sucesso: true, registro: registroAjustado };
  }

  /** Remove uma marcação lançada por engano. Só RH/Administrador. */
  async removerMarcacao(
    registroId: string,
    justificativa: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
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

    if (usandoNuvem()) {
      const res = await nuvem.removerRegistroPonto(registroId);
      if (!res.sucesso) {
        return {
          sucesso: false,
          erro: 'Não foi possível remover a marcação no banco. Verifique a conexão.',
        };
      }
    }

    this.gravarRegistros(registros.filter((r) => r.id !== registroId));

    bancoDados.registrarAuditoria(
      'Remoção de Marcação de Ponto',
      'seguranca',
      `${atual.nome} removeu ${ROTULO_MARCACAO[alvo.tipo].toLowerCase()} de ${colaborador?.nome || 'colaborador removido'} em ${formatarDataBR(alvo.data)}. Motivo: ${justificativa.trim()}`
    );
    this.notificar();
    return { sucesso: true };
  }

  /**
   * Apaga os registros de um colaborador removido do sistema. No modo rede o
   * banco já elimina as marcações junto com a ficha (`on delete cascade`);
   * aqui só resta limpar o cache deste aparelho.
   */
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
    /**
     * A identificação da pessoa vai em TODA linha, não só no nome.
     *
     * O arquivo costuma ser aberto na planilha e filtrado por unidade ou por
     * empregador. Sem matrícula e CNPJ em cada linha, quem recebe tem que
     * cruzar com outra fonte para saber de quem é cada jornada — e é
     * justamente esse cruzamento manual que gera erro em documento
     * trabalhista.
     */
    const linhas: string[] = [
      'Colaborador;Matricula;CNPJ;Cargo;Loja;Setor;Data;Entrada;Saida almoco;Retorno almoco;Saida;Trabalhado;Previsto;Saldo do dia',
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
            resumo.colaborador.matricula || '',
            resumo.colaborador.cnpj || '',
            resumo.colaborador.cargo,
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

        // A identificação vem da ficha, não de uma lista escrita aqui. É o
        // que garante que campo novo no cadastro (o CNPJ foi o último)
        // apareça no documento sem ninguém lembrar de vir editar isto.
        const responsavel = c.responsavelId
          ? bancoDados.obterColaboradorPorId(c.responsavelId) || null
          : null;
        const camposDaIdentificacao = linhasDeIdentificacao(c, responsavel).map((campo) =>
          campo.chave === 'jornada'
            ? // A jornada do documento é a que vale de fato: sem o contratado
              // preenchido, corre a carga padrão da rede, e o espelho tem de
              // dizer contra qual jornada o saldo foi apurado.
              { ...campo, valor: `${formatarMinutos(jornadaContratada)} por dia útil` }
            : campo
        );
        camposDaIdentificacao.push(
          { chave: 'contato', rotulo: 'Contato', valor: contatoEmLinha(c) },
          { chave: 'emissao', rotulo: 'Emitido em', valor: formatarDataBR(dataDeHoje()) }
        );

        const identificacaoEmLinhas = camposDaIdentificacao
          .reduce<string[]>((linhas, campo, indice) => {
            const celula = `<td><strong>${escapar(campo.rotulo)}:</strong> ${escapar(
              campo.valor || '—'
            )}</td>`;
            if (indice % 2 === 0) linhas.push(`<tr>${celula}`);
            else linhas[linhas.length - 1] += `${celula}</tr>`;
            return linhas;
          }, [])
          // Número ímpar de campos deixaria a última linha aberta
          .map((linha) => (linha.endsWith('</tr>') ? linha : `${linha}<td></td></tr>`))
          .join('\n');

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
            ${identificacaoEmLinhas}
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
