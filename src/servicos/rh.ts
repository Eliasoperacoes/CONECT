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

import { avisarQueDocumentosMudaram } from './documentosDaPessoa';
import { supabase, usandoNuvem } from './supabase';
import { enviarDocumento, resolverCaminho, apagarAnexos } from './anexos';
import { bancoDados } from './bancoDados';
import { listarRecebimentos, imagensDasAssinaturas } from './assinatura';
import { pedirAvisoDeDocumentoRh } from './envioDeAviso';
import { montarComprovante, juntarPdfs } from './comprovanteDeHolerite';
import { cuidaDePessoas, Holerite, Advertencia, TipoAdvertencia, RecebimentoHolerite } from '../tipos';

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
  /** Avisar a pessoa no celular. A carga do PDF desliga e avisa todos juntos no fim. */
  avisar?: boolean;
}): Promise<{ sucesso: boolean; id?: string; erro?: string }> => {
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

  /*
    ASSINADO NÃO SE SUBSTITUI. O banco recusaria a linha, mas só DEPOIS de
    o arquivo novo já ter sobrescrito o assinado no armazenamento — e o
    comprovante passaria a acusar "este arquivo não é o que foi assinado".
  */
  if ((await listarRecebimentos({ holeriteIds: [id] })).size > 0) {
    return { sucesso: false, erro: 'Este holerite já foi assinado pelo colaborador e não pode ser substituído.' };
  }

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

  // A carga do PDF avisa todos de uma vez no fim (`avisar: false` aqui)
  if (dados.avisar !== false) pedirAvisoDeDocumentoRh('holerite', [id]);

  return { sucesso: true, id };
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

/**
 * APAGA TODOS OS HOLERITES DE UM MÊS — a carga de teste, ou a que subiu
 * errada e vai ser refeita.
 *
 * O `.select()` depois do delete não é enfeite: ele devolve as linhas que
 * o banco DE FATO apagou. Sem permissão, o delete do Supabase afeta zero
 * linhas e responde sucesso — e a tela diria "limpo" com tudo lá.
 */
export const removerHoleritesDoMes = async (
  competencia: string
): Promise<{ sucesso: boolean; removidos: number; assinadosMantidos: number; erro?: string }> => {
  const recusa = (erro: string) => ({ sucesso: false, removidos: 0, assinadosMantidos: 0, erro });
  if (!podeCuidarDeDocumentos()) return recusa('Apenas o RH remove holerite.');
  if (!supabase) return recusa('Banco não configurado.');
  if (!/^\d{4}-\d{2}$/.test(competencia)) return recusa('Escolha o mês (competência).');

  /*
    O ASSINADO FICA. É a via que o colaborador assinou: o banco recusa
    apagá-lo, e a recusa de UM desfaria a limpeza do mês inteiro. Por isso
    os assinados saem do pedido antes.
  */
  const doMes = await supabase.from('holerites').select('id').eq('competencia', competencia);
  if (doMes.error) return recusa(doMes.error.message);
  const assinados = [
    ...(await listarRecebimentos({ holeriteIds: ((doMes.data || []) as Array<{ id: string }>).map((h) => h.id) })).keys(),
  ];

  let pedido = supabase.from('holerites').delete().eq('competencia', competencia);
  if (assinados.length > 0) {
    pedido = pedido.not('id', 'in', `(${assinados.map((id) => `"${id}"`).join(',')})`);
  }
  const { data, error } = await pedido.select('arquivo_caminho');
  if (error) return recusa(error.message);

  const linhas = (data || []) as Array<{ arquivo_caminho: string | null }>;
  // Os arquivos saem junto, pelo mesmo motivo do `removerHolerite`
  await apagarAnexos(linhas.map((l) => l.arquivo_caminho).filter((c): c is string => !!c));

  const eu = bancoDados.obterColaboradorAtual();
  bancoDados.registrarAuditoria(
    'Holerites removidos',
    'usuario',
    `${eu.nome} removeu os ${linhas.length} holerites de ${competencia}.`
  );
  return { sucesso: true, removidos: linhas.length, assinadosMantidos: assinados.length };
};

/**
 * OS HOLERITES ASSINADOS, CARIMBADOS — o que o RH arquiva no lugar das
 * vias em papel. Um ou o mês inteiro, num PDF só, na ordem pedida.
 *
 * Cada um é montado do arquivo publicado e da assinatura USADA no
 * recebimento — não da vigente: quem trocou a assinatura depois continua
 * com a antiga nos documentos que já tinha assinado.
 */
export const gerarComprovantes = async (
  itens: Array<{ holerite: Holerite; recebimento: RecebimentoHolerite; nome: string }>
): Promise<{ pdf?: Uint8Array; erro?: string }> => {
  if (!podeCuidarDeDocumentos()) return { erro: 'Apenas o RH gera o comprovante.' };
  return montarComprovantes(itens);
};

/**
 * O COMPROVANTE DO PRÓPRIO HOLERITE, para o colaborador.
 *
 * Depois de assinado, o documento que vale é o carimbado — e não o PDF em
 * branco (Elias, 05/10/2026). O holerite leva só a assinatura do
 * funcionário; o responsável assina o espelho, não o holerite. Só o
 * próprio: o banco já só entrega os dele.
 */
export const gerarMeuComprovante = async (
  holerite: Holerite,
  recebimento: RecebimentoHolerite
): Promise<{ pdf?: Uint8Array; erro?: string }> => {
  const eu = bancoDados.obterColaboradorAtual();
  if (holerite.colaboradorId !== eu.id) return { erro: 'Este holerite não é seu.' };
  return montarComprovantes([{ holerite, recebimento, nome: eu.nome }]);
};

const montarComprovantes = async (
  itens: Array<{ holerite: Holerite; recebimento: RecebimentoHolerite; nome: string }>
): Promise<{ pdf?: Uint8Array; erro?: string }> => {
  const arquivos: Uint8Array[] = [];

  // As assinaturas de todos de uma vez — o holerite leva só a do funcionário
  const desenhos = await imagensDasAssinaturas(itens.map((i) => i.recebimento.assinaturaId));

  for (const { holerite, recebimento, nome } of itens) {
    const url = await resolverCaminho(holerite.arquivoCaminho);
    const resposta = url ? await fetch(url).catch(() => null) : null;
    if (!resposta?.ok) return { erro: `Não foi possível abrir o holerite de ${nome}.` };

    const desenho = desenhos.get(recebimento.assinaturaId);
    if (!desenho) return { erro: `Não foi possível ler a assinatura de ${nome}.` };

    arquivos.push(await montarComprovante({ pdf: await resposta.arrayBuffer(), nome, recebimento, imagem: desenho }));
  }

  if (arquivos.length === 0) return { erro: 'Nenhum holerite assinado.' };
  return { pdf: arquivos.length === 1 ? arquivos[0] : await juntarPdfs(arquivos) };
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

  // A pessoa é avisada no celular de que há um documento para dar ciência
  pedirAvisoDeDocumentoRh('advertencia', [id]);

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

  const { data, error } = await supabase
    .from('advertencias')
    .update({ ciencia_em: new Date().toISOString() })
    .eq('id', advertencia.id)
    .select('ciencia_em');

  if (error) return { sucesso: false, erro: error.message };
  /**
   * UPDATE QUE NÃO ALCANÇOU LINHA NENHUMA DEVOLVE SUCESSO.
   *
   * A segurança por linha barra calada — e a tela diria "ciência dada"
   * numa advertência que continua sem ciência no banco, que é justamente
   * o registro que precisa existir.
   */
  if (!data || data.length === 0 || !data[0].ciencia_em) {
    return { sucesso: false, erro: 'A ciência não foi registrada. Tente de novo.' };
  }
  avisarQueDocumentosMudaram();
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
