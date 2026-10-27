-- ============================================================================
-- AUDITORIA E PARTICIPANTES SEM REFAZER A REGRA A CADA LINHA (21/10/2026)
--
-- medir-lentidao.sql, 21/10/2026, depois de rls-mais-leve.sql: ler o ponto
-- caiu de 1,4 s para 0,1 s, e a consulta mais cara passou a ser a auditoria —
-- 409 ms em média, 1.327 vezes. Mesmo defeito do ponto: a regra perguntava
-- `sou_admin()` e `meu_setor()` em CADA uma das ~3 mil linhas. E todos os
-- aparelhos a pediam a cada registro novo (o app agora só pede no TI e no RH).
--
--   · auditoria: a mesma regra (TI ou RH), calculada uma vez por consulta;
--   · participantes: a lista "conversas de que participo" montada uma vez
--     (`minhas_conversas`), e não `participo_da_conversa` linha a linha. É a
--     MESMA pergunta, feita uma vez.
--
-- O que cada um vê NÃO muda. Pode rodar mais de uma vez.
-- ============================================================================

create or replace function public.minhas_conversas()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select p.conversa_id from public.participantes p where p.colaborador_id = public.meu_colaborador_id();
$$;

revoke execute on function public.minhas_conversas() from public, anon;
grant execute on function public.minhas_conversas() to authenticated;

drop policy if exists auditoria_leitura on public.auditoria;
create policy auditoria_leitura on public.auditoria
  for select to authenticated using ((select public.sou_admin()) or (select public.meu_setor()) = 'RH');

drop policy if exists participantes_leitura on public.participantes;
create policy participantes_leitura on public.participantes
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or conversa_id in (select public.minhas_conversas())
  );

notify pgrst, 'reload schema';

-- Zera as estatísticas (não mexe em dado): o medir-lentidao.sql de amanhã
-- mostra o tempo com as regras novas
do $$
begin
  perform extensions.pg_stat_statements_reset();
exception when others then
  null; -- sem a extensão (banco de teste), não há o que zerar
end;
$$;

-- Conferência: as três `true`
select
  exists (select 1 from pg_proc where proname = 'minhas_conversas')                                as funcao_existe,
  (select pg_get_expr(polqual, polrelid) like '%SELECT sou_admin()%'
     from pg_policy where polname = 'auditoria_leitura')                                            as auditoria_leve,
  (select pg_get_expr(polqual, polrelid) like '%minhas_conversas%'
     from pg_policy where polname = 'participantes_leitura')                                        as participantes_leve;
