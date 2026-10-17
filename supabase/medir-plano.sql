-- ============================================================
-- CONECTA — JÁ É HORA DO PLANO PRO? (17/10/2026)
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- Uma linha por limite do plano gratuito: quanto se usa, que fração do
-- limite isso é, e o veredito:
--
--   OK       abaixo de 50 % — nada a fazer
--   ATENÇÃO  de 50 % a 80 % — medir de novo em um mês
--   PAGAR    acima de 80 %, ou o banco enche em menos de 6 meses
--
-- O que o SQL NÃO alcança fica no painel do Supabase, em
-- Organization → Usage: tráfego de saída (5 GB/mês), mensagens de tempo
-- real (2 milhões/mês) e chamadas de função (500 mil/mês). A leitura de
-- cada número está em docs/LIMITES-SUPABASE.md.
-- ============================================================

with
  banco as (
    select pg_database_size(current_database()) as bytes
  ),
  arquivos as (
    select coalesce(sum((metadata->>'size')::bigint), 0) as bytes from storage.objects
  ),
  -- O que entrou nos últimos 30 dias, pelo tamanho médio da linha de cada
  -- tabela que cresce: é o ritmo do banco
  ritmo as (
    select coalesce(sum(
             case when s.n_live_tup > 0
                  then pg_total_relation_size(s.relid)::numeric / s.n_live_tup * t.novas
                  else 0 end), 0) as bytes_por_mes
      from pg_stat_user_tables s
      join (
        select 'registros_ponto' as tabela, count(*) as novas from public.registros_ponto where criado_em > now() - interval '30 days'
        union all select 'marcacoes_originais', count(*) from public.marcacoes_originais where registrado_em > now() - interval '30 days'
        union all select 'ajustes_jornada', count(*) from public.ajustes_jornada where criado_em > now() - interval '30 days'
        union all select 'mensagens', count(*) from public.mensagens where criado_em > now() - interval '30 days'
        union all select 'auditoria', count(*) from public.auditoria where data_hora > now() - interval '30 days'
      ) t on t.tabela = s.relname
     where s.schemaname = 'public'
  ),
  limites as (
    select 1 as ordem, 'Banco (dados)' as limite,
           (select bytes from banco)::numeric as uso, 500 * 1024 * 1024::numeric as gratuito, 'bytes' as unidade
    union all
    select 2, 'Storage (arquivos)', (select bytes from arquivos), 1024 * 1024 * 1024::numeric, 'bytes'
    union all
    select 3, 'Usuários ativos no mês',
           (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'), 50000, 'pessoas'
    union all
    select 4, 'Conexões ao banco agora',
           (select count(*) from pg_stat_activity), current_setting('max_connections')::numeric, 'conexões'
  )

select limite,
       case when unidade = 'bytes' then pg_size_pretty(uso::bigint) else uso::bigint::text end
         || ' de '
         || case when unidade = 'bytes' then pg_size_pretty(gratuito::bigint) else gratuito::bigint::text end
         as uso_do_gratuito,
       round(100 * uso / gratuito, 1) || ' %' as fracao,
       case when 100 * uso / gratuito >= 80 then 'PAGAR'
            when 100 * uso / gratuito >= 50 then 'ATENÇÃO'
            else 'OK' end as veredito
  from limites

union all

select 'Banco: quando enche, no ritmo atual',
       pg_size_pretty((select bytes_por_mes from ritmo)::bigint) || ' por mês',
       case when (select bytes_por_mes from ritmo) > 0
            then round((500 * 1024 * 1024 - (select bytes from banco)) / (select bytes_por_mes from ritmo) / 12, 1) || ' anos'
            else 'sem crescimento' end,
       case when (select bytes_por_mes from ritmo) > 0
             and (500 * 1024 * 1024 - (select bytes from banco)) / (select bytes_por_mes from ritmo) < 6
            then 'PAGAR' else 'OK' end;
