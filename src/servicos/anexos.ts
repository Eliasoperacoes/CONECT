/**
 * Arquivos das mensagens — CONECTA / Malachias Autopeças
 *
 * Foto, documento e recado de voz não viajam mais dentro da mensagem. Eles
 * vão para o armazenamento do Supabase e a mensagem guarda só o caminho.
 *
 * Por que isso importa: embutido como texto, uma foto de 200 KB vira quase
 * 270 KB dentro da linha da tabela. Abrir uma conversa baixaria todas as
 * fotos dela de uma vez, mesmo as que ninguém vai olhar, e o banco cresceria
 * num ritmo que o expurgo de histórico não acompanha.
 *
 * O balde é privado. Nada é servido por link aberto: cada arquivo só é
 * alcançado por um endereço assinado, com prazo, gerado para quem está
 * autenticado na rede.
 */

import { supabase } from './supabase';

const BALDE = 'anexos';

/** Prazo do endereço assinado. Cobre um turno inteiro sem precisar renovar. */
const VALIDADE_SEGUNDOS = 60 * 60 * 8;

/**
 * O conteúdo já está pronto para uso na tela, ou é um caminho que precisa ser
 * resolvido? Mensagens antigas guardam o próprio conteúdo em `data:`; as
 * novas guardam o caminho no armazenamento.
 */
export const ehConteudoDireto = (valor?: string): boolean =>
  !!valor && (valor.startsWith('data:') || valor.startsWith('http'));

/** Extensão a partir do tipo do arquivo, para o nome no armazenamento. */
const extensaoDe = (tipoMime: string, nomeOriginal?: string): string => {
  const doNome = nomeOriginal?.includes('.') ? nomeOriginal.split('.').pop() : null;
  if (doNome && doNome.length <= 5) return doNome.toLowerCase();

  const depoisDaBarra = tipoMime.split('/')[1] || 'bin';
  return depoisDaBarra.split(';')[0].toLowerCase();
};

/** Converte o `data:` que a câmera e o gravador produzem em conteúdo binário. */
const deDataUrlParaBlob = (dataUrl: string): { blob: Blob; tipo: string } => {
  const [cabecalho, dados] = dataUrl.split(',');
  const tipo = cabecalho.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binario = atob(dados);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return { blob: new Blob([bytes], { type: tipo }), tipo };
};

/**
 * Sobe o arquivo e devolve o caminho dele — que é o que a mensagem guarda —
 * junto de um endereço pronto para exibir na hora, sem esperar a próxima
 * sincronização.
 */
export const enviarAnexo = async (
  conteudo: string,
  conversaId: string,
  mensagemId: string,
  nomeOriginal?: string
): Promise<{ caminho: string; url: string } | null> => {
  if (!supabase || !conteudo.startsWith('data:')) return null;

  try {
    const { blob, tipo } = deDataUrlParaBlob(conteudo);
    const caminho = `${conversaId}/${mensagemId}.${extensaoDe(tipo, nomeOriginal)}`;

    const { error } = await supabase.storage.from(BALDE).upload(caminho, blob, {
      contentType: tipo,
      upsert: true,
    });

    if (error) {
      console.error('Falha ao enviar o anexo:', error.message);
      return null;
    }

    const url = await resolverCaminho(caminho);
    return url ? { caminho, url } : null;
  } catch (erro) {
    console.error('Falha ao preparar o anexo:', erro);
    return null;
  }
};

/** Endereço assinado de um arquivo. */
/**
 * Sobe um documento para um caminho ESCOLHIDO por quem chama.
 *
 * Existe ao lado de `enviarAnexo` porque holerite e advertência não são
 * mensagem: não têm conversa nem id de mensagem para montar o caminho, e
 * forçá-los a fingir que têm produziria pastas como
 * "undefined/undefined.pdf" — que é o tipo de coisa que só aparece quando
 * alguém vai procurar um documento e não acha.
 *
 * O caminho é responsabilidade de quem chama, e é ele que garante que o
 * documento de uma pessoa não caia na pasta de outra.
 */
export const enviarDocumento = async (
  conteudo: string,
  caminho: string
): Promise<{ caminho: string; url: string } | null> => {
  if (!supabase || !conteudo.startsWith('data:')) return null;

  try {
    const { blob, tipo } = deDataUrlParaBlob(conteudo);

    const { error } = await supabase.storage.from(BALDE).upload(caminho, blob, {
      contentType: tipo,
      upsert: true,
    });
    if (error) {
      console.error('Falha ao subir o documento:', error.message);
      return null;
    }

    const url = await resolverCaminho(caminho);
    return { caminho, url: url || '' };
  } catch (erro) {
    console.error('Falha ao preparar o documento:', erro);
    return null;
  }
};

export const resolverCaminho = async (caminho: string): Promise<string | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(BALDE)
    .createSignedUrl(caminho, VALIDADE_SEGUNDOS);

  if (error || !data) {
    console.error('Falha ao abrir o anexo:', error?.message);
    return null;
  }
  return data.signedUrl;
};

/**
 * Assina vários caminhos de uma vez. Usado ao trazer a conversa do banco: uma
 * chamada para todos os anexos, em vez de uma por mensagem.
 */
export const resolverCaminhos = async (
  caminhos: string[]
): Promise<Map<string, string>> => {
  const resolvidos = new Map<string, string>();
  if (!supabase || caminhos.length === 0) return resolvidos;

  const unicos = [...new Set(caminhos)];
  const { data, error } = await supabase.storage
    .from(BALDE)
    .createSignedUrls(unicos, VALIDADE_SEGUNDOS);

  if (error || !data) {
    console.error('Falha ao abrir os anexos da conversa:', error?.message);
    return resolvidos;
  }

  data.forEach((item) => {
    if (item.path && item.signedUrl) resolvidos.set(item.path, item.signedUrl);
  });
  return resolvidos;
};

/**
 * Apaga arquivos do armazenamento. Chamado depois do expurgo do histórico:
 * o banco devolve os caminhos que ficaram órfãos, e eles saem daqui.
 */
export const apagarAnexos = async (caminhos: string[]): Promise<number> => {
  if (!supabase || caminhos.length === 0) return 0;

  const { data, error } = await supabase.storage.from(BALDE).remove(caminhos);
  if (error) {
    console.error('Falha ao apagar anexos:', error.message);
    return 0;
  }
  return data?.length ?? 0;
};
