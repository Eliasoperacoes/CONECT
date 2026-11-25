-- ============================================================
-- DIAGNÓSTICO: A FALTA CORRIGIDA PARA DÉBITO VOLTA A ZERO? (25/11/2026)
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- A apuração da madrugada zera o débito de um dia que tem AUSÊNCIA
-- APROVADA (atestado, falta justificada, folga...) e grava "Ausência
-- aprovada" como aprovador. Se a falta combinada para descontar tiver uma
-- justificativa aprovada no mesmo dia, a correção para débito se desfaz às
-- 03:00. Aqui, os três casos corrigidos à mão: o dia como está, e a
-- ausência aprovada que cobre o dia (sem observação nem anexo).
-- ============================================================
with casos (padrao, dia) as (
  values ('leigislaine%', date '2026-11-07'),
         ('fernanda%metzner%', date '2026-10-30'),
         ('mikael%', date '2026-11-21')
)
select c.nome,
       k.dia,
       a.tipo                as dia_tipo,
       a.minutos             as dia_minutos,
       a.estado              as dia_estado,
       a.aprovador_nome      as dia_decidido_por,
       to_char(a.decidido_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as dia_decidido_em,
       j.tipo                as ausencia_tipo,
       j.estado              as ausencia_estado,
       j.aprovador_nome      as ausencia_aprovada_por,
       to_char(j.data_inicio, 'DD/MM') || ' a ' || to_char(j.data_fim, 'DD/MM') as ausencia_periodo,
       exists (select 1 from public.dias_abonados d
                where d.colaborador_id = c.id and k.dia between d.data_inicio and d.data_fim) as dia_abonado
  from casos k
  join public.colaboradores c on c.nome ilike k.padrao and c.ativo
  left join public.ajustes_jornada a on a.colaborador_id = c.id and a.data = k.dia
  left join public.justificativas_ausencia j
    on j.colaborador_id = c.id and k.dia between j.data_inicio and j.data_fim
 order by k.dia;
