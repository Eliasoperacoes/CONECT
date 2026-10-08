-- ============================================================
-- DIAGNÓSTICO 2: DE ONDE VEIO A BATIDA EM DOBRO (Yan, 08/10/2026)
--
-- Só leitura. Uma consulta só, para o editor mostrar tudo de uma vez.
--   coletor "01" = aplicativo instalado; "02" = navegador.
--   As linhas de "auditoria" são as que o APARELHO grava depois de cada
--   batida: duas linhas no mesmo segundo = dois fluxos no aparelho.
-- ============================================================
select 'original' as fonte,
       to_char(o.registrado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       o.nsr::text as nsr,
       o.coletor,
       coalesce(o.fora_da_jornada, 'entrou') as detalhe
  from public.marcacoes_originais o
  join public.colaboradores c on c.id = o.colaborador_id
 where c.nome ilike '%yan%'
   and o.data >= date '2026-10-07'
union all
select 'auditoria',
       to_char(a.data_hora at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS'),
       null,
       null,
       left(a.detalhes, 120)
  from public.auditoria a
 where a.detalhes ilike '%yan%'
   and a.detalhes ilike '%registrou%'
   and a.data_hora >= timestamptz '2026-10-07 00:00-03'
 order by quando;
