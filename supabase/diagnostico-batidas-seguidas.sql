-- ============================================================
-- AS BATIDAS SEGUIDAS DE HOJE (29/10/2026) — SÓ LEITURA
--
-- No dia em que todos começaram, muitas batidas pareceram duplicadas. Há
-- dois casos, e só um estraga o dia:
--
--   · a leitura do QR até 2 minutos depois da anterior NÃO avança a
--     jornada (registrar_marcacao, 'repetida'): fica como marcação
--     original, com NSR, na fila do RH para tratar. É o esperado;
--   · a leitura DEPOIS dos 2 minutos vira o passo seguinte — a "saída
--     para almoço" às 08:05 de quem entrou às 08:02. Esta estraga o dia.
--
-- Uma linha por marcação de hoje que ficou a menos de 15 minutos da
-- anterior da mesma pessoa. Troque o `hoje` para olhar outro dia.
-- ============================================================

with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as dia),
     marcacoes as (
       select o.colaborador_id, o.nsr, o.registrado_em, o.tipo_pedido, o.fora_da_jornada, o.registro_id,
              r.tipo as entrou_como,
              lag(o.registrado_em) over (partition by o.colaborador_id order by o.registrado_em) as anterior
         from public.marcacoes_originais o
         join hoje on o.data = hoje.dia
         left join public.registros_ponto r on r.id = o.registro_id
     )
select c.nome,
       c.loja,
       to_char(m.anterior at time zone 'America/Sao_Paulo', 'HH24:MI:SS')     as anterior,
       to_char(m.registrado_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as esta,
       to_char(m.registrado_em - m.anterior, 'MI"min"SS"s"')                  as depois_de,
       case
         when m.registro_id is not null then 'ENTROU NA JORNADA como ' || m.entrou_como
         else 'fora da jornada (' || m.fora_da_jornada || ') — fila do RH'
       end                                                                     as o_que_virou,
       m.nsr
  from marcacoes m
  join public.colaboradores c on c.id = m.colaborador_id
 where m.anterior is not null
   and m.registrado_em - m.anterior < interval '15 minutes'
 order by (m.registro_id is null), c.nome, m.registrado_em;
