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
}

export const NOME_DA_ESTACAO = 'compras';
export const INTERVALO_SINAL_MS = 60_000;
export const INTERVALO_FILA_MS = 5_000;
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
  /** Uma volta da fila (o temporizador chama; o teste também). */
  atenderFila(): Promise<'vazia' | 'ocupada' | string>;
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
}): Estacao => {
  const { colaborador, extensao, banco, aoMudar } = opcoes;
  const temporizador = opcoes.temporizador ?? esperar;
  let ativa = false;
  let cotando = false;
  let ola: Ola | null = null;
  let precisaRecarregar = false;
  let relogios: ReturnType<typeof setInterval>[] = [];

  const parar = () => {
    relogios.forEach(clearInterval);
    relogios = [];
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
        setInterval(() => void atenderFila().catch(() => {}), INTERVALO_FILA_MS),
      ];
      aoMudar?.();
      return true;
    },
    parar,
    atenderFila,
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
});
