-- ============================================================
-- OS ESTABELECIMENTOS DA MALACHIAS (07/10/2026)
--
-- Os 2 CNPJs que registram funcionários (Elias). Razão social e endereço
-- como estão na Receita Federal (consulta pública, 07/10/2026): ambos
-- ativos, ambos matriz. Depende de registrador-por-estabelecimento.sql.
--
-- Cada inclusão vira evento tipo "2" do registrador (dados do
-- empregador). Rodar de novo NÃO altera nada (não duplica o evento):
-- mudar um dado depois é pela tela, com o nome de quem mudou.
-- ============================================================

insert into public.estabelecimentos (cnpj, razao_social, local) values
  ('05041606000199', 'MALACHIAS AUTO PECAS LTDA',
   'Av. Engenheiro Nicolau de Vergueiro Forjaz, 135 - Centro - Porto Ferreira/SP - CEP 13660-005'),
  ('28251342000101', 'R T MALACHIAS AUTO PECAS LTDA',
   'Rua Francisco Esperança, 752 - Vila Guimarães - Pirassununga/SP - CEP 13630-160')
on conflict (cnpj) do nothing;

-- Conferência: os dois estabelecimentos, o evento de cada um, e quantas
-- fichas ativas já estão em cada CNPJ (e quantas em nenhum dos dois)
select
  e.cnpj,
  e.razao_social,
  (select count(*) from public.eventos_rep v where v.cnpj = e.cnpj and v.tipo = 2) as eventos_tipo_2,
  (select count(*) from public.colaboradores c
    where c.ativo and regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = e.cnpj) as fichas_ativas
from public.estabelecimentos e
union all
select '(nenhum dos dois)', null, null,
  (select count(*) from public.colaboradores c
    where c.ativo and regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') not in (select cnpj from public.estabelecimentos))
order by 1;
