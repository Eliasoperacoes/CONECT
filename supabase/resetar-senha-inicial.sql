-- ============================================================
-- CONECTA — RESETAR A SENHA INICIAL PELO SISTEMA
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Cria a função que o botão "Resetar para a senha padrão", na ficha do
-- colaborador, chama. Ela faz o mesmo que o arquivo `resetar-acesso.sql`
-- já fazia — devolver a pessoa ao primeiro acesso — mas sem o TI precisar
-- abrir o Supabase e trocar um login no meio do script.
--
-- POR QUE PRECISA SER UMA FUNÇÃO NO BANCO
--
-- A senha não mora na ficha: mora na autenticação do Supabase, cifrada, e
-- não há como reescrevê-la por SQL comum. O caminho é apagar a conta de
-- acesso e deixar a ficha ser readotada pelo gatilho de primeiro acesso —
-- e apagar conta de acesso é coisa que o navegador não pode fazer. Daí
-- `security definer`: a função roda com o privilégio de quem a criou, não
-- com o de quem a chamou.
--
-- E É JUSTAMENTE POR ISSO QUE ELA TEM TRÊS TRAVAS:
--
--   1. Só quem já cuida de ficha (`cuido_de_pessoas`) pode chamar — a
--      MESMA regra que governa cadastrar e editar colaborador. Não é um
--      poder novo: quem cria o acesso já podia dar acesso.
--   2. Ninguém reseta alguém de nível acima do seu. Sem isso, o RH
--      resetaria a conta do Administrador, entraria com 123456 e viraria
--      Administrador — que é escalonamento de privilégio, não suporte.
--   3. Ninguém reseta a si mesmo. Quem faz isso se desloga na hora e
--      volta para o primeiro acesso; num TI que é o único nível 5, seria
--      se trancar do lado de fora.
--
-- NÃO APAGA A PESSOA. A ficha não é tocada: nível, loja, setor, cargo,
-- CNPJ, organograma, ponto, banco de horas e mensagens continuam onde
-- estão. O que some é só a conta de acesso, que se refaz na entrada.
-- ============================================================

create or replace function public.resetar_senha_inicial(colaborador_alvo text)
returns table (nome text, login text, senha text)
language plpgsql
security definer
set search_path = public
as $$
declare
  ficha    public.colaboradores%rowtype;
  conta    record;
  quantas  integer := 0;
begin
  -- TRAVA 1: a mesma permissão de cadastrar e editar ficha
  if not public.cuido_de_pessoas() then
    raise exception 'Apenas quem cuida de pessoas pode resetar a senha inicial';
  end if;

  select * into ficha
    from public.colaboradores
   where id = colaborador_alvo
   limit 1;

  if ficha.id is null then
    raise exception 'Nao existe ficha com este identificador';
  end if;

  -- TRAVA 2: não se reseta quem está acima
  if ficha.nivel > public.meu_nivel() then
    raise exception 'Nao e possivel resetar o acesso de alguem de nivel acima do seu';
  end if;

  -- TRAVA 3: nem a si mesmo
  if ficha.id = public.meu_colaborador_id() then
    raise exception 'Para trocar a sua propria senha, use o botao de trocar senha';
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
  end loop;

  -- A ficha volta a poder ser adotada, com a senha padrão da rede
  update public.colaboradores
     set auth_user_id         = null,
         senha_ativacao       = null,
         precisa_trocar_senha = true
   where id = ficha.id;

  -- Fica registrado QUEM resetou o acesso de QUEM: é mexer no acesso de
  -- outra pessoa, e sem registro não há como apurar depois
  insert into public.auditoria (id, usuario_nome, acao, categoria, detalhes)
  select
    gen_random_uuid()::text,
    eu.nome,
    'Senha inicial resetada',
    'seguranca',
    eu.nome || ' devolveu o acesso de ' || ficha.nome ||
      ' para a senha padrao (' || quantas || ' conta(s) removida(s)).'
  from public.colaboradores eu
  where eu.id = public.meu_colaborador_id();

  return query
    select ficha.nome,
           ficha.login,
           coalesce(nullif(ficha.senha_ativacao, ''), '123456')::text;
end;
$$;

-- Quem não entrou não chama: a função apaga conta de acesso
revoke execute on function public.resetar_senha_inicial(text) from public, anon;
grant  execute on function public.resetar_senha_inicial(text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- As três linhas têm que sair assim:
--
--   funcao_existe ......... true
--   roda_como_dono ........ true    (sem isso não alcança auth.users)
--   anon_nao_alcanca ...... true    (quem não entrou não pode chamar)
-- ============================================================
select
  exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'resetar_senha_inicial'
  ) as funcao_existe,

  coalesce((
    select p.prosecdef from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'resetar_senha_inicial'
  ), false) as roda_como_dono,

  not has_function_privilege(
    'anon', 'public.resetar_senha_inicial(text)', 'execute'
  ) as anon_nao_alcanca;
