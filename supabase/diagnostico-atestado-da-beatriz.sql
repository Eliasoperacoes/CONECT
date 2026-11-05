-- ============================================================
-- O ATESTADO DA BEATRIZ E O BANCO (05/11/2026) — SÓ LEITURA
--
-- O RH aprovou o atestado e o espelho segue mostrando débito. A regra
-- (`decidirLevantamento`): dia coberto por ausência APROVADA derruba o
-- débito do dia, pendente ou já confirmado, para zero com o aprovador
-- "Ausência aprovada". Isto mostra, desde 01/10, as ausências dela e cada
-- lançamento do banco, dizendo se o dia está coberto por ausência aprovada.
--
--   coberto = sim e débito > 0  → a regra não rodou (defeito ou função antiga)
--   coberto = não e débito > 0  → o atestado não cobre aquele dia
--
-- Uma consulta só: o SQL Editor mostra apenas o último resultado.
-- ============================================================
with pessoa as (
  select id, nome from public.colaboradores where nome ilike 'beatriz%'
)
select p.nome,
       'ausência'                                                     as o_que,
       to_char(j.data_inicio, 'DD/MM') || ' a ' || to_char(j.data_fim, 'DD/MM') as dia,
       j.tipo                                                         as tipo,
       null::integer                                                  as minutos,
       j.estado,
       coalesce(j.aprovador_nome, '—')                                as quem_decidiu,
       to_char(j.decidido_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
       '—'                                                            as coberto,
       j.data_inicio                                                  as ordem
  from public.justificativas_ausencia j
  join pessoa p on p.id = j.colaborador_id
 where j.data_fim >= date '2026-10-01'
union all
select p.nome,
       'banco',
       to_char(a.data, 'DD/MM'),
       a.tipo,
       a.minutos,
       a.estado,
       coalesce(a.aprovador_nome, '—'),
       to_char(a.decidido_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
       case when exists (
         select 1 from public.justificativas_ausencia j
          where j.colaborador_id = a.colaborador_id
            and j.estado = 'aprovada'
            and a.data between j.data_inicio and j.data_fim
       ) then 'sim' else 'não' end,
       a.data
  from public.ajustes_jornada a
  join pessoa p on p.id = a.colaborador_id
 where a.data >= date '2026-10-01'
order by nome, ordem desc, o_que;
