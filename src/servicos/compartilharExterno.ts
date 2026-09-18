/**
 * Compartilhar para fora — CONECTA / Malachias Autopeças
 *
 * O atendimento a cliente e a negociação com fornecedor acontecem no
 * WhatsApp. O que nasce aqui dentro precisa conseguir sair, sem que a
 * pessoa fique tirando print da própria tela.
 *
 * ===================================================================
 * NÃO HÁ INTEGRAÇÃO. É O APARELHO DA PESSOA QUE ENVIA.
 * ===================================================================
 *
 * Nada aqui fala com a API do WhatsApp. O sistema monta o conteúdo e
 * entrega para o aparelho; quem escolhe o contato e aperta enviar é a
 * pessoa, dentro do WhatsApp dela. Isso é de propósito: a API oficial
 * exige número dedicado, aprovação da Meta e mensalidade, e as
 * bibliotecas não oficiais fazem o número ser banido.
 *
 * Dois caminhos, um caindo no outro:
 *
 *   1. `navigator.share` — a bandeja do próprio celular. É a única que
 *      leva ARQUIVO junto (imagem, áudio, PDF). Android e iPhone.
 *   2. `wa.me` — quando não existe bandeja (o PC). Abre o WhatsApp Web
 *      com o texto pronto. Só texto: o link não carrega anexo, e isso é
 *      limite do WhatsApp, não nosso.
 *
 * ===================================================================
 * POR QUE NÃO HÁ `await` ANTES DO `navigator.share`
 * ===================================================================
 *
 * O Safari só aceita a bandeja quando ela é aberta no mesmo gesto do
 * toque. Qualquer espera antes — baixar o anexo, consultar o banco —
 * gasta o gesto, e no iPhone a bandeja simplesmente não abre.
 *
 * Por isso os anexos são convertidos de forma SÍNCRONA, com `atob`, a
 * partir do data URL que já está na memória. É também o motivo de
 * anexo que mora só no balde ficar de fora: buscá-lo exigiria esperar.
 */

import { Mensagem, Colaborador } from '../tipos';

/** O que de fato aconteceu, para a tela não prometer o que não houve. */
export interface ResultadoCompartilhamento {
  /** A bandeja do aparelho, o link do WhatsApp Web, ou nada. */
  via: 'bandeja' | 'link' | 'nenhum';
  /** A pessoa fechou a bandeja sem escolher contato. */
  cancelado: boolean;
  /** Quantos anexos foram junto. Zero pelo link, sempre. */
  arquivosEnviados: number;
  /**
   * Havia anexo que NÃO foi junto.
   *
   * A tela precisa saber para avisar. Mandar só o texto e deixar a
   * pessoa achar que a foto da peça foi junto é pior do que não ter o
   * botão: ela só descobre quando o fornecedor responde "que peça?".
   */
  arquivosDeixadosParaTras: number;
  erro?: string;
}

/**
 * Limite do texto no caminho do link.
 *
 * Endereço muito longo é cortado no meio pelo navegador ou recusado
 * pelo WhatsApp Web, e o corte cai em cima da última mensagem. Melhor
 * cortar nós, avisando, do que entregar um texto picado.
 *
 * Não vale para a bandeja, que recebe o texto inteiro.
 */
const LIMITE_TEXTO_NO_LINK = 1500;

const HORA_DESCONHECIDA = '--:--';

/**
 * A descrição de uma mensagem sem texto.
 *
 * Linha vazia num compartilhamento faz o destinatário achar que faltou
 * conteúdo. Dizer "(imagem)" é pouco, mas é verdade.
 */
const descreverSemTexto = (m: Mensagem): string => {
  if (m.tipo === 'imagem') return '(imagem)';
  if (m.tipo === 'recado_voz') {
    const s = m.audioDuracao;
    if (!s) return '(áudio)';
    const minutos = Math.floor(s / 60);
    const segundos = String(Math.floor(s % 60)).padStart(2, '0');
    return `(áudio ${minutos}:${segundos})`;
  }
  if (m.tipo === 'arquivo') return `(arquivo: ${m.arquivoNome || 'sem nome'})`;
  return '';
};

/**
 * O texto que vai para o WhatsApp.
 *
 * Leva QUEM e QUANDO. Sem isso o fornecedor recebe frases soltas e não
 * sabe quem prometeu o quê — que é justamente o motivo de a conversa
 * estar saindo daqui.
 *
 * NÃO leva cabeçalho da empresa. Seria uma linha a mais em todo envio,
 * inclusive nos de uma mensagem só, e quem manda escreve o contexto
 * melhor do que um carimbo automático.
 */
export const montarTextoDasMensagens = (
  mensagens: Mensagem[],
  nomePorId: (id: string) => string
): string =>
  mensagens
    .map((m) => {
      const corpo = (m.texto || '').trim() || descreverSemTexto(m);
      const legenda = m.tipo === 'imagem' && m.legenda ? ` ${m.legenda.trim()}` : '';
      return `[${m.horaFormatada || HORA_DESCONHECIDA}] ${nomePorId(m.remetenteId)}: ${corpo}${legenda}`;
    })
    .join('\n');

/** Corta no limite do link, avisando que cortou. */
export const encurtarParaLink = (texto: string): string =>
  texto.length <= LIMITE_TEXTO_NO_LINK
    ? texto
    : `${texto.slice(0, LIMITE_TEXTO_NO_LINK)}\n[...] mensagem cortada por tamanho`;

/**
 * Data URL para arquivo, SEM espera.
 *
 * `fetch(dataUrl)` seria uma linha e é o que todo exemplo mostra — mas
 * é assíncrono, e gastar o gesto do toque mata a bandeja no iPhone.
 * `atob` faz o mesmo aqui mesmo, na hora.
 *
 * Devolve `null` em vez de estourar: um anexo corrompido não pode
 * derrubar o compartilhamento dos outros.
 */
export const dataUrlParaArquivo = (dataUrl: string, nome: string): File | null => {
  try {
    const virgula = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || virgula === -1) return null;

    const cabecalho = dataUrl.slice(5, virgula);
    if (!cabecalho.includes('base64')) return null;

    const tipo = cabecalho.split(';')[0] || 'application/octet-stream';
    const binario = atob(dataUrl.slice(virgula + 1));

    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

    return new File([bytes], nome, { type: tipo });
  } catch {
    return null;
  }
};

const extensaoDe = (tipo: string): string => {
  const depois = tipo.split('/')[1] || 'bin';
  return depois.split(';')[0];
};

/**
 * Os anexos que conseguem ir junto.
 *
 * Só o que está em data URL na memória. Anexo que mora apenas no balde
 * tem `anexoCaminho` e nenhum conteúdo local: buscá-lo exigiria
 * esperar, e a espera custa a bandeja no iPhone. Ele entra na conta de
 * "deixados para trás" e a tela avisa.
 */
export const arquivosDasMensagens = (
  mensagens: Mensagem[]
): { arquivos: File[]; deixadosParaTras: number } => {
  const arquivos: File[] = [];
  let deixadosParaTras = 0;

  mensagens.forEach((m, indice) => {
    const temAnexo = m.tipo === 'imagem' || m.tipo === 'arquivo' || m.tipo === 'recado_voz';
    if (!temAnexo) return;

    const conteudo = m.imagemUrl || m.arquivoUrl || m.audioUrl;
    if (!conteudo || !conteudo.startsWith('data:')) {
      deixadosParaTras++;
      return;
    }

    const arquivo = dataUrlParaArquivo(
      conteudo,
      m.arquivoNome || `conecta-${indice + 1}.${extensaoDe(conteudo.slice(5).split(';')[0])}`
    );

    if (arquivo) arquivos.push(arquivo);
    else deixadosParaTras++;
  });

  return { arquivos, deixadosParaTras };
};

/** O endereço que abre o WhatsApp com o texto pronto. */
export const montarLinkWhatsApp = (texto: string): string =>
  `https://wa.me/?text=${encodeURIComponent(encurtarParaLink(texto))}`;

/**
 * Manda para o WhatsApp.
 *
 * Precisa ser chamada DIRETO do clique, sem nenhuma espera antes — ver
 * a explicação do gesto no topo do arquivo.
 */
export const compartilharNoWhatsApp = async (dados: {
  texto: string;
  arquivos?: File[];
  deixadosParaTras?: number;
}): Promise<ResultadoCompartilhamento> => {
  const deixadosParaTras = dados.deixadosParaTras ?? 0;
  const arquivos = dados.arquivos ?? [];

  const base = {
    cancelado: false,
    arquivosEnviados: 0,
    arquivosDeixadosParaTras: deixadosParaTras,
  };

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    /**
     * `canShare` pergunta ao aparelho se ELE aceita estes arquivos.
     * Alguns tipos são recusados (o navegador tem lista própria), e
     * chamar `share` mesmo assim falha inteiro — some o texto também.
     * Por isso, recusado o arquivo, a bandeja é aberta só com o texto.
     */
    const aceitaArquivos =
      arquivos.length > 0 &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: arquivos });

    try {
      await navigator.share(
        aceitaArquivos ? { text: dados.texto, files: arquivos } : { text: dados.texto }
      );
      return {
        ...base,
        via: 'bandeja',
        arquivosEnviados: aceitaArquivos ? arquivos.length : 0,
        arquivosDeixadosParaTras: deixadosParaTras + (aceitaArquivos ? 0 : arquivos.length),
      };
    } catch (erro) {
      /**
       * Fechar a bandeja sem escolher contato chega aqui como
       * `AbortError`. Não é falha, e principalmente NÃO É ENVIO: quem
       * chama usa isto para não registrar uma saída que não houve.
       */
      if (erro instanceof DOMException && erro.name === 'AbortError') {
        return { ...base, via: 'nenhum', cancelado: true };
      }
      // Bandeja quebrada não é beco sem saída: cai no link, abaixo.
    }
  }

  if (typeof window === 'undefined') {
    return { ...base, via: 'nenhum', erro: 'Sem navegador para abrir o WhatsApp.' };
  }

  const janela = window.open(montarLinkWhatsApp(dados.texto), '_blank', 'noopener,noreferrer');
  if (!janela) {
    return {
      ...base,
      via: 'nenhum',
      erro: 'O navegador bloqueou a janela do WhatsApp. Libere o bloqueio de pop-up e tente de novo.',
    };
  }

  return {
    ...base,
    via: 'link',
    arquivosDeixadosParaTras: deixadosParaTras + arquivos.length,
  };
};

/**
 * Copia a imagem para a área de transferência, para colar no WhatsApp Web.
 *
 * É o contorno do PC: o link não leva anexo, mas o WhatsApp Web aceita
 * Ctrl+V. Fica num botão separado de propósito — a cópia precisa do
 * próprio gesto, e emendá-la na abertura da janela faz uma das duas
 * falhar.
 *
 * Passa por `canvas` porque a área de transferência dos navegadores só
 * aceita PNG de forma confiável; JPEG é recusado calado no Chrome.
 */
export const copiarImagemParaAreaDeTransferencia = async (
  dataUrl: string
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    return { sucesso: false, erro: 'Este navegador não deixa copiar imagem.' };
  }

  try {
    const imagem = new Image();
    imagem.src = dataUrl;
    await imagem.decode();

    const tela = document.createElement('canvas');
    tela.width = imagem.naturalWidth;
    tela.height = imagem.naturalHeight;
    tela.getContext('2d')?.drawImage(imagem, 0, 0);

    const png = await new Promise<Blob | null>((resolve) =>
      tela.toBlob(resolve, 'image/png')
    );
    if (!png) return { sucesso: false, erro: 'Não foi possível preparar a imagem.' };

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return { sucesso: true };
  } catch {
    return { sucesso: false, erro: 'O navegador recusou a cópia da imagem.' };
  }
};

/** A primeira imagem da seleção, que é a que o botão de copiar oferece. */
export const primeiraImagem = (mensagens: Mensagem[]): string | undefined =>
  mensagens.find((m) => m.tipo === 'imagem' && m.imagemUrl?.startsWith('data:'))?.imagemUrl;

/**
 * Há bandeja neste aparelho?
 *
 * Decide o texto do botão. Prometer "abrir o WhatsApp" num PC que vai
 * abrir uma aba do navegador é uma promessa diferente da que se cumpre.
 */
export const temBandejaDoAparelho = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** O nome de quem mandou, para montar o texto sem depender da tela. */
export const nomeadorDe = (colaboradores: Colaborador[]) => (id: string): string =>
  colaboradores.find((c) => c.id === id)?.nome || 'Colaborador';
