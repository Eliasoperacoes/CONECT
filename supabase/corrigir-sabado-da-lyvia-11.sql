-- ============================================================
-- O SÁBADO DE NOVEMBRO QUE A LYVIA FALTOU VIRA DÉBITO (25/11/2026)
--
-- Como o do Mikael (corrigir-falta-mikael-21-11.sql): falta sem batida,
-- abonada na fila com 0h00, quando deveria descontar as 4h00 previstas.
-- O dia foi informado como "4/11 sáb" — 04/11 é quarta —, então o script
-- não depende da data: acha o sábado de novembro da Lyvia que está
-- aprovado com 0 minutos, previsto de 4h00, sem nenhuma batida e sem
-- ausência aprovada (a apuração da madrugada zeraria o débito de um dia
-- com ausência aprovada, e aí o abono seria outro assunto).
--
-- Só altera se houver UMA Lyvia ativa e UM sábado assim. Com zero ou mais
-- de um, não muda nada: a conferência mostra os sábados para decidir.
-- Rodar de novo não muda nada.
-- ============================================================
with pessoa as (
  select c.id
    from public.colaboradores c
   where c.nome ilike 'l_via%'
     and c.ativo
     and (select count(*) from public.colaboradores x where x.nome ilike 'l_via%' and x.ativo) = 1
),
alvo as (
  select a.id
    from public.ajustes_jornada a
    join pessoa pe on pe.id = a.colaborador_id
   where a.data >= date '2026-11-01' and a.data < date '2026-12-01'
     and extract(dow from a.data) = 6
     and a.estado = 'aprovado'
     and a.minutos = 0
     and a.minutos_previstos = 240
     and not exists (select 1 from public.registros_ponto r
                      where r.colaborador_id = a.colaborador_id and r.data = a.data)
     and not exists (select 1 from public.justificativas_ausencia j
                      where j.colaborador_id = a.colaborador_id
                        and j.estado = 'aprovada'
                        and a.data between j.data_inicio and j.data_fim)
)
update public.ajustes_jornada a
   set tipo           = 'debito',
       minutos        = a.minutos_previstos,
       aprovador_id   = null,
       aprovador_nome = 'Correção administrativa',
       decidido_em    = now(),
       observacao     = 'Falta de sábado sem batida contada como débito das 4h00 previstas; o dia havia sido abonado na fila.'
 where a.id in (select id from alvo)
   and (select count(*) from alvo) = 1;

-- CONFERÊNCIA: os sábados de novembro da Lyvia. O esperado é o dia da
-- falta com debito, 240, aprovado, Correção administrativa; o saldo total
-- desce 4h00 (−470 min, se o 15/10 já foi corrigido). Se nenhum sábado
-- mudou, mande o print: a linha mostra por que ficou de fora.
select c.nome,
       to_char(s.dia, 'DD/MM') || ' sáb'                                   as sabado,
       (select count(*) from public.registros_ponto r
         where r.colaborador_id = c.id and r.data = s.dia)                 as batidas,
       a.tipo, a.minutos, a.minutos_previstos, a.estado, a.aprovador_nome,
       (select string_agg(j.tipo || ' ' || j.estado, ', ')
          from public.justificativas_ausencia j
         where j.colaborador_id = c.id and s.dia between j.data_inicio and j.data_fim) as ausencia,
       (select sum(case when x.tipo = 'debito' then -x.minutos
                        when x.tipo = 'dia_incompleto' then 0
                        else x.minutos end)
          from public.ajustes_jornada x
         where x.colaborador_id = c.id and x.estado = 'aprovado')         as saldo_total_em_minutos
  from public.colaboradores c
  cross join (select d::date as dia
                from generate_series(date '2026-11-07', date '2026-11-28', interval '7 days') d) s
  left join public.ajustes_jornada a on a.colaborador_id = c.id and a.data = s.dia
 where c.nome ilike 'l_via%'
   and c.ativo
 order by s.dia;
