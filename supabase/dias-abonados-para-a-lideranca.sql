-- ============================================================
-- O DIA ABONADO CHEGA À LIDERANÇA (06/11/2026)
--
-- O atestado da Beatriz (04/11) foi aprovado pela Dani e o espelho dela
-- fechou em 0h00 — no RH. No da Leigislaine o mesmo dia saía −2h30: o
-- espelho é calculado no aparelho de quem abre, e o atestado não chega ao
-- líder (atestado-e-do-rh.sql: dado de saúde fica com o RH). Sem a
-- ausência, o dia era um dia comum com 2h30 faltando.
--
-- O líder não precisa do atestado; precisa saber que o dia foi ABONADO.
-- Esta tabela guarda só isso — quem e de que dia a que dia, sem tipo,
-- anexo nem observação — e o banco a mantém sozinho a cada aprovação,
-- recusa ou remoção. Ela está no tempo real: a decisão da Dani chega ao
-- aparelho do líder sem ele recarregar.
--
-- Folga de sábado e férias ficam de fora: essas o líder já lê inteiras.
--
-- Pode rodar mais de uma vez.
-- ============================================================

-- 1. A TABELA: só o que o espelho precisa
create table if not exists public.dias_abonados (
  -- O mesmo id da ausência que o originou
  id              text primary key,
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  data_inicio     date not null,
  data_fim        date not null
);

create index if not exists dias_abonados_por_pessoa on public.dias_abonados (colaborador_id, data_inicio);

alter table public.dias_abonados enable row level security;
grant select on public.dias_abonados to authenticated;

-- Lê quem responde pela pessoa, a própria pessoa e o RH. Ninguém grava:
-- só o gatilho abaixo, que roda como dono da tabela.
drop policy if exists dias_abonados_leitura on public.dias_abonados;
create policy dias_abonados_leitura on public.dias_abonados
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or (select public.cuido_de_pessoas())
    or colaborador_id in (select public.minha_alcada_de_jornada())
  );

-- 2. O GATILHO: a ausência aprovada entra; recusada, pendente ou apagada sai
create or replace function public.espelhar_dia_abonado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.dias_abonados where id = old.id;
    return old;
  end if;

  if new.estado = 'aprovada' and new.tipo not in ('folga_sabado', 'ferias') then
    insert into public.dias_abonados (id, colaborador_id, data_inicio, data_fim)
    values (new.id, new.colaborador_id, new.data_inicio, new.data_fim)
    on conflict (id) do update
      set colaborador_id = excluded.colaborador_id,
          data_inicio    = excluded.data_inicio,
          data_fim       = excluded.data_fim;
  else
    delete from public.dias_abonados where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.espelhar_dia_abonado() from public, anon;

drop trigger if exists justificativas_espelham_dia_abonado on public.justificativas_ausencia;
create trigger justificativas_espelham_dia_abonado
  after insert or update or delete on public.justificativas_ausencia
  for each row execute function public.espelhar_dia_abonado();

-- 3. O QUE JÁ FOI APROVADO ANTES DESTE SCRIPT
insert into public.dias_abonados (id, colaborador_id, data_inicio, data_fim)
select j.id, j.colaborador_id, j.data_inicio, j.data_fim
  from public.justificativas_ausencia j
 where j.estado = 'aprovada'
   and j.tipo not in ('folga_sabado', 'ferias')
on conflict (id) do update
  set colaborador_id = excluded.colaborador_id,
      data_inicio    = excluded.data_inicio,
      data_fim       = excluded.data_fim;

delete from public.dias_abonados d
 where not exists (
   select 1 from public.justificativas_ausencia j
    where j.id = d.id
      and j.estado = 'aprovada'
      and j.tipo not in ('folga_sabado', 'ferias')
 );

-- 4. NO TEMPO REAL: a decisão chega ao aparelho do líder na hora
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'dias_abonados'
  ) then
    alter publication supabase_realtime add table public.dias_abonados;
  end if;
end $$;

notify pgrst, 'reload schema';

-- CONFERÊNCIA: o gatilho (1), a tabela no tempo real (1) e os dias
-- abonados da Beatriz — o 04/11 tem de aparecer.
select
  (select count(*) from pg_trigger where tgname = 'justificativas_espelham_dia_abonado') as gatilho_1,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'dias_abonados') as tempo_real_1,
  (select count(*) from public.dias_abonados) as dias_abonados_na_rede,
  (select string_agg(to_char(d.data_inicio, 'DD/MM') || ' a ' || to_char(d.data_fim, 'DD/MM'), ', ' order by d.data_inicio)
     from public.dias_abonados d
     join public.colaboradores c on c.id = d.colaborador_id
    where c.nome ilike 'beatriz%') as da_beatriz;
