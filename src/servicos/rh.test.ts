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
  expect(aba).toContain('<MeuRH colaboradorAtual={colaboradorAtual} />');

  const meus = await Bun.file(
    new URL('../componentes/MeuRH.tsx', import.meta.url)
  ).text();
  // E ela pede SÓ os dela: a lista da rede nem chega ao aparelho
  expect(meus).toContain('const eu = colaboradorAtual;');
  expect(meus).toContain('listarHolerites(eu.id)');
  expect(meus).toContain('listarAdvertencias(eu.id)');
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

  /*
    A regra mora em `acessoDe` (telasPorAssunto.ts) desde a organização por
    assunto; a tela pergunta a ela. O que ESTE teste protege continua igual:
    `!temTelaDeRh` — não é permissão, é evitar duas portas para a mesma
    sala. Por isso a asserção mudou de forma, e não de intenção.
  */
  expect(gestao).toContain('const veRede = acesso.redeNaGestao;');
  expect(gestao).toContain('const veEscala = acesso.escalaDaEquipe;');
  const acesso = await Bun.file(new URL('./telasPorAssunto.ts', import.meta.url)).text();
  expect(acesso).toContain('const temTelaDeRh =');
  expect(acesso).toContain("pode('espelho_equipe')) && !temTelaDeRh");
  expect(acesso).toContain("pode('escala_folgas') && !temTelaDeRh");

  // E de fato: quem cuida de pessoas e tem a tela de RH não vê as duas em Equipe & Ponto
  const { acessoDe } = await import('./telasPorAssunto');
  const diretor = { id: 'd', nome: 'D', nivel: 4, setor: 'Diretoria' } as any;
  const a = acessoDe(diretor, { pode: () => true, temEquipe: true, batePonto: false });
  expect({ escala: a.escalaDaEquipe, rede: a.redeNaGestao, peloRh: a.escala && a.espelhosDaRede }).toEqual({
    escala: false,
    rede: false,
    peloRh: true,
  });

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
  expect(painel).toContain("if (acesso.rh) lista.push('rh');");
  const acesso = await Bun.file(new URL('./telasPorAssunto.ts', import.meta.url)).text();
  expect(acesso).toContain("const rh = gerencia && pode('rh_pessoal') && cuidaDePessoas(c);");
  // Um líder com a permissão ligada, sem o papel, não ganha a tela de RH
  const { acessoDe } = await import('./telasPorAssunto');
  const lider = { id: 'l', nome: 'L', nivel: 2, setor: 'Balcão' } as any;
  expect(acessoDe(lider, { pode: () => true, temEquipe: true, batePonto: true }).rh).toBe(false);
  // A barra vem da lista, que já tem a condição acima
  expect(painel).toContain('abas={abasPermitidas.map((id) => ROTULO_SUBABA[id](');
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

  // A barra é desenhada DA lista: a simetria deixou de depender de duas cópias
  expect(painel).toContain('abas={abasPermitidas.map((id) => ROTULO_SUBABA[id](');

  /**
   * E as três que o RH não vê passam pela guarda do setor, em `acessoDe` —
   * se alguma escapar dela, a barra mostra ao RH uma aba que não é dele.
   */
  const acesso = await Bun.file(new URL('./telasPorAssunto.ts', import.meta.url)).text();
  expect(acesso).toMatch(/const gestao =\s*gerencia &&\s*!ehDoRh\(c\)/);
  expect(acesso).toContain("unidades: gerencia && !ehDoRh(c) && pode('visao_lojas')");
  expect(acesso).toContain("organograma: gerencia && !ehDoRh(c) && pode('organograma')");
});

test('os holerites abrem com as lojas RECOLHIDAS', async () => {
  /**
   * São 89 pessoas. Abrir com as cinco lojas expandidas devolve a coluna
   * infinita que o recolhimento veio resolver.
   *
   * O estado guarda quem está ABERTA, e não quem está fechada — assim o
   * conjunto vazio inicial quer dizer "tudo recolhido", sem nenhuma
   * `useEffect` correndo atrás da lista de lojas para semear. Guardar as
   * fechadas faria o vazio significar o contrário.
   */
  const aba = await Bun.file(
    new URL('../componentes/AbaHolerites.tsx', import.meta.url)
  ).text();

  expect(aba).toContain('const [abertas, setAbertas] = useState<Set<string>>(new Set())');
  expect(aba).toContain('const fechada = !buscando && !abertas.has(loja)');

  // E o inverso não pode voltar: com "recolhidas", vazio = tudo aberto
  expect(aba).not.toContain('const [recolhidas,');
});

test('O ESPELHO CABE NUMA FOLHA: a origem saiu do papel', async () => {
  /**
   * A origem das marcações passou por três formas neste documento, e
   * cada uma caiu pelo mesmo motivo — altura.
   *
   *  1. COLUNA com até quatro frases por dia ("Entrada: QR —
   *     Pirassununga | ..."). Quebrava linha, cada dia virava três ou
   *     quatro alturas, e o mês de 31 dias saía em duas páginas.
   *  2. COLUNA DE NÚMERO com a relação por extenso no rodapé. Melhor,
   *     mas num mês movimentado a lista passava de vinte linhas e
   *     empurrava as assinaturas para a segunda folha.
   *  3. Fora do papel, por decisão do Elias.
   *
   * O rastro não sumiu: ele mudou de documento, e o teste do CSV logo
   * abaixo cobra isso. Espelho é para conferir e assinar; auditoria de
   * lançamento é planilha.
   */
  const fonte = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();
  const espelho = fonte.slice(fonte.indexOf('gerarHtmlEspelho'));

  expect(espelho).not.toContain('<th>Origem das marcações</th>');
  expect(espelho).not.toContain('<th>Nota</th>');
  expect(espelho).not.toContain('class="nota-ref"');
  expect(espelho).not.toContain('marcações que não foram batidas pela pessoa');

  // O `*` FICA: é o rastro mínimo de que aquele horário não foi batido
  // pela pessoa, e ele não ocupa linha nenhuma
  expect(espelho).toContain("ehMarcacaoCorrigida(c.registro.metodo) ? ' *' : ''");

  // A data e o dia da semana na MESMA linha: dobrar 31 alturas decide a página
  expect(espelho).not.toContain('<td class="dia">${formatarDataBR(j.data)}<br>');
});

test('O CSV RECEBEU o rastro que saiu do espelho', async () => {
  /**
   * Isto não é enfeite de simetria: "quem lançou este horário" é a
   * pergunta que uma fiscalização faz, e tirar do papel sem pôr em
   * lugar nenhum seria apagar a resposta.
   *
   * Vai para o CSV porque é ali que quem audita trabalha, e porque
   * coluna a mais numa planilha não custa folha.
   */
  const fonte = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();
  const csv = fonte.slice(
    fonte.indexOf('gerarCsvDoPeriodo'),
    fonte.indexOf('private descreverOrigem')
  );

  expect(csv).toContain('Lancamentos manuais');
  expect(csv).toContain('this.descreverOrigem(r)');
  // Só o que foge do normal: "QR" em quatro colunas todo dia é o ruído
  // que já derrubou esta informação da grade impressa uma vez
  expect(csv).toContain('!this.foiBatidaPelaPessoa(r)');
  // O separador é `;` e a justificativa é texto livre: um `;` digitado
  // ali partiria a linha em duas colunas no meio da planilha
  expect(csv).toContain("replace(/;/g, ',')");
});

test('o espelho não chama de QR o que ninguém bateu', async () => {
  /**
   * `descreverOrigem` não conhecia 'ajuste_lider' nem
   * 'preenchimento_turno': os dois caíam no `return` final e o espelho
   * imprimia "QR — Pirassununga" num horário que a pessoa NÃO bateu.
   *
   * Num documento que se assina e se arquiva, isso é o sistema afirmando
   * uma batida que não houve.
   */
  const fonte = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();
  /**
   * Fatiar pela DEFINIÇÃO, e não pela primeira menção.
   *
   * Isto dizia `indexOf('descreverOrigem')` até `indexOf('foiBatidaPelaPessoa')`.
   * No dia em que o CSV passou a CHAMAR as duas — acima das
   * definições, porque `gerarCsvDoPeriodo` vem antes —, o fim do corte
   * passou a cair ANTES do começo e o trecho virou string vazia. O
   * teste não acusou nada: `''` não contém as marcas, então ele falhou;
   * mas poderia ter passado, e teria passado se as asserções fossem
   * `not.toContain`.
   */
  const trecho = fonte.slice(
    fonte.indexOf('private descreverOrigem'),
    fonte.indexOf('private foiBatidaPelaPessoa')
  );

  expect(trecho.length).toBeGreaterThan(200);

  expect(trecho).toContain("metodo === 'ajuste_lider'");
  expect(trecho).toContain("metodo === 'preenchimento_turno'");
  expect(trecho).toContain('Preenchido pelo horário do turno');
});
