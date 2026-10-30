/**
 * A SINCRONIZAÇÃO PELO QUE MUDOU — CONECTA / Malachias Autopeças (30/10/2026)
 *
 * ===================================================================
 * O DEFEITO, MEDIDO
 * ===================================================================
 *
 * Cada carga baixava a tabela inteira: 62 dias de batidas, todas as
 * apurações desde o começo, o chat todo. E a carga roda antes de cada
 * batida, a cada evento ao vivo, ao abrir cada aba. Em 29/10, com as 89
 * pessoas, deu 287 MB de tráfego num dia útil — no ritmo de estourar os
 * 5 GB do plano gratuito em um mês. O Elias pediu: puxar uma vez, guardar,
 * e ao entrar só o que há de novo.
 *
 * ===================================================================
 * COMO
 * ===================================================================
 *
 * O banco carimba `alterado_em` em toda inserção e alteração, e devolve
 * em poucos bytes o resumo do que a pessoa enxerga: quantas linhas, a
 * alteração mais recente e a assinatura dos ids
 * (sincronizacao-pelo-que-mudou.sql). Com ele:
 *
 *   1. Resumo igual ao guardado da última vez: nada mudou, nada desce.
 *   2. Diferente: desce só o que mudou desde a última marca (com folga
 *      de cinco minutos para a transação que gravou no limite).
 *   3. Juntado o que desceu, a assinatura dos ids do aparelho tem de ser
 *      a do banco. Não sendo, foi remoção ou mudança de quem enxerga o
 *      quê — e o aparelho acerta pela lista de ids, que é leve.
 *   4. Ainda divergindo, carga completa. Na dúvida, a carga completa.
 *
 * A carga completa também volta quando não há base confiável: o aparelho
 * nunca sincronizou, outra pessoa entrou no mesmo celular, a janela de
 * datas mudou, o formato do que se guarda mudou, ou passou um dia desde
 * a última — esta é a rede de segurança para qualquer coisa que o resumo
 * não tenha visto. Sem o script rodado no banco, é só carga completa,
 * como antes.
 *
 * As telas não mudam: quem pede `sincronizarPonto()` continua pedindo. O
 * que muda é o que vai pela rede.
 */
import { supabase } from './supabase';
import { buscarTodasAsLinhas } from './paginacao';

/** As mesmas do banco (`resumo_da_sincronizacao`) — há teste conferindo */
export const TABELAS_SINCRONIZADAS = [
  'registros_ponto',
  'ajustes_jornada',
  'justificativas_ausencia',
  'afastamentos',
  'mensagens',
  'leituras_mensagem',
  'participantes',
  'conversas',
] as const;

export type TabelaSincronizada = (typeof TABELAS_SINCRONIZADAS)[number];

export interface Resumo {
  quantidade: number;
  marca: string | null;
  assinatura: string;
}

/**
 * Sobe quando muda a forma do que o aparelho guarda (um campo novo no
 * mapeamento, por exemplo): o que foi guardado na forma antiga não serve
 * de base, e a próxima carga é completa.
 */
export const FORMATO_DA_SINCRONIZACAO = 1;
/** A rede de segurança: uma carga completa por dia, no mínimo */
export const REVISAO_COMPLETA_MS = 24 * 60 * 60 * 1000;
/** A transação que gravou no limite da marca anterior ainda entra */
export const FOLGA_DA_MARCA_MS = 5 * 60 * 1000;
/** Ids por pedido ao buscar o que passou a ser visível */
const IDS_POR_PEDIDO = 100;

interface Estado {
  formato: number;
  dono: string | null;
  janela: string | null;
  completaEm: number;
  resumo: Resumo;
}

export type ResultadoDaSincronizacao = 'nada-mudou' | 'so-o-que-mudou' | 'completa' | 'falhou';

/**
 * O pedaço do construtor de consulta do supabase-js que o motor encadeia.
 * Quem monta converte para cá (`as unknown as`): comparar a forma inteira
 * do construtor com esta estoura o limite de profundidade do TypeScript.
 */
export interface ConsultaSincronizavel {
  gte: (coluna: string, valor: string) => ConsultaSincronizavel;
  in: (coluna: string, valores: string[]) => ConsultaSincronizavel;
  order: (coluna: string) => ConsultaSincronizavel;
  range: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>;
}

export interface Receita<L, T> {
  tabela: TabelaSincronizada;
  /** Onde o aparelho guarda o resumo da última sincronização desta tabela */
  chaveDoEstado: string;
  /** Quem está logado: a base de uma pessoa nunca serve para outra */
  dono: string | null;
  janela?: { inicio: string; fim: string };
  /** `.from(tabela).select(colunas)` já recortado pela janela — nova a cada chamada */
  montar: (colunas: string) => ConsultaSincronizavel;
  /** As colunas da chave, na ordem em que o banco as junta no resumo (com '|') */
  colunasDaChave: string[];
  chaveDoItem: (item: T) => string;
  paraItem: (linha: L) => T;
  lerGuardados: () => T[];
  /** Pode lançar (aparelho cheio): nada fica pela metade e a resposta é 'falhou' */
  gravar: (itens: T[]) => void;
  /** A ordem em que a lista fica guardada */
  ordenar?: (a: T, b: T) => number;
  /** Como a leitura aparece nas mensagens de erro ('as marcações de ponto') */
  ondeEstou: string;
  agora?: number;
}

/** SHA-256 das chaves em ordem — a mesma conta do banco (collate "C") */
export const assinaturaDasChaves = async (chaves: string[]): Promise<string> => {
  const texto = [...chaves].sort().join(',');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Devolve `null` quando o banco não tem o resumo (script não rodado) ou recusa */
export const pedirResumo = async (
  tabela: TabelaSincronizada,
  janela?: { inicio: string; fim: string }
): Promise<Resumo | null> => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('resumo_da_sincronizacao', {
      p_tabela: tabela,
      p_inicio: janela?.inicio ?? null,
      p_fim: janela?.fim ?? null,
    });
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    const linha = data[0] as { quantidade: number | string; marca: string | null; assinatura: string };
    return { quantidade: Number(linha.quantidade), marca: linha.marca ?? null, assinatura: String(linha.assinatura) };
  } catch {
    return null;
  }
};

const lerEstado = (chave: string): Estado | null => {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as Estado) : null;
  } catch {
    return null;
  }
};

const gravarEstado = (chave: string, estado: Estado | null): void => {
  try {
    if (estado) localStorage.setItem(chave, JSON.stringify(estado));
    else localStorage.removeItem(chave);
  } catch {
    /* sem o estado, a próxima é completa — nada se perde */
  }
};

/**
 * A marca menos a folga, em ISO. Os microssegundos do banco são cortados
 * antes: há navegador que não lê mais de três casas.
 */
export const desdeAMarca = (marca: string): string =>
  new Date(Date.parse(marca.replace(/(\.\d{3})\d+/, '$1')) - FOLGA_DA_MARCA_MS).toISOString();

const iguais = (a: Resumo, b: Resumo) =>
  a.quantidade === b.quantidade && a.marca === b.marca && a.assinatura === b.assinatura;

export const sincronizarPeloQueMudou = async <L, T>(r: Receita<L, T>): Promise<ResultadoDaSincronizacao> => {
  const agora = r.agora ?? Date.now();
  const janela = r.janela ? `${r.janela.inicio}..${r.janela.fim}` : null;
  const naChave = (consulta: ConsultaSincronizavel) =>
    r.colunasDaChave.reduce((q, coluna) => q.order(coluna), consulta);
  const chaveDaLinha = (linha: L) =>
    r.colunasDaChave.map((c) => String((linha as Record<string, unknown>)[c])).join('|');
  const emOrdem = (itens: T[]) => (r.ordenar ? [...itens].sort(r.ordenar) : itens);

  const guardar = (itens: T[], resumo: Resumo | null, completaEm: number): boolean => {
    try {
      r.gravar(emOrdem(itens));
    } catch (erro) {
      console.error(`Não coube no aparelho ${r.ondeEstou}:`, erro);
      gravarEstado(r.chaveDoEstado, null);
      return false;
    }
    gravarEstado(
      r.chaveDoEstado,
      resumo ? { formato: FORMATO_DA_SINCRONIZACAO, dono: r.dono, janela, completaEm, resumo } : null
    );
    return true;
  };

  const completa = async (resumo: Resumo | null): Promise<ResultadoDaSincronizacao> => {
    const linhas = await buscarTodasAsLinhas<L>(() => naChave(r.montar('*')), r.ondeEstou);
    if (!linhas) return 'falhou';
    return guardar(linhas.map(r.paraItem), resumo, agora) ? 'completa' : 'falhou';
  };

  const resumo = await pedirResumo(r.tabela, r.janela);
  if (!resumo) return completa(null);

  const estado = lerEstado(r.chaveDoEstado);
  const guardados = r.lerGuardados();
  const baseConfiavel =
    !!estado &&
    estado.formato === FORMATO_DA_SINCRONIZACAO &&
    estado.dono === r.dono &&
    estado.janela === janela &&
    agora - estado.completaEm < REVISAO_COMPLETA_MS &&
    !!estado.resumo?.marca;
  if (!baseConfiavel) return completa(resumo);

  // 1. Nada mudou no banco — e o que está guardado é o que foi gravado
  if (iguais(resumo, estado.resumo)) {
    return guardados.length === estado.resumo.quantidade ? 'nada-mudou' : completa(resumo);
  }

  // 2. Só o que mudou desde a última marca
  const mudaram = await buscarTodasAsLinhas<L>(
    () => naChave(r.montar('*').gte('alterado_em', desdeAMarca(estado.resumo.marca!))),
    r.ondeEstou
  );
  if (!mudaram) return 'falhou';
  const porChave = new Map(guardados.map((item) => [r.chaveDoItem(item), item]));
  for (const linha of mudaram) {
    const item = r.paraItem(linha);
    porChave.set(r.chaveDoItem(item), item);
  }

  // 3. A conta tem de fechar com a do banco; não fechando, pelos ids
  if ((await assinaturaDasChaves([...porChave.keys()])) !== resumo.assinatura) {
    const chaves = await buscarTodasAsLinhas<L>(() => naChave(r.montar(r.colunasDaChave.join(', '))), r.ondeEstou);
    if (!chaves) return 'falhou';
    const noBanco = new Set(chaves.map(chaveDaLinha));
    for (const chave of [...porChave.keys()]) if (!noBanco.has(chave)) porChave.delete(chave);

    const faltam = [...noBanco].filter((chave) => !porChave.has(chave));
    // Chave composta não se busca por lista: o que faltou vem na completa
    if (faltam.length > 0 && r.colunasDaChave.length > 1) return completa(resumo);
    for (let i = 0; i < faltam.length; i += IDS_POR_PEDIDO) {
      const lote = faltam.slice(i, i + IDS_POR_PEDIDO);
      const linhas = await buscarTodasAsLinhas<L>(
        () => naChave(r.montar('*').in(r.colunasDaChave[0], lote)),
        r.ondeEstou
      );
      if (!linhas) return 'falhou';
      for (const linha of linhas) {
        const item = r.paraItem(linha);
        porChave.set(r.chaveDoItem(item), item);
      }
    }

    // 4. Na dúvida, a carga completa
    if ((await assinaturaDasChaves([...porChave.keys()])) !== resumo.assinatura) return completa(resumo);
  }

  return guardar([...porChave.values()], resumo, estado.completaEm) ? 'so-o-que-mudou' : 'falhou';
};
