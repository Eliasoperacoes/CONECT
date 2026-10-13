-- ============================================================
-- DIAGNÓSTICO: AS COLUNAS REAIS DA TABELA DE COLABORADORES (13/10/2026)
--
-- Só leitura, sem dado de ninguém: só os nomes das colunas, as regras de
-- acesso da tabela e se ela está no canal ao vivo. Serve para o item 6 do
-- laudo (cada colaborador vê só o que é para ele) listar as colunas certas.
-- ============================================================
select 'coluna' as o_que,
       c.ordinal_position::text as ordem,
       c.column_name as nome,
       c.data_type as detalhe
  from information_schema.columns c
 where c.table_schema = 'public' and c.table_name = 'colaboradores'
union all
select 'regra', p.cmd, p.policyname, left(coalesce(p.qual, '') || ' | ' || coalesce(p.with_check, ''), 120)
  from pg_policies p
 where p.schemaname = 'public' and p.tablename = 'colaboradores'
union all
select 'canal ao vivo', '', t.tablename, t.pubname
  from pg_publication_tables t
 where t.schemaname = 'public' and t.tablename = 'colaboradores'
order by 1, 2;
