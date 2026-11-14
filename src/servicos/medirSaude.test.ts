/**
 * O CHECK-UP DO BANCO (medir-saude.sql, 14/11/2026).
 *
 * A consulta roda no SQL Editor de produção e devolve um veredito por
 * item. Aqui ela roda num banco local montado pelo esquema, com as partes
 * que só existem no Supabase (pg_stat_statements, pg_cron, pg_net, o
 * tamanho dos arquivos) no lugar, com as mesmas colunas. O que se prende:
 * a consulta roda inteira, e cada veredito acende quando deve — um
 * check-up que diz OK para tudo é pior que nenhum.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;

type Linha = { secao: string; item: string; valor: string; veredito: string; leitura: string };
const checkup = async () => (await banco.db.query<Linha>(lerSql('medir-saude.sql'))).rows;
const linha = async (item: string) => (await checkup()).find((l) => l.item.startsWith(item));

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    alter table storage.objects add column if not exists metadata jsonb;
    create table extensions.pg_stat_statements (
      query text, calls bigint, mean_exec_time float8, total_exec_time float8,
      userid oid
    );
    -- Sem papel dito, a consulta é de um aparelho logado
    do $$ begin
      execute format('alter table extensions.pg_stat_statements alter column userid set default %s',
                     (select oid from pg_roles where rolname = 'authenticated'));
    end $$;
    create table extensions.pg_stat_statements_info (stats_reset timestamptz);
    insert into extensions.pg_stat_statements_info values (now() - interval '3 days');
    create schema cron;
    create table cron.job (jobid bigint, jobname text, schedule text, active boolean);
    create table cron.job_run_details (jobid bigint, status text, return_message text, start_time timestamptz);
    create schema net;
    create table net._http_response (status_code int, timed_out boolean, error_msg text, created timestamptz default now());
  `);
}, 60_000);

test('roda inteira e traz as oito seções, cada linha com veredito', async () => {
  const linhas = await checkup();
  const secoes = [...new Set(linhas.map((l) => l.secao))];
  // A LIMPEZA só lista tabela com linha morta: no banco recém-montado pode não haver
  expect(secoes.filter((s) => s !== '4. LIMPEZA')).toEqual([
    '1. TAMANHO', '2. CACHE', '3. CONEXÕES', '5. CONSULTAS', '6. ÍNDICES', '7. SEGURANÇA', '8. AGENDADAS',
  ]);
  for (const l of linhas) expect(['OK', 'ATENÇÃO', 'PROBLEMA', '—']).toContain(l.veredito);
});

test('o esquema de hoje não deixa tabela sem RLS', async () => {
  const rls = await linha('Tabelas sem RLS');
  expect(rls?.valor).toBe('0');
  expect(rls?.veredito).toBe('OK');
});

test('tabela nova sem RLS acende PROBLEMA, com o nome dela', async () => {
  await banco.db.exec('create table public.esquecida_sem_rls (id int)');
  const rls = await linha('Tabelas sem RLS');
  expect(rls?.veredito).toBe('PROBLEMA');
  expect(rls?.valor).toContain('esquecida_sem_rls');
  await banco.db.exec('drop table public.esquecida_sem_rls');
});

test('tarefa agendada: falhou, ou parou de rodar, é PROBLEMA; rodou certo é OK', async () => {
  await banco.db.exec(`
    insert into cron.job values (1, 'apurar-ponto', '0 6 * * *', true),
                                (2, 'lembrar-pendencias', '0 11 * * *', true),
                                (3, 'alertar-sem-bater', '*/15 * * * *', true);
    insert into cron.job_run_details values
      (1, 'succeeded', '1 row', now() - interval '5 hours'),
      (2, 'failed', 'connection refused', now() - interval '1 hour'),
      (3, 'succeeded', '1 row', now() - interval '3 days');
  `);
  const linhas = (await checkup()).filter((l) => l.secao === '8. AGENDADAS');
  const de = (nome: string) => linhas.find((l) => l.item === nome)?.veredito;
  expect(de('apurar-ponto')).toBe('OK');
  expect(de('lembrar-pendencias')).toBe('PROBLEMA');
  expect(de('alertar-sem-bater')).toBe('PROBLEMA');
});

test('a função que recebeu o pedido e falhou aparece, mesmo com o cron dizendo que deu certo', async () => {
  expect((await linha('Respostas das funções'))?.veredito).toBe('OK');
  await banco.db.exec(`insert into net._http_response (status_code, timed_out, error_msg) values (200, false, null), (500, false, null)`);
  const resp = await linha('Respostas das funções');
  expect(resp?.veredito).toBe('PROBLEMA');
  expect(resp?.leitura).toContain('HTTP 500');
});

test('consulta lenta: acima de 500 ms por vez é PROBLEMA; a rodada poucas vezes não conta', async () => {
  await banco.db.exec(`
    insert into extensions.pg_stat_statements values
      ('select * from registros_ponto where x', 50, 650, 32500),
      ('select * from mensagens where y', 40, 150, 6000),
      ('select rara', 3, 9000, 27000);
  `);
  const lentas = (await checkup()).filter((l) => l.item.startsWith('lenta: '));
  expect(lentas.map((l) => [l.item.slice(7, 40), l.veredito])).toEqual([
    ['select * from registros_ponto whe', 'PROBLEMA'],
    ['select * from mensagens where y', 'ATENÇÃO'],
  ]);
});

test('a consulta lenta do painel do Supabase aparece, mas sem veredito: não é do sistema', async () => {
  await banco.db.exec(`
    insert into extensions.pg_stat_statements (query, calls, mean_exec_time, total_exec_time, userid)
    values ('SELECT name FROM pg_timezone_names', 37, 900, 33300, (select oid from pg_roles where rolname = 'postgres'));
  `);
  const painel = (await checkup()).find((l) => l.item.startsWith('lenta: SELECT name FROM pg_timezone_names'));
  expect(painel?.veredito).toBe('—');
  expect(painel?.leitura).toContain('papel postgres');
  const doSistema = (await checkup()).find((l) => l.item.startsWith('lenta: select * from registros_ponto'));
  expect(doSistema?.veredito).toBe('PROBLEMA');
});

test('arquivos: o tamanho vem do metadata do Storage', async () => {
  await banco.db.exec(`insert into storage.objects (bucket_id, name, metadata)
                       values ('anexos', 'a.pdf', '{"size": 600000000}')`);
  const storage = await linha('Storage (arquivos)');
  expect(storage?.veredito).toBe('ATENÇÃO');
  expect(storage?.leitura).toContain('1 arquivos');
});
