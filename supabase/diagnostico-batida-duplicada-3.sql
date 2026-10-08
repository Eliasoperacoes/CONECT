-- ============================================================
-- DIAGNÓSTICO 3: A CORREÇÃO DO DIA 08/10 DO YAN GRAVOU?
--
-- Só leitura. Uma consulta só:
--   'batida'    — como o dia 08/10 está AGORA no banco (o que o espelho
--                 deveria mostrar). Correção do RH/líder sai com o método
--                 ajuste_rh / ajuste_lider e quem ajustou.
--   'auditoria' — o que foi feito no ponto do Yan hoje por outra pessoa.
-- ============================================================
select 'batida' as fonte,
       to_char(r.horario at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       r.tipo as o_que,
       r.metodo || coalesce(' por ' || r.ajustado_por_nome, '') as detalhe,
       left(coalesce(r.justificativa, ''), 80) as justificativa
  from public.registros_ponto r
  join public.colaboradores c on c.id = r.colaborador_id
 where c.nome ilike '%yan%'
   and r.data = date '2026-10-08'
union all
select 'auditoria',
       to_char(a.data_hora at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS'),
       a.acao,
       a.usuario_nome,
       left(a.detalhes, 160)
  from public.auditoria a
 where a.detalhes ilike '%yan%'
   and a.usuario_nome not ilike '%yan%'
   and a.data_hora >= timestamptz '2026-10-08 00:00-03'
 order by fonte desc, quando;
