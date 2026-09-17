/**
 * Verificação do acesso — CONECTA
 *
 * O que motivou: o gerente de Pirassununga tentou entrar e, em vez de
 * assumir a ficha dele (nível 3, loja, CNPJ, tudo vindo da planilha), nasceu
 * um SEGUNDO cadastro, nível 1, Balcão, em branco. A ficha boa ficou órfã.
 *
 * A causa não estava no aplicativo: a mesma função de banco
 * (`criar_colaborador_do_usuario`) existia em DOIS arquivos .sql com
 * comportamentos opostos — um adotava a ficha existente, o outro criava uma
 * nova. Em Postgres vale a última versão executada, e o arquivo errado foi
 * rodado por último, várias vezes.
 *
 * Teste não roda SQL, mas lê os arquivos. É o bastante para prender o que
 * de fato quebrou: duas definições da mesma função, e a versão que cria
 * ficha em vez de adotar.
 */
import { test, expect } from 'bun:test';
import { normalizarLogin, loginParaEmailInterno, loginEhValido } from './supabase';

const lerSql = async (arquivo: string): Promise<string> =>
  await Bun.file(new URL(`../../supabase/${arquivo}`, import.meta.url)).text();

/**
 * O SQL sem os comentários.
 *
 * Existe porque este teste se enganou sozinho na primeira versão: o arquivo
 * de acessos EXPLICA, em comentário, que não pode mais ter "create or
 * replace function" — e a busca achou a própria explicação. Um teste que lê
 * texto precisa ler só a parte que o banco executa.
 */
const semComentarios = (sql: string): string =>
  sql
    .split('\n')
    .filter((linha) => !linha.trimStart().startsWith('--'))
    .join('\n');

test('a função de ativação é definida UMA vez em todo o projeto', async () => {
  // Esta é a regressão exata. Duas definições, e quem ganha é quem rodou
  // por último — que ninguém controla.
  const arquivos = ['esquema.sql', 'acessos.sql', 'organograma.sql'];

  let definicoes = 0;
  for (const arquivo of arquivos) {
    const sql = semComentarios(await lerSql(arquivo));
    definicoes += (
      sql.match(/create or replace function public\.criar_colaborador_do_usuario/g) || []
    ).length;
  }

  expect(definicoes).toBe(1);
});

test('o gatilho ADOTA a ficha existente e recusa login desconhecido', async () => {
  const sql = await lerSql('esquema.sql');

  // Casa pelo login, sem caixa nem espaço sobrando
  expect(sql).toContain('lower(trim(login)) = login_informado');
  // E LIGA a ficha achada, em vez de inserir outra
  expect(sql).toContain('set auth_user_id        = new.id');
  // Login que não existe na rede não vira cadastro novo
  expect(sql).toContain('Login nao cadastrado na rede');
});

test('ficha já ativada não é adotada de novo', async () => {
  // Senão o cadastro de alguém iria para quem chegasse depois
  const sql = await lerSql('esquema.sql');
  expect(sql).toContain('ja tem acesso ativado');
});

test('o primeiro acesso exige a senha de ativação', async () => {
  // Antes QUALQUER senha ativava a conta: quem descobrisse a URL e chutasse
  // um login viraria aquela pessoa, com o nível dela
  const sql = await lerSql('esquema.sql');

  expect(sql).toContain('senha_ativacao');
  expect(sql).toContain('Senha de primeiro acesso incorreta');
  // A senha digitada não pode ficar guardada em texto puro no usuário
  expect(sql).toContain("raw_user_meta_data - 'ativacao'");
});

test('a adoção não mexe em nível, loja nem setor da ficha', async () => {
  // A ficha veio da planilha configurada. Se a ativação sobrescrevesse
  // qualquer um desses campos, o gerente voltaria a virar Colaborador.
  const sql = await lerSql('esquema.sql');
  const inicio = sql.indexOf('-- A ficha é ADOTADA');
  const trecho = sql.slice(inicio, inicio + 400);

  expect(trecho).toContain('auth_user_id');
  expect(trecho).not.toContain('nivel =');
  expect(trecho).not.toContain('loja =');
  expect(trecho).not.toContain('setor =');
  expect(trecho).not.toContain('cargo =');
});

test('o arquivo antigo de acessos não redefine mais nada', async () => {
  // Ele continua existindo de propósito: o texto antigo está salvo em
  // alguma aba por aí, e um dia seria colado de novo
  const sql = semComentarios(await lerSql('acessos.sql'));

  expect(sql).not.toContain('create or replace function');
  expect(sql).not.toContain('create trigger');
  // E não pode mais rebaixar o administrador para nível 4
  expect(sql).not.toMatch(/set nivel = 4/);
});

test('há limpeza dos cadastros repetidos que o gatilho antigo criou', async () => {
  const sql = await lerSql('esquema.sql');

  // O fantasma é reconhecido pelo id que o gatilho antigo montava
  expect(sql).toContain("'colab-' || replace(g.auth_user_id::text, '-', '')");
  // E o acesso volta para a ficha da planilha
  expect(sql).toContain('id_real');
});

// ============================================================
// O LOGIN QUE O APLICATIVO MANDA PRECISA CASAR COM O DO BANCO
// ============================================================

test('o login é comparado sem caixa e sem espaço sobrando', () => {
  expect(normalizarLogin('  Fabio.Tavares  ')).toBe('fabio.tavares');
  expect(normalizarLogin('FABIO')).toBe('fabio');
});

test('o e-mail interno é o mesmo para qualquer grafia do login', () => {
  // Se não fosse, a mesma pessoa teria duas contas de autenticação
  const esperado = loginParaEmailInterno('fabio.tavares');
  expect(loginParaEmailInterno('Fabio.Tavares')).toBe(esperado);
  expect(loginParaEmailInterno('  FABIO.TAVARES ')).toBe(esperado);
});

test('login com espaço ou acento é recusado no cadastro', () => {
  // O e-mail interno come esses caracteres. Dois logins diferentes viravam
  // o mesmo endereço, e a segunda pessoa não conseguia entrar.
  expect(loginEhValido('fabio.tavares')).toBe(true);
  expect(loginEhValido('fabio tavares')).toBe(false);
  expect(loginEhValido('fábio')).toBe(false);
});

test('cada gatilho de auth.users chama a SUA função', async () => {
  // Os dois gatilhos nasceram apontando para a mesma função: a adoção
  // rodaria duas vezes, e a segunda recusaria com "já tem acesso ativado" —
  // derrubando TODO primeiro acesso do sistema.
  const sql = semComentarios(await lerSql('esquema.sql'));

  const gatilhos = [...sql.matchAll(/create trigger (\w+)[\s\S]{0,120}?execute function public\.(\w+)\(\)/g)]
    .map((m) => ({ gatilho: m[1], funcao: m[2] }))
    .filter((g) => g.gatilho.startsWith('ao_criar_usuario'));

  expect(gatilhos).toHaveLength(2);
  expect(gatilhos.find((g) => g.gatilho === 'ao_criar_usuario')?.funcao).toBe(
    'criar_colaborador_do_usuario'
  );
  expect(
    gatilhos.find((g) => g.gatilho === 'ao_criar_usuario_limpar_senha')?.funcao
  ).toBe('limpar_senha_de_ativacao');

  // Nenhuma função pode ser chamada por dois gatilhos de auth.users
  const funcoes = gatilhos.map((g) => g.funcao);
  expect(new Set(funcoes).size).toBe(funcoes.length);
});

test('os arquivos .sql não têm delimitador de corpo quebrado', async () => {
  /**
   * Em Postgres, o corpo de função e de bloco DO vai entre DOIS cifrões.
   * Perder um deixa o arquivo inválido INTEIRO — não é a linha que falha, é
   * o script todo, e o erro que o editor mostra aponta para outro lugar.
   *
   * Já aconteceu três vezes nesta base, sempre pela ferramenta que escreveu
   * o arquivo comendo um cifrão. Custa uma linha conferir.
   */
  for (const arquivo of ['esquema.sql', 'acessos.sql', 'organograma.sql', 'conserto-login.sql', 'resetar-acesso.sql', 'liberar-acesso.sql', 'permissoes.sql', 'qr-por-loja.sql', 'mensagem-fixada.sql', 'preferencias-conversa.sql', 'ponto-tolerancia-justificativas.sql', 'escala-turnos.sql', 'folga-sabado.sql']) {
    const sql = await lerSql(arquivo);

    // Cifrão solto: aparece fora de um par
    const solto = sql
      .split('\n')
      .map((linha, i) => ({ linha, numero: i + 1 }))
      .filter(({ linha }) => linha.includes('$') && !linha.includes('$$'));
    expect(
      solto.map((s) => `${arquivo}:${s.numero} ${s.linha}`)
    ).toEqual([]);

    // E os pares têm que fechar
    const pares = (sql.match(/\$\$/g) || []).length;
    expect(pares % 2).toBe(0);
  }
});

// ============================================================
// UPSERT ONDE A TABELA SÓ TEM POLÍTICA DE UPDATE
// ============================================================

test('tabela sem política de INSERT não pode ser gravada com upsert', async () => {
  /**
   * Terceira vez que esta pedra aparece: `upsert` vira `insert ... on
   * conflict` no banco, e um INSERT exige política de INSERT — mesmo quando
   * a linha já existe e o conflito só ia atualizar.
   *
   * `configuracoes` é linha única, semeada pelo esquema, e tem só política
   * de UPDATE. O upsert morria com "a nova linha viola a política de
   * segurança em nível de linha", apontando para um INSERT que nem era para
   * acontecer.
   *
   * Este teste lê o esquema e o código: se uma tabela só permite UPDATE,
   * ninguém pode gravar nela com upsert.
   */
  const esquema = semComentarios(await lerSql('esquema.sql'));
  const codigo = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  // Quais tabelas têm política de INSERT
  const comInsert = new Set(
    [...esquema.matchAll(/create policy \w+ on public\.(\w+)\s+for insert/g)].map(
      (m) => m[1]
    )
  );

  // Quais tabelas o código grava com upsert
  const comUpsert = new Set(
    [...codigo.matchAll(/from\('(\w+)'\)\s*\.upsert/g)].map((m) => m[1])
  );

  for (const tabela of comUpsert) {
    expect({ tabela, temPoliticaDeInsert: comInsert.has(tabela) }).toEqual({
      tabela,
      temPoliticaDeInsert: true,
    });
  }

  // E o caso concreto: configuracoes não tem INSERT, então não pode ter upsert
  expect(comInsert.has('configuracoes')).toBe(false);
  expect(comUpsert.has('configuracoes')).toBe(false);
});

// ============================================================
// CADASTRO NOVO PRECISA CONSEGUIR ENTRAR
// ============================================================

test('o cadastro ESPERA o banco antes de dizer que deu certo', async () => {
  /**
   * O defeito: a ficha ia para o banco sem ninguém esperar resposta. Se a
   * gravação falhasse, o painel dizia "cadastrado com sucesso" e a pessoa
   * existia só naquele navegador — depois tentava entrar e ouvia "login não
   * cadastrado na rede", com o nome dela ali na tela de quem cadastrou.
   */
  const servico = await Bun.file(
    new URL('./bancoDados.ts', import.meta.url)
  ).text();

  const inicio = servico.indexOf('async criarColaborador');
  expect(inicio).toBeGreaterThan(-1);
  const corpo = servico.slice(inicio, inicio + 4000);

  expect(corpo).toContain('await nuvem.salvarColaborador');
  expect(corpo).toContain('não foi gravado no banco');
  // E a gravação vem ANTES de dar o cadastro por feito
  expect(corpo.indexOf('await nuvem.salvarColaborador')).toBeLessThan(
    corpo.indexOf('colaboradores.push(novoColab)')
  );
});

test('a senha que o painel mostra é a que o banco espera', async () => {
  /**
   * Eram duas verdades: o painel exibia a senha escolhida no cadastro, e o
   * gatilho exigia a padrão da rede — porque a senha nunca chegava ao banco.
   * A pessoa digitava o que estava escrito na tela e não entrava.
   */
  const ponte = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

  expect(ponte).toContain('senha_ativacao: c.senhaAtivacao');
  // Condicional: enviar sempre apagaria a senha a cada troca de foto
  expect(ponte).toContain('...(c.senhaAtivacao ?');
});

test('a senha de ativação NÃO é reenviada nas atualizações', async () => {
  // `salvarColaborador` roda em toda alteração. Mandar o campo sempre faria
  // cada troca de ramal apagar a senha de quem ainda não entrou.
  const ponte = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

  const inicio = ponte.indexOf('const paraLinha = (c: Colaborador)');
  const mapa = ponte.slice(inicio, inicio + 2500);

  // Não existe a forma incondicional
  expect(mapa).not.toContain('senha_ativacao: c.senhaAtivacao ?? null');
});

test('NENHUMA COLUNA "not null" RECEBE null DO CÓDIGO', async () => {
  /**
   * O defeito que travou o cadastro do Raphael: a coluna `turno` é
   * `not null default 'A'`, e o código mandava `turno: c.turno ?? null`.
   *
   * Um null EXPLÍCITO não cai no default — ele o anula e viola o not null.
   * Todo cadastro novo era recusado com 23502, em silêncio, porque a
   * gravação era disparada sem ninguém esperar a resposta.
   *
   * Este teste lê as colunas `not null` da tabela de colaboradores no
   * esquema e confere que nenhuma delas é enviada como null.
   */
  const esquema = await lerSql('escala-turnos.sql');
  const principal = await lerSql('esquema.sql');
  const ponte = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

  // As colunas not null de colaboradores, do CREATE TABLE e dos ALTERs
  const bloco = principal.slice(
    principal.indexOf('create table if not exists public.colaboradores'),
    principal.indexOf(');', principal.indexOf('create table if not exists public.colaboradores'))
  );

  const naoNulas = [
    ...[...bloco.matchAll(/^\s{2}(\w+)\s+[^\n]*not null/gm)].map((m) => m[1]),
    ...[...esquema.matchAll(/add column if not exists (\w+)[^;]*not null/g)].map((m) => m[1]),
  ];

  expect(naoNulas).toContain('turno');

  // O mapa que monta a linha enviada ao banco
  const inicio = ponte.indexOf('const paraLinha = (c: Colaborador)');
  const mapa = ponte.slice(inicio, ponte.indexOf('});', inicio));

  /**
   * Busca por texto, não por regex: `??` dentro de uma expressão regular é
   * "nada a repetir" e derruba o teste antes de ele olhar o código. Cada
   * linha do mapa é uma coluna, então basta comparar linha a linha.
   */
  const enviadasComoNull = naoNulas.filter((coluna) =>
    mapa
      .split('\n')
      .some(
        (linha) =>
          linha.trim().startsWith(`${coluna}:`) && linha.includes('?? null')
      )
  );

  expect(enviadasComoNull).toEqual([]);
});
