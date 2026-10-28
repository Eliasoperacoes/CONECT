-- ============================================================
-- A SAÚDE DO SISTEMA HOJE (29/10/2026) — SÓ LEITURA
--
-- Para o dia em que todo mundo passa a usar: uma linha por indicador, com
-- o número de hoje (no relógio de Brasília) e o que olhar nele. Uma
-- consulta só, de propósito: o SQL Editor mostra só o resultado da última.
--
-- O que o SQL não alcança fica no painel do Supabase: tráfego de saída e
-- mensagens de tempo real em Organization → Usage; conexões de tempo real
-- (limite de 200 no gratuito) em Realtime → Reports.
-- ============================================================

with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as dia),
     inicio as (select (dia::timestamp at time zone 'America/Sao_Paulo') as em from hoje),
     erros as (
       select tela, mensagem, count(*) as vezes, count(distinct colaborador_id) as pessoas
         from public.erros_do_app, inicio
        where ocorrido_em >= inicio.em
        group by tela, mensagem
     )
select * from (
  select 1 as ordem, 'Colaboradores ativos' as indicador,
         count(*)::text as valor, '' as o_que_olhar
    from public.colaboradores where ativo
  union all
  select 2, 'Ativos sem login criado',
         count(*)::text,
         coalesce('Não conseguem entrar: ' || string_agg(nome, ', ' order by nome), 'Todos com login')
    from public.colaboradores where ativo and auth_user_id is null
  union all
  select 3, 'Fizeram login hoje',
         count(*)::text, 'Login novo (sessão já aberta não conta)'
    from auth.users, inicio where last_sign_in_at >= inicio.em
  union all
  select 4, 'Batidas de ponto hoje',
         count(*)::text, count(distinct colaborador_id) || ' pessoas bateram'
    from public.registros_ponto, hoje where data = hoje.dia
  union all
  select 5, 'Horário ainda não confirmado',
         count(*)::text, 'Vão ver "Qual é o seu horário?" na próxima batida'
    from public.colaboradores where ativo and turno_confirmado_em is null and nivel <= 2
  union all
  select 6, 'Mensagens hoje',
         count(*)::text, count(distinct remetente_id) || ' pessoas mandaram'
    from public.mensagens, inicio where criado_em >= inicio.em
  union all
  select 7, 'Erros das telas hoje',
         coalesce(sum(vezes), 0)::text,
         coalesce((select max(pessoas) from erros), 0) || ' pessoas no erro mais comum — detalhe em diagnostico-erros-do-app.sql'
    from erros
  union all
  (select 8, 'Erro mais comum hoje',
          vezes::text, left(tela || ': ' || mensagem, 200)
     from erros order by vezes desc limit 1)
  union all
  select 9, 'Conexões ao banco agora',
         count(*)::text,
         'de ' || current_setting('max_connections') || ' — atenção acima de 80 %'
    from pg_stat_activity
  union all
  select 10, 'Tamanho do banco',
         pg_size_pretty(pg_database_size(current_database())), 'de 500 MB no gratuito'
  union all
  select 11, 'Celulares com o aplicativo',
         count(*)::text, count(distinct colaborador_id) || ' pessoas recebem aviso com o app fechado'
    from public.aparelhos
) t
order by ordem;
