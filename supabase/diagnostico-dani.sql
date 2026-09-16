-- ============================================================
-- A FICHA DA DANI EXISTE NA CARGA DA PLANILHA?
--
-- A conta 'colab-fdc1d00c...' nasceu do gatilho antigo. A limpeza não a
-- fundiu porque não achou outra ficha com o login "Dani".
--
-- Duas possibilidades, e esta consulta separa as duas:
--   a) ela ESTÁ na planilha com outro login (ex.: "dani.souza") — aí há
--      duas fichas da mesma pessoa e é preciso fundir pelo nome;
--   b) ela NÃO está na planilha — a conta dela é a única que existe, e
--      basta completar o cadastro (matrícula, CNPJ, setor, admissão).
-- ============================================================

-- 1) Toda ficha cujo nome ou login lembre "Dani"
select
  id,
  nome,
  login,
  cargo,
  setor,
  loja,
  nivel,
  matricula,
  cnpj,
  case when auth_user_id is null then 'sem acesso ativado' else 'ACESSO ATIVADO' end as acesso,
  criado_em
from public.colaboradores
where nome  ilike '%dani%'
   or login ilike '%dani%'
order by criado_em;

-- 2) A ficha veio da planilha ou do gatilho? Quem veio da carga tem
--    matrícula ou CNPJ preenchido; quem nasceu do gatilho vem em branco.
select
  count(*) filter (where matricula is not null and matricula <> '') as com_matricula,
  count(*) filter (where cnpj is not null and cnpj <> '')           as com_cnpj,
  count(*)                                                          as total_de_fichas
from public.colaboradores;
