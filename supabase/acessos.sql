-- ============================================================
-- CONECTA — Malachias Autopeças
-- Regras de criação de acesso
--
-- Rode este arquivo no SQL Editor DEPOIS do esquema.sql.
-- Pode ser executado mais de uma vez sem quebrar nada.
--
-- O que ele define:
--   1. Ninguém cria conta pela tela de login. Todo colaborador é cadastrado
--      dentro do sistema (pelo RH ou pela planilha) e só então consegue
--      ativar o acesso com a senha padrão.
--   2. A conta do Administrador já fica pronta.
--   3. Na primeira entrada, trocar a senha é obrigatório.
-- ============================================================

-- Marca quem ainda está com a senha padrão e precisa definir a própria
alter table public.colaboradores
  add column if not exists precisa_trocar_senha boolean not null default true;

-- ------------------------------------------------------------
-- ATIVAÇÃO DE ACESSO
--
-- O gatilho deixa de CRIAR colaborador e passa a LIGAR a conta de acesso a
-- uma ficha que já existe. Se o login não estiver cadastrado, o cadastro é
-- recusado — é isso que impede alguém de criar uma conta por fora.
-- ------------------------------------------------------------

create or replace function public.criar_colaborador_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  login_informado text;
  ficha_id        text;
begin
  login_informado := lower(trim(coalesce(
    new.raw_user_meta_data ->> 'login',
    split_part(new.email, '@', 1)
  )));

  -- Procura uma ficha cadastrada e ainda sem acesso ativado
  select id into ficha_id
  from public.colaboradores
  where lower(login) = login_informado
    and auth_user_id is null
  limit 1;

  if ficha_id is null then
    -- Ou o login não existe, ou o acesso já foi ativado antes
    raise exception 'Login não cadastrado na rede. Procure o RH.'
      using errcode = 'P0001';
  end if;

  update public.colaboradores
     set auth_user_id = new.id
   where id = ficha_id;

  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_colaborador_do_usuario();

-- ------------------------------------------------------------
-- CONTA DO ADMINISTRADOR
--
-- A ficha nasce pronta e sem acesso ativado. O Elias entra com a senha padrão
-- e o sistema obriga a definir a dele na sequência.
-- ------------------------------------------------------------

insert into public.colaboradores (
  id, nome, login, cargo, setor, loja, nivel, foto, presenca,
  ramal, email, ativo, precisa_trocar_senha
)
values (
  'colab-admin-elias',
  'Elias Malachias',
  'Elias',
  'Administrador Geral',
  'TI',
  'Pirassununga',
  4,
  '/logo-malachias.svg',
  'disponivel',
  '100',
  'elias@malachiasautopecas.com.br',
  true,
  true
)
on conflict (id) do update
  set nivel = 4,
      ativo = true;

-- ------------------------------------------------------------
-- QUEM AINDA NÃO TROCOU A SENHA
--
-- Só a própria pessoa muda o próprio indicador, e só para desligá-lo: assim
-- ninguém consegue reativar a obrigação na conta de outro.
-- ------------------------------------------------------------

create or replace function public.concluir_troca_de_senha()
returns void
language sql
security definer
set search_path = public
as $$
  update public.colaboradores
     set precisa_trocar_senha = false
   where auth_user_id = auth.uid();
$$;

grant execute on function public.concluir_troca_de_senha() to authenticated;
