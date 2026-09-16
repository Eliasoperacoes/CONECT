/**
 * Ficha do colaborador — CONECTA
 *
 * Fonte única dos dados individuais de uma pessoa.
 *
 * O motivo de existir: cada tela montava a sua própria lista de campos, e
 * quando o CNPJ entrou no cadastro ele apareceu só no formulário. O espelho
 * de ponto, o quadro de equipe e a fila de aprovação continuaram mostrando
 * nome e cargo, como sempre. Campo novo = campo esquecido em quatro lugares.
 *
 * Aqui é o lugar onde se decide O QUE é a ficha. Quem precisa dos dados
 * chama `montarFicha` e mostra; quem precisa de um bloco pronto para
 * documento chama `linhasDeIdentificacao`. Campo novo entra uma vez só.
 */
import { Colaborador, ROTULO_NIVEL } from '../tipos';

export interface CampoDaFicha {
  /** Chave estável — serve de `key` no React e de coluna em exportação */
  chave: string;
  rotulo: string;
  /** Já formatado para leitura humana. Vazio quando não há dado. */
  valor: string;
  /** Dado de contato pessoal, para telas que queiram separar do funcional */
  sensivel?: boolean;
}

/** Data ISO (aaaa-mm-dd) para o formato que a rede lê. */
const paraDataBR = (iso?: string): string => {
  if (!iso) return '';
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
};

/** Minutos de jornada viram "8h" ou "7h30" — ninguém lê 450 minutos. */
export const formatarJornada = (minutos?: number): string => {
  if (!minutos || minutos <= 0) return '';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`;
};

/**
 * Todos os campos individuais, na ordem em que fazem sentido para quem lê.
 *
 * Por padrão devolve só o que está preenchido: uma ficha cheia de "—" não
 * informa nada. Com `incluirVazios`, devolve tudo — é o que o espelho de
 * ponto usa, porque num documento trabalhista o campo em branco também é
 * informação (mostra que falta cadastrar).
 */
export const montarFicha = (
  c: Colaborador,
  opcoes: { incluirVazios?: boolean } = {}
): CampoDaFicha[] => {
  const campos: CampoDaFicha[] = [
    { chave: 'nome', rotulo: 'Nome completo', valor: c.nome },
    { chave: 'matricula', rotulo: 'Matrícula', valor: c.matricula || '' },
    { chave: 'cnpj', rotulo: 'CNPJ do empregador', valor: c.cnpj || '' },
    { chave: 'cargo', rotulo: 'Cargo', valor: c.cargo },
    { chave: 'setor', rotulo: 'Setor', valor: c.setor },
    { chave: 'loja', rotulo: 'Loja', valor: c.loja },
    {
      chave: 'nivel',
      rotulo: 'Nível de acesso',
      valor: `N${c.nivel} · ${ROTULO_NIVEL[c.nivel] || 'Colaborador'}`,
    },
    { chave: 'admissao', rotulo: 'Admissão', valor: paraDataBR(c.dataAdmissao) },
    {
      chave: 'jornada',
      rotulo: 'Jornada diária',
      valor: formatarJornada(c.cargaHorariaDiariaMinutos),
    },
    { chave: 'ramal', rotulo: 'Ramal', valor: c.ramal || '' },
    { chave: 'telefone', rotulo: 'Telefone', valor: c.telefone || '', sensivel: true },
    { chave: 'email', rotulo: 'E-mail', valor: c.email || '', sensivel: true },
    { chave: 'login', rotulo: 'Login', valor: c.login },
  ];

  return opcoes.incluirVazios ? campos : campos.filter((campo) => campo.valor !== '');
};

/**
 * O cabeçalho de identificação de um documento (espelho de ponto, extrato,
 * holerite). Sempre com os vazios, e sempre com o mesmo conjunto: é o que
 * identifica a pessoa e o empregador contra quem a jornada corre.
 */
export const linhasDeIdentificacao = (c: Colaborador): CampoDaFicha[] => {
  const tudo = montarFicha(c, { incluirVazios: true });
  const daFicha = (chave: string): CampoDaFicha =>
    tudo.find((campo) => campo.chave === chave) || { chave, rotulo: chave, valor: '' };

  return [
    daFicha('nome'),
    daFicha('matricula'),
    daFicha('cnpj'),
    daFicha('cargo'),
    daFicha('setor'),
    daFicha('loja'),
    daFicha('admissao'),
    daFicha('jornada'),
  ];
};

/** Uma linha só, para cabeçalho de card: "Matrícula 1042 · Balcão · Pirassununga" */
export const resumoDaFicha = (c: Colaborador): string =>
  [c.matricula ? `Matrícula ${c.matricula}` : '', c.cargo, c.setor, c.loja]
    .filter(Boolean)
    .join(' · ');

/** Contato em uma linha, na ordem em que a rede procura a pessoa. */
export const contatoEmLinha = (c: Colaborador): string =>
  [c.ramal ? `Ramal ${c.ramal}` : '', c.telefone || '', c.email || '']
    .filter(Boolean)
    .join(' · ');
