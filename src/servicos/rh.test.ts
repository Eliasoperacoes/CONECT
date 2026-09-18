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
  expect(gestao).toContain("podeUsar('banco_horas_rh', colaboradorAtual) && !temTelaDeRh");
  expect(gestao).toContain('const veEscala = !temTelaDeRh');

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
