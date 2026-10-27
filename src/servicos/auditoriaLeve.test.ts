/**
 * AUDITORIA E PARTICIPANTES SEM REFAZER A REGRA A CADA LINHA
 * (auditoria-leve.sql, 21/10/2026).
 *
 * A auditoria era a consulta mais cara do banco (409 ms, 1.327 vezes): a
 * regra rodava em cada linha, e todo aparelho a pedia a cada registro novo.
 * Aqui: cada um vê o mesmo de antes, linha por linha; e o aparelho de quem
 * não lê a auditoria nem a pede.
 */
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { leAuditoria } from '../tipos';

let banco: BancoLocal;
// [id, setor, nivel]
const PESSOAS: Array<[string, string, number]> = [
  ['ti', 'TI', 5],
  ['rh', 'RH', 2],
  ['diretor', 'Diretoria', 4],
  ['ana', 'Balcão', 1],
  ['bia', 'Balcão', 1],
  ['caio', 'Estoque', 1],
];
const uid = (i: number) => `00000000-0000-0000-0000-0000000005${String(i).padStart(2, '0')}`;

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('auditoria-leve.sql').replace("notify pgrst, 'reload schema';", ''));
  await banco.db.exec('alter table auth.users disable trigger all;');
  for (const [i, [id, setor, nivel]] of PESSOAS.entries()) {
    await banco.db.exec(`
      insert into auth.users (id) values ('${uid(i)}');
      insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo)
        values ('${id}', '${uid(i)}', '${id}', '${id}', '${setor}', 'Pirassununga', ${nivel}, true);
    `);
  }
  await banco.db.exec(`
    insert into public.conversas (id, tipo, nome) values ('c-ana-bia', 'individual', 'x'), ('c-bia-caio', 'individual', 'y'), ('g-todos', 'grupo', 'Todos');
    insert into public.participantes (conversa_id, colaborador_id) values
      ('c-ana-bia', 'ana'), ('c-ana-bia', 'bia'), ('c-bia-caio', 'bia'), ('c-bia-caio', 'caio'),
      ('g-todos', 'ana'), ('g-todos', 'bia'), ('g-todos', 'caio'), ('g-todos', 'rh');
    insert into public.auditoria (id, usuario_nome, acao, categoria, detalhes) values
      ('a1', 'x', 'Login', 'seguranca', 'd'), ('a2', 'y', 'Cadastro', 'usuario', 'd');
  `);
}, 120_000);

const como = async (i: number, sql: string) => {
  await banco.como(uid(i));
  try {
    return (await banco.db.query<any>(sql)).rows;
  } finally {
    await banco.como(null);
  }
};

const ordenado = (linhas: any[]) => linhas.map((l) => `${l.conversa_id}|${l.colaborador_id}`).sort();

test('participantes: cada pessoa vê exatamente o que via com participo_da_conversa', async () => {
  for (const [i, [id]] of PESSOAS.entries()) {
    const nova = ordenado(await como(i, 'select conversa_id, colaborador_id from public.participantes'));
    // A regra antiga, escrita à mão, na mesma sessão
    await banco.db.exec(`select set_config('teste.uid', '${uid(i)}', false)`);
    const antiga = ordenado(
      (
        await banco.db.query<any>(
          `select conversa_id, colaborador_id from public.participantes
            where colaborador_id = public.meu_colaborador_id() or public.participo_da_conversa(conversa_id)`
        )
      ).rows
    );
    await banco.como(null);
    expect({ id, ve: nova }).toEqual({ id, ve: antiga });
  }
});

test('a Ana vê as conversas dela e quem está nelas — e não a conversa da Bia com o Caio', async () => {
  const ana = ordenado(await como(3, 'select conversa_id, colaborador_id from public.participantes'));
  expect(ana).toContain('c-ana-bia|bia');
  expect(ana).toContain('g-todos|caio');
  expect(ana.some((l) => l.startsWith('c-bia-caio'))).toBe(false);
});

test('auditoria: só o TI e o RH leem, como antes', async () => {
  const quantos = async (i: number) => (await como(i, 'select id from public.auditoria')).length;
  expect([await quantos(0), await quantos(1), await quantos(2), await quantos(3)]).toEqual([2, 2, 0, 0]);
});

test('a regra da tela é a do banco: TI e RH', () => {
  expect(leAuditoria({ nivel: 5, setor: 'TI' })).toBe(true);
  expect(leAuditoria({ nivel: 2, setor: 'RH' })).toBe(true);
  expect(leAuditoria({ nivel: 4, setor: 'Diretoria' })).toBe(false);
  expect(leAuditoria({ nivel: 1, setor: 'Balcão' })).toBe(false);
  expect(leAuditoria(null)).toBe(false);
});

test('quem não lê a auditoria nem a pede, nem a escuta ao vivo', () => {
  const fonte = readFileSync('src/servicos/nuvemComunicacao.ts', 'utf8');
  expect(fonte).toContain('if (!leAuditoria(euNoAparelho())) return true;');
  const canalDaRede = fonte.slice(fonte.indexOf(".channel('conecta-rede')"), fonte.indexOf("subscribe(acompanharCanal('rede'))"));
  expect(canalDaRede).not.toContain("table: 'auditoria'");
  expect(fonte).toContain("if (leAuditoria(euNoAparelho())) {\n      supabase\n        .channel('conecta-auditoria')");
});
