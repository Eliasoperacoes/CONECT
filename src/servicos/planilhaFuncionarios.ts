import * as XLSX from 'xlsx';
import {
  Colaborador,
  Loja,
  Setor,
  NivelHierarquico,
  SENHA_PADRAO_PRIMEIRO_ACESSO,
  NIVEL_COLABORADOR,
  NIVEL_LIDER_SETOR,
  NIVEL_GERENTE,
  NIVEL_DIRETORIA,
  NIVEL_TI,
  SETORES,
} from '../tipos';
import { loginEhValido, normalizarLogin, sugerirLoginValido } from './supabase';
import { cnpjEhValido, formatarCnpj } from './documentos';

export interface LinhaPlanilhaProcessada {
  indiceLinha: number;
  valida: boolean;
  erros: string[];
  avisos: string[];
  ehAtualizacao: boolean;
  dados: {
    nome: string;
    login: string;
    senha: string;
    cargo: string;
    loja: Loja;
    setor: Setor;
    nivel: NivelHierarquico;
    ramal?: string;
    telefone?: string;
    email?: string;
    matricula?: string;
    cnpj?: string;
    dataAdmissao?: string;
    observacoes?: string;
  };
}

export interface ResultadoProcessamentoPlanilha {
  nomeArquivo: string;
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: number;
  novosCadastros: number;
  atualizacoes: number;
  linhas: LinhaPlanilhaProcessada[];
}

const LOJAS_PADRAO: Record<string, Loja> = {
  pirassununga: 'Pirassununga',
  matriz: 'Pirassununga',
  'porto ferreira': 'Porto Ferreira',
  'porto': 'Porto Ferreira',
  palmeiras: 'Palmeiras',
  'santa cruz das palmeiras': 'Palmeiras',
  descalvado: 'Descalvado',
  'santa rita': 'Santa Rita',
  'sta rita': 'Santa Rita',
  'sta. rita': 'Santa Rita',
  'santa rita do passa quatro': 'Santa Rita',
  rede: 'Rede',
  geral: 'Rede',
  todas: 'Rede',
};

const SETORES_PADRAO: Record<string, Setor> = {
  balcao: 'Balcão',
  balcão: 'Balcão',
  vendas: 'Balcão',
  vendedor: 'Balcão',
  estoque: 'Estoque',
  almoxarifado: 'Estoque',
  deposito: 'Estoque',
  logistica: 'Logística',
  'logística': 'Logística',
  entrega: 'Logística',
  entregas: 'Logística',
  motoboy: 'Logística',
  expedicao: 'Logística',
  estagio: 'Estágio',
  estagiario: 'Estágio',
  estagiaria: 'Estágio',
  'estagiario(a)': 'Estágio',
  'estagiaria(o)': 'Estágio',
  aprendiz: 'Estágio',
  caixas: 'Caixas',
  caixa: 'Caixas',
  financeiro: 'Tesouraria',
  tesouraria: 'Tesouraria',
  compras: 'Compras',
  garantia: 'Garantia',
  callcenter: 'Callcenter',
  teleatendimento: 'Callcenter',
  ti: 'TI',
  informatica: 'TI',
  suporte: 'TI',
  diretoria: 'Diretoria',
  rh: 'RH',
  'recursos humanos': 'RH',
  pessoal: 'RH',
  dp: 'RH',
  gerencia: 'Diretoria',
};

function normalizarTexto(texto: any): string {
  if (texto === undefined || texto === null) return '';
  return String(texto).trim();
}

function normalizarChave(chave: string): string {
  return chave
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Passa as chaves do mapa pela mesma normaliza\u00e7\u00e3o usada na busca.
 *
 * Sem isto, qualquer nome composto falhava em sil\u00eancio: "Porto Ferreira"
 * virava "portoferreira" na busca, enquanto a chave cadastrada era
 * "porto ferreira" com espa\u00e7o. A loja n\u00e3o era encontrada e a pessoa ia
 * parar em Pirassununga.
 */
function comChavesNormalizadas<T>(mapa: Record<string, T>): Record<string, T> {
  const saida: Record<string, T> = {};
  for (const [chave, valor] of Object.entries(mapa)) {
    saida[normalizarChave(chave)] = valor;
  }
  return saida;
}

/**
 * Níveis aceitos na planilha, por correspondência EXATA.
 *
 * Antes a busca era por trecho contido, e isso escondia uma armadilha séria:
 * "Administrativo" contém "admin" e contém "ti" — quem escrevesse o cargo na
 * coluna de nível viraria TI, o nível mais alto, sem nenhum aviso. Um erro de
 * preenchimento não pode virar acesso total em silêncio.
 *
 * O preço é que grafia fora desta lista entra como Colaborador e a linha traz
 * um aviso na conferência. É o lado certo para errar.
 */
const NIVEIS_PADRAO: Record<string, NivelHierarquico> = {
  '1': 1,
  colaborador: 1,
  operador: 1,
  '2': 2,
  lider: 2,
  'lider de setor': 2,
  'liderdesetor': 2,
  supervisor: 2,
  '3': 3,
  gerente: 3,
  gestor: 3,
  '4': 4,
  diretoria: 4,
  diretor: 4,
  '5': 5,
  ti: 5,
  administrador: 5,
  'administrador geral': 5,
};

const NIVEIS_RECONHECIDOS = comChavesNormalizadas(NIVEIS_PADRAO);

/**
 * Lê o nível escrito na planilha. Devolve o aviso junto porque quem confere a
 * carga precisa ver o que o sistema NÃO entendeu — grafia fora da lista entra
 * como Colaborador, e entrar calado esconderia a linha de quem vai revisar.
 */
export function resolverNivelDaPlanilha(valor: string): {
  nivel: NivelHierarquico;
  aviso?: string;
} {
  const chave = normalizarChave(String(valor ?? ''));
  const reconhecido = NIVEIS_RECONHECIDOS[chave];

  if (reconhecido !== undefined) return { nivel: reconhecido };
  if (!chave) return { nivel: NIVEL_COLABORADOR };

  return {
    nivel: NIVEL_COLABORADOR,
    aviso:
      `Nível "${String(valor).trim()}" não é um dos cinco da rede — entra como Colaborador (1). ` +
      'Use o número ou o nome: Colaborador, Líder de Setor, Gerente, Diretoria, TI.',
  };
}

const LOJAS_RECONHECIDAS = comChavesNormalizadas(LOJAS_PADRAO);
const SETORES_RECONHECIDOS = comChavesNormalizadas(SETORES_PADRAO);

/**
 * Lê o setor escrito na planilha.
 *
 * Setor desconhecido NÃO vira Balcão em silêncio, como era antes. O estrago
 * passava do cadastro: é o setor que decide QUEM APROVA a jornada da pessoa.
 * Um motoboy caído em Balcão passa a depender do líder de Balcão, que não
 * responde por ele — e ninguém perceberia.
 *
 * Corrigir a planilha é uma substituição. Desfazer trinta cadastros no setor
 * errado, não.
 */
export function resolverSetorDaPlanilha(valor: string): {
  setor: Setor;
  erro?: string;
} {
  const chave = normalizarChave(String(valor ?? ''));
  const reconhecido = SETORES_RECONHECIDOS[chave];

  if (reconhecido) return { setor: reconhecido };

  return {
    setor: 'Balcão',
    erro: chave
      ? `Setor "${String(valor).trim()}" não existe na rede. Use um destes: ${SETORES.join(', ')}.`
      : `Setor não informado. Use um destes: ${SETORES.join(', ')}.`,
  };
}

/**
 * Gera e realiza o download da planilha modelo oficial do Excel (.xlsx)
 * com as colunas necessárias e linhas de exemplo realistas da Malachias Autopeças.
 */
export function baixarPlanilhaModeloExcel(): void {
  const wb = XLSX.utils.book_new();

  // Cabeçalhos claros e explicativos
  const cabecalhos = [
    'Nome Completo *',
    'Login de Acesso *',
    'Cargo / Função *',
    'Loja / Filial *',
    'Setor *',
    'Nível de Acesso (1 a 5) *',
    'Ramal',
    'Telefone / WhatsApp',
    'E-mail',
    'Matrícula',
    'CNPJ da Empresa',
    'Data de Admissão',
    'Observações',
  ];

  // Exemplos de preenchimento para orientar o gestor
  const linhasExemplo = [
    [
      'João Carlos da Silva',
      'joao.silva',
      'Balconista Especialista',
      'Pirassununga',
      'Balcão',
      1,
      '105',
      '(19) 99123-4567',
      'joao.silva@malachiasautopecas.com.br',
      'MAL-0105',
      '12.345.678/0001-90',
      '2023-03-10',
      'Vendedor peças pesadas linha diesel',
    ],
    [
      'Mariana de Oliveira',
      'mariana.oliveira',
      'Operadora de Caixa',
      'Porto Ferreira',
      'Caixas',
      1,
      '204',
      '(19) 99234-5678',
      'mariana.pf@malachiasautopecas.com.br',
      'MAL-0204',
      '98.765.432/0001-10',
      '2022-06-15',
      'Responsável abertura/fechamento caixa',
    ],
    [
      'Lucas Henrique Santos',
      'lucas.estoque',
      'Conferente de Estoque',
      'Palmeiras',
      'Estoque',
      1,
      '302',
      '(19) 99345-6789',
      'lucas.palmeiras@malachiasautopecas.com.br',
      'MAL-0302',
      '12.345.678/0002-71',
      '2024-01-10',
      'Conferência e triagem de mercadorias',
    ],
    [
      'Patrícia Mendes',
      'patricia.compras',
      'Supervisora de Compras',
      'Rede',
      'Compras',
      2,
      '106',
      '(19) 99456-7890',
      'patricia.compras@malachiasautopecas.com.br',
      'MAL-0106',
      '',
      '2021-11-20',
      'Supervisão de cotações com fornecedores',
    ],
    [
      'Roberto Almeida',
      'roberto.gerente',
      'Gerente de Loja',
      'Descalvado',
      'Balcão',
      3,
      '401',
      '(19) 99567-8901',
      'roberto.descalvado@malachiasautopecas.com.br',
      'MAL-0401',
      '12.345.678/0003-52',
      '2020-04-01',
      'Gestor da unidade Descalvado',
    ],
  ];

  const dadosAba1 = [cabecalhos, ...linhasExemplo];
  const ws1 = XLSX.utils.aoa_to_sheet(dadosAba1);

  // Ajuste de largura das colunas para legibilidade imediata no Excel
  ws1['!cols'] = [
    { wch: 28 }, // Nome Completo
    { wch: 20 }, // Login
    { wch: 26 }, // Cargo
    { wch: 18 }, // Loja
    { wch: 16 }, // Setor
    { wch: 24 }, // Nível
    { wch: 10 }, // Ramal
    { wch: 20 }, // Telefone
    { wch: 34 }, // Email
    { wch: 14 }, // Matricula
    { wch: 22 }, // CNPJ
    { wch: 16 }, // Admissão
    { wch: 38 }, // Observações
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Funcionários');

  // Aba 2: Guia de Referência e Regras para o Usuário
  const dadosGuia = [
    ['GUIA DE PREENCHIMENTO DA PLANILHA — REDE MALACHIAS AUTOPEÇAS', ''],
    ['', ''],
    ['CAMPO', 'REGRA / VALORES PERMITIDOS'],
    ['Nome Completo', 'Obrigatório. Nome e sobrenome do funcionário.'],
    ['Login de Acesso', 'Obrigatório e único na rede. Use apenas letras sem acento, números, ponto, hífen ou sublinhado. Sem espaços, sem cedilha e sem acento — ex: "joao.silva". Se ficar em branco, o sistema gera a partir do nome.'],
    ['Senha', `NÃO vai na planilha. Todo colaborador entra pela primeira vez com a senha padrão "${SENHA_PADRAO_PRIMEIRO_ACESSO}" e o sistema obriga a criar a senha dele em seguida.`],
    ['Cargo / Função', 'Obrigatório. A função da pessoa — NÃO define o nível de acesso, que vai na coluna própria. Cargos usados na rede: Administrativo, Balconista, Caixa, Comprador(a), Conferente, Estagiário(a), Estoquista, Motoboy, Operador(a) de Caixa, Telefonista, Vendedor(a). Outro cargo pode ser escrito à vontade.'],
    ['Loja / Filial', 'Obrigatório. Escolha uma das 5 unidades: Pirassununga, Porto Ferreira, Palmeiras, Descalvado, Santa Rita ou Rede.'],
    ['Setor', 'Obrigatório: Balcão, Estoque, Caixas, Compras, Garantia, Callcenter, Tesouraria, RH, Diretoria ou TI.'],
    ['Nível de Acesso', '1 = Colaborador/Operador (acesso básico às suas conversas e funções diárias)\n2 = Supervisor\n3 = Gestor da Unidade\n4 = Administrador Geral (Total acesso ao painel de controle).'],
    ['Ramal', 'Opcional. Número do ramal interno telefônico.'],
    ['Telefone / WhatsApp', 'Opcional. Contato direto do colaborador com DDD.'],
    ['E-mail', 'Opcional. E-mail corporativo ou pessoal do colaborador.'],
    ['Matrícula', 'Opcional. Código interno de RH/Matrícula do funcionário.'],
    ['CNPJ da Empresa', 'Opcional. CNPJ em que o colaborador está registrado. O grupo tem mais de um, e nem sempre é o da loja onde a pessoa trabalha — por isso o campo é da pessoa. Pode vir com ou sem pontuação. Se os dígitos não conferirem, a ficha entra sem o CNPJ e a linha traz um aviso.'],
    ['Data de Admissão', 'Opcional. Data de início na empresa (Ex: 2023-05-15 ou 15/05/2023).'],
    ['Observações', 'Opcional. Turno, especialidade ou notas cadastrais.'],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(dadosGuia);
  ws2['!cols'] = [{ wch: 30 }, { wch: 75 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Instruções e Lojas');

  // Disparo do download
  XLSX.writeFile(wb, 'modelo_importacao_funcionarios_malachias.xlsx');
}

/**
 * Baixa versão em formato CSV (.csv delimitado por ponto e vírgula)
 */
export function baixarPlanilhaModeloCSV(): void {
  const cabecalhos = [
    'Nome Completo',
    'Login de Acesso',
    'Cargo',
    'Loja',
    'Setor',
    'Nivel',
    'Ramal',
    'Telefone',
    'Email',
    'Matricula',
    'CNPJ',
    'Data Admissao',
    'Observacoes',
  ].join(';');

  const exemplo1 = [
    'João Carlos da Silva',
    'joao.silva',
    'Balconista Especialista',
    'Pirassununga',
    'Balcão',
    '1',
    '105',
    '(19) 99123-4567',
    'joao.silva@malachiasautopecas.com.br',
    'MAL-0105',
    '12.345.678/0001-90',
    '2023-03-10',
    'Vendedor peças pesadas linha diesel',
  ].join(';');

  const exemplo2 = [
    'Mariana de Oliveira',
    'mariana.oliveira',
    'Operadora de Caixa',
    'Porto Ferreira',
    'Caixas',
    '1',
    '204',
    '(19) 99234-5678',
    'mariana.pf@malachiasautopecas.com.br',
    'MAL-0204',
    '98.765.432/0001-10',
    '2022-06-15',
    'Responsável abertura/fechamento caixa',
  ].join(';');

  const conteudo = `${cabecalhos}\n${exemplo1}\n${exemplo2}\n`;
  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modelo_importacao_funcionarios_malachias.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Processa um arquivo enviado (.xlsx, .xls ou .csv) e retorna as linhas validadas
 */
export async function processarArquivoPlanilha(
  arquivo: File,
  colaboradoresAtuais: Colaborador[]
): Promise<ResultadoProcessamentoPlanilha> {
  const buffer = await arquivo.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const primeiraAba = workbook.SheetNames[0];
  if (!primeiraAba) {
    throw new Error('O arquivo de planilha enviado não possui abas de dados.');
  }

  const worksheet = workbook.Sheets[primeiraAba];
  const dadosBrutos: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  if (dadosBrutos.length === 0) {
    throw new Error('A planilha está vazia. Preencha ao menos uma linha de funcionário.');
  }

  // Mapa de logins existentes
  const loginsExistentes = new Set(
    colaboradoresAtuais.map((c) => (c.login ? c.login.toLowerCase().trim() : ''))
  );

  const linhasProcessadas: LinhaPlanilhaProcessada[] = [];

  // Logins já vistos nesta planilha, para apontar repetição entre as linhas
  const loginsVistos = new Map<string, number>();

  dadosBrutos.forEach((linhaOriginal, index) => {
    const numeroLinha = index + 2; // +1 do cabeçalho, +1 porque o Excel conta de 1
    // Normalizar chaves dos cabeçalhos para aceitar variações comuns
    const mapaValores: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(linhaOriginal)) {
      const normalizada = normalizarChave(chave);
      mapaValores[normalizada] = normalizarTexto(valor);
    }

    // Extrair campos aceitando múltiplos sinônimos
    const nome =
      mapaValores['nomecompleto'] ||
      mapaValores['nome'] ||
      mapaValores['funcionario'] ||
      mapaValores['colaborador'] ||
      '';

    let login =
      mapaValores['logindeacesso'] ||
      mapaValores['login'] ||
      mapaValores['usuario'] ||
      mapaValores['user'] ||
      '';

    const senha = mapaValores['senhainicial'] || mapaValores['senha'] || SENHA_PADRAO_PRIMEIRO_ACESSO;

    const cargo =
      mapaValores['cargofuncao'] ||
      mapaValores['cargo'] ||
      mapaValores['funcao'] ||
      mapaValores['ocupacao'] ||
      '';

    const lojaBruta =
      mapaValores['lojafilial'] ||
      mapaValores['loja'] ||
      mapaValores['filial'] ||
      mapaValores['unidade'] ||
      '';

    const setorBruto =
      mapaValores['setor'] ||
      mapaValores['departamento'] ||
      mapaValores['area'] ||
      '';

    // A grafia antiga "(1 a 4)" continua aceita: planilhas já preenchidas
    // com o cabeçalho anterior não podem parar de funcionar por causa disso.
    const nivelBruto =
      mapaValores['niveldeacesso1a5'] ||
      mapaValores['niveldeacesso1a4'] ||
      mapaValores['niveldeacesso'] ||
      mapaValores['nivel'] ||
      mapaValores['hierarquia'] ||
      '1';

    const ramal = mapaValores['ramal'] || '';
    const telefone = mapaValores['telefonewhatsapp'] || mapaValores['telefone'] || mapaValores['whatsapp'] || mapaValores['celular'] || '';
    const email = mapaValores['email'] || mapaValores['correio'] || '';
    const matricula = mapaValores['matricula'] || mapaValores['codigo'] || mapaValores['re'] || '';
    const cnpjBruto =
      mapaValores['cnpjdaempresa'] ||
      mapaValores['cnpj'] ||
      mapaValores['empresa'] ||
      mapaValores['cnpjempregador'] ||
      '';
    const dataAdmissao = mapaValores['datadeadmissao'] || mapaValores['dataadmissao'] || mapaValores['admissao'] || '';
    const observacoes = mapaValores['observacoes'] || mapaValores['observacao'] || mapaValores['obs'] || '';

    // Se a linha for totalmente vazia, ignora
    if (!nome && !login && !cargo && !lojaBruta) {
      return;
    }

    const erros: string[] = [];
    const avisos: string[] = [];

    // Validação de Nome
    if (!nome) {
      erros.push('Nome Completo é obrigatório');
    }

    // Auto-geração de login se não fornecido
    if (!login && nome) {
      const partes = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/);
      if (partes.length >= 2) {
        login = `${partes[0]}.${partes[partes.length - 1]}`;
      } else {
        login = partes[0];
      }
      avisos.push(`Login gerado automaticamente: "${login}"`);
    }

    // O login vira o endereço usado pela autenticação. Acento, espaço e
    // símbolos seriam removidos nessa conversão, e dois logins diferentes
    // poderiam virar o mesmo acesso — por isso são recusados aqui.
    if (login && !loginEhValido(login)) {
      const sugestao = sugerirLoginValido(login);
      erros.push(
        `Login "${login}" tem caracteres não aceitos. Use letras sem acento, ` +
          `números, ponto, hífen ou sublinhado` +
          (sugestao ? ` — sugestão: "${sugestao}"` : '')
      );
    }

    login = normalizarLogin(login);

    // Login repetido dentro da própria planilha: o segundo sobrescreveria o
    // primeiro em silêncio e uma das pessoas ficaria sem acesso.
    if (login) {
      const linhaAnterior = loginsVistos.get(login);
      if (linhaAnterior !== undefined) {
        erros.push(`Login "${login}" repetido na planilha (linha ${linhaAnterior}).`);
      } else {
        loginsVistos.set(login, numeroLinha);
      }
    }

    // Validação de Loja
    let lojaResolvida: Loja = 'Pirassununga';
    const lojaChave = normalizarChave(lojaBruta);
    if (LOJAS_RECONHECIDAS[lojaChave]) {
      lojaResolvida = LOJAS_RECONHECIDAS[lojaChave];
    } else if (lojaBruta) {
      avisos.push(`Loja "${lojaBruta}" não reconhecida. Ajustada para Pirassununga (Matriz).`);
    } else {
      avisos.push('Loja não informada. Definida como Pirassununga (Matriz).');
    }

    /**
     * Setor.
     *
     * Setor desconhecido NÃO vira Balcão em silêncio. Isso mandava gente para
     * o setor errado sem ninguém perceber — e o estrago passa do cadastro: é
     * o setor que decide QUEM APROVA a jornada da pessoa. Um motoboy caído em
     * Balcão passa a depender do líder de Balcão, que não responde por ele.
     *
     * Por isso a linha falha em vez de entrar torta. Corrigir a planilha é
     * uma substituição; desfazer 30 cadastros no setor errado, não.
     */
    const setorLido = resolverSetorDaPlanilha(setorBruto);
    const setorResolvido = setorLido.setor;
    if (setorLido.erro) erros.push(setorLido.erro);

    /**
     * Nível hierárquico da planilha.
     *
     * Aceita o número e também o nome, porque quem preenche a planilha
     * escreve "Gerente", não "3". A ordem de teste vai do mais alto para o
     * mais baixo: "líder de setor" contém "setor", e "diretoria" contém
     * "diretor" — testar do menor para o maior classificaria errado.
     */
    const nivelLido = resolverNivelDaPlanilha(String(nivelBruto));
    const nivelResolvido = nivelLido.nivel;
    if (nivelLido.aviso) avisos.push(nivelLido.aviso);

    /**
     * CNPJ é opcional — planilhas antigas não têm a coluna e continuam
     * valendo. Mas quando vem preenchido, os dígitos são conferidos: número
     * trocado passa despercebido na tela e só aparece meses depois, num
     * documento trabalhista.
     */
    let cnpj = '';
    if (cnpjBruto.trim()) {
      if (cnpjEhValido(cnpjBruto)) {
        cnpj = formatarCnpj(cnpjBruto);
      } else {
        avisos.push(
          `CNPJ "${cnpjBruto}" não confere nos dígitos verificadores — a ficha entra sem ele.`
        );
      }
    }

    const ehAtualizacao = loginsExistentes.has(login.toLowerCase().trim());

    linhasProcessadas.push({
      indiceLinha: index + 2, // 1-based + 1 pelo cabeçalho
      valida: erros.length === 0,
      erros,
      avisos,
      ehAtualizacao,
      dados: {
        nome,
        login,
        senha: senha || SENHA_PADRAO_PRIMEIRO_ACESSO,
        cargo: cargo || 'Colaborador',
        loja: lojaResolvida,
        setor: setorResolvido,
        nivel: nivelResolvido,
        ramal,
        telefone,
        email,
        matricula,
        cnpj,
        dataAdmissao,
        observacoes,
      },
    });
  });

  const linhasValidas = linhasProcessadas.filter((l) => l.valida).length;
  const linhasComErro = linhasProcessadas.length - linhasValidas;
  const novosCadastros = linhasProcessadas.filter((l) => l.valida && !l.ehAtualizacao).length;
  const atualizacoes = linhasProcessadas.filter((l) => l.valida && l.ehAtualizacao).length;

  return {
    nomeArquivo: arquivo.name,
    totalLinhas: linhasProcessadas.length,
    linhasValidas,
    linhasComErro,
    novosCadastros,
    atualizacoes,
    linhas: linhasProcessadas,
  };
}
