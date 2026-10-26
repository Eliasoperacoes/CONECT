-- ============================================================
-- CONECTA — DE ONDE VEM O TRÁFEGO DO BANCO (26/10/2026)
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- O Egress do Supabase é quase todo banco (a barra verde do painel): o que
-- as consultas DEVOLVEM aos aparelhos. Aqui, as 15 consultas que mais
-- devolveram linhas desde a última limpeza das estatísticas (21/10/2026,
-- auditoria-leve.sql), com quantas vezes rodaram e quantas linhas por vez.
--
-- A tabela de cada consulta aparece no começo do texto (from "tabela").
-- Uma linha de ponto ou de mensagem tem algumas centenas de bytes: muitas
-- linhas por vez, muitas vezes ao dia, é a carga completa se repetindo.
-- ============================================================

select row_number() over (order by s.rows desc)                     as pos,
       left(regexp_replace(s.query, '\s+', ' ', 'g'), 120)          as consulta,
       s.calls                                                      as vezes,
       s.rows                                                       as linhas_no_total,
       round(s.rows::numeric / nullif(s.calls, 0))                  as linhas_por_vez,
       (select stats_reset from extensions.pg_stat_statements_info) as medindo_desde
  from extensions.pg_stat_statements s
 where s.query ilike '%from "public"%' or s.query ilike '%from public.%'
 order by s.rows desc
 limit 15;
