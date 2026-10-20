-- ============================================================================
-- O REGISTRO DE ERROS DO APLICATIVO (20/10/2026)
--
-- Um travamento só chegava ao TI se alguém contasse. Agora cada erro de tela
-- (o que a `ProtecaoDaTela` segura) e cada erro solto do navegador vira uma
-- linha aqui (`registroDeErros.ts`).
--
-- Só o técnico: tela, mensagem, pilha, versão e navegador. Quem foi sai da
-- SESSÃO (o aparelho não escolhe o nome). Qualquer pessoa logada grava; só o
-- TI lê; ninguém altera nem apaga pela API. O aparelho tem freio (o mesmo
-- erro uma vez por minuto, 20 por sessão), e o banco guarda 90 dias.
--
-- Consultar: diagnostico-erros-do-app.sql. Pode rodar mais de uma vez.
-- ============================================================================

create table if not exists public.erros_do_app (
  id              bigint generated always as identity primary key,
  ocorrido_em     timestamptz not null default now(),
  colaborador_id  text default public.meu_colaborador_id(),
  tela            text not null,
  mensagem        text not null,
  pilha           text,
  versao          text,
  navegador       text,
  constraint erros_do_app_tamanhos check (
    length(tela) <= 80 and length(mensagem) <= 500
    and length(coalesce(pilha, '')) <= 4000
    and length(coalesce(versao, '')) <= 40 and length(coalesce(navegador, '')) <= 200
  )
);

create index if not exists erros_do_app_por_data on public.erros_do_app (ocorrido_em desc);

alter table public.erros_do_app enable row level security;
grant select, insert on public.erros_do_app to authenticated;

-- Grava quem está logado, e só em nome de si mesmo
drop policy if exists erros_do_app_registro on public.erros_do_app;
create policy erros_do_app_registro on public.erros_do_app
  for insert to authenticated
  with check (colaborador_id is not distinct from (select public.meu_colaborador_id()));

drop policy if exists erros_do_app_leitura on public.erros_do_app;
create policy erros_do_app_leitura on public.erros_do_app
  for select to authenticated using ((select public.sou_admin()));

-- 90 dias bastam para achar um defeito; mais que isso é peso sem uso
create or replace function public.limpar_erros_antigos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.erros_do_app where ocorrido_em < now() - interval '90 days';
  return null;
end;
$$;

revoke all on function public.limpar_erros_antigos() from public, anon, authenticated;

drop trigger if exists erros_do_app_limpeza on public.erros_do_app;
create trigger erros_do_app_limpeza
  after insert on public.erros_do_app
  for each statement execute function public.limpar_erros_antigos();

notify pgrst, 'reload schema';

-- Conferência: as três `true`
select
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'erros_do_app')            as tabela_existe,
  (select relrowsecurity from pg_class where oid = 'public.erros_do_app'::regclass)    as regras_ligadas,
  exists (select 1 from pg_trigger where tgname = 'erros_do_app_limpeza')              as limpeza_ligada;
