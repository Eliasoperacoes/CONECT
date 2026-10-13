-- ============================================================
-- NENHUMA FUNÇÃO DO BANCO PARA QUEM NÃO ESTÁ LOGADO (13/10/2026)
--
-- Laudo de 13/10/2026, item 5. Toda função do Postgres nasce executável
-- por PUBLIC — e o papel anônimo do Supabase (quem não fez login, só com
-- a chave pública que está no próprio site) herda isso. Eram 30 funções
-- privilegiadas ao alcance de quem não entrou; uma delas,
-- `nomes_em_lista`, devolvia nomes de funcionários a partir dos ids.
--
-- Medido antes de mexer: nenhuma regra de acesso vale para quem não está
-- logado (todas são "to authenticated"), nem as do armazenamento; e toda
-- chamada do app a função do banco acontece depois do login. Gatilho não
-- precisa da permissão de quem dispara — a ativação da conta continua.
--
-- QUEM ESTÁ LOGADO NÃO PERDE NADA: antes de revogar de PUBLIC e do anônimo,
-- anota-se quem podia executar cada função, e a permissão é devolvida a
-- `authenticated` e `service_role` explicitamente.
--
-- Pode rodar de novo.
-- ============================================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura,
           has_function_privilege('authenticated', p.oid, 'execute') as logado,
           has_function_privilege('service_role', p.oid, 'execute') as servico
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    if f.logado then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
    if f.servico then
      execute format('grant execute on function %s to service_role', f.assinatura);
    end if;
  end loop;
end $$;

-- As funções criadas daqui em diante também não nascem abertas ao anônimo
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   anonimo_executa ............ 0
--   nomes_em_lista_anonimo ..... false
--   logado_bate_ponto .......... true   (o logado não perdeu nada)
--   logado_le_alcada ........... true
-- ============================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute'))                                as anonimo_executa,
  has_function_privilege('anon', 'public.nomes_em_lista(text[])', 'execute')                 as nomes_em_lista_anonimo,
  has_function_privilege('authenticated', 'public.registrar_marcacao(text, text, text, text)', 'execute') as logado_bate_ponto,
  has_function_privilege('authenticated', 'public.posso_decidir_jornada(text)', 'execute')   as logado_le_alcada;
