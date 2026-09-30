-- ============================================================
-- A FALTA E O DIA SEM FECHAR ENTRAM NA FILA DO LÍDER (30/09/2026)
--
-- A partir de 01/10/2026 o dia útil sem nenhuma batida é FALTA: débito
-- da jornada no espelho, e vai para Aprovar jornadas, onde o líder
-- confirma (débito no banco) ou abona. O caminho é o do "dia sem fechar",
-- que grava o lançamento com tipo 'dia_incompleto'.
--
-- A trava do banco só aceitava 'hora_extra' e 'debito'. Se ela estava
-- assim em produção, o "dia sem fechar" nunca chegou à fila: o banco
-- recusava e o aplicativo seguia calado. A conferência no fim diz se já
-- havia algum — se houver, a trava já aceitava e nada muda.
--
-- Pode rodar de novo: tira a trava e põe a mesma.
-- Este arquivo é o delta; o esquema inteiro está em esquema.sql.
-- ============================================================

alter table public.ajustes_jornada
  drop constraint if exists ajustes_jornada_tipo_check;

alter table public.ajustes_jornada
  add constraint ajustes_jornada_tipo_check
  check (tipo in ('hora_extra', 'debito', 'dia_incompleto'));

notify pgrst, 'reload schema';

-- Conferência: a trava nova, e quantos "dia sem fechar" já existiam
select
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'ajustes_jornada_tipo_check') as trava_do_tipo,
  (select count(*) from public.ajustes_jornada
    where tipo = 'dia_incompleto') as dias_sem_fechar_ja_gravados;
