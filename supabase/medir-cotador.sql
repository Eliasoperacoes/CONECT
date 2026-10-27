-- ============================================================
-- QUANTO O COTADOR PESA NO BANCO — só leitura, não altera nada.
--
-- Rode depois de 1 a 2 semanas de uso, e de novo quando quiser. Cada
-- tabela que cresce mostra: linhas, tamanho (com índices), quanto entrou
-- nos últimos 7 dias e a projeção para 12 meses no mesmo ritmo.
-- Compare a última coluna com os 500 MB do plano gratuito
-- (docs/LIMITES-SUPABASE.md, supabase/medir-plano.sql).
-- ============================================================

with tabelas(tabela, quando) as (
  values
    ('historico_precos_b2b', 'dia'),          -- uma linha por dia, fornecedor e peça cotada
    ('consultas_cotacao',    'criada_em'),    -- a foto de cada cotação (Histórico e Relatórios)
    ('cotacoes_b2b',         'criada_em'),    -- a fila (apaga sozinha o que passa de 90 dias)
    ('cotacoes_do_dia',      'dia'),
    ('precos_b2b',           'consultado_em'),-- o retrato do preço: fica 30 dias
    ('similares_b2b',        'consultado_em'),-- fica 30 dias
    ('solicitacoes_cotacao', 'criada_em'),
    ('respostas_cotacao',    null),
    ('encomendas',           'criada_em')
),
medida as (
  select t.tabela, t.quando,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', t.tabela), false, true, '')))[1]::text::bigint as linhas,
         case when t.quando is null then null else
           (xpath('/row/n/text()', query_to_xml(format(
              'select count(*) as n from public.%I where %I >= now() - interval ''7 days''', t.tabela, t.quando), false, true, '')))[1]::text::bigint
         end as ultimos_7_dias,
         pg_total_relation_size(format('public.%I', t.tabela)::regclass) as bytes
    from tabelas t
   where to_regclass(format('public.%I', t.tabela)) is not null
)
select tabela,
       linhas,
       pg_size_pretty(bytes) as tamanho,
       case when linhas > 0 then bytes / linhas end as bytes_por_linha,
       ultimos_7_dias,
       case when ultimos_7_dias is null or linhas = 0 then null
            else pg_size_pretty((bytes::numeric / linhas * ultimos_7_dias / 7 * 365)::bigint) end as cresce_em_12_meses
  from medida
 order by bytes desc;

-- Os recados no chat (escritos pelo banco): somam no tamanho de mensagens,
-- que tem retenção pelo histórico de conversas
select count(*) as recados,
       count(*) filter (where criado_em >= now() - interval '7 days') as recados_ultimos_7_dias,
       pg_size_pretty(sum(octet_length(coalesce(texto, '')))) as texto_dos_recados
  from public.mensagens
 where aviso_encomenda is not null;

-- A estação: o último sinal e a versão da extensão
select nome, visto_em, public.estacao_online(visto_em) as no_ar, versao_extensao
  from public.estacoes_cotacao
 order by visto_em desc;
