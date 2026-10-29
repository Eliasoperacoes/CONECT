-- ============================================================
-- O HORÁRIO DE CADA COLABORADOR (29/10/2026) — SÓ LEITURA
--
-- Para as gerentes conferirem: uma linha por pessoa ativa que bate ponto
-- (nível 1 e 2), por loja, com o horário que o sistema usa para medir as
-- batidas. Exporte em "Export → CSV" e mande a cada loja.
--
-- Os horários repetem TURNOS (tipos.ts). Turno novo entra lá e aqui.
-- `confirmado` vazio: a pessoa ainda vai ver "Qual é o seu horário?" na
-- próxima batida. Horário errado: o RH troca o turno na ficha.
-- ============================================================

with pessoas as (
  select c.*,
         (lower(c.setor) like '%está%' or lower(c.setor) like '%esta%' or lower(c.cargo) like '%estagi%') as estagio
    from public.colaboradores c
   where c.ativo and c.nivel <= 2
)
select loja,
       nome,
       setor,
       case
         when turno = 'P' then 'Próprio'
         when estagio and turno in ('A', 'B') then 'E0 (a definir)'
         else coalesce(turno, 'A')
       end as turno,
       case
         when turno = 'P' then horario_proprio ->> 'entrada'
         when turno = 'B' and not estagio then '08:20'
         when turno = 'C' then '08:00'
         when turno = 'D' then '08:20'
         when turno = 'E3' then '13:00'
         else '07:30'
       end as entrada,
       case
         when turno = 'P' then coalesce((horario_proprio ->> 'intervalo_saida') || ' às ' || (horario_proprio ->> 'intervalo_retorno'), 'sem intervalo')
         when estagio and turno = 'E1' then 'pausa de 15 min'
         when estagio and turno = 'E3' then 'pausa de 15 min'
         when estagio then 'direto'
         when turno = 'B' then '11:00 às 12:30'
         when turno in ('C', 'D') then '1h30, às 11:00 ou às 12:30'
         else '12:30 às 14:00'
       end as almoco,
       case
         when turno = 'P' then horario_proprio ->> 'saida'
         when estagio and turno = 'E2' then '12:30'
         when estagio and turno = 'E3' then '18:00'
         when estagio then '13:30'
         when turno in ('B', 'D') then '18:00'
         when turno = 'C' then '17:40'
         else '17:10'
       end as saida,
       case
         when coalesce(trabalha_sabado,
                       case when turno = 'P' then not estagio
                            when estagio then turno in ('E2', 'E3')
                            else true end)
         then '08:00 às 12:00' else 'não'
       end as sabado,
       to_char(turno_confirmado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as confirmado
  from pessoas
 order by loja, nome;
