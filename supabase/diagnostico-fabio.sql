-- ============================================================
-- POR QUE O FABIO NÃO ENTRA
--
-- Isto lê o banco e a autenticação lado a lado. Sem adivinhar.
--
-- O aplicativo transforma o login em e-mail assim:
--   minúsculas, sem espaço nas pontas, e tudo que não for
--   letra/número/ponto/traço/sublinhado é REMOVIDO
--   -> "Fabio Engle" vira "fabioengle@conecta.malachias.local"
--
-- Se o e-mail calculado a partir da ficha não for igual ao e-mail que já
-- existe na autenticação, são duas contas diferentes — e é por isso que a
-- senha "não confere".
-- ============================================================

-- 1) A(s) ficha(s) do Fabio, e o e-mail que o aplicativo vai montar
select
  c.id,
  c.nome,
  c.login,
  c.nivel,
  c.cargo,
  c.loja,
  lower(regexp_replace(trim(c.login), '[^a-zA-Z0-9._-]', '', 'g'))
    || '@conecta.malachias.local'                      as email_que_o_app_monta,
  c.auth_user_id,
  case when c.auth_user_id is null
       then 'SEM ACESSO ATIVADO (vai ativar no primeiro login)'
       else 'acesso ja ativado' end                     as situacao,
  coalesce(nullif(c.senha_ativacao, ''), '123456')      as senha_de_primeiro_acesso
from public.colaboradores c
where c.nome ilike '%fabio%' or c.login ilike '%fabio%'
order by c.criado_em;

-- 2) O que existe na AUTENTICAÇÃO com esse e-mail
select
  u.id,
  u.email,
  u.created_at,
  u.raw_user_meta_data ->> 'login'        as login_que_foi_enviado,
  (u.raw_user_meta_data ? 'ativacao')     as ainda_guarda_senha_em_texto,
  (select count(*) from public.colaboradores c where c.auth_user_id = u.id) as fichas_ligadas
from auth.users u
where u.email ilike '%fabio%'
order by u.created_at;

-- 3) Toda conta de autenticação SEM ficha ligada. É o caso que trava o
--    login: a pessoa já tem usuário, então o sistema não tenta ativar de
--    novo, mas não há ficha nenhuma do outro lado.
select
  u.id,
  u.email,
  u.created_at,
  u.raw_user_meta_data ->> 'login' as login_enviado
from auth.users u
where not exists (
  select 1 from public.colaboradores c where c.auth_user_id = u.id
)
order by u.created_at;
