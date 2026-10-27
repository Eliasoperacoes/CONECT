-- ============================================================
-- AS HORAS EXTRAS PASSAM PELO LÍDER? (26/10/2026) — SÓ LEITURA
--
-- Pelo código (apuracaoDoDia.ts): o dia que passa da tolerância vira
-- hora extra PENDENTE, na fila de quem responde pela pessoa, e só entra
-- no banco de horas depois de aprovada. Correção de batida feita pelo RH
-- já entra aprovada (origem "correcao_manual").
--
-- Os últimos 30 dias, por estado e por quem decidiu. Se o código estiver
-- certo, a hora extra aprovada vem com o nome de um líder ou gerente, e
-- não de "Tolerância automática".
-- ============================================================

select tipo,
       estado,
       origem,
       coalesce(aprovador_nome, '—')        as quem_decidiu,
       count(*)                             as dias,
       round(sum(minutos) / 60.0, 1)        as horas
  from public.ajustes_jornada
 where data >= current_date - 30
   and tipo = 'hora_extra'
 group by tipo, estado, origem, coalesce(aprovador_nome, '—')
 order by estado, dias desc;
