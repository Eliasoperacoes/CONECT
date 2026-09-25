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
  expect(tela).toContain('semFormatacao(p.conteudo)');

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

  const banco = semComentarios(await Bun.file('src/servicos/bancoDados.ts').text());
  expect(banco).toContain('semFormatacao(dados.conteudo)');

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
