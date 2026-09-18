/**
 * Holerites e advertências — CONECTA / Malachias Autopeças
 *
 * DOCUMENTO DE PESSOA TEM REGRA MAIS APERTADA QUE O RESTO DO SISTEMA.
 *
 * A pessoa vê só os dela; RH, Diretoria e TI veem todos; ninguém mais vê
 * nada — nem o gerente da loja, nem o líder do setor. Isso não é detalhe:
 * holerite e advertência não são assunto de quem aprova hora. Um gerente
 * que enxerga o salário da equipe muda a relação de trabalho inteira.
 *
 * A trava real está na segurança por linha do banco. O que está aqui é a
 * mesma regra dita na tela, para não oferecer botão que o banco vai
 * recusar.
 *
 * NÃO HÁ CÓPIA LOCAL. Diferente de conversa e ponto, estes documentos são
 * lidos raramente e são sensíveis: guardá-los no armazenamento do aparelho
 * deixaria o holerite de oitenta pessoas no computador do balcão.
 */

import { supabase, usandoNuvem } from './supabase';
import { enviarDocumento, resolverCaminho, apagarAnexos } from './anexos';
import { bancoDados } from './bancoDados';
import { cuidaDePessoas, Holerite, Advertencia, TipoAdvertencia } from '../tipos';

/** Quem cuida de pessoas mexe nestes documentos. Os outros só leem os seus. */
export const podeCuidarDeDocumentos = (): boolean =>
  cuidaDePessoas(bancoDados.obterColaboradorAtual());

// --- HOLERITES ---

interface LinhaHolerite {
  id: string;
  colaborador_id: string;
  competencia: string;
  arquivo_caminho: string;
  arquivo_nome: string;
  enviado_por_id: string | null;
  enviado_por_nome: string | null;
  criado_em: string;
}

const paraHolerite = (l: LinhaHolerite): Holerite => ({
  id: l.id,
  colaboradorId: l.colaborador_id,
  competencia: l.competencia,
  arquivoCaminho: l.arquivo_caminho,
  arquivoNome: l.arquivo_nome,
  enviadoPorId: l.enviado_por_id || undefined,
  enviadoPorNome: l.enviado_por_nome || undefined,
  criadoEm: l.criado_em,
});

/**
 * Os holerites que esta sessão pode ver.
 *
 * Sem filtro por pessoa aqui de propósito: quem decide é a regra do banco.
 * Filtrar também aqui criaria uma segunda regra, e um dia elas
 * discordariam — a tela mostraria menos do que a pessoa tem direito, ou
 * mais.
 */
export const listarHolerites = async (
  colaboradorId?: string
): Promise<Holerite[]> => {
  if (!usandoNuvem() || !supabase) return [];

  let consulta = supabase
    .from('holerites')
    .select('*')
    .order('competencia', { ascending: false });

  if (colaboradorId) consulta = consulta.eq('colaborador_id', colaboradorId);

  const { data, error } = await consulta;
  if (error) {
    console.error('Falha ao ler os holerites:', error.message);
    return [];
  }
  return ((data || []) as LinhaHolerite[]).map(paraHolerite);
};

/**
 * Guarda o holerite de um mês.
 *
 * Reenviar SUBSTITUI o do mesmo mês, em vez de empilhar duas versões: duas
 * linhas do mesmo mês deixam a pessoa adivinhando qual vale, e a errada é
 * sempre a que ela abre primeiro.
 */
export const salvarHolerite = async (dados: {
  colaboradorId: string;
  competencia: string;
  conteudo: string;
  arquivoNome: string;
}): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!podeCuidarDeDocumentos()) {
    return { sucesso: false, erro: 'Apenas o RH publica holerite.' };
  }
  if (!usandoNuvem() || !supabase) {
    return { sucesso: false, erro: 'Disponível apenas com o banco da rede ligado.' };
  }
  if (!/^\d{4}-\d{2}$/.test(dados.competencia)) {
    return { sucesso: false, erro: 'Informe a competência no formato AAAA-MM.' };
  }

  const eu = bancoDados.obterColaboradorAtual();
  const id = `hol-${dados.colaboradorId}-${dados.competencia}`;

  /**
   * O caminho carrega a pessoa e o mês.
   *
   * Assim o arquivo é localizável sem consultar a tabela — e, mais
   * importante, reenviar o mesmo mês sobrescreve o arquivo em vez de deixar
   * o antigo ocupando espaço para sempre.
   */
  const enviado = await enviarDocumento(
    dados.conteudo,
    `holerites/${dados.colaboradorId}/${dados.competencia}.pdf`
  );
  if (!enviado) {
    return { sucesso: false, erro: 'Não foi possível subir o arquivo.' };
  }

  const { error } = await supabase.from('holerites').upsert(
    {
      id,
      colaborador_id: dados.colaboradorId,
      competencia: dados.competencia,
      arquivo_caminho: enviado.caminho,
      arquivo_nome: dados.arquivoNome,
      enviado_por_id: eu.id,
      enviado_por_nome: eu.nome,
    },
    { onConflict: 'colaborador_id,competencia' }
  );

  if (error) {
    console.error('Falha ao gravar o holerite:', error.message);
    return { sucesso: false, erro: error.message };
  }

  bancoDados.registrarAuditoria(
    'Holerite publicado',
    'usuario',
    `${eu.nome} publicou o holerite de ${dados.competencia} de ${
      bancoDados.obterColaboradorPorId(dados.colaboradorId)?.nome || dados.colaboradorId
    }.`
  );

  return { sucesso: true };
};

export const removerHolerite = async (
  holerite: Holerite
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!podeCuidarDeDocumentos()) {
    return { sucesso: false, erro: 'Apenas o RH remove holerite.' };
  }
  if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

  const { error } = await supabase.from('holerites').delete().eq('id', holerite.id);
  if (error) return { sucesso: false, erro: error.message };

  // O arquivo sai junto: linha apagada com arquivo órfão ocupa espaço para
  // sempre e ninguém mais consegue nem achá-lo
  await apagarAnexos([holerite.arquivoCaminho]);
  return { sucesso: true };
};

/** O endereço para abrir o documento, válido por pouco tempo. */
export const abrirDocumento = async (caminho: string): Promise<string | null> =>
  resolverCaminho(caminho);

// --- ADVERTÊNCIAS ---

interface LinhaAdvertencia {
  id: string;
  colaborador_id: string;
  tipo: string;
  data: string;
  motivo: string;
  dias_suspensao: number | null;
  arquivo_caminho: string | null;
  arquivo_nome: string | null;
  ciencia_em: string | null;
  aplicada_por_id: string | null;
  aplicada_por_nome: string | null;
  criado_em: string;
}

const paraAdvertencia = (l: LinhaAdvertencia): Advertencia => ({
  id: l.id,
  colaboradorId: l.colaborador_id,
  tipo: l.tipo as TipoAdvertencia,
  data: l.data,
  motivo: l.motivo,
  diasSuspensao: l.dias_suspensao ?? undefined,
  arquivoCaminho: l.arquivo_caminho || undefined,
  arquivoNome: l.arquivo_nome || undefined,
  cienciaEm: l.ciencia_em || undefined,
  aplicadaPorId: l.aplicada_por_id || undefined,
  aplicadaPorNome: l.aplicada_por_nome || undefined,
  criadoEm: l.criado_em,
});

export const listarAdvertencias = async (
  colaboradorId?: string
): Promise<Advertencia[]> => {
  if (!usandoNuvem() || !supabase) return [];

  let consulta = supabase
    .from('advertencias')
    .select('*')
    .order('data', { ascending: false });

  if (colaboradorId) consulta = consulta.eq('colaborador_id', colaboradorId);

  const { data, error } = await consulta;
  if (error) {
    console.error('Falha ao ler as advertências:', error.message);
    return [];
  }
  return ((data || []) as LinhaAdvertencia[]).map(paraAdvertencia);
};

export const registrarAdvertencia = async (dados: {
  colaboradorId: string;
  tipo: TipoAdvertencia;
  data: string;
  motivo: string;
  diasSuspensao?: number;
  documento?: { conteudo: string; nome: string };
}): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!podeCuidarDeDocumentos()) {
    return { sucesso: false, erro: 'Apenas o RH registra advertência.' };
  }
  if (!usandoNuvem() || !supabase) {
    return { sucesso: false, erro: 'Disponível apenas com o banco da rede ligado.' };
  }

  /**
   * O MOTIVO É OBRIGATÓRIO, e com tamanho mínimo.
   *
   * Advertência sem motivo escrito não se sustenta em lugar nenhum — nem
   * numa conversa com a pessoa, nem num processo. E "atraso" sozinho não é
   * motivo: é assunto.
   */
  const motivo = dados.motivo.trim();
  if (motivo.length < 15) {
    return {
      sucesso: false,
      erro: 'Descreva o motivo com pelo menos uma frase. É ele que sustenta a advertência.',
    };
  }
  if (dados.tipo === 'suspensao' && !dados.diasSuspensao) {
    return { sucesso: false, erro: 'Informe quantos dias de suspensão.' };
  }

  const eu = bancoDados.obterColaboradorAtual();
  const id = `adv-${dados.colaboradorId}-${Date.now()}`;

  let caminho: string | null = null;
  if (dados.documento?.conteudo) {
    const enviado = await enviarDocumento(
      dados.documento.conteudo,
      `advertencias/${dados.colaboradorId}/${id}.pdf`
    );
    if (!enviado) return { sucesso: false, erro: 'Não foi possível subir o documento.' };
    caminho = enviado.caminho;
  }

  const { error } = await supabase.from('advertencias').insert({
    id,
    colaborador_id: dados.colaboradorId,
    tipo: dados.tipo,
    data: dados.data,
    motivo,
    dias_suspensao: dados.diasSuspensao ?? null,
    arquivo_caminho: caminho,
    arquivo_nome: dados.documento?.nome ?? null,
    aplicada_por_id: eu.id,
    aplicada_por_nome: eu.nome,
  });

  if (error) {
    console.error('Falha ao registrar a advertência:', error.message);
    return { sucesso: false, erro: error.message };
  }

  bancoDados.registrarAuditoria(
    'Advertência registrada',
    'seguranca',
    `${eu.nome} registrou advertência ${dados.tipo} para ${
      bancoDados.obterColaboradorPorId(dados.colaboradorId)?.nome || dados.colaboradorId
    }.`
  );

  return { sucesso: true };
};

/**
 * A CIÊNCIA É DA PRÓPRIA PESSOA.
 *
 * Só ela pode marcar. Uma advertência em que o RH clica "ele leu" não é
 * ciência de ninguém — é o RH afirmando algo sobre outra pessoa, que é
 * exatamente o que uma ciência existe para evitar.
 */
export const darCienciaNaAdvertencia = async (
  advertencia: Advertencia
): Promise<{ sucesso: boolean; erro?: string }> => {
  const eu = bancoDados.obterColaboradorAtual();
  if (advertencia.colaboradorId !== eu.id) {
    return { sucesso: false, erro: 'A ciência é de quem recebeu a advertência.' };
  }
  if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

  const { error } = await supabase
    .from('advertencias')
    .update({ ciencia_em: new Date().toISOString() })
    .eq('id', advertencia.id);

  if (error) return { sucesso: false, erro: error.message };
  return { sucesso: true };
};

export const removerAdvertencia = async (
  advertencia: Advertencia
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!podeCuidarDeDocumentos()) {
    return { sucesso: false, erro: 'Apenas o RH remove advertência.' };
  }
  if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

  const { error } = await supabase.from('advertencias').delete().eq('id', advertencia.id);
  if (error) return { sucesso: false, erro: error.message };

  if (advertencia.arquivoCaminho) await apagarAnexos([advertencia.arquivoCaminho]);
  return { sucesso: true };
};
