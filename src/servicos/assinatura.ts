/**
 * A ASSINATURA DO HOLERITE — CONECTA / Malachias Autopeças
 *
 * O desenho de cada pessoa é feito UMA VEZ, junto com o aceite do termo de
 * adesão, e reaproveitado. Cada holerite é assinado com a SENHA digitada de
 * novo — conferida no banco (`assinar_holerite`, em
 * `supabase/assinatura-holerite.sql`), não aqui. O que este arquivo faz é
 * levar e trazer; quem decide se vale é o banco.
 */
import { supabase, usandoNuvem } from './supabase';
import { bancoDados } from './bancoDados';
import { Assinatura, Holerite, RecebimentoHolerite, ResumoPontoColaborador } from '../tipos';
import { codigoDoArquivo } from './comprovanteDeHolerite';
import { servicoPonto, conteudoDoEspelho, AssinaturaNoEspelho } from './ponto';
import { periodoDoMes } from './meuRH';

/**
 * O TERMO DE ADESÃO. Mudou o texto? Mude a versão: o banco guarda qual
 * versão cada pessoa aceitou ao desenhar a assinatura.
 */
export const TERMO_VERSAO = '2026-10-05';
export const TEXTO_DO_TERMO = [
  'Concordo em receber meus holerites, espelhos de ponto e demais documentos de trabalho pelo CONECTA, em formato eletrônico, no lugar da via em papel.',
  'Reconheço como minha a assinatura que escolho ou desenho abaixo. Ela será aplicada aos documentos que eu confirmar, sempre com a minha senha pessoal.',
  'Sei que cada confirmação registra a data e a hora do servidor e um código do documento, e que o documento assinado não pode ser alterado depois.',
  'Minha senha é pessoal e intransferível. Se alguém souber dela, devo trocá-la e avisar o RH.',
];

/** A tabela ainda não existe no banco: o SQL da assinatura não foi rodado. */
const semTabela = (erro: { code?: string } | null): boolean => erro?.code === 'PGRST205' || erro?.code === '42P01';

interface LinhaAssinatura {
  id: string;
  colaborador_id: string;
  imagem: string;
  termo_versao: string;
  criada_em: string;
}

const paraAssinatura = (l: LinhaAssinatura): Assinatura => ({
  id: l.id,
  colaboradorId: l.colaborador_id,
  imagem: l.imagem,
  termoVersao: l.termo_versao,
  criadaEm: l.criada_em,
});

interface LinhaRecebimento {
  holerite_id: string;
  colaborador_id: string;
  assinatura_id: string;
  arquivo_hash: string;
  aparelho: string | null;
  assinado_em: string;
}

const paraRecebimento = (l: LinhaRecebimento): RecebimentoHolerite => ({
  holeriteId: l.holerite_id,
  colaboradorId: l.colaborador_id,
  assinaturaId: l.assinatura_id,
  arquivoHash: l.arquivo_hash,
  aparelho: l.aparelho || undefined,
  assinadoEm: l.assinado_em,
});

/** A assinatura vigente de quem está usando: a mais recente. */
export const obterMinhaAssinatura = async (): Promise<Assinatura | null> => {
  if (!usandoNuvem() || !supabase) return null;
  const eu = bancoDados.obterColaboradorAtual();
  const { data, error } = await supabase
    .from('assinaturas')
    .select('*')
    .eq('colaborador_id', eu.id)
    .order('criada_em', { ascending: false })
    .limit(1);
  if (error) {
    if (!semTabela(error)) console.error('Falha ao ler a assinatura:', error.message);
    return null;
  }
  const linha = (data || [])[0] as LinhaAssinatura | undefined;
  return linha ? paraAssinatura(linha) : null;
};

export const cadastrarAssinatura = async (imagem: string): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!usandoNuvem() || !supabase) {
    return { sucesso: false, erro: 'Disponível apenas com o banco da rede ligado.' };
  }
  const { error } = await supabase.rpc('cadastrar_assinatura', {
    p_imagem: imagem,
    p_termo_versao: TERMO_VERSAO,
  });
  if (error) {
    console.error('Falha ao cadastrar a assinatura:', error.message);
    return {
      sucesso: false,
      erro: error.code === 'PGRST202' ? 'A assinatura ainda não foi ligada no banco. Avise o TI.' : error.message,
    };
  }
  return { sucesso: true };
};

/** Os recebimentos: de uma pessoa, ou (para o RH) de uma lista de holerites. */
export const listarRecebimentos = async (filtro: {
  colaboradorId?: string;
  holeriteIds?: string[];
}): Promise<Map<string, RecebimentoHolerite>> => {
  const mapa = new Map<string, RecebimentoHolerite>();
  if (!usandoNuvem() || !supabase) return mapa;
  if (filtro.holeriteIds && filtro.holeriteIds.length === 0) return mapa;

  let consulta = supabase.from('recebimentos_holerite').select('*');
  if (filtro.colaboradorId) consulta = consulta.eq('colaborador_id', filtro.colaboradorId);
  if (filtro.holeriteIds) consulta = consulta.in('holerite_id', filtro.holeriteIds);

  const { data, error } = await consulta;
  if (error) {
    if (!semTabela(error)) console.error('Falha ao ler os recebimentos:', error.message);
    return mapa;
  }
  for (const l of (data || []) as LinhaRecebimento[]) mapa.set(l.holerite_id, paraRecebimento(l));
  return mapa;
};

/** O que o banco respondeu, em português de gente. */
const MOTIVOS: Record<string, string> = {
  senha: 'Senha incorreta.',
  bloqueado: 'Muitas tentativas com a senha errada. Espere 15 minutos e tente de novo.',
  sem_assinatura: 'Cadastre a sua assinatura antes de assinar.',
  holerite: 'Este holerite não é seu.',
  mes_aberto: 'Este mês ainda não fechou: o espelho é assinado a partir do dia 1 do mês seguinte.',
  sem_permissao: 'Só quem cuida de pessoas assina como responsável.',
  vazio: 'Nenhum documento para assinar.',
  lote: 'Lote grande demais. Assine um mês de cada vez.',
  arquivo: 'Não foi possível conferir o arquivo. Feche e abra o holerite de novo.',
  sessao: 'Sua sessão expirou. Entre de novo no sistema.',
};

/** Um resumo do aparelho, para o registro: "Android · aplicativo", "Windows · navegador". */
const descreverAparelho = (): string => {
  const agente = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const sistema = /Android/i.test(agente)
    ? 'Android'
    : /iPhone|iPad/i.test(agente)
      ? 'iPhone'
      : /Windows/i.test(agente)
        ? 'Windows'
        : /Mac OS/i.test(agente)
          ? 'Mac'
          : 'Outro';
  return `${sistema} · ${agente.slice(0, 200)}`;
};

/**
 * ASSINA O HOLERITE que a pessoa tem na tela.
 *
 * O código vai do arquivo que ELA está vendo (`dados`), não do que o banco
 * acha que publicou: assinar é dizer "recebi ESTE".
 */
export const assinarHolerite = async (
  holerite: Holerite,
  senha: string,
  dados: ArrayBuffer
): Promise<{ sucesso: boolean; assinadoEm?: string; erro?: string }> => {
  if (!usandoNuvem() || !supabase) {
    return { sucesso: false, erro: 'Disponível apenas com o banco da rede ligado.' };
  }
  if (!senha) return { sucesso: false, erro: 'Digite a sua senha.' };

  const { data, error } = await supabase.rpc('assinar_holerite', {
    p_holerite_id: holerite.id,
    p_senha: senha,
    p_hash: await codigoDoArquivo(dados),
    p_aparelho: descreverAparelho(),
  });
  if (error) {
    console.error('Falha ao assinar o holerite:', error.message);
    return {
      sucesso: false,
      erro: error.code === 'PGRST202' ? 'A assinatura ainda não foi ligada no banco. Avise o TI.' : error.message,
    };
  }

  const resposta = (data || {}) as { ok?: boolean; motivo?: string; assinado_em?: string };
  if (!resposta.ok) {
    return { sucesso: false, erro: MOTIVOS[resposta.motivo || ''] || 'A assinatura não foi registrada.' };
  }
  return { sucesso: true, assinadoEm: resposta.assinado_em };
};

// ============================================================
// O ESPELHO DE PONTO ASSINADO
//
// Pedido do Elias (05/10/2026): do mesmo jeito que o holerite — a mesma
// assinatura, a mesma senha, conferida no banco (`assinar_espelho`, em
// `supabase/assinatura-holerite.sql`). Um por pessoa e mês fechado.
// ============================================================

export interface EspelhoAssinado {
  colaboradorId: string;
  /** "2026-09" */
  mes: string;
  assinaturaId: string;
  conteudoHash: string;
  assinadoEm: string;
}

interface LinhaEspelhoAssinado {
  colaborador_id: string;
  mes: string;
  assinatura_id: string;
  conteudo_hash: string;
  assinado_em: string;
}

/** A chave de um espelho assinado: a pessoa e o mês. */
export const chaveDoEspelho = (colaboradorId: string, mes: string): string => `${colaboradorId}|${mes}`;

/** Os espelhos assinados: de uma pessoa, ou (para o RH) de várias num mês. */
export const listarEspelhosAssinados = async (filtro: {
  colaboradorId?: string;
  colaboradorIds?: string[];
  mes?: string;
}): Promise<Map<string, EspelhoAssinado>> => {
  const mapa = new Map<string, EspelhoAssinado>();
  if (!usandoNuvem() || !supabase) return mapa;
  if (filtro.colaboradorIds && filtro.colaboradorIds.length === 0) return mapa;

  let consulta = supabase.from('espelhos_assinados').select('*');
  if (filtro.colaboradorId) consulta = consulta.eq('colaborador_id', filtro.colaboradorId);
  if (filtro.colaboradorIds) consulta = consulta.in('colaborador_id', filtro.colaboradorIds);
  if (filtro.mes) consulta = consulta.eq('mes', filtro.mes);

  const { data, error } = await consulta;
  if (error) {
    if (!semTabela(error)) console.error('Falha ao ler os espelhos assinados:', error.message);
    return mapa;
  }
  for (const l of (data || []) as LinhaEspelhoAssinado[]) {
    mapa.set(chaveDoEspelho(l.colaborador_id, l.mes), {
      colaboradorId: l.colaborador_id,
      mes: l.mes,
      assinaturaId: l.assinatura_id,
      conteudoHash: l.conteudo_hash,
      assinadoEm: l.assinado_em,
    });
  }
  return mapa;
};

/**
 * O código do espelho como está AGORA — o mesmo conteúdo que a tela mostra
 * (`conteudoDoEspelho`). As batidas do mês precisam estar no aparelho: o
 * Meu RH as traz antes de abrir (`prepararMeuEspelho`), e a tela do RH ao
 * escolher o mês.
 */
export const codigoDoEspelho = async (
  colaboradorId: string,
  mes: string,
  /** O resumo do mês já calculado (a tela do RH tem o da rede inteira). */
  resumos?: ResumoPontoColaborador[]
): Promise<string | null> => {
  const { inicio, fim } = periodoDoMes(mes);
  const resumo = (resumos || servicoPonto.obterResumoDoPeriodo(inicio, fim)).find(
    (r) => r.colaborador.id === colaboradorId
  );
  if (!resumo) return null;
  const bytes = new TextEncoder().encode(conteudoDoEspelho(resumo, inicio, fim));
  return codigoDoArquivo(bytes.buffer as ArrayBuffer);
};

/** ASSINA O ESPELHO do mês fechado de quem está usando. */
export const assinarEspelho = async (
  mes: string,
  senha: string
): Promise<{ sucesso: boolean; assinadoEm?: string; erro?: string }> => {
  if (!usandoNuvem() || !supabase) {
    return { sucesso: false, erro: 'Disponível apenas com o banco da rede ligado.' };
  }
  if (!senha) return { sucesso: false, erro: 'Digite a sua senha.' };

  const eu = bancoDados.obterColaboradorAtual();
  const codigo = await codigoDoEspelho(eu.id, mes);
  if (!codigo) return { sucesso: false, erro: MOTIVOS.arquivo };

  const { data, error } = await supabase.rpc('assinar_espelho', {
    p_mes: mes,
    p_senha: senha,
    p_hash: codigo,
    p_aparelho: descreverAparelho(),
  });
  if (error) {
    console.error('Falha ao assinar o espelho:', error.message);
    return {
      sucesso: false,
      erro: error.code === 'PGRST202' ? 'A assinatura do espelho ainda não foi ligada no banco. Avise o TI.' : error.message,
    };
  }

  const resposta = (data || {}) as { ok?: boolean; motivo?: string; assinado_em?: string };
  if (!resposta.ok) {
    return { sucesso: false, erro: MOTIVOS[resposta.motivo || ''] || 'A assinatura não foi registrada.' };
  }
  return { sucesso: true, assinadoEm: resposta.assinado_em };
};

/**
 * AS ASSINATURAS QUE ENTRAM NO PAPEL do mês, por pessoa: o desenho usado,
 * quando, e se o espelho de hoje ainda é o que foi assinado.
 */
export const assinaturasDoEspelho = async (
  colaboradorIds: string[],
  mes: string,
  resumos?: ResumoPontoColaborador[]
): Promise<Map<string, AssinaturaNoEspelho>> => {
  const resultado = new Map<string, AssinaturaNoEspelho>();
  const [assinados, doResponsavel] = await Promise.all([
    listarEspelhosAssinados({ colaboradorIds, mes }),
    listarAssinaturasDoResponsavel({ documento: 'espelho', mes }),
  ]);
  if (assinados.size === 0) return resultado;

  const imagens = await imagensDasAssinaturas([
    ...[...assinados.values()].map((e) => e.assinaturaId),
    ...[...doResponsavel.values()].map((r) => r.assinaturaId),
  ]);
  // O mês da rede é calculado uma vez, não uma por pessoa assinada
  const { inicio, fim } = periodoDoMes(mes);
  const doMes = resumos || servicoPonto.obterResumoDoPeriodo(inicio, fim);

  for (const e of assinados.values()) {
    const imagem = imagens.get(e.assinaturaId);
    if (!imagem) continue;
    const agora = await codigoDoEspelho(e.colaboradorId, mes, doMes);
    const responsavel = doResponsavel.get(chaveDoResponsavel('espelho', chaveDoEspelho(e.colaboradorId, mes)));
    const imagemDoResponsavel = responsavel && imagens.get(responsavel.assinaturaId);
    resultado.set(e.colaboradorId, {
      imagem,
      assinadoEm: e.assinadoEm,
      conteudoHash: e.conteudoHash,
      confere: agora === e.conteudoHash,
      responsavel:
        responsavel && imagemDoResponsavel
          ? { imagem: imagemDoResponsavel, nome: responsavel.responsavelNome, assinadoEm: responsavel.assinadoEm }
          : undefined,
    });
  }
  return resultado;
};

/** As imagens de várias assinaturas, por id, num pedido só. */
export const imagensDasAssinaturas = async (ids: string[]): Promise<Map<string, string>> => {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0 || !supabase) return new Map();
  const { data, error } = await supabase.from('assinaturas').select('*').in('id', unicos);
  if (error) {
    console.error('Falha ao ler as assinaturas:', error.message);
    return new Map();
  }
  return new Map(((data || []) as LinhaAssinatura[]).map((l) => [l.id, l.imagem]));
};

// ============================================================
// A ASSINATURA DO RESPONSÁVEL
//
// O RH assina, de uma vez, os espelhos de ponto que os colaboradores já
// assinaram (`assinar_como_responsavel`, em
// `supabase/assinatura-holerite.sql`). O banco escolhe o que entra: só o
// que o colaborador assinou, e nunca o espelho de quem assina. O holerite
// não tem responsável: leva só a assinatura do funcionário.
// ============================================================

export type DocumentoAssinavel = 'espelho';

export interface AssinaturaDoResponsavel {
  documento: DocumentoAssinavel;
  /** `chaveDoEspelho`: "colaborador_id|AAAA-MM". */
  referencia: string;
  colaboradorId: string;
  mes: string;
  responsavelId: string;
  responsavelNome: string;
  assinaturaId: string;
  assinadoEm: string;
}

interface LinhaDoResponsavel {
  documento: DocumentoAssinavel;
  referencia: string;
  colaborador_id: string;
  mes: string;
  responsavel_id: string;
  responsavel_nome: string;
  assinatura_id: string;
  assinado_em: string;
}

export const chaveDoResponsavel = (documento: DocumentoAssinavel, referencia: string): string =>
  `${documento}#${referencia}`;

/** As assinaturas do responsável: de um mês, de um tipo de documento, ou de alguns holerites. */
export const listarAssinaturasDoResponsavel = async (filtro: {
  documento?: DocumentoAssinavel;
  mes?: string;
  referencias?: string[];
}): Promise<Map<string, AssinaturaDoResponsavel>> => {
  const mapa = new Map<string, AssinaturaDoResponsavel>();
  if (!usandoNuvem() || !supabase) return mapa;
  if (filtro.referencias && filtro.referencias.length === 0) return mapa;

  let consulta = supabase.from('assinaturas_do_responsavel').select('*');
  if (filtro.documento) consulta = consulta.eq('documento', filtro.documento);
  if (filtro.mes) consulta = consulta.eq('mes', filtro.mes);
  if (filtro.referencias) consulta = consulta.in('referencia', filtro.referencias);

  const { data, error } = await consulta;
  if (error) {
    if (!semTabela(error)) console.error('Falha ao ler as assinaturas do responsável:', error.message);
    return mapa;
  }
  for (const l of (data || []) as LinhaDoResponsavel[]) {
    mapa.set(chaveDoResponsavel(l.documento, l.referencia), {
      documento: l.documento,
      referencia: l.referencia,
      colaboradorId: l.colaborador_id,
      mes: l.mes,
      responsavelId: l.responsavel_id,
      responsavelNome: l.responsavel_nome,
      assinaturaId: l.assinatura_id,
      assinadoEm: l.assinado_em,
    });
  }
  return mapa;
};

/** ASSINA COMO RESPONSÁVEL, de uma vez, os documentos do lote. */
export const assinarComoResponsavel = async (
  senha: string,
  /** As chaves dos espelhos (`chaveDoEspelho`). */
  espelhos: string[]
): Promise<{ sucesso: boolean; espelhos?: number; erro?: string }> => {
  if (!usandoNuvem() || !supabase) {
    return { sucesso: false, erro: 'Disponível apenas com o banco da rede ligado.' };
  }
  if (!senha) return { sucesso: false, erro: 'Digite a sua senha.' };

  const { data, error } = await supabase.rpc('assinar_como_responsavel', {
    p_senha: senha,
    p_espelhos: espelhos,
  });
  if (error) {
    console.error('Falha ao assinar como responsável:', error.message);
    return {
      sucesso: false,
      erro:
        error.code === 'PGRST202' ? 'A assinatura do responsável ainda não foi ligada no banco. Avise o TI.' : error.message,
    };
  }
  const resposta = (data || {}) as { ok?: boolean; motivo?: string; espelhos?: number };
  if (!resposta.ok) {
    return { sucesso: false, erro: MOTIVOS[resposta.motivo || ''] || 'A assinatura não foi registrada.' };
  }
  return { sucesso: true, espelhos: resposta.espelhos || 0 };
};

/**
 * QUANTOS ESPELHOS ESPERAM O RESPONSÁVEL, na rede inteira — o aviso do
 * painel do RH. Conta o que o colaborador assinou e o RH ainda não, menos
 * o espelho de quem pergunta. Não confere espelho alterado (isso pede as
 * batidas do mês): a tela das Assinaturas mostra cada um com o motivo.
 */
export const contarParaOResponsavel = async (eu: string): Promise<number> => {
  const [espelhos, feitas] = await Promise.all([listarEspelhosAssinados({}), listarAssinaturasDoResponsavel({})]);
  return [...espelhos.values()].filter(
    (e) =>
      e.colaboradorId !== eu &&
      !feitas.has(chaveDoResponsavel('espelho', chaveDoEspelho(e.colaboradorId, e.mes)))
  ).length;
};
