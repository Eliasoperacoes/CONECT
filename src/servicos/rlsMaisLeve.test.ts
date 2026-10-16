/**
 * A LEITURA DO PONTO FICOU LEVE, E CADA UM VÊ O MESMO DE ANTES
 * (rls-mais-leve.sql, 16/10/2026).
 *
 * As políticas perguntavam `posso_decidir_jornada` a cada linha — ler o
 * ponto levava 1,4 s em produção. Agora perguntam a lista
 * `minha_alcada_de_jornada`, montada uma vez. Aqui, para cada pessoa de um
 * organograma com todos os casos (cadeia, regra automática de loja e de
 * setor, RH, Diretoria, outra loja), o que a política nova mostra é
 * comparado com a condição antiga, linha por linha.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;

// [id, setor, loja, nivel, responsavel]
const PESSOAS: Array<[string, string, string, number, string | null]> = [
  ['rh', 'RH', 'Pirassununga', 2, null],
  ['diretor', 'Diretoria', 'Pirassununga', 4, null],
  ['gerente', 'Gerência', 'Pirassununga', 3, null],
  ['lider', 'Balcão', 'Pirassununga', 2, 'gerente'],
  ['ana', 'Balcão', 'Pirassununga', 1, 'lider'],
  ['bia', 'Balcão', 'Pirassununga', 1, null],
  ['caio', 'Estoque', 'Pirassununga', 1, null],
  ['gerente2', 'Gerência', 'Descalvado', 3, null],
  ['davi', 'Balcão', 'Descalvado', 1, null],
  ['eva', 'Balcão', 'Descalvado', 1, 'gerente2'],
];
const uid = (i: number) => `00000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`;

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('rls-mais-leve.sql'));
  await banco.db.exec('alter table auth.users disable trigger all;');
  for (const [i, [id, setor, loja, nivel]] of PESSOAS.entries()) {
    await banco.db.exec(`
      insert into auth.users (id) values ('${uid(i)}');
      insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo)
        values ('${id}', '${uid(i)}', '${id}', '${id}', '${setor}', '${loja}', ${nivel}, true);
      insert into public.registros_ponto (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja)
        values ('p-${id}', '${id}', '2026-09-15', 'entrada', '2026-09-15T10:30:00Z', '07:30', 'ajuste_rh', '${loja}');
      insert into public.ajustes_jornada (id, colaborador_id, data, tipo, minutos, minutos_trabalhados, minutos_previstos)
        values ('a-${id}', '${id}', '2026-09-15', 'hora_extra', 10, 500, 490);
    `);
  }
  // A cadeia gravada pelo dono do banco: sem desligar, o gatilho do
  // organograma devolveria o responsável antigo (só o RH move)
  await banco.db.exec('alter table public.colaboradores disable trigger colaboradores_organograma_protegido;');
  for (const [id, , , , chefe] of PESSOAS) {
    if (chefe) await banco.db.exec(`update public.colaboradores set responsavel_id = '${chefe}' where id = '${id}'`);
  }
  await banco.db.exec('alter table public.colaboradores enable trigger colaboradores_organograma_protegido;');
}, 120_000);

const ids = (r: { rows: Array<{ id: string }> }) => r.rows.map((l) => l.id).sort();

/** O que a política NOVA deixa ver, como a pessoa */
const peloRls = async (i: number, tabela: string) => {
  await banco.como(uid(i));
  try {
    return ids(await banco.db.query<{ id: string }>(`select id from public.${tabela}`));
  } finally {
    await banco.como(null);
  }
};

/** O que a condição ANTIGA deixava ver: a mesma sessão, a condição escrita à mão */
const pelaRegraAntiga = async (i: number, tabela: string, comRh: boolean) => {
  await banco.db.exec(`select set_config('teste.uid', '${uid(i)}', false)`);
  try {
    return ids(
      await banco.db.query<{ id: string }>(
        `select id from public.${tabela}
          where colaborador_id = public.meu_colaborador_id()
             ${comRh ? 'or public.cuido_de_pessoas()' : ''}
             or public.posso_decidir_jornada(colaborador_id)`
      )
    );
  } finally {
    await banco.como(null);
  }
};

test('ponto: cada pessoa vê exatamente as mesmas batidas de antes', async () => {
  for (const [i, [id]] of PESSOAS.entries()) {
    expect({ id, ve: await peloRls(i, 'registros_ponto') }).toEqual({
      id,
      ve: await pelaRegraAntiga(i, 'registros_ponto', true),
    });
  }
});

test('apuração: cada pessoa vê exatamente as mesmas de antes (sem o RH explícito, como era)', async () => {
  for (const [i, [id]] of PESSOAS.entries()) {
    expect({ id, ve: await peloRls(i, 'ajustes_jornada') }).toEqual({
      id,
      ve: await pelaRegraAntiga(i, 'ajustes_jornada', false),
    });
  }
});

test('o caso de cada um continua o de sempre', async () => {
  const quem = (id: string) => PESSOAS.findIndex(([p]) => p === id);
  // O líder: a Ana pela cadeia; Bia e Davi pelo setor (ainda sem responsável);
  // a própria, porque responde por alguém. Nem o Caio (outro setor) nem a Eva
  // (cadeia de outro)
  expect(await peloRls(quem('lider'), 'registros_ponto')).toEqual(['p-ana', 'p-bia', 'p-davi', 'p-lider']);
  // O gerente de Descalvado: a Eva pela cadeia, o Davi pela loja, e a própria
  expect(await peloRls(quem('gerente2'), 'registros_ponto')).toEqual(['p-davi', 'p-eva', 'p-gerente2']);
  // Quem não responde por ninguém vê só a sua
  expect(await peloRls(quem('ana'), 'registros_ponto')).toEqual(['p-ana']);
});

test('a alçada é perguntada uma vez por pessoa, não por linha', () => {
  const sql = lerSql('rls-mais-leve.sql');
  expect(sql).toContain('select c.id from public.colaboradores c where public.posso_decidir_jornada(c.id);');
  const politica = sql.slice(sql.indexOf('create policy ponto_leitura'), sql.indexOf('create policy ajustes_leitura'));
  expect(politica).not.toContain('posso_decidir_jornada');
  expect(politica).toContain('(select public.meu_colaborador_id())');
});
