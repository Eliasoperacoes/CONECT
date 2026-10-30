/**
 * Ponte de comunicação com o banco da rede — CONECTA / Malachias Autopeças
 *
 * Mesma estratégia da ponte de pessoas (`nuvem.ts`): o armazenamento do
 * navegador é CACHE, o banco é a verdade. A diferença é o que vive aqui —
 * conversa, mensagem, leitura, aviso da rede, configuração e auditoria.
 *
 * Duas coisas NÃO são guardadas no banco porque são derivadas, e guardar
 * derivado é criar divergência:
 *
 *  - a prévia da última mensagem da conversa, montada a partir da própria
 *    mensagem mais recente;
 *  - a contagem de não lidas, que é por pessoa e sai de `leituras_mensagem`.
 */

import {
  AvisoRede,
  Conversa,
  ConfiguracaoSistema,
  Mensagem,
  RegistroAuditoria,
  TipoConversa,
  TipoMensagem,
  Colaborador,
  leAuditoria,
} from '../tipos';
import { lerLista, gravarLista } from './cacheDeLeitura';
import { sincronizarPeloQueMudou, type ConsultaSincronizavel } from './sincronizacaoIncremental';

/** Quem está no aparelho, pelo cache — para saber se ele lê a auditoria */
const euNoAparelho = (): Colaborador | undefined => {
  const id = localStorage.getItem('conecta_v4_colaborador_atual');
  return id ? lerLista<Colaborador>('conecta_v4_colaboradores').find((c) => c.id === id) : undefined;
};
import { supabase } from './supabase';
import { pedirAvisoDaMensagem } from './envioDeAviso';
import { reacoesNovasDeOutros, avisarReacoesNoNavegador } from './avisoDeReacao';
import { explicarRecusaDoBanco } from './recusaDoBanco';
import { buscarTodasAsLinhas } from './paginacao';
import { resolverCaminhos } from './anexos';
import { acompanharCanal } from './reconexao';
import {
  aplicarPreferenciasDaNuvem,
  type MapaDePreferencias,
} from './preferenciasConversa';
import { aplicarPermissoes, MapaDePermissoes } from './permissoes';
import { horaDe, LinhaAviso, paraAvisoRede } from './linhasDoBanco';

const CHAVE_CONVERSAS = 'conecta_v4_conversas';
/*
  As linhas do chat como o banco as devolveu, base da sincronização pelo que
  mudou (sincronizacaoIncremental.ts). As telas leem as chaves montadas
  (CHAVE_CONVERSAS, CHAVE_MENSAGENS); estas só a carga lê.
*/
const CHAVE_LINHAS_CONVERSAS = 'conecta_v4_linhas_conversas';
const CHAVE_LINHAS_PARTICIPANTES = 'conecta_v4_linhas_participantes';
const CHAVE_LINHAS_MENSAGENS = 'conecta_v4_linhas_mensagens';
const CHAVE_LINHAS_LEITURAS = 'conecta_v4_linhas_leituras';

/** As leituras que ainda não chegaram ao banco (`marcarLeitura`) */
const CHAVE_LEITURAS_PENDENTES = 'conecta_v4_leituras_pendentes';
/** Parada há mais de uma semana, a leitura não vai mais subir: sai da fila */
const VALIDADE_DA_LEITURA_PENDENTE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Recusas que não mudam tentando de novo: a mensagem não existe mais
 * (23503) ou a regra não deixa mais (42501, saiu da conversa).
 */
const RECUSAS_SEM_VOLTA = new Set(['23503', '42501']);

/** Uma leitura na fila: mensagem, pessoa e quando entrou */
interface LeituraPendente {
  m: string;
  c: string;
  em: number;
}

export const lerLeiturasPendentes = (agora = Date.now()): LeituraPendente[] => {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_LEITURAS_PENDENTES) || '[]') as LeituraPendente[];
    return Array.isArray(lista) ? lista.filter((p) => agora - p.em < VALIDADE_DA_LEITURA_PENDENTE_MS) : [];
  } catch {
    return [];
  }
};

const gravarLeiturasPendentes = (lista: LeituraPendente[]): void => {
  try {
    if (lista.length > 0) localStorage.setItem(CHAVE_LEITURAS_PENDENTES, JSON.stringify(lista));
    else localStorage.removeItem(CHAVE_LEITURAS_PENDENTES);
  } catch {
    /* aparelho cheio: a leitura sobe na próxima vez que a conversa abrir */
  }
};

const guardarLeiturasPendentes = (mensagemIds: string[], colaboradorId: string): void => {
  const atuais = lerLeiturasPendentes();
  const ja = new Set(atuais.map((p) => `${p.m}|${p.c}`));
  const agora = Date.now();
  gravarLeiturasPendentes([
    ...atuais,
    ...mensagemIds.filter((m) => !ja.has(`${m}|${colaboradorId}`)).map((m) => ({ m, c: colaboradorId, em: agora })),
  ]);
};

const tirarLeiturasPendentes = (mensagemIds: string[], colaboradorId: string): void => {
  const saem = new Set(mensagemIds);
  gravarLeiturasPendentes(lerLeiturasPendentes().filter((p) => !(p.c === colaboradorId && saem.has(p.m))));
};
/**
 * Conversas que já sabemos existir no banco.
 *
 * Existe para não repetir trabalho: `salvarConversa` faz até QUATRO idas ao
 * banco (a conversa, a minha participação, quem já está dentro, os que
 * faltam), e ela rodava a cada mensagem enviada — mesmo numa conversa aberta
 * há meses. Somando a ida da própria mensagem, eram cinco viagens antes de o
 * texto aparecer na tela.
 *
 * Fica no armazenamento do aparelho porque é só um atalho: se estiver
 * errado, o banco recusa a mensagem por referência quebrada e o envio
 * refaz a conversa antes de tentar de novo.
 */
const CHAVE_CONVERSAS_NO_BANCO = 'conecta_v4_conversas_no_banco';

const lerConversasNoBanco = (): Set<string> => {
  try {
    const bruto = localStorage.getItem(CHAVE_CONVERSAS_NO_BANCO);
    const lista = bruto ? JSON.parse(bruto) : [];
    return new Set(Array.isArray(lista) ? lista : []);
  } catch {
    return new Set();
  }
};

export const conversaJaEstaNoBanco = (conversaId: string): boolean =>
  lerConversasNoBanco().has(conversaId);

export const marcarConversaNoBanco = (conversaId: string): void => {
  try {
    const atual = lerConversasNoBanco();
    if (atual.has(conversaId)) return;
    atual.add(conversaId);
    localStorage.setItem(CHAVE_CONVERSAS_NO_BANCO, JSON.stringify([...atual]));
  } catch {
    // Sem armazenamento: a conversa sobe de novo, que é só lentidão
  }
};

export const esquecerConversaDoBanco = (conversaId: string): void => {
  try {
    const atual = lerConversasNoBanco();
    if (!atual.delete(conversaId)) return;
    localStorage.setItem(CHAVE_CONVERSAS_NO_BANCO, JSON.stringify([...atual]));
  } catch {
    // ignora
  }
};
const CHAVE_MENSAGENS = 'conecta_v4_mensagens';

/**
 * Quanto se espera para juntar eventos de tempo real que chegam em rajada.
 *
 * Não atrasa a primeira mensagem: o primeiro evento depois de uma calmaria
 * é atendido na hora. Esta janela só junta o que vem GRUDADO nele — a
 * rajada de trinta marcações de leitura de alguém abrindo uma conversa com
 * trinta não lidas, que antes virava trinta sincronizações completas em
 * cada aparelho da rede.
 */
const ESPERA_PARA_JUNTAR_EVENTOS_MS = 500;
const CHAVE_AVISOS_REDE = 'conecta_v4_avisos_rede';
const CHAVE_CONFIGURACOES = 'conecta_v4_configuracoes';
const CHAVE_AUDITORIA = 'conecta_v4_auditoria';

// --- Formatação compartilhada ---

/**
 * As mensagens que este aparelho mandou e o banco ainda não confirmou.
 *
 * Só elas escapam da reescrita do cache na sincronização. Se o cache estiver
 * ilegível devolve lista vazia: perder uma mensagem em trânsito é ruim, mas
 * derrubar a sincronização inteira da rede por causa dela é pior.
 */
const lerPendentesDoAparelho = (): Mensagem[] => {
  try {
    const bruto = localStorage.getItem(CHAVE_MENSAGENS);
    if (!bruto) return [];
    const todas: Mensagem[] = JSON.parse(bruto);
    return todas.filter((m) => m.envio === 'enviando');
  } catch {
    return [];
  }
};

/**
 * A CONVERSA A DOIS QUE AINDA ESTÁ SUBINDO NÃO PODE TROCAR DE CARA.
 *
 * "Ao abrir o chat, o nome do colaborador fica oscilando por alguns
 * segundos" (Elias, 03/10/2026). Criar a conversa no banco são três
 * gravações: a conversa, a MINHA inscrição, a do colega. Qualquer
 * sincronização no meio — basta alguém da rede mandar qualquer coisa —
 * reescrevia o cache com o banco pela metade:
 *
 *   - antes da conversa existir lá, ela sumia da tela;
 *   - só comigo inscrito, o "outro participante" era eu mesmo, e o
 *     cabeçalho mostrava o MEU nome.
 *
 * Até o colega entrar, vale a versão do aparelho. Só para a conversa a
 * dois que é minha — grupo tem dono no banco (adicionar_ao_grupo), e uma
 * conversa que o banco já conheceu e não devolve mais foi apagada.
 */
export const juntarConversasEmTransito = (
  doBanco: Conversa[],
  doAparelho: Conversa[],
  meuId: string | null
): Conversa[] => {
  if (!meuId) return doBanco;

  const aDoisMinha = (c: Conversa | undefined): c is Conversa =>
    !!c && c.tipo === 'individual' && c.participantesIds.length === 2 && c.participantesIds.includes(meuId);

  const locais = new Map(doAparelho.map((c) => [c.id, c]));
  const corrigidas = doBanco.map((c) => {
    const local = locais.get(c.id);
    return c.tipo === 'individual' && c.participantesIds.length < 2 && aDoisMinha(local)
      ? { ...c, participantesIds: local.participantesIds }
      : c;
  });

  const noBanco = new Set(doBanco.map((c) => c.id));
  const subindo = doAparelho.filter(
    (c) => aDoisMinha(c) && !noBanco.has(c.id) && !conversaJaEstaNoBanco(c.id)
  );
  return subindo.length > 0 ? [...corrigidas, ...subindo] : corrigidas;
};

const lerMensagensDoAparelho = (): Mensagem[] => {
  try {
    const bruto = localStorage.getItem(CHAVE_MENSAGENS);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
};

const lerConversasDoAparelho = (): Conversa[] => {
  try {
    const bruto = localStorage.getItem(CHAVE_CONVERSAS);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
};

/**
 * Carimbo da auditoria como ele aparece na tela. Leva o dia junto da hora
 * porque um registro de auditoria costuma ser lido dias depois do fato, e
 * "15:32" sozinho não diz de quando é.
 */
export const carimboDeAuditoria = (iso: string): string => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Texto curto que aparece na lista de conversas. Precisa ser o mesmo para
 * quem enviou e para quem recebeu, por isso mora aqui e não na tela.
 */
/**
 * A mensagem como fica depois de apagada: só o lugar dela — quem, onde e
 * quando. É o que o gatilho do banco grava (mensagem-apagada.sql); aqui é o
 * aparelho de quem apagou mostrando o mesmo antes do evento voltar.
 */
export const comoApagada = (m: Mensagem, quando: string): Mensagem => ({
  id: m.id,
  conversaId: m.conversaId,
  remetenteId: m.remetenteId,
  tipo: m.tipo,
  criadoEm: m.criadoEm,
  horaFormatada: m.horaFormatada,
  lida: m.lida,
  lidaPor: m.lidaPor,
  apagadaEm: quando,
});

export const montarPreviaDaMensagem = (m: Mensagem): string => {
  if (m.apagadaEm) return '🚫 Mensagem apagada';
  if (m.tipo === 'recado_voz') return '🎤 Recado de voz';
  if (m.tipo === 'arquivo') return `📎 ${m.arquivoNome || 'Arquivo'}`;
  if (m.tipo === 'imagem') return `📷 Foto${m.legenda ? ` · ${m.legenda}` : ''}`;
  const texto = m.texto || '';
  return m.ehEncaminhada ? `↪ ${texto || 'Mensagem encaminhada'}` : texto;
};

// --- Linhas do banco ---

interface LinhaConversa {
  id: string;
  tipo: string;
  nome: string;
  foto: string | null;
  descricao: string | null;
  criado_por_id: string | null;
  apenas_gestores_publicam: boolean;
  eh_sistema_padrao: boolean;
  atualizado_em: string;
  criado_em: string;
}

/** Linha da tabela `participantes`, com as preferências de cada um. */
interface LinhaParticipante {
  conversa_id: string;
  colaborador_id: string;
  fixada?: boolean;
  oculta_desde?: string | null;
  removida?: boolean | null;
  /** 'admin' ou 'membro' — antes de grupos-de-todos.sql, a coluna nem existe */
  papel?: string | null;
  /** Quando a pessoa saiu do grupo; a linha fica, com o histórico até ali */
  saiu_em?: string | null;
}

/** Quem leu qual mensagem — só as duas colunas descem */
interface LinhaLeitura {
  mensagem_id: string;
  colaborador_id: string;
}

interface LinhaMensagem {
  id: string;
  conversa_id: string;
  remetente_id: string;
  tipo: string;
  texto: string | null;
  audio_url: string | null;
  audio_duracao: number | null;
  arquivo_nome: string | null;
  arquivo_tamanho: string | null;
  arquivo_url: string | null;
  imagem_url: string | null;
  legenda: string | null;
  eh_encaminhada: boolean;
  eh_aviso_direcao: boolean;
  responde_a: string | null;
  reacoes: Record<string, string[]> | null;
  editada_em: string | null;
  /** Antes de mensagem-apagada.sql a coluna não existe */
  apagada_em?: string | null;
  fixada_em: string | null;
  fixada_por_id: string | null;
  anexo_caminho: string | null;
  publicacao_id: string | null;
  /** Ausente no banco que não rodou o `cotador-cartao-no-chat.sql` */
  cotacao_codigo?: string | null;
  /** Ausente no banco que não rodou o `cotador-encomendas.sql` */
  encomenda_id?: string | null;
  /** Só nos recados que o banco escreve (avisar_encomendas); a tela nunca os grava */
  encomenda_ids?: string[] | null;
  aviso_encomenda?: string | null;
  criado_em: string;
}


/**
 * A LINHA DO BANCO COMO A MENSAGEM QUE A TELA LÊ — um lugar só, para a carga
 * completa e para o evento ao vivo (21/10/2026). Duas montagens divergiriam:
 * uma mensagem chegaria ao vivo de um jeito e voltaria na carga de outro.
 */
export const paraMensagemDaLinha = (linha: LinhaMensagem, lidaPor: string[]): Mensagem => ({
  id: linha.id,
  conversaId: linha.conversa_id,
  remetenteId: linha.remetente_id,
  tipo: linha.tipo as TipoMensagem,
  texto: linha.texto || undefined,
  audioUrl: linha.audio_url || undefined,
  audioDuracao: linha.audio_duracao ?? undefined,
  arquivoNome: linha.arquivo_nome || undefined,
  arquivoTamanho: linha.arquivo_tamanho || undefined,
  arquivoUrl: linha.arquivo_url || undefined,
  imagemUrl: linha.imagem_url || undefined,
  legenda: linha.legenda || undefined,
  criadoEm: linha.criado_em,
  horaFormatada: horaDe(linha.criado_em),
  // "Lida" para o remetente significa que mais alguém abriu
  lida: lidaPor.some((id) => id !== linha.remetente_id),
  lidaPor,
  ehEncaminhada: linha.eh_encaminhada || undefined,
  respondendoA: linha.responde_a || undefined,
  ehAvisoDirecao: linha.eh_aviso_direcao || undefined,
  publicacaoId: linha.publicacao_id || undefined,
  cotacaoCodigo: linha.cotacao_codigo || undefined,
  encomendaId: linha.encomenda_id || undefined,
  encomendaIds: linha.encomenda_ids || undefined,
  avisoEncomenda: linha.aviso_encomenda || undefined,
  editadaEm: linha.editada_em || undefined,
  apagadaEm: linha.apagada_em || undefined,
  fixadaEm: linha.fixada_em || undefined,
  fixadaPorId: linha.fixada_por_id || undefined,
  anexoCaminho: linha.anexo_caminho || undefined,
  reacoes: linha.reacoes || undefined,
});

/*
 * ===================================================================
 * O EVENTO AO VIVO APLICADO, E NÃO A RECARGA DE TUDO (21/10/2026)
 * ===================================================================
 *
 * Cada mensagem, edição, reação ou "lida" disparava, em cada aparelho que
 * a recebia, a carga completa: conversas, participantes, TODAS as mensagens
 * e TODAS as leituras. medir-lentidao.sql de 21/10/2026: mensagens e
 * leituras a ~175 ms cada, quase 2 mil vezes — e crescendo com o uso.
 *
 * O evento já traz a linha que mudou. Aqui ela é aplicada ao que o aparelho
 * tem. A carga completa continua na abertura e na reconexão, e volta quando
 * o evento não basta: conversa que este aparelho não conhece, ou evento sem
 * a linha. Na dúvida, recarrega — nunca adivinha.
 */
export interface EventoAoVivo<L> {
  eventType: string;
  new?: Partial<L> | null;
  old?: Partial<L> | null;
}

/** A conversa com a última mensagem dela recalculada (a prévia da lista) */
const comAUltimaDaConversa = (conversas: Conversa[], mensagens: Mensagem[], conversaId: string): Conversa[] => {
  let ultima: Mensagem | undefined;
  for (const m of mensagens) {
    if (m.conversaId === conversaId && (!ultima || m.criadoEm >= ultima.criadoEm)) ultima = m;
  }
  return conversas.map((c) =>
    c.id !== conversaId
      ? c
      : ultima
      ? {
          ...c,
          atualizadoEm: ultima.criadoEm,
          ultimaMensagem: {
            texto: montarPreviaDaMensagem(ultima),
            hora: ultima.horaFormatada,
            remetenteId: ultima.remetenteId,
            tipo: ultima.tipo,
          },
        }
      : { ...c, ultimaMensagem: undefined }
  );
};

export const aplicarMensagemAoVivo = (
  mensagens: Mensagem[],
  conversas: Conversa[],
  evento: EventoAoVivo<LinhaMensagem>
): { mensagens: Mensagem[]; conversas: Conversa[]; recarregar: boolean; anexoParaAssinar?: string } => {
  const recarregar = { mensagens, conversas, recarregar: true };

  if (evento.eventType === 'DELETE') {
    const id = evento.old?.id;
    if (!id) return recarregar;
    const removida = mensagens.find((m) => m.id === id);
    if (!removida) return { mensagens, conversas, recarregar: false };
    const restantes = mensagens.filter((m) => m.id !== id);
    return {
      mensagens: restantes,
      conversas: comAUltimaDaConversa(conversas, restantes, removida.conversaId),
      recarregar: false,
    };
  }
  if (evento.eventType !== 'INSERT' && evento.eventType !== 'UPDATE') return recarregar;

  const linha = evento.new as LinhaMensagem | undefined | null;
  if (!linha?.id || !linha.conversa_id || !linha.criado_em || !linha.remetente_id) return recarregar;
  // Conversa que este aparelho ainda não conhece (acabou de entrar nela): carga completa
  if (!conversas.some((c) => c.id === linha.conversa_id)) return recarregar;

  const atual = mensagens.find((m) => m.id === linha.id);
  let mensagem = paraMensagemDaLinha(linha, atual?.lidaPor || []);
  let anexoParaAssinar: string | undefined;
  if (mensagem.anexoCaminho) {
    // O mesmo anexo já assinado fica; um novo precisa de endereço
    if (atual?.anexoCaminho === mensagem.anexoCaminho) {
      mensagem = { ...mensagem, imagemUrl: atual.imagemUrl, audioUrl: atual.audioUrl, arquivoUrl: atual.arquivoUrl };
    } else {
      anexoParaAssinar = mensagem.anexoCaminho;
    }
  }
  // A que estava "enviando" com o mesmo id é esta: o banco confirmou
  const lista = atual ? mensagens.map((m) => (m.id === mensagem.id ? mensagem : m)) : [...mensagens, mensagem];
  return {
    mensagens: lista,
    conversas: comAUltimaDaConversa(conversas, lista, mensagem.conversaId),
    recarregar: false,
    anexoParaAssinar,
  };
};

export const aplicarLeituraAoVivo = (
  mensagens: Mensagem[],
  evento: EventoAoVivo<{ mensagem_id: string; colaborador_id: string }>
): { mensagens: Mensagem[]; recarregar: boolean } => {
  const linha = evento.eventType === 'DELETE' ? evento.old : evento.new;
  if (!linha?.mensagem_id || !linha.colaborador_id) return { mensagens, recarregar: true };
  const quem = linha.colaborador_id;
  const alvo = mensagens.find((m) => m.id === linha.mensagem_id);
  // Leitura de mensagem que este aparelho não tem (de outra conversa, ou já apagada): nada a fazer
  if (!alvo) return { mensagens, recarregar: false };
  const antes = alvo.lidaPor || [];
  const lidaPor =
    evento.eventType === 'DELETE'
      ? antes.filter((id) => id !== quem)
      : antes.includes(quem)
      ? antes
      : [...antes, quem];
  if (lidaPor.length === antes.length) return { mensagens, recarregar: false };
  return {
    mensagens: mensagens.map((m) =>
      m.id === alvo.id ? { ...m, lidaPor, lida: lidaPor.some((id) => id !== m.remetenteId) } : m
    ),
    recarregar: false,
  };
};

const paraLinhaMensagem = (m: Mensagem) => ({
  publicacao_id: m.publicacaoId ?? null,
  id: m.id,
  conversa_id: m.conversaId,
  remetente_id: m.remetenteId,
  tipo: m.tipo,
  texto: m.texto ?? null,
  // Com anexo no armazenamento, as colunas de conteúdo ficam vazias: o que
  // está nelas em memória é um endereço assinado, que expira — guardar isso
  // no banco seria gravar um link morto. Quem manda é `anexo_caminho`.
  audio_url: m.anexoCaminho ? null : m.audioUrl ?? null,
  audio_duracao: m.audioDuracao ?? null,
  arquivo_nome: m.arquivoNome ?? null,
  arquivo_tamanho: m.arquivoTamanho ?? null,
  arquivo_url: m.anexoCaminho ? null : m.arquivoUrl ?? null,
  imagem_url: m.anexoCaminho ? null : m.imagemUrl ?? null,
  legenda: m.legenda ?? null,
  eh_encaminhada: !!m.ehEncaminhada,
  eh_aviso_direcao: !!m.ehAvisoDirecao,
  responde_a: m.respondendoA ?? null,
  reacoes: m.reacoes ?? {},
  editada_em: m.editadaEm ?? null,
  fixada_em: m.fixadaEm ?? null,
  fixada_por_id: m.fixadaPorId ?? null,
  anexo_caminho: m.anexoCaminho ?? null,
  criado_em: m.criadoEm,
});

/*
  As colunas do cotador (cotacao_codigo, encomenda_id, encomenda_ids,
  aviso_encomenda) só o BANCO grava: os recados nascem em escrever_recado
  (cotador-banco.sql). A tela só as lê — a linha que ela grava não as leva,
  e um banco sem elas não para o chat de ninguém.
*/

/**
 * Onde o anexo aparece depende do tipo da mensagem. Ao trazer do banco, o
 * caminho vira endereço assinado e é colocado no campo que a tela já lê —
 * assim nenhuma parte da interface precisa saber que existe armazenamento.
 */
const aplicarEnderecoDoAnexo = (mensagem: Mensagem, endereco: string): Mensagem => {
  if (mensagem.tipo === 'imagem') return { ...mensagem, imagemUrl: endereco };
  if (mensagem.tipo === 'recado_voz') return { ...mensagem, audioUrl: endereco };
  return { ...mensagem, arquivoUrl: endereco };
};

const paraLinhaConversa = (c: Conversa) => ({
  id: c.id,
  tipo: c.tipo,
  nome: c.nome,
  foto: c.foto ?? null,
  descricao: c.descricao ?? null,
  criado_por_id: c.criadoPorId ?? null,
  apenas_gestores_publicam: !!c.apenasGestoresPublicam,
  eh_sistema_padrao: !!c.ehSistemaPadrao,
  atualizado_em: c.atualizadoEm,
});

/**
 * A LINHA DA AUDITORIA, no mesmo formato dos outros mapeadores.
 *
 * Estava montada à mão dentro de `registrarAuditoria`. Funcionava, e
 * ficava FORA do conferidor de prontidão — que descobre as colunas
 * lendo os `paraLinha*` deste arquivo e do `nuvem.ts`.
 *
 * Uma tabela de fora do conferidor é uma tabela que pode quebrar sem
 * aviso no dia em que ganhar coluna nova, que é exatamente como o chat
 * da rede parou. E esta guarda quem alterou o quê num sistema de ponto:
 * é a última que pode falhar calada.
 */
const paraLinhaAuditoria = (r: RegistroAuditoria) => ({
  id: r.id,
  data_hora: r.dataHora,
  usuario_nome: r.usuarioNome,
  acao: r.acao,
  categoria: r.categoria,
  detalhes: r.detalhes,
});

const paraLinhaAviso = (a: AvisoRede) => ({
  id: a.id,
  titulo: a.titulo,
  conteudo: a.conteudo,
  prioridade: a.prioridade,
  autor_id: a.autorId || null,
  autor_nome: a.autorNome,
  autor_cargo: a.autorCargo,
  loja_destino: a.lojaDestino,
  fixado_no_topo: a.fixadoNoTopo,
  criado_em: a.criadoEm,
  tipo: a.tipo,
  categoria: a.categoria,
  anexo_caminho: a.anexoCaminho || null,
  anexo_nome: a.anexoNome || null,
  exige_confirmacao: !!a.exigeConfirmacao,
  /**
   * `null` quando não há destino escolhido, e não `[]`.
   *
   * Lista vazia gravada é indistinguível de "para ninguém", e é
   * `destinosDe` quem decide o que vale quando não há nada — lendo
   * `lojaDestino`, que é o que as publicações antigas têm.
   */
  destinos: a.destinos && a.destinos.length > 0 ? a.destinos : null,
});

/**
 * Traduz a recusa do banco para algo que diga o que fazer.
 *
 * "violates row-level security policy" é a mesma frase para dois problemas
 * muito diferentes: estar sem sessão, ou estar logado e não ter direito
 * àquilo. Sem separar os dois, a pessoa fica tentando de novo sem saber que
 * precisa entrar outra vez. A pergunta ao servidor só acontece quando já
 * falhou, então não custa nada no caminho normal.
 */
/**
 * A EXPLICAÇÃO MORA EM `supabase.ts`, e não mais aqui.
 *
 * Estava escrita só nesta ponte, e o resultado foi o de sempre: o chat
 * sabia explicar uma coluna que falta, e a batida de ponto devolvia a
 * mensagem crua do PostgREST para alguém no balcão com o celular na
 * mão. Duas respostas para a mesma pergunta.
 *
 * Este apelido fica porque o arquivo a chama em quinze lugares, e trocar
 * quinze chamadas não acrescenta nada.
 */
const explicarRecusa = explicarRecusaDoBanco;

/** Números do banco mostrados no painel de administração. */
export interface UsoDoBanco {
  mensagens: number;
  comArquivo: number;
  imagens: number;
  audios: number;
  registrosPonto: number;
  mensagemMaisAntiga?: string;
}

type Ouvinte = () => void;

class PonteComunicacao {
  private ouvintes: Ouvinte[] = [];
  private canalAberto = false;
  private sincronizacaoAgendada: ReturnType<typeof setTimeout> | null = null;
  private sincronizando = false;
  private pedidoDurante = false;
  private ultimaSincronizacao = 0;

  /**
   * JUNTA OS EVENTOS DE TEMPO REAL NUMA SINCRONIZAÇÃO SÓ.
   *
   * Cada evento disparava uma sincronização completa, e uma sincronização
   * completa baixa TODAS as mensagens da rede. Abrir uma conversa com trinta
   * não lidas grava trinta marcações de leitura, que viram trinta eventos —
   * e cada aparelho conectado baixava o histórico inteiro trinta vezes, por
   * causa de alguém abrindo uma conversa do outro lado da rede.
   *
   * Com 88 pessoas isso cresce pelo produto das duas pontas. É o custo que
   * sobrou depois de o envio já ter sido corrigido: o envio ficou rápido, e
   * o aparelho continuava ocupado baixando o passado.
   *
   * Duas travas aqui:
   *
   *  - os eventos que chegam juntos viram UMA sincronização (a espera curta
   *    abaixo);
   *  - duas sincronizações nunca correm ao mesmo tempo. Se chegar pedido
   *    durante uma, ele é atendido UMA vez ao final — senão o último a
   *    responder poderia ser o mais antigo e reescrever o cache com dado
   *    velho.
   */
  private agendarSincronizacao(): void {
    if (this.sincronizando) {
      this.pedidoDurante = true;
      return;
    }
    if (this.sincronizacaoAgendada) return;

    /**
     * O PRIMEIRO EVENTO DEPOIS DE UMA CALMARIA VAI NA HORA.
     *
     * Segurar todo evento pela janela deixaria a mensagem do outro demorar
     * meio segundo para aparecer — trocaria o atraso do envio, que acabamos
     * de tirar, por um atraso no recebimento. Chat precisa parecer
     * instantâneo nas duas pontas.
     *
     * Então a janela não atrasa a primeira: ela só impede que a SEGUNDA, a
     * terceira e a trigésima da mesma rajada virem sincronizações próprias.
     */
    const desdeAUltima = Date.now() - this.ultimaSincronizacao;
    const espera =
      desdeAUltima >= ESPERA_PARA_JUNTAR_EVENTOS_MS
        ? 0
        : ESPERA_PARA_JUNTAR_EVENTOS_MS - desdeAUltima;

    this.sincronizacaoAgendada = setTimeout(() => {
      this.sincronizacaoAgendada = null;
      this.sincronizando = true;
      this.ultimaSincronizacao = Date.now();

      this.sincronizarConversas()
        .catch(() => {})
        .finally(() => {
          this.sincronizando = false;
          if (this.pedidoDurante) {
            this.pedidoDurante = false;
            this.agendarSincronizacao();
          }
        });
    }, espera);
  }

  /**
   * Um evento ao vivo das conversas, aplicado ao que o aparelho tem
   * (aplicarMensagemAoVivo, aplicarLeituraAoVivo). Na dúvida — carga em curso,
   * evento sem a linha, conversa desconhecida, erro — a carga completa.
   */
  private aplicarAoVivo(tabela: 'mensagens' | 'leituras_mensagem', evento: EventoAoVivo<any>): void {
    if (this.cargasEmCurso > 0 || this.sincronizando || this.sincronizacaoAgendada) {
      this.agendarSincronizacao();
      return;
    }
    try {
      const mensagens = lerMensagensDoAparelho();
      if (tabela === 'leituras_mensagem') {
        const r = aplicarLeituraAoVivo(mensagens, evento);
        if (r.recarregar) return this.agendarSincronizacao();
        if (r.mensagens === mensagens) return;
        localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(r.mensagens));
        this.avisar();
        return;
      }
      const r = aplicarMensagemAoVivo(mensagens, lerConversasDoAparelho(), evento);
      if (r.recarregar) return this.agendarSincronizacao();
      localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(r.mensagens));
      localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(r.conversas));
      this.avisar();
      // Reagiram à minha mensagem: o aviso do navegador (avisoDeReacao.ts)
      const eu = euNoAparelho();
      const id = (evento.new as Partial<LinhaMensagem> | null | undefined)?.id;
      if (eu && id && evento.eventType === 'UPDATE') {
        const depois = r.mensagens.find((m) => m.id === id);
        const novas = reacoesNovasDeOutros(mensagens.find((m) => m.id === id), depois, eu.id);
        if (depois && novas.length > 0) {
          avisarReacoesNoNavegador(
            novas,
            depois,
            montarPreviaDaMensagem(depois),
            r.conversas.find((c) => c.id === depois.conversaId),
            lerLista<Colaborador>('conecta_v4_colaboradores')
          );
        }
      }
      if (r.anexoParaAssinar) {
        const caminho = r.anexoParaAssinar;
        // O endereço do anexo novo chega depois; até lá a mensagem aparece sem ele
        void resolverCaminhos([caminho]).then((enderecos) => {
          const endereco = enderecos.get(caminho);
          if (!endereco) return;
          const atuais = lerMensagensDoAparelho();
          localStorage.setItem(
            CHAVE_MENSAGENS,
            JSON.stringify(atuais.map((m) => (m.anexoCaminho === caminho ? aplicarEnderecoDoAnexo(m, endereco) : m)))
          );
          this.avisar();
        });
      }
    } catch {
      this.agendarSincronizacao();
    }
  }

  assinarAtualizacoes(ouvinte: Ouvinte): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      this.ouvintes = this.ouvintes.filter((o) => o !== ouvinte);
    };
  }

  private avisar(): void {
    this.ouvintes.forEach((o) => o());
  }

  // --- CONVERSAS E MENSAGENS ---

  /**
   * Traz conversas, participantes, mensagens e leituras numa tacada só e
   * remonta o cache. Vem tudo junto porque a conversa só fica completa com a
   * prévia da última mensagem, e a mensagem só fica completa com quem já leu.
   */
  /**
   * Quantas cargas completas estão em curso. Evento ao vivo que chega no meio
   * de uma NÃO é aplicado: a carga, buscada antes dele, o apagaria ao gravar.
   * Ele vira uma carga nova ao final (agendarSincronizacao).
   */
  private cargasEmCurso = 0;

  async sincronizarConversas(): Promise<boolean> {
    this.cargasEmCurso++;
    try {
      return await this.cargaCompletaDasConversas();
    } finally {
      this.cargasEmCurso--;
    }
  }

  private async cargaCompletaDasConversas(): Promise<boolean> {
    if (!supabase) return false;

    /*
      SÓ O QUE MUDOU (sincronizacaoIncremental.ts, 30/10/2026). Esta carga
      roda ao entrar, a cada mudança de conversa ou de participante e ao
      voltar a rede, e trazia o chat inteiro toda vez. As linhas do banco
      ficam guardadas como vieram; o banco diz em poucos bytes o que mudou
      e só isso desce. A montagem abaixo é a de sempre, sobre a lista
      inteira guardada.

      Tudo em páginas e pela chave — o Supabase corta em 1000 linhas sem
      avisar, e `leituras_mensagem` é a que estoura primeiro: o motor lê
      assim, ordenando pela chave que cada receita declara.
    */
    const dono = localStorage.getItem('conecta_v4_colaborador_atual');
    // A leitura que não subiu antes vai primeiro: assim ela já desce junto (marcarLeitura)
    await this.reenviarLeiturasPendentes(dono);
    const resultados = await Promise.all([
      sincronizarPeloQueMudou<LinhaConversa, LinhaConversa>({
        tabela: 'conversas',
        montar: (colunas) => supabase!.from('conversas').select(colunas) as unknown as ConsultaSincronizavel,
        colunasDaChave: ['id'],
        chaveDoEstado: 'conecta_v4_sinc_conversas',
        dono,
        chaveDoItem: (c) => c.id,
        paraItem: (linha) => linha,
        lerGuardados: () => lerLista<LinhaConversa>(CHAVE_LINHAS_CONVERSAS),
        gravar: (linhas) => gravarLista(CHAVE_LINHAS_CONVERSAS, linhas),
        ondeEstou: 'as conversas',
      }),
      sincronizarPeloQueMudou<LinhaParticipante, LinhaParticipante>({
        tabela: 'participantes',
        // Tudo, e não colunas nomeadas: `papel` e `saiu_em` só existem depois de grupos-de-todos.sql
        montar: (colunas) => supabase!.from('participantes').select(colunas) as unknown as ConsultaSincronizavel,
        colunasDaChave: ['conversa_id', 'colaborador_id'],
        chaveDoEstado: 'conecta_v4_sinc_participantes',
        dono,
        chaveDoItem: (p) => `${p.conversa_id}|${p.colaborador_id}`,
        paraItem: (linha) => linha,
        lerGuardados: () => lerLista<LinhaParticipante>(CHAVE_LINHAS_PARTICIPANTES),
        gravar: (linhas) => gravarLista(CHAVE_LINHAS_PARTICIPANTES, linhas),
        ondeEstou: 'os participantes',
      }),
      sincronizarPeloQueMudou<LinhaMensagem, LinhaMensagem>({
        tabela: 'mensagens',
        montar: (colunas) => supabase!.from('mensagens').select(colunas) as unknown as ConsultaSincronizavel,
        colunasDaChave: ['id'],
        chaveDoEstado: 'conecta_v4_sinc_mensagens',
        dono,
        chaveDoItem: (m) => m.id,
        paraItem: (linha) => linha,
        lerGuardados: () => lerLista<LinhaMensagem>(CHAVE_LINHAS_MENSAGENS),
        gravar: (linhas) => gravarLista(CHAVE_LINHAS_MENSAGENS, linhas),
        // A ordem da conversa: a última de cada uma vira a prévia da lista, logo abaixo
        ordenar: (a, b) => (a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : a.id < b.id ? -1 : 1),
        ondeEstou: 'as mensagens',
      }),
      sincronizarPeloQueMudou<LinhaLeitura, LinhaLeitura>({
        tabela: 'leituras_mensagem',
        // Só as duas colunas: uma linha por mensagem POR PESSOA que leu
        montar: (colunas) =>
          supabase!
            .from('leituras_mensagem')
            .select(colunas === '*' ? 'mensagem_id, colaborador_id' : colunas) as unknown as ConsultaSincronizavel,
        colunasDaChave: ['mensagem_id', 'colaborador_id'],
        chaveDoEstado: 'conecta_v4_sinc_leituras_mensagem',
        dono,
        chaveDoItem: (l) => `${l.mensagem_id}|${l.colaborador_id}`,
        paraItem: (linha) => linha,
        lerGuardados: () => lerLista<LinhaLeitura>(CHAVE_LINHAS_LEITURAS),
        gravar: (linhas) => gravarLista(CHAVE_LINHAS_LEITURAS, linhas),
        ondeEstou: 'as leituras',
      }),
    ]);

    if (resultados.includes('falhou')) {
      console.error('Falha ao sincronizar conversas:', resultados.join(', '));
      return false;
    }

    const conversas = lerLista<LinhaConversa>(CHAVE_LINHAS_CONVERSAS);
    const participantes = lerLista<LinhaParticipante>(CHAVE_LINHAS_PARTICIPANTES);
    const mensagens = lerLista<LinhaMensagem>(CHAVE_LINHAS_MENSAGENS);
    const leituras = lerLista<LinhaLeitura>(CHAVE_LINHAS_LEITURAS);

    // Quem leu cada mensagem
    const lidaPorMensagem = new Map<string, string[]>();
    leituras.forEach((l) => {
      const atual = lidaPorMensagem.get(l.mensagem_id) || [];
      atual.push(l.colaborador_id);
      lidaPorMensagem.set(l.mensagem_id, atual);
    });
    // A leitura desta pessoa que ainda está na fila conta como feita (marcarLeitura)
    for (const p of lerLeiturasPendentes()) {
      if (p.c !== dono) continue;
      const atual = lidaPorMensagem.get(p.m) || [];
      if (!atual.includes(p.c)) lidaPorMensagem.set(p.m, [...atual, p.c]);
    }

    const listaMensagens: Mensagem[] = mensagens.map((linha) =>
      paraMensagemDaLinha(linha, lidaPorMensagem.get(linha.id) || [])
    );

    // Um pedido só para todos os anexos da conversa, em vez de um por
    // mensagem: abrir uma conversa com trinta fotos não pode virar trinta
    // idas ao servidor.
    const enderecos = await resolverCaminhos(
      listaMensagens
        .map((m) => m.anexoCaminho)
        .filter((c): c is string => !!c)
    );

    const comAnexos = listaMensagens.map((m) => {
      const endereco = m.anexoCaminho ? enderecos.get(m.anexoCaminho) : undefined;
      return endereco ? aplicarEnderecoDoAnexo(m, endereco) : m;
    });

    // Participantes de cada conversa
    const idsPorConversa = new Map<string, string[]>();

    /**
     * As preferências de fixar e ocultar vêm na mesma consulta.
     *
     * Só as DESTA pessoa: a linha de participação de outro colaborador diz o
     * que ELE fixou, e isso não é da conta de ninguém — nem faria sentido
     * aplicar à lista de quem está lendo.
     */
    const meuId = localStorage.getItem('conecta_v4_colaborador_atual');
    /**
     * O tipo sai de preferenciasConversa, não é redigitado aqui.
     *
     * Redigitado, ele ficou para trás quando `removida` nasceu: o campo vinha
     * do banco, era montado logo abaixo e o TypeScript recusava — e a saída
     * fácil seria acrescentar mais uma cópia da forma, criando o quinto caso
     * de "a mesma coisa escrita em dois lugares" deste sistema.
     */
    const preferencias: MapaDePreferencias = {};

    /**
     * QUEM SAIU NÃO É MAIS PARTICIPANTE — menos eu mesmo: o grupo de que
     * saí fica na MINHA lista, só leitura, até eu apagá-lo (como no
     * WhatsApp). É `euSaiEm` que diz à tela que eu saí.
     */
    const adminsPorConversa = new Map<string, string[]>();
    const euSaiEm = new Map<string, string>();
    participantes.forEach((p) => {
      const saiu = !!p.saiu_em;
      if (meuId && p.colaborador_id === meuId && p.saiu_em) euSaiEm.set(p.conversa_id, p.saiu_em);
      if (saiu && p.colaborador_id !== meuId) return;

      const atual = idsPorConversa.get(p.conversa_id) || [];
      atual.push(p.colaborador_id);
      idsPorConversa.set(p.conversa_id, atual);

      if (p.papel === 'admin' && !saiu) {
        adminsPorConversa.set(p.conversa_id, [...(adminsPorConversa.get(p.conversa_id) || []), p.colaborador_id]);
      }

      if (meuId && p.colaborador_id === meuId) {
        preferencias[p.conversa_id] = {
          fixada: !!p.fixada,
          ocultaDesde: p.oculta_desde || undefined,
          removida: p.removida || undefined,
        };
      }
    });

    aplicarPreferenciasDaNuvem(meuId || '', preferencias);

    // Última mensagem de cada conversa — a lista já veio ordenada por data
    const ultimaPorConversa = new Map<string, Mensagem>();
    comAnexos.forEach((m) => ultimaPorConversa.set(m.conversaId, m));

    const listaConversas: Conversa[] = conversas.map((linha) => {
      const ultima = ultimaPorConversa.get(linha.id);
      return {
        id: linha.id,
        tipo: linha.tipo as TipoConversa,
        nome: linha.nome,
        foto: linha.foto || undefined,
        participantesIds: idsPorConversa.get(linha.id) || [],
        descricao: linha.descricao || undefined,
        criadoPorId: linha.criado_por_id || undefined,
        administradoresIds: adminsPorConversa.get(linha.id),
        euSaiEm: euSaiEm.get(linha.id),
        apenasGestoresPublicam: linha.apenas_gestores_publicam || undefined,
        ehSistemaPadrao: linha.eh_sistema_padrao || undefined,
        // Recalculada por quem estiver olhando; nunca vem do banco
        naoLidas: 0,
        atualizadoEm: ultima ? ultima.criadoEm : linha.atualizado_em,
        ultimaMensagem: ultima
          ? {
              texto: montarPreviaDaMensagem(ultima),
              hora: ultima.horaFormatada,
              remetenteId: ultima.remetenteId,
              tipo: ultima.tipo,
            }
          : undefined,
      };
    });

    localStorage.setItem(
      CHAVE_CONVERSAS,
      JSON.stringify(juntarConversasEmTransito(listaConversas, lerConversasDoAparelho(), meuId))
    );
    // Tudo que voltou da consulta existe no banco: anotar aqui evita
    // regravar essas conversas a cada mensagem. Só o que VOLTOU — a que
    // ainda está subindo não pode ser dada como gravada
    listaConversas.forEach((c) => marcarConversaNoBanco(c.id));
    /**
     * A MENSAGEM QUE AINDA ESTÁ SUBINDO NÃO PODE SER APAGADA AQUI.
     *
     * Esta função reescrevia o cache inteiro com o que veio do banco. Quem
     * tivesse uma mensagem em trânsito — marcada 'enviando', ainda não
     * gravada — a via SUMIR da tela no instante em que qualquer outra pessoa
     * da rede mandasse qualquer coisa, porque o evento de tempo real chega
     * para todo mundo e dispara esta reescrita.
     *
     * Ela voltava sozinha um segundo depois, quando o banco confirmava. Mas
     * quem estava olhando via a própria mensagem piscar e sumir, e mandava
     * de novo. É a explicação de mensagem repetida no chat.
     *
     * O banco continua sendo a verdade: só sobrevive o que ele AINDA não
     * conhece e está declaradamente em trânsito. Mensagem que falhou já é
     * removida por quem a enviou.
     */
    const jaNoBanco = new Set(comAnexos.map((m) => m.id));
    const emTransito = lerPendentesDoAparelho().filter((m) => !jaNoBanco.has(m.id));

    localStorage.setItem(
      CHAVE_MENSAGENS,
      JSON.stringify(emTransito.length > 0 ? [...comAnexos, ...emTransito] : comAnexos)
    );
    this.avisar();
    return true;
  }

  /**
   * Garante que a conversa exista e que estas pessoas estejam nela.
   *
   * A conversa é apenas CRIADA, nunca atualizada: quem participa mora na
   * tabela `participantes`, não numa coluna daqui. E atualizar exigiria já
   * ser participante — o que criaria um impasse, porque é exatamente isso
   * que se está tentando conseguir ao entrar num canal.
   */
  async salvarConversa(
    conversa: Conversa,
    meuId?: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    // Nada de upsert aqui. O upsert vira `ON CONFLICT` no banco, e isso exige
    // poder enxergar a linha em conflito — o que a regra de `conversas` só
    // concede a quem já participa dela. Resultado: entrar num canal existente
    // era recusado pela RLS. Insert comum, e "já existe" (23505) é sucesso:
    // a conversa estar lá é exatamente o que se queria.
    const { error } = await supabase.from('conversas').insert(paraLinhaConversa(conversa));

    if (error && error.code !== '23505') {
      console.error('Falha ao criar conversa:', error.message);
      return { sucesso: false, erro: await explicarRecusa(error) };
    }

    // A própria inscrição vem primeiro e sozinha: é ela que dá o direito de
    // ler a conversa e, com ele, de inscrever os demais.
    if (meuId && conversa.participantesIds.includes(meuId)) {
      const { error: erroEu } = await supabase
        .from('participantes')
        .insert({ conversa_id: conversa.id, colaborador_id: meuId });

      if (erroEu && erroEu.code !== '23505') {
        console.error('Falha ao entrar na conversa:', erroEu.message);
        return { sucesso: false, erro: await explicarRecusa(erroEu) };
      }
    }

    /*
      NO GRUPO DE PESSOAS, QUEM INSCREVE É O BANCO (adicionar_ao_grupo, em
      grupos-de-todos.sql). A regra de participantes recusa a inscrição
      direta de outra pessoa ali — e tentar faria o envio da mensagem
      falhar por isso. Fica só para quem criou o grupo pelo Painel ADM, o
      caminho antigo do TI.
    */
    if (conversa.tipo === 'grupo' && !conversa.ehSistemaPadrao && conversa.criadoPorId !== meuId) {
      marcarConversaNoBanco(conversa.id);
      return { sucesso: true };
    }

    const restantes = conversa.participantesIds.filter((id) => id !== meuId);
    if (restantes.length === 0) return { sucesso: true };

    // Inscrever só quem falta: um insert em lote falha inteiro se uma única
    // linha já existir, e aí ninguém entraria.
    const { data: jaDentro } = await supabase
      .from('participantes')
      .select('colaborador_id')
      .eq('conversa_id', conversa.id);

    const dentro = new Set(
      ((jaDentro || []) as { colaborador_id: string }[]).map((p) => p.colaborador_id)
    );
    const faltando = restantes.filter((id) => !dentro.has(id));
    if (faltando.length === 0) return { sucesso: true };

    const { error: erroParticipantes } = await supabase.from('participantes').insert(
      faltando.map((colaboradorId) => ({
        conversa_id: conversa.id,
        colaborador_id: colaboradorId,
      }))
    );

    if (erroParticipantes && erroParticipantes.code !== '23505') {
      console.error('Falha ao salvar participantes:', erroParticipantes.message);
      return { sucesso: false, erro: await explicarRecusa(erroParticipantes) };
    }

    // Deu certo: as proximas mensagens desta conversa nao repetem as quatro
    // idas ao banco que esta funcao faz
    marcarConversaNoBanco(conversa.id);
    return { sucesso: true };
  }

  // --- GRUPOS DE TODOS (grupos-de-todos.sql) ---
  //
  // Cada ação é uma função do banco, que confere quem pode e deixa no grupo
  // a mensagem de sistema. Aqui só se leva o pedido e se traduz a recusa.

  private async chamarFuncaoDoGrupo<T = unknown>(
    nome: string,
    argumentos: Record<string, unknown>
  ): Promise<{ sucesso: boolean; dados?: T; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };
    const { data, error } = await supabase.rpc(nome, argumentos);
    if (error) {
      console.error(`Falha em ${nome}:`, error.message);
      return {
        sucesso: false,
        // A função ainda não existe no banco: o SQL dos grupos não foi rodado
        erro: error.code === 'PGRST202' ? 'Os grupos novos ainda não foram ligados no banco. Avise o TI.' : error.message,
      };
    }
    return { sucesso: true, dados: data as T };
  }

  criarGrupo(nome: string, descricao: string, participantesIds: string[]) {
    return this.chamarFuncaoDoGrupo<string>('criar_grupo', {
      p_nome: nome,
      p_descricao: descricao,
      p_ids: participantesIds,
    });
  }

  adicionarAoGrupo(conversaId: string, participantesIds: string[]) {
    return this.chamarFuncaoDoGrupo<number>('adicionar_ao_grupo', { p_conversa: conversaId, p_ids: participantesIds });
  }

  removerDoGrupo(conversaId: string, colaboradorId: string) {
    return this.chamarFuncaoDoGrupo('remover_do_grupo', { p_conversa: conversaId, p_colaborador: colaboradorId });
  }

  sairDoGrupo(conversaId: string) {
    return this.chamarFuncaoDoGrupo('sair_do_grupo', { p_conversa: conversaId });
  }

  definirAdminDoGrupo(conversaId: string, colaboradorId: string, admin: boolean) {
    return this.chamarFuncaoDoGrupo('definir_admin_do_grupo', {
      p_conversa: conversaId,
      p_colaborador: colaboradorId,
      p_admin: admin,
    });
  }

  /**
   * Nome, descrição e quem publica. Só os administradores do grupo — quem
   * recusa é o gatilho do banco, com a mensagem dele. O `.select()` diz se
   * a linha mudou de fato: sem permissão, o update responderia sucesso.
   */
  async editarGrupo(
    conversaId: string,
    campos: { nome: string; descricao: string; apenasGestoresPublicam: boolean }
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };
    const { data, error } = await supabase
      .from('conversas')
      .update({
        nome: campos.nome.trim(),
        descricao: campos.descricao.trim() || null,
        apenas_gestores_publicam: campos.apenasGestoresPublicam,
      })
      .eq('id', conversaId)
      .select('id');
    if (error) return { sucesso: false, erro: error.message };
    if (!data || data.length === 0) return { sucesso: false, erro: 'Só os administradores do grupo editam.' };
    return { sucesso: true };
  }

  /**
   * APAGAR O GRUPO DA MINHA LISTA — depois de sair (como no WhatsApp). Tira
   * a minha linha de participante: o grupo segue existindo para os outros.
   */
  async apagarGrupoDaMinhaLista(conversaId: string, meuId: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };
    const { data, error } = await supabase
      .from('participantes')
      .delete()
      .eq('conversa_id', conversaId)
      .eq('colaborador_id', meuId)
      .select('conversa_id');
    if (error) return { sucesso: false, erro: error.message };
    if (!data || data.length === 0) return { sucesso: false, erro: 'Não foi possível apagar o grupo da sua lista.' };
    return { sucesso: true };
  }

  async salvarMensagem(
    mensagem: Mensagem
  ): Promise<{ sucesso: boolean; erro?: string; conversaAusente?: boolean }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('mensagens').insert(paraLinhaMensagem(mensagem));
    if (error) {
      console.error('Falha ao enviar mensagem ao banco:', error.message);
      return {
        sucesso: false,
        erro: await explicarRecusa(error),
        /**
         * 23503 é referência quebrada: a conversa apontada não existe no
         * banco. Quem chamou sabe refazê-la e tentar de novo, em vez de
         * devolver erro para quem só queria mandar um "bom dia".
         */
        conversaAusente: error.code === '23503',
      };
    }

    /**
     * A própria leitura NÃO é esperada.
     *
     * Quem envia já leu o que escreveu — é registro de conveniência, não
     * parte do envio. Esperar por ela acrescentava uma sexta ida ao banco
     * antes de a mensagem ser dada como enviada, e ninguém no mundo fica
     * olhando para o relógio por causa do próprio visto.
     */
    void this.marcarLeitura([mensagem.id], mensagem.remetenteId);

    /**
     * O AVISO COM O APLICATIVO FECHADO sai daqui, e de nenhum outro lugar.
     *
     * Este é o único insert de mensagem do sistema — chat, recado de
     * publicação e aviso de citação passam todos por ele. Chamar em cada
     * tela que envia seria esquecer uma delas.
     */
    pedirAvisoDaMensagem(mensagem.id, montarPreviaDaMensagem(mensagem));
    return { sucesso: true };
  }

  /** Vale para edição de texto e para reação — as duas mexem na mesma linha. */
  async atualizarMensagem(mensagem: Mensagem): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase
      .from('mensagens')
      .update({
        texto: mensagem.texto ?? null,
        legenda: mensagem.legenda ?? null,
        reacoes: mensagem.reacoes ?? {},
        editada_em: mensagem.editadaEm ?? null,
        fixada_em: mensagem.fixadaEm ?? null,
        fixada_por_id: mensagem.fixadaPorId ?? null,
      })
      .eq('id', mensagem.id);

    if (error) {
      console.error('Falha ao atualizar mensagem:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  /**
   * O `.select()` diz se a linha saiu de fato: barrado pela regra, o delete
   * afeta zero linhas e responde SUCESSO — a mensagem sumiria da tela e
   * voltaria na próxima sincronização, sem ninguém entender por quê.
   */
  /**
   * APAGAR DEIXA O LUGAR (mensagem-apagada.sql, 21/10/2026): a linha fica, e
   * o banco tira o conteúdo — os outros veem "Esta mensagem foi apagada" pelo
   * evento ao vivo. Devolve o caminho do anexo, que sai do armazenamento.
   * Sem a função no banco ainda, apaga a linha, como antes.
   */
  async apagarMensagem(id: string): Promise<{ sucesso: boolean; caminho?: string; erro?: string }> {
    if (!supabase) return { sucesso: true };
    const { data, error } = await supabase.rpc('apagar_mensagem', { p_mensagem: id });
    if (error?.code === 'PGRST202') return this.removerMensagem(id);
    if (error) {
      console.error('Falha ao apagar mensagem:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true, caminho: (data as string | null) || undefined };
  }

  async removerMensagem(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };
    const { data, error } = await supabase.from('mensagens').delete().eq('id', id).select('id');
    if (error) {
      console.error('Falha ao remover mensagem:', error.message);
      return { sucesso: false, erro: error.message };
    }
    if (!data || data.length === 0) return { sucesso: false, erro: 'O banco não apagou a mensagem.' };
    return { sucesso: true };
  }

  /**
   * EXCLUIR UM CANAL OU GRUPO PARA TODOS — só o TI (exclusao-nas-conversas.sql).
   * A função do banco confere quem pede, recusa os canais oficiais e devolve
   * só os caminhos dos arquivos, que saem do armazenamento aqui.
   */
  async excluirConversa(id: string): Promise<{ sucesso: boolean; caminhos?: string[]; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };
    const { data, error } = await supabase.rpc('excluir_conversa', { p_conversa: id });
    if (error) {
      return {
        sucesso: false,
        erro: error.code === 'PGRST202' ? 'A exclusão ainda não foi ligada no banco. Rode exclusao-nas-conversas.sql.' : error.message,
      };
    }
    return { sucesso: true, caminhos: (data as string[] | null) || [] };
  }

  /**
   * Marca como lidas. Repetir não é erro: a chave é (mensagem, pessoa).
   *
   * A LEITURA QUE NÃO SUBIU NÃO PODE SE PERDER (30/10/2026). Abrir a conversa
   * marca no aparelho na hora e manda ao banco uma vez — e, se a rede da loja
   * falhava nesse instante, ninguém tentava de novo. A carga seguinte trazia
   * o banco sem a leitura e a mensagem voltava a contar como não lida: o
   * número que aparece e, aberta a conversa, não tem nada de novo.
   *
   * Agora ela vai para a fila do aparelho antes de sair e só deixa a fila
   * quando o banco confirma — ou recusa de vez. Enquanto espera, conta como
   * lida na tela (`cargaCompletaDasConversas`), e a carga reenvia.
   */
  async marcarLeitura(mensagemIds: string[], colaboradorId: string): Promise<boolean> {
    if (!supabase || mensagemIds.length === 0) return false;
    guardarLeiturasPendentes(mensagemIds, colaboradorId);
    return this.enviarLeituras(mensagemIds, colaboradorId);
  }

  private async enviarLeituras(mensagemIds: string[], colaboradorId: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from('leituras_mensagem').upsert(
        mensagemIds.map((mensagemId) => ({
          mensagem_id: mensagemId,
          colaborador_id: colaboradorId,
        })),
        { onConflict: 'mensagem_id,colaborador_id', ignoreDuplicates: true }
      );
      // Gravou, ou nunca vai gravar (mensagem apagada, conversa de que saiu): sai da fila
      if (!error || RECUSAS_SEM_VOLTA.has(error.code)) tirarLeiturasPendentes(mensagemIds, colaboradorId);
      return !error;
    } catch {
      return false; // Sem rede: fica na fila
    }
  }

  /** Reenvia o que ficou na fila, de quem está no aparelho. */
  private async reenviarLeiturasPendentes(meuId: string | null): Promise<void> {
    if (!meuId) return;
    const minhas = lerLeiturasPendentes().filter((p) => p.c === meuId).map((p) => p.m);
    if (minhas.length > 0) await this.enviarLeituras(minhas, meuId);
  }

  /**
   * Apaga as mensagens anteriores à data de corte — texto, foto, áudio e
   * documento. Acontece numa função do banco para a regra de quem pode
   * apagar valer no servidor, não só na tela.
   */
  async limparConversasAte(dataCorte: string): Promise<{
    sucesso: boolean;
    removidas?: number;
    caminhos?: string[];
    erro?: string;
  }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

    const { data, error } = await supabase
      .rpc('limpar_conversas_ate', { data_corte: dataCorte })
      .maybeSingle();

    if (error) {
      console.error('Falha ao limpar o histórico de conversas:', error.message);
      return { sucesso: false, erro: await explicarRecusa(error) };
    }

    const linha = data as { removidas: number; caminhos: string[] } | null;
    return {
      sucesso: true,
      removidas: linha?.removidas ?? 0,
      caminhos: linha?.caminhos ?? [],
    };
  }

  /**
   * Números do banco para o painel. Vêm de uma função no servidor porque a
   * contagem precisa ser da rede inteira — o Administrador não participa de
   * toda conversa, e o que a RLS devolve para ele é menos do que existe.
   */
  async obterUsoDoBanco(): Promise<UsoDoBanco | null> {
    if (!supabase) return null;

    const { data, error } = await supabase.rpc('uso_do_banco').maybeSingle();
    if (error || !data) {
      console.error('Falha ao ler o uso do banco:', error?.message);
      return null;
    }

    const linha = data as Record<string, number | string | null>;
    return {
      mensagens: Number(linha.mensagens ?? 0),
      comArquivo: Number(linha.com_arquivo ?? 0),
      imagens: Number(linha.imagens ?? 0),
      audios: Number(linha.audios ?? 0),
      registrosPonto: Number(linha.registros_ponto ?? 0),
      mensagemMaisAntiga: (linha.mensagem_mais_antiga as string) || undefined,
    };
  }

  // --- AVISOS DA REDE ---

  async sincronizarAvisos(): Promise<boolean> {
    if (!supabase) return false;

    // A leitura de aviso cresce por PESSOA: 89 colaboradores vezes o
    // número de comunicados passa de mil depressa, e aí a confirmação de
    // quem leu começa a sumir sem erro nenhum
    const [avisos, leituras] = await Promise.all([
      supabase.from('avisos_rede').select('*').order('criado_em', { ascending: false }),
      buscarTodasAsLinhas<{ aviso_id: string; colaborador_id: string; confirmado: boolean }>(
        () =>
          supabase!
            .from('avisos_leitura')
            .select('aviso_id, colaborador_id, confirmado')
            .order('aviso_id')
            .order('colaborador_id'),
        'as leituras de aviso'
      ),
    ]);

    if (avisos.error || !leituras) {
      console.error('Falha ao sincronizar avisos:', avisos.error?.message);
      return false;
    }

    const lidos = new Map<string, string[]>();
    const confirmados = new Map<string, string[]>();
    leituras.forEach((l) => {
      const listaLidos = lidos.get(l.aviso_id) || [];
      listaLidos.push(l.colaborador_id);
      lidos.set(l.aviso_id, listaLidos);

      if (l.confirmado) {
        const listaConfirmados = confirmados.get(l.aviso_id) || [];
        listaConfirmados.push(l.colaborador_id);
        confirmados.set(l.aviso_id, listaConfirmados);
      }
    });

    const lista: AvisoRede[] = ((avisos.data || []) as LinhaAviso[]).map((linha) =>
      paraAvisoRede(linha, lidos.get(linha.id) || [], confirmados.get(linha.id) || [])
    );

    localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(lista));
    this.avisar();
    return true;
  }

  /**
   * INSERT SIMPLES, e não `upsert`.
   *
   * `upsert` vira `ON CONFLICT`, e o Postgres precisa LER a linha em
   * conflito para decidir o que fazer com ela. A política de leitura de
   * `avisos_rede` filtra por destino, então essa leitura pode não
   * enxergar nada — e o banco responde "violates row-level security"
   * numa publicação que a permissão de INSERT autorizava.
   *
   * É o mesmo defeito que já custou quatro tentativas às cegas no
   * envio de mensagem. O padrão da casa é insert comum, tratando o
   * 23505 (chave repetida) como o que ele é: a linha já está lá.
   *
   * Publicação nova tem id recém-criado, então 23505 aqui só acontece
   * quando a gravação anterior foi adiante e a resposta se perdeu no
   * caminho — e nesse caso repetir não é erro, é a mesma publicação.
   */
  async salvarAviso(aviso: AvisoRede): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('avisos_rede').insert(paraLinhaAviso(aviso));

    if (error) {
      if (error.code === '23505') return { sucesso: true };

      console.error('Falha ao salvar aviso:', error.message);
      return { sucesso: false, erro: await explicarRecusa(error) };
    }
    return { sucesso: true };
  }

  /** Atualiza uma publicação que JÁ existe — fixar, editar. */
  async atualizarAviso(aviso: AvisoRede): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase
      .from('avisos_rede')
      .update(paraLinhaAviso(aviso))
      .eq('id', aviso.id);

    if (error) {
      console.error('Falha ao atualizar aviso:', error.message);
      return { sucesso: false, erro: await explicarRecusa(error) };
    }
    return { sucesso: true };
  }

  async removerAviso(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };
    const { error } = await supabase.from('avisos_rede').delete().eq('id', id);
    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true };
  }

  /**
   * Registra que a pessoa leu o aviso e, quando for o caso, que ela confirmou
   * ciência. Confirmar é um ato dela: por isso a linha é dela, não do aviso.
   */
  async marcarLeituraAviso(
    avisoId: string,
    colaboradorId: string,
    confirmado: boolean
  ): Promise<boolean> {
    if (!supabase) return false;

    const { error } = await supabase.from('avisos_leitura').upsert(
      { aviso_id: avisoId, colaborador_id: colaboradorId, confirmado },
      { onConflict: 'aviso_id,colaborador_id' }
    );

    return !error;
  }

  // --- CONFIGURAÇÕES ---

  async sincronizarConfiguracoes(): Promise<boolean> {
    if (!supabase) return false;

    const { data, error } = await supabase.from('configuracoes').select('*').maybeSingle();
    if (error || !data) return false;

    const config: ConfiguracaoSistema = {
      nomeEmpresa: data.nome_empresa,
      mesesHistoricoConversas: data.meses_historico_conversas ?? 2,
      ultimaLimpezaConversas: data.ultima_limpeza_conversas ?? undefined,
      emPeriodoDeTeste: data.em_periodo_de_teste ?? false,
      modoManutencao: data.modo_manutencao,
      permitirCriacaoGruposPorOperadores: data.permitir_criacao_grupos_por_operadores,
      permissoesFerramentas: (data.permissoes_ferramentas as MapaDePermissoes) || undefined,
    };

    localStorage.setItem(CHAVE_CONFIGURACOES, JSON.stringify(config));

    /**
     * As permissões de ferramenta vêm junto com a configuração porque são
     * configuração: valem para a rede, não para o aparelho. O administrador
     * muda no computador dele e o celular do gerente obedece.
     *
     * Vindo nulo, o serviço cai no padrão do catálogo — nunca em "vê tudo".
     */
    aplicarPermissoes((data.permissoes_ferramentas as MapaDePermissoes) || null);

    this.avisar();
    return true;
  }

  async salvarConfiguracoes(
    config: ConfiguracaoSistema
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    /**
     * UPDATE, não upsert.
     *
     * A configuração é linha única — o esquema já a semeia com id = true. O
     * upsert manda `insert ... on conflict`, e um INSERT precisa de
     * política de INSERT, que esta tabela não tem (só de UPDATE, para o
     * administrador). O banco recusava com "a nova linha viola a política de
     * segurança em nível de linha", apontando para um INSERT que nem era
     * para acontecer.
     *
     * Mesma pedra do `salvarConversa`: upsert vira ON CONFLICT, e ON
     * CONFLICT esbarra na RLS.
     */
    const { data, error } = await supabase
      .from('configuracoes')
      .update({
        nome_empresa: config.nomeEmpresa,
        meses_historico_conversas: config.mesesHistoricoConversas,
        ultima_limpeza_conversas: config.ultimaLimpezaConversas ?? null,
        em_periodo_de_teste: config.emPeriodoDeTeste ?? false,
        modo_manutencao: config.modoManutencao,
        permitir_criacao_grupos_por_operadores: config.permitirCriacaoGruposPorOperadores,
        permissoes_ferramentas: config.permissoesFerramentas ?? null,
      })
      .eq('id', true)
      .select('id');

    if (error) {
      console.error('Falha ao salvar configurações:', error.message);
      return { sucesso: false, erro: error.message };
    }

    /**
     * Update que não achou linha nenhuma não é erro para o banco — volta
     * vazio e "deu certo". Seria a pior falha possível aqui: o painel diria
     * "Salvo" e nada teria sido gravado.
     */
    if (!data || data.length === 0) {
      return {
        sucesso: false,
        erro:
          'A configuração da rede não existe no banco. Rode supabase/esquema.sql ' +
          'para criá-la (ou confirme que você é Administrador).',
      };
    }

    return { sucesso: true };
  }

  /**
   * Grava, no banco, a preferência desta pessoa sobre esta conversa.
   *
   * Vive em `participantes` porque é exatamente a linha "esta pessoa nesta
   * conversa". Antes vivia no navegador, e o resultado era fixar no
   * computador e não ver nada no celular — duas listas com preferências
   * diferentes para a mesma pessoa.
   *
   * UPDATE, não upsert: a linha de participação já existe (quem não
   * participa não vê a conversa), e upsert viraria `on conflict`, que
   * esbarra na RLS. É a mesma pedra de `salvarConversa` e das configurações.
   */
  async salvarPreferenciaDeConversa(
    conversaId: string,
    colaboradorId: string,
    preferencia: {
      fixada?: boolean;
      ocultaDesde?: string | null;
      removida?: boolean;
    }
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const campos: Record<string, unknown> = {};
    if (preferencia.fixada !== undefined) campos.fixada = preferencia.fixada;
    if (preferencia.ocultaDesde !== undefined) {
      campos.oculta_desde = preferencia.ocultaDesde;
    }
    if (preferencia.removida !== undefined) campos.removida = preferencia.removida;
    if (Object.keys(campos).length === 0) return { sucesso: true };

    /**
     * O `select` no fim existe para saber SE alguma linha foi mesmo mudada.
     *
     * Um `update` que não encontra linha não dá erro: ele simplesmente não
     * faz nada, e devolve sucesso. E não encontrar é comum aqui — o banco só
     * tem linha de participante para conversa que já existe nele, e conversa
     * sem nenhuma mensagem nunca foi gravada.
     *
     * Ficar em silêncio nesse caso foi o que escondeu o defeito por um
     * tempo: a preferência valia no aparelho, sumia na sincronização
     * seguinte, e nada em lugar nenhum dizia por quê.
     */
    const { data, error } = await supabase
      .from('participantes')
      .update(campos)
      .eq('conversa_id', conversaId)
      .eq('colaborador_id', colaboradorId)
      .select('conversa_id');

    if (error) {
      console.error('Falha ao salvar preferência da conversa:', error.message);
      return { sucesso: false, erro: error.message };
    }

    if (!data || data.length === 0) {
      // Não é falha: a conversa ainda não existe no banco por não ter
      // mensagem. Vale o que está no aparelho, e a sincronização respeita
      // isso — ver aplicarPreferenciasDaNuvem.
      console.info(
        `Preferência de ${conversaId} vale só neste aparelho: a conversa ainda não existe no banco.`
      );
    }

    return { sucesso: true };
  }

  // --- AUDITORIA ---

  async sincronizarAuditoria(): Promise<boolean> {
    if (!supabase) return false;
    // Quem não lê a auditoria (só TI e RH leem) não a pede: nada a buscar
    if (!leAuditoria(euNoAparelho())) return true;

    // A auditoria cresce sem parar; a tela mostra o histórico recente
    const { data, error } = await supabase
      .from('auditoria')
      .select('*')
      .order('data_hora', { ascending: false })
      .limit(500);

    if (error || !data) return false;

    const lista: RegistroAuditoria[] = data.map((linha: Record<string, string>) => ({
      id: linha.id,
      dataHora: carimboDeAuditoria(linha.data_hora),
      usuarioNome: linha.usuario_nome,
      acao: linha.acao,
      categoria: linha.categoria as RegistroAuditoria['categoria'],
      detalhes: linha.detalhes,
    }));

    localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify(lista));
    this.avisar();
    return true;
  }

  /**
   * A auditoria não pode derrubar a ação que ela registra: se o banco
   * recusar, a operação do usuário segue e o erro fica no console.
   */
  async registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
    if (!supabase) return;

    const { error } = await supabase.from('auditoria').insert(paraLinhaAuditoria(registro));

    if (error) console.error('Falha ao gravar auditoria:', error.message);
  }

  // --- TEMPO REAL ---

  iniciarTempoReal(): void {
    if (!supabase || this.canalAberto) return;
    this.canalAberto = true;

    const recarregarConversas = () => {
      this.agendarSincronizacao();
    };

    supabase
      .channel('conecta-conversas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens' }, (evento) =>
        this.aplicarAoVivo('mensagens', evento as EventoAoVivo<any>)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, recarregarConversas)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participantes' },
        recarregarConversas
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leituras_mensagem' }, (evento) =>
        this.aplicarAoVivo('leituras_mensagem', evento as EventoAoVivo<any>)
      )
      .subscribe(acompanharCanal('conversas'));

    supabase
      .channel('conecta-rede')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos_rede' }, () => {
        this.sincronizarAvisos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos_leitura' }, () => {
        this.sincronizarAvisos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes' }, () => {
        this.sincronizarConfiguracoes();
      })
      .subscribe(acompanharCanal('rede'));

    /*
      A AUDITORIA AO VIVO, SÓ PARA QUEM A LÊ (21/10/2026). Escutá-la em todos
      os aparelhos fazia cada registro novo disparar a leitura da auditoria
      em todos eles — os que não são TI nem RH recebiam zero linhas, e o
      banco pagava a conta inteira por cada um.
    */
    if (leAuditoria(euNoAparelho())) {
      supabase
        .channel('conecta-auditoria')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auditoria' }, () => {
          this.sincronizarAuditoria();
        })
        .subscribe(acompanharCanal('auditoria'));
    }
  }

  /** Tudo que veio do banco sai do aparelho quando a pessoa sai do sistema. */
  limparCache(): void {
    [
      CHAVE_CONVERSAS,
      CHAVE_MENSAGENS,
      CHAVE_AVISOS_REDE,
      CHAVE_AUDITORIA,
    ].forEach((chave) => localStorage.removeItem(chave));
  }
}

export const nuvemComunicacao = new PonteComunicacao();
