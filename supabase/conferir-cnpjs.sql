-- ============================================================
-- CONFERIR OS CNPJs DAS FICHAS (só leitura, 07/10/2026)
--
-- Quais CNPJs existem nas fichas, em quantas pessoas e em quais lojas —
-- sem nome nem dado pessoal. É daqui que saem os estabelecimentos do
-- registrador (registrador-por-estabelecimento.sql).
-- ============================================================
select
  coalesce(nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), ''), '(sem CNPJ)') as cnpj,
  count(*) filter (where ativo) as ativos,
  count(*) filter (where not ativo) as inativos,
  string_agg(distinct loja, ', ' order by loja) as lojas
from public.colaboradores
group by 1
order by ativos desc;
