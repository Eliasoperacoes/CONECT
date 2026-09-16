-- ============================================================
-- A CONTA DE ACESSO DA DANI EXISTE OU NÃO?
--
-- O aplicativo respondeu "already registered", que significa uma coisa só:
-- a conta de autenticação existe. Esta consulta confirma — ou derruba — isso
-- sem alterar nada.
-- ============================================================
select
  c.nome,
  c.login,
  c.nivel,
  c.auth_user_id,
  (c.auth_user_id is null) as ficha_pronta_para_primeiro_acesso,
  lower(regexp_replace(trim(c.login), '[^a-zA-Z0-9._-]', '', 'g'))
    || '@conecta.malachias.local' as email_do_app,
  (select count(*) from auth.users u
    where u.email = lower(regexp_replace(trim(c.login), '[^a-zA-Z0-9._-]', '', 'g'))
                    || '@conecta.malachias.local') as contas_de_acesso_com_esse_email
from public.colaboradores c
where lower(trim(c.login)) = 'dani';
