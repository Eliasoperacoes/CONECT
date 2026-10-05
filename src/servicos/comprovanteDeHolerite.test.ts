/**
 * O HOLERITE ASSINADO, COMO DOCUMENTO — o que o RH guarda no lugar da via
 * em papel. Montado com PDF de verdade e lido de volta pelo mesmo leitor
 * que a carga usa.
 */
import { test, expect } from 'bun:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  codigoDoArquivo,
  dataHoraDeBrasilia,
  codigoDeVerificacao,
  montarComprovante,
  juntarPdfs,
} from './comprovanteDeHolerite';
import type { RecebimentoHolerite } from '../tipos';

/** Um PNG de 1x1, como a assinatura desenhada chega (data URL). */
const DESENHO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Um holerite de uma via (595 x 385), cortado como a carga corta. */
const holerite = async (texto = 'EGNALDO DE ARAUJO MAGALHAES'): Promise<ArrayBuffer> => {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (const sufixo of ['', ' CONTINUA']) {
    const p = doc.addPage([595, 842]);
    p.drawText(texto + sufixo, { x: 40, y: 800, size: 10, font: fonte });
    p.setMediaBox(0, 457, 595, 385);
    p.setCropBox(0, 457, 595, 385);
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const textoDe = async (pdf: Uint8Array): Promise<string[]> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: pdf.slice(), verbosity: 0 }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    paginas.push(c.items.map((i: any) => ('str' in i ? i.str : '')).join(' '));
  }
  return paginas;
};

const recebimento = async (pdf: ArrayBuffer): Promise<RecebimentoHolerite> => ({
  holeriteId: 'hol-egnaldo-2026-09',
  colaboradorId: 'egnaldo',
  assinaturaId: 'a1',
  arquivoHash: await codigoDoArquivo(pdf),
  assinadoEm: '2026-10-05T17:32:00.000Z',
});

test('o código do arquivo é o SHA-256 dele', async () => {
  const abc = new TextEncoder().encode('abc');
  expect(await codigoDoArquivo(abc.buffer as ArrayBuffer)).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  expect(codigoDeVerificacao('ba7816bf8f01cfea414140de')).toBe('BA78-16BF-8F01-CFEA');
});

test('a hora do recibo é a de Brasília, não a do aparelho nem a UTC', () => {
  // 17:32 em UTC = 14:32 em Brasília
  expect(dataHoraDeBrasilia('2026-10-05T17:32:00.000Z')).toBe('05/10/2026 às 14:32');
  // Virada de dia: 01:10 UTC do dia 6 ainda é dia 5 em Brasília
  expect(dataHoraDeBrasilia('2026-10-06T01:10:00.000Z')).toBe('05/10/2026 às 22:10');
});

test('o recibo entra embaixo da ÚLTIMA página, e só a via visível é copiada', async () => {
  const pdf = await holerite();
  const comprovante = await montarComprovante({
    pdf,
    nome: 'EGNALDO DE ARAUJO MAGALHAES',
    recebimento: await recebimento(pdf),
    imagem: DESENHO,
  });
  const doc = await PDFDocument.load(comprovante);
  // Duas páginas, como o holerite: a primeira do tamanho da via, a última com o recibo
  expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [595, 385],
    [595, 385 + 118],
  ]);

  const [primeira, ultima] = await textoDe(comprovante);
  expect(primeira).not.toContain('Recebido eletronicamente');
  expect(ultima).toContain('Recebido eletronicamente por EGNALDO DE ARAUJO MAGALHAES');
  expect(ultima).toContain('05/10/2026 às 14:32');
  expect(ultima).toContain(codigoDeVerificacao((await recebimento(pdf)).arquivoHash));
  expect(ultima).not.toContain('ATENÇÃO');
});

test('arquivo diferente do assinado: o comprovante acusa', async () => {
  const assinado = await holerite();
  const trocado = await holerite('EGNALDO DE ARAUJO MAGALHAES 2');
  const comprovante = await montarComprovante({
    pdf: trocado,
    nome: 'EGNALDO',
    recebimento: await recebimento(assinado),
    imagem: DESENHO,
  });
  const paginas = await textoDe(comprovante);
  expect(paginas.at(-1)).toContain('ATENÇÃO: este arquivo NÃO é o mesmo que foi assinado.');
});

test('o mês inteiro num PDF só, na ordem', async () => {
  const a = await PDFDocument.create();
  a.addPage([100, 100]);
  const b = await PDFDocument.create();
  b.addPage([200, 200]);
  b.addPage([300, 300]);
  const junto = await PDFDocument.load(await juntarPdfs([await a.save(), await b.save()]));
  expect(junto.getPages().map((p) => p.getWidth())).toEqual([100, 200, 300]);
});

test('COM O RESPONSÁVEL: a faixa dele entra embaixo, e o recibo do colaborador continua inteiro', async () => {
  const pdf = await holerite();
  const comprovante = await montarComprovante({
    pdf,
    nome: 'EGNALDO DE ARAUJO MAGALHAES',
    recebimento: await recebimento(pdf),
    imagem: DESENHO,
    responsavel: { imagem: DESENHO, nome: 'Renata RH', assinadoEm: '2026-10-06T12:05:00.000Z' },
  });
  const doc = await PDFDocument.load(comprovante);
  // A última página cresce a faixa do responsável; a primeira não muda
  expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [595, 385],
    [595, 385 + 118 + 64],
  ]);
  const ultima = (await textoDe(comprovante)).at(-1)!;
  expect(ultima).toContain('Recebido eletronicamente por EGNALDO DE ARAUJO MAGALHAES');
  expect(ultima).toContain('Assinado como responsável pela empresa por Renata RH');
  expect(ultima).toContain('06/10/2026 às 09:05');
});
