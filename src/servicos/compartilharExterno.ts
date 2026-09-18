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
 * O ANEXO É PREPARADO ANTES DO CLIQUE
 * ===================================================================
 *
 * O Safari só aceita a bandeja quando ela é aberta no mesmo gesto do
 * toque. Qualquer espera antes — baixar o anexo, consultar o banco —
 * gasta o gesto, e no iPhone a bandeja simplesmente não abre.
 *
 * A saída NÃO é recusar anexo que precise ser baixado. A primeira versão
 * fez isso, exigindo data URL, e na prática nenhuma foto ia: com a nuvem
 * ligada, `imagemUrl` é endereço assinado do balde, não data URL. O
 * botão prometia anexo e mandava só texto.
 *
 * Então a preparação acontece QUANDO O MODAL ABRE, com a pessoa ainda
 * escolhendo o contato. Na hora do clique os arquivos já estão prontos
 * na memória, e `compartilharNoWhatsApp` não espera por nada.
 */

import { Mensagem } from '../tipos';

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

/**
 * O texto que vai para o WhatsApp: SÓ A MENSAGEM.
 *
 * Sem hora, sem nome de quem falou, sem "(imagem)". A primeira versão
 * carimbava `[15:45] Fulano:` na frente de tudo, e do outro lado isso é
 * ruído — o fornecedor não precisa do organograma da loja, precisa saber
 * qual peça é. Quem manda escreve o contexto melhor do que um carimbo.
 *
 * Mensagem sem texto não vira linha nenhuma: a foto vai como arquivo, e
 * anunciar "(imagem)" ao lado da imagem é dizer o óbvio.
 */
export const montarTextoDasMensagens = (mensagens: Mensagem[]): string =>
  mensagens
    .map((m) => {
      const corpo = (m.texto || '').trim();
      const legenda = (m.legenda || '').trim();
      return [corpo, legenda].filter(Boolean).join(' ');
    })
    .filter(Boolean)
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

/** O conteúdo do anexo, seja ele qual for o campo que o carrega. */
const conteudoDoAnexo = (m: Mensagem): string | undefined => {
  if (m.tipo === 'imagem') return m.imagemUrl;
  if (m.tipo === 'recado_voz') return m.audioUrl;
  if (m.tipo === 'arquivo') return m.arquivoUrl;
  return undefined;
};

/**
 * Baixa o anexo que mora no balde.
 *
 * Com a nuvem ligada é ESTE o caso comum — `imagemUrl` vem como endereço
 * assinado, e não como data URL. Recusá-lo, como a primeira versão fazia,
 * era recusar praticamente toda foto.
 *
 * Roda na abertura do modal, nunca no clique.
 */
const baixarComoArquivo = async (url: string, nome: string): Promise<File | null> => {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const conteudo = await resposta.blob();
    return new File([conteudo], nome, {
      type: conteudo.type || 'application/octet-stream',
    });
  } catch {
    return null;
  }
};

/**
 * Os anexos da seleção, prontos para a bandeja.
 *
 * ASSÍNCRONA DE PROPÓSITO, e chamada na ABERTURA do modal. Na hora do
 * clique os arquivos já estão na memória e o envio não espera por nada —
 * que é o que mantém a bandeja funcionando no iPhone.
 *
 * O que não vier é contado. A tela precisa do número para avisar em vez
 * de deixar a pessoa achar que a foto foi junto.
 */
export const prepararArquivos = async (
  mensagens: Mensagem[]
): Promise<{ arquivos: File[]; deixadosParaTras: number }> => {
  const arquivos: File[] = [];
  let deixadosParaTras = 0;

  for (const [indice, m] of mensagens.entries()) {
    const conteudo = conteudoDoAnexo(m);
    if (!conteudo) continue;

    const padrao = `conecta-${indice + 1}`;

    if (conteudo.startsWith('data:')) {
      const tipo = conteudo.slice(5).split(';')[0];
      const arquivo = dataUrlParaArquivo(
        conteudo,
        m.arquivoNome || `${padrao}.${extensaoDe(tipo)}`
      );
      if (arquivo) arquivos.push(arquivo);
      else deixadosParaTras++;
      continue;
    }

    const baixado = await baixarComoArquivo(conteudo, m.arquivoNome || padrao);
    if (!baixado) {
      deixadosParaTras++;
      continue;
    }

    /**
     * O nome do arquivo precisa da extensão certa.
     *
     * O balde guarda o caminho, não o nome original, e arquivo sem
     * extensão chega do outro lado como "documento desconhecido" — o
     * WhatsApp nem mostra a prévia da foto.
     */
    const temExtensao = /\.[a-z0-9]{2,5}$/i.test(baixado.name);
    arquivos.push(
      temExtensao
        ? baixado
        : new File([baixado], `${baixado.name}.${extensaoDe(baixado.type)}`, {
            type: baixado.type,
          })
    );
  }

  return { arquivos, deixadosParaTras };
};

/**
 * O endereço que abre o WhatsApp com o texto pronto.
 *
 * Seleção só de foto não tem texto nenhum. Aí o link vai sem `text`: o
 * WhatsApp abre na escolha de contato do mesmo jeito, e a imagem segue
 * pela área de transferência. Mandar `text=` vazio deixaria a caixa de
 * mensagem com um espaço em branco digitado.
 */
export const montarLinkWhatsApp = (texto: string): string => {
  const limpo = texto.trim();
  return limpo
    ? `https://wa.me/?text=${encodeURIComponent(encurtarParaLink(limpo))}`
    : 'https://wa.me/';
};

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

  if (!dados.texto.trim() && arquivos.length === 0) {
    return { ...base, via: 'nenhum', erro: 'Não há nada para compartilhar.' };
  }

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
      /**
       * Campo vazio não vai.
       *
       * `share({ text: '' })` com arquivo faz alguns aparelhos abrirem a
       * bandeja com uma legenda em branco já digitada — e no iPhone chega
       * a recusar o compartilhamento inteiro.
       */
      const carga: ShareData = {};
      if (dados.texto.trim()) carga.text = dados.texto;
      if (aceitaArquivos) carga.files = arquivos;

      await navigator.share(carga);
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
  arquivo: File
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    return { sucesso: false, erro: 'Este navegador não deixa copiar imagem.' };
  }

  /**
   * Endereço local, não o do balde.
   *
   * Desenhar no `canvas` uma imagem vinda de outro endereço o contamina, e
   * o navegador passa a recusar a leitura — a cópia falharia justamente
   * com a foto que veio da nuvem, que é o caso comum.
   */
  const endereco = URL.createObjectURL(arquivo);

  try {
    const imagem = new Image();
    imagem.src = endereco;
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
  } finally {
    URL.revokeObjectURL(endereco);
  }
};

/** A primeira imagem já preparada — é a que o botão de copiar oferece. */
export const primeiraImagem = (arquivos: File[]): File | undefined =>
  arquivos.find((a) => a.type.startsWith('image/'));

/**
 * Há bandeja neste aparelho?
 *
 * Decide o texto do botão. Prometer "abrir o WhatsApp" num PC que vai
 * abrir uma aba do navegador é uma promessa diferente da que se cumpre.
 */
export const temBandejaDoAparelho = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';
