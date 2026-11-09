-- ============================================================
-- A FALTA DA LEIGISLAINE EM 07/11/2026 VIRA DÉBITO (09/11/2026)
--
-- O sábado foi abonado na fila e ficou com 0 minutos. O Elias decidiu que
-- a falta desconta do banco de horas: passa a débito das 4h00 previstas.
-- Só altera a linha que ainda está aprovada com 0 minutos; rodar de novo
-- não muda nada.
-- ============================================================
update public.ajustes_jornada a
   set tipo           = 'debito',
       minutos        = a.minutos_previstos,
       aprovador_id   = null,
       aprovador_nome = 'Correção administrativa',
       decidido_em    = now(),
       observacao     = 'Falta de 07/11 contada como débito por decisão do administrador; o dia havia sido abonado na fila.'
  from public.colaboradores c
 where c.id = a.colaborador_id
   and c.nome ilike 'leigislaine%'
   and a.data = date '2026-11-07'
   and a.estado = 'aprovado'
   and a.minutos = 0
   and a.minutos_previstos = 240;

-- CONFERÊNCIA: uma linha, tipo debito, 240 minutos, Correção administrativa
select c.nome, a.data, a.tipo, a.minutos, a.estado, a.aprovador_nome, a.observacao
  from public.ajustes_jornada a
  join public.colaboradores c on c.id = a.colaborador_id
 where c.nome ilike 'leigislaine%'
   and a.data = date '2026-11-07';
