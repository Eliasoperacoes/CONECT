/**
 * A SINCRONIZAÇÃO PELO QUE MUDOU, NO BANCO (sincronizacao-pelo-que-mudou.sql, 30/10/2026).
 *
 * O aparelho só deixa de baixar a tabela inteira se puder confiar em duas
 * coisas: o banco carimba `alterado_em` sozinho em toda inserção e
 * alteração, e o resumo conta exatamente o que a pessoa enxerga — nem uma
 * linha a mais (a RLS vale), nem a menos.
 */
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const RH = '00000000-0000-0000-0000-0000000005a1';
const ANA = '00000000-0000-0000-0000-0000000005a2';
const BIA = '00000000-0000-0000-0000-0000000005a3';

const TABELAS = [
  'registros_ponto', 'ajustes_jornada', 'justificativas_ausencia', 'afastamentos',
  'mensagens', 'leituras_mensagem', 'participantes', 'conversas',
];

const batida = (id: string, quem: string, data: string, tipo = 'entrada') =>
  `insert into public.registros_ponto (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja)
   values ('${id}', '${quem}', '${data}', '${tipo}', '${data}T08:00:00-03:00', '08:00', 'ajuste_rh', 'Pirassununga')`;

beforeAll(async () => {
  banco = await montarBancoLocal();
  // O delta roda de novo sobre o esquema: "pode rodar de novo"
  await banco.db.exec(lerSql('sincronizacao-pelo-que-mudou.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${RH}'), ('${ANA}'), ('${BIA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true),
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true),
      ('bia', '${BIA}', 'Bia', 'bia', 'Estoque', 'Descalvado', 1, true);
  `);
  // Ids com maiúscula, hífen e sublinhado: a ordem de byte é a que o aparelho refaz
  await banco.db.exec(`
    ${batida('a-1', 'ana', '2026-10-28')};
    ${batida('B-2', 'ana', '2026-10-29')};
    ${batida('a_3', 'ana', '2026-10-30')};
    ${batida('velha', 'ana', '2026-08-01')};
    ${batida('bia-1', 'bia', '2026-10-29')};
  `);
}, 120_000);

const como = async <T = any>(uid: string | null, sql: string): Promise<{ linhas: T[]; erro: string | null }> => {
  await banco.como(uid);
  try {
    const r = await banco.db.query<T>(sql);
    return { linhas: r.rows, erro: null };
  } catch (e: any) {
    return { linhas: [], erro: e.message };
  } finally {
    await banco.como(null);
  }
};

const resumo = async (uid: string | null, tabela: string, inicio?: string, fim?: string) => {
  const args = [`'${tabela}'`, inicio ? `'${inicio}'` : 'null', fim ? `'${fim}'` : 'null'].join(', ');
  const { linhas, erro } = await como(uid, `select * from public.resumo_da_sincronizacao(${args})`);
  if (erro) throw new Error(erro);
  return { ...linhas[0], quantidade: Number(linhas[0].quantidade) };
};

/** A conta que o aparelho refaz: SHA-256 dos ids, no sort() do JavaScript */
const assinaturaDe = (ids: string[]) => new Bun.CryptoHasher('sha256').update([...ids].sort().join(',')).digest('hex');

test('o banco carimba sozinho: inserir carimba, alterar carimba de novo', async () => {
  const antes = (await banco.db.query<any>(`select alterado_em from public.registros_ponto where id = 'a-1'`)).rows[0].alterado_em;
  await banco.db.exec(`update public.registros_ponto set justificativa = 'conferido' where id = 'a-1'`);
  const depois = (await banco.db.query<any>(`select alterado_em from public.registros_ponto where id = 'a-1'`)).rows[0].alterado_em;
  expect(antes).toBeTruthy();
  expect(new Date(depois).getTime()).toBeGreaterThan(new Date(antes).getTime());
});

test('o resumo conta só o que a pessoa enxerga, com a assinatura que o aparelho refaz', async () => {
  const daAna = await resumo(ANA, 'registros_ponto', '2026-10-01', '2026-10-31');
  expect(daAna.quantidade).toBe(3);
  expect(daAna.assinatura).toBe(assinaturaDe(['a-1', 'B-2', 'a_3']));

  // A Bia não enxerga a Ana: a RLS vale dentro do resumo
  const daBia = await resumo(BIA, 'registros_ponto', '2026-10-01', '2026-10-31');
  expect(daBia.quantidade).toBe(1);
  expect(daBia.assinatura).toBe(assinaturaDe(['bia-1']));

  // O RH enxerga a rede
  expect((await resumo(RH, 'registros_ponto', '2026-10-01', '2026-10-31')).quantidade).toBe(4);
});

test('a janela de datas recorta o resumo; sem janela, conta tudo', async () => {
  expect((await resumo(ANA, 'registros_ponto', '2026-10-29', '2026-10-30')).quantidade).toBe(2);
  expect((await resumo(ANA, 'registros_ponto')).quantidade).toBe(4);
});

test('remover muda o resumo — é assim que o aparelho percebe o que sumiu', async () => {
  await banco.db.exec(batida('some', 'ana', '2026-10-27'));
  const antes = await resumo(ANA, 'registros_ponto', '2026-10-01', '2026-10-31');
  await banco.db.exec(`delete from public.registros_ponto where id = 'some'`);
  const depois = await resumo(ANA, 'registros_ponto', '2026-10-01', '2026-10-31');
  expect(depois.quantidade).toBe(antes.quantidade - 1);
  expect(depois.assinatura).not.toBe(antes.assinatura);
});

test('nome fora da lista é recusado, e não vira "zero linhas"', async () => {
  const { erro } = await como(ANA, `select * from public.resumo_da_sincronizacao('colaboradores')`);
  expect(erro).toContain('Tabela fora da sincronização');
});

test('as oito tabelas têm o carimbo, e o resumo responde por cada uma', async () => {
  for (const tabela of TABELAS) {
    const { rows } = await banco.db.query<any>(`
      select exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = '${tabela}' and column_name = 'alterado_em') as coluna,
             exists (select 1 from pg_trigger
                      where tgrelid = 'public.${tabela}'::regclass and tgname = 'ultimo_carimbo_de_alteracao') as gatilho`);
    expect({ tabela, ...rows[0] }).toEqual({ tabela, coluna: true, gatilho: true });
    expect(typeof (await resumo(RH, tabela)).quantidade).toBe('number');
  }
});

test('as guardas seguem valendo: o carimbo roda por último e não as atropela', async () => {
  await banco.db.exec(`
    insert into public.conversas (id, tipo, nome) values ('c1', 'grupo', 'Balcão');
    insert into public.mensagens (id, conversa_id, remetente_id, tipo, texto) values ('m1', 'c1', 'ana', 'texto', 'oi');
  `);
  const { rows } = await banco.db.query<any>(`
    select tgname from pg_trigger where tgrelid = 'public.mensagens'::regclass and not tgisinternal
     and tgtype & 2 = 2 order by tgname`);
  expect(rows.at(-1).tgname).toBe('ultimo_carimbo_de_alteracao');

  // Reescrever o texto de outra pessoa continua recusado
  const reescrita = await como(BIA, `update public.mensagens set texto = 'mudei' where id = 'm1'`);
  const texto = (await banco.db.query<any>(`select texto from public.mensagens where id = 'm1'`)).rows[0].texto;
  expect(reescrita.erro !== null || texto === 'oi').toBe(true);
  expect(texto).toBe('oi');
});

test('o esquema.sql traz o mesmo texto do delta', () => {
  const delta = readFileSync('supabase/sincronizacao-pelo-que-mudou.sql', 'utf8');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const corpo = delta.slice(delta.indexOf('-- 1. O CARIMBO'), delta.indexOf("notify pgrst, 'reload schema';")).trim();
  expect(corpo.length).toBeGreaterThan(1000);
  expect(esquema).toContain(corpo);
});
