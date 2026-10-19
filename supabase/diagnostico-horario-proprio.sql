-- ============================================================
-- O HORÁRIO PRÓPRIO GRAVADO? (19/10/2026) — SÓ LEITURA
--
-- O Elias salvou o horário digitado de uma pessoa e o espelho não mudou.
-- Antes de mexer em código: o que o banco tem? Troque o nome no `ilike`
-- se precisar. Mostra só o horário — nada da ficha pessoal.
--
--   turno            'P' = horário próprio gravado
--   horario_proprio  os horários digitados (vazio = não chegaram ao banco)
--   confirmado_em    quando o turno mudou pela última vez
--   check_ligado     a conferência do horário existe no banco
-- ============================================================

select c.nome,
       c.turno,
       c.horario_proprio,
       c.turno_confirmado_em as confirmado_em,
       exists (select 1 from pg_constraint
                where conname = 'colaboradores_horario_proprio_valido') as check_ligado
  from public.colaboradores c
 where c.nome ilike '%marc%'
 order by c.nome;
