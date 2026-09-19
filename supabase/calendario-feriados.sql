-- ============================================================
-- CALENDÁRIO DE FERIADOS
-- CONECTA / Malachias Autopeças
--
-- ------------------------------------------------------------
-- O QUE ISTO CONSERTA
-- ------------------------------------------------------------
--
-- Sem feriado cadastrado, todo 7 de setembro virava um dia inteiro de
-- débito para a rede inteira. E o espelho mostrava um dia sem batida
-- nenhuma — que se lê como falta, não como feriado.
--
-- O pior tipo de defeito: a causa é a AUSÊNCIA de um registro, e
-- ausência não aparece em lugar nenhum. Ninguém entendia de onde saía o
-- buraco no banco de horas.
--
-- ------------------------------------------------------------
-- POR LOJA, PORQUE SÃO CIDADES DIFERENTES
-- ------------------------------------------------------------
--
-- As cinco unidades ficam em municípios distintos. O aniversário de
-- Pirassununga não fecha a loja de Leme. `loja` nula vale para a rede;
-- preenchida, só para aquela unidade — e a da loja vence a da rede
-- quando as duas caem no mesmo dia.
--
-- ------------------------------------------------------------
-- MEIO EXPEDIENTE É UM NÚMERO
-- ------------------------------------------------------------
--
-- `minutos_previstos` zero é dia fechado; maior que zero é meio
-- expediente. 24 e 31 de dezembro costumam ser assim, e tratar feriado
-- como "fecha ou não fecha" obrigaria a escolher entre cobrar o dia
-- inteiro e não cobrar nada — as duas erradas.
-- ============================================================

create table if not exists public.feriados (
  id                 text primary key,
  data               date not null,
  nome               text not null,
  -- Nula = rede inteira
  loja               text,
  minutos_previstos  integer not null default 0
                       check (minutos_previstos between 0 and 600),
  criado_em          timestamptz not null default now(),

  -- Um feriado por dia e por abrangência. Duas linhas do mesmo dia
  -- fariam o espelho escolher uma delas sem critério.
  unique (data, loja)
);

create index if not exists feriados_por_data on public.feriados (data);

alter table public.feriados enable row level security;

-- ------------------------------------------------------------
-- LEITURA: TODO MUNDO.
--
-- Feriado não é dado de ninguém — é o calendário da empresa. Cada pessoa
-- precisa dele para o próprio espelho fechar, e esconder isso só faria o
-- saldo dela não bater sem explicação.
-- ------------------------------------------------------------
drop policy if exists feriados_leitura on public.feriados;
create policy feriados_leitura on public.feriados
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- ESCRITA: quem cuida de pessoas.
--
-- Feriado mexe no banco de horas de TODO MUNDO. Não é decisão de uma
-- loja só, e por isso não passa por `posso_decidir_jornada` como o resto
-- do ponto — aqui o alcance certo é o do RH, e não o da cadeia.
-- ------------------------------------------------------------
drop policy if exists feriados_escrita on public.feriados;
create policy feriados_escrita on public.feriados
  for insert to authenticated with check (public.cuido_de_pessoas());

drop policy if exists feriados_edicao on public.feriados;
create policy feriados_edicao on public.feriados
  for update to authenticated
  using (public.cuido_de_pessoas())
  with check (public.cuido_de_pessoas());

drop policy if exists feriados_remocao on public.feriados;
create policy feriados_remocao on public.feriados
  for delete to authenticated using (public.cuido_de_pessoas());

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — UMA CONSULTA SÓ
-- ============================================================
with conferencia as (
  select 1 as ordem, 'A tabela existe' as verificacao,
    coalesce(
      (select 'OK'
         from information_schema.tables
        where table_schema = 'public' and table_name = 'feriados'),
      'FALTA'
    ) as situacao

  union all
  select 2, 'Todo mundo lê o calendário',
    coalesce(
      (select case when qual = 'true' then 'OK' else 'ATENÇÃO: ' || qual end
         from pg_policies
        where schemaname = 'public' and tablename = 'feriados' and cmd = 'SELECT'),
      'FALTA'
    )

  union all
  select 3, 'Só quem cuida de pessoas cadastra',
    coalesce(
      (select string_agg(
         cmd || ': ' || case
           when coalesce(qual, '') || coalesce(with_check, '') like '%cuido_de_pessoas%'
             then 'OK' else 'ATENÇÃO' end, ' · ' order by cmd)
         from pg_policies
        where schemaname = 'public' and tablename = 'feriados'
          and cmd in ('INSERT', 'UPDATE', 'DELETE')),
      'FALTA'
    )

  union all
  select 4, 'Feriados já cadastrados',
    coalesce((select count(*)::text || ' registro(s)' from public.feriados), '0')
)
select verificacao, situacao from conferencia order by ordem;
