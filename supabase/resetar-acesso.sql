-- ============================================================
-- CONECTA — RESETAR O ACESSO DE UMA PESSOA
--
-- Use quando alguém não consegue entrar e não lembra a senha.
--
-- COMO USAR: troque o login na linha marcada abaixo e rode o arquivo.
-- Pode rodar quantas vezes precisar.
--
-- O QUE ACONTECE
--
-- A conta de autenticação é apagada e a FICHA CONTINUA INTACTA — nível,
-- loja, setor, cargo, CNPJ, organograma, banco de horas, tudo. A pessoa
-- volta para o estado de "primeiro acesso" e entra com a senha padrão
-- (123456), sendo obrigada a definir a dela em seguida.
--
-- Por que apagar em vez de trocar a senha: a senha vive na autenticação do
-- Supabase, cifrada, e não há como reescrevê-la por SQL comum. Apagar a
-- conta é o caminho que o próprio sistema já sabe refazer — o gatilho de
-- primeiro acesso readota a ficha pelo login.
--
-- NÃO APAGA A PESSOA. Não apaga mensagem, ponto nem histórico: a ficha, que
-- é dona de tudo isso, não é tocada.
-- ============================================================

do $$
declare
  -- >>> TROQUE AQUI O LOGIN DE QUEM PRECISA ENTRAR <<<
  login_alvo  text := 'Dani';

  ficha       public.colaboradores%rowtype;
  conta       record;
  quantas     integer := 0;
begin
  select * into ficha
    from public.colaboradores
   where lower(trim(login)) = lower(trim(login_alvo))
   limit 1;

  if ficha.id is null then
    raise exception 'Nao existe ficha com o login "%". Confira a grafia no Quadro de Equipe.', login_alvo;
  end if;

  -- Apaga toda conta de autenticação ligada a esta ficha, e também a que
  -- tenha o e-mail derivado do login mas esteja solta (tentativa antiga)
  for conta in
    select u.id, u.email
      from auth.users u
     where u.id = ficha.auth_user_id
        or (
          u.email = lower(regexp_replace(trim(ficha.login), '[^a-zA-Z0-9._-]', '', 'g'))
                    || '@conecta.malachias.local'
          and not exists (
            select 1 from public.colaboradores c
             where c.auth_user_id = u.id and c.id <> ficha.id
          )
        )
  loop
    delete from auth.identities where user_id = conta.id;
    delete from auth.users      where id      = conta.id;
    quantas := quantas + 1;
    raise notice 'Conta de acesso removida: %', conta.email;
  end loop;

  -- A ficha volta a poder ser adotada, com a senha padrão da rede
  update public.colaboradores
     set auth_user_id         = null,
         senha_ativacao       = null,
         precisa_trocar_senha = true
   where id = ficha.id;

  raise notice '% (%): % conta(s) removida(s). Pode entrar com a senha padrao.',
    ficha.nome, ficha.login, quantas;
end $$;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- pronto_para_entrar ..... tem que ser true
-- senha .................. a que a pessoa deve digitar agora
-- nivel / loja / cargo ... conferem que a ficha NÃO foi mexida
-- ============================================================
select
  nome,
  login,
  nivel,
  cargo,
  loja,
  (auth_user_id is null)                          as pronto_para_entrar,
  coalesce(nullif(senha_ativacao, ''), '123456')  as senha
from public.colaboradores
where lower(trim(login)) = lower(trim('Dani'));
