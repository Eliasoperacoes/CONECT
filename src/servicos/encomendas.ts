/**
 * ENCOMENDAS E O PAINEL DE PEDIDOS (docs/cotador/SPEC-pedidos-compras.md,
 * Elias 21/10/2026).
 *
 * O vendedor encomenda pela cotação; Compras monta os pedidos do dia por
 * fornecedor; o vendedor confirma o "Recebi". Quem pode cada passo, o custo
 * e o horário de corte moram no banco (cotador-encomendas.sql). Aqui: as
 * colunas com a conta do pedido mínimo e as mensagens do chat.
 *
 * O sistema SÓ MOSTRA (Elias): a conta e as cores. Não junta, não troca
 * fornecedor, não fecha pedido sozinho.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { avisarRecadoDaEncomenda, avisarRecados } from './recados';
import { hojeEmBrasilia } from './apuracaoDoDia';
import { lerValor } from './cotacaoHumana';

export type SituacaoDaEncomenda = 'encomendada' | 'cancelada' | 'pedido_realizado' | 'em_transferencia' | 'em_conferencia' | 'recebida' | 'entregue';

export const ROTULO_DA_SITUACAO: Record<SituacaoDaEncomenda, string> = {
  encomendada: 'Encomendada',
  cancelada: 'Cancelada',
  pedido_realizado: 'Pedido realizado',
  em_transferencia: 'Em transferência',
  em_conferencia: 'Em conferência',
  recebida: 'Recebida',
  entregue: 'Entregue',
};

/** Ainda a caminho do cliente: o aviso "já encomendada" da cotação e a lista "Em andamento" do vendedor */
export const EM_ANDAMENTO: SituacaoDaEncomenda[] = ['encomendada', 'pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida'];

/** O problema na chegada (marcar_problema): não muda a situação, espera Compras resolver. */
export type ProblemaDaEncomenda = 'errada' | 'faltou' | 'avariada' | 'preco' | 'outro';

export const ROTULO_DO_PROBLEMA: Record<ProblemaDaEncomenda, string> = {
  errada: 'Peça errada',
  faltou: 'Faltou peça',
  avariada: 'Avariada',
  preco: 'Preço diferente',
  outro: 'Outro problema',
};

/** Como Compras resolve o problema: troca e devolvida são devoluções ao fornecedor. */
export type DesfechoDoProblema = 'troca' | 'devolvida' | 'aceita';

/** Até o cliente (SPEC-comunicacao-recebimento): o que as duas leituras trazem a mais. */
interface AteOCliente {
  transferencia_em: string | null;
  entregue_em: string | null;
  problema: ProblemaDaEncomenda | null;
  problema_detalhe: string | null;
  problema_em: string | null;
  problema_resolvido_em: string | null;
  problema_resolucao: string | null;
  desistiu_em: string | null;
}

/** Uma encomenda como o painel de Compras recebe (`encomendas_de_compras`). */
export interface EncomendaDeCompras extends Partial<AteOCliente> {
  id: string;
  codigo: string;
  origem: 'b2b' | 'comprador';
  fornecedor_chave: string | null;
  fornecedor_nome: string;
  pedido_minimo: number | null;
  marca: string | null;
  descricao: string | null;
  local: string | null;
  venda: number | null;
  custo: number | null;
  prazo: string | null;
  quantidade: number;
  observacao: string | null;
  situacao: SituacaoDaEncomenda;
  vendedor_id: string | null;
  nome_do_vendedor: string | null;
  loja: string | null;
  criada_em: string;
  pedido_em: string | null;
  conferencia_em: string | null;
  cancelada_em?: string | null;
  cancelada_pelo_vendedor?: boolean | null;
  motivo_cancelamento?: string | null;
  recebida_em?: string | null;
  cotada_em?: string | null;
  /** Quando o preço foi consultado no fornecedor: vale 24 h (precoVencido) */
  preco_consultado_em?: string | null;
  /** O dia previsto de chegada (AAAA-MM-DD), gravado no pedido */
  previsao_chegada?: string | null;
}

/** Uma peça da loja que espera o vendedor (encomendas_da_loja): o Gerente age por ele depois de 1 dia. */
export interface EncomendaDaLoja {
  id: string;
  codigo: string;
  fornecedor_nome: string;
  marca: string | null;
  quantidade: number;
  observacao: string | null;
  situacao: SituacaoDaEncomenda;
  vendedor_id: string | null;
  nome_do_vendedor: string | null;
  conferencia_em: string | null;
  recebida_em: string | null;
  pode_agir: boolean;
}

/** Uma encomenda do vendedor (`minhas_encomendas`): o custo vem nulo para quem não vê custo. */
export interface MinhaEncomenda extends AteOCliente {
  id: string;
  codigo: string;
  codigo_cotado: string;
  origem: 'b2b' | 'comprador';
  fornecedor_nome: string;
  marca: string | null;
  descricao: string | null;
  venda: number | null;
  custo: number | null;
  prazo: string | null;
  quantidade: number;
  observacao: string | null;
  situacao: SituacaoDaEncomenda;
  criada_em: string;
  cancelavel_ate: string;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  pedido_em: string | null;
  conferencia_em: string | null;
  recebida_em: string | null;
}

/**
 * A COLUNA DE UM FORNECEDOR no "Montar pedidos": as encomendas e a conta.
 *   · fecha: a soma do custo já alcança o pedido mínimo (verde);
 *   · falta: ainda não (vermelho, com quanto falta);
 *   · sem_minimo: fornecedor sem mínimo, ou de fora do B2B (neutro).
 */
export interface ColunaDoFornecedor {
  chave: string;
  nome: string;
  pedidoMinimo: number | null;
  encomendas: EncomendaDeCompras[];
  /** Soma de custo × quantidade das que têm custo */
  total: number;
  /** Quantas vieram sem custo (resposta do comprador sem custo): a conta não as inclui */
  semCusto: number;
  situacao: 'fecha' | 'falta' | 'sem_minimo';
  falta: number;
  /** A encomenda que espera há mais tempo */
  maisAntiga: string;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export const colunasPorFornecedor = (lista: EncomendaDeCompras[]): ColunaDoFornecedor[] => {
  const porChave = new Map<string, EncomendaDeCompras[]>();
  for (const e of lista) {
    // Fora do B2B não há chave: o nome digitado pelo comprador agrupa
    const chave = e.fornecedor_chave ?? `fora:${e.fornecedor_nome.trim().toUpperCase()}`;
    porChave.set(chave, [...(porChave.get(chave) ?? []), e]);
  }
  const colunas = [...porChave.entries()].map(([chave, encomendas]): ColunaDoFornecedor => {
    const total = centavos(encomendas.reduce((s, e) => s + (e.custo == null ? 0 : Number(e.custo) * e.quantidade), 0));
    const minimo = encomendas[0].pedido_minimo == null ? null : Number(encomendas[0].pedido_minimo);
    const temMinimo = minimo != null && minimo > 0;
    return {
      chave,
      nome: encomendas[0].fornecedor_nome,
      pedidoMinimo: temMinimo ? minimo : null,
      encomendas,
      total,
      semCusto: encomendas.filter((e) => e.custo == null).length,
      situacao: !temMinimo ? 'sem_minimo' : total >= minimo ? 'fecha' : 'falta',
      falta: temMinimo ? centavos(Math.max(0, minimo - total)) : 0,
      maisAntiga: encomendas.reduce((a, e) => (e.criada_em < a ? e.criada_em : a), encomendas[0].criada_em),
    };
  });
  // O que já fecha primeiro; depois o que menos falta; os sem mínimo no fim
  const peso = { fecha: 0, falta: 1, sem_minimo: 2 } as const;
  return colunas.sort((a, b) => peso[a.situacao] - peso[b.situacao] || a.falta - b.falta || a.nome.localeCompare(b.nome));
};

/**
 * O PAINEL DE COMPRAS (Elias, 22/10/2026: "um dashboard com todas as
 * informações, extremamente organizado e usável, e linkado"): os números
 * de cada etapa e a atividade de hoje — onde os cancelamentos aparecem,
 * em vez de numa faixa que poluía o "Montar pedidos".
 */
export type TipoDaAtividade = 'encomenda' | 'pedido' | 'chegada' | 'recebida' | 'cancelada';
export interface AtividadeDoDia {
  quando: string;
  tipo: TipoDaAtividade;
  texto: string;
}

export interface ResumoDoPainel {
  paraPedir: number;
  custoParaPedir: number;
  colunas: ColunaDoFornecedor[];
  /** Fornecedores com mínimo que já fecham / quantos têm mínimo */
  prontos: number;
  comMinimo: number;
  aguardandoChegada: number;
  pedidoMaisAntigo: string | null;
  emConferencia: number;
  conferenciaMaisAntiga: string | null;
  atividade: AtividadeDoDia[];
}

/** O dia (AAAA-MM-DD) em Brasília de um instante: a conta é a de hojeEmBrasilia */
const diaEmBrasilia = (iso: string) => hojeEmBrasilia(new Date(iso));
const maisAntigo = (datas: (string | null)[]) => datas.filter((d): d is string => !!d).sort()[0] ?? null;

export const resumoDoPainel = (lista: EncomendaDeCompras[], agora: Date = new Date()): ResumoDoPainel => {
  const de = (s: SituacaoDaEncomenda) => lista.filter((e) => e.situacao === s);
  const paraPedir = de('encomendada');
  const colunas = colunasPorFornecedor(paraPedir);
  const chegada = de('pedido_realizado');
  const conferencia = de('em_conferencia');

  const hoje = diaEmBrasilia(agora.toISOString());
  const eHoje = (iso: string | null | undefined): iso is string => !!iso && diaEmBrasilia(iso) === hoje;
  const peca = (e: EncomendaDeCompras) => `${e.quantidade}× ${e.codigo} · ${e.fornecedor_nome}`;
  const quem = (e: EncomendaDeCompras) => e.nome_do_vendedor ?? 'Vendedor';
  const atividade: AtividadeDoDia[] = [];
  // Pedido e chegada são do fornecedor inteiro, de uma vez: uma linha por vez, não por peça
  const porLote = new Map<string, { tipo: TipoDaAtividade; quando: string; fornecedor: string; n: number }>();
  for (const e of lista) {
    if (eHoje(e.criada_em)) atividade.push({ quando: e.criada_em, tipo: 'encomenda', texto: `${quem(e)} encomendou ${peca(e)}` });
    for (const [tipo, quando] of [
      ['pedido', e.pedido_em],
      ['chegada', e.conferencia_em],
    ] as const) {
      if (!eHoje(quando)) continue;
      const chave = `${tipo}|${e.fornecedor_nome}|${quando.slice(0, 16)}`;
      const lote = porLote.get(chave) ?? { tipo, quando, fornecedor: e.fornecedor_nome, n: 0 };
      lote.n += 1;
      porLote.set(chave, lote);
    }
    if (eHoje(e.recebida_em)) atividade.push({ quando: e.recebida_em, tipo: 'recebida', texto: `${quem(e)} recebeu ${peca(e)}` });
    if (eHoje(e.cancelada_em)) {
      atividade.push({
        quando: e.cancelada_em,
        tipo: 'cancelada',
        texto: e.cancelada_pelo_vendedor
          ? `${quem(e)} cancelou ${peca(e)}`
          : `Compras cancelou ${peca(e)}${e.motivo_cancelamento ? ` (${e.motivo_cancelamento})` : ''}`,
      });
    }
  }
  for (const l of porLote.values()) {
    const qtd = `${l.n} ${l.n === 1 ? 'encomenda' : 'encomendas'}`;
    atividade.push({ quando: l.quando, tipo: l.tipo, texto: l.tipo === 'pedido' ? `Pedido realizado na ${l.fornecedor}: ${qtd}` : `Chegou da ${l.fornecedor}: ${qtd} em conferência` });
  }

  const comMinimo = colunas.filter((c) => c.situacao !== 'sem_minimo');
  return {
    paraPedir: paraPedir.length,
    custoParaPedir: centavos(colunas.reduce((s, c) => s + c.total, 0)),
    colunas,
    prontos: comMinimo.filter((c) => c.situacao === 'fecha').length,
    comMinimo: comMinimo.length,
    aguardandoChegada: chegada.length,
    pedidoMaisAntigo: maisAntigo(chegada.map((e) => e.pedido_em)),
    emConferencia: conferencia.length,
    conferenciaMaisAntiga: maisAntigo(conferencia.map((e) => e.conferencia_em)),
    atividade: atividade.sort((a, b) => b.quando.localeCompare(a.quando)),
  };
};

/**
 * OS FORNECEDORES DO PAINEL (Elias, 26/10/2026: "estamos falando de 12
 * fornecedores e possivelmente entrarão mais"). Com encomenda, um cartão
 * cada: primeiro quem já pode ser pedido (fecha o mínimo ou não tem
 * mínimo), depois o que menos falta. Sem encomenda, a lista compacta dos
 * ligados, na ordem do cadastro.
 */
export const fornecedoresDoPainel = (
  colunas: ColunaDoFornecedor[],
  ligados: ConfiguracaoDeCompras['fornecedores']
): { comEncomenda: ColunaDoFornecedor[]; semEncomenda: ConfiguracaoDeCompras['fornecedores'] } => {
  // Quem já pode ser pedido tem "falta" zero: a ordem pelo que falta o põe na frente
  const comEncomenda = [...colunas].sort((a, b) => a.falta - b.falta || b.total - a.total || a.nome.localeCompare(b.nome));
  const temEncomenda = new Set(colunas.map((c) => c.chave));
  return { comEncomenda, semEncomenda: ligados.filter((f) => !temEncomenda.has(f.chave)) };
};

/**
 * "PRECISA DE VOCÊ AGORA": o que o comprador tem a fazer, em ordem — o
 * vendedor esperando resposta no balcão primeiro, depois o que já pode ser
 * pedido, depois a peça parada na conferência. Nada a fazer = lista vazia
 * (a tela diz "Tudo em dia"). `idade` escreve "há 20 d" (vem da tela).
 */
export type DestinoDaAcao = 'solicitacoes' | 'montar' | 'chegada' | 'transferencia' | 'conferencia';

/** Precisa de Compras decidir: problema aberto, ou cliente que desistiu e a peça ainda sem destino. */
export const esperaCompras = (e: Pick<EncomendaDeCompras, 'problema' | 'problema_resolvido_em' | 'desistiu_em' | 'situacao'>): boolean =>
  (!!e.problema && !e.problema_resolvido_em) || (!!e.desistiu_em && e.situacao !== 'cancelada' && e.situacao !== 'entregue');
export interface AcaoDoPainel {
  tom: 'atencao' | 'ok' | 'acento';
  titulo: string;
  porque: string;
  destino: DestinoDaAcao;
}

const nomesEmFrase = (nomes: string[]) =>
  nomes.length <= 2 ? nomes.join(' e ') : `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`;

export const acoesDoPainel = (
  r: Pick<ResumoDoPainel, 'colunas' | 'emConferencia' | 'conferenciaMaisAntiga'>,
  solicitacoesAbertas: { criadaEm: string }[],
  idade: (iso: string) => string,
  brl: (v: number) => string,
  /** As encomendas do painel: problemas, desistências, transferências e atrasos (SPEC-comunicacao-recebimento) */
  encomendas: Pick<EncomendaDeCompras, 'problema' | 'problema_resolvido_em' | 'desistiu_em' | 'situacao' | 'previsao_chegada'>[] = [],
  agora: Date = new Date()
): AcaoDoPainel[] => {
  const acoes: AcaoDoPainel[] = [];
  // Primeiro o que travou: problema na chegada e cliente que desistiu
  const resolver = encomendas.filter(esperaCompras);
  if (resolver.length) {
    const n = resolver.length;
    acoes.push({
      tom: 'atencao',
      titulo: `${n} ${n === 1 ? 'encomenda para resolver' : 'encomendas para resolver'}`,
      porque: 'Problema na chegada ou cliente que desistiu: o vendedor espera a sua decisão.',
      destino: 'montar',
    });
  }
  if (solicitacoesAbertas.length) {
    const n = solicitacoesAbertas.length;
    const antiga = solicitacoesAbertas.map((s) => s.criadaEm).sort()[0];
    acoes.push({
      tom: 'atencao',
      titulo: `${n} ${n === 1 ? 'solicitação de cotação esperando' : 'solicitações de cotação esperando'}`,
      porque: `O vendedor espera ${idade(antiga)}: o site não achou a peça.`,
      destino: 'solicitacoes',
    });
  }
  const prontos = r.colunas.filter((c) => c.situacao !== 'falta');
  if (prontos.length) {
    const nomes = prontos.map((c) => c.nome);
    acoes.push({
      tom: 'ok',
      titulo: `${nomesEmFrase(nomes)} ${prontos.length === 1 ? 'já pode ser pedido' : 'já podem ser pedidos'}`,
      porque: prontos
        .slice(0, 2)
        .map((c) => (c.situacao === 'fecha' ? `${c.nome} fecha o mínimo (${brl(c.total)} de ${brl(c.pedidoMinimo ?? 0)})` : `${c.nome} não tem mínimo`))
        .join('; ') + '.',
      destino: 'montar',
    });
  }
  const hoje = diaEmBrasilia(agora.toISOString());
  const atrasadas = encomendas.filter((e) => e.situacao === 'pedido_realizado' && !!e.previsao_chegada && e.previsao_chegada < hoje).length;
  if (atrasadas) {
    acoes.push({
      tom: 'atencao',
      titulo: `${atrasadas} ${atrasadas === 1 ? 'pedido passou' : 'pedidos passaram'} do dia previsto`,
      porque: 'Cobre o fornecedor: o vendedor prometeu a peça ao cliente pela previsão.',
      destino: 'chegada',
    });
  }
  const emTransferencia = encomendas.filter((e) => e.situacao === 'em_transferencia').length;
  if (emTransferencia) {
    acoes.push({
      tom: 'acento',
      titulo: `${emTransferencia} ${emTransferencia === 1 ? 'peça em transferência' : 'peças em transferência'} para as lojas`,
      porque: 'Marque "Chegou na loja" quando a transferência chegar: só então o vendedor confere.',
      destino: 'transferencia',
    });
  }
  if (r.emConferencia) {
    acoes.push({
      tom: 'atencao',
      titulo: `${r.emConferencia} ${r.emConferencia === 1 ? 'encomenda esperando' : 'encomendas esperando'} o “Recebi” do vendedor`,
      porque: r.conferenciaMaisAntiga ? `A mais antiga chegou ${idade(r.conferenciaMaisAntiga)}. Cobre a loja ou confira você mesmo.` : 'Cobre a loja ou confira você mesmo.',
      destino: 'conferencia',
    });
  }
  // Ninguém pronto: o que está mais perto de fechar (as colunas já vêm do que menos falta)
  const perto = r.colunas.find((c) => c.situacao === 'falta');
  if (!prontos.length && perto) {
    const n = r.colunas.length;
    acoes.push({
      tom: 'acento',
      titulo: `${perto.nome} está a ${brl(perto.falta)} do mínimo`,
      porque: `${n} ${n === 1 ? 'fornecedor tem' : 'fornecedores têm'} encomenda, nenhum fecha o mínimo ainda.`,
      destino: 'montar',
    });
  }
  return acoes;
};

/**
 * O pedido mínimo digitado nas Configurações: o valor, ou ZERO ("sem mínimo",
 * o que a tela promete). lerValor recusa zero — numa venda, zero é erro.
 */
export const lerPedidoMinimo = (texto: string): number | null =>
  /^\s*(R\$)?\s*0+([.,]0+)?\s*$/i.test(texto) ? 0 : lerValor(texto);

/**
 * As marcadas de uma coluna de Compras quando a lista muda: a encomenda que
 * APARECE pela primeira vez entra marcada; a que o comprador desmarcou continua
 * desmarcada (senão uma releitura qualquer a punha de volta, e o "Pedido
 * realizado" fechava a peça que ele tirou); a que saiu da coluna sai.
 */
export const marcadasDaColuna = (marcadas: ReadonlySet<string>, jaVistas: ReadonlySet<string>, ids: string[]): Set<string> =>
  new Set(ids.filter((id) => marcadas.has(id) || !jaVistas.has(id)));

/** O preço vale 24 h depois de consultado (Elias, 26/10/2026); o banco recusa encomendar com ele vencido. */
export const HORAS_DE_VALIDADE = 24;
export const precoVencido = (e: Pick<EncomendaDeCompras, 'preco_consultado_em'>, agora: Date = new Date()): boolean =>
  !!e.preco_consultado_em && agora.getTime() - new Date(e.preco_consultado_em).getTime() > HORAS_DE_VALIDADE * 3_600_000;

/** Encomendada agora, entra no pedido de hoje ou de amanhã? Pelo "cancelável até" que o banco calcula (o corte). */
export const entraAmanha = (cancelavelAte: string, agora: Date = new Date()): boolean =>
  diaEmBrasilia(cancelavelAte) !== diaEmBrasilia(agora.toISOString());

/** O vendedor ainda pode cancelar? Encomendada e antes do corte (o banco confere de novo). */
export const podeCancelar = (e: Pick<MinhaEncomenda, 'situacao' | 'cancelavel_ate'>, agora: Date = new Date()): boolean =>
  e.situacao === 'encomendada' && agora.getTime() <= new Date(e.cancelavel_ate).getTime();

/**
 * AS MENSAGENS DO CHAT ao vendedor: o BANCO as escreve, na mesma transação
 * do passo (texto_do_aviso em cotador-encomendas.sql), na conversa de
 * encomendas do vendedor. Aqui só se reconhece de que passo é o recado — as
 * aberturas são as do SQL (encomendas.test.ts confere as duas).
 */
export type AvisoDaEncomenda = 'pedido_realizado' | 'em_conferencia' | 'cancelada';

const ABERTURA: Record<AvisoDaEncomenda, string> = {
  pedido_realizado: 'Sua encomenda foi realizada:',
  em_conferencia: 'Sua peça chegou e está em conferência no estoque:',
  cancelada: 'Sua encomenda foi cancelada por Compras:',
};

/**
 * O cartão do chat lê as encomendas uma vez para todos os recados da conversa
 * (abrir a conversa monta todos de uma vez). Lê de novo: outra pessoa, mais de
 * 15 s, ou um recado que APARECEU depois da leitura — chegou com a conversa
 * aberta, o passo acabou de mudar; senão "Em conferência" chegaria sem o
 * Recebi. Tudo no relógio do aparelho: o do banco nunca bate com ele.
 */
export const ABERTURA_DA_CONVERSA_MS = 1_500;
export const precisaLerDeNovo = (
  l: { eu: string; em: number; recados: ReadonlySet<string> } | null,
  eu: string,
  recadoId: string,
  agora: number
): boolean => !l || l.eu !== eu || agora - l.em > 15_000 || (!l.recados.has(recadoId) && agora - l.em > ABERTURA_DA_CONVERSA_MS);

/** De que aviso é a mensagem do chat — o cartão de conferência é o que leva o botão Recebi. */
export const avisoDaMensagem = (texto: string | undefined): AvisoDaEncomenda | null =>
  (Object.keys(ABERTURA) as AvisoDaEncomenda[]).find((a) => texto?.startsWith(ABERTURA[a])) ?? null;

/** As colunas numeric do banco chegam como texto: viram número (também nos Relatórios) */
export const numeros = <T extends object>(linhas: T[], campos: (keyof T)[]): T[] =>
  linhas.map((l) => {
    const c = { ...l } as Record<string, unknown>;
    for (const k of campos) if (c[k as string] != null) c[k as string] = Number(c[k as string]);
    return c as T;
  });

export interface ConfiguracaoDeCompras {
  horarioCorte: string; // "15:59"
  fornecedores: { chave: string; nome: string; pedido_minimo: number }[];
}

/**
 * UMA RECARGA POR RAJADA. "Pedido realizado" em 30 encomendas são 30 avisos
 * do tempo real; a tela que só relê a lista relê uma vez, quando a rajada
 * passa — e não 30 vezes, cada uma baixando a lista inteira (LIMITES-SUPABASE).
 * Parar de ouvir também cancela a releitura pendente: a tela que fechou não
 * lê mais nada.
 */
export const ouvirEmRajada = (ouvir: (aoMudar: () => void) => () => void, fazer: () => void, espera = 400): (() => void) => {
  let marcado: ReturnType<typeof setTimeout> | undefined;
  const parar = ouvir(() => {
    clearTimeout(marcado);
    marcado = setTimeout(fazer, espera);
  });
  return () => {
    clearTimeout(marcado);
    parar();
  };
};

/** O que um passo em lote devolve: cada encomenda que mudou e o recado do vendedor dela. */
export interface PassoEmLote {
  id: string;
  vendedor_id: string | null;
  situacao: SituacaoDaEncomenda;
  mensagem_id: string | null;
}

const emLote = async (supabase: SupabaseClient, funcao: string, ids: string[]): Promise<PassoEmLote[]> => {
  const { data, error } = await supabase.rpc(funcao, { ids });
  if (error) throw error;
  const mudaram = (data ?? []) as PassoEmLote[];
  void avisarRecados(supabase, mudaram.map((m) => m.mensagem_id));
  return mudaram;
};

/** Um passo de uma encomenda: o banco devolve o recado que escreveu (ou nada). */
const umPasso = async (supabase: SupabaseClient, funcao: string, argumentos: Record<string, unknown>): Promise<void> => {
  const { data, error } = await supabase.rpc(funcao, argumentos);
  if (error) throw error;
  void avisarRecados(supabase, [data as string | null]);
};

export const encomendasPeloSupabase = (supabase: SupabaseClient) => ({
  /** De um B2B: a peça ou um similar, pelo que a cotação mostrou. */
  /** Com `fator` (o Callcenter), o banco recalcula a venda com ele. */
  async encomendar(p: { codigoCotado: string; codigoPeca: string; fornecedor: string; variante: string | null; quantidade: number; observacao: string; fator?: number | null }) {
    const { data, error } = await supabase.rpc('encomendar', {
      codigo_cotado: p.codigoCotado,
      codigo_peca: p.codigoPeca,
      fornecedor: p.fornecedor,
      variante: p.variante,
      quantidade: p.quantidade,
      observacao: p.observacao,
      fator: p.fator ?? null,
    });
    if (error) throw error;
    // Compras recebe o recado da encomenda nova (escrito pelo banco)
    void avisarRecadoDaEncomenda(supabase, data as string, 'nova_encomenda');
    return data as string;
  },
  /** De uma resposta do comprador (fora do B2B). */
  async encomendarResposta(resposta: string, quantidade: number, observacao: string) {
    const { data, error } = await supabase.rpc('encomendar_resposta', { resposta, quantidade, observacao });
    if (error) throw error;
    void avisarRecadoDaEncomenda(supabase, data as string, 'nova_encomenda');
    return data as string;
  },
  /** O recado (a Compras, ou ao vendedor quando quem cancela é Compras) sai do banco; aqui, a notificação no celular. */
  async cancelar(encomenda: string, motivo?: string): Promise<void> {
    await umPasso(supabase, 'cancelar_encomenda', { encomenda, motivo: motivo ?? null });
  },
  async marcarChegouNaLoja(ids: string[]): Promise<PassoEmLote[]> {
    return emLote(supabase, 'marcar_chegou_na_loja', ids);
  },
  async marcarEntregue(encomenda: string): Promise<void> {
    await umPasso(supabase, 'marcar_entregue', { encomenda });
  },
  async marcarProblema(encomenda: string, tipo: ProblemaDaEncomenda, detalhe: string): Promise<void> {
    await umPasso(supabase, 'marcar_problema', { encomenda, tipo, detalhe });
  },
  /** Troca e devolvida são devoluções ao fornecedor (a métrica); devolvida também cancela. */
  async resolverProblema(encomenda: string, resolucao: string, desfecho: DesfechoDoProblema): Promise<void> {
    await umPasso(supabase, 'resolver_problema', { encomenda, resolucao, desfecho });
  },
  async clienteDesistiu(encomenda: string): Promise<void> {
    await umPasso(supabase, 'cliente_desistiu', { encomenda });
  },
  async destinarDesistencia(encomenda: string, destino: 'devolver' | 'estoque'): Promise<void> {
    await umPasso(supabase, 'destinar_desistencia', { encomenda, destino });
  },
  async minhas(): Promise<MinhaEncomenda[]> {
    const { data, error } = await supabase.rpc('minhas_encomendas');
    if (error) throw error;
    return numeros((data ?? []) as MinhaEncomenda[], ['venda', 'custo']);
  },
  async deCompras(situacoes: SituacaoDaEncomenda[]): Promise<EncomendaDeCompras[]> {
    const { data, error } = await supabase.rpc('encomendas_de_compras', { situacoes });
    if (error) throw error;
    return numeros((data ?? []) as EncomendaDeCompras[], ['venda', 'custo', 'pedido_minimo']);
  },
  /** As que mudaram. Os recados aos vendedores já saíram do banco. */
  async marcarPedidoRealizado(ids: string[]): Promise<PassoEmLote[]> {
    return emLote(supabase, 'marcar_pedido_realizado', ids);
  },
  /** Na loja que recebe direto, em conferência; nas outras, em transferência. */
  async marcarEmConferencia(ids: string[]): Promise<PassoEmLote[]> {
    return emLote(supabase, 'marcar_em_conferencia', ids);
  },
  /** Até quando a encomenda feita agora pode ser cancelada: o corte de hoje, ou o de amanhã. */
  async cancelavelAte(): Promise<string> {
    const { data, error } = await supabase.rpc('prazo_de_cancelamento', { feita: new Date().toISOString() });
    if (error) throw error;
    return data as string;
  },
  /**
   * Quantas esperam pedido (o número da aba Pedidos). Só a contagem: o número
   * da aba não baixa a lista inteira a cada mudança (LIMITES-SUPABASE.md).
   */
  async contarParaPedir(): Promise<number> {
    const { count, error } = await supabase.from('encomendas').select('id', { count: 'exact', head: true }).eq('situacao', 'encomendada');
    if (error) throw error;
    return count ?? 0;
  },
  /** O Gerente: as peças da loja que esperam o vendedor. */
  async daLoja(): Promise<EncomendaDaLoja[]> {
    const { data, error } = await supabase.rpc('encomendas_da_loja');
    if (error) throw error;
    return (data ?? []) as EncomendaDaLoja[];
  },
  async confirmarRecebimento(encomenda: string): Promise<void> {
    await umPasso(supabase, 'confirmar_recebimento', { encomenda });
  },
  async configuracao(): Promise<ConfiguracaoDeCompras> {
    const { data, error } = await supabase.rpc('configuracao_de_compras');
    if (error) throw error;
    const linha = ((data ?? []) as { horario_corte: string; fornecedores: ConfiguracaoDeCompras['fornecedores'] }[])[0];
    return {
      horarioCorte: (linha?.horario_corte ?? '15:59').slice(0, 5),
      fornecedores: (linha?.fornecedores ?? []).map((f) => ({ ...f, pedido_minimo: Number(f.pedido_minimo) })),
    };
  },
  async alterarPedidoMinimo(fornecedor: string, valor: number): Promise<void> {
    const { error } = await supabase.rpc('alterar_pedido_minimo', { fornecedor, valor });
    if (error) throw error;
  },
  async alterarHorarioCorte(horario: string): Promise<void> {
    const { error } = await supabase.rpc('alterar_horario_corte', { horario });
    if (error) throw error;
  },
  /**
   * As telas de Compras se mexem sozinhas (a regra de leitura só deixa Compras
   * e TI ouvirem): toda mudança chama. Quem só relê a lista usa `ouvirEmRajada`.
   */
  ouvir(aoMudar: () => void): () => void {
    const canal = supabase
      .channel(`encomendas-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encomendas' }, () => aoMudar())
      .subscribe();
    return () => void supabase.removeChannel(canal);
  },
});
