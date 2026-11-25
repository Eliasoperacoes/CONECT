-- ============================================================
-- A HISTÓRIA DE UM DIA DE PONTO, EM ORDEM (25/11/2026) — SÓ LEITURA
--
-- Para quando a decisão da fila não bate com as batidas que o espelho
-- mostra hoje. Põe na linha do tempo: as batidas como foram registradas
-- (marcacoes_originais), as batidas tratadas e quem as corrigiu
-- (registros_ponto), e a apuração — quando foi criada, com que trabalhado
-- e previsto, e quando foi decidida. Um dia decidido não volta à fila
-- sozinho: se a correção veio DEPOIS da decisão, a decisão é da conta
-- antiga.
--
-- Troque 'l_via%' pelo começo do nome e '2026-10-15' pelo dia.
-- Uma consulta só, de propósito: o SQL Editor mostra apenas a última.
-- ============================================================
with parametros as (
  select date '2026-10-15' as dia
),
pessoa as (
  select c.id, c.nome
    from public.colaboradores c
   where c.nome ilike 'l_via%'
),
eventos as (
  -- 1. A batida como saiu do aparelho
  select pe.nome, m.registrado_em as quando,
         '1. batida original' as o_que,
         coalesce(m.tipo_pedido, '?') || ' pelo ' || m.metodo
           || coalesce(' — fora da jornada: ' || m.fora_da_jornada, '') as detalhe,
         null::text as quem
    from public.marcacoes_originais m
    join pessoa pe on pe.id = m.colaborador_id
    cross join parametros p
   where m.data = p.dia
  union all
  -- 2. A batida como está hoje no espelho (corrigida ou não)
  select pe.nome, r.criado_em,
         '2. batida no espelho',
         r.tipo || ' ' || r.hora_formatada || ' (' || r.metodo || ')'
           || coalesce(' — ' || r.justificativa, ''),
         r.ajustado_por_nome
    from public.registros_ponto r
    join pessoa pe on pe.id = r.colaborador_id
    cross join parametros p
   where r.data = p.dia
  union all
  -- 3. A apuração nasceu
  select pe.nome, a.criado_em,
         '3. apuração criada',
         a.tipo || ' de ' || a.minutos || ' min — trabalhado ' || a.minutos_trabalhados
           || ' min, previsto ' || a.minutos_previstos || ' min',
         null
    from public.ajustes_jornada a
    join pessoa pe on pe.id = a.colaborador_id
    cross join parametros p
   where a.data = p.dia
  union all
  -- 4. A apuração foi decidida
  select pe.nome, a.decidido_em,
         '4. apuração decidida',
         a.estado || ': ' || a.tipo || ' de ' || a.minutos || ' min'
           || coalesce(' — ' || a.observacao, ''),
         a.aprovador_nome
    from public.ajustes_jornada a
    join pessoa pe on pe.id = a.colaborador_id
    cross join parametros p
   where a.data = p.dia
     and a.decidido_em is not null
)
select nome,
       to_char(quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       o_que,
       detalhe,
       quem
  from eventos
 order by nome, eventos.quando, o_que;
