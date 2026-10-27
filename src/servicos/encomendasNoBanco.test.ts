/**
 * ENCOMENDAS NO BANCO (docs/cotador/SPEC-pedidos-compras.md): quem
 * encomenda e quem muda cada passo, o custo congelado do banco (e escondido
 * de quem não vê custo), o horário de corte e a ordem das situações.
 * Banco de verdade (PGlite), entrando como cada pessoa.
 */
import { test, expect, beforeAll, describe } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const BIA = '00000000-0000-0000-0000-0000000000e1'; // Balcão, Pirassununga
const DUDA = '00000000-0000-0000-0000-0000000000e2'; // Balcão, Descalvado
const CAIO = '00000000-0000-0000-0000-0000000000e3'; // Compras
const GIL = '00000000-0000-0000-0000-0000000000e4'; // Gerência: encomenda e vê custo, não fecha pedido
const EDU = '00000000-0000-0000-0000-0000000000e5'; // Estoque

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant execute on functions to authenticated;
  `);
  await banco.db.exec(lerSql('cotador-banco.sql'));
  await banco.db.exec(lerSql('cotador-precificacao.sql'));
  await banco.db.exec(lerSql('cotador-encomendas.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${BIA}'), ('${DUDA}'), ('${CAIO}'), ('${GIL}'), ('${EDU}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('duda', '${DUDA}', 'Duda', 'duda', 'Balcão', 'Descalvado', 1, true),
      ('caio', '${CAIO}', 'Caio', 'caio', 'Compras', 'Pirassununga', 1, true),
      ('gil', '${GIL}', 'Gil', 'gil', 'Gerência', 'Pirassununga', 3, true),
      ('edu', '${EDU}', 'Edu', 'edu', 'Estoque', 'Pirassununga', 1, true);

    -- A OC90 cotada hoje: DPK em SP (frete R$ 10), Roles fora, Pellegrino sem
    insert into public.precos_b2b (fornecedor, codigo, local, em_sp, custo, quantidade, disponivel, proximidade, marca, descricao) values
      ('dpk', 'OC90', 'RIB PRETO', true, 8.69, 228, true, 1, 'MAHLE', 'FILTRO OLEO'),
      ('roles', 'OC90', 'GOIANIA', false, 8.00, 5, true, 9, 'MAHLE', 'FILTRO OLEO');
    insert into public.historico_precos_b2b (dia, fornecedor, codigo, local, custo, situacao) values
      (public.hoje_brasilia(), 'dpk', 'OC90', 'RIB PRETO', 8.69, 'SP'),
      (public.hoje_brasilia(), 'roles', 'OC90', 'GOIANIA', 8.00, 'FORA DO ESTADO'),
      (public.hoje_brasilia(), 'pellegrino', 'OC90', null, null, 'SEM ESTOQUE');
  `);
}, 120_000);

const como = async <T,>(uid: string, sql: string): Promise<T[] | string> => {
  await banco.como(uid);
  try {
    return (await banco.db.query<T>(sql)).rows;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await banco.como(null);
  }
};

const encomendar = async (uid: string, fornecedor = 'dpk', qtd = 2) => {
  const r = await como<{ id: string }>(uid, `select public.encomendar('oc-90', 'OC90', '${fornecedor}', null, ${qtd}, 'João 99999-0000') as id`);
  return typeof r === 'string' ? r : r[0].id;
};

const linha = async (id: string) =>
  (
    await banco.db.query<Record<string, unknown>>(
      `select codigo, origem, fornecedor_chave, fornecedor_nome, venda::float as venda, custo::float as custo, prazo,
              quantidade, observacao, vendedor_id, loja, situacao from public.encomendas where id = '${id}'`
    )
  ).rows[0];

let daBia = '';

test('quem cota encomenda, com venda e CUSTO congelados do banco — mesmo o Balcão, que não vê custo', async () => {
  daBia = await encomendar(BIA);
  expect(await linha(daBia)).toEqual({
    codigo: 'OC90', origem: 'b2b', fornecedor_chave: 'dpk', fornecedor_nome: 'DPK',
    // (8,69 + frete 10) × 1,80 = 33,64 → 33,90
    venda: 33.9, custo: 8.69, prazo: '2–3 dias',
    quantidade: 2, observacao: 'João 99999-0000', vendedor_id: 'bia', loja: 'Pirassununga', situacao: 'encomendada',
  });
  expect(await encomendar(EDU)).toContain('encomendam');
  // Quem não tem a peça hoje não se encomenda
  expect(await encomendar(BIA, 'pellegrino')).toContain('não tem a peça');
  expect(await encomendar(BIA, 'dpk', 0)).toContain('Quantidade');
});

test('o custo: a Bia não lê (nem pela função, nem na tabela); o Gil lê o dele; Compras lê todos', async () => {
  type Minha = { codigo: string; venda: number; custo: number | null };
  const minhas = (uid: string) => como<Minha>(uid, 'select codigo, venda::float as venda, custo::float as custo from public.minhas_encomendas()');
  expect(await minhas(BIA)).toEqual([{ codigo: 'OC90', venda: 33.9, custo: null }]);
  expect(await como(BIA, 'select id from public.encomendas')).toEqual([]);
  expect(await minhas(DUDA)).toEqual([]);

  await encomendar(GIL, 'roles', 1);
  expect(((await minhas(GIL)) as Minha[]).map((m) => m.custo)).toEqual([8]);

  const deCompras = await como<{ nome_do_vendedor: string; custo: number; pedido_minimo: number }>(
    CAIO,
    `select nome_do_vendedor, custo::float as custo, pedido_minimo::float as pedido_minimo
       from public.encomendas_de_compras(array['encomendada']) order by nome_do_vendedor`
  );
  expect(deCompras).toEqual([
    { nome_do_vendedor: 'Bia', custo: 8.69, pedido_minimo: 150 },
    { nome_do_vendedor: 'Gil', custo: 8, pedido_minimo: 150 },
  ]);
  expect(await como(GIL, "select * from public.encomendas_de_compras(array['encomendada'])")).toContain('Compras ou TI');
});

test('o corte: até o primeiro horário de corte depois da encomenda, e Compras muda o horário', async () => {
  const prazo = async (quando: string) =>
    (
      await banco.db.query<{ p: string }>(
        `select to_char(public.prazo_de_cancelamento('${quando}'::timestamptz) at time zone 'America/Sao_Paulo', 'DD HH24:MI') as p`
      )
    ).rows[0].p;
  expect(await prazo('2026-10-21 10:00-03')).toBe('21 15:59');
  expect(await prazo('2026-10-21 17:00-03')).toBe('22 15:59');

  expect(await como(BIA, "select public.alterar_horario_corte('12:00')")).toContain('Compras ou TI');
  await como(CAIO, "select public.alterar_horario_corte('12:00')");
  expect(await prazo('2026-10-21 10:00-03')).toBe('21 12:00');
  await como(CAIO, "select public.alterar_horario_corte('15:59')");
});

test('cancelar: o vendedor, a dele, antes do corte; depois, só Compras e com motivo', async () => {
  const outra = await encomendar(BIA);
  expect(await como(DUDA, `select public.cancelar_encomenda('${outra}')`)).toContain('não encontrada');
  // O próprio vendedor cancelou: o recado vai a Compras (os recados têm o teste deles)
  expect(await como(BIA, `select public.cancelar_encomenda('${outra}')`)).not.toBeTypeOf('string');
  expect((await linha(outra)).situacao).toBe('cancelada');

  const atrasada = await encomendar(BIA);
  await banco.db.exec(`update public.encomendas set cancelavel_ate = now() - interval '1 minute' where id = '${atrasada}'`);
  expect(await como(BIA, `select public.cancelar_encomenda('${atrasada}')`)).toContain('Passou do horário');
  expect(await como(CAIO, `select public.cancelar_encomenda('${atrasada}', '  ')`)).toContain('motivo');
  // Compras cancelou: o recado ao vendedor, com o motivo
  const recado = ((await como<{ cancelar_encomenda: string }>(CAIO, `select public.cancelar_encomenda('${atrasada}', 'fornecedor sem a peça')`)) as { cancelar_encomenda: string }[])[0].cancelar_encomenda;
  expect(recado).toStartWith('rec-');

  // Compras vê as canceladas de hoje, e quem cancelou (a faixa "Canceladas hoje")
  const canceladas = await como<{ pelo: boolean; motivo: string | null }>(
    CAIO,
    `select cancelada_pelo_vendedor as pelo, motivo_cancelamento as motivo
       from public.encomendas_de_compras(array['cancelada']) order by cancelada_em`
  );
  expect(canceladas).toEqual([
    { pelo: true, motivo: null },
    { pelo: false, motivo: 'fornecedor sem a peça' },
  ]);
  // A de ontem não volta para a faixa
  await banco.db.exec(`update public.encomendas set cancelada_em = now() - interval '2 days' where id = '${outra}'`);
  expect(((await como(CAIO, "select id from public.encomendas_de_compras(array['cancelada'])")) as unknown[]).length).toBe(1);
});

test('a ordem das situações: cada passo só a partir do anterior, e cada um pela pessoa certa', async () => {
  const ids = (r: unknown) => (r as { id: string }[]).map((x) => x.id);
  // Não chegou o que não foi pedido; não se recebe o que não chegou
  expect(ids(await como(CAIO, `select * from public.marcar_em_conferencia(array['${daBia}'::uuid])`))).toEqual([]);
  expect(await como(BIA, `select public.confirmar_recebimento('${daBia}')`)).toContain('ainda não chegou');
  // Fechar o pedido é de Compras
  expect(await como(GIL, `select * from public.marcar_pedido_realizado(array['${daBia}'::uuid])`)).toContain('Compras ou TI');

  expect(await como(CAIO, `select id, vendedor_id, situacao from public.marcar_pedido_realizado(array['${daBia}'::uuid])`)).toEqual([
    { id: daBia, vendedor_id: 'bia', situacao: 'pedido_realizado' },
  ]);
  expect(await como(BIA, `select public.cancelar_encomenda('${daBia}')`)).toContain('já foi pedida');

  expect(ids(await como(CAIO, `select * from public.marcar_em_conferencia(array['${daBia}'::uuid])`))).toEqual([daBia]);
  expect(await como(DUDA, `select public.confirmar_recebimento('${daBia}')`)).toContain('não encontrada');
  await como(BIA, `select public.confirmar_recebimento('${daBia}')`);
  expect((await linha(daBia)).situacao).toBe('recebida');
  // Tocar duas vezes no "Recebi" não dá erro
  expect(await como(BIA, `select public.confirmar_recebimento('${daBia}')`)).not.toBeTypeOf('string');
});

test('da resposta do comprador: venda e custo da resposta, e só a resposta da própria solicitação', async () => {
  const sol = ((await como<{ id: string }>(BIA, "select public.pedir_ao_comprador('ZZ77', 'Gol', '') as id")) as { id: string }[])[0].id;
  await como(CAIO, `select public.responder_solicitacao('${sol}', '[{"fornecedor":"Barros","marca":"Nakata","venda":89.9,"custo":45,"prazo":"2 dias"}]'::jsonb, false, null)`);
  const resposta = ((await como<{ resposta_id: string }>(BIA, "select resposta_id from public.solicitacoes_de_cotacao('ZZ77')")) as { resposta_id: string }[])[0]
    .resposta_id;

  expect(await como(DUDA, `select public.encomendar_resposta('${resposta}', 1, '')`)).toContain('não encontrada');
  const id = ((await como<{ id: string }>(BIA, `select public.encomendar_resposta('${resposta}', 1, 'Maria') as id`)) as { id: string }[])[0].id;
  expect(await linha(id)).toMatchObject({
    codigo: 'ZZ77', origem: 'comprador', fornecedor_chave: null, fornecedor_nome: 'Barros', venda: 89.9, custo: 45, prazo: '2 dias',
  });
});

test('A JORNADA: cada encomenda leva o caminho inteiro, da cotação à entrega, para as métricas', async () => {
  type J = Record<string, unknown>;
  // A Bia cotou a OC90 (a foto da cotação) e encomendou
  await banco.db.exec(`
    insert into public.consultas_cotacao (colaborador_id, loja, codigo, criada_em, base_em, situacao)
    values ('bia', 'Pirassununga', 'OC90', now() - interval '30 minutes', now() - interval '31 minutes', 'SP')`);
  const id = await encomendar(BIA, 'dpk', 1);
  await como(CAIO, `select * from public.marcar_pedido_realizado(array['${id}'::uuid])`);
  await como(CAIO, `select * from public.marcar_em_conferencia(array['${id}'::uuid])`);
  await como(BIA, `select public.confirmar_recebimento('${id}')`);

  const da = async (uid: string) =>
    (await como<J>(
      uid,
      `select cotada_em is not null as cotada, encomendada_em >= cotada_em as depois_da_cotacao,
              pedido_em is not null as pedido, conferencia_em is not null as chegou, recebida_em is not null as recebida,
              nome_do_vendedor, custo::float as custo
         from public.jornada_das_encomendas(null, null) where id = '${id}'`
    )) as J[];
  expect(await da(GIL)).toEqual([
    { cotada: true, depois_da_cotacao: true, pedido: true, chegou: true, recebida: true, nome_do_vendedor: 'Bia', custo: 8.69 },
  ]);
  // A Bia vê a jornada dela, sem o custo; a Duda não vê a da Bia; o Estoque não vê nada
  expect(((await da(BIA)) as J[])[0].custo).toBeNull();
  expect(await da(DUDA)).toEqual([]);
  expect(await como(EDU, 'select * from public.jornada_das_encomendas(null, null)')).toContain('Sem permissão');

  // A do comprador começa quando o vendedor pediu ao comprador
  const resp = ((await como<{ resposta_id: string }>(BIA, "select resposta_id from public.solicitacoes_de_cotacao('ZZ77')")) as { resposta_id: string }[])[0].resposta_id;
  const doComprador = ((await como<{ id: string }>(BIA, `select public.encomendar_resposta('${resp}', 1, '') as id`)) as { id: string }[])[0].id;
  const j = ((await como<J>(GIL, `select cotada_em = solicitada_em as igual, respondida_em is not null as respondida from public.jornada_das_encomendas(null, null) where id = '${doComprador}'`)) as J[])[0];
  expect(j).toEqual({ igual: true, respondida: true });
});

test('pedido mínimo: só Compras muda, e começa com a tabela do Elias', async () => {
  type Config = { horario_corte: string; fornecedores: { chave: string; pedido_minimo: number }[] };
  expect(await como(BIA, 'select * from public.configuracao_de_compras()')).toContain('Compras ou TI');
  expect(await como(GIL, "select public.alterar_pedido_minimo('roles', 300)")).toContain('Compras ou TI');
  await como(CAIO, "select public.alterar_pedido_minimo('roles', 300)");
  const c = ((await como<Config>(CAIO, 'select horario_corte::text, fornecedores from public.configuracao_de_compras()')) as Config[])[0];
  expect(c.horario_corte).toBe('15:59:00');
  expect(c.fornecedores.map((f) => `${f.chave} ${f.pedido_minimo}`)).toEqual(['roles 300', 'pellegrino 150', 'dpk 150']);
});

test('o fator do vendedor: a venda é recalculada no banco, e só quem vê custo põe a margem', async () => {
  const comFator = (uid: string, fator: string) =>
    como<{ id: string }>(uid, `select public.encomendar('oc-90', 'OC90', 'dpk', null, 1, '', ${fator}) as id`);
  // (8,69 + frete 10) × 1,60 = 29,904 → 29,90 (já em ,90) · × 1,00 = 18,69 → 18,90
  for (const [fator, venda] of [['1.6', 29.9], ['1', 18.9]] as const) {
    const id = ((await comFator(GIL, fator)) as { id: string }[])[0].id;
    const r = (await banco.db.query<{ venda: number; fator: number }>(`select venda::float as venda, fator_do_vendedor::float as fator from public.encomendas where id = '${id}'`)).rows[0];
    expect(r).toEqual({ venda, fator: Number(fator) });
  }
  // A Bia não vê custo: não põe margem (o preço dela é o da marca)
  expect(await comFator(BIA, '1.6')).toContain('vê o custo');
  expect(await comFator(GIL, '0.99')).toContain('1,00 a 5,00');
  expect(await comFator(GIL, '1.555')).toContain('duas casas');
});

describe('até o cliente (SPEC-comunicacao-recebimento)', () => {
  const sit = async (id: string) =>
    (await banco.db.query<{ situacao: string }>(`select situacao from public.encomendas where id = '${id}'`)).rows[0].situacao;
  const chamar = (uid: string, sql: string) => como<Record<string, unknown>>(uid, sql);
  const pedirEChegar = async (...ids: string[]) => {
    const lista = `array[${ids.map((i) => `'${i}'::uuid`).join(',')}]`;
    await chamar(CAIO, `select * from public.marcar_pedido_realizado(${lista})`);
    return chamar(CAIO, `select id, situacao from public.marcar_em_conferencia(${lista})`);
  };

  test('filial passa por transferência; o comprador marca "Chegou na loja"; só então o Recebi', async () => {
    const pira = await encomendar(BIA, 'dpk', 1);
    const descalvado = await encomendar(DUDA, 'dpk', 1);
    await pedirEChegar(pira, descalvado);
    expect([await sit(pira), await sit(descalvado)]).toEqual(['em_conferencia', 'em_transferencia']);

    expect(await chamar(DUDA, `select public.confirmar_recebimento('${descalvado}')`)).toContain('não chegou à loja');
    expect(await chamar(BIA, `select * from public.marcar_chegou_na_loja(array['${descalvado}'::uuid])`)).toContain('Só Compras');
    await chamar(CAIO, `select * from public.marcar_chegou_na_loja(array['${descalvado}'::uuid])`);
    expect(await sit(descalvado)).toBe('em_conferencia');
    await chamar(DUDA, `select public.confirmar_recebimento('${descalvado}')`);
    expect(await sit(descalvado)).toBe('recebida');
  });

  test('o Gerente da loja confirma pelo vendedor só depois de 1 dia, e só da loja dele', async () => {
    const pira = await encomendar(BIA, 'dpk', 1);
    const descalvado = await encomendar(DUDA, 'dpk', 1);
    await pedirEChegar(pira, descalvado);
    await chamar(CAIO, `select * from public.marcar_chegou_na_loja(array['${descalvado}'::uuid])`);

    expect(await chamar(GIL, `select public.confirmar_recebimento('${pira}')`)).toContain('não encontrada');
    await banco.db.exec(`update public.encomendas set conferencia_em = now() - interval '25 hours' where id in ('${pira}', '${descalvado}')`);
    expect(await chamar(GIL, `select public.confirmar_recebimento('${descalvado}')`)).toContain('não encontrada');
    await chamar(GIL, `select public.confirmar_recebimento('${pira}')`);
    const r = (await banco.db.query<{ situacao: string; recebida_por: string }>(`select situacao, recebida_por from public.encomendas where id = '${pira}'`)).rows[0];
    expect(r).toEqual({ situacao: 'recebida', recebida_por: 'gil' });
  });

  test('"Entregue ao cliente" fecha o caminho; recebida ainda aparece para o vendedor', async () => {
    const id = await encomendar(BIA, 'dpk', 1);
    await pedirEChegar(id);
    expect(await chamar(BIA, `select public.marcar_entregue('${id}')`)).toContain('Recebi');
    await chamar(BIA, `select public.confirmar_recebimento('${id}')`);
    const minhas = async () => ((await chamar(BIA, `select situacao from public.minhas_encomendas() where id = '${id}'`)) as { situacao: string }[]).map((m) => m.situacao);
    expect(await minhas()).toEqual(['recebida']);
    expect(await chamar(DUDA, `select public.marcar_entregue('${id}')`)).toContain('não encontrada');
    await chamar(BIA, `select public.marcar_entregue('${id}')`);
    expect(await sit(id)).toBe('entregue');
    expect(await minhas()).toEqual(['entregue']);
  });

  test('Problema: o vendedor ou Compras marcam; só Compras resolve, contando o que fez', async () => {
    const id = await encomendar(BIA, 'dpk', 1);
    expect(await chamar(BIA, `select public.marcar_problema('${id}', 'avariada', null)`)).toContain('depois do pedido');
    await pedirEChegar(id);
    expect(await chamar(BIA, `select public.marcar_problema('${id}', 'outro', ' ')`)).toContain('Descreva');
    expect(await chamar(EDU, `select public.marcar_problema('${id}', 'avariada', null)`)).toContain('não encontrada');
    await chamar(BIA, `select public.marcar_problema('${id}', 'avariada', 'caixa amassada')`);
    expect(await sit(id)).toBe('em_conferencia');

    expect(await chamar(BIA, `select public.resolver_problema('${id}', 'troquei', 'troca')`)).toContain('Só Compras');
    expect(await chamar(CAIO, `select public.resolver_problema('${id}', '', 'troca')`)).toContain('Conte');
    await chamar(CAIO, `select public.resolver_problema('${id}', 'Fornecedor troca amanhã', 'troca')`);
    const p = (await chamar(BIA, `select problema, problema_detalhe, problema_resolucao from public.minhas_encomendas() where id = '${id}'`)) as unknown[];
    expect(p).toEqual([{ problema: 'avariada', problema_detalhe: 'caixa amassada', problema_resolucao: 'Fornecedor troca amanhã' }]);
  });

  test('Cliente desistiu: não cancela sozinho; Compras decide devolver ou estoque (ainda não pedida, só cancela)', async () => {
    const pedida = await encomendar(BIA, 'dpk', 1);
    const naoPedida = await encomendar(BIA, 'dpk', 1);
    await pedirEChegar(pedida);
    await chamar(BIA, `select public.cliente_desistiu('${pedida}')`);
    await chamar(BIA, `select public.cliente_desistiu('${naoPedida}')`);
    expect(await sit(pedida)).toBe('em_conferencia');

    expect(await chamar(BIA, `select public.destinar_desistencia('${pedida}', 'estoque')`)).toContain('Só Compras');
    expect(await chamar(CAIO, `select public.destinar_desistencia('${pedida}', null)`)).toContain('devolver');
    await chamar(CAIO, `select public.destinar_desistencia('${pedida}', 'estoque')`);
    await chamar(CAIO, `select public.destinar_desistencia('${naoPedida}', 'devolver')`);
    const r = (await banco.db.query(`select situacao, destino_da_peca, motivo_cancelamento from public.encomendas where id in ('${pedida}', '${naoPedida}') order by destino_da_peca`)).rows;
    expect(r).toEqual([
      { situacao: 'cancelada', destino_da_peca: 'estoque', motivo_cancelamento: 'Cliente desistiu · peça foi para o estoque' },
      { situacao: 'cancelada', destino_da_peca: 'nao_pedida', motivo_cancelamento: 'Cliente desistiu' },
    ]);
  });
});

describe('os recados nascem no banco, nos dois sentidos (SPEC-comunicacao-recebimento)', () => {
  type Recado = { conversa_id: string; remetente_id: string; texto: string; aviso_encomenda: string; pecas: number; cotacao_codigo: string | null };
  const recados = async (vendedor: string) =>
    (
      await banco.db.query<Recado>(
        `select conversa_id, remetente_id, texto, aviso_encomenda, coalesce(array_length(encomenda_ids, 1), 0) as pecas, cotacao_codigo
           from public.mensagens where conversa_id = 'compras-${vendedor}' order by criado_em, id`
      )
    ).rows;
  /** Só os passos de Compras para o vendedor (sem os do próprio vendedor) */
  const deCompras = async (vendedor: string) => (await recados(vendedor)).filter((m) => m.remetente_id !== vendedor);
  const limpar = () => banco.db.exec(`delete from public.mensagens where conversa_id like 'compras-%'`);

  test('previsão: o maior número do prazo, em dias corridos, com o dia da semana', async () => {
    const r = await banco.db.query<{ p: string | null }>(
      `select public.previsao_de_chegada('2026-10-27 10:00-03', p) as p from (values ('2–3 dias'), ('7-10 DIAS'), ('1 dia'), ('a combinar')) t(p)`
    );
    expect(r.rows.map((x) => x.p)).toEqual(['sex, 30/10', 'sex, 06/11', 'qua, 28/10', null]);
  });

  test('a encomenda nova avisa Compras; o pedido avisa o vendedor — um recado por vendedor e por passo', async () => {
    await limpar();
    const a = await encomendar(BIA, 'dpk', 1);
    const b = await encomendar(BIA, 'roles', 2);
    const daDuda = await encomendar(DUDA, 'dpk', 1);
    const r = (await como<{ id: string; mensagem_id: string }>(
      CAIO,
      `select id, mensagem_id from public.marcar_pedido_realizado(array['${a}'::uuid, '${b}'::uuid, '${daDuda}'::uuid])`
    )) as { id: string; mensagem_id: string }[];
    // As duas da Bia, um recado só; a da Duda, outro
    expect(new Set(r.map((x) => x.mensagem_id)).size).toBe(2);

    const daBia = await recados('bia');
    expect(daBia.map((m) => [m.remetente_id, m.aviso_encomenda, m.pecas])).toEqual([
      ['bia', 'nova_encomenda', 1],
      ['bia', 'nova_encomenda', 1],
      ['caio', 'pedido_realizado', 2],
    ]);
    expect(daBia[0].texto).toBe('Nova encomenda:\n1× OC90 (MAHLE) · DPK');
    expect(daBia[2].texto).toStartWith('Sua encomenda foi realizada:\n1× OC90 (MAHLE) · DPK · previsão até ');
    expect(daBia[2].texto).toContain('2× OC90 (MAHLE) · Roles');
    // Nunca o custo nem o cliente fora da conferência
    for (const m of daBia) {
      expect(m.texto).not.toContain('8,69');
      expect(m.texto).not.toContain('João');
    }

    const participantes = (await banco.db.query<{ colaborador_id: string }>(
      `select colaborador_id from public.participantes where conversa_id = 'compras-bia' order by 1`
    )).rows.map((p) => p.colaborador_id);
    // O vendedor e Compras (e quem já agiu por ele, como o Gerente da loja); nunca outro vendedor
    expect(participantes).toEqual(expect.arrayContaining(['bia', 'caio']));
    expect(participantes).not.toContain('duda');
    // A Bia lê a conversa dela (RLS de verdade); a Duda não
    expect(((await como(BIA, `select id from public.mensagens where conversa_id = 'compras-bia'`)) as unknown[]).length).toBe(3);
    expect(await como(DUDA, `select id from public.mensagens where conversa_id = 'compras-bia'`)).toEqual([]);
  });

  test('chegada: Pirassununga em conferência (com a observação); filial em transferência; cada um o seu recado', async () => {
    await limpar();
    const pira = await encomendar(BIA, 'dpk', 1);
    const filial = await encomendar(DUDA, 'dpk', 1);
    await como(CAIO, `select * from public.marcar_pedido_realizado(array['${pira}'::uuid, '${filial}'::uuid])`);
    await como(CAIO, `select * from public.marcar_em_conferencia(array['${pira}'::uuid, '${filial}'::uuid])`);

    const bia = (await recados('bia')).at(-1)!;
    expect(bia.aviso_encomenda).toBe('em_conferencia');
    expect(bia.texto).toBe('Sua peça chegou e está em conferência no estoque:\n1× OC90 (MAHLE) · DPK\n   Obs.: João 99999-0000\nConfirme quando receber.');
    const duda = (await recados('duda')).at(-1)!;
    expect(duda.texto).toStartWith('Sua peça chegou em Pirassununga e segue para a sua loja:');

    await como(CAIO, `select * from public.marcar_chegou_na_loja(array['${filial}'::uuid])`);
    expect((await recados('duda')).at(-1)!.aviso_encomenda).toBe('em_conferencia');
  });

  test('Recebi e Entregue avisam Compras — e tocar duas vezes não repete o recado', async () => {
    await limpar();
    const id = await encomendar(BIA, 'dpk', 1);
    await como(CAIO, `select * from public.marcar_pedido_realizado(array['${id}'::uuid])`);
    await como(CAIO, `select * from public.marcar_em_conferencia(array['${id}'::uuid])`);
    const recebi = (await como<{ r: string }>(BIA, `select public.confirmar_recebimento('${id}') as r`)) as { r: string }[];
    expect(recebi[0].r).toStartWith('rec-');
    expect(await como(BIA, `select public.confirmar_recebimento('${id}') as r`)).toEqual([{ r: null }]);
    await como(BIA, `select public.marcar_entregue('${id}')`);
    await como(BIA, `select public.marcar_entregue('${id}')`);
    const doVendedor = (await recados('bia')).filter((m) => m.remetente_id === 'bia').map((m) => m.texto.split('\n')[0]);
    expect(doVendedor).toEqual(['Nova encomenda:', 'Peça recebida na loja:', 'Peça entregue ao cliente:']);
  });

  test('cancelar, problema e desistência também avisam — e o recado é de quem fez', async () => {
    await limpar();
    const minha = await encomendar(BIA, 'dpk', 1);
    // O próprio vendedor cancelou: o recado vai para Compras
    const r = (await como<{ r: string }>(BIA, `select public.cancelar_encomenda('${minha}') as r`)) as { r: string }[];
    expect(r[0].r).toStartWith('rec-');
    expect((await recados('bia')).at(-1)!.texto.split('\n')[0]).toBe('Encomenda cancelada pelo vendedor:');

    await limpar();
    const outra = await encomendar(BIA, 'dpk', 1);
    await como(CAIO, `select * from public.marcar_pedido_realizado(array['${outra}'::uuid])`);
    await como(BIA, `select public.marcar_problema('${outra}', 'preco', 'NF veio R$ 2 a mais')`);
    await como(CAIO, `select public.resolver_problema('${outra}', 'Fornecedor manteve o preço cotado', 'aceita')`);
    await como(BIA, `select public.cliente_desistiu('${outra}')`);
    await como(BIA, `select public.cliente_desistiu('${outra}')`);
    await como(CAIO, `select public.destinar_desistencia('${outra}', 'devolver')`);

    expect((await recados('bia')).slice(2).map((m) => [m.remetente_id, m.texto.split('\n')[0], m.texto.split('\n').at(-1)])).toEqual([
      ['bia', 'Problema na encomenda:', 'Preço diferente — NF veio R$ 2 a mais'],
      ['caio', 'Problema resolvido:', 'Aceita como está: Fornecedor manteve o preço cotado'],
      ['bia', 'Cliente desistiu da encomenda:', 'Compras decide o destino da peça.'],
      ['caio', 'Sua encomenda foi cancelada por Compras:', 'Motivo: Cliente desistiu · peça devolvida ao fornecedor'],
    ]);
    expect((await deCompras('bia')).length).toBe(3);
  });

  test('a cotação pedida avisa Compras; a resposta volta ao vendedor com a peça (o botão "Abrir cotação")', async () => {
    await limpar();
    const sol = ((await como<{ id: string }>(BIA, "select public.pedir_ao_comprador('zz-88', 'Gol 1.0', 'urgente') as id")) as { id: string }[])[0].id;
    expect((await recados('bia')).map((m) => [m.remetente_id, m.aviso_encomenda, m.cotacao_codigo, m.texto])).toEqual([
      ['bia', 'solicitacao', 'ZZ88', 'Cotação pedida ao comprador:\nZZ88 · Gol 1.0\nObs.: urgente'],
    ]);

    const opcoes = `'[{"fornecedor":"Barros","marca":"Nakata","venda":1289.9,"custo":45,"prazo":"2 dias"},{"fornecedor":"Cobra","venda":79,"prazo":null}]'::jsonb`;
    const r = (await como<{ r: string }>(CAIO, `select public.responder_solicitacao('${sol}', ${opcoes}, false, null) as r`)) as { r: string }[];
    expect(r[0].r).toStartWith('rec-');
    const resposta = (await recados('bia')).at(-1)!;
    expect([resposta.remetente_id, resposta.aviso_encomenda, resposta.cotacao_codigo]).toEqual(['caio', 'resposta', 'ZZ88']);
    // Da mais barata; nunca o custo
    expect(resposta.texto).toBe('Cotação da peça ZZ88 (Gol 1.0):\n• Cobra: R$ 79,00\n• Barros (Nakata): R$ 1.289,90 · 2 dias');

    // A regra que vale para toda conversa: o custo (45) nunca vai no recado
    expect(resposta.texto).not.toContain('45');

    // "Não encontrei" também avisa sempre — é o único aviso da resposta
    await como(CAIO, `select public.responder_solicitacao('${sol}', null, true, 'sem estoque')`);
    expect((await recados('bia')).at(-1)!.texto).toBe('Cotação da peça ZZ88 (Gol 1.0): não encontrei. sem estoque');
  });

  test('no mesmo lote, conferência e transferência do mesmo vendedor: cada peça devolve o recado dela', async () => {
    await limpar();
    const aqui = await encomendar(DUDA, 'dpk', 1);
    const filial = await encomendar(DUDA, 'dpk', 1);
    // Sem loja: recebe direto (em conferência); a outra vai por transferência
    await banco.db.exec(`update public.encomendas set loja = null where id = '${aqui}'`);
    await como(CAIO, `select * from public.marcar_pedido_realizado(array['${aqui}'::uuid, '${filial}'::uuid])`);
    type Linha = { id: string; situacao: string; mensagem_id: string };
    const r = (await como<Linha>(CAIO, `select id, situacao, mensagem_id from public.marcar_em_conferencia(array['${aqui}'::uuid, '${filial}'::uuid])`)) as Linha[];
    const recadoDe = async (m: string) => (await banco.db.query<{ aviso_encomenda: string }>(`select aviso_encomenda from public.mensagens where id = '${m}'`)).rows[0].aviso_encomenda;
    const porId = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(await recadoDe(porId[aqui].mensagem_id)).toBe('em_conferencia');
    expect(await recadoDe(porId[filial].mensagem_id)).toBe('em_transferencia');
  });
});

describe('validade do preço e a visão do Gerente (SPEC-comunicacao-recebimento)', () => {
  test('o preço vale 24 h depois de consultado: mais velho, cote de novo', async () => {
    await banco.db.exec(`update public.precos_b2b set consultado_em = now() - interval '25 hours' where fornecedor = 'roles' and codigo = 'OC90'`);
    expect(await encomendar(BIA, 'roles', 1)).toContain('mais de 24 h');
    await banco.db.exec(`update public.precos_b2b set consultado_em = now() - interval '23 hours' where fornecedor = 'roles' and codigo = 'OC90'`);
    const id = await encomendar(BIA, 'roles', 1);
    const r = (await como<{ vencido: boolean }>(CAIO, `select preco_consultado_em < now() - interval '22 hours' as vencido from public.encomendas_de_compras(array['encomendada']) where id = '${id}'`)) as { vencido: boolean }[];
    expect(r).toEqual([{ vencido: true }]);
    await banco.db.exec(`update public.precos_b2b set consultado_em = now() where fornecedor = 'roles' and codigo = 'OC90'`);
  });

  test('o Gerente vê as peças da loja dele que esperam o vendedor, e quando já pode agir', async () => {
    await banco.db.exec(`update public.encomendas set situacao = 'entregue' where situacao in ('em_conferencia', 'recebida')`);
    const pira = await encomendar(BIA, 'dpk', 1);
    const filial = await encomendar(DUDA, 'dpk', 1);
    await como(CAIO, `select * from public.marcar_pedido_realizado(array['${pira}'::uuid, '${filial}'::uuid])`);
    await como(CAIO, `select * from public.marcar_em_conferencia(array['${pira}'::uuid, '${filial}'::uuid])`);
    await como(CAIO, `select * from public.marcar_chegou_na_loja(array['${filial}'::uuid])`);

    type DaLoja = { id: string; nome_do_vendedor: string; pode_agir: boolean };
    const daLoja = () => como<DaLoja>(GIL, 'select id, nome_do_vendedor, pode_agir from public.encomendas_da_loja()');
    expect(await daLoja()).toEqual([{ id: pira, nome_do_vendedor: 'Bia', pode_agir: false }]);
    await banco.db.exec(`update public.encomendas set conferencia_em = now() - interval '25 hours' where id = '${pira}'`);
    expect(((await daLoja()) as DaLoja[])[0].pode_agir).toBe(true);
    expect(await como(BIA, 'select * from public.encomendas_da_loja()')).toContain('Gerente');
  });
});

test('o pedido grava o dia previsto (o mesmo do recado), para o lembrete de atraso', async () => {
  const id = await encomendar(BIA, 'dpk', 1);
  await como(CAIO, `select * from public.marcar_pedido_realizado(array['${id}'::uuid])`);
  const r = (await banco.db.query<{ igual: boolean }>(
    `select previsao_chegada = public.dia_previsto(pedido_em, prazo) and previsao_chegada = (now() at time zone 'America/Sao_Paulo')::date + 3 as igual
       from public.encomendas where id = '${id}'`
  )).rows[0];
  expect(r).toEqual({ igual: true });
});

describe('as devoluções ao fornecedor (métrica por fornecedor)', () => {
  type Dev = { situacao: string; devolvida: boolean; motivo: string | null; desfecho: string | null };
  const dev = async (id: string) =>
    (await banco.db.query<Dev>(
      `select situacao, devolvida_em is not null as devolvida, motivo_devolucao as motivo, desfecho_problema as desfecho from public.encomendas where id = '${id}'`
    )).rows[0];
  const pedirEChegar = async (id: string) => {
    await como(CAIO, `select * from public.marcar_pedido_realizado(array['${id}'::uuid])`);
    await como(CAIO, `select * from public.marcar_em_conferencia(array['${id}'::uuid])`);
  };

  test('troca e devolvida são devolução (com o motivo do problema); aceita não; devolvida cancela', async () => {
    const [troca, devolvida, aceita] = [await encomendar(BIA, 'dpk', 1), await encomendar(BIA, 'dpk', 1), await encomendar(BIA, 'dpk', 1)];
    for (const id of [troca, devolvida, aceita]) {
      await pedirEChegar(id);
      await como(BIA, `select public.marcar_problema('${id}', 'avariada', null)`);
    }
    expect(await como(CAIO, `select public.resolver_problema('${troca}', 'ok', 'qualquer')`)).toContain('desfecho');
    await como(CAIO, `select public.resolver_problema('${troca}', 'Vem outra amanhã', 'troca')`);
    await como(CAIO, `select public.resolver_problema('${devolvida}', 'Sem reposição', 'devolvida')`);
    await como(CAIO, `select public.resolver_problema('${aceita}', 'Avaria só na caixa', 'aceita')`);
    expect([await dev(troca), await dev(devolvida), await dev(aceita)]).toEqual([
      { situacao: 'em_conferencia', devolvida: true, motivo: 'avariada', desfecho: 'troca' },
      { situacao: 'cancelada', devolvida: true, motivo: 'avariada', desfecho: 'devolvida' },
      { situacao: 'em_conferencia', devolvida: false, motivo: null, desfecho: 'aceita' },
    ]);
  });

  test('cliente desistiu: devolver é devolução; estoque não; e a jornada leva os dois campos', async () => {
    const [devolver, estoque] = [await encomendar(BIA, 'dpk', 1), await encomendar(BIA, 'dpk', 1)];
    for (const id of [devolver, estoque]) {
      await pedirEChegar(id);
      await como(BIA, `select public.cliente_desistiu('${id}')`);
    }
    await como(CAIO, `select public.destinar_desistencia('${devolver}', 'devolver')`);
    await como(CAIO, `select public.destinar_desistencia('${estoque}', 'estoque')`);
    expect([(await dev(devolver)).motivo, (await dev(estoque)).devolvida]).toEqual(['desistencia', false]);
    const j = (await como<{ motivo_devolucao: string }>(GIL, `select motivo_devolucao from public.jornada_das_encomendas(null, null) where id = '${devolver}'`)) as { motivo_devolucao: string }[];
    expect(j).toEqual([{ motivo_devolucao: 'desistencia' }]);
  });
});

describe('correções da revisão (26/10/2026)', () => {
  const avancar = async (id: string) => {
    await como(CAIO, `select * from public.marcar_pedido_realizado(array['${id}'::uuid])`);
    await como(CAIO, `select * from public.marcar_em_conferencia(array['${id}'::uuid])`);
  };

  test('encomenda sem vendedor (colaborador apagado): ninguém dá Recebi nem Entregue por ela', async () => {
    const id = await encomendar(BIA, 'dpk', 1);
    await avancar(id);
    await banco.db.exec(`update public.encomendas set vendedor_id = null where id = '${id}'`);
    expect(await como(DUDA, `select public.confirmar_recebimento('${id}')`)).toContain('não encontrada');
    expect(await como(BIA, `select public.confirmar_recebimento('${id}')`)).toContain('não encontrada');
  });

  test('problema já resolvido não se resolve de novo: a entregue não vira cancelada', async () => {
    const id = await encomendar(BIA, 'dpk', 1);
    await avancar(id);
    await como(BIA, `select public.marcar_problema('${id}', 'preco', null)`);
    await como(CAIO, `select public.resolver_problema('${id}', 'Mantido', 'aceita')`);
    expect(await como(CAIO, `select public.resolver_problema('${id}', 'De novo', 'devolvida')`)).toContain('não tem problema aberto');
  });

  test('previsão só de prazo em dias, até 60; texto livre não trava o pedido', async () => {
    const r = await banco.db.query<{ p: string | null }>(
      `select public.dia_previsto('2026-10-27 10:00-03', p)::text as p from (values ('48h'), ('chega 15/11'), ('3 DIAS'), ('pedido 123456789012'), ('90 dias')) t(p)`
    );
    expect(r.rows.map((x) => x.p)).toEqual([null, null, '2026-10-30', null, null]);
  });

  test('TI que faz o passo entra na conversa (lê o recado para a notificação)', async () => {
    await banco.db.exec(`
      insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e9');
      insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo)
      values ('eli', '00000000-0000-0000-0000-0000000000e9', 'Eli', 'eli', 'TI', 'Pirassununga', 5, true);
    `);
    const id = await encomendar(BIA, 'dpk', 1);
    const r = (await como<{ mensagem_id: string }>('00000000-0000-0000-0000-0000000000e9', `select mensagem_id from public.marcar_pedido_realizado(array['${id}'::uuid])`)) as { mensagem_id: string }[];
    expect(await como('00000000-0000-0000-0000-0000000000e9', `select id from public.mensagens where id = '${r[0].mensagem_id}'`)).toEqual([{ id: r[0].mensagem_id }]);
  });

  test('o frete fica congelado na encomenda (a margem desconta custo + frete)', async () => {
    const id = await encomendar(BIA, 'dpk', 1);
    const j = (await como<{ custo: number; frete: number }>(GIL, `select custo::float as custo, frete::float as frete from public.jornada_das_encomendas(null, null) where id = '${id}'`)) as unknown[];
    expect(j).toEqual([{ custo: 8.69, frete: 10 }]);
  });
});

test('a jornada usa o nome de HOJE do fornecedor: "Dpk" antigo e "DPK" novo são o mesmo', async () => {
  const antiga = await encomendar(BIA, 'dpk', 1);
  await banco.db.exec(`update public.encomendas set fornecedor_nome = 'Dpk' where id = '${antiga}'`);
  const nova = await encomendar(BIA, 'dpk', 1);
  const nomes = (await como<{ fornecedor_nome: string }>(GIL, `select distinct fornecedor_nome from public.jornada_das_encomendas(null, null) where id in ('${antiga}', '${nova}')`)) as unknown[];
  expect(nomes).toEqual([{ fornecedor_nome: 'DPK' }]);
});

describe('revisão final (26/10/2026)', () => {
  test('as colunas do recado só o banco grava: pela API, ninguém forja nem altera um recado', async () => {
    const sol = ((await como<{ id: string }>(BIA, "select public.pedir_ao_comprador('XY1', null, null) as id")) as { id: string }[])[0].id;
    // O recado do pedido tem o id que a tela já sabe: 'rec-' + a solicitação
    const recado = `rec-${sol}`;
    expect((await banco.db.query(`select aviso_encomenda from public.mensagens where id = '${recado}'`)).rows).toEqual([{ aviso_encomenda: 'solicitacao' }]);

    // A Bia, participante, tenta gravar um "Em conferência" falso
    await como(BIA, `insert into public.mensagens (id, conversa_id, remetente_id, tipo, texto, aviso_encomenda, encomenda_ids)
                     values ('falso', 'compras-bia', 'bia', 'texto', 'oi', 'em_conferencia', array[gen_random_uuid()])`);
    expect((await banco.db.query(`select aviso_encomenda, encomenda_ids from public.mensagens where id = 'falso'`)).rows).toEqual([
      { aviso_encomenda: null, encomenda_ids: null },
    ]);
    // E não troca o recado que existe
    await como(BIA, `update public.mensagens set aviso_encomenda = 'em_conferencia' where id = '${recado}'`);
    expect((await banco.db.query(`select aviso_encomenda from public.mensagens where id = '${recado}'`)).rows).toEqual([{ aviso_encomenda: 'solicitacao' }]);
  });

  test('"não encontrei" depois de responder tira as opções: o vendedor não encomenda a que saiu', async () => {
    const sol = ((await como<{ id: string }>(BIA, "select public.pedir_ao_comprador('XY2', null, null) as id")) as { id: string }[])[0].id;
    await como(CAIO, `select public.responder_solicitacao('${sol}', '[{"fornecedor":"X","venda":120,"prazo":"1 dia"}]'::jsonb, false, null)`);
    const resposta = ((await como<{ resposta_id: string }>(BIA, "select resposta_id from public.solicitacoes_de_cotacao('XY2')")) as { resposta_id: string }[])[0].resposta_id;
    await como(CAIO, `select public.responder_solicitacao('${sol}', null, true, 'o fornecedor não tem mais')`);
    expect(await como(BIA, "select resposta_id from public.solicitacoes_de_cotacao('XY2')")).toEqual([{ resposta_id: null }]);
    expect(await como(BIA, `select public.encomendar_resposta('${resposta}', 1, '')`)).toContain('não encontrada');
  });

  test('"no ar" vem do banco (a mesma regra de estacao_online)', async () => {
    await banco.db.exec(`insert into public.estacoes_cotacao (nome, visto_em) values ('teste-1', now() - interval '2 minutes'), ('teste-2', now() - interval '4 minutes')`);
    const r = (await banco.db.query<{ nome: string; no_ar: boolean }>(`select e.nome, public.no_ar(e) as no_ar from public.estacoes_cotacao e where e.nome like 'teste-%' order by 1`)).rows;
    expect(r).toEqual([{ nome: 'teste-1', no_ar: true }, { nome: 'teste-2', no_ar: false }]);
  });
});

test('"não encontrei" com encomenda já feita pela resposta é recusado; e o dinheiro grande sai certo', async () => {
  const sol = ((await como<{ id: string }>(BIA, "select public.pedir_ao_comprador('XY3', null, null) as id")) as { id: string }[])[0].id;
  await como(CAIO, `select public.responder_solicitacao('${sol}', '[{"fornecedor":"X","venda":1200000,"prazo":"1 dia"}]'::jsonb, false, null)`);
  const texto = (await banco.db.query<{ texto: string }>(`select texto from public.mensagens where aviso_encomenda = 'resposta' and cotacao_codigo = 'XY3'`)).rows[0].texto;
  expect(texto).toContain('R$ 1.200.000,00');
  const resposta = ((await como<{ resposta_id: string }>(BIA, "select resposta_id from public.solicitacoes_de_cotacao('XY3')")) as { resposta_id: string }[])[0].resposta_id;
  await como(BIA, `select public.encomendar_resposta('${resposta}', 1, '')`);
  expect(await como(CAIO, `select public.responder_solicitacao('${sol}', null, true, 'acabou')`)).toContain('cancele a encomenda');
});
