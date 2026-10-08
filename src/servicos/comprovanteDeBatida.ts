/**
 * O COMPROVANTE DE CADA BATIDA — Portaria MTP 671/2021.
 *
 * Pedido do Elias (06/10/2026): para cada batida, o trabalhador recebe o
 * comprovante em meio eletrônico, com NSR, empregador (CNPJ), trabalhador
 * (CPF), data, hora e código de verificação, e pode baixar ou compartilhar.
 *
 * O carimbo não é feito aqui: o banco o grava na hora da batida
 * (`carimbar_batida`, cpf-e-comprovante.sql) e não o deixa mudar, nem por
 * correção. Este arquivo só monta o documento com o que o banco gravou —
 * a hora é a REGISTRADA, e não a corrigida.
 */
import type { RegistroPonto } from '../tipos';
import { ROTULO_MARCACAO } from '../tipos';
import { formatarCpf } from './cpf';
import { comprovanteDaOriginal, type LinhaMarcacaoOriginal } from './linhasDoBanco';

/**
 * O nome do empregador quando a razão social do CNPJ não chegou (modo
 * local, ou a lista de estabelecimentos ainda não carregou). Com ela, vale
 * a razão social — são dois CNPJs, e cada batida é de um deles.
 */
export const EMPREGADOR = 'Malachias Autopeças';

/** O título que o art. 79, I, manda escrever, letra por letra. */
export const TITULO_DO_COMPROVANTE = 'Comprovante de Registro de Ponto do Trabalhador';

/** Quem é o REP-P e de quem é a batida — o que não vem na linha do registro. */
export interface IdentificacaoDoRep {
  /** A razão social do CNPJ da batida (`estabelecimentos`). */
  razaoSocial?: string;
  /** O registro no INPI, só dígitos; vazio até sair. */
  inpi?: string | null;
}

/**
 * TEM COMPROVANTE quem BATEU: QR ou código digitado, e com o carimbo do
 * banco. Correção e preenchimento não são batida do trabalhador — saem no
 * espelho, com quem corrigiu e o motivo, e não aqui.
 */
export const temComprovante = (r: RegistroPonto): boolean =>
  (r.metodo === 'qrcode' || r.metodo === 'codigo_manual') && r.nsr != null && !!r.codigoVerificacao && !!r.registradoEm;

/** "12345678000190" → "12.345.678/0001-90". */
export const formatarCnpj = (texto?: string): string => {
  const d = (texto || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
};

/**
 * O código em blocos de quatro, para ler e conferir em voz alta — com as
 * letras COMO ESTÃO GRAVADAS no AFD. Passar para maiúsculas mostraria ao
 * trabalhador um texto que não é o do arquivo, e a caixa do hexadecimal é
 * justamente a pergunta em aberto no Ministério.
 */
export const codigoEmBlocos = (codigo: string): string => (codigo.match(/.{1,4}/g) || []).join(' ');

export interface DadosDoComprovante {
  nsr: string;
  empregador: string;
  /** Registro do REP-P no INPI (art. 79, VII); vazio até sair. */
  inpi: string;
  /** Vazio quando a ficha não tem o CNPJ do empregador. */
  cnpj: string;
  local: string;
  trabalhador: string;
  /** Vazio enquanto a pessoa não informou o CPF. */
  cpf: string;
  data: string;
  hora: string;
  marcacao: string;
  forma: string;
  codigo: string;
}

/** O NSR com nove dígitos, como nos arquivos do ponto: 42 → "000000042". */
const nsrFormatado = (nsr: number) => String(nsr).padStart(9, '0');

export const montarComprovante = (
  r: RegistroPonto,
  pessoa: { nome: string; cpf?: string | null },
  rep: IdentificacaoDoRep = {}
): DadosDoComprovante => {
  const quando = new Date(r.registradoEm || r.horario);
  return {
    nsr: nsrFormatado(r.nsr || 0),
    empregador: rep.razaoSocial || EMPREGADOR,
    inpi: (rep.inpi || '').replace(/\D/g, ''),
    cnpj: formatarCnpj(r.cnpjEmpregador),
    local: `Loja ${r.loja}`,
    trabalhador: pessoa.nome,
    cpf: pessoa.cpf ? formatarCpf(pessoa.cpf) : '',
    data: quando.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    hora: quando.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    // A fora da jornada não ocupou nenhuma das quatro: é "marcação", e o RH trata
    marcacao: r.foraDaJornada ? 'Marcação fora da jornada' : ROTULO_MARCACAO[r.tipo],
    forma: r.metodo === 'qrcode' ? 'QR da loja' : 'Código da loja digitado',
    codigo: (r.codigoVerificacao || '').toLowerCase(),
  };
};

/** "Comprovante de ponto 06-10-2026 07h31 NSR 000000042.pdf" */
export const nomeDoArquivo = (d: DadosDoComprovante): string =>
  `Comprovante de ponto ${d.data.replace(/\//g, '-')} ${d.hora.slice(0, 5).replace(':', 'h')} NSR ${d.nsr}.pdf`;

/** As linhas do comprovante, na ordem em que se leem — a tela e o PDF usam as mesmas. */
export const linhasDoComprovante = (d: DadosDoComprovante): Array<[string, string]> => [
  ['NSR', d.nsr],
  ['Empregador', d.empregador],
  ['CNPJ', d.cnpj || 'Não informado na ficha'],
  ['Local', d.local],
  ['Trabalhador', d.trabalhador],
  ['CPF', d.cpf || 'Não informado'],
  ['Data', d.data],
  ['Hora', d.hora],
  ['Marcação', d.marcacao],
  ['Registro', d.forma],
  ['REP-P (INPI)', d.inpi || 'Não informado (registro em andamento)'],
];

/** O comprovante em PDF, do tamanho de um recibo. */
export const gerarPdfDoComprovante = async (d: DadosDoComprovante): Promise<Uint8Array> => {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${TITULO_DO_COMPROVANTE} · NSR ${d.nsr}`);
  pdf.setAuthor(EMPREGADOR);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const largura = 300;
  const linhas = linhasDoComprovante(d);
  const altura = 150 + linhas.length * 22 + 45;
  const pagina = pdf.addPage([largura, altura]);
  const cinza = rgb(0.42, 0.45, 0.5);
  const tinta = rgb(0.08, 0.1, 0.13);
  const marca = rgb(0.192, 0.357, 0.667); // #315BAA

  let y = altura - 36;
  // O título do art. 79, I, em duas linhas só porque o recibo é estreito
  pagina.drawText('Comprovante de Registro de Ponto', { x: 20, y, size: 12, font: negrito, color: marca });
  y -= 15;
  pagina.drawText('do Trabalhador', { x: 20, y, size: 12, font: negrito, color: marca });
  y -= 14;
  pagina.drawText('Portaria MTP nº 671/2021', { x: 20, y, size: 8, font: fonte, color: cinza });
  y -= 14;
  pagina.drawLine({ start: { x: 20, y }, end: { x: largura - 20, y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
  y -= 22;

  for (const [rotulo, valor] of linhas) {
    pagina.drawText(rotulo.toUpperCase(), { x: 20, y, size: 7, font: negrito, color: cinza });
    pagina.drawText(valor, { x: 100, y, size: 10, font: rotulo === 'NSR' ? negrito : fonte, color: tinta });
    y -= 22;
  }

  y -= 4;
  pagina.drawText('CÓDIGO HASH DA MARCAÇÃO (SHA-256)', { x: 20, y, size: 7, font: negrito, color: cinza });
  y -= 14;
  pagina.drawText(d.codigo.slice(0, 32), { x: 20, y, size: 9, font: mono, color: tinta });
  y -= 12;
  pagina.drawText(d.codigo.slice(32), { x: 20, y, size: 9, font: mono, color: tinta });
  y -= 22;
  pagina.drawText('Gerado pelo CONECTA a partir do registro gravado no momento da batida.', {
    x: 20,
    y,
    size: 6.5,
    font: fonte,
    color: cinza,
  });

  return pdf.save();
};

/**
 * QUANTOS DIAS DE COMPROVANTE O TRABALHADOR BAIXA A QUALQUER HORA.
 *
 * O art. 80, III, pede "no mínimo" as últimas quarenta e oito horas. Sete
 * dias cobrem o fim de semana inteiro de quem só olha na segunda.
 */
export const DIAS_DOS_COMPROVANTES = 7;

/**
 * OS COMPROVANTES QUE A PESSOA BAIXA — das ORIGINAIS, e não das batidas
 * do espelho. A batida corrigida pelo RH deixa de ser "batida" no
 * espelho, mas a marcação que a pessoa fez continua existindo, e o
 * comprovante é dela; a fora da jornada nunca esteve no espelho. Da mais
 * nova para a mais antiga, só a janela de `DIAS_DOS_COMPROVANTES`.
 */
export const comprovantesRecentes = (
  originais: LinhaMarcacaoOriginal[],
  agora: Date,
  dias = DIAS_DOS_COMPROVANTES
): RegistroPonto[] => {
  const desde = agora.getTime() - dias * 24 * 60 * 60 * 1000;
  return originais
    .filter((o) => new Date(o.registrado_em).getTime() >= desde)
    .sort((a, b) => b.registrado_em.localeCompare(a.registrado_em))
    .map(comprovanteDaOriginal);
};

/**
 * O TEXTO DO AVISO "COMPROVANTE DE BATIDA" (Elias, 07/10/2026): o que o
 * celular mostra na barra logo depois de cada batida. Sai daqui, dos
 * mesmos dados do PDF, para o aviso e o documento nunca dizerem coisas
 * diferentes. Sem concordar com a marcação: "Saída" e "Retorno" pediriam
 * gêneros.
 */
export const textoDoAvisoDoComprovante = (d: DadosDoComprovante): string =>
  `${d.marcacao} · ${d.data} às ${d.hora.slice(0, 5)} · NSR ${d.nsr}. Toque para ver o comprovante.`;
