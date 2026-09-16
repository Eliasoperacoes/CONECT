-- ============================================================
-- CONECTA — LIBERAR ACESSO TRAVADO
--
-- Rode este arquivo inteiro. Ele mostra o que vai fazer, faz, e mostra
-- como ficou. Pode rodar mais de uma vez.
--
-- O PROBLEMA
--
-- Quando alguém tentou entrar enquanto o gatilho antigo estava valendo, a
-- conta de AUTENTICAÇÃO foi criada com a senha que a pessoa digitou naquele
-- dia. A ficha que nasceu junto já foi removida pela limpeza — mas a conta
-- de autenticação ficou lá, órfã.
--
-- A partir daí o login trava de vez:
--   1. o sistema tenta entrar  -> a senha de hoje não é a daquele dia
--   2. o sistema tenta ativar  -> "usuário já existe"
--   3. a tela diz "Login ou senha incorretos", que é verdade e não ajuda
--
-- A conta órfã não serve para nada: não tem ficha do outro lado, então
-- nem se a pessoa lembrasse a senha ela entraria. Apagá-la devolve o
-- primeiro acesso, com a senha padrão.
--
-- NÃO MEXE em quem tem ficha ligada. Elias e qualquer acesso já ativado
-- ficam exatamente como estão.
-- ============================================================

-- ------------------------------------------------------------
-- ANTES: o que está órfão
-- ------------------------------------------------------------
select
  'ANTES' as momento,
  u.email,
  u.created_at,
  u.raw_user_meta_data ->> 'login' as login_enviado,
  case
    when exists (
      select 1 from public.colaboradores c
       where lower(trim(c.login)) = lower(trim(coalesce(
               u.raw_user_meta_data ->> 'login',
               split_part(u.email, '@', 1))))
    ) then 'tem ficha na rede -> vai poder ativar de novo'
    else 'SEM ficha na rede -> precisa ser cadastrado pelo RH antes'
  end as diagnostico
from auth.users u
where not exists (
  select 1 from public.colaboradores c where c.auth_user_id = u.id
)
order by u.created_at;

-- ------------------------------------------------------------
-- O CONSERTO
-- ------------------------------------------------------------
do $$
declare
  orfa record;
  quantas integer := 0;
begin
  for orfa in
    select u.id, u.email
      from auth.users u
     where not exists (
       select 1 from public.colaboradores c where c.auth_user_id = u.id
     )
  loop
    delete from auth.identities where user_id = orfa.id;
    delete from auth.users      where id      = orfa.id;
    quantas := quantas + 1;
    raise notice 'Acesso liberado: % pode entrar de novo com a senha padrao', orfa.email;
  end loop;

  raise notice 'Contas orfas removidas: %', quantas;
end $$;

-- ------------------------------------------------------------
-- DEPOIS: tem que vir vazio
-- ------------------------------------------------------------
select
  'DEPOIS' as momento,
  count(*) as contas_orfas_restantes
from auth.users u
where not exists (
  select 1 from public.colaboradores c where c.auth_user_id = u.id
);

-- Quem está pronto para o primeiro acesso, e com qual senha
select
  nome,
  login,
  nivel,
  loja,
  coalesce(nullif(senha_ativacao, ''), '123456') as senha_de_primeiro_acesso
from public.colaboradores
where auth_user_id is null
  and ativo
  and (nome ilike '%fabio%' or nivel >= 2)
order by nivel desc, nome;
