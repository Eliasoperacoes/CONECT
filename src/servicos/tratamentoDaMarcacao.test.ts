/**
 * O TRATAMENTO DA MARCAÇÃO FORA DA JORNADA (tratamento-da-marcacao.sql).
 *
 * Quem decide é quem a alçada do BANCO deixa (`posso_decidir_jornada`):
 * o RH e quem responde pela pessoa. Incluir cria a correção com a hora da
 * original; desconsiderar fica registrado; a decisão não se altera nem se
 * apaga, e a original continua intocada. Provado no Postgres local, com o
 * esquema.sql inteiro e os dois deltas por cima.
 */
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;

const ANA = '00000000-0000-0000-0000-0000000000a1';
const SONIA = '00000000-0000-0000-0000-0000000000a2';
const RITA = '00000000-0000-0000-0000-0000000000a3';
const ZE = '00000000-0000-0000-0000-0000000000a4';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('marcacao-original.sql'));
  await banco.db.exec(lerSql('tratamento-da-marcacao.sql'));
  await banco.db.exec(lerSql('tratamento-da-marcacao.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${SONIA}'), ('${RITA}'), ('${ZE}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, cnpj, ativo, responsavel_id) values
      ('sonia', '${SONIA}', 'Sônia', 'sonia', 'Balcão', 'Pirassununga', 2, '11222333000144', true, null),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, '11222333000144', true, 'sonia'),
      ('rita', '${RITA}', 'Rita', 'rita', 'RH', 'Pirassununga', 2, '11222333000144', true, null),
      ('ze', '${ZE}', 'Zé', 'ze', 'Estoque', 'Descalvado', 1, '11222333000144', true, null);
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123')
      on conflict (loja) do update set codigo = excluded.codigo;
  `);
}, 120_000);

const erroDe = async (sql: string): Promise<string | null> => {
  try {
    await banco.db.exec(sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const um = async (sql: string) => (await banco.db.query(sql)).rows[0] as any;
const varios = async (sql: string) => (await banco.db.query(sql)).rows as any[];

/** A Ana marca sem tipo: fica fora da jornada (jornada completa, ou domingo). */
const marcacaoForaDaAna = async (): Promise<number> => {
  await banco.como(ANA);
  const r = await um(`select public.registrar_marcacao('ABC123', 'Pirassununga', null) as r`);
  await banco.como(null);
  expect(r.r.fora_da_jornada).not.toBeNull();
  return Number(r.r.original.nsr);
};

test('o esquema.sql traz o MESMO texto do delta, e roda sem erro num banco vazio', () => {
  expect(banco.errosDoEsquema).toEqual([]);
  const delta = readFileSync('supabase/tratamento-da-marcacao.sql', 'utf8');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const ini = delta.indexOf('create table if not exists public.tratamento_marcacao');
  const fim = delta.indexOf("notify pgrst, 'reload schema';");
  expect(esquema.includes(delta.slice(ini, fim).trimEnd())).toBe(true);
});

test('QUEM VÊ A FILA: o RH e quem responde pela pessoa — a pessoa e quem não responde, não', async () => {
  const nsr = await marcacaoForaDaAna();
  const fila = async (uid: string) => {
    await banco.como(uid);
    const nsrs = (await varios(`select nsr from public.marcacoes_para_tratar()`)).map((l) => Number(l.nsr));
    await banco.como(null);
    return nsrs;
  };
  expect(await fila(RITA)).toContain(nsr);
  expect(await fila(SONIA)).toContain(nsr);
  expect(await fila(ANA)).not.toContain(nsr);
  expect(await fila(ZE)).not.toContain(nsr);
});

test('QUEM DECIDE: a pessoa não decide a própria, nem quem não responde por ela', async () => {
  const nsr = await marcacaoForaDaAna();
  await banco.como(ANA);
  const daAna = await erroDe(`select public.tratar_marcacao(${nsr}, 'desconsiderada', null, 'minha')`);
  await banco.como(ZE);
  const doZe = await erroDe(`select public.tratar_marcacao(${nsr}, 'desconsiderada', null, 'não é minha')`);
  await banco.como(null);
  expect(daAna).toContain('não responde pela jornada');
  expect(doZe).toContain('não responde pela jornada');
  expect(await um(`select 1 x from public.tratamento_marcacao where nsr = ${nsr}`)).toBeUndefined();
});

test('DESCONSIDERAR: exige justificativa, fica registrado, sai da fila e não muda a jornada', async () => {
  const nsr = await marcacaoForaDaAna();
  const jornadaAntes = Number((await um(`select count(*) n from public.registros_ponto where colaborador_id = 'ana'`)).n);
  await banco.como(RITA);
  const semMotivo = await erroDe(`select public.tratar_marcacao(${nsr}, 'desconsiderada', null, '  ')`);
  const decidiu = await erroDe(`select public.tratar_marcacao(${nsr}, 'desconsiderada', null, 'marcou duas vezes')`);
  const deNovo = await erroDe(`select public.tratar_marcacao(${nsr}, 'desconsiderada', null, 'de novo')`);
  const fila = (await varios(`select nsr from public.marcacoes_para_tratar()`)).map((l) => Number(l.nsr));
  await banco.como(null);
  expect(semMotivo).toContain('justificativa');
  expect(decidiu).toBeNull();
  expect(deNovo).toContain('já foi tratada');
  expect(fila).not.toContain(nsr);
  expect(await um(`select decisao, tipo, decidido_por_nome from public.tratamento_marcacao where nsr = ${nsr}`)).toEqual({
    decisao: 'desconsiderada',
    tipo: null,
    decidido_por_nome: 'Rita',
  });
  expect(Number((await um(`select count(*) n from public.registros_ponto where colaborador_id = 'ana'`)).n)).toBe(jornadaAntes);
});

test('INCLUIR: vira correção no tratamento, com a HORA DA ORIGINAL, sem NSR — e a original não muda', async () => {
  const nsr = await marcacaoForaDaAna();
  const original = await um(`select * from public.marcacoes_originais where nsr = ${nsr}`);
  await banco.como(SONIA);
  const semTipo = await erroDe(`select public.tratar_marcacao(${nsr}, 'incluida', null, 'veio à tarde')`);
  const incluiu = await erroDe(`select public.tratar_marcacao(${nsr}, 'incluida', 'entrada', 'veio à tarde')`);
  await banco.como(null);
  expect(semTipo).toContain('Escolha como');
  expect(incluiu).toBeNull();

  const t = await um(`select * from public.tratamento_marcacao where nsr = ${nsr}`);
  expect(t).toMatchObject({ decisao: 'incluida', tipo: 'entrada', decidido_por_nome: 'Sônia' });
  const r = await um(`select * from public.registros_ponto where id = '${t.registro_id}'`);
  expect(new Date(r.horario).getTime()).toBe(new Date(original.registrado_em).getTime());
  expect(r).toMatchObject({ tipo: 'entrada', metodo: 'ajuste_lider', nsr: null, codigo_verificacao: null, colaborador_id: 'ana' });
  expect(r.justificativa).toBe(`Marcação NSR ${nsr} incluída: veio à tarde`);
  expect(await um(`select * from public.marcacoes_originais where nsr = ${nsr}`)).toEqual(original);
});

test('INCLUIR onde já existe a marcação: recusado, com o caminho certo', async () => {
  const nsr = await marcacaoForaDaAna();
  await banco.como(RITA);
  // A Ana já tem a entrada do dia (a incluída na prova anterior)
  const repetida = await erroDe(`select public.tratar_marcacao(${nsr}, 'incluida', 'entrada', 'de novo')`);
  const pelaRita = await erroDe(`select public.tratar_marcacao(${nsr}, 'incluida', 'saida', 'saiu mais tarde')`);
  await banco.como(null);
  expect(repetida).toContain('Já existe essa marcação');
  expect(pelaRita).toBeNull();
  const t = await um(`select registro_id from public.tratamento_marcacao where nsr = ${nsr}`);
  expect((await um(`select metodo from public.registros_ponto where id = '${t.registro_id}'`)).metodo).toBe('ajuste_rh');
});

test('A DECISÃO NÃO SE ALTERA NEM SE APAGA — nem pela chave de serviço', async () => {
  const [{ nsr }] = await varios(`select nsr from public.tratamento_marcacao limit 1`);
  expect(await erroDe(`update public.tratamento_marcacao set justificativa = 'outra' where nsr = ${nsr}`)).toContain('não se altera');
  expect(await erroDe(`delete from public.tratamento_marcacao where nsr = ${nsr}`)).toContain('não se altera');
  expect(await erroDe(`truncate public.tratamento_marcacao`)).toContain('não se altera');
  await banco.como(RITA);
  const gravaDireto = await erroDe(
    `insert into public.tratamento_marcacao (nsr, decisao, justificativa, decidido_por_nome) values (${nsr}, 'desconsiderada', 'x', 'x')`
  );
  await banco.como(null);
  expect(gravaDireto).not.toBeNull();
});
