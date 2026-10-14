-- ============================================================
-- PREENCHER DIAS VAZIOS PELO TURNO: SÓ RH E TI (14/10/2026)
--
-- Decisão do Elias: "somente RH e TI". O preenchimento escreve registro
-- de ponto por dedução, em lote. Até aqui o banco aceitava o
-- `preenchimento_turno` de quem cuida de pessoas (RH, Diretoria, TI) e de
-- quem responde pela pessoa (líder, gerente).
--
-- A regra ganha nome — `posso_preencher_pelo_turno()` — e o par dela na
-- tela é `preenchePeloTurno` (tipos.ts). Mudou uma, mude a outra; a do
-- banco é a que vale.
--
-- O que NÃO muda: corrigir e lançar batida (`ajuste_rh`, `ajuste_lider`)
-- continua do RH, da Diretoria, do TI e de quem responde pela pessoa.
--
-- Pode rodar de novo.
-- ============================================================

create or replace function public.posso_preencher_pelo_turno()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_setor() = 'RH' or public.sou_admin();
$$;
revoke all on function public.posso_preencher_pelo_turno() from public, anon;
grant execute on function public.posso_preencher_pelo_turno() to authenticated;

drop policy if exists ponto_batida on public.registros_ponto;
create policy ponto_batida on public.registros_ponto
  for insert to authenticated
  with check (
    -- A batida da PRÓPRIA pessoa não entra por aqui: só por `bater_ponto`,
    -- que confere o código e carimba a hora no servidor. Por aqui entram
    -- só CORREÇÃO e PREENCHIMENTO, nunca com o método da batida.
    (
      public.cuido_de_pessoas()
      and metodo in ('ajuste_rh', 'ajuste_lider')
    )
    -- Preencher dias vazios pelo turno: só RH e TI
    or (
      public.posso_preencher_pelo_turno()
      and metodo = 'preenchimento_turno'
    )
    -- O responsável lança a batida que faltou, como correção dele
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo = 'ajuste_lider'
    )
  );

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   regra_existe ............... true
--   politica_usa_a_regra ....... true
--   lider_nao_preenche ......... true   (o ramo do responsável só corrige)
-- ============================================================
select
  exists (select 1 from pg_proc where proname = 'posso_preencher_pelo_turno'
           and pronamespace = 'public'::regnamespace)                            as regra_existe,
  (select pg_get_expr(polwithcheck, polrelid) like '%posso_preencher_pelo_turno%'
     from pg_policy where polname = 'ponto_batida'
      and polrelid = 'public.registros_ponto'::regclass)                        as politica_usa_a_regra,
  (select pg_get_expr(polwithcheck, polrelid) not like '%posso_decidir_jornada(colaborador_id) AND (metodo = ANY%'
     from pg_policy where polname = 'ponto_batida'
      and polrelid = 'public.registros_ponto'::regclass)                        as lider_nao_preenche;
