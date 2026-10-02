/**
 * O PDF DO ESCRITÓRIO SEPARADO POR PESSOA, com PDF de verdade.
 *
 * O que cada um recebe tem de ser SÓ as páginas dele — e o lote não pode
 * parar inteiro porque uma pessoa falhou.
 */
import { test, expect, mock, beforeEach } from 'bun:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** O que foi publicado: para quem, de que mês, e o PDF que foi. */
const publicados: Array<{ colaboradorId: string; competencia: string; conteudo: string; arquivoNome: string }> = [];
let recusar: string | null = null;

mock.module('./rh', () => ({
  salvarHolerite: async (dados: any) => {
    if (dados.colaboradorId === recusar) return { sucesso: false, erro: 'O banco recusou.' };
    publicados.push(dados);
    return { sucesso: true, id: `hol-${dados.colaboradorId}-${dados.competencia}` };
  },
}));

/** Os pedidos de aviso ao celular que a carga fez. */
const avisos: Array<{ tipo: string; ids: string[] }> = [];
mock.module('./envioDeAviso', () => ({
  pedirAvisoDeDocumentoRh: (tipo: string, ids: string[]) => avisos.push({ tipo, ids }),
}));

const { separarPaginas, publicarCargaDeHolerites } = await import('./pdfHolerite');

/** Um PDF com uma página por texto, como o do escritório. */
const pdfCom = async (paginas: string[]): Promise<ArrayBuffer> => {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (const texto of paginas) {
    doc.addPage([400, 200]).drawText(texto, { x: 20, y: 100, size: 12, font: fonte });
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

/** Quantas páginas tem o PDF publicado (vem como `data:`). */
const paginasDe = async (dataUri: string): Promise<number> => {
  const base64 = dataUri.split(',')[1];
  const doc = await PDFDocument.load(Buffer.from(base64, 'base64'));
  return doc.getPageCount();
};

beforeEach(() => {
  publicados.length = 0;
  avisos.length = 0;
  recusar = null;
});

test('separa só as páginas pedidas, num PDF próprio', async () => {
  const arquivo = await pdfCom(['MARIA', 'JOAO', 'MARIA CONTINUA']);
  const separado = await separarPaginas(arquivo, [1, 3]);

  expect(separado.startsWith('data:application/pdf;base64,')).toBe(true);
  expect(await paginasDe(separado)).toBe(2);
});

test('a página com corte sai com a via de cima só; a sem corte, inteira', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  const bytes = await doc.save();
  const arquivo = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const separado = await separarPaginas(arquivo, [1, 2], { 1: 457, 2: null });
  const [comCorte, semCorte] = (await PDFDocument.load(Buffer.from(separado.split(',')[1], 'base64'))).getPages();
  // Da altura 457 até o topo (842): a via de baixo ficou fora da folha
  expect(comCorte.getMediaBox()).toEqual({ x: 0, y: 457, width: 595, height: 385 });
  expect(comCorte.getCropBox()).toEqual({ x: 0, y: 457, width: 595, height: 385 });
  expect(semCorte.getMediaBox()).toEqual({ x: 0, y: 0, width: 595, height: 842 });
});

test('a publicação passa os cortes adiante', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const bytes = await doc.save();
  await publicarCargaDeHolerites({
    arquivo: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    competencia: '2026-09',
    grupos: { maria: [1] },
    cortes: { 1: 457 },
    nomeDe: (id) => id,
  });
  const pagina = (await PDFDocument.load(Buffer.from(publicados[0].conteudo.split(',')[1], 'base64'))).getPage(0);
  expect(pagina.getHeight()).toBe(385);
});

test('cada pessoa recebe o dela, no mês escolhido', async () => {
  const arquivo = await pdfCom(['MARIA', 'JOAO', 'RESUMO DA FOLHA']);
  const avancos: string[] = [];

  const res = await publicarCargaDeHolerites({
    arquivo,
    competencia: '2026-09',
    grupos: { maria: [1], joao: [2] },
    nomeDe: (id) => (id === 'maria' ? 'Maria Clara' : 'João Felipe'),
    aoAvancar: (feitos, total) => avancos.push(`${feitos}/${total}`),
  });

  expect(res).toEqual({ publicados: 2, falhas: [] });
  expect(publicados.map((p) => [p.colaboradorId, p.competencia])).toEqual([
    ['maria', '2026-09'],
    ['joao', '2026-09'],
  ]);
  // Uma página cada — o resumo da folha (pág. 3) não foi para ninguém
  expect(await paginasDe(publicados[0].conteudo)).toBe(1);
  expect(await paginasDe(publicados[1].conteudo)).toBe(1);
  expect(publicados[0].arquivoNome).toBe('Holerite 2026-09 - Maria Clara.pdf');
  expect(avancos).toEqual(['1/2', '2/2']);
});

test('uma falha não derruba o lote: o resto publica, e a falha volta com o motivo', async () => {
  recusar = 'maria';
  const arquivo = await pdfCom(['MARIA', 'JOAO']);

  const res = await publicarCargaDeHolerites({
    arquivo,
    competencia: '2026-09',
    grupos: { maria: [1], joao: [2] },
    nomeDe: (id) => id,
  });

  expect(res.publicados).toBe(1);
  expect(res.falhas).toEqual([{ colaboradorId: 'maria', erro: 'O banco recusou.' }]);
  expect(publicados.map((p) => p.colaboradorId)).toEqual(['joao']);
});

test('pessoa sem página nenhuma não gera holerite vazio', async () => {
  const arquivo = await pdfCom(['JOAO']);
  const res = await publicarCargaDeHolerites({
    arquivo,
    competencia: '2026-09',
    grupos: { joao: [1], maria: [] },
    nomeDe: (id) => id,
  });
  expect(res.publicados).toBe(1);
  expect(publicados.map((p) => p.colaboradorId)).toEqual(['joao']);
});

test('a carga avisa os publicados de uma vez, no fim — e não quem falhou', async () => {
  recusar = 'maria';
  const arquivo = await pdfCom(['MARIA', 'JOAO', 'ANA']);
  await publicarCargaDeHolerites({
    arquivo,
    competencia: '2026-09',
    grupos: { maria: [1], joao: [2], ana: [3] },
    nomeDe: (id) => id,
  });
  // Cada publicação foi gravada SEM aviso próprio...
  expect(publicados.every((p: any) => p.avisar === false)).toBe(true);
  // ...e sai um pedido só, com os dois que entraram
  expect(avisos).toEqual([{ tipo: 'holerite', ids: ['hol-joao-2026-09', 'hol-ana-2026-09'] }]);
});
