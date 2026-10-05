-- ============================================================
-- O SÁBADO DE FOLGA TRABALHADO DA FERNANDA — CONECTA
--
-- Só LÊ, não altera nada. Uma consulta só (o SQL Editor mostra apenas
-- o último resultado), com a coluna `secao` separando os assuntos.
--
-- Pergunta (Elias, 05/10/2026): a Fernanda trabalhou num sábado que era
-- folga dela, combinado com o RH para acumular e folgar um sábado no mês
-- seguinte — e o banco de horas não recebeu o saldo. Antes de mexer em
-- regra, o que o banco tem: a ficha, as batidas dos sábados, a folga
-- lançada, o que a apuração gerou (e se está esperando aprovação) e a
-- compensação do sábado.
-- ============================================================

with fernanda as (
  select id, nome, cargo, loja, turno, carga_horaria_diaria_minutos,
         carga_semanal_minutos, trabalha_sabado, tem_intervalo
    from public.colaboradores
   where nome ilike 'fernanda%'
)
select '1 ficha' as secao, f.nome as quem, null::date as dia,
       format('turno %s · %s min/dia · %s min/semana · trabalha sábado: %s · intervalo: %s · %s, %s',
              f.turno, f.carga_horaria_diaria_minutos, f.carga_semanal_minutos,
              f.trabalha_sabado, f.tem_intervalo, f.cargo, f.loja) as detalhe
  from fernanda f

union all
select '2 batidas de sábado', f.nome, r.data,
       string_agg(r.tipo || ' ' || to_char(r.horario at time zone 'America/Sao_Paulo', 'HH24:MI') || ' (' || r.metodo || ')',
                  ' · ' order by r.horario)
  from fernanda f
  join public.registros_ponto r on r.colaborador_id = f.id
 where r.data >= date '2026-09-01' and extract(dow from r.data) = 6
 group by f.nome, r.data

union all
select '3 ausências lançadas', f.nome, j.data_inicio,
       format('%s · de %s a %s · %s%s', j.tipo, j.data_inicio, j.data_fim, j.estado,
              coalesce(' · obs: ' || left(j.observacao, 80), ''))
  from fernanda f
  join public.justificativas_ausencia j on j.colaborador_id = f.id
 where j.data_fim >= date '2026-09-01'

union all
select '4 apuração (ajustes de jornada)', f.nome, a.data,
       format('%s %s min · trabalhou %s · previsto %s · %s%s%s',
              a.tipo, a.minutos, a.minutos_trabalhados, a.minutos_previstos, a.estado,
              case when extract(dow from a.data) = 6 then ' · SÁBADO' else '' end,
              coalesce(' · por ' || a.aprovador_nome, ''))
  from fernanda f
  join public.ajustes_jornada a on a.colaborador_id = f.id
 where a.data >= date '2026-09-01'

union all
select '5 compensação do sábado', f.nome, null::date,
       format('%s · anterior %s · juntada %s · folgas %s · consumida %s · saldo %s',
              c.mes, c.anterior, c.juntada, c.folgas, c.consumida, c.saldo_final)
  from fernanda f
  join public.compensacao_sabado c on c.colaborador_id = f.id

order by secao, quem, dia nulls first;
