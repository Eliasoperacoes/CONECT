-- ============================================================
-- SALDO DO BANCO DE HORAS DE UMA PESSOA (25/11/2026) — SÓ LEITURA
--
-- A mesma conta da tela (obterSaldoAcumulado, ponto.ts): soma só o que foi
-- APROVADO; débito entra negativo, dia incompleto conta zero. O pendente
-- vem à parte — ainda não é saldo, espera alguém decidir.
--
-- Uma linha por mês dos últimos 3 meses (o atual até hoje), depois o total
-- dos 3 meses e o saldo total do banco, desde o primeiro lançamento.
--
-- Para outra pessoa, troque 'l_via%' pelo começo do nome. O '_' aceita
-- qualquer letra: pega Lyvia, Livia e Lívia.
--
-- Uma consulta só, de propósito: o SQL Editor mostra apenas a última.
-- ============================================================
with lancamentos as (
  select a.colaborador_id,
         a.estado,
         a.data,
         case
           when a.tipo = 'dia_incompleto' then 0
           when a.tipo = 'debito'         then -a.minutos
           else a.minutos
         end as minutos_com_sinal
    from public.ajustes_jornada a
),
pessoas as (
  select c.id, c.nome, c.ativo
    from public.colaboradores c
   where c.nome ilike 'l_via%'
),
meses as (
  select generate_series(date_trunc('month', current_date) - interval '2 months',
                         date_trunc('month', current_date),
                         interval '1 month')::date as inicio
),
periodos as (
  select p.id, p.nome, p.ativo, m.inicio, (m.inicio + interval '1 month')::date as fim,
         to_char(m.inicio, 'MM/YYYY') as periodo, m.inicio as ordem
    from pessoas p cross join meses m
  union all
  select p.id, p.nome, p.ativo, (select min(inicio) from meses),
         (date_trunc('month', current_date) + interval '1 month')::date,
         'TOTAL DOS 3 MESES', date '2999-01-01'
    from pessoas p
  union all
  select p.id, p.nome, p.ativo, date '1900-01-01', date '2999-01-01',
         'SALDO TOTAL DO BANCO', date '2999-12-31'
    from pessoas p
),
somas as (
  select pe.nome, pe.ativo, pe.periodo, pe.ordem,
         coalesce(sum(l.minutos_com_sinal) filter (where l.estado = 'aprovado' and l.minutos_com_sinal > 0), 0) as credito_min,
         coalesce(sum(l.minutos_com_sinal) filter (where l.estado = 'aprovado' and l.minutos_com_sinal < 0), 0) as debito_min,
         coalesce(sum(l.minutos_com_sinal) filter (where l.estado = 'aprovado'), 0)                              as saldo_min,
         coalesce(sum(l.minutos_com_sinal) filter (where l.estado = 'pendente'), 0)                              as pendente_min
    from periodos pe
    left join lancamentos l
      on l.colaborador_id = pe.id and l.data >= pe.inicio and l.data < pe.fim
   group by pe.id, pe.nome, pe.ativo, pe.periodo, pe.ordem
)
select nome,
       periodo,
       '+' || (credito_min / 60) || 'h' || lpad((credito_min % 60)::text, 2, '0')          as horas_extras,
       '-' || (abs(debito_min) / 60) || 'h' || lpad((abs(debito_min) % 60)::text, 2, '0')  as debitos,
       case when saldo_min < 0 then '-' else '+' end
         || (abs(saldo_min) / 60) || 'h' || lpad((abs(saldo_min) % 60)::text, 2, '0')        as saldo,
       saldo_min                                                                              as saldo_em_minutos,
       case when pendente_min < 0 then '-' else '+' end
         || (abs(pendente_min) / 60) || 'h' || lpad((abs(pendente_min) % 60)::text, 2, '0')  as esperando_decisao
  from somas
 order by ativo desc, nome, ordem;
