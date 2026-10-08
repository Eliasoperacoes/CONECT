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
import { bancoDados } from './bancoDados';
import { batePonto, servicoPonto } from './ponto';
import { agora } from './relogio';
import { soDigitos } from './estabelecimentos';
import { montarAej, type OriginalDoAej } from './arquivoEletronicoDeJornada';
import type { Colaborador, MotivoForaDaJornada, TipoMarcacao } from '../tipos';

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

/**
 * Quem entra no AEJ deste CNPJ: quem é registrado nele e bate ponto, e
 * quem tem original nele no período — a ficha pode ter mudado de CNPJ, e
 * a marcação feita no outro não some do arquivo. Sem CPF não há vínculo
 * no leiaute: essas pessoas voltam à parte, para a tela dizer quem são.
 */
export const vinculosDoAej = (
  cnpj: string,
  colaboradores: Colaborador[],
  bateOPonto: (c: Colaborador) => boolean,
  comOriginal: Set<string>,
  cpfs: Map<string, string>
): { comCpf: Array<{ colaborador: Colaborador; cpf: string }>; semCpf: Colaborador[] } => {
  const comCpf: Array<{ colaborador: Colaborador; cpf: string }> = [];
  const semCpf: Colaborador[] = [];
  for (const c of colaboradores) {
    const doCnpj = soDigitos(c.cnpj) === cnpj && c.ativo !== false && bateOPonto(c);
    if (!doCnpj && !comOriginal.has(c.id)) continue;
    const cpf = soDigitos(cpfs.get(c.id));
    if (cpf.length === 11) comCpf.push({ colaborador: c, cpf });
    else semCpf.push(c);
  }
  return { comCpf, semCpf };
};

/** "AEJ_" + CNPJ + período: o leiaute não dá nome ao arquivo, e este diz o que ele é. */
export const nomeDoAej = (cnpj: string, inicio: string, fim: string): string => `AEJ_${cnpj}_${inicio}_${fim}.txt`;

/**
 * Gera o AEJ do estabelecimento no período. As batidas vêm do cache do
 * ponto, alargado para cobrir o período — o mesmo que o espelho imprime.
 */
export const gerarArquivoAej = async (
  cnpj: string,
  inicio: string,
  fim: string
): Promise<
  | { sucesso: true; bytes: Uint8Array; nome: string; vinculos: number; marcacoes: number; semCpf: string[]; semInpi: boolean }
  | { sucesso: false; erro: string }
> => {
  const [estabelecimentos, dados] = await Promise.all([nuvem.listarEstabelecimentos(), nuvem.dadosDoAej(cnpj, inicio, fim)]);
  const estabelecimento = estabelecimentos.find((e) => e.cnpj === cnpj);
  if (!estabelecimento) return { sucesso: false, erro: 'Este CNPJ não é um estabelecimento cadastrado.' };
  if (!dados.sucesso) return dados;
  const id = dados.identificacao;
  if (!id) return { sucesso: false, erro: 'Falta a identificação do programa (identificacao-do-rep.sql).' };

  // A falta do espelho depende da ausência aprovada e do feriado: lidos de
  // novo, e sem eles o arquivo não sai — atestado virando falta é pior que
  // arquivo nenhum
  const [, ausencias, feriados] = await Promise.all([
    servicoPonto.garantirBatidasDoPeriodo(inicio, fim),
    nuvem.sincronizarJustificativas(),
    nuvem.sincronizarFeriados(),
  ]);
  if (!ausencias || !feriados) {
    return { sucesso: false, erro: 'Não deu para ler as ausências e os feriados. Tente de novo.' };
  }

  const tratamentoDe = new Map(dados.tratamentos.map((t) => [Number(t.nsr), t]));
  const originaisDe = new Map<string, OriginalDoAej[]>();
  for (const o of dados.originais) {
    const t = tratamentoDe.get(Number(o.nsr));
    const lista = originaisDe.get(o.colaborador_id) || [];
    lista.push({
      nsr: Number(o.nsr),
      registradoEm: o.registrado_em,
      data: o.data,
      registroId: o.registro_id,
      tipoPedido: (o.tipo_pedido as TipoMarcacao) || null,
      foraDaJornada: (o.fora_da_jornada as MotivoForaDaJornada) || null,
      tratamento: t ? { decisao: t.decisao, registroId: t.registro_id, justificativa: t.justificativa } : undefined,
    });
    originaisDe.set(o.colaborador_id, lista);
  }

  const { comCpf, semCpf } = vinculosDoAej(
    cnpj,
    bancoDados.obterColaboradores(),
    batePonto,
    new Set(originaisDe.keys()),
    new Map(dados.cpfs.map((c) => [c.colaborador_id, c.cpf]))
  );

  const linhas = montarAej({
    cnpj,
    razaoSocial: estabelecimento.razao_social,
    inicio,
    fim,
    geradoEm: agora().toISOString(),
    inpi: id.inpi || '',
    programa: { nome: id.programa_nome, versao: id.programa_versao },
    desenvolvedor: {
      tipo: id.desenvolvedor_tipo,
      documento: id.desenvolvedor_documento,
      nome: id.desenvolvedor_nome,
      email: id.desenvolvedor_email || '',
    },
    vinculos: comCpf.map(({ colaborador, cpf }) => ({
      colaborador,
      cpf,
      dias: servicoPonto.diasParaOAej(colaborador.id, inicio, fim),
      originais: originaisDe.get(colaborador.id) || [],
      ajustes: servicoPonto.obterAjustesDoColaborador(colaborador.id),
    })),
  });

  return {
    sucesso: true,
    bytes: bytesDoArquivo(linhas),
    nome: nomeDoAej(cnpj, inicio, fim),
    vinculos: comCpf.length,
    marcacoes: linhas.filter((l) => l.startsWith('05|')).length,
    semCpf: semCpf.map((c) => c.nome),
    semInpi: !id.inpi,
  };
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
