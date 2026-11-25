-- ============================================================
-- A FALTA DO MIKAEL NO SÁBADO 21/11/2026 VIRA DÉBITO (25/11/2026)
--
-- Combinado com ele: a falta desconta do banco de horas. O espelho mostra
-- FALTA com 0h00 — o dia foi abonado na fila. Passa a débito das 4h00
-- previstas do sábado.
--
-- Só altera se houver UM Mikael ativo (sem o sobrenome, dois seriam
-- dúvida) e se o dia ainda estiver aprovado com 0 minutos. Se o dia estiver
-- PENDENTE, não altera nada: é só o líder ou o RH confirmar a falta na
-- fila, que ela já grava o débito. Rodar de novo não muda nada.
-- ============================================================
update public.ajustes_jornada a
   set tipo           = 'debito',
       minutos        = a.minutos_previstos,
       aprovador_id   = null,
       aprovador_nome = 'Correção administrativa',
       decidido_em    = now(),
       observacao     = 'Falta de 21/11 contada como débito, como combinado com o colaborador; o dia havia sido abonado na fila.'
  from public.colaboradores c
 where c.id = a.colaborador_id
   and c.nome ilike 'mikael%'
   and c.ativo
   and (select count(*) from public.colaboradores x where x.nome ilike 'mikael%' and x.ativo) = 1
   and a.data = date '2026-11-21'
   and a.estado = 'aprovado'
   and a.minutos = 0
   and a.minutos_previstos = 240;

-- CONFERÊNCIA: o esperado é uma linha, debito, 240, aprovado, Correção
-- administrativa. Se vier "pendente", confirmar a falta na fila. Se vier
-- mais de um Mikael ou nenhuma linha, mandar o print.
select c.nome, a.data, a.tipo, a.minutos, a.minutos_previstos, a.estado, a.aprovador_nome
  from public.colaboradores c
  left join public.ajustes_jornada a
    on a.colaborador_id = c.id and a.data = date '2026-11-21'
 where c.nome ilike 'mikael%'
   and c.ativo;
