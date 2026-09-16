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
  Loja,
  Mensagem,
  PrioridadeAviso,
  RegistroAuditoria,
  TipoConversa,
  TipoMensagem,
} from '../tipos';
import { supabase } from './supabase';
import { resolverCaminhos } from './anexos';
import { aplicarPermissoes, MapaDePermissoes } from './permissoes';

const CHAVE_CONVERSAS = 'conecta_v4_conversas';
const CHAVE_MENSAGENS = 'conecta_v4_mensagens';
const CHAVE_AVISOS_REDE = 'conecta_v4_avisos_rede';
const CHAVE_CONFIGURACOES = 'conecta_v4_configuracoes';
const CHAVE_AUDITORIA = 'conecta_v4_auditoria';

// --- Formatação compartilhada ---

const horaDe = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
export const montarPreviaDaMensagem = (m: Mensagem): string => {
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
  reacoes: Record<string, string[]> | null;
  editada_em: string | null;
  anexo_caminho: string | null;
  criado_em: string;
}

interface LinhaAviso {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: string;
  autor_id: string | null;
  autor_nome: string;
  autor_cargo: string;
  loja_destino: string;
  fixado_no_topo: boolean;
  criado_em: string;
}

const paraLinhaMensagem = (m: Mensagem) => ({
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
  reacoes: m.reacoes ?? {},
  editada_em: m.editadaEm ?? null,
  anexo_caminho: m.anexoCaminho ?? null,
  criado_em: m.criadoEm,
});

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
const explicarRecusa = async (error: { code?: string; message: string }): Promise<string> => {
  const ehRecusaDeAcesso =
    error.code === '42501' || error.message.toLowerCase().includes('row-level security');

  if (!ehRecusaDeAcesso || !supabase) return error.message;

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return 'Sua sessão terminou. Saia e entre de novo para continuar.';
  }

  return `Sem permissão no banco para esta ação (${error.message}).`;
};

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
  async sincronizarConversas(): Promise<boolean> {
    if (!supabase) return false;

    const [conversas, participantes, mensagens, leituras] = await Promise.all([
      supabase.from('conversas').select('*'),
      supabase.from('participantes').select('conversa_id, colaborador_id'),
      supabase.from('mensagens').select('*').order('criado_em'),
      supabase.from('leituras_mensagem').select('mensagem_id, colaborador_id'),
    ]);

    if (conversas.error || mensagens.error) {
      console.error(
        'Falha ao sincronizar conversas:',
        conversas.error?.message || mensagens.error?.message
      );
      return false;
    }

    // Quem leu cada mensagem
    const lidaPorMensagem = new Map<string, string[]>();
    ((leituras.data || []) as { mensagem_id: string; colaborador_id: string }[]).forEach((l) => {
      const atual = lidaPorMensagem.get(l.mensagem_id) || [];
      atual.push(l.colaborador_id);
      lidaPorMensagem.set(l.mensagem_id, atual);
    });

    const listaMensagens: Mensagem[] = ((mensagens.data || []) as LinhaMensagem[]).map((linha) => {
      const lidaPor = lidaPorMensagem.get(linha.id) || [];
      return {
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
        ehAvisoDirecao: linha.eh_aviso_direcao || undefined,
        editadaEm: linha.editada_em || undefined,
        anexoCaminho: linha.anexo_caminho || undefined,
        reacoes: linha.reacoes || undefined,
      };
    });

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
    ((participantes.data || []) as { conversa_id: string; colaborador_id: string }[]).forEach(
      (p) => {
        const atual = idsPorConversa.get(p.conversa_id) || [];
        atual.push(p.colaborador_id);
        idsPorConversa.set(p.conversa_id, atual);
      }
    );

    // Última mensagem de cada conversa — a lista já veio ordenada por data
    const ultimaPorConversa = new Map<string, Mensagem>();
    comAnexos.forEach((m) => ultimaPorConversa.set(m.conversaId, m));

    const listaConversas: Conversa[] = ((conversas.data || []) as LinhaConversa[]).map((linha) => {
      const ultima = ultimaPorConversa.get(linha.id);
      return {
        id: linha.id,
        tipo: linha.tipo as TipoConversa,
        nome: linha.nome,
        foto: linha.foto || undefined,
        participantesIds: idsPorConversa.get(linha.id) || [],
        descricao: linha.descricao || undefined,
        criadoPorId: linha.criado_por_id || undefined,
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

    localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(listaConversas));
    localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(comAnexos));
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

    return { sucesso: true };
  }

  async removerConversa(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };
    // Participantes e mensagens caem junto, pelo `on delete cascade`
    const { error } = await supabase.from('conversas').delete().eq('id', id);
    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true };
  }

  async salvarMensagem(mensagem: Mensagem): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('mensagens').insert(paraLinhaMensagem(mensagem));
    if (error) {
      console.error('Falha ao enviar mensagem ao banco:', error.message);
      return { sucesso: false, erro: await explicarRecusa(error) };
    }

    // Quem envia já leu a própria mensagem
    await this.marcarLeitura([mensagem.id], mensagem.remetenteId);
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
      })
      .eq('id', mensagem.id);

    if (error) {
      console.error('Falha ao atualizar mensagem:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  async removerMensagem(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };
    const { error } = await supabase.from('mensagens').delete().eq('id', id);
    if (error) {
      console.error('Falha ao remover mensagem:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  /** Marca como lidas. Repetir não é erro: a chave é (mensagem, pessoa). */
  async marcarLeitura(mensagemIds: string[], colaboradorId: string): Promise<boolean> {
    if (!supabase || mensagemIds.length === 0) return false;

    const { error } = await supabase.from('leituras_mensagem').upsert(
      mensagemIds.map((mensagemId) => ({
        mensagem_id: mensagemId,
        colaborador_id: colaboradorId,
      })),
      { onConflict: 'mensagem_id,colaborador_id', ignoreDuplicates: true }
    );

    return !error;
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

    const [avisos, leituras] = await Promise.all([
      supabase.from('avisos_rede').select('*').order('criado_em', { ascending: false }),
      supabase.from('avisos_leitura').select('aviso_id, colaborador_id, confirmado'),
    ]);

    if (avisos.error) {
      console.error('Falha ao sincronizar avisos:', avisos.error.message);
      return false;
    }

    const lidos = new Map<string, string[]>();
    const confirmados = new Map<string, string[]>();
    (
      (leituras.data || []) as {
        aviso_id: string;
        colaborador_id: string;
        confirmado: boolean;
      }[]
    ).forEach((l) => {
      const listaLidos = lidos.get(l.aviso_id) || [];
      listaLidos.push(l.colaborador_id);
      lidos.set(l.aviso_id, listaLidos);

      if (l.confirmado) {
        const listaConfirmados = confirmados.get(l.aviso_id) || [];
        listaConfirmados.push(l.colaborador_id);
        confirmados.set(l.aviso_id, listaConfirmados);
      }
    });

    const lista: AvisoRede[] = ((avisos.data || []) as LinhaAviso[]).map((linha) => {
      const data = new Date(linha.criado_em);
      return {
        id: linha.id,
        titulo: linha.titulo,
        conteudo: linha.conteudo,
        prioridade: linha.prioridade as PrioridadeAviso,
        autorId: linha.autor_id || '',
        autorNome: linha.autor_nome,
        autorCargo: linha.autor_cargo,
        criadoEm: linha.criado_em,
        horaFormatada: horaDe(linha.criado_em),
        dataPorExtenso: data.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        fixadoNoTopo: linha.fixado_no_topo,
        lojaDestino: linha.loja_destino as Loja | 'Todas',
        lidoPorIds: lidos.get(linha.id) || [],
        confirmacoesIds: confirmados.get(linha.id) || [],
      };
    });

    localStorage.setItem(CHAVE_AVISOS_REDE, JSON.stringify(lista));
    this.avisar();
    return true;
  }

  async salvarAviso(aviso: AvisoRede): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase
      .from('avisos_rede')
      .upsert(paraLinhaAviso(aviso), { onConflict: 'id' });

    if (error) {
      console.error('Falha ao salvar aviso:', error.message);
      return { sucesso: false, erro: error.message };
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
      bipeRadioAtivo: data.bipe_radio_ativo,
      tempoMaximoRadioSegundos: data.tempo_maximo_radio_segundos,
      mesesHistoricoConversas: data.meses_historico_conversas ?? 2,
      ultimaLimpezaConversas: data.ultima_limpeza_conversas ?? undefined,
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
        bipe_radio_ativo: config.bipeRadioAtivo,
        tempo_maximo_radio_segundos: config.tempoMaximoRadioSegundos,
        meses_historico_conversas: config.mesesHistoricoConversas,
        ultima_limpeza_conversas: config.ultimaLimpezaConversas ?? null,
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

  // --- AUDITORIA ---

  async sincronizarAuditoria(): Promise<boolean> {
    if (!supabase) return false;

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

    const { error } = await supabase.from('auditoria').insert({
      id: registro.id,
      data_hora: registro.dataHora,
      usuario_nome: registro.usuarioNome,
      acao: registro.acao,
      categoria: registro.categoria,
      detalhes: registro.detalhes,
    });

    if (error) console.error('Falha ao gravar auditoria:', error.message);
  }

  // --- TEMPO REAL ---

  iniciarTempoReal(): void {
    if (!supabase || this.canalAberto) return;
    this.canalAberto = true;

    const recarregarConversas = () => {
      this.sincronizarConversas();
    };

    supabase
      .channel('conecta-conversas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens' }, recarregarConversas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, recarregarConversas)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participantes' },
        recarregarConversas
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leituras_mensagem' },
        recarregarConversas
      )
      .subscribe();

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auditoria' }, () => {
        this.sincronizarAuditoria();
      })
      .subscribe();
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
