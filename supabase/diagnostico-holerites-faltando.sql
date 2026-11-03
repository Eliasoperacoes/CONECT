-- ============================================================
-- QUEM FICOU SEM A FOLHA DO MÊS — só leitura (troque o mês em `mes`)
--
-- Os ativos sem a folha da competência, e se receberam o adiantamento dela.
-- Quem teve adiantamento e não teve folha é o primeiro a conferir: costuma
-- ser página deixada em "Não publicar" na carga, ou nome diferente do
-- cadastro. Só nomes e loja; nenhum valor.
-- ============================================================
with mes as (select '2026-10'::text as competencia)
select
  c.nome,
  c.loja,
  case when exists (
    select 1 from public.holerites a, mes
     where a.colaborador_id = c.id and a.competencia = mes.competencia and a.tipo = 'adiantamento'
  ) then 'sim' else 'não' end as teve_adiantamento
from public.colaboradores c
where c.ativo is not false
  and not exists (
    select 1 from public.holerites f, mes
     where f.colaborador_id = c.id and f.competencia = mes.competencia and f.tipo = 'folha'
  )
order by teve_adiantamento desc, c.loja, c.nome;
