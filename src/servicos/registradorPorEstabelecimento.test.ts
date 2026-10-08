/**
 * O REGISTRADOR POR ESTABELECIMENTO (registrador-por-estabelecimento.sql).
 *
 * Homologação, etapa 2a — leiaute do AFD vigente (gov.br, 31/07/2026) e
 * Anexo IX da Portaria 671/2021: NSR por CNPJ começando em 1; o código da
 * marcação é o hash do AFD (posições 001 a 073 do tipo "7" + o hash da
 * marcação anterior do mesmo CNPJ); CPF e coletor na marcação; eventos de
 * empregado (tipo "5") e de estabelecimento (tipo "2"), intocáveis.
 *
 * O hash é refeito AQUI, por fora do banco, a partir do texto do leiaute:
 * se a formatação do banco mudar, a prova cai.
 */
import { test, expect, beforeAll } from 'bun:test';
import { createHash } from 'node:crypto';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
let domingo = false;

const ANA = '00000000-0000-0000-0000-0000000000b1'; // loja A
const BRUNO = '00000000-0000-0000-0000-0000000000b2'; // loja B
const TIAGO = '00000000-0000-0000-0000-0000000000b3'; // TI, admin
const RITA = '00000000-0000-0000-0000-0000000000b4'; // RH
const CNPJ_A = '11222333000144';
const CNPJ_B = '55666777000188';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('registrador-por-estabelecimento.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${BRUNO}'), ('${TIAGO}'), ('${RITA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, cnpj, ativo) values
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, '11.222.333/0001-44', true),
      ('bruno', '${BRUNO}', 'Bruno', 'bruno', 'Balcão', 'Descalvado', 1, '${CNPJ_B}', true),
      ('tiago', '${TIAGO}', 'Tiago', 'tiago', 'TI', 'Pirassununga', 5, '${CNPJ_A}', true),
      ('rita', '${RITA}', 'Rita', 'rita', 'RH', 'Pirassununga', 2, '${CNPJ_A}', true);
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123'), ('Descalvado', 'DES456')
      on conflict (loja) do update set codigo = excluded.codigo;
  `);
  domingo = (await banco.db.query<{ d: boolean }>(
    `select extract(dow from now() at time zone 'America/Sao_Paulo') = 0 as d`
  )).rows[0].d;
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

/** "AAAA-MM-ddThh:mm:00-0300" — Brasília, sem horário de verão desde 2019. */
const dh = (instante: string | Date) =>
  `${new Date(new Date(instante).getTime() - 3 * 3600_000).toISOString().slice(0, 16)}:00-0300`;

/** O registro tipo "7", posições 001 a 073, refeito pelo texto do leiaute. */
const linhaTipo7 = (o: any) =>
  `${String(o.nsr).padStart(9, '0')}7${dh(o.registrado_em)}${String(o.cpf).padStart(12, '0')}${dh(o.registrado_em)}${o.coletor}${o.offline ? '1' : '0'}`;
const sha = (texto: string) => createHash('sha256').update(texto).digest('hex');

/** Marca fora da jornada (sem tipo): funciona em qualquer dia, e não depende da jornada. */
const marcar = async (uid: string, codigo: string, loja: string, coletor: string | null = null) => {
  await banco.como(uid);
  const r = await um(
    coletor === null
      ? `select public.registrar_marcacao('${codigo}', '${loja}', null) as r`
      : `select public.registrar_marcacao('${codigo}', '${loja}', null, '${coletor}') as r`
  );
  await banco.como(null);
  return r.r.original;
};

test('o formato DH do AFD: segundos 00 e o fuso -0300', async () => {
  const r = await um(`select public.afd_data_hora('2026-10-07T10:31:45Z'::timestamptz) as d`);
  expect(r.d).toBe('2026-10-07T07:31:00-0300');
  expect((await um(`select public.afd_numero('123.456.789-01', 12) as n`)).n).toBe('012345678901');
});

test('NSR POR ESTABELECIMENTO: cada CNPJ começa em 1, sem um mexer no outro', async () => {
  const a1 = await marcar(ANA, 'ABC123', 'Pirassununga');
  const b1 = await marcar(BRUNO, 'DES456', 'Descalvado');
  const a2 = await marcar(ANA, 'ABC123', 'Pirassununga');
  expect([a1.cnpj_empregador, Number(a1.nsr)]).toEqual([CNPJ_A, 1]);
  expect([b1.cnpj_empregador, Number(b1.nsr)]).toEqual([CNPJ_B, 1]);
  expect([a2.cnpj_empregador, Number(a2.nsr)]).toEqual([CNPJ_A, 2]);
});

test('O HASH É O DO AFD, ENCADEADO NO MESMO CNPJ — e a marcação de outro CNPJ não entra na corrente', async () => {
  const [a1, a2] = await varios(`select * from public.marcacoes_originais where cnpj_empregador = '${CNPJ_A}' order by nsr`);
  const [b1] = await varios(`select * from public.marcacoes_originais where cnpj_empregador = '${CNPJ_B}' order by nsr`);
  expect(linhaTipo7(a1)).toHaveLength(73);
  // A primeira do CNPJ: sem hash anterior
  expect(a1.codigo_verificacao).toBe(sha(linhaTipo7(a1)));
  expect(b1.codigo_verificacao).toBe(sha(linhaTipo7(b1)));
  // A segunda da Ana encadeia na primeira da Ana — o Bruno, no meio, é de outro CNPJ
  expect(a2.codigo_verificacao).toBe(sha(linhaTipo7(a2) + a1.codigo_verificacao));
});

test('O COLETOR: o app manda "01", o navegador "02"; quem não diz fica "05"', async () => {
  const doApp = await marcar(ANA, 'ABC123', 'Pirassununga', '01');
  const doNavegador = await marcar(ANA, 'ABC123', 'Pirassununga', '02');
  const inventado = await marcar(ANA, 'ABC123', 'Pirassununga', '99');
  expect([doApp.coletor, doNavegador.coletor, inventado.coletor]).toEqual(['01', '02', '05']);
  // E o coletor entra no hash
  const anterior = await um(`select codigo_verificacao from public.marcacoes_originais where cnpj_empregador = '${CNPJ_A}' and nsr = ${Number(doApp.nsr) - 1}`);
  expect(doApp.codigo_verificacao).toBe(sha(linhaTipo7(doApp) + anterior.codigo_verificacao));
});

test('A BATIDA NA JORNADA leva o coletor até a original (pela transação)', async () => {
  if (domingo) return;
  await banco.como(BRUNO);
  const r = await um(`select public.registrar_marcacao('DES456', 'Descalvado', 'entrada', '01') as r`);
  await banco.como(null);
  expect(r.r.fora_da_jornada).toBeNull();
  expect(r.r.original.coletor).toBe('01');
  expect(r.r.registro.nsr).toBe(r.r.original.nsr);
  expect(r.r.registro.codigo_verificacao).toBe(r.r.original.codigo_verificacao);
});

test('O CPF ENTRA NA MARCAÇÃO, e o empregado entra no REP (tipo "5", inclusão) — no mesmo NSR do CNPJ', async () => {
  const antes = Number((await um(`select ultimo from public.contador_nsr_estabelecimento where cnpj = '${CNPJ_A}'`)).ultimo);
  await banco.db.exec(`insert into public.cpf_colaborador (colaborador_id, cpf) values ('ana', '12345678909')`);
  const evento = await um(`select * from public.eventos_rep where cnpj = '${CNPJ_A}' and tipo = 5 and cpf = '12345678909'`);
  expect(evento).toMatchObject({ operacao: 'I', nome: 'Ana', responsavel_cpf: '' });
  expect(Number(evento.nsr)).toBe(antes + 1);
  const comCpf = await marcar(ANA, 'ABC123', 'Pirassununga', '01');
  expect(comCpf.cpf).toBe('12345678909');
  expect(Number(comCpf.nsr)).toBe(antes + 2);
  expect(linhaTipo7(comCpf).slice(34, 46)).toBe('012345678909');
});

test('ALTERAÇÕES DO EMPREGADO viram eventos; presença e foto, não', async () => {
  const contar = async () => Number((await um(`select count(*) n from public.eventos_rep where tipo = 5 and cpf = '12345678909'`)).n);
  const inicio = await contar();
  await banco.db.exec(`update public.colaboradores set presenca = 'ausente', foto = 'perfil/ana/2.jpg' where id = 'ana'`);
  expect(await contar()).toBe(inicio);
  // Nome, ativo e CNPJ só o RH muda (a trava da ficha): o caminho real
  await banco.como(RITA);
  await banco.db.exec(`update public.colaboradores set nome = 'Ana Paula' where id = 'ana'`);
  await banco.db.exec(`update public.colaboradores set ativo = false where id = 'ana'`);
  await banco.db.exec(`update public.colaboradores set ativo = true where id = 'ana'`);
  await banco.como(null);
  const ops = (await varios(`select operacao, nome from public.eventos_rep where tipo = 5 and cpf = '12345678909' order by nsr`)).map((e) => `${e.operacao} ${e.nome}`);
  expect(ops).toEqual(['I Ana', 'A Ana Paula', 'E Ana Paula', 'I Ana Paula']);
});

test('MUDOU DE CNPJ: sai de um estabelecimento ("E") e entra no outro ("I")', async () => {
  await banco.como(RITA);
  await banco.db.exec(`update public.colaboradores set cnpj = '${CNPJ_B}' where id = 'ana'`);
  await banco.como(null);
  const saida = await um(`select * from public.eventos_rep where cnpj = '${CNPJ_A}' and tipo = 5 and cpf = '12345678909' order by nsr desc limit 1`);
  const entrada = await um(`select * from public.eventos_rep where cnpj = '${CNPJ_B}' and tipo = 5 and cpf = '12345678909' order by nsr desc limit 1`);
  expect(saida.operacao).toBe('E');
  expect(entrada.operacao).toBe('I');
  await banco.como(RITA);
  await banco.db.exec(`update public.colaboradores set cnpj = '${CNPJ_A}' where id = 'ana'`);
  await banco.como(null);
});

test('O ESTABELECIMENTO: só o administrador cadastra, e cada mudança vira tipo "2" com o CPF de quem fez', async () => {
  await banco.db.exec(`insert into public.cpf_colaborador (colaborador_id, cpf) values ('tiago', '98765432100'), ('rita', '11144477735')`);
  await banco.como(RITA);
  const daRita = await erroDe(`insert into public.estabelecimentos (cnpj, razao_social, local) values ('${CNPJ_A}', 'X', 'Y')`);
  await banco.como(TIAGO);
  const doTiago = await erroDe(`insert into public.estabelecimentos (cnpj, razao_social, local) values ('${CNPJ_A}', 'Malachias Autopeças Ltda', 'Rua A, 1 — Pirassununga')`);
  const alterou = await erroDe(`update public.estabelecimentos set local = 'Rua A, 10 — Pirassununga' where cnpj = '${CNPJ_A}'`);
  await banco.como(null);
  expect(daRita).not.toBeNull();
  expect(doTiago).toBeNull();
  expect(alterou).toBeNull();
  const eventos = await varios(`select razao_social, local, responsavel_cpf from public.eventos_rep where tipo = 2 and cnpj = '${CNPJ_A}' order by nsr`);
  expect(eventos).toEqual([
    { razao_social: 'Malachias Autopeças Ltda', local: 'Rua A, 1 — Pirassununga', responsavel_cpf: '98765432100' },
    { razao_social: 'Malachias Autopeças Ltda', local: 'Rua A, 10 — Pirassununga', responsavel_cpf: '98765432100' },
  ]);
});

test('O REGISTRO DO REP NÃO SE ALTERA NEM SE APAGA — nem pela chave de serviço; e só o RH o lê', async () => {
  const [e] = await varios(`select cnpj, nsr from public.eventos_rep limit 1`);
  expect(await erroDe(`update public.eventos_rep set nome = 'x' where cnpj = '${e.cnpj}' and nsr = ${e.nsr}`)).toContain('não se altera');
  expect(await erroDe(`delete from public.eventos_rep where cnpj = '${e.cnpj}' and nsr = ${e.nsr}`)).toContain('não se altera');
  expect(await erroDe(`truncate public.eventos_rep`)).toContain('não se altera');
  await banco.como(ANA);
  const daAna = (await varios(`select 1 from public.eventos_rep`)).length;
  const gravaDireto = await erroDe(`insert into public.eventos_rep (cnpj, nsr, tipo) values ('${CNPJ_A}', 999, 5)`);
  await banco.como(RITA);
  const daRita = (await varios(`select 1 from public.eventos_rep`)).length;
  await banco.como(null);
  expect(daAna).toBe(0);
  expect(gravaDireto).not.toBeNull();
  expect(daRita).toBeGreaterThan(0);
});

test('A DECISÃO PELO PAR (CNPJ, NSR) — e o aplicativo antigo, só com o NSR, ainda funciona enquanto ele for único', async () => {
  // O NSR 1 existe nos dois CNPJs (Ana e Bruno): sem o CNPJ, é ambíguo
  await banco.como(RITA);
  const ambiguo = await erroDe(`select public.tratar_marcacao(1, 'desconsiderada', null, 'teste')`);
  const certo = await erroDe(`select public.tratar_marcacao(1, 'desconsiderada', null, 'teste', '${CNPJ_B}')`);
  await banco.como(null);
  expect(ambiguo).toContain('Mais de um estabelecimento');
  expect(certo).toBeNull();
  expect(await um(`select cnpj, decisao from public.tratamento_marcacao where cnpj = '${CNPJ_B}' and nsr = 1`)).toEqual({
    cnpj: CNPJ_B,
    decisao: 'desconsiderada',
  });
});
