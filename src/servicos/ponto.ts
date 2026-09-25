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
  TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS,
  TURNO_SABADO,
  MINUTOS_SABADO,
  minutosDoTurno,
  turnoDe,
  Turno,
  minutosPausaDoTurno,
  minutosDeIntervaloDe,
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
  ehMarcacaoCorrigida,
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
  trabalhaNoSabado,
  temIntervaloNoDia,
  cargaSemanalDe,
} from '../tipos';
import { bancoDados } from './bancoDados';
import { podeUsar } from './permissoes';
/**
 * Importado com outro nome porque `agora` já é usado como nome de
 * variável local em vários pontos deste arquivo — e um `const agora`
 * dentro de uma função esconderia silenciosamente a função importada,
 * fazendo aquele trecho voltar a usar o relógio do aparelho sem que nada
 * acusasse.
 */
import { agora as agoraSincronizado } from './relogio';
import { linhasDeIdentificacao, contatoEmLinha } from './fichaColaborador';
import { temAlcadaSobre, regraAutomaticaDeAlcada } from './organograma';
// A FOLHA, nunca o serviço: importar `justificativas` daqui refecharia o
// ciclo que já derrubou o aplicativo uma vez
import { situacaoDoDia } from './justificativasCache';
import { feriadoEm } from './feriadosCache';
import { montarDocumento } from './documento';
import { nuvem } from './nuvem';
import { usandoNuvem } from './supabase';
import { lerLista } from './cacheDeLeitura';

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
/**
 * A DATA DE HOJE VEM DO RELÓGIO SINCRONIZADO, e não do aparelho.
 *
 * Antes saía de `new Date()`. Num celular de balcão — compartilhado, com
 * bateria velha e o relógio a três toques de qualquer um — isso queria
 * dizer que a batida valia o que o aparelho achasse que eram as horas.
 *
 * `agora()` devolve o relógio do aparelho corrigido pelo desvio medido
 * contra o servidor. Sem rede ele cai no aparelho e AVISA que caiu, em
 * vez de fingir precisão que não tem.
 */
export const dataDeHoje = (): string => paraDataLocal(agoraSincronizado());

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

/**
 * A rede trabalha de segunda a SÁBADO. Só domingo não tem jornada.
 *
 * Existia `ehFimDeSemana` tratando sábado como folga — e isso zerava o
 * previsto do sábado, fazendo as 4 horas trabalhadas virarem 4 horas extras
 * para a rede inteira, toda semana.
 */
export const ehDiaDeFolga = (data: string): boolean =>
  deDataLocal(data).getDay() === 0;

export const ehSabado = (data: string): boolean =>
  deDataLocal(data).getDay() === 6;

/**
 * As marcações que fecham o dia.
 *
 * Sábado tem DUAS: entra às 8 e sai ao meio-dia, sem intervalo. Exigir as
 * quatro deixaria todo sábado eternamente incompleto — e dia incompleto não
 * apura, então o sábado nunca entraria no banco de horas de ninguém.
 */
/**
 * Quais batidas se espera desta pessoa neste dia.
 *
 * ANTES OLHAVA SÓ A DATA, e era daí que vinha o defeito relatado: o
 * sistema cobrava de todo mundo quatro batidas e um sábado.
 *
 * Quem faz 6h direto, sem almoço, batia duas vezes e o dia ficava
 * eternamente "pela metade". Quem não vem ao sábado tinha todo sábado
 * marcado como dia não cumprido. Nenhum dos dois estava errado — a
 * pergunta é que estava.
 *
 * Sem pessoa, mantém o comportamento antigo: há chamadas que só sabem a
 * data, e para elas o dia comum da rede é a resposta certa.
 */
export const marcacoesEsperadas = (
  data: string,
  colaborador?: Colaborador
): TipoMarcacao[] => {
  /**
   * FERIADO FECHADO NÃO ESPERA BATIDA NENHUMA.
   *
   * Sem isto o dia entrava na conta de "dias sem fechar" e ia parar na
   * fila do responsável, pedindo decisão sobre um dia em que a loja
   * estava de portas fechadas.
   *
   * Meio expediente continua esperando entrada e saída: a pessoa veio,
   * só que menos tempo.
   */
  const feriado = feriadoEm(data, colaborador?.loja);
  if (feriado) return feriado.minutosPrevistos > 0 ? ['entrada', 'saida'] : [];

  /**
   * DOMINGO NÃO ESPERA BATIDA NENHUMA.
   *
   * Estava devolvendo as quatro, e o efeito era silencioso: todo domingo
   * passado entrava na lista de dias com pendência da semana, como se a
   * pessoa tivesse esquecido de bater num dia em que a loja nem abre.
   *
   * Trabalhar no domingo continua possível — é hora extra, e
   * `obterProximaMarcacao` cuida disso.
   */
  if (ehDiaDeFolga(data)) return [];

  if (ehSabado(data)) {
    // Não trabalha aos sábados: não há batida a esperar, e o dia não é dela
    if (colaborador && !trabalhaNoSabado(colaborador)) return [];
    return ['entrada', 'saida'];
  }

  if (colaborador && !temIntervaloNoDia(colaborador)) return ['entrada', 'saida'];

  return ORDEM_MARCACOES;
};

/**
 * O QUE ESCREVER NUMA CÉLULA QUE O DIA NÃO ESPERA.
 *
 * Devolve `null` quando a marcação é esperada — aí vale o horário, ou o
 * `--:--` de quem não bateu.
 *
 * Existe porque `--:--` tem UM significado só: "deveria ter batido e não
 * bateu". No sábado o almoço não existe — a loja abre às 8 e fecha ao
 * meio-dia, direto — e imprimir `--:--` ali fazia o espelho acusar duas
 * batidas esquecidas em todo sábado do mês. Num documento de ponto isso
 * não é detalhe de layout.
 *
 * Num lugar só porque a tela e o papel precisam dizer a MESMA coisa. Já
 * houve um caso neste sistema em que os dois divergiram.
 */
export const motivoSemMarcacao = (
  data: string,
  tipo: TipoMarcacao,
  colaborador?: Colaborador
): string | null => {
  if (marcacoesEsperadas(data, colaborador).includes(tipo)) return null;

  const feriado = feriadoEm(data, colaborador?.loja);
  if (feriado) return feriado.nome;

  if (ehDiaDeFolga(data)) return 'Domingo';
  if (ehSabado(data)) return 'Sábado';

  // Sobra quem não tem intervalo: estágio, nas colunas do almoço
  return 'Sem intervalo';
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

/**
 * O CICLO DE SÁBADO A SEXTA que contém esta data.
 *
 * É o ciclo da casa, e não uma semana de calendário. Eu havia feito de
 * segunda a domingo por conta própria, argumentando que assim o sábado
 * caía no fim — e estava errado: quem fecha o ciclo é a SEXTA, e o sábado
 * ABRE o seguinte.
 *
 * Faz sentido justamente por causa da conferência: quando o líder senta no
 * sábado para olhar o banco de horas, o ciclo que ele confere terminou na
 * véspera. Com o sábado no fim, ele estaria conferindo um ciclo que ainda
 * não acabou — o dia dele mesmo.
 */
export const semanaDe = (data: string): { inicio: string; fim: string } => {
  const referencia = deDataLocal(data);
  // getDay: 0 = domingo, 6 = sábado. O sábado é o primeiro dia do ciclo,
  // então ele recua zero e os outros recuam até chegar nele
  const diaDaSemana = referencia.getDay();
  const recuo = (diaDaSemana + 1) % 7;

  const inicio = new Date(referencia);
  inicio.setDate(inicio.getDate() - recuo);

  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);

  return { inicio: paraDataLocal(inicio), fim: paraDataLocal(fim) };
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
  /**
   * O conteúdo do cartaz: um ENDEREÇO, e não um texto solto.
   *
   * Antes o QR trazia "CONECTA-PONTO:Loja:ABC123". A câmera do celular lia
   * aquilo, mostrava o texto na tela e parava ali — a pessoa ainda tinha de
   * abrir o CONECTA na mão e procurar a aba de ponto.
   *
   * Agora é o endereço do próprio sistema com o código embutido. A câmera
   * oferece abrir; quem tem o aplicativo instalado cai direto nele, já
   * conectado, na aba de ponto. Quem não tem, cai no navegador — que é o
   * mesmo sistema.
   *
   * O endereço sai de onde o cartaz foi GERADO. Gerar o cartaz rodando o
   * sistema na própria máquina produziria um QR apontando para "localhost",
   * que não existe no celular de ninguém: por isso a tela do cartaz avisa
   * quando é esse o caso.
   */
  montarConteudoQr(loja: Loja): string | null {
    const codigo = this.obterCodigoDaLoja(loja);
    if (!codigo) return null;

    const carga = `${PREFIXO_QR}:${loja}:${codigo.codigo}`;

    if (typeof window === 'undefined') return carga;
    return `${window.location.origin}/?ponto=${encodeURIComponent(carga)}`;
  }

  /**
   * Aceita tanto o conteúdo completo do QR quanto o código de 6 caracteres
   * digitado à mão, e devolve a loja correspondente.
   */
  private resolverLojaDoCodigo(
    conteudo: string
  ): { loja: Loja; metodo: MetodoMarcacao } | null {
    let limpo = conteudo.trim();
    if (!limpo) return null;

    /**
     * ENDEREÇO TAMBÉM VALE, e o texto antigo continua valendo.
     *
     * Os cartazes já impressos e pregados nas cinco lojas trazem o texto
     * solto. Trocar o formato sem aceitar o antigo faria todos eles pararem
     * de funcionar no dia da publicação, e ninguém bateria ponto até
     * reimprimir tudo.
     */
    if (/^https?:\/\//i.test(limpo)) {
      try {
        const endereco = new URL(limpo);
        const doParametro = endereco.searchParams.get('ponto');
        if (doParametro) limpo = doParametro.trim();
      } catch {
        // Endereço ilegível: segue como se fosse código digitado
      }
    }

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

  /**
   * Esta função é chamada 2.759 vezes para montar "Equipe & Ponto" —
   * uma por pessoa, por dia. Fazia `JSON.parse` de 3,1 MB em cada uma:
   * 32 dos 33 segundos que a tela levava para abrir.
   *
   * `lerLista` guarda o resultado e só reparseia quando o texto muda.
   */
  private lerRegistros(): RegistroPonto[] {
    return lerLista<RegistroPonto>(CHAVE_REGISTROS_PONTO);
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
  /**
   * O próximo passo da jornada DESTE dia.
   *
   * Sábado tem duas marcações: depois da entrada vem a saída, não a saída
   * para o almoço. Percorrendo as quatro fixas, o sistema pediria ao
   * colaborador que batesse um almoço que não existe — e o dia nunca
   * fecharia.
   */
  obterProximaMarcacao(colaboradorId: string, data: string = dataDeHoje()): TipoMarcacao | null {
    const registradas = this.obterMarcacoesDoDia(colaboradorId, data).map((r) => r.tipo);

    /**
     * COM A PESSOA, e não só com a data. Terceira vez que esta linha
     * esquece o segundo argumento.
     *
     * O comentário acima fala de sábado, mas a regra é maior: quem não tem
     * intervalo — estágio — também bate duas vezes, em qualquer dia. Sem
     * passar a pessoa, o sistema pedia à estagiária que batesse uma saída
     * para almoço que ela não tem, e o dia dela nunca fechava.
     */
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const esperadas = marcacoesEsperadas(data, colaborador);

    /**
     * DIA QUE NÃO ESPERA NADA AINDA PODE SER TRABALHADO.
     *
     * Domingo, feriado, sábado de quem não vem no sábado: o contrato não
     * prevê jornada, mas a pessoa pode estar ali — e isso se chama hora
     * extra. Sem esta saída, quem foi trabalhar no feriado não conseguia
     * nem registrar que esteve lá.
     *
     * A sequência completa, porque um dia desses pode ter almoço como
     * qualquer outro.
     */
    const sequencia = esperadas.length > 0 ? esperadas : ORDEM_MARCACOES;

    return sequencia.find((tipo) => !registradas.includes(tipo)) || null;
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

    // A hora da batida sai do relógio sincronizado: é O dado do registro
    // de ponto, e o aparelho não é fonte confiável para ele
    const momento = agoraSincronizado();
    const data = paraDataLocal(momento);
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
      horario: momento.toISOString(),
      horaFormatada: momento.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      metodo: resolvido.metodo,
      loja: resolvido.loja,
      criadoEm: momento.toISOString(),
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

  /**
   * Quanto o dia prevê para esta pessoa.
   *
   * Domingo não prevê nada; sábado prevê as 4 horas da escala; dia útil
   * prevê o turno dela — a carga própria, quando cadastrada, vence o turno,
   * porque contrato individual manda mais que a escala da rede.
   */
  private cargaPrevistaEmMinutos(colaborador: Colaborador | undefined, data: string): number {
    if (ehDiaDeFolga(data)) return 0;

    /**
     * Ausência aprovada zera o previsto do dia.
     *
     * Sem isto, o sábado de folga previa 4 horas e a pessoa fechava o mês
     * com 4 horas de débito por exercer um direito. O mesmo vale para
     * atestado e falta justificada: o dia foi abonado, e dia abonado não
     * cobra jornada.
     */
    if (colaborador && situacaoDoDia(colaborador.id, data) !== 'normal') return 0;

    /**
     * FERIADO NÃO COBRA JORNADA.
     *
     * Sem isto, todo feriado nacional virava um dia inteiro de débito para
     * a rede inteira — e ninguém entendia de onde saiu, porque o espelho
     * mostrava um dia sem batida nenhuma, igual a uma falta.
     *
     * Meio expediente é o mesmo caminho com outro número: 24 e 31 de
     * dezembro preveem o que o RH cadastrar, e não o dia inteiro nem zero.
     *
     * Vem ANTES do sábado de propósito: feriado que cai num sábado fecha a
     * loja do mesmo jeito.
     */
    const feriado = feriadoEm(data, colaborador?.loja);
    if (feriado) return feriado.minutosPrevistos;

    /**
     * Sábado de quem não trabalha aos sábados não prevê nada.
     *
     * Previa 4 horas para todo mundo, e o estagiário que cumpre as 6h de
     * segunda a sexta fechava o mês com 16 horas de débito por um sábado
     * que nunca foi dele.
     */
    /**
     * ===============================================================
     * O SÁBADO COMPLETA A SEMANA — NÃO É MAIS UM DIA PADRÃO.
     * ===============================================================
     *
     * Era 4h fixas para todo mundo que vem ao sábado, como se fosse um
     * dia igual aos outros com horário próprio. O Elias corrigiu: "os
     * sábados devem compor a semana e não ser apenas mais um horário
     * padrão".
     *
     * E é a descrição dele desde o começo: "os que fazem menos durante a
     * semana trabalham no sábado, e essas horas complementam a semana".
     * O sábado é o dia FLEXÍVEL da escala — ele carrega o que falta.
     *
     * Então o previsto dele é a SOBRA: o contrato da semana menos o que
     * os cinco dias úteis já preveem.
     *
     *     sábado = carga semanal − (dia do turno × 5)
     *
     * Para o balcão a conta dá exatamente as 4h de sempre: 8h10 × 5 são
     * 40h50, e o contrato é 44h50. Nada muda para eles.
     *
     * Para o estágio ela passa a fazer sentido: quem cumpre 6h de segunda
     * a sexta já fechou as 30h, e o sábado dele prevê ZERO — se vier,
     * é hora extra, e não um dia que ele "devia". Quem faz 5h por dia
     * chega a 25h, e o sábado dele prevê as 5h que faltam.
     *
     * Nunca negativo: contrato menor que a semana útil não vira crédito
     * automático no sábado. Isso é divergência de cadastro, e a ficha
     * avisa.
     */
    if (ehSabado(data)) {
      if (!trabalhaNoSabado(colaborador)) return 0;

      const turno = turnoDe(colaborador);

      /**
       * SÓ O ESTÁGIO TEM SÁBADO ELÁSTICO.
       *
       * Para o balcão, o estoque e o escritório o sábado é horário de
       * verdade: 08:00 às 12:00, a loja abre e fecha nessas horas. Ele
       * não estica nem encolhe para fechar conta nenhuma.
       *
       * Eu havia aplicado a sobra para todo mundo, e o Elias cortou.
       * Estava certo: um balconista com contrato de 48h teria sábado
       * previsto de 7h10 — a loja fecha ao meio-dia, então o sistema
       * cobraria três horas que não existem. E com contrato de 40h o
       * sábado dele zeraria, sumindo com um dia inteiro de trabalho.
       *
       * No estágio é o contrário: o sábado É o dia de completar a
       * semana, e foi para isso que ele entrou na escala deles.
       */
      if (turno.perfil !== 'estagio') return MINUTOS_SABADO;

      const uteis = minutosDoTurno(turno) * 5;
      return Math.max(0, cargaSemanalDe(colaborador) - uteis);
    }

    /**
     * O DIA ÚTIL PREVÊ O QUE O TURNO DIZ. Ponto.
     *
     * Era `cargaHorariaDiariaMinutos ?? minutosDoTurno(...)` — a ficha
     * vencendo o turno. Só que a coluna é `not null default 480`: ela
     * NUNCA vem indefinida, então o `??` nunca caía para o turno e a
     * segunda metade da linha era código morto.
     *
     * Foi o que o Elias viu no espelho da Lyvia: estagiária, turno da
     * tarde, 4h45 por dia — e o cabeçalho dizendo "jornada diária 8h10",
     * com −3h25 de débito todo santo dia. A ficha dela tinha 490 minutos
     * gravados de quando foi cadastrada, e esse número vencia o turno de
     * estágio que o sistema já sabia que era dela.
     *
     * O CAMPO CONTINUA EXISTINDO — meio período é contrato real, e ele
     * precisa vencer a escala da rede. O que mudou é que ele virou
     * OPCIONAL de verdade: `null` quer dizer "vale o turno", e só um
     * número escrito de propósito manda mais que ele.
     *
     * A migração `jornada-vem-do-turno.sql` limpa os 480 e 490 que o
     * sistema distribuiu sozinho, para o `??` abaixo voltar a ter o
     * efeito que sempre foi a intenção dele.
     */
    /**
     * `!= null` PEGA O NULL E O UNDEFINED, e a diferença não é estilo.
     *
     * Escrevi `!== undefined` aqui. O banco guarda `null` desde a migração
     * que limpou a jornada automática — e `null !== undefined` é
     * verdadeiro. A função devolvia `null`, que vira ZERO na subtração.
     *
     * No espelho da Lyvia isso apareceu como saldo +4h45 em todo dia
     * útil: ela trabalhava 4h45 contra previsto nenhum. O sábado escapou
     * porque nem entra neste ramo, e por isso só ele mostrava um número
     * plausível — o que tornou o erro mais confuso, não menos.
     */
    if (colaborador?.cargaHorariaDiariaMinutos != null && !ehSabado(data)) {
      return colaborador.cargaHorariaDiariaMinutos;
    }

    /**
     * ===============================================================
     * O PREVISTO DO DIA É O RELÓGIO DO TURNO. NADA DE RATEIO.
     * ===============================================================
     *
     * Eu havia feito o previsto ser a FATIA do dia na carga semanal:
     *
     *     previsto = dia pelo turno × (carga semanal ÷ semana pelo turno)
     *
     * A ideia era fazer a carga semanal pesar. O que ela produziu foi um
     * número sem sentido nenhum, e o Elias perguntou exatamente isso:
     * "qual o sentido do 5h18?".
     *
     * Nenhum. A Lyvia estava com turno de 6h e carga semanal de 30h, que
     * com o sábado somaria 34h — então cada dia dela encolhia 12% e virava
     * 5h18. Ninguém sai 5h18 depois de entrar. E pior: o rateio ESPALHAVA
     * um débito de 33 minutos por todos os dias, quando o problema era um
     * só e estava no cadastro — o turno não era o dela.
     *
     * Número que não corresponde a relógio nenhum não se confere, não se
     * explica para quem bateu o ponto, e ainda esconde a causa.
     *
     * O QUE FAZ A SEMANA FECHAR, ENTÃO
     *
     * O dia útil prevê o relógio do turno, e o SÁBADO carrega a
     * diferença — é o dia flexível da escala, e a conta dele está lá em
     * cima. Nenhum dia útil vira número quebrado por causa do contrato.
     */
    return minutosDoTurno(turnoDe(colaborador));
  }

  /**
   * A SEMANA É A UNIDADE DO BANCO DE HORAS, e não o dia.
   *
   * O dia sozinho não diz nada nesta rede. O estagiário que faz 5h de
   * segunda a sexta e 5h no sábado fecha as 30h dele — mas é reprovado
   * cinco vezes por dia curto se a conta for diária. O colaborador que sai
   * dez minutos mais cedo numa terça e compensa na quinta fecha a semana em
   * dia, e a conta diária marca um débito e um crédito que nunca deviam ter
   * existido.
   *
   * Aqui se soma o que a pessoa trabalhou na semana e se compara com a
   * carga semanal DELA. É isso que vai para o banco de horas, e é isso que
   * o líder olha no sábado.
   *
   * O ciclo vai de SÁBADO a SEXTA — é o que `semanaDe` recorta, e é como a
   * folha corre aqui: o sábado ABRE a semana em vez de parti-la ao meio.
   */
  apurarSemana(
    colaboradorId: string,
    dataQualquerDaSemana: string
  ): {
    inicio: string;
    fim: string;
    minutosTrabalhados: number;
    minutosPrevistos: number;
    saldoMinutos: number;
    diasComPendencia: string[];
  } {
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const { inicio, fim } = semanaDe(dataQualquerDaSemana);

    let minutosTrabalhados = 0;
    let minutosPrevistos = 0;
    const diasComPendencia: string[] = [];
    const hoje = dataDeHoje();

    for (const data of listarDatasDoPeriodo(inicio, fim)) {
      /**
       * O SALDO SÓ CONTA DIA QUE JÁ FECHOU.
       *
       * Isto somava a semana INTEIRA de previsto, hoje e amanhã incluídos,
       * contra o que a pessoa tinha trabalhado até agora. O efeito
       * aparecia no painel do RH: numa segunda de manhã a rede devia
       * −3924h33, que é a carga semanal de 87 pessoas — a semana que nem
       * tinha começado, cobrada por inteiro de todo mundo.
       *
       * Era um número que não dava para acreditar, e indicador em que não
       * se acredita é pior do que indicador nenhum: ensina a ignorar o
       * painel, e junto com ele o dia em que a rede realmente estiver
       * devendo.
       *
       * O dia de HOJE também fica fora, e não só o futuro: quem entrou às
       * 8h e ainda está trabalhando não deve as 8h10 do dia. Contar o
       * previsto de um dia em andamento faz a rede inteira parecer
       * devedora toda manhã, e quitar sozinha até a noite.
       *
       * O mesmo corte de `hoje` que a pendência já usava, agora valendo
       * para a conta toda — eram duas noções de "dia que passou" no mesmo
       * laço, e foi a discordância entre elas que pôs "Sem bater: 0" ao
       * lado de um débito de quatro mil horas.
       */
      if (data >= hoje) continue;

      const jornada = this.obterJornadaDoDia(colaboradorId, data);
      minutosTrabalhados += jornada.minutosTrabalhados;
      minutosPrevistos += jornada.minutosPrevistos;

      /**
       * Pendência é batida que FALTA num dia que já passou — não é dia
       * curto. Dia curto agora é assunto do saldo da semana; falta de
       * batida é assunto de quem responde pela pessoa, porque só ela sabe
       * o que aconteceu.
       */
      const esperadas = marcacoesEsperadas(data, colaborador);
      if (esperadas.length === 0) continue;
      if (situacaoDoDia(colaboradorId, data) !== 'normal') continue;

      /**
       * DIA SEM NENHUMA BATIDA TAMBÉM É FALTA DE BATIDA.
       *
       * Era `feitas > 0 && feitas < esperadas.length`: só o dia batido
       * pela METADE contava. O dia em que a pessoa não bateu nada —
       * que é a falta mais completa que existe — passava calado, ao
       * mesmo tempo em que o previsto dele pesava no saldo dela.
       *
       * QUEM NÃO BATE PONTO tem de ficar fora desta conta, e não fica
       * por aqui: `marcacoesEsperadas` olha o dia e a ficha, nunca se a
       * pessoa bate ponto, e devolve as quatro batidas para o gerente
       * também. Quem tira a gerência da relação é
       * `relacaoSemanalDaEquipe`, com o porquê escrito lá.
       */
      const feitas = esperadas.filter((t) => !!jornada.marcacoes[t]).length;
      if (feitas < esperadas.length) diasComPendencia.push(data);
    }

    return {
      inicio,
      fim,
      minutosTrabalhados,
      minutosPrevistos,
      saldoMinutos: minutosTrabalhados - minutosPrevistos,
      diasComPendencia,
    };
  }

  /**
   * A RELAÇÃO DO BANCO DE HORAS DA EQUIPE, ciclo a ciclo.
   *
   * É o que o líder abre no sábado: uma linha por pessoa, com o que ela
   * trabalhou no ciclo que fechou, o que ela devia, o saldo e o que ficou
   * pendente de batida.
   *
   * A FOLGA JÁ ENTRA DESCONTADA, e sem ninguém precisar lembrar: o previsto
   * de cada dia vem de `cargaPrevistaEmMinutos`, que zera o dia de ausência
   * APROVADA — e a folga de sábado é uma delas. Quem folgou naquele sábado
   * específico tem 4 horas a menos de previsto naquele ciclo, e fecha em dia
   * sem dever nada.
   *
   * Folga ainda PENDENTE não desconta. É de propósito: enquanto ninguém
   * autorizou, o sábado ainda é dia de trabalho — e o saldo negativo é
   * justamente o que faz o líder decidir.
   */
  relacaoSemanalDaEquipe(dataNoCiclo: string): {
    inicio: string;
    fim: string;
    linhas: {
      colaborador: Colaborador;
      minutosTrabalhados: number;
      minutosPrevistos: number;
      cargaContratada: number;
      saldoMinutos: number;
      diasComPendencia: string[];
      folgouNoCiclo: boolean;
    }[];
  } {
    const { inicio, fim } = semanaDe(dataNoCiclo);

    // Só quem eu aprovo: a relação da rede inteira não é minha para olhar.
    // Quem lidera aparece na própria relação, porque aprova as próprias horas.
    const equipe = this.obterColaboradoresVisiveis()
      .filter((c) => this.podeDecidirSobre(c))
      /**
       * BANCO DE HORAS É DE QUEM BATE PONTO.
       *
       * Da gerência para cima não se bate — está no catálogo, em
       * `ferramentas.ts`, e foi decisão do Elias. Mas esta relação
       * continuava incluindo essas pessoas, e o resultado era aritmético:
       * quem nunca bate marca zero trabalhado contra a carga cheia, e
       * aparece devendo a semana inteira. Toda semana, para sempre.
       *
       * Somado no painel do RH isso virava um débito de milhares de horas
       * que ninguém devia. E a linha de cada gerente ficava no topo da
       * relação do banco de horas, que ordena pelo maior débito — o lugar
       * reservado a quem precisa de atenção, ocupado por quem não tem o
       * que ser olhado.
       *
       * A pergunta é a MESMA que faz a aba "Ponto" aparecer, e vem do
       * mesmo lugar: se a pessoa não tem por onde bater, não há saldo dela
       * para cobrar. Duas respostas para isso seria a quinta vez que este
       * sistema se contradiz sozinho.
       */
      .filter((c) => podeUsar('ponto', c));

    const linhas = equipe
      .map((colaborador) => {
        const semana = this.apurarSemana(colaborador.id, dataNoCiclo);

        /**
         * Folgou neste ciclo? Serve para a tela dizer POR QUE o previsto
         * daquela pessoa veio menor — senão o líder vê 40h50 numa linha e
         * 44h50 na de baixo sem explicação, e desconfia da conta.
         */
        const folgouNoCiclo = listarDatasDoPeriodo(inicio, fim).some(
          (data) =>
            ehSabado(data) && situacaoDoDia(colaborador.id, data) === 'folga'
        );

        return {
          colaborador,
          minutosTrabalhados: semana.minutosTrabalhados,
          minutosPrevistos: semana.minutosPrevistos,
          cargaContratada: cargaSemanalDe(colaborador),
          saldoMinutos: semana.saldoMinutos,
          diasComPendencia: semana.diasComPendencia,
          folgouNoCiclo,
        };
      })
      /**
       * Quem tem pendência de batida vem primeiro, depois o maior débito.
       *
       * A relação existe para agir, não para consultar: o que precisa de
       * decisão tem de estar no alto, e não no meio de oitenta linhas
       * ordenadas por nome.
       */
      .sort((a, b) => {
        if (a.diasComPendencia.length !== b.diasComPendencia.length) {
          return b.diasComPendencia.length - a.diasComPendencia.length;
        }
        return a.saldoMinutos - b.saldoMinutos;
      });

    return { inicio, fim, linhas };
  }

  /**
   * O que a semana DEVERIA ter, pela carga contratada da pessoa.
   *
   * Diferente do previsto somado dia a dia: aquele desconta folga e
   * ausência aprovada, este é o contrato limpo. Serve para a tela dizer
   * "30h na semana" sem ter de explicar por que naquela semana foram 25.
   */
  cargaSemanalDoColaborador(colaboradorId: string): number {
    return cargaSemanalDe(bancoDados.obterColaboradorPorId(colaboradorId));
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
    /**
     * O QUE FECHA O DIA DEPENDE DE QUEM É A PESSOA.
     *
     * Estava perguntando só pela data, e por isso cobrava quatro batidas de
     * quem faz seis horas direto: o dia dela nunca ficava "completo", e a
     * tela dizia jornada incompleta todo santo dia.
     *
     * É o mesmo defeito que eu corrigi em `levantarDiasIncompletos` e
     * deixei passar aqui — o segundo lugar que faz a mesma pergunta.
     */
    const completa = marcacoesEsperadas(data, colaborador).every(
      (tipo) => !!marcacoes[tipo]
    );
    const emAndamento = entrada !== null && saida === null;

    /**
     * ===============================================================
     * A PAUSA É O COLCHÃO DO DIA, E ELA SÓ EXISTE UMA VEZ.
     * ===============================================================
     *
     * A pausa de 15 minutos do estágio é paga e não se bate. Quem entra
     * 13:15 num turno que começa 13:00 ABRIU MÃO DELA — e trabalhou
     * exatamente o mesmo que a colega que entrou 13:00 e parou 15
     * minutos. Os dois dias valem igual, e é assim que a casa conta.
     *
     * Sem isto o espelho da Lyvia acusava −15 minutos todo santo dia por
     * uma jornada que ela cumpriu inteira.
     *
     * DOIS LIMITES, e os dois importam:
     *
     *  - Só abate ATÉ o tamanho da pausa. Quem entra 13:40 perdeu a pausa
     *    E chegou atrasado: os 25 minutos além dela continuam débito.
     *  - Só abate PARA BAIXO. Pausa não vira crédito para quem ficou
     *    além do horário — hora extra é outra coisa, e passa por decisão.
     *
     * E vale uma vez por dia, porque a pausa é uma por dia: quem tem
     * almoço de 1h30 não entra aqui, o almoço dele é batido e descontado.
     */
    const pausa = minutosPausaDoTurno(turnoDe(colaborador));

    const diferenca = minutosTrabalhados - minutosPrevistos;
    const abatidoPelaPausa =
      diferenca < 0 ? Math.min(pausa, Math.abs(diferenca)) : 0;

    // Dia sem nenhuma marcação em fim de semana não é falta nem saldo negativo;
    // dia útil sem jornada fechada também não gera saldo até o RH tratar.
    const saldoMinutos = minutosTrabalhados > 0 ? diferenca + abatidoPelaPausa : 0;

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
    return lerLista<AjusteJornada>(CHAVE_AJUSTES);
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

  /** O outro limite da CLT: minutos tolerados em CADA marcação. */
  obterToleranciaPorMarcacaoMinutos(): number {
    const valor = bancoDados.obterConfiguracoes().toleranciaPorMarcacaoMinutos;
    if (typeof valor !== 'number' || Number.isNaN(valor) || valor < 0) {
      return TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS;
    }
    return Math.floor(valor);
  }

  /**
   * O horário que o contrato espera para CADA batida daquele dia.
   *
   * Devolve `null` quando o sistema não tem como saber — e aí o limite por
   * marcação não se aplica, porque comparar com um horário inventado seria
   * pior do que não comparar.
   *
   * É o caso do estágio: seis horas corridas não correspondem a nenhum
   * turno da rede, e a pessoa combina o horário com a área. O limite do
   * DIA continua valendo para ela.
   */
  private horariosEsperadosDoDia(
    colaborador: Colaborador | undefined,
    data: string
  ): Partial<Record<TipoMarcacao, number>> | null {
    const esperadas = marcacoesEsperadas(data, colaborador);
    if (esperadas.length === 0) return null;

    const emMinutos = (hora: string): number => {
      const [h, m] = hora.split(':').map(Number);
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };

    const turno = turnoDe(colaborador);

    /**
     * O DIA ÚTIL DE DUAS BATIDAS TAMBÉM TEM HORÁRIO.
     *
     * Antes só o sábado e o dia de quatro batidas tinham. O estagiário
     * que entra 07:30 e sai 12:30 direto caía no `{}`, e o sistema dizia
     * que não sabia o horário dele — quando sabe, está escrito no turno.
     *
     * O efeito era mudo: sem horário esperado não há atraso, e a entrada
     * às 09:00 dele passava como se fosse no relógio.
     */
    const horarios: Partial<Record<TipoMarcacao, number>> = ehSabado(data)
      ? esperadas.length === 2
        ? {
            entrada: emMinutos(TURNO_SABADO.entrada),
            saida: emMinutos(TURNO_SABADO.saida),
          }
        : {}
      : esperadas.length === 4 && turno.intervalo
        ? {
            entrada: emMinutos(turno.entrada),
            saida_almoco: emMinutos(turno.intervalo.saida),
            retorno_almoco: emMinutos(turno.intervalo.retorno),
            saida: emMinutos(turno.saida),
          }
        : esperadas.length === 2
          ? {
              entrada: emMinutos(turno.entrada),
              saida: emMinutos(turno.saida),
            }
          : {};

    if (Object.keys(horarios).length === 0) return null;

    /**
     * OS HORÁRIOS PRECISAM FECHAR A CARGA DA PESSOA.
     *
     * A ficha pode ter carga própria — 8h00, por exemplo — enquanto o
     * turno da rede fecha 8h10. Nesse caso os horários do turno NÃO são
     * os dela: ela entra e sai em outro relógio, combinado com a área.
     *
     * Comparar a batida dela com o turno acusaria trinta minutos de
     * variação todo santo dia, e o dia inteiro cairia na fila. Quando os
     * dois não fecham, o sistema admite que não sabe o horário — e vale
     * só o limite do dia.
     */
    const implicado = ehSabado(data)
      ? (horarios.saida ?? 0) - (horarios.entrada ?? 0)
      : (horarios.saida_almoco ?? 0) -
        (horarios.entrada ?? 0) +
        ((horarios.saida ?? 0) - (horarios.retorno_almoco ?? 0));

    if (implicado !== this.cargaPrevistaEmMinutos(colaborador, data)) return null;

    return horarios;
  }

  /**
   * A MAIOR variação entre o batido e o esperado, marcação a marcação.
   *
   * Devolve `null` quando não há horário esperado conhecido.
   *
   * É o que faltava para o art. 58 §1º valer inteiro: a lei tem DOIS
   * limites — cinco minutos em cada marcação e dez no dia — e o sistema só
   * conhecia o segundo. Uma saída oito minutos adiantada passava batida,
   * quando pela lei esses oito minutos contam.
   */
  maiorVariacaoDoDia(colaboradorId: string, data: string): number | null {
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const esperados = this.horariosEsperadosDoDia(colaborador, data);
    if (!esperados) return null;

    const jornada = this.obterJornadaDoDia(colaboradorId, data);
    let maior = 0;

    for (const [tipo, esperado] of Object.entries(esperados)) {
      const reg = jornada.marcacoes[tipo as TipoMarcacao];
      if (!reg || esperado === undefined) continue;

      const quando = new Date(reg.horario);
      const batido = quando.getHours() * 60 + quando.getMinutes();
      maior = Math.max(maior, Math.abs(batido - esperado));
    }

    return maior;
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
    // O padrão vem do relógio sincronizado; os testes passam a data deles
    agora: Date = agoraSincronizado()
  ): { precisaMotivo: boolean; minutos: number; descricao: string } {
    const semMotivo = { precisaMotivo: false, minutos: 0, descricao: '' };
    const tolerancia = this.obterToleranciaMinutos();
    const data = paraDataLocal(agora);
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

    if (tipo === 'saida_almoco') return semMotivo;

    /**
     * O horário esperado sai do TURNO DA PESSOA, não de um valor único da
     * rede: quem é do turno B entra às 08:20, e cobrar dele o horário do
     * turno A o faria justificar um atraso que não existe.
     */
    const turno = turnoDe(colaborador);
    const emMinutos = (hora: string): number => {
      const [h, m] = hora.split(':').map(Number);
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };

    if (tipo === 'entrada') {
      // Domingo não tem horário de entrada a cumprir
      if (ehDiaDeFolga(data)) return semMotivo;

      const esperado = ehSabado(data) ? TURNO_SABADO.entrada : turno.entrada;
      const atraso = minutosAgora - emMinutos(esperado);

      if (atraso <= tolerancia) return semMotivo;
      return {
        precisaMotivo: true,
        minutos: atraso,
        descricao: `Entrada ${formatarMinutos(atraso)} depois do horário (${esperado}).`,
      };
    }

    if (tipo === 'retorno_almoco') {
      const jornada = this.obterJornadaDoDia(colaboradorId, data);
      const saida = jornada.marcacoes.saida_almoco;
      if (!saida) return semMotivo;

      const saiuEm = new Date(saida.horario);
      const intervalo = minutosAgora - (saiuEm.getHours() * 60 + saiuEm.getMinutes());
      /**
       * O intervalo contratado é o DESTA PESSOA, e não o almoço da rede.
       *
       * A conta pegava o almoço do turno direto. Para quem tem 1h30 dava
       * certo por acaso; para o estagiário de 15 minutos, o sistema
       * silenciava uma hora e quinze de intervalo a mais todo dia, porque
       * cabia dentro do "contratado" que não era o dele.
       */
      const contratado = minutosDeIntervaloDe(colaborador);
      if (contratado === 0) return semMotivo;

      const excedente = intervalo - contratado;
      if (excedente <= tolerancia) return semMotivo;
      return {
        precisaMotivo: true,
        minutos: excedente,
        descricao: `Intervalo de ${formatarMinutos(intervalo)} — ${formatarMinutos(
          excedente
        )} além dos ${formatarMinutos(contratado)} do seu turno.`,
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

  /**
   * Levanta os dias que começaram e não fecharam, e os manda para a fila.
   *
   * Antes esses dias sumiam em silêncio: sem as marcações esperadas o dia
   * não apura, então não virava pendência, não virava débito, e
   * simplesmente não contava. Era o caminho mais fácil para sumir com um
   * dia inteiro.
   *
   * Só entra o dia PASSADO: durante o expediente o dia está legitimamente
   * incompleto, e cobrar de manhã a saída que só acontece às 17h seria
   * ruído puro.
   *
   * Dia sem NENHUMA marcação não entra: isso é falta ou ausência
   * justificada, que têm caminho próprio. Aqui é só o que começou e ficou
   * pela metade.
   */
  async levantarDiasIncompletos(diasParaTras = 30): Promise<number> {
    const eu = bancoDados.obterColaboradorAtual();
    const hoje = dataDeHoje();
    let criados = 0;

    /**
     * Só quem eu aprovo — e agora isso pode me incluir.
     *
     * A pergunta é a MESMA da fila de decisão (`podeDecidirSobre`), e por
     * isso é ela que responde: se a lista aqui divergisse, apareceria
     * pendência sem quem a decida, ou o contrário.
     */
    const equipe = this.obterColaboradoresVisiveis().filter((c) =>
      this.podeDecidirSobre(c)
    );

    for (const pessoa of equipe) {
      for (let i = 1; i <= diasParaTras; i++) {
        const referencia = new Date();
        referencia.setDate(referencia.getDate() - i);
        const data = paraDataLocal(referencia);
        if (data >= hoje) continue;

        const esperadas = marcacoesEsperadas(data, pessoa);
        const jornada = this.obterJornadaDoDia(pessoa.id, data);
        const batidas = Object.keys(jornada.marcacoes).length;
        // Conta as ESPERADAS, nao quaisquer: no sabado, uma entrada mais
        // uma saida de almoco sao duas batidas e nenhuma delas fecha o dia
        const feitas = esperadas.filter((t) => !!jornada.marcacoes[t]).length;

        // Domingo não tem jornada; dia fechado não é problema; dia sem
        // nenhuma batida é falta, e falta tem caminho próprio
        if (ehDiaDeFolga(data)) continue;
        // Dia abonado não é dia pela metade: já foi decidido por outra via
        if (situacaoDoDia(pessoa.id, data) !== 'normal') continue;
        // Sem batida esperada o dia não é dela — sábado de quem não vem
        if (esperadas.length === 0) continue;
        if (batidas === 0 || feitas >= esperadas.length) continue;

        // Já levantado, decidido ou coberto por ausência aprovada: não repete
        if (this.obterAjusteDoDia(pessoa.id, data)) continue;

        const ajuste: AjusteJornada = {
          id: `inc-${pessoa.id}-${data}`,
          colaboradorId: pessoa.id,
          data,
          tipo: 'dia_incompleto',
          // Guarda a jornada prevista: é o débito que o dia vira se o
          // responsável decidir que ele não foi trabalhado
          minutos: jornada.minutosPrevistos,
          minutosTrabalhados: jornada.minutosTrabalhados,
          minutosPrevistos: jornada.minutosPrevistos,
          estado: 'pendente',
          origem: 'pendencia',
          criadoEm: new Date().toISOString(),
        };

        if (usandoNuvem()) {
          const res = await nuvem.salvarAjuste(ajuste);
          if (!res.sucesso) continue;
        }

        const lista = this.lerAjustes().filter((a) => a.id !== ajuste.id);
        lista.push(ajuste);
        this.gravarAjustes(lista);
        criados++;
      }
    }

    if (criados > 0) this.notificar();
    return criados;
  }

  /**
   * A decisão sobre um dia sem fechar.
   *
   * `abonar` = o dia conta como jornada normal, saldo zero. Caso do
   * esquecimento honesto.
   *
   * Sem abonar = o dia vira DÉBITO da jornada prevista inteira. Não dá para
   * calcular quanto a pessoa trabalhou de verdade — falta marcação —, e
   * inventar um número seria pior do que assumir o dia como não trabalhado.
   *
   * Em nenhum dos dois o responsável altera a marcação: isso segue do RH,
   * com justificativa e autoria.
   */
  async decidirDiaIncompleto(
    ajusteId: string,
    abonar: boolean,
    observacao?: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    const ajuste = this.lerAjustes().find((a) => a.id === ajusteId);
    if (!ajuste) return { sucesso: false, erro: 'Dia não encontrado.' };

    const dono = bancoDados.obterColaboradorPorId(ajuste.colaboradorId);
    if (!dono || !this.podeDecidirSobre(dono)) {
      return { sucesso: false, erro: 'Você não responde por esta pessoa.' };
    }

    const eu = bancoDados.obterColaboradorAtual();
    const decidido: AjusteJornada = {
      ...ajuste,
      tipo: abonar ? 'hora_extra' : 'debito',
      minutos: abonar ? 0 : ajuste.minutosPrevistos,
      estado: 'aprovado',
      aprovadorId: eu.id,
      aprovadorNome: eu.nome,
      decididoEm: new Date().toISOString(),
      observacao: observacao?.trim() || (abonar ? 'Dia abonado pelo responsável' : undefined),
    };

    if (usandoNuvem()) {
      const res = await nuvem.salvarAjuste(decidido);
      if (!res.sucesso) return { sucesso: false, erro: res.erro };
    }

    const lista = this.lerAjustes().map((a) => (a.id === ajusteId ? decidido : a));
    this.gravarAjustes(lista);
    this.notificar();

    bancoDados.registrarAuditoria(
      'Dia sem fechar',
      'usuario',
      `${eu.nome} ${abonar ? 'abonou' : 'marcou débito de'} ${
        abonar ? '' : formatarMinutos(ajuste.minutosPrevistos)
      } no dia ${formatarDataBR(ajuste.data)} de ${dono.nome}.`
    );

    return { sucesso: true };
  }

  /**
   * @param corrigidoPor Quem acabou de corrigir a batida à mão, quando foi
   * o caso. Só chega preenchido de `ajustarMarcacao`, DEPOIS de a
   * autoridade sobre a pessoa ter sido conferida lá — o dia apurado por
   * uma batida normal não passa por aqui, e ninguém aprova o próprio dia
   * batendo o ponto.
   */
  async apurarDia(
    colaboradorId: string,
    data: string,
    dadosDoColaborador?: { motivo?: string; anexoCaminho?: string },
    corrigidoPor?: Colaborador
  ): Promise<{ criou: boolean; ajuste?: AjusteJornada }> {
    const jornada = this.obterJornadaDoDia(colaboradorId, data);
    if (!jornada.completa) return { criou: false };

    const diferenca = jornada.minutosTrabalhados - jornada.minutosPrevistos;
    const existente = this.obterAjusteDoDia(colaboradorId, data);

    /**
     * DIA CERTO: nada a decidir.
     *
     * Se havia pendência de uma versão anterior do dia — antes de alguém
     * corrigir a batida —, ela perde o sentido e precisa sair da fila.
     *
     * REESCRITA, E NÃO APAGADA. Apagar exigiria dar permissão de remoção
     * à própria pessoa, e aí bastaria apagar a linha para um débito
     * sumir: a apuração só é refeita quando alguém bate ou corrige.
     * Reescrever tira da fila, preserva o histórico e não abre nada.
     *
     * "Aprovado pela tolerância" é verdade literal aqui: diferença zero
     * cabe em qualquer tolerância.
     */
    if (diferenca === 0) {
      /**
       * DIA JÁ DECIDIDO TAMBÉM PRECISA SER REESCRITO QUANDO A BATIDA MUDA.
       *
       * Era só `estado === 'pendente'`. O efeito foi o saldo da Lyvia: o
       * dia fechou com débito enquanto a jornada dela ainda era lida como
       * 8h10, o débito foi decidido, e depois a batida foi corrigida. A
       * diferença virou zero — e o débito velho continuou no saldo dela,
       * porque esta linha não o alcançava.
       *
       * O dia mudou; a conta do dia tem de mudar junto. Quem já decidiu
       * decidiu sobre outro dia, que não existe mais.
       */
      const precisaReescrever =
        existente && (existente.estado === 'pendente' || !!corrigidoPor);

      if (precisaReescrever) {
        await this.gravarAjusteCorrigido({
          ...existente!,
          minutos: 0,
          minutosTrabalhados: jornada.minutosTrabalhados,
          minutosPrevistos: jornada.minutosPrevistos,
          estado: 'aprovado',
          origem: corrigidoPor ? 'correcao_manual' : 'tolerancia_automatica',
          aprovadorId: corrigidoPor?.id,
          aprovadorNome: corrigidoPor?.nome || 'Tolerância automática',
          decididoEm: new Date().toISOString(),
        });
      }
      return { criou: false };
    }

    /**
     * Já decidido: não reabre sozinho.
     *
     * A exceção é a correção manual. O comentário aqui dizia "quem corrige
     * marcação depois da decisão é o RH, e aí a decisão é dele" — mas o
     * código voltava antes de refazer conta nenhuma, e a decisão do RH não
     * chegava a lugar nenhum. O saldo seguia com o número de antes da
     * correção, sem nada na tela dizendo isso.
     */
    if (existente && existente.estado !== 'pendente' && !corrigidoPor) {
      return { criou: false };
    }

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
    /**
     * OS DOIS LIMITES DA LEI, e vale o que for atingido primeiro.
     *
     * O art. 58 §1º diz "variações não excedentes de CINCO minutos,
     * observado o limite máximo de DEZ minutos diários". O sistema
     * conhecia só o segundo, e por isso era mais permissivo que a lei num
     * caso: uma única variação de 6 a 10 minutos passava batida — quem
     * saía 8 minutos mais cedo não gerava nada, quando pela lei esses 8
     * minutos contam.
     *
     * A variação por marcação só entra quando o sistema SABE o horário
     * esperado de cada batida. Para o estágio, que combina o horário com
     * a área e não cumpre turno da rede, continua valendo só o limite do
     * dia — comparar com um horário inventado seria pior.
     */
    const maiorVariacao = this.maiorVariacaoDoDia(colaboradorId, data);
    const dentroDoDia = Math.abs(diferenca) <= this.obterToleranciaMinutos();
    const dentroDaMarcacao =
      maiorVariacao === null || maiorVariacao <= this.obterToleranciaPorMarcacaoMinutos();

    const dentroDaTolerancia = dentroDoDia && dentroDaMarcacao;
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
      /**
       * QUEM CORRIGE A BATIDA JÁ DECIDIU O DIA.
       *
       * Era sempre `pendente` fora da tolerância, viesse de onde viesse.
       * O Elias corrigiu o espelho pelo RH e o sistema mandou o resultado
       * para o líder do setor aprovar — pedindo carimbo de terceiro sobre
       * o horário que o RH acabou de afirmar.
       *
       * Além de inverter a hierarquia, isso enche a fila de quem não tem
       * o que julgar ali: o líder não sabe por que o RH mudou a batida, e
       * a única informação que ele teria é a justificativa que o RH já
       * escreveu.
       *
       * A autoridade foi conferida em `ajustarMarcacao`, que é quem
       * preenche `corrigidoPor`. Batida normal não passa por aqui.
       */
      estado: dentroDaTolerancia || corrigidoPor ? 'aprovado' : 'pendente',
      origem: dentroDaTolerancia
        ? 'tolerancia_automatica'
        : corrigidoPor
          ? 'correcao_manual'
          : 'pendencia',
      // Sem aprovadorId na tolerância: ninguém carimbou. O nome existe para
      // o espelho conseguir dizer que aquilo foi regra, e não decisão de
      // gente. Na correção manual há gente, e ela assina.
      aprovadorId: corrigidoPor?.id,
      aprovadorNome: dentroDaTolerancia
        ? 'Tolerância automática'
        : corrigidoPor?.nome,
      decididoEm: dentroDaTolerancia || corrigidoPor ? agora : undefined,
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
      if (!res.sucesso) {
        /**
         * FALHA AQUI NÃO PODE SER MUDA.
         *
         * Era um `return` seco. O efeito: a pessoa corrigia a batida, a
         * tela dizia "corrigido", e a apuração ANTIGA continuava na fila
         * — com o número de antes da correção. Dois lugares mostrando
         * dias diferentes do mesmo dia, e nenhum sinal de que algo falhou.
         *
         * O aviso não chega ao usuário por aqui (esta função roda em
         * cadeia, atrás de outras telas), mas para de sumir: quem for
         * investigar encontra o motivo do banco no console.
         */
        console.error(
          `Apuração de ${data} de ${colaboradorId} NÃO foi gravada:`,
          res.erro
        );
        return { criou: false };
      }
    }

    const lista = this.lerAjustes().filter((a) => a.id !== ajuste.id);
    lista.push(ajuste);
    this.gravarAjustes(lista);
    this.notificar();

    return { criou: true, ajuste };
  }

  /**
   * Grava a apuração reescrita, no banco ANTES do aparelho.
   *
   * A ordem importa: gravar aqui e falhar lá deixaria a tela mostrando
   * um dia resolvido que o banco ainda tem como pendente — e a próxima
   * sincronização traria o número velho de volta, sem explicação.
   *
   * Foi exatamente isso que aconteceu com a correção do sábado: a tela
   * dizia "corrigido" e a fila seguia com o débito de antes.
   */
  private async gravarAjusteCorrigido(ajuste: AjusteJornada): Promise<void> {
    if (usandoNuvem()) {
      const res = await nuvem.salvarAjuste(ajuste);
      if (!res.sucesso) {
        console.error(`Apuração de ${ajuste.data} não foi reescrita:`, res.erro);
        return;
      }
    }

    const lista = this.lerAjustes().filter((a) => a.id !== ajuste.id);
    lista.push(ajuste);
    this.gravarAjustes(lista);
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

    const colaborador = bancoDados.obterColaboradorPorId(dados.colaboradorId);
    if (!colaborador) {
      return { sucesso: false, erro: 'Colaborador não encontrado.' };
    }

    /**
     * QUEM CORRIGE: o RH, e quem responde pela pessoa.
     *
     * Era só do RH. Passou a valer também para o líder e o gerente porque a
     * fila de aprovação ficava sem saída: o responsável via o dia fechado
     * errado, sabia o horário certo, e só podia aprovar o errado ou recusar.
     *
     * O alcance é o MESMO do aprovar — `podeDecidirSobre`, que é a cadeia do
     * organograma. Uma segunda regra aqui divergiria da fila, e alguém
     * acabaria podendo corrigir o dia de quem não aprova.
     */
    const ehDaCadeia = this.podeDecidirSobre(colaborador);
    if (!this.podeAcessarPainelRH(atual) && !ehDaCadeia) {
      return {
        sucesso: false,
        erro: 'Corrigir marcação é de quem responde por esta pessoa, ou do RH.',
      };
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

    /**
     * O horário que estava lá antes.
     *
     * A correção SOBRESCREVE a batida — foi a forma escolhida, e o espelho
     * passa a mostrar o horário certo. Só que aí o que a pessoa bateu não
     * fica em lugar nenhum, e ponto é registro trabalhista.
     *
     * Guardar na Auditoria não muda o documento e deixa o original
     * recuperável. Precisa ser lido AGORA: daqui a três linhas a posição já
     * foi reescrita.
     */
    const horaAnterior = indice !== -1 ? registros[indice].horaFormatada : null;

    const registroAjustado: RegistroPonto = {
      id: indice !== -1 ? registros[indice].id : `ponto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      colaboradorId: dados.colaboradorId,
      data: dados.data,
      tipo: dados.tipo,
      horario: horario.toISOString(),
      horaFormatada: `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`,
      // O espelho precisa dizer a verdade sobre quem escreveu a marcação:
      // "corrigido pelo RH" e "corrigido pelo responsável" não são a mesma
      // coisa na hora de conferir o documento
      metodo: this.podeAcessarPainelRH(atual) ? 'ajuste_rh' : 'ajuste_lider',
      loja: indice !== -1 ? registros[indice].loja : colaborador.loja,
      criadoEm: indice !== -1 ? registros[indice].criadoEm : new Date().toISOString(),
      ajustadoPorId: atual.id,
      ajustadoPorNome: atual.nome,
      justificativa: dados.justificativa.trim(),
    };

    if (usandoNuvem()) {
      const res = await nuvem.salvarAjustePonto(registroAjustado);
      if (!res.sucesso) {
        /**
         * O MOTIVO DE VERDADE, e não "verifique a conexão".
         *
         * A mensagem antiga mandava a líder olhar o wi-fi enquanto o banco
         * recusava por permissão. Ela conferiu a conexão, estava boa, e o
         * defeito chegou aqui como "não funciona" — sem a única informação
         * que resolveria.
         *
         * Tela que inventa a causa custa uma rodada inteira de diagnóstico.
         */
        return {
          sucesso: false,
          erro: res.erro
            ? `Não foi possível gravar a correção: ${res.erro}`
            : 'Não foi possível gravar a correção. Verifique a conexão.',
        };
      }
    }

    if (indice !== -1) {
      registros[indice] = registroAjustado;
    } else {
      registros.push(registroAjustado);
    }
    this.gravarRegistros(registros);

    /**
     * Corrigir marcação muda o dia, e a apuração é refeita.
     *
     * `atual` vai junto porque quem corrigiu JÁ DECIDIU: a autoridade dele
     * sobre esta pessoa foi conferida lá em cima, e o dia sai aprovado em
     * nome dele em vez de ir para a fila de um terceiro.
     */
    await this.apurarDia(dados.colaboradorId, dados.data, undefined, atual);

    bancoDados.registrarAuditoria(
      indice !== -1 ? 'Correção de Ponto' : 'Lançamento Manual de Ponto',
      'seguranca',
      `${atual.nome} ${indice !== -1 ? 'corrigiu' : 'lançou'} ${ROTULO_MARCACAO[dados.tipo].toLowerCase()} de ${colaborador.nome} em ${formatarDataBR(dados.data)}${
        horaAnterior ? ` de ${horaAnterior}` : ''
      } para ${registroAjustado.horaFormatada}. Motivo: ${registroAjustado.justificativa}`
    );
    this.notificar();
    return { sucesso: true, registro: registroAjustado };
  }

  /**
   * REAPURA UM PERÍODO INTEIRO com a regra de hoje.
   *
   * A apuração de um dia só é refeita quando alguém bate ou corrige uma
   * marcação daquele dia. É de propósito — refazer sozinho seria reabrir
   * decisão tomada. Mas isso deixa um rastro: quando a REGRA muda, os
   * dias já apurados guardam o número antigo para sempre.
   *
   * Foi o que aconteceu com a Lyvia. O espelho dela mostrava dois
   * números que não conversavam: −47h50 no acumulado, vindo dos ajustes
   * gravados com a jornada errada, e o saldo do período recalculado na
   * hora. Corrigir dia a dia seriam três semanas de cliques.
   *
   * NÃO É UM APAGADOR. Cada dia passa pela mesma `apurarDia` que a
   * batida usa — a regra é uma só, e reescrever aqui uma segunda versão
   * dela é como as contas deste sistema passariam a divergir. O que
   * muda é só quem disparou.
   *
   * Quem reapura DECIDE: a autoridade é a mesma de corrigir a marcação,
   * e o dia sai aprovado em nome de quem mandou, como na correção
   * manual. Reapurar para jogar tudo na fila do líder seria transformar
   * um conserto de sistema em trabalho para outra pessoa.
   */
  async reapurarPeriodo(
    colaboradorId: string,
    dataInicio: string,
    dataFim: string
  ): Promise<{ sucesso: boolean; dias: number; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    const colaborador = bancoDados.obterColaboradorPorId(colaboradorId);

    if (!colaborador) {
      return { sucesso: false, dias: 0, erro: 'Colaborador não encontrado.' };
    }

    // A MESMA porta de `ajustarMarcacao`: quem corrige o dia reapura o dia
    if (!this.podeAcessarPainelRH(atual) && !this.podeDecidirSobre(colaborador)) {
      return {
        sucesso: false,
        dias: 0,
        erro: 'Reapurar é de quem responde por esta pessoa, ou do RH.',
      };
    }

    /**
     * O banco antes do aparelho, como no resto do ponto: reapurar sobre
     * cache velho reescreveria dias com marcações que já mudaram.
     */
    if (usandoNuvem()) {
      await nuvem.sincronizarPonto();
      await nuvem.sincronizarAjustes();
    }

    let dias = 0;
    for (const data of listarDatasDoPeriodo(dataInicio, dataFim)) {
      // Dia que ainda não fechou não se apura: ele não acabou
      if (data >= dataDeHoje()) continue;

      const antes = this.obterAjusteDoDia(colaboradorId, data);
      await this.apurarDia(colaboradorId, data, undefined, atual);
      const depois = this.obterAjusteDoDia(colaboradorId, data);

      if ((antes?.minutos ?? 0) !== (depois?.minutos ?? 0)) dias += 1;
    }

    bancoDados.registrarAuditoria(
      'Reapuração de Período',
      'seguranca',
      `${atual.nome} reapurou ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)} de ${colaborador.nome}. ${dias} dia(s) mudaram de valor.`
    );
    this.notificar();

    return { sucesso: true, dias };
  }

  /**
   * PREENCHE OS DIAS VAZIOS com o horário do turno da pessoa.
   *
   * O RH precisava digitar quatro batidas por pessoa por dia para fechar
   * um mês. Com 89 pessoas isso não se faz, e o que não se faz vira
   * espelho incompleto — que é pior do que o trabalho.
   *
   * ===================================================================
   * O QUE ISTO É, E O QUE ELE NÃO PODE VIRAR
   * ===================================================================
   *
   * Isto CRIA registro de ponto por dedução: o sistema afirmando que a
   * pessoa cumpriu o turno num dia em que ninguém bateu nada. É
   * documento trabalhista, e por isso vem com quatro travas:
   *
   *  1. SÓ DIA COMPLETAMENTE VAZIO. Uma batida que seja, e o dia fica
   *     como está — dia pela metade é justamente o que precisa de gente
   *     olhando, e preencher o resto apagaria a pergunta.
   *  2. MÉTODO PRÓPRIO. `preenchimento_turno` não se confunde com batida
   *     nem com correção: tem cor no espelho e sai na Auditoria.
   *  3. SÓ DIA QUE JÁ FECHOU, e só dia que a pessoa deveria trabalhar —
   *     domingo, feriado, folga aprovada e sábado de quem não vem ficam
   *     de fora.
   *  4. EXIGE JUSTIFICATIVA, como qualquer lançamento manual.
   *
   * Nenhuma delas é excesso de zelo: sem a primeira, o preenchimento
   * esconderia uma saída não batida; sem a segunda, a fiscalização não
   * teria como separar o que foi batido do que foi suposto.
   */
  async preencherEspelhoPeloTurno(dados: {
    colaboradorId: string;
    dataInicio: string;
    dataFim: string;
    justificativa: string;
  }): Promise<{ sucesso: boolean; dias: number; erro?: string }> {
    const atual = bancoDados.obterColaboradorAtual();
    const colaborador = bancoDados.obterColaboradorPorId(dados.colaboradorId);

    if (!colaborador) {
      return { sucesso: false, dias: 0, erro: 'Colaborador não encontrado.' };
    }
    if (!this.podeAcessarPainelRH(atual) && !this.podeDecidirSobre(colaborador)) {
      return {
        sucesso: false,
        dias: 0,
        erro: 'Preencher espelho é de quem responde por esta pessoa, ou do RH.',
      };
    }
    if (!dados.justificativa.trim()) {
      return { sucesso: false, dias: 0, erro: 'Informe o motivo do preenchimento.' };
    }

    // O banco antes do aparelho: preencher sobre cache velho criaria
    // batida em dia que já tinha marcação lançada de outro lugar
    if (usandoNuvem()) await nuvem.sincronizarPonto();

    const turno = turnoDe(colaborador);
    const hoje = dataDeHoje();
    let dias = 0;

    for (const data of listarDatasDoPeriodo(dados.dataInicio, dados.dataFim)) {
      if (data >= hoje) continue;

      // Dia que não é dela: domingo, feriado, folga, sábado de quem não vem
      const esperadas = marcacoesEsperadas(data, colaborador);
      if (esperadas.length === 0) continue;
      if (situacaoDoDia(dados.colaboradorId, data) !== 'normal') continue;

      // TRAVA 1: uma batida que seja, e o dia fica como está
      const jaTem = this.obterMarcacoesDoDia(dados.colaboradorId, data);
      if (jaTem.length > 0) continue;

      const horarios = this.horariosDoTurnoParaODia(turno, data, esperadas);
      if (!horarios) continue;

      for (const [tipo, hora] of horarios) {
        const base = deDataLocal(data);
        const [h, m] = hora.split(':').map(Number);
        const horario = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0);

        const registro: RegistroPonto = {
          id: `ponto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          colaboradorId: dados.colaboradorId,
          data,
          tipo,
          horario: horario.toISOString(),
          horaFormatada: hora,
          metodo: 'preenchimento_turno',
          loja: colaborador.loja,
          criadoEm: new Date().toISOString(),
          ajustadoPorId: atual.id,
          ajustadoPorNome: atual.nome,
          justificativa: dados.justificativa.trim(),
        };

        if (usandoNuvem()) {
          const res = await nuvem.salvarRegistroPonto(registro);
          if (!res.sucesso && !res.duplicado) {
            return {
              sucesso: false,
              dias,
              erro: `Não foi possível gravar ${formatarDataBR(data)}: ${res.erro || 'recusado pelo banco'}`,
            };
          }
        }

        const registros = this.lerRegistros();
        registros.push(registro);
        this.gravarRegistros(registros);
      }

      await this.apurarDia(dados.colaboradorId, data, undefined, atual);
      dias += 1;
    }

    if (dias > 0) {
      bancoDados.registrarAuditoria(
        'Preenchimento de Espelho',
        'seguranca',
        `${atual.nome} preencheu ${dias} dia(s) vazio(s) de ${colaborador.nome} entre ${formatarDataBR(dados.dataInicio)} e ${formatarDataBR(dados.dataFim)} com o horário do turno ${turno.nome}. Motivo: ${dados.justificativa.trim()}`
      );
    }
    this.notificar();

    return { sucesso: true, dias };
  }

  /**
   * Os horários que o turno prevê para AQUELE dia, na ordem das batidas.
   *
   * Separado porque o sábado tem relógio próprio e o dia útil depende de
   * o turno ter almoço — e embutir isso no laço do preenchimento faria a
   * mesma decisão existir em dois lugares.
   */
  private horariosDoTurnoParaODia(
    turno: Turno,
    data: string,
    esperadas: TipoMarcacao[]
  ): Array<[TipoMarcacao, string]> | null {
    if (ehSabado(data)) {
      return [
        ['entrada', TURNO_SABADO.entrada],
        ['saida', TURNO_SABADO.saida],
      ];
    }

    if (esperadas.length === 4 && turno.intervalo) {
      return [
        ['entrada', turno.entrada],
        ['saida_almoco', turno.intervalo.saida],
        ['retorno_almoco', turno.intervalo.retorno],
        ['saida', turno.saida],
      ];
    }

    if (esperadas.length === 2) {
      return [
        ['entrada', turno.entrada],
        ['saida', turno.saida],
      ];
    }

    // Combinação que o turno não sabe desenhar: melhor não inventar nada
    return null;
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
    const quem = registro.ajustadoPorNome || 'RH';
    const porque = registro.justificativa ? `: ${registro.justificativa}` : '';

    if (registro.metodo === 'ajuste_rh') return `Ajuste RH — ${quem}${porque}`;

    /**
     * OS DOIS QUE FALTAVAM, e o silêncio deles era grave.
     *
     * `ajuste_lider` e `preenchimento_turno` não tinham linha aqui e caíam
     * no `return` final — o espelho imprimia "QR — Pirassununga" num
     * horário que a pessoa NÃO bateu.
     *
     * Num documento que se assina e se arquiva, isso é o sistema
     * afirmando uma batida que não houve. O preenchimento é o pior dos
     * dois: ele foi deduzido do turno, e sem esta linha nada no papel
     * diria isso.
     */
    if (registro.metodo === 'ajuste_lider') return `Correção — ${quem}${porque}`;
    if (registro.metodo === 'preenchimento_turno') {
      return `Preenchido pelo horário do turno — ${quem}${porque}`;
    }

    if (registro.metodo === 'codigo_manual') return `Código digitado — ${registro.loja}`;
    return `QR — ${registro.loja}`;
  }

  /** A marcação foi batida pela pessoa, ou escrita por alguém/pelo sistema? */
  private foiBatidaPelaPessoa(registro: RegistroPonto): boolean {
    return registro.metodo === 'qrcode' || registro.metodo === 'codigo_manual';
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

        /**
         * AS ORIGENS SAÍRAM DA GRADE E VIRARAM RODAPÉ.
         *
         * "Origem das marcações" era uma coluna com até quatro frases por
         * dia — "Entrada: QR — Pirassununga | Saída almoço: QR — ...". Ela
         * quebrava linha, cada dia virava três ou quatro alturas, e o mês
         * de 31 dias não cabia na folha de pé: o espelho de uma pessoa
         * saía em duas páginas.
         *
         * E o que ela dizia na esmagadora maioria dos dias era "QR",
         * repetido quatro vezes — a informação que menos precisa estar
         * ali, porque é o normal.
         *
         * Agora a grade tem uma coluna estreita de nota, e só os dias que
         * FOGEM do normal — correção, preenchimento — ganham número e
         * aparecem embaixo, por extenso. O que interessa a quem confere o
         * documento fica mais visível, não menos.
         */
        const notas: string[] = [];

        const linhas = dias
          .map((j) => {
            const foraDoComum = ORDEM_MARCACOES.map((t) => j.marcacoes[t])
              .filter((r): r is RegistroPonto => !!r)
              .filter((r) => !this.foiBatidaPelaPessoa(r));

            let nota = '';
            if (foraDoComum.length > 0) {
              notas.push(
                `<li><strong>${formatarDataBR(j.data)}</strong> — ${escapar(
                  foraDoComum
                    .map((r) => `${ROTULO_MARCACAO[r.tipo]}: ${this.descreverOrigem(r)}`)
                    .join(' | ')
                )}</li>`
              );
              nota = String(notas.length);
            }

            /**
             * O QUE O DIA ESPERA, e não as quatro colunas sempre.
             *
             * No sábado não há almoço: a loja abre às 8 e fecha ao meio-dia,
             * direto. O espelho imprimia `--:--` nas duas colunas do
             * intervalo, e num documento de ponto isso se lê como batida
             * esquecida — não como "não se aplica".
             *
             * Em feriado fechado não se espera nada, e as quatro colunas
             * ficam traçadas.
             */
            const celulas = ORDEM_MARCACOES.map((t) => {
              const motivo = motivoSemMarcacao(j.data, t, resumo.colaborador);

              /**
               * A célula que o dia não espera diz POR QUE está vazia.
               *
               * Se a pessoa bateu mesmo assim — hora extra no feriado, um
               * domingo trabalhado — o horário vence o rótulo: o documento
               * tem de mostrar o que aconteceu, não o que era previsto.
               */
              if (motivo && !j.marcacoes[t]) {
                return `<td class="hora naoSeAplica">${escapar(motivo)}</td>`;
              }

              const reg = j.marcacoes[t];
              const ajuste = reg && ehMarcacaoCorrigida(reg.metodo) ? ' *' : '';
              return `<td class="hora">${reg ? reg.horaFormatada + ajuste : '--:--'}</td>`;
            }).join('');

            const feriadoDoDia = feriadoEm(j.data, resumo.colaborador.loja);
            const semMarcacao = Object.keys(j.marcacoes).length === 0;

            return `<tr class="${semMarcacao ? 'vazio' : ''}">
              ${/*
                DATA E DIA DA SEMANA NA MESMA LINHA.

                Eram duas, com um <br> entre elas. Numa folha deitada isso
                não custava nada; de pé, dobrar a altura de 31 linhas é o
                que decide se o mês fecha numa página ou vira duas.

                O feriado continua ganhando o nome inteiro — é a única
                informação da coluna que explica um dia vazio, e vale a
                linha extra nos poucos dias em que aparece.
              */ ''}
              <td class="dia">${formatarDataBR(j.data)} <span class="semana">${
                feriadoDoDia
                  ? escapar(feriadoDoDia.nome)
                  : formatarDiaCurto(j.data).split(',')[0]
              }</span></td>
              ${celulas}
              <td class="num">${formatarMinutos(j.minutosTrabalhados)}</td>
              <td class="num">${formatarMinutos(j.minutosPrevistos)}</td>
              <td class="num ${j.saldoMinutos < 0 ? 'neg' : ''}">${
                j.minutosTrabalhados === 0 ? '—' : formatarSaldo(j.saldoMinutos)
              }</td>
              <td class="nota-ref">${nota}</td>
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
                <th>Nota</th>
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

          ${
            notas.length > 0
              ? `<div class="notas">
            <strong>Notas — marcações que não foram batidas pela pessoa</strong>
            <ol>${notas.join('')}</ol>
          </div>`
              : `<p class="nota">
            Todas as marcações do período foram batidas pelo próprio colaborador.
          </p>`
          }

          <div class="assinaturas">
            <div><span class="linha"></span>Assinatura do colaborador</div>
            <div><span class="linha"></span>Responsável / RH</div>
          </div>
        </section>`;
      })
      .join('');

    /**
     * O ESTILO COMUM MORA EM `documento`.
     *
     * Aqui fica só o que é deste papel: a grade de marcações e o quadro de
     * totais. Cabeçalho, bordas, assinaturas e fonte de número são os
     * mesmos de qualquer documento da Malachias — e é por isso que a
     * escala de folgas agora sai parecida com este.
     */
    return montarDocumento({
      titulo: `Espelho de Ponto — ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}`,
      /**
       * A FOLHA FICA DE PÉ.
       *
       * Estava em paisagem porque a grade tem sete colunas e coube melhor
       * deitada. Só que espelho de ponto é documento que se arquiva, se
       * assina e se entrega — e no meio de uma pasta de papel de pé, uma
       * folha deitada é a que some.
       */
      orientacao: 'retrato',
      estiloExtra: `
  /*
    OS NÚMEROS ENCOLHERAM PARA A FOLHA DE PÉ.

    Em paisagem sobravam ~90mm de largura para as sete colunas. De pé
    sobram ~65mm, e o que estourava primeiro era a coluna de origem —
    ela empurrava as marcações e quebrava o horário em duas linhas, que
    num documento de ponto é o pior lugar para haver dúvida.
  */
  .marcacoes { font-size: 10px; table-layout: fixed; }
  .marcacoes th { background: #eee; border: 1px solid #999; padding: 4px 2px; font-size: 9px; text-transform: uppercase; }
  .marcacoes td { border: 1px solid #bbb; padding: 3px 2px; text-align: center; }
  .marcacoes .dia { text-align: left; white-space: nowrap; font-weight: 600; font-size: 9px; }
  .semana { font-weight: 400; color: #666; text-transform: capitalize; }
  /*
    A NOTA É UM NÚMERO, e a coluna tem largura de número.

    Enquanto ali cabia texto livre, a linha do dia crescia junto e o mês
    não fechava numa folha. Agora ela não quebra: o que cresce é o rodapé,
    e ele cresce uma vez por documento, não uma vez por dia.
  */
  .marcacoes .nota-ref { width: 22px; font-size: 9px; color: #555; }
  .notas { margin-top: 10px; font-size: 9px; color: #333; }
  .notas ol { margin: 4px 0 0 16px; padding: 0; }
  .notas li { margin-bottom: 2px; }
  .naoSeAplica { color: #bbb; }
  .vazio td { background: #fafafa; }
  /* De pé, 60% de largura deixava o quadro de totais solto no meio */
  .totais { margin-top: 12px; width: 85%; font-size: 11px; }
  .totais td { border: 1px solid #bbb; padding: 5px 8px; }
  .totais .destaque td { font-weight: 700; background: #f2f2f2; }
      `,
      corpo: folhas || '<p>Nenhum colaborador no período selecionado.</p>',
    });
  }
}

export const servicoPonto = new ServicoPonto();
