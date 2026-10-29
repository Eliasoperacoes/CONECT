-- ============================================================
-- O ATESTADO QUE FICOU PRESO AO DIA DE PONTO (29/10/2026)
--
-- Até esta versão, o atestado anexado no motivo da batida ia junto com o
-- dia de ponto para a fila da líder e nunca chegava ao RH nem ao painel de
-- Atestados (Beatriz, 28/10). Agora a pessoa marca "É atestado ou
-- declaração médica" e ele vira a solicitação do RH.
--
-- Este script leva ao RH os que já ficaram presos: cada apuração com anexo
-- e motivo de saúde vira um atestado PENDENTE, com o mesmo documento. Nada
-- é aprovado aqui. O RH decide no painel de Atestados e, aprovado, o dia é
-- abonado: o débito cai, mesmo que a líder já o tenha aprovado.
--
-- Pode rodar de novo: pula o dia que já tem atestado ou declaração.
-- ============================================================

insert into public.justificativas_ausencia
  (id, colaborador_id, data_inicio, data_fim, tipo, observacao,
   anexo_caminho, anexo_nome, estado, criado_em)
select 'just-batida-' || a.id,
       a.colaborador_id,
       a.data,
       a.data,
       'atestado',
       a.motivo_colaborador,
       a.anexo_caminho,
       'atestado' || coalesce(substring(a.anexo_caminho from '\.[A-Za-z0-9]+$'), ''),
       'pendente',
       a.criado_em
  from public.ajustes_jornada a
 where a.anexo_caminho is not null
   and a.motivo_colaborador ~* '(atestad|m[eé]dic|consulta|declara|exame|hospital|cl[ií]nica|dentist|odonto|\mupa\M|posto de sa[uú]de|pronto.socorro)'
   and not exists (
     select 1 from public.justificativas_ausencia j
      where j.colaborador_id = a.colaborador_id
        and j.tipo in ('atestado', 'comparecimento')
        and a.data between j.data_inicio and j.data_fim
   )
on conflict (id) do nothing;

-- CONFERÊNCIA: todo dia de ponto com anexo, e se ele já está com o RH.
-- "não" com motivo de saúde é o que o filtro acima não reconheceu: a
-- pessoa reenvia em Ponto › Justificar ausência.
select c.nome,
       c.loja,
       to_char(a.data, 'DD/MM/YYYY') as dia,
       case a.tipo when 'debito' then '−' when 'hora_extra' then '+' else '' end
         || (a.minutos / 60) || 'h' || lpad((a.minutos % 60)::text, 2, '0') as horas,
       a.estado as decisao_da_lider,
       a.motivo_colaborador as motivo,
       coalesce(
         (select j.estado
            from public.justificativas_ausencia j
           where j.colaborador_id = a.colaborador_id
             and j.tipo in ('atestado', 'comparecimento')
             and a.data between j.data_inicio and j.data_fim
           order by j.criado_em desc
           limit 1),
         'não'
       ) as atestado_no_rh
  from public.ajustes_jornada a
  join public.colaboradores c on c.id = a.colaborador_id
 where a.anexo_caminho is not null
 order by a.data desc, c.nome;
