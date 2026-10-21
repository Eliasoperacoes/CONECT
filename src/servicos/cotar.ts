/**
 * A TELA DE COTAR, sem tela (docs/cotador/SPEC-cotar.md).
 *
 * Venda, custo, prazo e o melhor local vêm prontos do banco
 * (resultado_da_cotacao); aqui só se organiza o que chega em cartões e se
 * acompanha o andamento até ficar pronto. Nenhum preço é calculado aqui.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Uma linha de `resultado_da_cotacao`. `custo` e `fator` chegam nulos para quem não vê custo. */
export interface LinhaDoResultado {
  tipo: 'peca' | 'similar';
  codigo_peca: string;
  fornecedor: string;
  marca: string | null;
  descricao: string | null;
  local: string | null;
  em_sp: boolean | null;
  quantidade: number | null;
  situacao: string;
  prazo: string | null;
  variante: string;
  variantes: number;
  variante_provavel: boolean;
  fator_padrao: boolean;
  venda: number | null;
  custo: number | null;
  fator: number | null;
  /** O frete por peça do fornecedor, já somado ao custo na venda. Nulo para quem não vê custo. */
  frete: number | null;
}

/** Quando a marca tem fatores por tipo de peça (ISAPA pistão, sapata…), um preço por tipo. */
export interface PrecoPorTipo {
  tipo: string;
  venda: number | null;
  custo: number | null;
  provavel: boolean;
}

/** Uma oferta: um fornecedor para um código (a peça ou um similar). */
export interface Oferta {
  codigo: string;
  fornecedor: string;
  marca: string | null;
  descricao: string | null;
  local: string | null;
  emSP: boolean | null;
  quantidade: number | null;
  situacao: string;
  prazo: string | null;
  /** A venda (a menor, se houver tipos). Nula sem estoque. */
  venda: number | null;
  custo: number | null;
  fator: number | null;
  frete: number | null;
  fatorPadrao: boolean;
  /** Mais de um: o preço depende do tipo de peça — a tela avisa. */
  tipos: PrecoPorTipo[];
}

/**
 * Uma peça, uma vez só no topo, e as respostas dos fornecedores embaixo
 * (Elias, 21/10/2026: a busca é por código; "PEÇA X" aparece uma vez).
 * Vale para a peça pedida e para cada similar.
 */
export interface GrupoDaPeca {
  codigo: string;
  marca: string | null;
  descricao: string | null;
  /** SP pela menor venda, depois fora do estado, depois sem estoque */
  ofertas: Oferta[];
}

export interface CartaoDaPeca extends GrupoDaPeca {
  /** Um grupo por similar, do mais barato ao mais caro (sem estoque no fim) */
  similares: GrupoDaPeca[];
}

export type SituacaoDoAndamento = 'pronta' | 'na_fila' | 'cotando' | 'erro' | 'sem_pedido';

export interface Andamento {
  codigo: string;
  situacao: SituacaoDoAndamento;
  erro: string | null;
  estacao_no_ar: boolean;
}

/** O mesmo do banco e da extensão: maiúsculas, só letras e números. */
export const normalizarCodigo = (c: string): string => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "oc-90, hg5170  w712/2" → ["oc-90", "hg5170", "w712/2"]: sem repetir, com 3 caracteres ou mais. */
export const separarCodigos = (texto: string): string[] => {
  const vistos = new Set<string>();
  return texto
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter((c) => {
      const n = normalizarCodigo(c);
      if (n.length < 3 || vistos.has(n)) return false;
      vistos.add(n);
      return true;
    });
};

const FINAL: SituacaoDoAndamento[] = ['pronta', 'erro', 'sem_pedido'];
export const terminou = (a: Andamento): boolean => FINAL.includes(a.situacao);

/** SP primeiro, depois fora do estado, depois sem estoque; em cada grupo, a menor venda. */
const grupo = (o: Oferta): number => (o.venda == null ? 2 : o.emSP ? 0 : 1);
export const ordenarOfertas = (ofertas: Oferta[]): Oferta[] =>
  [...ofertas].sort((a, b) => grupo(a) - grupo(b) || (a.venda ?? 0) - (b.venda ?? 0) || a.fornecedor.localeCompare(b.fornecedor));

/** As linhas do banco → uma oferta por (código, fornecedor), com os tipos de peça juntos. */
const juntarOfertas = (linhas: LinhaDoResultado[]): Oferta[] => {
  const porChave = new Map<string, LinhaDoResultado[]>();
  for (const l of linhas) {
    const chave = `${l.codigo_peca}|${l.fornecedor}`;
    porChave.set(chave, [...(porChave.get(chave) ?? []), l]);
  }
  return [...porChave.values()].map((ls) => {
    const vendas = ls.map((l) => l.venda).filter((v): v is number => v != null);
    const primeira = ls.find((l) => l.venda === Math.min(...vendas)) ?? ls[0];
    return {
      codigo: primeira.codigo_peca,
      fornecedor: primeira.fornecedor,
      marca: primeira.marca,
      descricao: primeira.descricao,
      local: primeira.local,
      emSP: primeira.em_sp,
      quantidade: primeira.quantidade,
      situacao: primeira.situacao,
      prazo: primeira.prazo,
      venda: vendas.length ? Math.min(...vendas) : null,
      custo: primeira.custo,
      fator: primeira.fator,
      frete: primeira.frete,
      fatorPadrao: primeira.fator_padrao,
      tipos:
        ls.length > 1
          ? ls.map((l) => ({ tipo: l.variante, venda: l.venda, custo: l.custo, provavel: l.variante_provavel }))
          : [],
    };
  });
};

/** As ofertas de um código viram um grupo: a peça (marca e descrição de quem informou) e as ofertas em ordem. */
const agrupar = (codigo: string, ofertas: Oferta[]): GrupoDaPeca => {
  // A descrição mais completa entre os fornecedores (um informa, outro não)
  const comNome = [...ofertas].sort((a, b) => (b.descricao?.length ?? 0) - (a.descricao?.length ?? 0))[0];
  return {
    codigo,
    marca: ofertas.find((o) => o.marca)?.marca ?? null,
    descricao: comNome?.descricao ?? null,
    ofertas: ordenarOfertas(ofertas),
  };
};

/** A menor venda do grupo; sem estoque em nenhum fornecedor vai para o fim. */
const menorVenda = (g: GrupoDaPeca): number => Math.min(...g.ofertas.map((o) => o.venda ?? Infinity));

/** O cartão de um código: a peça uma vez no topo, e um grupo por similar. */
export const montarCartao = (codigo: string, linhas: LinhaDoResultado[]): CartaoDaPeca => {
  const normal = normalizarCodigo(codigo);
  const peca = agrupar(normal, juntarOfertas(linhas.filter((l) => l.tipo === 'peca')));

  const porSimilar = new Map<string, Oferta[]>();
  for (const o of juntarOfertas(linhas.filter((l) => l.tipo === 'similar'))) {
    porSimilar.set(o.codigo, [...(porSimilar.get(o.codigo) ?? []), o]);
  }
  const similares = [...porSimilar].map(([c, os]) => agrupar(c, os));
  similares.sort((a, b) => menorVenda(a) - menorVenda(b) || a.codigo.localeCompare(b.codigo));

  return { ...peca, similares };
};

/**
 * Confere o andamento a cada `intervalo` até todos os códigos terminarem
 * (pronto, erro ou sem pedido). Devolve como parar (a tela fechou).
 */
export const acompanhar = (
  codigos: string[],
  perguntar: (codigos: string[]) => Promise<Andamento[]>,
  aoMudar: (andamentos: Andamento[]) => void,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  intervalo = 3000
): (() => void) => {
  let parado = false;
  void (async () => {
    while (!parado) {
      try {
        const a = await perguntar(codigos);
        if (parado) return;
        aoMudar(a);
        if (a.length && a.every(terminou)) return;
      } catch {
        // Rede caiu um instante: tenta de novo na próxima volta
      }
      await esperar(intervalo);
    }
  })();
  return () => {
    parado = true;
  };
};

export const cotarPeloSupabase = (supabase: SupabaseClient) => ({
  /** Similares sempre (Elias, 20/10): o vendedor já tem a opção mais barata. */
  async pedir(codigos: string[], forcar = false): Promise<void> {
    const { error } = await supabase.rpc('pedir_cotacao', { codigos, incluir_similares: true, forcar });
    if (error) throw error;
  },
  async resultado(codigo: string): Promise<CartaoDaPeca> {
    const { data, error } = await supabase.rpc('resultado_da_cotacao', { codigo });
    if (error) throw error;
    const linhas = ((data ?? []) as LinhaDoResultado[]).map((l) => ({
      ...l,
      venda: l.venda == null ? null : Number(l.venda),
      custo: l.custo == null ? null : Number(l.custo),
      fator: l.fator == null ? null : Number(l.fator),
      frete: l.frete == null ? null : Number(l.frete),
    }));
    return montarCartao(codigo, linhas);
  },
  async andamento(codigos: string[]): Promise<Andamento[]> {
    const { data, error } = await supabase.rpc('andamento_da_cotacao', { codigos });
    if (error) throw error;
    return (data ?? []) as Andamento[];
  },
  async minhasDoDia(): Promise<string[]> {
    const { data, error } = await supabase.rpc('minhas_cotacoes_do_dia');
    if (error) throw error;
    return ((data ?? []) as { codigo: string }[]).map((l) => l.codigo);
  },
  async nomesDosFornecedores(): Promise<Record<string, string>> {
    const { data, error } = await supabase.rpc('fornecedores_para_cotar');
    if (error) throw error;
    return Object.fromEntries(((data ?? []) as { chave: string; nome: string }[]).map((f) => [f.chave, f.nome]));
  },
});
