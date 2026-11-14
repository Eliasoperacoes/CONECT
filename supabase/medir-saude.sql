-- ============================================================
-- CONECTA — CHECK-UP DO BANCO (14/11/2026)
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- Uma tabela, uma linha por item, com o veredito:
--
--   OK        nada a fazer
--   ATENÇÃO   medir de novo em uma semana; se repetir, investigar
--   PROBLEMA  mandar o print — tem coisa a corrigir
--
--   1. TAMANHO      banco e arquivos, e as maiores tabelas
--   2. CACHE        quanto se acha na memória (abaixo de 99 % fica lento)
--   3. CONEXÕES     abertas, transação esquecida aberta, travas
--   4. LIMPEZA      linhas mortas que a limpeza automática não levou
--   5. CONSULTAS    as mais lentas por vez e as que mais somam tempo
--   6. ÍNDICES      índice sem uso e tabela lida inteira
--   7. SEGURANÇA    tabela sem RLS, idade das transações, deadlocks
--   8. AGENDADAS    as tarefas da madrugada (pg_cron) e as chamadas delas
--
-- Os limites do plano estão em medir-plano.sql; o tráfego de saída, as
-- mensagens de tempo real e as chamadas de função só no painel, em
-- Organization → Usage (leitura em docs/LIMITES-SUPABASE.md).
-- ============================================================

select secao, item, valor, veredito, leitura from (

  -- 1. TAMANHO --------------------------------------------------
  (select 1 as ordem, 1::bigint as pos, '1. TAMANHO' as secao, 'Banco (dados)' as item,
          pg_size_pretty(pg_database_size(current_database())) as valor,
          case when pg_database_size(current_database()) > 400 * 1024 * 1024 then 'PROBLEMA'
               when pg_database_size(current_database()) > 250 * 1024 * 1024 then 'ATENÇÃO'
               else 'OK' end as veredito,
          round(100.0 * pg_database_size(current_database()) / (500 * 1024 * 1024), 1) || ' % do gratuito (500 MB) · '
            || round(100.0 * pg_database_size(current_database()) / (8::numeric * 1024 * 1024 * 1024), 1) || ' % do Pro (8 GB)' as leitura)

  union all

  (select 1, 2, '1. TAMANHO', 'Storage (arquivos)',
          pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)),
          case when coalesce(sum((metadata->>'size')::bigint), 0) > 800 * 1024 * 1024 then 'PROBLEMA'
               when coalesce(sum((metadata->>'size')::bigint), 0) > 500 * 1024 * 1024 then 'ATENÇÃO'
               else 'OK' end,
          count(*) || ' arquivos · ' || round(100.0 * coalesce(sum((metadata->>'size')::bigint), 0) / (1024 * 1024 * 1024), 1) || ' % do gratuito (1 GB)'
     from storage.objects)

  union all

  (select 1, 2 + row_number() over (order by pg_total_relation_size(c.oid) desc), '1. TAMANHO',
          'tabela ' || c.relname,
          pg_size_pretty(pg_total_relation_size(c.oid)),
          'OK',
          coalesce(s.n_live_tup, 0) || ' linhas, com os índices'
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    order by pg_total_relation_size(c.oid) desc
    limit 5)

  union all

  -- 2. CACHE ----------------------------------------------------
  (select 2, 1, '2. CACHE', 'Tabelas achadas na memória',
          coalesce(taxa::text || ' %', 'sem leitura'),
          case when taxa < 95 then 'PROBLEMA' when taxa < 99 then 'ATENÇÃO' else 'OK' end,
          'abaixo de 99 % o disco entra no caminho e tudo fica lento'
     from (select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as taxa
             from pg_statio_user_tables) x)

  union all

  (select 2, 2, '2. CACHE', 'Índices achados na memória',
          coalesce(taxa::text || ' %', 'sem leitura'),
          case when taxa < 95 then 'PROBLEMA' when taxa < 99 then 'ATENÇÃO' else 'OK' end,
          'idem, para os índices'
     from (select round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) as taxa
             from pg_statio_user_indexes) x)

  union all

  -- 3. CONEXÕES -------------------------------------------------
  (select 3, 1, '3. CONEXÕES', 'Abertas / limite',
          count(*) || ' / ' || current_setting('max_connections'),
          case when count(*) > 0.8 * current_setting('max_connections')::int then 'PROBLEMA'
               when count(*) > 0.6 * current_setting('max_connections')::int then 'ATENÇÃO'
               else 'OK' end,
          count(*) filter (where state = 'active') || ' ativas agora · a maioria é dos serviços do próprio Supabase, num número fixo'
     from pg_stat_activity)

  union all

  (select 3, 2, '3. CONEXÕES', 'Transação esquecida aberta (mais de 5 min)',
          count(*)::text,
          case when count(*) > 0 then 'PROBLEMA' else 'OK' end,
          'segura travas e impede a limpeza das linhas mortas'
     from pg_stat_activity
    where state like 'idle in transaction%'
      and now() - state_change > interval '5 minutes')

  union all

  (select 3, 3, '3. CONEXÕES', 'Consulta mais longa rodando agora',
          coalesce(round(extract(epoch from now() - a.query_start))::text || ' s', 'nenhuma'),
          case when a.query_start is null then 'OK'
               when now() - a.query_start > interval '60 seconds' then 'PROBLEMA'
               when now() - a.query_start > interval '10 seconds' then 'ATENÇÃO'
               else 'OK' end,
          coalesce(a.usename || ': ' || left(regexp_replace(a.query, '\s+', ' ', 'g'), 100), '—')
     from (select 1) um
     left join lateral (
       select query_start, usename, query
         from pg_stat_activity
        where state = 'active'
          and backend_type = 'client backend'
          and pid <> pg_backend_pid()
        order by query_start
        limit 1
     ) a on true)

  union all

  (select 3, 4, '3. CONEXÕES', 'Esperando trava agora',
          count(*)::text,
          case when count(*) > 0 then 'ATENÇÃO' else 'OK' end,
          'uma gravação esperando outra terminar; se repetir, mandar o print'
     from pg_stat_activity
    where wait_event_type = 'Lock')

  union all

  -- 4. LIMPEZA --------------------------------------------------
  (select 4, row_number() over (order by t.n_dead_tup desc), '4. LIMPEZA',
          t.relname,
          t.n_dead_tup || ' mortas de ' || (t.n_live_tup + t.n_dead_tup),
          case when t.n_dead_tup > 1000 and t.n_dead_tup > 0.2 * (t.n_live_tup + t.n_dead_tup) then 'ATENÇÃO' else 'OK' end,
          'última limpeza: ' || coalesce(
            to_char(greatest(t.last_vacuum, t.last_autovacuum) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), 'nunca')
     from pg_stat_user_tables t
    where t.schemaname = 'public' and t.n_dead_tup > 0
    order by t.n_dead_tup desc
    limit 5)

  union all

  -- 5. CONSULTAS ------------------------------------------------
  (select 5, 0, '5. CONSULTAS', 'Medindo desde',
          to_char(stats_reset at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
          '—',
          'os números abaixo somam tudo desde esta data'
     from extensions.pg_stat_statements_info)

  union all

  (select 5, row_number() over (order by s.mean_exec_time desc), '5. CONSULTAS',
          'lenta: ' || left(regexp_replace(s.query, '\s+', ' ', 'g'), 120),
          round(s.mean_exec_time::numeric, 1) || ' ms por vez',
          -- Só a consulta dos aparelhos ganha veredito. A do painel do
          -- Supabase (pg_timezone_names, 14/11/2026) e a do cache de esquema
          -- do PostgREST rodam com outro papel e não são do sistema
          case when coalesce(r.rolname, '') not in ('authenticated', 'anon', 'service_role') then '—'
               when s.mean_exec_time > 500 then 'PROBLEMA'
               when s.mean_exec_time > 100 then 'ATENÇÃO'
               else 'OK' end,
          s.calls || ' chamadas · ' || round(s.total_exec_time / 1000) || ' s no total · papel ' || coalesce(r.rolname, '?')
     from extensions.pg_stat_statements s
     left join pg_roles r on r.oid = s.userid
    where s.calls >= 20
      and s.query not ilike '%pg_stat%'
    order by s.mean_exec_time desc
    limit 5)

  union all

  (select 5, 10 + row_number() over (order by s.total_exec_time desc), '5. CONSULTAS',
          'soma: ' || left(regexp_replace(s.query, '\s+', ' ', 'g'), 120),
          round(s.total_exec_time / 1000) || ' s no total',
          'OK',
          s.calls || ' chamadas · ' || round(s.mean_exec_time::numeric, 1) || ' ms por vez · papel ' || coalesce(r.rolname, '?')
     from extensions.pg_stat_statements s
     left join pg_roles r on r.oid = s.userid
    where s.query not ilike '%pg_stat%'
    order by s.total_exec_time desc
    limit 5)

  union all

  -- 6. ÍNDICES --------------------------------------------------
  (select 6, 1, '6. ÍNDICES', 'Índices nunca usados',
          count(*) || ' (' || pg_size_pretty(coalesce(sum(pg_relation_size(ui.indexrelid)), 0)) || ')',
          case when coalesce(sum(pg_relation_size(ui.indexrelid)), 0) > 50 * 1024 * 1024 then 'ATENÇÃO' else 'OK' end,
          coalesce(left(string_agg(ui.indexrelname, ', ' order by pg_relation_size(ui.indexrelid) desc), 200), '—')
     from pg_stat_user_indexes ui
     join pg_index i on i.indexrelid = ui.indexrelid
    where ui.schemaname = 'public'
      and ui.idx_scan = 0
      and not i.indisunique
      and not i.indisprimary)

  union all

  (select 6, 1 + row_number() over (order by t.seq_scan * t.n_live_tup desc), '6. ÍNDICES',
          'lida inteira: ' || t.relname,
          t.seq_scan || ' vezes',
          case when t.n_live_tup > 10000 and t.seq_scan > coalesce(t.idx_scan, 0) then 'ATENÇÃO' else 'OK' end,
          t.n_live_tup || ' linhas · ' || coalesce(t.idx_scan, 0) || ' leituras por índice'
     from pg_stat_user_tables t
    where t.schemaname = 'public' and t.n_live_tup > 1000 and t.seq_scan > 0
    order by t.seq_scan * t.n_live_tup desc
    limit 5)

  union all

  -- 7. SEGURANÇA ------------------------------------------------
  (select 7, 1, '7. SEGURANÇA', 'Tabelas sem RLS',
          count(*) || coalesce(': ' || string_agg(c.relname, ', ' order by c.relname), ''),
          case when count(*) > 0 then 'PROBLEMA' else 'OK' end,
          'tabela sem RLS fica aberta a qualquer aparelho com a chave pública'
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity)

  union all

  (select 7, 2, '7. SEGURANÇA', 'Idade das transações (wraparound)',
          round(100.0 * age(datfrozenxid) / 2000000000, 1) || ' %',
          case when age(datfrozenxid) > 1500000000 then 'PROBLEMA'
               when age(datfrozenxid) > 1000000000 then 'ATENÇÃO'
               else 'OK' end,
          'perto de 100 % o banco para de gravar; a limpeza automática mantém baixo'
     from pg_database
    where datname = current_database())

  union all

  (select 7, 3, '7. SEGURANÇA', 'Deadlocks',
          deadlocks::text,
          case when deadlocks > 0 then 'ATENÇÃO' else 'OK' end,
          'duas gravações travando uma à outra, desde '
            || coalesce(to_char(stats_reset at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), 'a criação do banco')
     from pg_stat_database
    where datname = current_database())

  union all

  (select 7, 4, '7. SEGURANÇA', 'Gravações desfeitas',
          coalesce(round(100.0 * xact_rollback / nullif(xact_commit + xact_rollback, 0), 2)::text || ' %', '0 %'),
          case when 100.0 * xact_rollback / nullif(xact_commit + xact_rollback, 0) > 5 then 'ATENÇÃO' else 'OK' end,
          xact_rollback || ' de ' || (xact_commit + xact_rollback) || ' · inclui as recusadas pela RLS e as repetidas (23505)'
     from pg_stat_database
    where datname = current_database())

  union all

  -- 8. AGENDADAS ------------------------------------------------
  (select 8, row_number() over (order by j.jobname), '8. AGENDADAS',
          j.jobname || case when j.active then '' else ' (desligada)' end,
          coalesce(to_char(u.start_time at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' · ' || u.status, 'nunca rodou'),
          case when not j.active then 'ATENÇÃO'
               when u.status = 'failed' then 'PROBLEMA'
               when u.start_time is null or u.start_time < now() - interval '2 days' then 'PROBLEMA'
               when f.falhas > 0 then 'ATENÇÃO'
               else 'OK' end,
          'agenda ' || j.schedule || ' (UTC) · ' || coalesce(f.falhas, 0) || ' falhas em 7 dias'
            || coalesce(' · ' || left(u.return_message, 80), '')
     from cron.job j
     left join lateral (
       select d.start_time, d.status, d.return_message
         from cron.job_run_details d
        where d.jobid = j.jobid
        order by d.start_time desc
        limit 1
     ) u on true
     left join lateral (
       select count(*) as falhas
         from cron.job_run_details d
        where d.jobid = j.jobid
          and d.status = 'failed'
          and d.start_time > now() - interval '7 days'
     ) f on true)

  union all

  -- O cron só entrega o pedido; a resposta da função fica em net, por
  -- algumas horas. Erro aqui é a função que recebeu e falhou.
  (select 8, 100, '8. AGENDADAS', 'Respostas das funções (últimas horas)',
          count(*) || ' respostas · ' || count(*) filter (where timed_out or error_msg is not null or status_code >= 400) || ' com erro',
          case when count(*) filter (where timed_out or error_msg is not null or status_code >= 400) > 0 then 'PROBLEMA' else 'OK' end,
          coalesce('último erro: ' || max(coalesce(error_msg, 'HTTP ' || status_code::text))
                     filter (where timed_out or error_msg is not null or status_code >= 400), 'nenhum erro guardado')
     from net._http_response)

) r
order by ordem, pos;
