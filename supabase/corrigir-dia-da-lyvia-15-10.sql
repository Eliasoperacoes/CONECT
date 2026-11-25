-- ============================================================
-- O 15/10 DA LYVIA VOLTA PARA A FILA COM A CONTA DE HOJE (25/11/2026)
--
-- O débito de 4h14 foi aprovado às 08:32, dois minutos depois de uma
-- batida às 08:30 fechar o dia com 31 minutos. Depois disso a Fernanda
-- corrigiu as batidas (almoço das 12:00 às 13:12) e a saída das 17:59
-- fechou o dia de novo: 07:59–12:00 e 13:12–17:59, 8h48 contra 5h00
-- previstas, +3h48. Mas toda correção foi feita com o dia ainda aberto, e
-- dia já decidido não reabre com batida normal — o débito ficou com a
-- conta das 08:30.
--
-- O dia volta à fila como hora extra de 3h48, PENDENTE: é o que teria
-- acontecido sem a decisão antiga. Quem aprova ou recusa é a Fernanda.
--
-- Só altera se houver UMA Lyvia ativa e se o dia ainda estiver com o
-- débito de 254 minutos aprovado. Rodar de novo não muda nada.
-- ============================================================
update public.ajustes_jornada a
   set tipo                = 'hora_extra',
       minutos             = 228,
       minutos_trabalhados = 528,
       minutos_previstos   = 300,
       estado              = 'pendente',
       origem              = 'pendencia',
       aprovador_id        = null,
       aprovador_nome      = null,
       decidido_em         = null,
       observacao          = 'Débito de 4h14 aprovado às 08:32 com o dia fechado às 08:30; as batidas foram corrigidas depois (07:59–12:00, 13:12–17:59). Volta à fila com a conta de hoje.'
  from public.colaboradores c
 where c.id = a.colaborador_id
   and c.nome ilike 'l_via%'
   and c.ativo
   and (select count(*) from public.colaboradores x where x.nome ilike 'l_via%' and x.ativo) = 1
   and a.data = date '2026-10-15'
   and a.tipo = 'debito'
   and a.minutos = 254
   and a.estado = 'aprovado';

-- CONFERÊNCIA: o esperado é uma linha — hora_extra, 228, pendente, sem
-- aprovador. Se vier debito/254/aprovado, o update não pegou: mande o print.
select c.nome, a.data, a.tipo, a.minutos, a.minutos_trabalhados, a.minutos_previstos,
       a.estado, a.aprovador_nome
  from public.colaboradores c
  join public.ajustes_jornada a
    on a.colaborador_id = c.id and a.data = date '2026-10-15'
 where c.nome ilike 'l_via%'
   and c.ativo;
