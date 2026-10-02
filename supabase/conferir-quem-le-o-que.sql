-- ============================================================
-- QUEM LÊ O QUÊ — CONECTA / Malachias Autopeças
--
-- Só LÊ, não altera nada. Para cada tabela do sistema: se a trava de
-- linha (RLS) está ligada e qual é a regra de LEITURA em produção.
--
-- Existe por causa da regra do Elias (02/10/2026): "o que não é
-- direcionado para o usuário não deve ir pra ele — nem escondido".
-- `using (true)` quer dizer "todo mundo logado recebe todas as linhas".
--
-- A última linha conta quantas fichas ainda guardam a senha de primeiro
-- acesso (só o número — nenhuma senha aparece aqui).
-- ============================================================

with tabelas as (
  select c.relname as tabela, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
),
leitura as (
  select tablename as tabela,
         string_agg(policyname || ': ' || coalesce(qual, '(sem condição)'), '  |  ' order by policyname) as regra
    from pg_policies
   where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   group by tablename
)
select t.tabela,
       case when not t.rls then 'RLS DESLIGADA'
            when l.regra is null then 'ninguém lê (sem regra)'
            when l.regra ~ ': true($|  \|)' then 'TODOS LEEM'
            else 'filtrada' end as situacao,
       left(coalesce(l.regra, ''), 220) as regra_de_leitura
  from tabelas t
  left join leitura l on l.tabela = t.tabela

union all
select 'colaboradores.senha_ativacao',
       'fichas com senha de 1º acesso guardada',
       (select count(*)::text from public.colaboradores where coalesce(senha_ativacao, '') <> '')

order by 2, 1;
