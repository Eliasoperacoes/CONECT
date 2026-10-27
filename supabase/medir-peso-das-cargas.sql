-- ============================================================
-- CONECTA — QUANTO PESA CADA CARGA COMPLETA (26/10/2026)
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- medir-trafego.sql deu QUANTAS VEZES cada tabela foi baixada inteira
-- desde 21/10. Aqui, QUANTO ELA PESA: o tamanho do conteúdo como a API
-- devolve (JSON), no pior caso — quem enxerga tudo, como o RH e o TI. O
-- ponto conta só a janela de 62 dias que o aparelho baixa.
--
-- peso_x_vezes é o teto do tráfego que cada carga gerou no período: quem
-- não é RH baixa menos. A coluna que importa é a proporção entre as
-- linhas — é ela que diz onde cortar primeiro.
-- ============================================================

with pesos as (
  select 'mensagens' as tabela,
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.mensagens t) as bytes,
         (select count(*) from public.mensagens) as linhas
  union all
  select 'leituras_mensagem',
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.leituras_mensagem t),
         (select count(*) from public.leituras_mensagem)
  union all
  select 'participantes',
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.participantes t),
         (select count(*) from public.participantes)
  union all
  select 'conversas',
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.conversas t),
         (select count(*) from public.conversas)
  union all
  select 'registros_ponto (62 dias)',
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.registros_ponto t where t.data >= current_date - 62),
         (select count(*) from public.registros_ponto where data >= current_date - 62)
  union all
  select 'ajustes_jornada',
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.ajustes_jornada t),
         (select count(*) from public.ajustes_jornada)
  union all
  select 'colaboradores',
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.colaboradores t),
         (select count(*) from public.colaboradores)
  union all
  select 'avisos_rede',
         (select coalesce(sum(length(row_to_json(t)::text)), 0) from public.avisos_rede t),
         (select count(*) from public.avisos_rede)
),
vezes as (
  select p.tabela,
         coalesce((select sum(s.calls) from extensions.pg_stat_statements s
                    where s.query ilike '%from "public"."' || split_part(p.tabela, ' ', 1) || '"%'
                      and s.query ilike 'with pgrst_source%'
                      and s.query not ilike '%insert%'), 0) as vezes
    from pesos p
)
select p.tabela,
       p.linhas,
       pg_size_pretty(p.bytes::bigint)                    as peso_por_carga,
       v.vezes                                            as vezes_desde_21_10,
       pg_size_pretty((p.bytes * v.vezes)::bigint)        as peso_x_vezes
  from pesos p
  join vezes v using (tabela)
 order by p.bytes * v.vezes desc;
