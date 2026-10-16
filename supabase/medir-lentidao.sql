-- ============================================================
-- CONECTA — ONDE O BANCO ESTÁ GASTANDO TEMPO (16/10/2026)
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- O Elias sentiu tudo lento um dia depois de o ponto entrar para mais
-- gente. Medido de fora: uma consulta vazia leva 0,5 s, contra 0,2 s do
-- "estou vivo" da autenticação — o tempo está dentro do banco. Aqui:
--
--   1. CONSULTAS   as 15 que mais somam tempo desde a última limpeza
--                  das estatísticas (pg_stat_statements): chamadas,
--                  tempo médio e o total. A primeira linha é a culpada.
--   2. LEITURA     tabelas lidas inteiras (seq_scan) com muitas linhas:
--                  é índice faltando.
--   3. CONEXÕES    quantas abertas, e quantas ativas agora.
--   4. CACHE       quanto se acha na memória; abaixo de 99% o disco
--                  entra no caminho.
-- ============================================================

select secao, item, valor, observacao from (

  (select 1 as ordem, row_number() over (order by s.total_exec_time desc) as pos,
          '1. CONSULTAS' as secao,
          left(regexp_replace(s.query, '\s+', ' ', 'g'), 140) as item,
          round(s.total_exec_time / 1000)::text || ' s no total' as valor,
          s.calls || ' chamadas · ' || round(s.mean_exec_time::numeric, 1) || ' ms em média' as observacao
     from extensions.pg_stat_statements s
    order by s.total_exec_time desc
    limit 15)

  union all

  (select 2, row_number() over (order by t.seq_scan * t.n_live_tup desc), '2. LEITURA', t.relname,
          t.seq_scan || ' leituras inteiras',
          t.n_live_tup || ' linhas · ' || coalesce(t.idx_scan, 0) || ' por índice'
     from pg_stat_user_tables t
    where t.schemaname = 'public' and t.n_live_tup > 500
    order by t.seq_scan * t.n_live_tup desc
    limit 10)

  union all

  (select 3, 1, '3. CONEXÕES', 'abertas / ativas agora',
          count(*)::text || ' / ' || count(*) filter (where state = 'active')::text,
          'limite do plano: ' || current_setting('max_connections')
     from pg_stat_activity)

  union all

  (select 4, 1, '4. CACHE', 'achado na memória',
          round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)::text || ' %',
          'abaixo de 99 % o disco entra no caminho'
     from pg_statio_user_tables)

) r
order by ordem, pos;
