-- ============================================================
-- POR QUE O ESPELHO E O BANCO DE HORAS DÃO NÚMEROS DIFERENTES (25/11/2026)
-- SÓ LEITURA
--
-- O topo do espelho soma o saldo de cada dia PELAS BATIDAS, decidido ou
-- não (ponto.ts, saldoPeriodoMinutos). O banco de horas soma só as
-- apurações APROVADAS (obterSaldoAcumulado). Hora extra recusada, ou que
-- nunca virou apuração, aparece no espelho e não no banco.
--
-- Uma linha por dia do mês com batida ou apuração: as batidas (* = batida
-- corrigida ou preenchida), o que a apuração diz, o estado e quanto entrou
-- no banco. A última linha soma. Compare "no_banco" com o saldo do dia no
-- espelho.
--
-- Troque 'l_via%' pelo começo do nome e '2026-10-01' pelo 1º dia do mês.
-- Uma consulta só, de propósito: o SQL Editor mostra apenas a última.
-- ============================================================
with parametros as (
  select date '2026-10-01' as inicio,
         (date '2026-10-01' + interval '1 month')::date as fim
),
pessoa as (
  select c.id, c.nome
    from public.colaboradores c
   where c.nome ilike 'l_via%'
),
batidas as (
  select r.colaborador_id, r.data,
         string_agg(r.hora_formatada
                    || case when r.metodo in ('ajuste_rh', 'ajuste_lider', 'preenchimento_turno') then '*' else '' end,
                    ' ' order by r.horario) as batidas
    from public.registros_ponto r
    join pessoa pe on pe.id = r.colaborador_id
    cross join parametros p
   where r.data >= p.inicio and r.data < p.fim
   group by r.colaborador_id, r.data
),
apuracoes as (
  select a.*
    from public.ajustes_jornada a
    join pessoa pe on pe.id = a.colaborador_id
    cross join parametros p
   where a.data >= p.inicio and a.data < p.fim
),
-- Os dias vêm das DUAS fontes: falta não tem batida, e batida pode não
-- ter virado apuração
dias_da_pessoa as (
  select colaborador_id, data from batidas
  union
  select colaborador_id, data from apuracoes
),
dias as (
  select pe.nome,
         d.data,
         b.batidas,
         a.id is not null as tem_apuracao,
         a.tipo,
         a.minutos,
         a.estado,
         a.aprovador_nome,
         a.observacao,
         case
           when a.id is null or a.estado <> 'aprovado' or a.tipo = 'dia_incompleto' then 0
           when a.tipo = 'debito' then -a.minutos
           else a.minutos
         end as no_banco_min
    from dias_da_pessoa d
    join pessoa pe on pe.id = d.colaborador_id
    left join batidas b on b.colaborador_id = d.colaborador_id and b.data = d.data
    left join apuracoes a on a.colaborador_id = d.colaborador_id and a.data = d.data
),
linhas as (
  select nome,
         0 as ordem,
         data,
         to_char(data, 'DD/MM') || ' '
           || (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from data)::int + 1] as dia,
         coalesce(batidas, '— sem batida —')                                as batidas,
         case when tem_apuracao then tipo else 'SEM APURAÇÃO' end           as apuracao,
         minutos,
         estado,
         no_banco_min,
         aprovador_nome,
         observacao
    from dias
  union all
  select nome, 1, null, 'TOTAL', null, null, null, null, sum(no_banco_min), null, null
    from dias
   group by nome
)
select nome,
       dia,
       batidas,
       apuracao,
       minutos,
       estado,
       case when no_banco_min < 0 then '-' else '+' end
         || (abs(no_banco_min) / 60) || 'h' || lpad((abs(no_banco_min) % 60)::text, 2, '0') as no_banco,
       aprovador_nome as quem_decidiu,
       observacao
  from linhas
 order by nome, ordem, data;
