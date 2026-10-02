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
import { Assinatura, Holerite, RecebimentoHolerite } from '../tipos';
import { codigoDoArquivo } from './comprovanteDeHolerite';

/**
 * O TERMO DE ADESÃO. Mudou o texto? Mude a versão: o banco guarda qual
 * versão cada pessoa aceitou ao desenhar a assinatura.
 */
export const TERMO_VERSAO = '2026-10';
export const TEXTO_DO_TERMO = [
  'Concordo em receber meus holerites e demais documentos de trabalho pelo CONECTA, em formato eletrônico, no lugar da via em papel.',
  'Reconheço como minha a assinatura que desenho abaixo. Ela será aplicada aos documentos que eu confirmar, sempre com a minha senha pessoal.',
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

/** Uma assinatura pelo id — a que foi usada num recebimento, mesmo que trocada depois. */
export const obterAssinatura = async (id: string): Promise<Assinatura | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('assinaturas').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return paraAssinatura(data as LinhaAssinatura);
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
