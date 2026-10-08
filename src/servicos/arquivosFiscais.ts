/**
 * OS ARQUIVOS FISCAIS DO PONTO — o AFD que o RH baixa e entrega à
 * fiscalização (Portaria 671/2021, art. 81, § 2º: "prontamente gerado e
 * entregue, quando solicitado pelo Auditor-Fiscal do Trabalho").
 *
 * O CONTEÚDO É TODO DO BANCO (`gerar_afd`): as mesmas funções que calculam
 * o hash da marcação montam o arquivo. Aqui só se transforma as linhas em
 * bytes do jeito que o leiaute pede:
 *
 *   · ISO 8859-1, um byte por caractere (o banco já trocou por "?" o que a
 *     tabela não tem);
 *   · cada linha termina com os caracteres 13 e 10 (CRLF), inclusive a
 *     última — "cada linha corresponde a um registro, terminando com...";
 *   · o nome é "AFD" + número do INPI + CNPJ do empregador + "REP_P", e sai
 *     do próprio cabeçalho, sem uma segunda fonte para o mesmo dado.
 */
import { nuvem } from './nuvem';

/** O arquivo em bytes: ISO 8859-1, CRLF ao fim de cada registro. */
export const bytesDoArquivo = (linhas: string[]): Uint8Array => {
  const texto = linhas.map((l) => `${l}\r\n`).join('');
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    // Fora do ISO 8859-1 vira "?" — o banco já faz isso; aqui é a segunda trava
    bytes[i] = codigo <= 0xff ? codigo : 0x3f;
  }
  return bytes;
};

/**
 * "AFD" + INPI + CNPJ + "REP_P", do cabeçalho (posições 190-206 e 12-25).
 * Sem o registro no INPI ainda, o nome sai sem ele — e o arquivo também.
 */
export const nomeDoAfd = (cabecalho: string): string => {
  const cnpj = cabecalho.slice(11, 25).trim();
  const inpi = cabecalho.slice(189, 206).trim().replace(/^0+(?=\d)/, '');
  return `AFD${inpi}${cnpj}REP_P.txt`;
};

/** Gera o AFD do estabelecimento no período, pronto para baixar. */
export const gerarArquivoAfd = async (
  cnpj: string,
  inicio: string,
  fim: string
): Promise<{ sucesso: true; bytes: Uint8Array; nome: string; marcacoes: number; semInpi: boolean } | { sucesso: false; erro: string }> => {
  const res = await nuvem.gerarAfd(cnpj, inicio, fim);
  if (!res.sucesso || !res.linhas || res.linhas.length === 0) {
    return { sucesso: false, erro: res.erro || 'O banco não devolveu o arquivo.' };
  }
  const [cabecalho] = res.linhas;
  const trailer = res.linhas[res.linhas.length - 2] || '';
  return {
    sucesso: true,
    bytes: bytesDoArquivo(res.linhas),
    nome: nomeDoAfd(cabecalho),
    // Campo 7 do trailer (posições 055-063): quantos registros tipo "7"
    marcacoes: Number(trailer.slice(54, 63)) || 0,
    semInpi: cabecalho.slice(189, 206).trim() === '',
  };
};
