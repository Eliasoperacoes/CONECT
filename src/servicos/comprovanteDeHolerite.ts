/**
 * O HOLERITE ASSINADO, COMO DOCUMENTO — o que o RH guarda no lugar da via
 * assinada em papel.
 *
 * É montado na hora, a partir de três coisas que o banco guarda separadas:
 * o PDF publicado, a assinatura desenhada da pessoa e o recebimento (quem,
 * quando, e o código do arquivo que ela tinha na tela). Embaixo da última
 * página entra o recibo: o desenho, o nome, a data e hora de Brasília e o
 * código de verificação.
 *
 * Se o arquivo de hoje não for o mesmo que a pessoa assinou — o código
 * não bate —, o comprovante sai com o aviso em vermelho. Holerite assinado
 * não é substituído pelo sistema; o aviso é para o que vier por fora.
 *
 * Sem banco e sem tela aqui: só bytes entram e saem, para ser testado.
 */
import type { RecebimentoHolerite } from '../tipos';

/** O código (SHA-256, em hexadecimal) de um arquivo. */
export const codigoDoArquivo = async (dados: ArrayBuffer): Promise<string> => {
  const resumo = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** "05/10/2026 às 14:32", no horário de Brasília — o do banco, não o do aparelho. */
export const dataHoraDeBrasilia = (iso: string): string => {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value || '';
  return `${de('day')}/${de('month')}/${de('year')} às ${de('hour')}:${de('minute')}`;
};

/** O código para ler e conferir: os 16 primeiros caracteres, em blocos de 4. */
export const codigoDeVerificacao = (hash: string): string =>
  (hash.slice(0, 16).toUpperCase().match(/.{1,4}/g) || []).join('-');

/** As linhas do recibo, em texto — o que vai carimbado embaixo do holerite. */
export const linhasDoRecibo = (nome: string, recebimento: RecebimentoHolerite): string[] => [
  'Declaro ter recebido a importância líquida discriminada neste recibo.',
  `Recebido eletronicamente por ${nome}`,
  `em ${dataHoraDeBrasilia(recebimento.assinadoEm)} (horário de Brasília), confirmado com senha pessoal.`,
  `Código de verificação: ${codigoDeVerificacao(recebimento.arquivoHash)}`,
];

/** Altura do recibo acrescentado embaixo da última página, em pontos. */
const ALTURA_DO_RECIBO = 118;
/** A faixa do responsável, embaixo da do colaborador, quando ele já assinou. */
const ALTURA_DO_RESPONSAVEL = 64;

/** Quem assinou como responsável (o RH), como entra no documento. */
export interface ResponsavelNoDocumento {
  /** A assinatura dele (data URL de PNG). */
  imagem: string;
  nome: string;
  assinadoEm: string;
}

/** As linhas da faixa do responsável. */
export const linhasDoResponsavel = (responsavel: ResponsavelNoDocumento): string[] => [
  `Assinado como responsável pela empresa por ${responsavel.nome}`,
  `em ${dataHoraDeBrasilia(responsavel.assinadoEm)} (horário de Brasília), confirmado com senha pessoal.`,
];

export const montarComprovante = async (dados: {
  pdf: ArrayBuffer;
  nome: string;
  recebimento: RecebimentoHolerite;
  /** A assinatura desenhada (data URL de PNG). */
  imagem: string;
  /** O responsável, quando o RH já assinou (`assinaturas_do_responsavel`). */
  responsavel?: ResponsavelNoDocumento;
}): Promise<Uint8Array> => {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const confere = (await codigoDoArquivo(dados.pdf)) === dados.recebimento.arquivoHash;

  const origem = await PDFDocument.load(dados.pdf, { ignoreEncryption: true });
  const novo = await PDFDocument.create();
  novo.setTitle(`Holerite assinado - ${dados.nome}`);
  const fonte = await novo.embedFont(StandardFonts.Helvetica);
  const negrito = await novo.embedFont(StandardFonts.HelveticaBold);
  const desenho = await novo.embedPng(dados.imagem);

  const paginas = origem.getPages();
  for (let i = 0; i < paginas.length; i++) {
    const pagina = paginas[i];
    // A área visível: no holerite cortado em uma via, só ela entra
    const caixa = pagina.getCropBox();
    const embutida = await novo.embedPage(pagina, {
      left: caixa.x,
      bottom: caixa.y,
      right: caixa.x + caixa.width,
      top: caixa.y + caixa.height,
    });
    const ultima = i === paginas.length - 1;
    // A faixa do responsável vai EMBAIXO da do colaborador, que sobe junto
    const faixa = dados.responsavel ? ALTURA_DO_RESPONSAVEL : 0;
    const extra = ultima ? ALTURA_DO_RECIBO + faixa : 0;
    const folha = novo.addPage([caixa.width, caixa.height + extra]);
    folha.drawPage(embutida, { x: 0, y: extra, width: caixa.width, height: caixa.height });
    if (!ultima) continue;

    // O RECIBO, emoldurado como o resto do holerite
    const margem = 14;
    folha.drawRectangle({
      x: margem,
      y: 10,
      width: caixa.width - margem * 2,
      height: ALTURA_DO_RECIBO - 18 + faixa,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.8,
    });
    folha.drawText('RECIBO ELETRÔNICO', { x: margem + 8, y: faixa + ALTURA_DO_RECIBO - 24, size: 8, font: negrito });

    /** Uma assinatura sobre a linha, com o nome embaixo; `base` é a altura da linha. */
    const maximo = { largura: 150, altura: 52 };
    const xTexto = margem + 8 + maximo.largura + 16;
    const assinaturaSobreALinha = (
      imagem: Awaited<ReturnType<typeof novo.embedPng>>,
      nome: string,
      base: number,
      alturaMaxima: number
    ) => {
      const escala = Math.min(maximo.largura / imagem.width, alturaMaxima / imagem.height, 1);
      const largura = imagem.width * escala;
      folha.drawImage(imagem, {
        x: margem + 8 + (maximo.largura - largura) / 2,
        y: base + 2,
        width: largura,
        height: imagem.height * escala,
      });
      folha.drawLine({
        start: { x: margem + 8, y: base },
        end: { x: margem + 8 + maximo.largura, y: base },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
      folha.drawText(nome, { x: margem + 8, y: base - 10, size: 6.5, font: fonte, maxWidth: maximo.largura });
    };

    // O colaborador: a assinatura à esquerda, o texto do recibo à direita
    assinaturaSobreALinha(desenho, dados.nome, faixa + 34, maximo.altura);
    linhasDoRecibo(dados.nome, dados.recebimento).forEach((linha, n) => {
      folha.drawText(linha, {
        x: xTexto,
        y: faixa + ALTURA_DO_RECIBO - 40 - n * 13,
        size: 7.5,
        font: n === 1 ? negrito : fonte,
        maxWidth: caixa.width - xTexto - margem - 6,
      });
    });
    if (!confere) {
      folha.drawText('ATENÇÃO: este arquivo NÃO é o mesmo que foi assinado.', {
        x: xTexto,
        y: faixa + 20,
        size: 7.5,
        font: negrito,
        color: rgb(0.8, 0, 0),
      });
    }

    // O responsável, na faixa de baixo, do mesmo jeito
    if (dados.responsavel) {
      folha.drawLine({
        start: { x: margem + 8, y: faixa + 10 },
        end: { x: caixa.width - margem - 8, y: faixa + 10 },
        thickness: 0.4,
        color: rgb(0.6, 0.6, 0.6),
      });
      assinaturaSobreALinha(await novo.embedPng(dados.responsavel.imagem), dados.responsavel.nome, 26, 36);
      linhasDoResponsavel(dados.responsavel).forEach((linha, n) => {
        folha.drawText(linha, {
          x: xTexto,
          y: 50 - n * 13,
          size: 7.5,
          font: n === 0 ? negrito : fonte,
          maxWidth: caixa.width - xTexto - margem - 6,
        });
      });
    }
  }

  return novo.save();
};

/** Vários comprovantes num PDF só — o mês inteiro para o arquivo do RH. */
export const juntarPdfs = async (arquivos: Uint8Array[]): Promise<Uint8Array> => {
  const { PDFDocument } = await import('pdf-lib');
  const junto = await PDFDocument.create();
  for (const arquivo of arquivos) {
    const doc = await PDFDocument.load(arquivo);
    const copiadas = await junto.copyPages(doc, doc.getPageIndices());
    copiadas.forEach((p) => junto.addPage(p));
  }
  return junto.save();
};
