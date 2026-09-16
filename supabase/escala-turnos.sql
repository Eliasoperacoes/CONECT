-- ============================================================
-- CONECTA — ESCALA: SEGUNDA A SÁBADO, DOIS TURNOS
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--
-- A rede trabalha de segunda a SÁBADO:
--
--   Turno A   07:30 às 12:30 · 14:00 às 17:10   = 8h10
--   Turno B   08:20 às 11:00 · 12:30 às 18:00   = 8h10
--   Sábado    08:00 às 12:00, sem intervalo      = 4h00
--
-- O turno decide TRÊS coisas ao mesmo tempo: quanto o dia prevê, de que
-- horário o atraso é contado, e quantas batidas fecham o dia. Por isso ele é
-- ficha funcional da pessoa, e não um valor solto da rede.
--
-- ATENÇÃO, e é só um registro para você decidir com o contador: 5 dias de
-- 8h10 mais o sábado de 4h fecham 44h50 por semana — 50 minutos acima do
-- limite de 44h da CLT. O sistema não decide isso; está implementado
-- exatamente como a escala foi descrita.
-- ============================================================

alter table public.colaboradores
  add column if not exists turno text not null default 'A';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'colaboradores_turno_check'
  ) then
    alter table public.colaboradores
      add constraint colaboradores_turno_check check (turno in ('A', 'B'));
  end if;
end $$;

-- A jornada padrão deixa de ser 8h00: a rede não tem dia útil de 8 horas.
-- Só muda quem está no valor antigo — carga individual cadastrada de
-- propósito (meio período, por exemplo) fica como está.
update public.colaboradores
   set carga_horaria_diaria_minutos = 490
 where carga_horaria_diaria_minutos = 480;

alter table public.colaboradores
  alter column carga_horaria_diaria_minutos set default 490;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- coluna_turno ............. true
-- no_turno_a / no_turno_b .. como ficou a distribuição
-- com_jornada_de_8h10 ...... deve cobrir quem estava em 8h00
-- ============================================================
select
  exists (
    select 1 from information_schema.columns
     where table_name = 'colaboradores' and column_name = 'turno'
  ) as coluna_turno,
  count(*) filter (where turno = 'A')                          as no_turno_a,
  count(*) filter (where turno = 'B')                          as no_turno_b,
  count(*) filter (where carga_horaria_diaria_minutos = 490)   as com_jornada_de_8h10,
  count(*) filter (where carga_horaria_diaria_minutos <> 490)  as com_jornada_diferente
from public.colaboradores;
