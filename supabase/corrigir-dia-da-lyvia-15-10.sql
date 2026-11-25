-- ============================================================
-- O 15/10 DA LYVIA PASSA A HORA EXTRA DE 3h48, APROVADA (25/11/2026)
--
-- O débito de 4h14 foi aprovado às 08:32, dois minutos depois de uma
-- batida às 08:30 fechar o dia com 31 minutos. Depois disso a Fernanda
-- corrigiu as batidas (almoço das 12:00 às 13:12) e a saída das 17:59
-- fechou o dia de novo: 07:59–12:00 e 13:12–17:59, 8h48 contra 5h00
-- previstas, +3h48. Mas toda correção foi feita com o dia ainda aberto, e
-- dia já decidido não reabre com batida normal — o débito ficou com a
-- conta das 08:30.
--
-- Decisão do Elias (administrador): sai o débito e entra a hora extra
-- de 3h48, já aprovada. Saldo: −11h52 + 4h14 + 3h48 = −3h50.
--
-- Só altera se houver UMA Lyvia ativa e se o dia estiver com o débito de
-- 254 minutos aprovado, ou já com a hora extra de 228 pendente (a versão
-- anterior deste arquivo). Rodar de novo não muda nada.
-- ============================================================
update public.ajustes_jornada a
   set tipo                = 'hora_extra',
       minutos             = 228,
       minutos_trabalhados = 528,
       minutos_previstos   = 300,
       estado              = 'aprovado',
       aprovador_id        = null,
       aprovador_nome      = 'Correção administrativa',
       decidido_em         = now(),
       observacao          = 'Débito de 4h14 aprovado às 08:32 com o dia fechado às 08:30; as batidas foram corrigidas depois (07:59–12:00, 13:12–17:59). Hora extra de 3h48 aprovada pela administração.'
  from public.colaboradores c
 where c.id = a.colaborador_id
   and c.nome ilike 'l_via%'
   and c.ativo
   and (select count(*) from public.colaboradores x where x.nome ilike 'l_via%' and x.ativo) = 1
   and a.data = date '2026-10-15'
   and (   (a.tipo = 'debito'     and a.minutos = 254 and a.estado = 'aprovado')
        or (a.tipo = 'hora_extra' and a.minutos = 228 and a.estado = 'pendente'));

-- CONFERÊNCIA: o 15/10 tem de vir hora_extra, 228, aprovado, Correção
-- administrativa — e o saldo total da Lyvia, −3h50 (−230 minutos).
select c.nome,
       a.tipo, a.minutos, a.estado, a.aprovador_nome,
       (select sum(case when x.tipo = 'debito' then -x.minutos
                        when x.tipo = 'dia_incompleto' then 0
                        else x.minutos end)
          from public.ajustes_jornada x
         where x.colaborador_id = c.id and x.estado = 'aprovado') as saldo_total_em_minutos
  from public.colaboradores c
  join public.ajustes_jornada a
    on a.colaborador_id = c.id and a.data = date '2026-10-15'
 where c.nome ilike 'l_via%'
   and c.ativo;
