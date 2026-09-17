-- ============================================================
-- CONECTA — A EXCLUSÃO DE CONVERSA ESTÁ CHEGANDO AO BANCO?
--
-- UMA CONSULTA SÓ, de propósito: o editor do Supabase mostra apenas o
-- resultado do ÚLTIMO comando, então um arquivo com várias consultas
-- entrega sempre a errada.
--
-- COMO USAR
--   1. No sistema, exclua UMA conversa agora (não precisa ser todas).
--   2. Rode este arquivo.
--   3. Me mande a tabela inteira.
-- ============================================================

drop policy if exists participantes_atualizacao on public.participantes;
create policy participantes_atualizacao on public.participantes
  for update to authenticated
  using (colaborador_id = public.meu_colaborador_id())
  with check (colaborador_id = public.meu_colaborador_id());

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- TUDO NUMA TABELA.
--
-- A linha que decide é "2. EXCLUIDAS (rede inteira)". Depois de excluir
-- uma conversa ela tem que ser >= 1.
-- ------------------------------------------------------------
with eu as (
  select id from public.colaboradores where id = 'colab-admin-elias'
)
select * from (
  select 1 as ordem,
         'REGRAS em participantes (esperado: 4)' as o_que,
         (select count(*)::text from pg_policies where tablename = 'participantes') as valor

  union all
  select 2,
         '>>> EXCLUIDAS (rede inteira) — tem que ser >= 1',
         (select count(*) filter (where removida)::text from public.participantes)

  union all
  select 3, 'ARQUIVADAS (rede inteira)',
         (select count(*) filter (where oculta_desde is not null)::text
            from public.participantes)

  union all
  select 4, 'FIXADAS (rede inteira)',
         (select count(*) filter (where fixada)::text from public.participantes)

  union all
  select 5, 'linhas de participante na rede',
         (select count(*)::text from public.participantes)

  union all
  select 6, 'suas conversas gravadas no banco',
         (select count(*)::text from public.participantes
           where colaborador_id = (select id from eu))

  union all
  select 7, 'suas EXCLUIDAS',
         (select count(*) filter (where removida)::text from public.participantes
           where colaborador_id = (select id from eu))

  union all
  select 8, 'a coluna removida existe?',
         (select case when count(*) > 0 then 'sim' else 'NAO' end::text
            from information_schema.columns
           where table_schema = 'public' and table_name = 'participantes'
             and column_name = 'removida')

  union all
  select 9, 'a regra de UPDATE existe?',
         (select case when count(*) > 0 then 'sim' else 'NAO' end::text
            from pg_policies
           where tablename = 'participantes' and cmd = 'UPDATE')
) tudo
order by ordem;
