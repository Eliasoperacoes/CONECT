-- ============================================================
-- DIAGNÓSTICO: BATIDA DUPLICADA (Yan, 08/10/2026)
--
-- Só leitura. Mostra, dos últimos 7 dias de quem tem "Yan" no nome:
--   1. as batidas do tratamento (registros_ponto) — o que o espelho mostra;
--   2. as marcações originais (marcacoes_originais) — o que o REP registrou.
-- Uma batida normal aparece UMA vez em cada parte, e a original aponta
-- para a batida (registro_id). Duplicação aparece como duas linhas com
-- horários a segundos de distância.
-- ============================================================

-- 1. O que o espelho mostra
select 'tratamento' as parte,
       c.nome,
       r.data,
       r.tipo,
       to_char(r.horario at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as hora,
       r.metodo,
       r.nsr,
       to_char(r.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as gravado_em,
       r.id
  from public.registros_ponto r
  join public.colaboradores c on c.id = r.colaborador_id
 where c.nome ilike '%yan%'
   and r.data >= current_date - 7
 order by c.nome, r.horario;

-- 2. O que o REP registrou
select 'original' as parte,
       c.nome,
       o.data,
       o.tipo_pedido,
       to_char(o.registrado_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as hora,
       o.metodo,
       o.nsr,
       o.cnpj_empregador,
       o.fora_da_jornada,
       o.registro_id
  from public.marcacoes_originais o
  join public.colaboradores c on c.id = o.colaborador_id
 where c.nome ilike '%yan%'
   and o.data >= current_date - 7
 order by c.nome, o.registrado_em;
