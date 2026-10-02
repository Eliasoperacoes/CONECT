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
import { pedirAvisoDeDocumentoRh } from './envioDeAviso';
import { corteEntreVias } from './cargaDeHolerites';
import { carregarLeitorDePdf } from './leitorDePdf';

/** Onde cortar cada página para ficar uma via só (por número de página, a partir de 1). */
export type CortesDasVias = Record<number, number | null>;

/**
 * O texto de cada página, na ordem — e onde cortar cada uma.
 *
 * Página sem texto nenhum quer dizer PDF ESCANEADO (foto do papel): não há
 * nome para ler. Quem chama avisa o RH em vez de mostrar tudo "sem dono".
 */
export const lerPaginasDoPdf = async (
  dados: ArrayBuffer
): Promise<{ textos: string[]; cortes: CortesDasVias }> => {
  const pdfjs = await carregarLeitorDePdf();
  // Cópia: o leitor transfere o buffer para o trabalhador e o deixa vazio,
  // e o mesmo arquivo ainda vai ser separado depois
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(dados.slice(0)) });
  const documento = await tarefa.promise;

  const textos: string[] = [];
  const cortes: CortesDasVias = {};
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const conteudo = await pagina.getTextContent();
    const itens = conteudo.items.flatMap((item) =>
      'str' in item ? [{ texto: item.str, x: item.transform[4], y: item.transform[5] }] : []
    );
    textos.push(itens.map((i) => i.texto).join(' '));
    cortes[n] = corteEntreVias(itens);
  }
  // Libera o trabalhador: 80 páginas de holerite ficariam na memória à toa
  await tarefa.destroy();
  return { textos, cortes };
};

/**
 * Um PDF novo só com as páginas pedidas, como `data:` (o formato que o
 * envio de documento recebe). Páginas contadas a partir de 1.
 *
 * Página com corte sai só com a via de cima: a folha encolhe até o corte,
 * e a via de baixo fica fora do que qualquer leitor mostra ou imprime.
 */
export const separarPaginas = async (
  dados: ArrayBuffer,
  paginas: number[],
  cortes: CortesDasVias = {}
): Promise<string> => {
  const { PDFDocument } = await import('pdf-lib');
  const origem = await PDFDocument.load(dados, { ignoreEncryption: true });
  const novo = await PDFDocument.create();
  const copiadas = await novo.copyPages(
    origem,
    paginas.map((p) => p - 1)
  );
  copiadas.forEach((pagina, i) => {
    const corte = cortes[paginas[i]];
    if (corte != null) {
      const { x, y, width, height } = pagina.getMediaBox();
      const topo = y + height;
      if (corte > y && corte < topo) {
        pagina.setMediaBox(x, corte, width, topo - corte);
        pagina.setCropBox(x, corte, width, topo - corte);
      }
    }
    novo.addPage(pagina);
  });
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
  /** De `lerPaginasDoPdf`: sem ele, cada página sai inteira. */
  cortes?: CortesDasVias;
  nomeDe: (colaboradorId: string) => string;
  aoAvancar?: (feitos: number, total: number) => void;
}): Promise<ResultadoDaCarga> => {
  const pessoas = Object.entries(dados.grupos).filter(([, paginas]) => paginas.length > 0);
  const resultado: ResultadoDaCarga = { publicados: 0, falhas: [] };
  // Os publicados, para um aviso só no fim — e não quarenta pedidos no meio do envio
  const avisar: string[] = [];

  for (let i = 0; i < pessoas.length; i++) {
    const [colaboradorId, paginas] = pessoas[i];
    try {
      const conteudo = await separarPaginas(dados.arquivo, paginas, dados.cortes);
      const nome = dados.nomeDe(colaboradorId).replace(/[^\p{L}\p{N} ]+/gu, '').trim();
      const res = await salvarHolerite({
        colaboradorId,
        competencia: dados.competencia,
        conteudo,
        arquivoNome: `Holerite ${dados.competencia} - ${nome}.pdf`,
        avisar: false,
      });
      if (res.sucesso && res.id) avisar.push(res.id);
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

  pedirAvisoDeDocumentoRh('holerite', avisar);
  return resultado;
};
