-- ============================================================
-- ZERAR A MEDIÇÃO (30/10/2026)
--
-- Limpa os contadores de consultas do banco (pg_stat_statements) para a
-- próxima medição (medir-estabilidade.sql) contar só o que veio depois.
-- NÃO MEXE EM DADO NENHUM: são só os contadores.
--
-- Rode logo depois da mudança que se quer medir — a primeira foi a
-- sincronização pelo que mudou, no ponto e nas apurações (30/10/2026) — e
-- meça dois ou três dias úteis depois.
-- ============================================================

select extensions.pg_stat_statements_reset();

-- CONFERÊNCIA: a hora da limpeza, em Brasília — tem de ser agora
select to_char(stats_reset at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as medindo_desde
  from extensions.pg_stat_statements_info;
