-- ============================================================================
-- O HORÁRIO PRÓPRIO (17/10/2026)
--
-- "Alguns colaboradores têm horários específicos" (Elias): A e B não bastam.
-- O RH digita entrada, saída para o intervalo, volta e saída — ou só entrada
-- e saída — e a ficha fica no turno 'P'. O mesmo de segunda a sexta; o
-- sábado segue 08:00 às 12:00.
--
--   1. a coluna `horario_proprio` (jsonb) e o turno 'P';
--   2. o banco só aceita 'P' com o horário completo e na ordem;
--   3. a própria pessoa não muda o horário dela (como já não muda o turno);
--   4. quem vê o turno de alguém vê também o horário (`fichas_reservadas`),
--      senão o líder cobraria a tolerância pelo turno A.
--
-- O resto — espelho, tolerância, banco de horas, apuração da madrugada —
-- pergunta a `turnoDe` (tipos.ts), que monta o turno destes horários.
-- Pode rodar mais de uma vez.
-- ============================================================================

-- 1. A coluna, e o turno 'P' na lista que o banco aceita
alter table public.colaboradores
  add column if not exists horario_proprio jsonb;
alter table public.colaboradores drop constraint if exists colaboradores_turno_check;
alter table public.colaboradores
  add constraint colaboradores_turno_check
  check (turno in ('A', 'B', 'E0', 'E1', 'E2', 'E3', 'P'));

-- 2. 'P' só com o horário completo, em HH:MM e na ordem do dia (o mesmo que
-- `problemaNoHorarioProprio` confere na tela). Intervalo: os dois ou nenhum.
alter table public.colaboradores drop constraint if exists colaboradores_horario_proprio_valido;
alter table public.colaboradores
  add constraint colaboradores_horario_proprio_valido
  check (
    turno <> 'P'
    -- coalesce: sem horário as comparações dão nulo, e um check nulo PASSA
    or coalesce((
      horario_proprio ->> 'entrada' similar to '([01][0-9]|2[0-3]):[0-5][0-9]'
      and horario_proprio ->> 'saida' similar to '([01][0-9]|2[0-3]):[0-5][0-9]'
      and (
        (
          coalesce(horario_proprio ->> 'intervalo_saida', '') = ''
          and coalesce(horario_proprio ->> 'intervalo_retorno', '') = ''
          and horario_proprio ->> 'entrada' < horario_proprio ->> 'saida'
        )
        or (
          horario_proprio ->> 'intervalo_saida' similar to '([01][0-9]|2[0-3]):[0-5][0-9]'
          and horario_proprio ->> 'intervalo_retorno' similar to '([01][0-9]|2[0-3]):[0-5][0-9]'
          and horario_proprio ->> 'entrada' < horario_proprio ->> 'intervalo_saida'
          and horario_proprio ->> 'intervalo_saida' < horario_proprio ->> 'intervalo_retorno'
          and horario_proprio ->> 'intervalo_retorno' < horario_proprio ->> 'saida'
        )
      )
    ), false)
  );

-- 3. A própria pessoa não muda o horário dela
create or replace function public.turno_escolhido_uma_vez()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  estagio boolean;
begin
  -- Sem usuário (`auth.uid()` nulo) é o SQL Editor do TI: sem isto, a
  -- correção de turno feita por script voltaria ao valor antigo calada
  if auth.uid() is null or public.cuido_de_pessoas() then
    -- RH e TI escolhendo o turno de alguém: está confirmado
    if tg_op = 'INSERT' then
      if new.turno <> 'A' then
        new.turno_confirmado_em := coalesce(new.turno_confirmado_em, now());
      end if;
    elsif new.turno is distinct from old.turno then
      new.turno_confirmado_em := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  new.cargo                        := old.cargo;
  new.carga_horaria_diaria_minutos := old.carga_horaria_diaria_minutos;
  new.carga_semanal_minutos        := old.carga_semanal_minutos;
  new.trabalha_sabado              := old.trabalha_sabado;
  new.tem_intervalo                := old.tem_intervalo;
  -- O horário digitado é do RH, como o turno (horario-proprio.sql)
  new.horario_proprio              := old.horario_proprio;

  estagio := lower(old.setor) like '%está%'
          or lower(old.setor) like '%esta%'
          or lower(old.cargo) like '%estagi%';

  -- A única troca aceita: quem nunca confirmou, confirmando agora um
  -- turno do próprio perfil. Qualquer outra coisa volta ao que era.
  if old.turno_confirmado_em is null
     and new.turno_confirmado_em is not null
     and (
       (estagio and new.turno in ('E1', 'E2', 'E3'))
       or (not estagio and new.turno in ('A', 'B'))
     )
  then
    new.turno_confirmado_em := now();
  else
    new.turno               := old.turno;
    new.turno_confirmado_em := old.turno_confirmado_em;
  end if;

  return new;
end;
$$;

-- 4. Quem vê o turno vê o horário. O retorno mudou: a função antiga sai antes
drop function if exists public.fichas_reservadas();
create or replace function public.fichas_reservadas()
returns table (
  id                            text,
  matricula                     text,
  cnpj                          text,
  data_admissao                 text,
  departamento                  text,
  carga_horaria_diaria_minutos  integer,
  carga_semanal_minutos         integer,
  trabalha_sabado               boolean,
  tem_intervalo                 boolean,
  turno                         text,
  turno_confirmado_em           timestamptz,
  horario_proprio               jsonb,
  telefone                      text,
  email                         text,
  observacoes                   text,
  login                         text,
  precisa_trocar_senha          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select public.meu_colaborador_id() as id, public.cuido_de_pessoas() as rh)
  select c.id,
         c.matricula, c.cnpj, c.data_admissao, c.departamento,
         c.carga_horaria_diaria_minutos, c.carga_semanal_minutos, c.trabalha_sabado, c.tem_intervalo,
         c.turno, c.turno_confirmado_em, c.horario_proprio,
         case when c.id = eu.id or eu.rh then c.telefone end,
         case when c.id = eu.id or eu.rh then c.email end,
         case when c.id = eu.id or eu.rh then c.observacoes end,
         case when c.id = eu.id or eu.rh then c.login end,
         case when c.id = eu.id or eu.rh then c.precisa_trocar_senha end
    from public.colaboradores c, eu
   where eu.id is not null
     and (c.id = eu.id or eu.rh or public.posso_decidir_jornada(c.id));
$$;

revoke all on function public.fichas_reservadas() from public, anon;
grant execute on function public.fichas_reservadas() to authenticated;

notify pgrst, 'reload schema';

-- Conferência: as três `true`
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'colaboradores'
             and column_name = 'horario_proprio')                                    as coluna_existe,
  exists (select 1 from pg_constraint
           where conname = 'colaboradores_horario_proprio_valido')                    as banco_confere_o_horario,
  exists (select 1 from pg_proc p where p.proname = 'fichas_reservadas'
             and pg_get_function_result(p.oid) like '%horario_proprio%')               as fichas_trazem_o_horario;
