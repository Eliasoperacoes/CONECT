-- ============================================================
-- HOLERITE POR TIPO — folha e adiantamento no mesmo mês (03/11/2026)
--
-- A rede recebe dois documentos por mês. A regra de um holerite por pessoa
-- e mês recusava o segundo para quem assinou o primeiro e, para quem não
-- assinou, sobrescrevia o arquivo. A regra passa a ser um documento por
-- pessoa, mês e TIPO: reenviar substitui só o do mesmo tipo.
--
-- O que já existe: tudo é folha, menos o adiantamento de outubro/2026,
-- publicado em 20/10. Pelo SQL Editor o gatilho de holerite assinado deixa
-- marcar o tipo; arquivo, id e assinatura não mudam.
--
-- Rode ANTES de subir o sistema novo. Pode rodar mais de uma vez.
-- ============================================================
alter table public.holerites
  add column if not exists tipo text not null default 'folha'
  check (tipo in ('folha', 'adiantamento'));

update public.holerites
   set tipo = 'adiantamento'
 where competencia = '2026-10'
   and criado_em < timestamptz '2026-11-03 00:00:00-03';

alter table public.holerites
  drop constraint if exists holerites_colaborador_id_competencia_key;

alter table public.holerites
  drop constraint if exists holerites_por_pessoa_mes_e_tipo;

alter table public.holerites
  add constraint holerites_por_pessoa_mes_e_tipo unique (colaborador_id, competencia, tipo);

notify pgrst, 'reload schema';

-- CONFERÊNCIA: a nova regra (1), a antiga (0), e os documentos de cada tipo
-- por dia de publicação. O que saiu em 03/11 ou depois tem de estar como folha.
select
  h.competencia,
  h.tipo,
  to_char(h.criado_em at time zone 'America/Sao_Paulo', 'DD/MM') as publicado_no_dia,
  count(*) as documentos,
  count(r.holerite_id) as assinados,
  (select count(*) from pg_constraint where conname = 'holerites_por_pessoa_mes_e_tipo') as regra_nova_1,
  (select count(*) from pg_constraint where conname = 'holerites_colaborador_id_competencia_key') as regra_antiga_0
from public.holerites h
left join public.recebimentos_holerite r on r.holerite_id = h.id
group by 1, 2, 3
order by 1 desc, 2, 3;
