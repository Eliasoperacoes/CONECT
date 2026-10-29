-- ============================================================
-- A ENTRADA DE HOJE CONTRA O HORÁRIO DA FICHA (29/10/2026) — SÓ LEITURA
--
-- Depois dos horários das filiais (turnos-das-filiais.sql), a batida da
-- manhã "não considerou o horário normal". A entrada é medida pelo turno
-- GRAVADO na ficha: quem está na filial e ainda tem o A (07:30, o padrão de
-- todo cadastro) é cobrado como atrasado ao entrar às 08:00.
--
-- Uma linha por pessoa que bateu a entrada hoje, primeiro as que ficaram
-- mais longe do horário esperado. `situacao` aponta o caso.
-- ============================================================

with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as dia),
     entradas as (
       select r.colaborador_id, r.horario
         from public.registros_ponto r join hoje on r.data = hoje.dia
        where r.tipo = 'entrada'
     ),
     pessoas as (
       select c.nome, c.loja, c.turno, c.turno_confirmado_em,
              c.loja in ('Porto Ferreira', 'Palmeiras', 'Descalvado', 'Santa Rita') as filial,
              (e.horario at time zone 'America/Sao_Paulo')::time as entrou,
              case c.turno
                when 'A' then time '07:30' when 'B' then time '08:20'
                when 'C' then time '08:00' when 'D' then time '08:20'
                when 'E3' then time '13:00'
                when 'P' then (c.horario_proprio ->> 'entrada')::time
                else time '07:30'
              end as esperada
         from entradas e join public.colaboradores c on c.id = e.colaborador_id
     )
select nome,
       loja,
       turno,
       to_char(entrou, 'HH24:MI')   as entrou,
       to_char(esperada, 'HH24:MI') as esperada,
       (extract(epoch from (entrou - esperada)) / 60)::int as minutos_de_diferenca,
       case
         when filial and turno in ('A', 'B') then 'FILIAL COM HORÁRIO DE PIRASSUNUNGA'
         when turno_confirmado_em is null then 'horário ainda não confirmado'
         when abs(extract(epoch from (entrou - esperada)) / 60) <= 5 then 'no horário'
         else 'fora do horário'
       end as situacao,
       to_char(turno_confirmado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as horario_confirmado_em
  from pessoas
 order by abs(extract(epoch from (entrou - esperada))) desc;
