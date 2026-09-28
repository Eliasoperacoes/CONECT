-- ============================================================
-- CONECTA — QUANTO ESTE PROJETO CONSOME DO SUPABASE
--
-- ESTE ARQUIVO NÃO ALTERA NADA. São quatro consultas.
--
-- ------------------------------------------------------------
-- POR QUE MEDIR, E NÃO ESTIMAR
-- ------------------------------------------------------------
--
-- Os limites do Supabase são por PLANO, e o que os consome aqui não é
-- óbvio. A foto de perfil, por exemplo, não está no Storage: ela é
-- gravada como texto na coluna `colaboradores.foto`, em base64. Uma
-- foto de 400px vira algo entre 20 e 60 KB de TEXTO dentro do banco —
-- e a ficha inteira viaja para cada aparelho a cada sincronização.
--
-- Com 8 pessoas no piloto isso não aparece. Com 89, é a maior linha da
-- conta. Estas consultas dizem o número REAL, em vez do meu palpite.
-- ============================================================

-- ============================================================
-- 1. O TAMANHO DE CADA TABELA
--
-- `total` inclui índices. É o que conta para o limite de banco do
-- plano: 500 MB no gratuito, 8 GB no Pro.
-- ============================================================
select
  c.relname                                          as tabela,
  to_char(n.n_live_tup, 'FM999G999G999')             as linhas,
  pg_size_pretty(pg_total_relation_size(c.oid))      as total,
  pg_size_pretty(pg_relation_size(c.oid))            as so_os_dados,
  pg_size_pretty(
    pg_total_relation_size(c.oid) - pg_relation_size(c.oid)
  )                                                  as indices
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  left join pg_stat_user_tables n on n.relid = c.oid
 where ns.nspname = 'public'
   and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc;

-- ============================================================
-- 2. A FOTO DE PERFIL — a linha de conta que ninguém vê
--
-- `media_kb` é o peso de UMA foto em base64. Multiplique por 89 para
-- saber quanto a tela de colaboradores baixa por sincronização.
--
-- `com_foto_propria` são as pessoas que trocaram a foto; as demais
-- usam o logo, que é um caminho curto e não pesa.
-- ============================================================
select
  count(*)                                                     as pessoas,
  count(*) filter (where foto like 'data:image%')              as com_foto_propria,
  pg_size_pretty(sum(length(foto))::bigint)                    as todas_as_fotos,
  round(avg(length(foto)) filter (where foto like 'data:image%') / 1024.0, 1)
                                                               as media_kb,
  round(max(length(foto)) / 1024.0, 1)                         as maior_kb,
  -- O que UMA sincronização de colaboradores baixa hoje
  pg_size_pretty(sum(length(coalesce(foto, '')))::bigint)      as baixado_por_sync
  from public.colaboradores;

-- ============================================================
-- 3. OS ARQUIVOS NO STORAGE
--
-- Anexo de conversa, documento de ausência, imagem de publicação.
-- Limite do plano: 1 GB no gratuito, 100 GB no Pro.
--
-- Se der erro de permissão, rode no SQL Editor como dono do projeto —
-- `storage.objects` não é visível para todo papel.
-- ============================================================
select
  coalesce(o.bucket_id, '(total)')                             as balde,
  count(*)                                                     as arquivos,
  pg_size_pretty(
    sum((o.metadata->>'size')::bigint)
  )                                                            as tamanho,
  pg_size_pretty(
    (avg((o.metadata->>'size')::bigint))::bigint
  )                                                            as media
  from storage.objects o
 group by rollup (o.bucket_id)
 order by 2 desc;

-- ============================================================
-- 4. O CRESCIMENTO POR MÊS, medido no que já existe
--
-- Conta as linhas criadas em cada mês. É a base honesta para projetar:
-- o mês em que as 89 pessoas estiverem usando diz muito mais do que
-- qualquer conta minha em cima de 8.
-- ============================================================
select
  to_char(mes, 'MM/YYYY')      as mes,
  sum(marcacoes)               as marcacoes,
  sum(mensagens)               as mensagens,
  sum(apuracoes)               as apuracoes
  from (
    select date_trunc('month', criado_em) as mes,
           count(*) as marcacoes, 0 as mensagens, 0 as apuracoes
      from public.registros_ponto group by 1
    union all
    select date_trunc('month', criado_em), 0, count(*), 0
      from public.mensagens group by 1
    union all
    select date_trunc('month', criado_em), 0, 0, count(*)
      from public.ajustes_jornada group by 1
  ) t
 group by mes
 order by mes desc
 limit 12;
