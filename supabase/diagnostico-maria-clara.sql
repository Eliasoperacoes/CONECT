-- ============================================================
-- DIAGNÓSTICO: a entrada adiantada da Maria Clara virou "atrasada" (01/10/2026)
--
-- O aviso de atraso só sai quando a batida vem DEPOIS da entrada do turno
-- que está na ficha. Entrar 5 minutos antes só vira atraso se o turno da
-- ficha começa mais cedo do que o horário de verdade dela (ex.: turno A,
-- 07:30, para quem entra às 08:20 no B). Só leitura: não muda nada.
--
-- Uma consulta só: o SQL Editor mostra apenas o último resultado.
-- ============================================================

select c.nome,
       c.turno,
       c.carga_horaria_diaria_minutos as carga_propria,
       c.turno_confirmado_em,
       r.data,
       r.tipo,
       r.hora_formatada,
       to_char(r.horario at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_em_brasilia,
       r.metodo,
       r.justificativa
from public.colaboradores c
left join public.registros_ponto r
       on r.colaborador_id = c.id
      and r.data >= current_date - 3
where c.nome ilike '%maria clara%'
order by r.data desc nulls last, r.horario;
