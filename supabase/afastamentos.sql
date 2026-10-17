-- ============================================================================
-- O AFASTAMENTO (17/10/2026)
--
-- "Não temos nada de configuração para colaboradores afastados" (Elias).
-- O RH registra na ficha: de quando, até quando (ou sem data de volta) e
-- por quê. Enquanto durar:
--
--   · o espelho diz "Afastado", o dia prevê zero e não é falta — isso é a
--     situação do dia (`situacaoNaLista`, tipos.ts e apuração da madrugada),
--     a mesma por onde passam férias e atestado;
--   · a pessoa NÃO bate ponto (decisão do Elias): o banco recusa a marcação
--     de quem está afastado no dia, venha do QR ou do código.
--
-- Quem grava é o RH e o TI (`cuido_de_pessoas`, a mesma regra do cadastro).
-- Quem lê: a própria pessoa, quem responde por ela (para o espelho dela) e
-- o RH. Pode rodar mais de uma vez.
-- ============================================================================

create table if not exists public.afastamentos (
  id                   text primary key,
  colaborador_id       text not null references public.colaboradores(id) on delete cascade,
  -- O primeiro e o último dia afastado; sem fim = sem data de volta
  inicio               date not null,
  fim                  date,
  motivo               text not null
                       check (motivo in ('doenca', 'acidente', 'maternidade', 'paternidade', 'militar', 'outro')),
  observacao           text,
  registrado_por_id    text,
  registrado_por_nome  text,
  criado_em            timestamptz not null default now(),
  constraint afastamentos_fim_depois_do_inicio check (fim is null or fim >= inicio)
);

create index if not exists afastamentos_por_pessoa on public.afastamentos (colaborador_id, inicio);

alter table public.afastamentos enable row level security;
grant select, insert, update, delete on public.afastamentos to authenticated;

drop policy if exists afastamentos_leitura on public.afastamentos;
create policy afastamentos_leitura on public.afastamentos
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or (select public.cuido_de_pessoas())
    or colaborador_id in (select public.minha_alcada_de_jornada())
  );

drop policy if exists afastamentos_registro on public.afastamentos;
create policy afastamentos_registro on public.afastamentos
  for insert to authenticated with check ((select public.cuido_de_pessoas()));

drop policy if exists afastamentos_alteracao on public.afastamentos;
create policy afastamentos_alteracao on public.afastamentos
  for update to authenticated
  using ((select public.cuido_de_pessoas()))
  with check ((select public.cuido_de_pessoas()));

drop policy if exists afastamentos_remocao on public.afastamentos;
create policy afastamentos_remocao on public.afastamentos
  for delete to authenticated using ((select public.cuido_de_pessoas()));

-- ------------------------------------------------------------
-- AFASTADO NÃO BATE PONTO
--
-- Toda marcação da própria pessoa nasce como marcação original (QR ou
-- código, `nova_marcacao_original`) — então é aqui que se recusa, uma vez,
-- e vale para qualquer caminho de batida. A correção do RH ou do líder
-- (ajuste) não passa por aqui: se precisar lançar algo num dia afastado,
-- dá.
-- ------------------------------------------------------------
create or replace function public.recusar_batida_de_afastado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  volta date;
begin
  select a.fim into volta
    from public.afastamentos a
   where a.colaborador_id = new.colaborador_id
     and new.data >= a.inicio
     and (a.fim is null or new.data <= a.fim)
   limit 1;
  if found then
    raise exception '%', case
      when volta is null then 'Há um afastamento registrado para você, sem data de volta. Procure o RH antes de voltar a bater o ponto.'
      else 'Há um afastamento registrado para você até ' || to_char(volta, 'DD/MM/YYYY') || '. Procure o RH se já voltou.'
    end using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.recusar_batida_de_afastado() from public, anon, authenticated;

drop trigger if exists marcacoes_originais_recusar_afastado on public.marcacoes_originais;
create trigger marcacoes_originais_recusar_afastado
  before insert on public.marcacoes_originais
  for each row execute function public.recusar_batida_de_afastado();

notify pgrst, 'reload schema';

-- Conferência: as três `true`
select
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'afastamentos')            as tabela_existe,
  (select relrowsecurity from pg_class where oid = 'public.afastamentos'::regclass)    as regras_ligadas,
  exists (select 1 from pg_trigger
           where tgname = 'marcacoes_originais_recusar_afastado')                       as batida_recusada;
