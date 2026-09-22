/**
 * Verificação da tela de RH — CONECTA
 *
 * Holerite e advertência são DOCUMENTO DE PESSOA. A regra de quem lê é mais
 * apertada que a do resto do sistema, e é a coisa mais importante a
 * prender: um gerente que enxerga o salário da equipe muda a relação de
 * trabalho inteira.
 */
import { test, expect } from 'bun:test';

const lerSql = async (): Promise<string> =>
  Bun.file(
    new URL('../../supabase/rh-holerite-advertencia.sql', import.meta.url)
  ).text();

test('so a propria pessoa e o RH leem holerite e advertencia', async () => {
  const sql = await lerSql();

  /**
   * Nem o gerente da loja, nem o líder do setor. Estes documentos não são
   * assunto de quem aprova hora.
   */
  const leituras = [...sql.matchAll(/for select[\s\S]*?using \(([^;]+)\)/g)].map(
    (m) => m[1]
  );
  expect(leituras.length).toBe(2);
  for (const regra of leituras) {
    expect(regra).toContain('colaborador_id = public.meu_colaborador_id()');
    expect(regra).toContain('public.cuido_de_pessoas()');
  }
});

test('so o RH publica e apaga', async () => {
  const sql = await lerSql();

  // Inserir e apagar: só quem cuida de pessoas
  const insercoes = [...sql.matchAll(/for insert to authenticated with check \(([^)]+\))\)/g)];
  expect(insercoes.length).toBe(2);
  for (const [, regra] of insercoes) {
    expect(regra).toContain('cuido_de_pessoas');
  }
});

/**
 * A ATUALIZAÇÃO DA ADVERTÊNCIA TEM DOIS DONOS, e por um motivo.
 *
 * O RH corrige o registro; o COLABORADOR dá ciência. Sem a segunda metade,
 * a ciência teria de ser gravada pelo RH dizendo "ele leu" — que é o oposto
 * do que uma ciência significa.
 */
test('a ciencia e da propria pessoa, e o banco permite isso', async () => {
  const sql = await lerSql();

  const inicio = sql.indexOf('create policy advertencias_atualizacao');
  expect(inicio).toBeGreaterThan(-1);
  const regra = sql.slice(inicio, inicio + 400);

  expect(regra).toContain('colaborador_id = public.meu_colaborador_id()');
  expect(regra).toContain('cuido_de_pessoas()');

  // E o holerite NÃO tem essa abertura: a pessoa não edita o próprio holerite
  const doHolerite = sql.slice(
    sql.indexOf('create policy holerites_atualizacao'),
    sql.indexOf('create policy holerites_remocao')
  );
  expect(doHolerite).not.toContain('meu_colaborador_id');
});

test('o servico recusa a ciencia de outra pessoa', async () => {
  const servico = await Bun.file(new URL('./rh.ts', import.meta.url)).text();

  /**
   * A trava real está na regra do banco. Esta aqui existe para a tela não
   * oferecer um botão que o banco vai recusar — e para dizer o motivo.
   */
  expect(servico).toContain('advertencia.colaboradorId !== eu.id');
  expect(servico).toContain('A ciência é de quem recebeu a advertência.');
});

test('advertencia SEM MOTIVO escrito nao e registrada', async () => {
  const servico = await Bun.file(new URL('./rh.ts', import.meta.url)).text();

  /**
   * Advertência sem motivo não se sustenta em lugar nenhum — nem numa
   * conversa com a pessoa, nem num processo. E "atraso" sozinho não é
   * motivo: é assunto.
   */
  expect(servico).toContain('motivo.length < 15');
  expect(servico).toContain('É ele que sustenta a advertência.');

  // Suspensão sem dias também não passa
  expect(servico).toContain("dados.tipo === 'suspensao' && !dados.diasSuspensao");
});

test('reenviar holerite SUBSTITUI o do mesmo mes', async () => {
  const sql = await lerSql();
  const servico = await Bun.file(new URL('./rh.ts', import.meta.url)).text();

  /**
   * Duas linhas do mesmo mês deixam a pessoa adivinhando qual vale, e a
   * errada é sempre a que ela abre primeiro.
   */
  expect(sql).toContain('unique (colaborador_id, competencia)');
  expect(servico).toContain("onConflict: 'colaborador_id,competencia'");
});

/**
 * Sem tela para a pessoa, a função não existe: um holerite que ninguém abre
 * é um arquivo num balde, e uma advertência que ninguém vê não recebe
 * ciência de ninguém.
 */
test('a pessoa VE os documentos dela na aba Eu', async () => {
  const aba = await Bun.file(
    new URL('../componentes/AbaEu.tsx', import.meta.url)
  ).text();
  expect(aba).toContain('<MeusDocumentos colaboradorAtual={colaboradorAtual} />');

  const meus = await Bun.file(
    new URL('../componentes/MeusDocumentos.tsx', import.meta.url)
  ).text();
  // E ela pede SÓ os dela: a lista da rede nem chega ao aparelho
  expect(meus).toContain('listarHolerites(colaboradorAtual.id)');
  expect(meus).toContain('listarAdvertencias(colaboradorAtual.id)');
  expect(meus).toContain('darCienciaNaAdvertencia');
});

/**
 * ESCALA E ESPELHO MUDARAM DE LUGAR, e não foram copiados.
 *
 * Duas portas para a mesma sala é o que faz a pessoa perder tempo
 * descobrindo se as duas levam ao mesmo lugar.
 */
test('quem tem a tela de RH nao ve escala e rede em Equipe & Ponto', async () => {
  const gestao = await Bun.file(
    new URL('../componentes/PainelGestao.tsx', import.meta.url)
  ).text();

  expect(gestao).toContain('const temTelaDeRh =');
  // O `!temTelaDeRh` continua valendo para as duas portas do espelho: quem
  // tem a tela de RH não vê a mesma coisa repetida em Equipe & Ponto
  expect(gestao).toContain("podeUsar('espelho_equipe', colaboradorAtual)) && !temTelaDeRh");
  /**
   * A escala passou a consultar o catálogo de permissões, que é o assunto
   * de outra correção — ela não aparecia no painel de Permissões e não
   * dava para ligar ou desligar por nível.
   *
   * O que ESTE teste protege continua igual: `!temTelaDeRh`. Não é
   * permissão, é evitar duas portas para a mesma sala. Por isso a
   * asserção mudou de forma, e não de intenção.
   */
  expect(gestao).toContain("podeUsar('escala_folgas', colaboradorAtual) && !temTelaDeRh");

  // E a tela de RH usa os MESMOS componentes, não cópias
  const rh = await Bun.file(
    new URL('../componentes/PainelRH.tsx', import.meta.url)
  ).text();
  expect(rh).toContain('<EscalaDeFolgas colaboradorAtual={colaboradorAtual} />');
  expect(rh).toContain('abaFixa="banco_horas"');
});

test('a tela de RH e de quem cuida de pessoas, e nao de um nivel', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  /**
   * A permissão abre a porta; `cuidaDePessoas` diz de quem ela é. Um líder
   * com a permissão ligada mas sem o papel veria holerite da rede inteira —
   * que é o que a regra do banco recusa, e a tela não promete o que o banco
   * nega.
   */
  expect(painel).toContain("podeUsar('rh_pessoal', colaboradorAtual) && cuidaDeRh");
  expect(painel).toContain("pode('rh_pessoal') && cuidaDeRh");
});

/**
 * O ARQUIVO TAMBÉM PRECISA SER PROTEGIDO, e não só a linha.
 *
 * A regra do balde era `bucket_id = 'anexos'` e nada mais: qualquer pessoa
 * autenticada lia qualquer arquivo. Para anexo de conversa isso passava — o
 * caminho leva o id aleatório da mensagem e ninguém adivinha.
 *
 * Para holerite NÃO passava: o caminho é
 * `holerites/<id-do-colaborador>/2026-09.pdf`, e os ids dos colegas
 * aparecem na lista de equipe. Bastava montar o endereço.
 *
 * A proteção da tabela vale para a LINHA; esta vale para o ARQUIVO. Sem as
 * duas, a primeira não protege nada.
 */
test('o BALDE separa documento pessoal de anexo de conversa', async () => {
  const esquema = await Bun.file(
    new URL('../../supabase/esquema.sql', import.meta.url)
  ).text();

  const inicio = esquema.indexOf('create policy anexos_leitura');
  expect(inicio).toBeGreaterThan(-1);
  const leitura = esquema.slice(inicio, inicio + 600);

  // A regra aberta não pode voltar
  expect(leitura).not.toContain("using (bucket_id = 'anexos');");

  // O caminho diz de quem o documento é
  expect(leitura).toContain("split_part(name, '/', 1) in ('holerites', 'advertencias')");
  expect(leitura).toContain("split_part(name, '/', 2) = public.meu_colaborador_id()");
  expect(leitura).toContain('public.cuido_de_pessoas()');
});

test('so o RH sobe arquivo na pasta de documento pessoal', async () => {
  const esquema = await Bun.file(
    new URL('../../supabase/esquema.sql', import.meta.url)
  ).text();

  /**
   * Sem isto, qualquer pessoa poderia subir um arquivo na pasta de outra —
   * e o holerite que a vítima abrisse seria o que o invasor pôs lá.
   */
  const inicio = esquema.indexOf('create policy anexos_envio');
  const envio = esquema.slice(inicio, inicio + 500);

  expect(envio).not.toContain("with check (bucket_id = 'anexos');");
  expect(envio).toContain('public.cuido_de_pessoas()');
});

test('o RH consegue apagar o arquivo que ele mesmo publicou', async () => {
  const esquema = await Bun.file(
    new URL('../../supabase/esquema.sql', import.meta.url)
  ).text();

  /**
   * Antes só a administração apagava. A linha sumia da tabela e o arquivo
   * ficava órfão no balde para sempre — ocupando espaço que ninguém mais
   * consegue nem achar.
   */
  const inicio = esquema.indexOf('create policy anexos_remocao');
  const remocao = esquema.slice(inicio, inicio + 500);

  expect(remocao).toContain('public.cuido_de_pessoas()');
  // E o expurgo de histórico continua sendo da administração
  expect(remocao).toContain('public.sou_admin()');
});

test('as abas que o RH NAO ve saem da barra e da lista juntas', async () => {
  /**
   * A barra desenha os botões; `abasPermitidas` diz quais abas existem.
   * Quando as duas discordam, o efeito é o pior possível para quem usa:
   * o botão aparece, a pessoa clica, e a tela pisca e volta sozinha sem
   * dizer por quê.
   *
   * O RH não vê quadro de equipe, equipe & ponto, organograma nem
   * "Visão & Lojas" — nenhuma delas decide nada do trabalho dele, e aba
   * que aparece e não serve é ruído numa barra curta.
   *
   * Este teste prende a SIMETRIA, não a lista: o dia em que uma aba
   * voltar para o RH, ela tem de voltar nos dois lugares.
   */
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  // Na barra, todas passam por `!souDoRh`
  for (const botao of [
    "pode('visao_lojas') && !souDoRh",
    "pode('quadro_equipe') && !souDoRh",
    'podeVerGestao && !souDoRh',
    "pode('organograma') && !souDoRh",
  ]) {
    expect(painel).toContain(botao);
  }

  /**
   * E na lista, todas moram DENTRO do mesmo bloco. O recorte vai do
   * `if (!ehDoRh(...))` até o fecho dele — se alguma escapar de lá, a
   * barra some com o botão e a aba continua alcançável por estado antigo.
   */
  const inicio = painel.indexOf('if (!ehDoRh(colaboradorAtual)) {');
  expect(inicio).toBeGreaterThan(-1);

  const bloco = painel.slice(inicio, painel.indexOf("lista.push('avisos')", inicio));
  for (const aba of ["'visao_geral'", "'quadro'", "'gestao'", "'organograma'"]) {
    expect(bloco).toContain(aba);
  }
});
