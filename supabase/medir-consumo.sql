-- ============================================================
-- CONECTA — QUANTO ESTE PROJETO CONSOME DO SUPABASE
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- ------------------------------------------------------------
-- POR QUE UMA SÓ
-- ------------------------------------------------------------
--
-- O SQL Editor do Supabase mostra o resultado da ÚLTIMA instrução.
-- Arquivo com quatro `select` devolve quatro respostas e esconde três —
-- e a que interessava ficava sempre para trás. Tudo aqui vem numa
-- tabela, com uma coluna `secao` dizendo do que cada linha trata.
--
-- ------------------------------------------------------------
-- COMO LER
-- ------------------------------------------------------------
--
-- `1. FOTO DE PERFIL`  A linha de conta que não se vê. A foto NÃO está
--                      no Storage: é base64 gravado na coluna
--                      `colaboradores.foto`. Ela conta no limite do
--                      BANCO, não tem cache de navegador, e viaja
--                      inteira a cada sincronização de colaboradores.
--                      `baixado por sync` é o que cada aparelho puxa
--                      só para mostrar as caras na lista de conversas.
--
-- `2. TABELA`          Tamanho com índices. Limite do plano: 500 MB no
--                      gratuito, 8 GB no Pro.
--
-- `3. STORAGE`         Anexos de conversa, atestados, imagens de
--                      publicação. 1 GB no gratuito, 100 GB no Pro.
--
-- `4. POR MÊS`         Crescimento do que já existe. É a base honesta
--                      para projetar — um mês com as 89 pessoas diz
--                      mais do que qualquer conta em cima de 8.
--
-- A leitura desses números está em docs/LIMITES-SUPABASE.md.
-- ============================================================

select ordem, secao, item, valor, observacao from (

  -- 1. A FOTO DE PERFIL — primeiro porque é a que decide
  select 1 as ordem, '1. FOTO DE PERFIL' as secao, f.item, f.valor, f.observacao
    from (
      select 'pessoas com foto própria' as item,
             count(*) filter (where foto like 'data:image%')::text as valor,
             'de ' || count(*) || ' ativas' as observacao
        from public.colaboradores
      union all
      select 'peso médio de uma foto',
             coalesce(round(avg(length(foto)) filter (where foto like 'data:image%')
               / 1024.0, 1), 0)::text || ' KB',
             'base64 dentro do banco, não no Storage'
        from public.colaboradores
      union all
      select 'maior foto',
             coalesce(round(max(length(foto)) / 1024.0, 1), 0)::text || ' KB', ''
        from public.colaboradores
      union all
      select 'BAIXADO POR SYNC',
             pg_size_pretty(sum(length(coalesce(foto, '')))::bigint),
             'cada aparelho puxa isto ao entrar e a cada ficha alterada'
        from public.colaboradores
      union all
      select 'tráfego estimado por mês',
             pg_size_pretty(
               (sum(length(coalesce(foto, '')))::bigint
                * count(*) filter (where ativo) * 2 * 22)
             ),
             'contando 2 entradas por pessoa em 22 dias — limite: 5 GB no gratuito'
        from public.colaboradores
    ) f

  union all

  -- 2. O TAMANHO DE CADA TABELA
  select 2, '2. TABELA', c.relname,
         pg_size_pretty(pg_total_relation_size(c.oid)),
         coalesce(to_char(n.n_live_tup, 'FM999G999G999'), '0') || ' linhas · ' ||
         pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) ||
         ' de índice'
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    left join pg_stat_user_tables n on n.relid = c.oid
   where ns.nspname = 'public'
     and c.relkind = 'r'
     and pg_total_relation_size(c.oid) > 0

  union all

  -- 3. OS ARQUIVOS NO STORAGE
  select 3, '3. STORAGE', coalesce(o.bucket_id, '(nenhum arquivo)'),
         pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)),
         count(*) || ' arquivo(s)'
    from storage.objects o
   group by o.bucket_id

  union all

  -- 4. O CRESCIMENTO MÊS A MÊS
  select 4, '4. POR MÊS', to_char(t.mes, 'MM/YYYY'),
         sum(t.marcacoes) || ' marcações',
         sum(t.mensagens) || ' mensagens · ' || sum(t.apuracoes) || ' apurações'
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
   group by t.mes

) tudo
order by ordem, item;
