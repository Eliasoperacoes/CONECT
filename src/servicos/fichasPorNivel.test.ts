/**
 * CADA UM VÊ DA FICHA DOS COLEGAS SÓ O QUE PRECISA
 * (fichas-por-nivel.sql, laudo de 13/10/2026, item 6).
 *
 * No Postgres local, com o próprio delta. A Ana é do balcão; o Bruno é o
 * líder dela; a Carla é do estoque de outra loja (fora da alçada dele — a
 * ficha segue a mesma alçada do ponto, `posso_decidir_jornada`); a Rita é
 * do RH.
 *
 *   nível 1 (todos) ........ nome, cargo, setor, loja, ramal, foto...
 *   nível 2 (pessoa, líder, RH) ... matrícula, CNPJ, admissão, turno, jornada
 *   nível 3 (pessoa, RH) .......... telefone, e-mail, observações, login
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const ANA = '00000000-0000-0000-0000-00000000e0a1';
const BRUNO = '00000000-0000-0000-0000-00000000e0a2';
const CARLA = '00000000-0000-0000-0000-00000000e0a3';
const RITA = '00000000-0000-0000-0000-00000000e0a4';

const como = async <T>(uid: string, sql: string): Promise<{ linhas: T[]; erro: string }> => {
  await banco.como(uid);
  try {
    const r = await banco.db.query<T>(sql);
    return { linhas: r.rows, erro: '' };
  } catch (e) {
    return { linhas: [], erro: (e as Error).message };
  } finally {
    await banco.como(null);
  }
};

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${BRUNO}'), ('${CARLA}'), ('${RITA}');
    alter table auth.users enable trigger all;
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo, telefone, email, observacoes, matricula, cnpj, turno, ramal) values
      ('bruno', '${BRUNO}', 'Bruno', 'bruno', 'Balcão', 'Leme', 2, true, '19 2222', 'bruno@x', null, 'M2', '05041606000199', 'A', '202'),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Leme', 1, true, '19 1111', 'ana@x', 'conversa com o RH', 'M1', '05041606000199', 'B', '201'),
      ('carla', '${CARLA}', 'Carla', 'carla', 'Estoque', 'Descalvado', 1, true, '19 3333', 'carla@x', null, 'M3', '28251342000101', 'A', '301'),
      ('rita', '${RITA}', 'Rita', 'rita', 'RH', 'Pirassununga', 2, true, '19 4444', 'rita@x', null, 'M4', '05041606000199', 'A', '401');
    update public.colaboradores set responsavel_id = 'bruno' where id = 'ana';
  `);
  await banco.db.exec(lerSql('fichas-por-nivel.sql').replace("notify pgrst, 'reload schema';", ''));
}, 120_000);

test('NÍVEL 1: todo logado lê o diretório, e não lê telefone, e-mail nem observações direto', async () => {
  const diretorio = await como<{ nome: string; ramal: string }>(CARLA, `select nome, ramal from public.colaboradores where id = 'ana'`);
  expect(diretorio.erro).toBe('');
  expect(diretorio.linhas).toEqual([{ nome: 'Ana', ramal: '201' }]);
  for (const coluna of ['telefone', 'email', 'observacoes', 'login', 'matricula', 'turno', 'auth_user_id', 'senha_ativacao']) {
    const r = await como(CARLA, `select ${coluna} from public.colaboradores where id = 'ana'`);
    expect({ coluna, recusado: r.erro.includes('permission denied') }).toEqual({ coluna, recusado: true });
  }
});

test('a CARLA (colega de outra loja) só recebe a própria ficha reservada', async () => {
  const r = await como<{ id: string; telefone: string | null }>(CARLA, `select id, telefone from public.fichas_reservadas() order by id`);
  expect(r.linhas).toEqual([{ id: 'carla', telefone: '19 3333' }]);
});

test('o BRUNO (líder) recebe o nível 2 da Ana — e o nível 3 dela vem VAZIO', async () => {
  const r = await como<any>(BRUNO, `select id, matricula, cnpj, turno, telefone, email, observacoes, login from public.fichas_reservadas() order by id`);
  const ana = r.linhas.find((l) => l.id === 'ana');
  expect(ana).toEqual({ id: 'ana', matricula: 'M1', cnpj: '05041606000199', turno: 'B', telefone: null, email: null, observacoes: null, login: null });
  // A própria ficha dele vem inteira; a Carla, que não é dele, não vem
  expect(r.linhas.find((l) => l.id === 'bruno')?.telefone).toBe('19 2222');
  expect(r.linhas.some((l) => l.id === 'carla')).toBe(false);
});

test('a RITA (RH) recebe as fichas inteiras de todos', async () => {
  const r = await como<any>(RITA, `select id, telefone, observacoes, login from public.fichas_reservadas() order by id`);
  expect(r.linhas.map((l) => l.id)).toEqual(['ana', 'bruno', 'carla', 'rita']);
  expect(r.linhas.find((l) => l.id === 'ana')).toEqual({ id: 'ana', telefone: '19 1111', observacoes: 'conversa com o RH', login: 'ana' });
});

test('minha_ficha() devolve a ficha inteira de quem pergunta — e só dela', async () => {
  const r = await como<any>(ANA, `select id, telefone, observacoes, turno from public.minha_ficha()`);
  expect(r.linhas).toEqual([{ id: 'ana', telefone: '19 1111', observacoes: 'conversa com o RH', turno: 'B' }]);
});

test('o RH grava com insert e, se existir, update — o upsert seria recusado pela trava', async () => {
  const novo = await como(RITA, `insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo, telefone) values ('davi', 'Davi', 'davi', 'Balcão', 'Leme', 1, true, '19 5555')`);
  expect(novo.erro).toBe('');
  const atualizado = await como<{ id: string }>(RITA, `update public.colaboradores set telefone = '19 6666' where id = 'davi' returning id`);
  expect(atualizado.linhas).toEqual([{ id: 'davi' }]);
  const upsert = await como(RITA, `insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo) values ('davi', 'Davi', 'davi', 'Balcão', 'Leme', 1, true) on conflict (id) do update set nome = excluded.nome, telefone = excluded.telefone`);
  // (como o app fazia: o upsert reescreve TODAS as colunas, inclusive as travadas)
  expect(upsert.erro).toContain('permission denied');
  // E a própria pessoa continua mudando a presença dela
  const presenca = await como<{ id: string }>(ANA, `update public.colaboradores set presenca = 'ocupado' where id = 'ana' returning id`);
  expect(presenca.linhas).toEqual([{ id: 'ana' }]);
});

test('O CANAL AO VIVO transmite um número, não a ficha — e o número muda a cada alteração', async () => {
  const publicadas = await banco.db.query<{ t: string }>(`select tablename as t from pg_publication_tables where pubname = 'supabase_realtime'`);
  const tabelas = publicadas.rows.map((r) => r.t);
  expect(tabelas).not.toContain('colaboradores');
  expect(tabelas).toContain('colaboradores_versao');
  const antes = Number((await banco.db.query<{ v: string }>(`select versao as v from public.colaboradores_versao`)).rows[0].v);
  await como(ANA, `update public.colaboradores set presenca = 'disponivel' where id = 'ana'`);
  const depois = Number((await banco.db.query<{ v: string }>(`select versao as v from public.colaboradores_versao`)).rows[0].v);
  expect(depois).toBe(antes + 1);
  // E qualquer logado lê o número (é só um contador)
  expect((await como(CARLA, `select versao from public.colaboradores_versao`)).erro).toBe('');
});

test('o diretório do app é EXATAMENTE a lista que o banco libera', async () => {
  const { readFileSync } = await import('node:fs');
  const nuvem = readFileSync('src/servicos/nuvem.ts', 'utf8');
  const doApp = /const COLUNAS_DO_DIRETORIO =\s*'([^']+)'/.exec(nuvem)![1].split(',').map((c) => c.trim()).sort();
  const liberadas = (await banco.db.query<{ c: string }>(`
    select column_name as c from information_schema.columns
     where table_schema = 'public' and table_name = 'colaboradores'
       and has_column_privilege('authenticated', 'public.colaboradores', column_name, 'select')`)).rows.map((r) => r.c).sort();
  expect(doApp).toEqual(liberadas);
});

test('o esquema.sql traz o mesmo texto do delta (menos a seção 5, que mora no da senha)', async () => {
  const { readFileSync } = await import('node:fs');
  const delta = readFileSync('supabase/fichas-por-nivel.sql', 'utf8');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const SEP = '-- ------------------------------------------------------------\n';
  const corpo = delta
    .slice(delta.indexOf('-- As três colunas que a produção tem'), delta.lastIndexOf(SEP, delta.indexOf('-- 5. OS CUPONS')))
    .trimEnd()
    // A trava ganhou a coluna do "ponto desde" depois (ponto-desde.sql, 15/10/2026):
    // o esquema traz a versão de hoje, no lugar dela
    .replace('ramal, responsavel_id, ativo, criado_em\n  ) on', 'ramal, responsavel_id, ativo, criado_em, ponto_desde\n  ) on');
  expect(corpo).toContain('criado_em, ponto_desde');
  expect(esquema.includes(corpo)).toBe(true);
  // E o delta novo diz o mesmo que o esquema
  expect(readFileSync('supabase/ponto-desde.sql', 'utf8')).toContain('ramal, responsavel_id, ativo, criado_em, ponto_desde\n  ) on');
  for (const peca of ['create or replace function public.fichas_reservadas()', 'create or replace function public.minha_ficha()', 'create or replace function public.senhas_para_entregar()']) {
    expect({ peca, vezes: esquema.split(peca).length - 1 }).toEqual({ peca, vezes: 1 });
  }
});
