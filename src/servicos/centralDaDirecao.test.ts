/**
 * Verificação da tela e do banco da CENTRAL DA DIREÇÃO — CONECTA
 *
 * `mural.test.ts` cobre as regras com gente de verdade. Este arquivo
 * cobre as duas pontas que regra nenhuma alcança: a tela não pode ter
 * uma cópia do critério de quem vê o quê, e o BANCO precisa ter o
 * mesmo critério — com destino por pessoa, uma publicação sobre a
 * advertência de alguém não pode depender de a tela lembrar de
 * escondê-la.
 */
import { test, expect } from 'bun:test';
import {
  TIPOS_PUBLICACAO,
  CATEGORIAS_PUBLICACAO,
  PUBLICACAO_ENVELHECE,
  ROTULO_TIPO_PUBLICACAO,
  ROTULO_CATEGORIA,
} from '../tipos';

const lerTela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/CentralAvisos.tsx', import.meta.url)).text();

const lerSql = async (): Promise<string> =>
  Bun.file('supabase/central-da-direcao.sql').text();

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|--).*$/gm, '');

test('as listas de tipo e categoria são FECHADAS e completas', () => {
  /**
   * Categoria digitada à mão vira "RH", "Rh", "Recursos Humanos" e
   * "rh " em quatro publicações, e nenhuma busca acha as quatro.
   *
   * `Record` exaustivo: tipo novo não compila sem rótulo, e sem alguém
   * decidir se ele envelhece.
   */
  for (const t of TIPOS_PUBLICACAO) {
    expect(typeof ROTULO_TIPO_PUBLICACAO[t]).toBe('string');
    expect(typeof PUBLICACAO_ENVELHECE[t]).toBe('boolean');
  }
  for (const c of CATEGORIAS_PUBLICACAO) {
    expect(typeof ROTULO_CATEGORIA[c]).toBe('string');
  }

  // Só o aviso envelhece: documento e tutorial são consulta
  expect(PUBLICACAO_ENVELHECE.aviso).toBe(true);
  expect(PUBLICACAO_ENVELHECE.documento).toBe(false);
  expect(PUBLICACAO_ENVELHECE.tutorial).toBe(false);
});

test('A TELA NÃO DECIDE QUEM VÊ O QUÊ', async () => {
  /**
   * Ela pede a lista pronta ao serviço, que chama `alcanca` — a mesma
   * função que a política do banco espelha. Um filtro próprio aqui,
   * com o nível escrito à mão, é como a tela e o banco passaram a
   * discordar sobre quem enxerga o quê.
   */
  const tela = semComentarios(await lerTela());

  expect(tela).toContain('bancoDados.obterAvisosVisiveisParaUsuarioAtual()');
  expect(tela).not.toContain('colaboradorAtual.nivel >=');
  expect(tela).not.toContain('lojaDestino === ');
});

test('TRÊS PRATELEIRAS, e a lista vem de tipos.ts', async () => {
  /**
   * O que chega à loja não é só recado: é a tabela de preço, o passo a
   * passo do fechamento de caixa, o formulário de férias. Essas coisas
   * viviam no grupo do WhatsApp e sumiam na rolagem.
   */
  const tela = await lerTela();

  expect(tela).toContain('TIPOS_PUBLICACAO.map');
  expect(tela).toContain('CATEGORIAS_PUBLICACAO.map');
  expect(tela).toContain('INFORMACOES_LOJAS.map');

  // Nenhuma lista escrita à mão na tela
  expect(tela).not.toContain("'Pirassununga',\n  'Porto Ferreira'");
});

test('OS CONTADORES CONTAM DENTRO DO TIPO ABERTO', async () => {
  /**
   * Contar a prateleira inteira faria "RH 6" com a aba de Documentos
   * aberta e um só documento de RH — o número prometeria seis e
   * entregaria um. Foi o mesmo defeito do cartão do RH que mandava a
   * Dani para uma lista menor do que o número clicado.
   */
  const tela = semComentarios(await lerTela());

  expect(tela).toContain('const doTipo = useMemo(');
  expect(tela).toContain('minhas.filter((p) => p.tipo === tipoAtivo)');
  expect(tela).toContain('doTipo.filter((p) => p.categoria === cat).length');
});

test('O ANEXO SOBE ANTES DA PUBLICAÇÃO EXISTIR', async () => {
  /**
   * Se subisse depois e falhasse, ficaria uma publicação de tipo
   * "documento" sem documento nenhum — pior do que não publicar,
   * porque quem procurar vai achar e não vai levar nada.
   */
  /* O formulário mudou de casa: a escrita virou tela inteira. */
  const escrita = semComentarios(await Bun.file('src/componentes/NovaPublicacao.tsx').text());

  const inicio = escrita.indexOf('const publicar =');
  expect(inicio).toBeGreaterThan(-1);
  const corpo = escrita.slice(inicio, escrita.indexOf('aoPublicar(tipo)', inicio));

  expect(corpo.indexOf('enviarAnexo(')).toBeLessThan(
    corpo.indexOf('criarAvisoRede(')
  );
  // E a falha do envio ABORTA — não publica sem o arquivo
  expect(corpo).toContain('A publicação não foi criada.');
});

test('publicar sem destino é RECUSADO', async () => {
  /**
   * Lista de destinos vazia gravaria uma publicação que ninguém
   * alcança: ela existiria no banco e não apareceria para pessoa
   * nenhuma, nem para quem a escreveu procurar o erro.
   */
  const escrita = semComentarios(await Bun.file('src/componentes/NovaPublicacao.tsx').text());
  expect(escrita).toContain('if (destinos.length === 0)');
  expect(escrita).toContain('ninguém receberia');
});

// ============================================================
// O BANCO
// ============================================================

test('O FILTRO DE QUEM VÊ MORA TAMBÉM NO BANCO', async () => {
  /**
   * A política antiga deixava qualquer sessão ler qualquer aviso — o
   * recorte por loja acontecia na tela. Com destino por PESSOA isso
   * deixa de servir: um comunicado sobre a advertência de alguém não
   * pode depender de a tela lembrar de escondê-lo.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain('create or replace function public.aviso_me_alcanca');
  expect(sql).toContain('create policy avisos_leitura on public.avisos_rede');
  expect(sql).toContain('public.aviso_me_alcanca(destinos, loja_destino)');

  // Os quatro alcances, os mesmos do código
  for (const alcance of ['rede', 'loja', 'setor', 'pessoa']) {
    expect(sql).toContain(`'${alcance}'`);
  }
});

test('O BANCO TAMBÉM SABE DA PUBLICAÇÃO ANTIGA', async () => {
  /**
   * Sem `destinos`, vale `loja_destino`. A política que ignorasse isso
   * esconderia as 24 publicações antigas de todo mundo — a central
   * abriria vazia no dia em que o script rodasse.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain('when destinos is null or jsonb_array_length(destinos) = 0 then');
  expect(sql).toContain("loja_destino = 'Todas' or loja_destino = public.minha_loja()");
});

test('NENHUMA COLUNA É REMOVIDA', async () => {
  /**
   * `loja_destino` fica. É o que as 24 publicações antigas têm, e o que
   * o código que ainda não conhece `destinos` continua lendo. Trocar a
   * coluna deixaria todas sem destino nenhum.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain('add column if not exists');
  expect(sql).not.toContain('drop column');
  expect(sql).not.toContain('delete from public.avisos_rede');
});

test('as listas fechadas viram CHECK, e aceitam o que já existe', async () => {
  /**
   * A checagem aceita NULL de propósito: as publicações antigas não têm
   * valor, e a tradução delas acontece na leitura. Um `not null` aqui
   * faria o script falhar na primeira linha antiga.
   *
   * Valor de união nova recusado pelo CHECK já mordeu duas vezes esta
   * semana — `uniaoBate.test.ts` existe por isso.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain("check (tipo is null or tipo in ('aviso', 'documento', 'tutorial'))");
  expect(sql).toContain('categoria is null');

  for (const c of CATEGORIAS_PUBLICACAO) {
    expect(sql).toContain(`'${c}'`);
  }
});

test('QUEM VÊ A LISTA DE LEITURA', async () => {
  /**
   * Quem publicou vê quem leu o que ele publicou. É o mínimo para o
   * comunicado servir de prova — e o máximo que faz sentido: a leitura
   * de terceiros sobre publicação alheia não é assunto de ninguém.
   *
   * E registrar leitura é sempre a PRÓPRIA: marcar que outro leu seria
   * assinar ciência no lugar dele.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain('create policy avisos_leitura_consulta on public.avisos_leitura');
  expect(sql).toContain('a.autor_id = public.meu_colaborador_id()');

  expect(sql).toContain('with check (colaborador_id = public.meu_colaborador_id())');
  expect(sql).toContain('alter table public.avisos_leitura enable row level security');
});

test('PUBLICAR É INSERT SIMPLES, e não upsert', async () => {
  /**
   * Publicar falhava. `upsert` vira `ON CONFLICT`, e o Postgres precisa
   * LER a linha em conflito para decidir o que fazer com ela — a
   * política de leitura de `avisos_rede` filtra por destino, então essa
   * leitura pode não enxergar nada e o banco responde "violates
   * row-level security" numa publicação que o INSERT autorizava.
   *
   * É o mesmo defeito que já custou quatro tentativas às cegas no envio
   * de mensagem. O padrão da casa é insert comum tratando o 23505.
   */
  const ponte = semComentarios(
    await Bun.file('src/servicos/nuvemComunicacao.ts').text()
  );

  const corpo = ponte.slice(
    ponte.indexOf('async salvarAviso'),
    ponte.indexOf('async atualizarAviso')
  );

  expect(corpo).toContain(".from('avisos_rede').insert(");
  expect(corpo).not.toContain('upsert');
  expect(corpo).toContain("error.code === '23505'");
});

test('FIXAR usa update, e não o insert', async () => {
  /**
   * A publicação já existe. Com `salvarAviso` virando insert, mandar
   * fixar por lá daria 23505 toda vez — e o tratamento do 23505 como
   * sucesso esconderia que a fixação nunca chegou ao banco. Ela
   * voltaria sozinha na sincronização seguinte.
   */
  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());
  expect(banco).toContain('nuvemComunicacao.atualizarAviso(lista[indice])');

  const ponte = semComentarios(
    await Bun.file('src/servicos/nuvemComunicacao.ts').text()
  );
  const corpo = ponte.slice(ponte.indexOf('async atualizarAviso'));
  expect(corpo).toContain(".update(paraLinhaAviso(aviso))");
  expect(corpo).toContain(".eq('id', aviso.id)");
});

test('O ERRO DO BANCO CHEGA À TELA, inteiro', async () => {
  /**
   * Saía "Falha ao publicar o comunicado no banco" — que não diz se
   * faltou coluna, se a permissão recusou ou se a internet caiu. São
   * três consertos diferentes, e a diferença só aparecia no console.
   *
   * É o mesmo aprendizado do login: "Login ou senha incorretos"
   * escondia o único caminho que resolvia.
   */
  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());

  const inicio = banco.indexOf('const res = await nuvemComunicacao.salvarAviso');
  const corpo = banco.slice(inicio, inicio + 400);

  expect(corpo).toContain('erro: res.erro ||');
});

test('O CONTEÚDO É TEXTO, e a tela é que formata', async () => {
  /**
   * A coluna `conteudo` já tem 24 publicações dentro, e `casaComBusca`
   * procura a palavra DENTRO dela. Guardar HTML tornaria as 24 antigas
   * lixo e faria a busca achar `<strong>`.
   *
   * O cartão e a mensagem que vai ao chat saem SEM a marcação: com
   * ela, a linha viraria "## Inventário **sexta**".
   */
  const tela = semComentarios(await lerTela());
  /*
    O cartão corta o texto por CARACTERE, e não só com line-clamp:
    a classe disputava o  com  e perdia, e um
    procedimento de dez páginas saía inteiro dentro do cartão.
  */
  expect(tela).toContain('resumoCurto(p.conteudo)');

  /**
   * O editor mora na TELA DE ESCRITA, e não mais na lista: a criação
   * deixou de ser um modal de 512px, onde o campo do texto sobrava
   * espremido entre os outros dez controles.
   */
  const escrita = semComentarios(
    await Bun.file('src/componentes/NovaPublicacao.tsx').text()
  );
  expect(escrita).toContain('<EditorTexto');
  expect(escrita).toContain('alturaCheia');

  /**
   * O CHAT RECEBE O AVISO, NÃO A PUBLICAÇÃO.
   *
   * O conteúdo inteiro era despejado como mensagem. Três problemas: o
   * comunicado de meia página empurrava a conversa da loja para cima;
   * a formatação virava `##` e `**` soltos; e a publicação passava a
   * existir em dois lugares, um deles sem anexo, sem ciência e sem
   * lista de quem leu.
   */
  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());

  expect(banco).not.toContain('semFormatacao(dados.conteudo)');
  expect(banco).toContain('Abra a aba Central para ler e confirmar.');

  /**
   * Conferido no que é ENVIADO, e não só na existência do resumo.
   *
   * A primeira versão deste teste procurava `const resumo = [` — e
   * continuava passando com `texto: dados.conteudo` logo abaixo, que é
   * exatamente o defeito a evitar.
   */
  const envio = banco.slice(
    banco.indexOf("this.enviarMensagem('grupo-avisos-da-rede'"),
    banco.indexOf("this.enviarMensagem('grupo-avisos-da-rede'") + 200
  );

  expect(envio).toContain('texto: resumo,');
  expect(envio).not.toContain('dados.conteudo');

  const painel = semComentarios(
    await Bun.file('src/componentes/PainelPublicacao.tsx').text()
  );
  expect(painel).toContain('<TextoFormatado');
});

test('o script recarrega o esquema e confere', async () => {
  const sql = await lerSql();

  expect(sql).toContain("notify pgrst, 'reload schema'");
  expect(sql).toContain('colunas_novas');
  expect(sql).toContain('politica_de_alcance');
  expect(sql).toContain('publicacoes_orfas');
});

test('O RÓTULO SINGULAR É ESCRITO, e não o plural sem o "s"', async () => {
  /**
   * A tela tirava o "s" com `replace(/s$/, '')` e o botão de criar
   * saía escrito **"Tutoriai"** — porque português não faz singular
   * tirando letra.
   */
  const { ROTULO_TIPO_PUBLICACAO_SINGULAR } = await import('../tipos');

  expect(ROTULO_TIPO_PUBLICACAO_SINGULAR.tutorial).toBe('Tutorial');
  expect(ROTULO_TIPO_PUBLICACAO_SINGULAR.aviso).toBe('Aviso');
  expect(ROTULO_TIPO_PUBLICACAO_SINGULAR.documento).toBe('Documento');

  const escrita = await Bun.file('src/componentes/NovaPublicacao.tsx').text();
  expect(escrita).toContain('ROTULO_TIPO_PUBLICACAO_SINGULAR[t]');
  expect(escrita).not.toContain("replace(/s$/");

  const tela = await lerTela();
  expect(tela).not.toContain("replace(/s$/");
});

test('"REDE" NO SELETOR NÃO SE CONFUNDE COM "TODA A REDE"', async () => {
  /**
   * "Rede" é uma unidade de verdade — Operações Centrais, com gerente e
   * telefone — mas o nome colide com o "Toda a rede" logo acima: quem
   * marcasse achava que mandava para as 89 pessoas e mandava para as
   * poucas da central.
   */
  const seletor = await Bun.file('src/componentes/SeletorDestinos.tsx').text();
  expect(seletor).toContain("loja.tipo === 'Central'");
  expect(seletor).toContain('{loja.cidade}');
});

test('A ESCRITA É TELA INTEIRA, e não um modal', async () => {
  /**
   * O modal tinha 512px e dez controles; o campo do texto — a razão de
   * a tela existir — sobrava espremido no meio. Modal serve para "tem
   * certeza?", não para redigir meia página.
   */
  const escrita = await Bun.file('src/componentes/NovaPublicacao.tsx').text();

  expect(escrita).toContain('fixed inset-0');
  expect(escrita).toContain('lg:flex-row');
  // O editor cresce com a tela, em vez de ter altura em linhas
  expect(escrita).toContain('alturaCheia');

  // E a lista não tem mais o formulário dentro dela
  const lista = await lerTela();
  expect(lista).toContain('<NovaPublicacao');
  expect(lista).not.toContain('<textarea');
});

// ============================================================
// ONDE A PUBLICAÇÃO CHEGA
// ============================================================

test('A CENTRAL É ABA DE TODOS, e não sub-aba de Gerenciar', async () => {
  /**
   * O furo que isto fecha: a Central morava dentro de "Gerenciar",
   * atrás da permissão `avisos_direcao`, que nasce na liderança.
   * Publicava-se um comunicado para as 89 pessoas e umas 70 não tinham
   * tela nenhuma onde vê-lo.
   */
  const { ABAS_PRINCIPAIS } = await import('../tipos');
  expect(ABAS_PRINCIPAIS).toContain('central');

  const app = await Bun.file('src/App.tsx').text();
  expect(app).toMatch(/id: 'central',[\s\S]{0,80}visivel: true/);
  expect(app).toContain('<CentralAvisos');
  expect(app).toContain('publicacaoAAbrir={publicacaoAAbrir}');

  // E não existe em dois lugares: saiu do painel de gestão
  const painel = await Bun.file('src/componentes/PainelRede.tsx').text();
  expect(painel).not.toContain('CentralAvisos');
  expect(painel).not.toContain("lista.push('avisos')");
});

test('A ABA DIZ QUANTAS ESPERAM, com número', async () => {
  /**
   * Sem contador, a publicação chega e a pessoa só descobre se abrir a
   * aba por conta própria — e um comunicado que depende disso não é
   * comunicado, é arquivo.
   *
   * Número, e não bolinha: "3 para ler" faz abrir; um ponto vermelho
   * só diz que existe alguma coisa.
   */
  const app = await Bun.file('src/App.tsx').text();

  expect(app).toContain('const publicacoesNaoLidas = useMemo');
  expect(app).toContain('.filter((p) => !(p.lidoPorIds || []).includes(colaboradorAtual.id))');
  expect(app).toContain('contador: publicacoesNaoLidas');
  expect(app).toContain("{aba.contador > 9 ? '9+' : aba.contador}");
});

test('GRUPOS SAIU DA BARRA e virou seção dentro de Conversas', async () => {
  /**
   * Grupo é conversa. Ocupava uma aba inteira para mostrar uma lista
   * que cabe dentro de Conversas — e a pessoa tinha de lembrar em qual
   * das duas abas estava a mensagem que procurava.
   *
   * Recolhido, o cabeçalho diz quantas não lidas há dentro: é o número
   * que faz abrir. E nasce recolhido para não empurrar as conversas de
   * gente para fora da primeira tela.
   */
  const { ABAS_PRINCIPAIS } = await import('../tipos');
  expect(ABAS_PRINCIPAIS).not.toContain('grupos');

  const app = await Bun.file('src/App.tsx').text();

  expect(app).toContain('const [gruposAbertos, setGruposAbertos] = useState(false)');
  expect(app).toContain('const naoLidasDosGrupos = grupos.reduce');
  expect(app).toContain('{naoLidasDosGrupos > 0 && (');
  expect(app).toContain('{gruposAbertos && (');

  // A permissão de grupos continua existindo — o que saiu foi a aba
  const catalogo = await Bun.file('src/servicos/ferramentas.ts').text();
  expect(catalogo).toContain("chave: 'grupos'");
});

test('CLICAR NA CENTRAL LEVA À CENTRAL', async () => {
  /**
   * O defeito: a aba aparecia, a pessoa clicava e nada acontecia.
   *
   * `abaAtiva` filtra a escolha por `podeUsar(aba)` — e `podeUsar`
   * responde NÃO para qualquer chave fora do catálogo, o que está
   * certo: erro de digitação numa tela não pode virar tela aberta.
   *
   * Só que `central` saiu do catálogo de propósito, junto com a
   * permissão. Então o filtro devolvia a pessoa para o painel a cada
   * clique — a aba existia e não levava a lugar nenhum.
   *
   * "Painel" sempre esteve na mesma situação (ele é a soma de várias
   * ferramentas), e por isso tinha uma exceção escrita à mão. Agora as
   * duas estão na mesma lista.
   */
  const app = semComentarios(await Bun.file('src/App.tsx').text());

  expect(app).toContain(
    "const ABAS_SEM_FERRAMENTA: AbaPrincipal[] = ['painel', 'central'];"
  );
  expect(app).toContain('!ABAS_SEM_FERRAMENTA.includes(abaAtivaEscolhida)');

  /**
   * E toda aba da barra que NÃO está no catálogo precisa estar nessa
   * lista — senão o próximo a entrar repete o defeito sem ninguém
   * perceber, porque ele é silencioso: nada quebra, a aba só não abre.
   */
  const { ABAS_PRINCIPAIS } = await import('../tipos');
  const { FERRAMENTAS } = await import('./ferramentas');
  const noCatalogo = new Set(FERRAMENTAS.map((f) => f.chave));

  const semFerramenta = ABAS_PRINCIPAIS.filter((a) => !noCatalogo.has(a));
  for (const aba of semFerramenta) {
    expect(app).toContain(`'${aba}'`);
    expect(
      app.includes(`ABAS_SEM_FERRAMENTA: AbaPrincipal[] = ['painel', 'central']`) &&
        (['painel', 'central'] as string[]).includes(aba)
    ).toBe(true);
  }
});

test('a Central é desenhada nas DUAS larguras', async () => {
  /**
   * Celular e computador têm caminhos separados no App — a aba que só
   * aparece num dos dois é a que a pessoa jura que sumiu.
   */
  const app = await Bun.file('src/App.tsx').text();

  expect(app).toContain("{abaAtiva === 'central' && (");
  expect(app).toContain("abaDesktop === 'central' ?");
  /* Uma para o celular, outra para o computador */
  expect((app.match(/<CentralAvisos/g) || []).length).toBe(2);
});

test('O RECADO DO CHAT TEM BOTÃO, e ele abre A publicação', async () => {
  /**
   * Sem o botão, a mensagem dizia "abra a aba Central" e a pessoa tinha
   * de sair da conversa, trocar de aba e procurar qual das publicações
   * era. Com dez avisos na semana, isso é procurar — e um recado que
   * obriga a procurar não chega.
   *
   * O id vai junto: o botão abre ELA, e não a Central inteira.
   */
  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());
  expect(banco).toContain('publicacaoId: novoAviso.id,');

  const chat = semComentarios(
    await Bun.file('src/componentes/TelaConversa.tsx').text()
  );
  expect(chat).toContain('{msg.publicacaoId && aoAbrirPublicacao && (');
  expect(chat).toContain('Abrir publicação');

  const app = semComentarios(await Bun.file('src/App.tsx').text());
  expect(app).toContain('const abrirPublicacao = useCallback');
  expect(app).toContain("setAbaAtiva('central');");
});

test('o pedido de abrir é CONSUMIDO', async () => {
  /**
   * Pedido que não se limpa reabre a mesma publicação a cada desenho e
   * prende a pessoa nela — foi o que já aconteceu com o alvo do sino.
   */
  const central = semComentarios(await lerTela());

  expect(central).toContain('aoConsumirPublicacao?.();');

  const app = semComentarios(await Bun.file('src/App.tsx').text());
  expect(app).toContain('aoConsumirPublicacao={() => setPublicacaoAAbrir(null)}');
});

test('a coluna do recado NÃO apaga a mensagem junto', async () => {
  /**
   * `on delete set null`: publicação apagada deixa o recado como texto
   * comum, e o botão some. Com CASCADE, a mensagem sumiria do meio da
   * conversa — o tipo de coisa que faz as pessoas desconfiarem do
   * sistema.
   */
  const sql = semComentarios(await Bun.file('supabase/aviso-no-chat.sql').text());

  expect(sql).toContain('add column if not exists publicacao_id text');
  expect(sql).toContain('on delete set null');
  expect(sql).not.toContain('on delete cascade');
  expect(sql).toContain("notify pgrst, 'reload schema'");
});

test('NO CELULAR, OS FILTROS NÃO OCUPAM A TELA', async () => {
  /**
   * A coluna da esquerda empilhava uma busca, sete unidades e seis
   * categorias — treze linhas de filtro antes da primeira publicação.
   * Numa tela de 390px isso é rolar duas vezes para chegar ao que se
   * veio ler.
   *
   * Viram dois seletores nativos, com a contagem no rótulo — que é o
   * que a coluna do computador mostra ao lado de cada linha.
   */
  const tela = await lerTela();

  expect(tela).toContain('<div className="grid grid-cols-2 gap-2 lg:hidden">');
  expect(tela).toContain('aria-label="Unidade"');
  expect(tela).toContain('aria-label="Categoria"');
  expect(tela).toContain('({contarUnidade(loja.nome)})');

  // E as listas longas só aparecem a partir do computador
  expect((tela.match(/<div className="hidden lg:block">/g) || []).length).toBe(2);
});

// ============================================================
// EDITAR, IMAGEM E COLUNAS
// ============================================================

test('EDITAR NÃO APAGA QUEM JÁ LEU', async () => {
  /**
   * Sem editar, a saída era apagar e publicar de novo — e isso apaga
   * junto quem leu e quem deu ciência, que é justamente a prova que a
   * publicação existe para guardar.
   *
   * A edição parte do original com `...original`: as listas de leitura
   * vêm junto, intactas.
   */
  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());

  const inicio = banco.indexOf('async editarAviso');
  expect(inicio).toBeGreaterThan(-1);

  const corpo = banco.slice(inicio, banco.indexOf('async removerAviso', inicio));

  expect(corpo).toContain('...original,');
  expect(corpo).not.toContain('lidoPorIds: []');
  expect(corpo).not.toContain('confirmacoesIds: []');

  // E atualiza, em vez de inserir de novo
  expect(corpo).toContain('nuvemComunicacao.atualizarAviso(editado)');
});

test('a trava de editar mora no SERVIÇO, e a tela pergunta', async () => {
  /**
   * Botão escondido se contorna pelo console. Quem esconde e quem
   * recusa a gravação precisam concordar, então é a mesma função.
   */
  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());
  expect(banco).toContain('if (!podeEditarPublicacao(original, atual))');

  const tela = semComentarios(await lerTela());
  expect(tela).toContain('podeEditarPublicacao(aberta, colaboradorAtual)');
  expect(tela).not.toContain('colaboradorAtual.nivel >=');
});

test('EDITAR E CRIAR SÃO A MESMA TELA', async () => {
  /**
   * Os campos são os mesmos, e duas telas iguais divergem no primeiro
   * ajuste — foi assim que a lista de setores acabou escrita em dois
   * lugares.
   */
  const escrita = semComentarios(
    await Bun.file('src/componentes/NovaPublicacao.tsx').text()
  );

  expect(escrita).toContain('publicacaoAEditar?: AvisoRede | null;');
  expect(escrita).toContain('const res = editando');
  expect(escrita).toContain('bancoDados.editarAviso(editando.id, {');

  /**
   * E o React REMONTA a tela ao trocar o que se edita: os campos nascem
   * do estado inicial, então sem `key` a segunda publicação abriria com
   * o texto da primeira.
   */
  const central = semComentarios(await lerTela());
  expect(central).toContain("key={editando?.id ?? 'nova'}");
});

test('o ANEXO EXISTENTE sobrevive a uma edição de texto', async () => {
  /**
   * Ao editar, o campo de arquivo nasce vazio — e tratar vazio como
   * "sem anexo" apagaria o documento de quem só veio corrigir uma
   * palavra.
   */
  const escrita = semComentarios(
    await Bun.file('src/componentes/NovaPublicacao.tsx').text()
  );

  expect(escrita).toContain('const [anexoExistente, setAnexoExistente] = useState(');
  expect(escrita).toContain('let anexoCaminho: string | undefined = anexoExistente?.caminho;');
});

test('A IMAGEM DO CORPO É ASSINADA ANTES DE DESENHAR', async () => {
  /**
   * O caminho no balde não abre sozinho. Assinar dentro do renderizador
   * exigiria torná-lo assíncrono, e um renderizador assíncrono é uma
   * tela que pisca.
   */
  const painel = semComentarios(
    await Bun.file('src/componentes/PainelPublicacao.tsx').text()
  );

  expect(painel).toContain('imagensCitadas(publicacao.conteudo)');
  expect(painel).toContain('imagens={imagens}');

  // E a tela de escrita sobe a imagem para o mesmo balde
  const escrita = semComentarios(
    await Bun.file('src/componentes/NovaPublicacao.tsx').text()
  );
  expect(escrita).toContain('aoSubirImagem={subirImagem}');
  expect(escrita).toContain("enviarAnexo(dataUrl, 'central', id, arquivo.name)");
});

test('AS COLUNAS DA ESQUERDA RECOLHEM, uma a uma', async () => {
  /**
   * Com os seis rótulos de categoria e as sete unidades, a coluna chega
   * a treze linhas — e quem já sabe em que unidade procura não precisa
   * das categorias à vista.
   *
   * Guardamos as FECHADAS: categoria nova entra aberta, e não
   * invisível.
   */
  const tela = semComentarios(await lerTela());

  expect(tela).toContain('const [colunasFechadas, setColunasFechadas] = useState<Set<string>>');
  expect(tela).toContain("alternarColuna('unidades')");
  expect(tela).toContain("alternarColuna('categorias')");
  expect(tela).toContain("{!colunasFechadas.has('unidades') && (");
});

// ============================================================
// O CAMPO QUE MOSTRA O TEXTO JÁ FORMATADO
// ============================================================

test('O EDITOR ESCREVE NO CAMPO AO VIVO, e não no campo cru', async () => {
  /**
   * Era um campo de texto com uma aba "Como vai ficar" do lado. Quem
   * escrevia via `**assim**` e conferia depois — e quem não conhecia a
   * marcação não descobria que ela existia.
   */
  const editor = semComentarios(await Bun.file('src/componentes/EditorTexto.tsx').text());

  expect(editor).toContain('<SuperficieAoVivo');
  expect(editor).toContain('campoRef={campoVivo}');
  expect(editor).toContain("useState<'vivo' | 'marcacao'>('vivo')");
});

test('a SAÍDA para o campo cru continua existindo', async () => {
  /**
   * Campo editável é onde os navegadores mais divergem. Se um celular
   * do balcão se comportar mal, quem está escrevendo precisa de um
   * caminho que sempre funcionou — e é o mesmo texto, então nada se
   * perde na troca.
   */
  const editor = semComentarios(await Bun.file('src/componentes/EditorTexto.tsx').text());

  expect(editor).toContain('<textarea');
  expect(editor).toContain("setModo((m) => (m === 'vivo' ? 'marcacao' : 'vivo'))");
});

test('A BARRA E O `@` SERVEM AOS DOIS CAMPOS', async () => {
  /**
   * O jeito errado seria a barra saber mexer só no campo de texto, e a
   * lista de nomes existir só nele. Seriam duas implementações da mesma
   * coisa, e a segunda divergiria — é a duplicação que este projeto já
   * pagou quatro vezes.
   *
   * Então a seleção é perguntada a UMA função, que sabe qual campo está
   * em uso, e a lista de nomes fica fora da escolha de campo.
   */
  const editor = semComentarios(await Bun.file('src/componentes/EditorTexto.tsx').text());

  expect(editor).toContain('const selecaoAgora = ()');
  expect(editor).toContain('const devolverCursor = (');

  // A barra e a imagem usam a função, e não `selectionStart` na mão
  const usos = editor.match(/selecaoAgora\(\)/g) || [];
  expect(usos.length).toBeGreaterThanOrEqual(3);

  /**
   * A lista de nomes é desenhada UMA VEZ. Duas ocorrências seriam uma
   * cópia por campo — e a segunda divergiria na primeira correção.
   */
  expect((editor.match(/\{candidatos\.length > 0 && \(/g) || []).length).toBe(1);

  /* E a barra é desenhada uma vez também, fora da escolha de campo */
  expect((editor.match(/FERRAMENTAS\.map/g) || []).length).toBe(1);
});

test('ENTER E COLAR SÃO TRATADOS POR NÓS, o resto é do navegador', async () => {
  /**
   * Cada navegador quebra a linha do seu jeito — um cria um `<div>`
   * irmão, outro aninha. Aninhado, duas linhas viram uma na leitura de
   * volta e a quebra SE PERDE do documento. Colar traz o HTML da
   * origem, com fonte e cor do Word.
   *
   * O resto NÃO se intercepta: a digitação por deslize e a correção
   * automática do Android dependem do comportamento nativo, e este
   * sistema abre no celular do balcão.
   */
  const campo = semComentarios(
    await Bun.file('src/componentes/SuperficieAoVivo.tsx').text()
  );

  expect(campo).toContain("if (evento.key === 'Enter'");
  expect(campo).toContain('onPaste=');
  expect(campo).toContain("e.clipboardData.getData('text/plain')");

  // E o desfazer é nosso, porque refazer o desenho apaga o do navegador
  expect(campo).toContain("evento.key.toLowerCase() === 'z'");
  expect(campo).toContain('desfazer.current');
});

test('O DESENHO ESPERA A PAUSA, e não redesenha a cada tecla', async () => {
  /**
   * Refazer o desenho no meio da digitação briga com o navegador, e
   * cada refeito precisa recolocar o cursor — o que aparece como letra
   * saltando de lugar.
   */
  const campo = semComentarios(
    await Bun.file('src/componentes/SuperficieAoVivo.tsx').text()
  );

  /**
   * A espera tem de ser A DO RELÓGIO, e não um `setTimeout` de zero
   * qualquer: zero devolve o controle ao navegador mas redesenha na
   * tecla seguinte do mesmo jeito.
   */
  expect(campo).toMatch(
    /relogio\.current = setTimeout\([\s\S]{0,500}\}, PAUSA_ATE_REDESENHAR\);/
  );
  expect(campo).toContain('const PAUSA_ATE_REDESENHAR = 250;');

  /* E a tecla anterior cancela o relógio: sem isto, dez teclas em
     sequência marcam dez redesenhos, e os nove primeiros caem no meio
     da digitação */
  expect(campo).toContain('clearTimeout(relogio.current)');

  /* Quem digita marca o desenho como em dia SEM desenhar — é isso que
     impede o efeito do React de redesenhar por conta */
  expect(campo).toContain('desenhado.current = { texto, ativa: linhaAtiva.current };');
});

test('O CSS ESCONDE OS SINAIS, e os reacende na linha do cursor', async () => {
  /**
   * É este par de regras que sustenta a ideia toda: o texto parece
   * formatado porque os sinais estão ESCONDIDOS, e não apagados —
   * `textContent` devolve o escondido, e é dele que vem o que é gravado.
   *
   * Uma regra que apagasse o sinal de verdade (`content: ''`) ou que o
   * deixasse sempre à vista quebraria ou o documento ou a promessa.
   */
  const css = await Bun.file('src/index.css').text();

  expect(css).toMatch(/\.tr-vivo \.tr-sinal\s*\{\s*display:\s*none;/);
  expect(css).toMatch(/\.tr-vivo \.tr-l-ativa \.tr-sinal\s*\{[^}]*display:\s*inline;/);

  /**
   * E o marcador da lista vem do CSS. Um `•` no desenho entraria no
   * `textContent` e seria GRAVADO — a passada seguinte o leria como
   * texto, somando um ponto a cada vez.
   */
  expect(css).toMatch(/\.tr-vivo \.tr-l-item::before\s*\{\s*content:\s*'•'/);
  expect(css).toContain('.tr-vivo .tr-caixa-viva');
});

test('o campo ao vivo NÃO tem um segundo desenhador de texto', async () => {
  /**
   * `paraHtml` desenha para quem LÊ e descarta os sinais; `textoAoVivo`
   * desenha para quem ESCREVE e os preserva. São dois trabalhos, e está
   * certo que sejam duas funções — mas a SEGURANÇA não pode ser duas:
   * `escapar` e `enderecoSeguro` vêm de um lugar só.
   */
  const aoVivo = semComentarios(await Bun.file('src/servicos/textoAoVivo.ts').text());

  expect(aoVivo).toContain("import { escapar, enderecoSeguro } from './textoRico'");
  expect(aoVivo).not.toContain('const escapar =');
  expect(aoVivo).not.toContain('const enderecoSeguro =');
});
