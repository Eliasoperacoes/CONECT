-- ============================================================
-- CONECTA — POR QUE O SÁBADO DE ALGUÉM PREVÊ ZERO
--
-- ESTE ARQUIVO NÃO ALTERA NADA. São três consultas.
--
-- O CASO QUE MOTIVOU, no espelho da Fernanda:
--
--   sáb, 26/09   08:02   Sábado   Sábado   11:57   3h55   +3h55
--
-- Ela trabalhou 3h55 e o saldo do dia ficou +3h55. Isso só acontece de
-- uma forma: o PREVISTO daquele sábado era ZERO. Se fosse 4h00, o saldo
-- seria −0h05.
--
-- E o previsto do sábado só zera por dois caminhos, que esta consulta
-- separa — porque o conserto de cada um é diferente:
--
--   1. `trabalha_sabado = false` na ficha dela. A regra da casa é que
--      todo colaborador trabalha sábado (previsto), com uma folga por
--      mês. Então esse `false` é cadastro errado, e o conserto é
--      apagá-lo para valer o padrão do turno.
--
--   2. Uma AUSÊNCIA APROVADA naquele dia — a folga mensal, por exemplo.
--      Aí o previsto zero está CERTO: o dia foi abonado. O que ela
--      trabalhou por cima vira hora extra de verdade, e o conserto (se
--      houver) é na folga lançada, não na ficha.
-- ============================================================

-- ============================================================
-- 1. QUEM ESTÁ COM SÁBADO DESLIGADO NA FICHA
--
-- `(padrão)` é o certo para quase todo mundo: quer dizer "vale o
-- turno", e turno A e B têm sábado SIM. `não` é o que precisa de
-- atenção fora do estágio.
-- ============================================================
select
  c.nome,
  c.setor,
  c.cargo,
  c.turno,
  case
    when c.trabalha_sabado is null then '(padrão — vale o turno)'
    when c.trabalha_sabado then 'SIM'
    else 'NÃO  <-- previsto zero no sábado'
  end as sabado_na_ficha,
  case
    when c.setor ilike '%está%' or c.setor ilike '%esta%'
      or c.cargo ilike '%estagi%' then 'estágio'
    else 'integral'
  end as perfil
  from public.colaboradores c
 where c.ativo
   and c.trabalha_sabado is false
 order by perfil, c.nome;

-- ============================================================
-- 2. A FERNANDA, e o sábado 26/09 dela em particular
-- ============================================================
select
  c.nome,
  c.turno,
  c.carga_horaria_diaria_minutos as diaria_min,
  c.carga_semanal_minutos        as semanal_min,
  case
    when c.trabalha_sabado is null then '(padrão)'
    when c.trabalha_sabado then 'SIM'
    else 'NÃO'
  end as sabado_na_ficha,
  (
    select string_agg(j.tipo || ' (' || j.estado || ')', ', ')
      from public.justificativas_ausencia j
     where j.colaborador_id = c.id
       and date '2026-09-26' between j.data_inicio and j.data_fim
  ) as ausencia_no_dia
  from public.colaboradores c
 where c.ativo
   and c.nome ilike '%fernanda%';

-- ============================================================
-- 3. QUANTAS FOLGAS DE SÁBADO FORAM LANÇADAS NO MÊS
--
-- A regra é UMA por colaborador por mês. Mais de uma na mesma pessoa,
-- ou uma lançada sem querer, zera um sábado que deveria ser previsto —
-- e é o outro caminho para o que a Fernanda viu.
-- ============================================================
select
  c.nome,
  count(*)                                   as folgas_no_mes,
  string_agg(to_char(j.data_inicio, 'DD/MM'), ', ' order by j.data_inicio) as dias
  from public.justificativas_ausencia j
  join public.colaboradores c on c.id = j.colaborador_id
 where j.tipo = 'folga_sabado'
   and j.estado = 'aprovada'
   and j.data_inicio >= date_trunc('month', date '2026-09-26')
   and j.data_inicio <  date_trunc('month', date '2026-09-26') + interval '1 month'
 group by c.nome
 order by count(*) desc, c.nome;
