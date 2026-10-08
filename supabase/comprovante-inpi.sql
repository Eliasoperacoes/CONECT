-- ============================================================
-- O NÚMERO DO INPI NO COMPROVANTE (homologação, etapa 2d — 08/10/2026)
--
-- O comprovante de registro de ponto do REP-P traz o "número de registro
-- no Instituto Nacional da Propriedade Industrial" (Portaria 671/2021,
-- art. 79, VII). O número mora em `identificacao_rep`, que só quem cuida
-- de pessoas lê — a mesma linha guarda o CPF do desenvolvedor. Esta função
-- devolve SÓ o número, a qualquer sessão: o trabalhador vê o INPI no
-- próprio comprovante e não alcança o resto da identificação.
--
-- Rodar depois de identificacao-do-rep.sql. Pode rodar de novo.
-- ============================================================

create or replace function public.inpi_do_rep()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(inpi, '') from public.identificacao_rep where id;
$$;

revoke all on function public.inpi_do_rep() from public, anon;
grant execute on function public.inpi_do_rep() to authenticated;

notify pgrst, 'reload schema';

-- Conferência: a função existe e só a sessão logada a chama. "inpi" vem
-- vazio até o registro sair — é o esperado.
select
  exists (select 1 from pg_proc where proname = 'inpi_do_rep')                     as funcao_criada,
  has_function_privilege('authenticated', 'public.inpi_do_rep()', 'execute')       as logado_chama,
  not has_function_privilege('anon', 'public.inpi_do_rep()', 'execute')            as anonimo_nao_chama,
  public.inpi_do_rep()                                                             as inpi;
