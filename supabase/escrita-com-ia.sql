-- ============================================================
-- A IA QUE AJUDA A ESCREVER NA CENTRAL (14/10/2026)
--
-- O botão "Escrever com IA" do editor da Central chama a função de
-- servidor `escrever-com-ia`, que pergunta AQUI, com a sessão de quem
-- pede, se a pessoa pode usar e se ainda tem uso hoje. A trava é esta:
-- a tela só esconde o botão.
--
-- QUEM PODE: quem pode publicar na Central. A regra ganha nome próprio
-- (`posso_publicar_na_central`) e passa a servir às duas portas — a da
-- publicação e a da IA. Antes ela estava escrita só dentro da política
-- (`meu_nivel() >= 2`); uma cópia aqui seria a quinta vez da mesma
-- decisão em dois lugares (CLAUDE.md, "Uma regra, um lugar").
--
-- QUANTO: 30 usos por pessoa por dia (dia de Brasília). Fica guardado
-- QUANTAS vezes, nunca O QUE foi escrito.
--
-- Pode rodar de novo.
-- ============================================================

-- 1. A regra de quem publica na Central, com nome
create or replace function public.posso_publicar_na_central()
returns boolean language sql stable security definer set search_path = public as $$
  -- Do líder de setor para cima: `publicaComunicado` (tipos.ts) na tela
  select public.meu_nivel() >= 2;
$$;
revoke all on function public.posso_publicar_na_central() from public, anon;
grant execute on function public.posso_publicar_na_central() to authenticated;

drop policy if exists avisos_insercao on public.avisos_rede;
create policy avisos_insercao on public.avisos_rede
  for insert to authenticated with check (public.posso_publicar_na_central());

-- 2. A contagem de usos. Ninguém lê nem grava direto: só a função abaixo
create table if not exists public.usos_da_ia (
  colaborador_id text not null references public.colaboradores(id) on delete cascade,
  dia            date not null,
  usos           integer not null default 0,
  primary key (colaborador_id, dia)
);
alter table public.usos_da_ia enable row level security;
revoke all on public.usos_da_ia from public, anon, authenticated;

-- 3. Pode usar? Conta um uso e devolve quantos restam hoje
create or replace function public.usar_escrita_com_ia()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  limite constant integer := 30;
  eu    text := public.meu_colaborador_id();
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  feito integer;
begin
  if eu is null then
    raise exception 'Sem colaborador para esta sessão.' using errcode = '42501';
  end if;
  if not public.posso_publicar_na_central() then
    raise exception 'A IA de escrita é de quem publica na Central.' using errcode = '42501';
  end if;

  insert into public.usos_da_ia as u (colaborador_id, dia, usos)
  values (eu, hoje, 1)
  on conflict (colaborador_id, dia) do update set usos = u.usos + 1
  returning u.usos into feito;

  if feito > limite then
    raise exception 'Você já usou a IA % vezes hoje. Amanhã libera de novo.', limite using errcode = 'P0001';
  end if;

  return limite - feito;
end;
$$;
revoke all on function public.usar_escrita_com_ia() from public, anon;
grant execute on function public.usar_escrita_com_ia() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   regra_existe ............... true
--   publicacao_usa_a_regra ..... true
--   tabela_fechada ............. true   (ninguém do app lê a contagem)
--   anonimo_nao_usa ............ true
-- ============================================================
select
  exists (select 1 from pg_proc where proname = 'posso_publicar_na_central'
           and pronamespace = 'public'::regnamespace)                          as regra_existe,
  (select pg_get_expr(polwithcheck, polrelid) like '%posso_publicar_na_central%'
     from pg_policy where polname = 'avisos_insercao'
      and polrelid = 'public.avisos_rede'::regclass)                          as publicacao_usa_a_regra,
  not has_table_privilege('authenticated', 'public.usos_da_ia', 'select')     as tabela_fechada,
  not has_function_privilege('anon', 'public.usar_escrita_com_ia()', 'execute') as anonimo_nao_usa;
