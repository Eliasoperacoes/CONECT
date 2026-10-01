-- ============================================================
-- DIAGNÓSTICO: as batidas do José Eduardo hoje, e o turno dele (01/10/2026)
--
-- Só leitura. As duas últimas batidas não pediram motivo. Para saber se
-- deviam, é preciso ver a hora de cada uma contra o turno da ficha.
-- ============================================================

select c.nome,
       c.turno,
       r.tipo,
       r.hora_formatada,
       to_char(r.horario at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as horario_em_brasilia,
       r.metodo,
       r.justificativa,
       case
         when r.id ~ '^ponto-[0-9a-f]{32}$' and r.horario = r.criado_em then 'pelo servidor'
         else 'pelo aparelho ou correção'
       end as caminho
from public.registros_ponto r
join public.colaboradores c on c.id = r.colaborador_id
where c.nome ilike '%jos%eduardo%'
  and r.data = (now() at time zone 'America/Sao_Paulo')::date
order by r.horario;
