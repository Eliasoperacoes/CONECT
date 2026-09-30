/**
 * O PDF DO ESCRITÓRIO: ler o texto de cada página, separar as páginas de
 * cada pessoa num PDF só dela, e publicar.
 *
 * Tudo no navegador de quem está no RH: o arquivo com o salário da rede
 * inteira não sobe para lugar nenhum antes de ser separado. O que sobe é
 * o holerite de cada um, pelo `salvarHolerite` de sempre — o mesmo
 * caminho, a mesma pasta, a mesma trava de quem pode publicar.
 *
 * As duas bibliotecas (pdfjs para ler, pdf-lib para separar) carregam só
 * quando o RH abre a carga: são pesadas, e 88 das 89 pessoas nunca vão
 * usá-las.
 */
import { salvarHolerite } from './rh';

/** O leitor de PDF, com o trabalhador dele apontado para o arquivo que o Vite serve. */
const carregarLeitor = async () => {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: trabalhador } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = trabalhador;
  }
  return pdfjs;
};

/**
 * O texto de cada página, na ordem.
 *
 * Página sem texto nenhum quer dizer PDF ESCANEADO (foto do papel): não há
 * nome para ler. Quem chama avisa o RH em vez de mostrar tudo "sem dono".
 */
export const lerTextosDoPdf = async (dados: ArrayBuffer): Promise<string[]> => {
  const pdfjs = await carregarLeitor();
  // Cópia: o leitor transfere o buffer para o trabalhador e o deixa vazio,
  // e o mesmo arquivo ainda vai ser separado depois
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(dados.slice(0)) });
  const documento = await tarefa.promise;

  const textos: string[] = [];
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const conteudo = await pagina.getTextContent();
    textos.push(
      conteudo.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    );
  }
  // Libera o trabalhador: 80 páginas de holerite ficariam na memória à toa
  await tarefa.destroy();
  return textos;
};

/**
 * Um PDF novo só com as páginas pedidas, como `data:` (o formato que o
 * envio de documento recebe). Páginas contadas a partir de 1.
 */
export const separarPaginas = async (dados: ArrayBuffer, paginas: number[]): Promise<string> => {
  const { PDFDocument } = await import('pdf-lib');
  const origem = await PDFDocument.load(dados, { ignoreEncryption: true });
  const novo = await PDFDocument.create();
  const copiadas = await novo.copyPages(
    origem,
    paginas.map((p) => p - 1)
  );
  copiadas.forEach((p) => novo.addPage(p));
  return novo.saveAsBase64({ dataUri: true });
};

export interface ResultadoDaCarga {
  publicados: number;
  falhas: Array<{ colaboradorId: string; erro: string }>;
}

/**
 * Publica o holerite de cada pessoa, um de cada vez.
 *
 * Um de cada vez de propósito: em paralelo, oitenta envios disputando a
 * conexão da loja terminam em metade falhando por tempo. E como a
 * escala de folgas, o lote não é tudo-ou-nada — quem falhou volta com o
 * motivo, e o resto fica publicado.
 */
export const publicarCargaDeHolerites = async (dados: {
  arquivo: ArrayBuffer;
  competencia: string;
  grupos: Record<string, number[]>;
  nomeDe: (colaboradorId: string) => string;
  aoAvancar?: (feitos: number, total: number) => void;
}): Promise<ResultadoDaCarga> => {
  const pessoas = Object.entries(dados.grupos).filter(([, paginas]) => paginas.length > 0);
  const resultado: ResultadoDaCarga = { publicados: 0, falhas: [] };

  for (let i = 0; i < pessoas.length; i++) {
    const [colaboradorId, paginas] = pessoas[i];
    try {
      const conteudo = await separarPaginas(dados.arquivo, paginas);
      const nome = dados.nomeDe(colaboradorId).replace(/[^\p{L}\p{N} ]+/gu, '').trim();
      const res = await salvarHolerite({
        colaboradorId,
        competencia: dados.competencia,
        conteudo,
        arquivoNome: `Holerite ${dados.competencia} - ${nome}.pdf`,
      });
      if (res.sucesso) resultado.publicados++;
      else resultado.falhas.push({ colaboradorId, erro: res.erro || 'Falha ao publicar.' });
    } catch (erro) {
      resultado.falhas.push({
        colaboradorId,
        erro: erro instanceof Error ? erro.message : 'Não foi possível separar as páginas.',
      });
    }
    dados.aoAvancar?.(i + 1, pessoas.length);
  }

  return resultado;
};
