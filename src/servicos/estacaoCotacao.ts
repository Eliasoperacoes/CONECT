/**
 * ESTAÇÃO DE COTAÇÃO (docs/cotador/SPEC-estacao.md)
 *
 * O CONECTA aberto no PC de compras atende a fila sozinho: dá sinal a cada
 * minuto, pega o pedido, pede à extensão Cotador B2B que cote nos sites e
 * grava o resultado com o login de quem está ali. A extensão não fala com o
 * banco e não guarda credencial nenhuma.
 *
 * Só liga quando as duas coisas são verdade: a pessoa atende a fila
 * (`podeAtenderFila`, par de `posso_atender_fila`) e a extensão respondeu.
 * Em qualquer outro PC, ou para qualquer outra pessoa, não chama o banco.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { podeAtenderFila } from '../tipos';

export type SituacaoSite = 'ok' | 'deslogado' | 'fora';

export interface Ola {
  versao: string;
  sites: Record<string, SituacaoSite>;
}

/** Um item por fornecedor, no formato de `gravar_cotacao`. */
export interface ResultadoFornecedor {
  fornecedor: string;
  peca: unknown;
  ofertas: unknown[];
  similares?: unknown[];
  erro: string | null;
}

export interface Extensao {
  ola(): Promise<Ola>;
  cotar(codigo: string, incluirSimilares: boolean): Promise<{ resultados: ResultadoFornecedor[] }>;
}

export interface PedidoDaFila {
  id: string;
  codigo: string;
  incluir_similares: boolean;
}

export interface BancoDaEstacao {
  sinal(estacao: string, sites: Record<string, SituacaoSite>, versao: string): Promise<void>;
  pegar(estacao: string): Promise<PedidoDaFila | null>;
  gravar(cotacao: string, resultados: ResultadoFornecedor[]): Promise<string>;
  /**
   * Avisa quando a fila muda (pedido novo, pedido que voltou), em tempo
   * real. Devolve como parar de ouvir. Sem ele, só o relógio de reserva.
   */
  ouvirFila?(aoMudar: () => void): () => void;
}

export const NOME_DA_ESTACAO = 'compras';
export const INTERVALO_SINAL_MS = 60_000;
/**
 * A RESERVA da fila: o pedido chega pelo tempo real (ouvirFila) na hora; o
 * relógio só cobre o aviso que se perder. Era 5 s — 17 mil chamadas por dia
 * da estação, quase todas de fila vazia (LIMITES-SUPABASE.md).
 */
export const INTERVALO_FILA_MS = 30_000;
export const PRAZO_EXTENSAO_MS = 90_000;
export const PRAZO_OLA_MS = 2_000;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A promessa, ou erro (marcado `prazo`) se passar do prazo. */
const comPrazo = <T>(p: Promise<T>, prazo: Promise<void>, mensagem: string): Promise<T> =>
  Promise.race([p, prazo.then(() => Promise.reject(Object.assign(new Error(mensagem), { prazo: true })))]);

export interface Estacao {
  /** Liga se puder; devolve se ligou. */
  iniciar(): Promise<boolean>;
  parar(): void;
  /** Uma volta da fila: um pedido (o teste chama). */
  atenderFila(): Promise<'vazia' | 'ocupada' | string>;
  /** Atende até a fila ficar vazia — o que o aviso do banco e o relógio chamam. */
  esvaziarFila(): Promise<void>;
  darSinal(): Promise<void>;
  situacao(): SituacaoDaEstacao;
}

export interface SituacaoDaEstacao {
  ativa: boolean;
  sites: Record<string, SituacaoSite>;
  /** A extensão foi recarregada (ou caiu): a página precisa de F5. */
  precisaRecarregar: boolean;
}

export const criarEstacao = (opcoes: {
  colaborador: { nivel: number; setor: string } | null;
  extensao: Extensao;
  banco: BancoDaEstacao;
  /** Espera de `ms`; o teste troca por uma que resolve na hora. */
  temporizador?: (ms: number) => Promise<void>;
  aoMudar?: () => void;
  /**
   * Pede ao navegador para não congelar esta aba enquanto ela é estação;
   * devolve como soltar. Medido em 21/10/2026: com a aba em segundo plano,
   * o Chrome desacelerou (ou congelou) o relógio e um pedido esperou 7 min
   * na fila, para 8 s de cotação.
   */
  manterAcordado?: () => () => void;
}): Estacao => {
  const { colaborador, extensao, banco, aoMudar } = opcoes;
  const temporizador = opcoes.temporizador ?? esperar;
  let ativa = false;
  let cotando = false;
  let ola: Ola | null = null;
  let precisaRecarregar = false;
  let relogios: ReturnType<typeof setInterval>[] = [];
  let soltar: (() => void)[] = [];
  /** Chegou aviso enquanto cotava: dar mais uma volta ao terminar. */
  let deNovo = false;

  const parar = () => {
    relogios.forEach(clearInterval);
    relogios = [];
    soltar.forEach((s) => s());
    soltar = [];
    ativa = false;
    aoMudar?.();
  };

  const darSinal = async () => {
    if (!ativa) return;
    ola = await comPrazo(extensao.ola(), temporizador(PRAZO_OLA_MS), 'a extensão não respondeu');
    await banco.sinal(NOME_DA_ESTACAO, ola.sites, ola.versao);
    aoMudar?.();
  };

  const atenderFila = async (): Promise<'vazia' | 'ocupada' | string> => {
    if (!ativa) return 'vazia';
    if (cotando) return 'ocupada';
    cotando = true;
    try {
      const pedido = await banco.pegar(NOME_DA_ESTACAO);
      if (!pedido) return 'vazia';
      let resultados: ResultadoFornecedor[];
      try {
        ({ resultados } = await comPrazo(
          extensao.cotar(pedido.codigo, pedido.incluir_similares),
          temporizador(PRAZO_EXTENSAO_MS),
          'a extensão não respondeu em 90 s'
        ));
      } catch (e) {
        if (!(e as { prazo?: boolean }).prazo) {
          // A PRÓPRIA EXTENSÃO falhou (recarregada, desligada): o defeito é
          // deste PC, não dos sites. A estação para e pede F5; o pedido não
          // vira erro e volta sozinho para a fila em 5 min (20/10/2026).
          precisaRecarregar = true;
          parar();
          return 'extensao-falhou';
        }
        // Extensão muda por 90 s: erro em todos, e o balconista fica sabendo logo
        const fornecedores = Object.keys(ola?.sites ?? {});
        resultados = fornecedores.map((fornecedor) => ({ fornecedor, peca: null, ofertas: [], erro: (e as Error).message }));
      }
      return await banco.gravar(pedido.id, resultados);
    } finally {
      cotando = false;
    }
  };

  /** Um pedido atrás do outro até a fila ficar vazia — sem esperar o relógio entre eles. */
  const esvaziarFila = async (): Promise<void> => {
    if (cotando) {
      deNovo = true;
      return;
    }
    do {
      deNovo = false;
      let r: string;
      do {
        r = await atenderFila();
      } while (ativa && r !== 'vazia' && r !== 'ocupada' && r !== 'extensao-falhou');
    } while (ativa && deNovo);
  };

  return {
    async iniciar() {
      if (ativa) return true;
      if (!colaborador || !podeAtenderFila(colaborador)) return false;
      try {
        ola = await comPrazo(extensao.ola(), temporizador(PRAZO_OLA_MS), 'sem extensão');
      } catch {
        return false; // PC sem a extensão: não é a estação
      }
      ativa = true;
      await banco.sinal(NOME_DA_ESTACAO, ola.sites, ola.versao).catch(() => {});
      relogios = [
        setInterval(() => void darSinal().catch(() => {}), INTERVALO_SINAL_MS),
        // A reserva: se o aviso em tempo real cair, o relógio ainda atende
        setInterval(() => void esvaziarFila().catch(() => {}), INTERVALO_FILA_MS),
      ];
      // O aviso do banco: o pedido é pego na hora, mesmo com a aba atrás de outras
      if (banco.ouvirFila) soltar.push(banco.ouvirFila(() => void esvaziarFila().catch(() => {})));
      if (opcoes.manterAcordado) soltar.push(opcoes.manterAcordado());
      aoMudar?.();
      // O que já estava esperando antes de a estação ligar
      void esvaziarFila().catch(() => {});
      return true;
    },
    parar,
    atenderFila,
    esvaziarFila,
    darSinal,
    situacao: () => ({ ativa, sites: ola?.sites ?? {}, precisaRecarregar }),
  };
};

// ------------------------------------------------------------
// As peças de verdade: a janela (ponte da extensão) e o Supabase
// ------------------------------------------------------------

const MARCA = 'cotador-b2b';

/** Fala com a extensão pela ponte (conecta-ponte.js), por postMessage. */
export const extensaoPelaJanela = (janela: Window = window): Extensao => {
  let proximo = 0;
  const perguntar = <T>(tipo: string, dados?: unknown): Promise<T> =>
    new Promise((resolve, reject) => {
      const id = `${Date.now()}-${++proximo}`;
      const ouvir = (e: MessageEvent) => {
        const m = e.data;
        if (e.source !== janela || e.origin !== janela.location.origin) return;
        if (!m || m.marca !== MARCA || m.direcao !== 'resposta' || m.id !== id) return;
        janela.removeEventListener('message', ouvir);
        if (m.ok) resolve(m.dados as T);
        else reject(new Error(m.erro));
      };
      janela.addEventListener('message', ouvir);
      janela.postMessage({ marca: MARCA, direcao: 'pedido', id, tipo, dados }, janela.location.origin);
    });
  return {
    ola: () => perguntar<Ola>('ola'),
    cotar: (codigo, incluirSimilares) => perguntar('cotar', { codigo, incluirSimilares }),
  };
};

export const bancoPeloSupabase = (supabase: SupabaseClient): BancoDaEstacao => ({
  async sinal(estacao, sites, versao) {
    const { error } = await supabase.rpc('sinal_da_estacao', { estacao, sites, versao });
    if (error) throw error;
  },
  async pegar(estacao) {
    const { data, error } = await supabase.rpc('pegar_proxima_cotacao', { estacao });
    if (error) throw error;
    return (data as PedidoDaFila[] | null)?.[0] ?? null;
  },
  async gravar(cotacao, resultados) {
    const { data, error } = await supabase.rpc('gravar_cotacao', { cotacao, resultados });
    if (error) throw error;
    return data as string;
  },
  // Tempo real (Supabase Realtime): pedido novo ou que voltou para a fila.
  // A regra de leitura vale aqui também: só quem atende a fila recebe.
  ouvirFila(aoMudar) {
    const canal = supabase
      .channel('fila-de-cotacao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacoes_b2b' }, (m) => {
        const nova = (m.new ?? {}) as { situacao?: string };
        if (nova.situacao === 'na_fila') aoMudar();
      })
      .subscribe();
    return () => void supabase.removeChannel(canal);
  },
});

// ------------------------------------------------------------
// O que o Painel de Compras mostra da estação, de qualquer PC
// ------------------------------------------------------------

/** Uma estação como o banco a devolve; `no_ar` é a regra do banco (estacao_online), sem cópia aqui */
export interface LinhaDaEstacao {
  visto_em: string;
  no_ar: boolean;
  sites: Record<string, SituacaoSite>;
  versao_extensao?: string | null;
}

export interface ResumoDaEstacao {
  noAr: boolean;
  /** Último sinal de qualquer estação (null: nunca deu sinal) */
  vistoEm: string | null;
  sitesOk: number;
  sitesTotal: number;
  /** Os sites com problema, com o motivo ("Rolemar: deslogado") */
  problemas: string[];
  naFila: number;
  /** A versão da extensão que deu o último sinal (null: estação antiga, sem versão) */
  versao: string | null;
}

const ROTULO_SITE: Record<SituacaoSite, string> = { ok: 'ok', deslogado: 'deslogado', fora: 'aba fechada' };

export const resumoDaEstacao = (
  estacoes: LinhaDaEstacao[],
  naFila: number,
  /** chave do fornecedor → nome na tela ("rolemar" → "Rolemar") */
  nomes: Record<string, string> = {}
): ResumoDaEstacao => {
  const ultima = [...estacoes].sort((a, b) => b.visto_em.localeCompare(a.visto_em))[0];
  if (!ultima) return { noAr: false, vistoEm: null, sitesOk: 0, sitesTotal: 0, problemas: [], naFila, versao: null };
  const sites = Object.entries(ultima.sites ?? {});
  return {
    noAr: ultima.no_ar,
    vistoEm: ultima.visto_em,
    sitesOk: sites.filter(([, s]) => s === 'ok').length,
    sitesTotal: sites.length,
    problemas: sites.filter(([, s]) => s !== 'ok').map(([chave, s]) => `${nomes[chave] ?? chave}: ${ROTULO_SITE[s]}`),
    naFila,
    versao: ultima.versao_extensao ?? null,
  };
};

/** A estação e a fila, pelo login de quem olha (a leitura é de quem cota ou atende a fila) */
export const lerEstacaoPeloSupabase = async (supabase: SupabaseClient, nomes: Record<string, string> = {}): Promise<ResumoDaEstacao> => {
  const [estacoes, fila] = await Promise.all([
    // no_ar: a coluna calculada do banco (public.no_ar), a mesma regra da fila
    supabase.from('estacoes_cotacao').select('visto_em, no_ar, sites, versao_extensao'),
    supabase.from('cotacoes_b2b').select('id', { count: 'exact', head: true }).eq('situacao', 'na_fila'),
  ]);
  if (estacoes.error) throw estacoes.error;
  if (fila.error) throw fila.error;
  return resumoDaEstacao((estacoes.data ?? []) as LinhaDaEstacao[], fila.count ?? 0, nomes);
};

/**
 * A EXTENSÃO PUBLICADA para o comprador baixar (public/extensao, gerada por
 * `bun scripts/empacotar.ts` na extensão). Instalada mais velha que a
 * publicada: o Painel avisa e leva ao passo a passo (/extensao.html).
 */
export const PAGINA_DA_EXTENSAO = '/extensao.html';

/** "0.4.0" é mais velha que "1.0.0"? Número a número; sem versão instalada, não acusa. */
export const versaoAtrasada = (instalada: string | null, publicada: string | null): boolean => {
  if (!instalada || !publicada) return false;
  const a = instalada.split('.').map(Number);
  const b = publicada.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
};

export const lerVersaoPublicada = async (buscar: typeof fetch = fetch): Promise<string | null> => {
  try {
    const r = await buscar('/extensao/versao.json', { cache: 'no-store' });
    return r.ok ? (((await r.json()) as { versao?: string }).versao ?? null) : null;
  } catch {
    return null;
  }
};

/**
 * Não congelar a aba da estação: enquanto a página segura uma trava (Web
 * Locks), o Chrome não a congela em segundo plano. Solta ao parar.
 */
export const manterAcordadoPeloNavegador = (): (() => void) => {
  const travas = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!travas) return () => {};
  let soltar: () => void = () => {};
  const solta = new Promise<void>((r) => (soltar = r));
  void travas.request('estacao-de-cotacao', () => solta).catch(() => {});
  return soltar;
};
