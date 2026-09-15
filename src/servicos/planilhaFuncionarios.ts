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
} from '../tipos';
import { loginEhValido, normalizarLogin, sugerirLoginValido } from './supabase';

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

const LOJAS_RECONHECIDAS = comChavesNormalizadas(LOJAS_PADRAO);
const SETORES_RECONHECIDOS = comChavesNormalizadas(SETORES_PADRAO);

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
    'Nível de Acesso (1 a 4) *',
    'Ramal',
    'Telefone / WhatsApp',
    'E-mail',
    'Matrícula',
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
    ['Cargo / Função', 'Obrigatório. Cargo da função (ex: Balconista, Gerente, Estoquista, Caixa).'],
    ['Loja / Filial', 'Obrigatório. Escolha uma das 5 unidades: Pirassununga, Porto Ferreira, Palmeiras, Descalvado, Santa Rita ou Rede.'],
    ['Setor', 'Obrigatório: Balcão, Estoque, Caixas, Compras, Garantia, Callcenter, Tesouraria, RH, Diretoria ou TI.'],
    ['Nível de Acesso', '1 = Colaborador/Operador (acesso básico às suas conversas e funções diárias)\n2 = Supervisor\n3 = Gestor da Unidade\n4 = Administrador Geral (Total acesso ao painel de controle).'],
    ['Ramal', 'Opcional. Número do ramal interno telefônico.'],
    ['Telefone / WhatsApp', 'Opcional. Contato direto do colaborador com DDD.'],
    ['E-mail', 'Opcional. E-mail corporativo ou pessoal do colaborador.'],
    ['Matrícula', 'Opcional. Código interno de RH/Matrícula do funcionário.'],
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
    'Data Admissao',
    'Observacoes',
  ].join(';');

  const exemplo1 = [
    'João Carlos da Silva',
    'joao.silva',
    '123',
    'Balconista Especialista',
    'Pirassununga',
    'Balcão',
    '1',
    '105',
    '(19) 99123-4567',
    'joao.silva@malachiasautopecas.com.br',
    'MAL-0105',
    '2023-03-10',
    'Vendedor peças pesadas linha diesel',
  ].join(';');

  const exemplo2 = [
    'Mariana de Oliveira',
    'mariana.oliveira',
    '123',
    'Operadora de Caixa',
    'Porto Ferreira',
    'Caixas',
    '1',
    '204',
    '(19) 99234-5678',
    'mariana.pf@malachiasautopecas.com.br',
    'MAL-0204',
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

    const nivelBruto =
      mapaValores['niveldeacesso1a4'] ||
      mapaValores['niveldeacesso'] ||
      mapaValores['nivel'] ||
      mapaValores['hierarquia'] ||
      '1';

    const ramal = mapaValores['ramal'] || '';
    const telefone = mapaValores['telefonewhatsapp'] || mapaValores['telefone'] || mapaValores['whatsapp'] || mapaValores['celular'] || '';
    const email = mapaValores['email'] || mapaValores['correio'] || '';
    const matricula = mapaValores['matricula'] || mapaValores['codigo'] || mapaValores['re'] || '';
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

    // Validação de Setor
    let setorResolvido: Setor = 'Balcão';
    const setorChave = normalizarChave(setorBruto);
    if (SETORES_RECONHECIDOS[setorChave]) {
      setorResolvido = SETORES_RECONHECIDOS[setorChave];
    } else if (setorBruto) {
      avisos.push(`Setor "${setorBruto}" ajustado para "Balcão".`);
    }

    /**
     * Nível hierárquico da planilha.
     *
     * Aceita o número e também o nome, porque quem preenche a planilha
     * escreve "Gerente", não "3". A ordem de teste vai do mais alto para o
     * mais baixo: "líder de setor" contém "setor", e "diretoria" contém
     * "diretor" — testar do menor para o maior classificaria errado.
     */
    let nivelResolvido: NivelHierarquico = NIVEL_COLABORADOR;
    const nivelNorm = String(nivelBruto).toLowerCase().trim();

    if (nivelNorm === '5' || nivelNorm.includes('ti') || nivelNorm.includes('admin')) {
      nivelResolvido = NIVEL_TI;
    } else if (nivelNorm === '4' || nivelNorm.includes('diretor')) {
      nivelResolvido = NIVEL_DIRETORIA;
    } else if (nivelNorm === '3' || nivelNorm.includes('gerente') || nivelNorm.includes('gestor')) {
      nivelResolvido = NIVEL_GERENTE;
    } else if (
      nivelNorm === '2' ||
      nivelNorm.includes('lider') ||
      nivelNorm.includes('líder') ||
      nivelNorm.includes('supervisor')
    ) {
      nivelResolvido = NIVEL_LIDER_SETOR;
    } else {
      nivelResolvido = NIVEL_COLABORADOR;
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
