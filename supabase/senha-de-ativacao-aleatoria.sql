-- ============================================================
-- SENHA DE PRIMEIRO ACESSO ALEATÓRIA, POR PESSOA (13/10/2026)
--
-- O DEFEITO (laudo de 13/10/2026, item 1):
--
--   · Sem senha individual na ficha, a ativação aceitava "123456". Quem
--     soubesse o login de alguém que ainda não tinha entrado ativava a
--     conta dele — e batia ponto e conversava em nome dele.
--   · A senha individual, quando o RH definia, ficava em
--     `colaboradores.senha_ativacao` — tabela que todo logado lê inteira.
--
-- O QUE MUDA (decisão do Elias):
--
--   1. A senha sai da ficha e vai para `senhas_de_ativacao`, que só quem
--      cuida de pessoas lê. A coluna antiga fica, sempre vazia: o app que
--      ainda a envia é desviado pelo gatilho, e nada quebra.
--   2. Toda ficha AINDA NÃO ATIVADA recebe uma senha aleatória de 8
--      caracteres, sem os que se confundem no papel (0/o, 1/l/i). Quem já
--      ativou NÃO é tocado: a senha dele mora na autenticação, e continua.
--   3. A ativação só aceita a senha da ficha. "123456" deixa de existir.
--   4. Ficha nova nasce com senha aleatória; o reset pelo RH/ADM gera
--      outra, também aleatória, e a devolve para entregar.
--   5. `senhas_para_entregar()`: login e senha de quem ainda não ativou,
--      para imprimir os cupons.
--
-- Rodar uma vez. Pode rodar de novo: nada é sorteado duas vezes para quem
-- já tem senha guardada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ONDE A SENHA MORA
-- ------------------------------------------------------------
create table if not exists public.senhas_de_ativacao (
  colaborador_id  text primary key references public.colaboradores(id) on delete cascade,
  senha           text not null check (length(senha) >= 6),
  gerada_em       timestamptz not null default now()
);

alter table public.senhas_de_ativacao enable row level security;

-- Só quem cuida de pessoas lê (para entregar). Ninguém grava direto: só
-- as funções abaixo, que rodam como dono.
drop policy if exists senhas_de_ativacao_leitura on public.senhas_de_ativacao;
create policy senhas_de_ativacao_leitura on public.senhas_de_ativacao
  for select to authenticated using (public.cuido_de_pessoas());

-- ------------------------------------------------------------
-- 2. O SORTEIO
--
-- 8 caracteres de um alfabeto de 31 (sem 0, o, 1, l, i): ~8,5 × 10^11
-- combinações. Minúsculas porque é o que o teclado do celular digita sem
-- trocar de modo. A aleatoriedade vem de gen_random_uuid(), que usa o
-- gerador forte do Postgres.
-- ------------------------------------------------------------
create or replace function public.senha_aleatoria()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  resultado text := '';
begin
  for i in 1..8 loop
    resultado := resultado || substr(
      alfabeto,
      (get_byte(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 0) % 31) + 1,
      1
    );
  end loop;
  return resultado;
end;
$$;

revoke all on function public.senha_aleatoria() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. A FICHA NUNCA GUARDA A SENHA
--
-- Ficha nova sem senha: sorteia. Ficha que chega com senha (a planilha do
-- RH pode trazer uma individual): guarda na tabela própria. "123456" é o
-- antigo padrão que o app ainda manda — vale como "sem senha". Em todos os
-- casos a coluna da ficha volta a ficar vazia.
-- ------------------------------------------------------------
create or replace function public.guardar_senha_de_ativacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  informada text := trim(coalesce(new.senha_ativacao, ''));
begin
  if new.auth_user_id is null then
    if informada <> '' and informada <> '123456' and length(informada) >= 6 then
      insert into public.senhas_de_ativacao (colaborador_id, senha)
        values (new.id, informada)
        on conflict (colaborador_id) do update set senha = excluded.senha, gerada_em = now();
    elsif not exists (select 1 from public.senhas_de_ativacao s where s.colaborador_id = new.id) then
      insert into public.senhas_de_ativacao (colaborador_id, senha)
        values (new.id, public.senha_aleatoria());
    end if;
  end if;

  if new.senha_ativacao is not null then
    update public.colaboradores set senha_ativacao = null where id = new.id;
  end if;
  return null;
end;
$$;

-- Ficha nova: sempre. Ficha que já existe: só quando chega uma senha.
drop trigger if exists colaboradores_guardar_senha_de_ativacao on public.colaboradores;
drop trigger if exists colaboradores_senha_de_ativacao_nova on public.colaboradores;
create trigger colaboradores_senha_de_ativacao_nova
  after insert on public.colaboradores
  for each row
  execute function public.guardar_senha_de_ativacao();

drop trigger if exists colaboradores_senha_de_ativacao_trocada on public.colaboradores;
create trigger colaboradores_senha_de_ativacao_trocada
  after update of senha_ativacao on public.colaboradores
  for each row
  when (new.senha_ativacao is not null)
  execute function public.guardar_senha_de_ativacao();

-- ------------------------------------------------------------
-- 4. A ATIVAÇÃO SÓ ACEITA A SENHA DA FICHA
-- ------------------------------------------------------------
create or replace function public.criar_colaborador_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  login_informado  text;
  senha_informada  text;
  senha_da_ficha   text;
  ficha            public.colaboradores%rowtype;
  rede_vazia       boolean;
begin
  login_informado := lower(trim(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'login'), ''),
    split_part(new.email, '@', 1)
  )));
  senha_informada := coalesce(new.raw_user_meta_data ->> 'ativacao', '');

  select not exists (select 1 from public.colaboradores) into rede_vazia;

  -- BANCO VAZIO: o primeiro a entrar vira o Administrador. Sem esta saída
  -- ninguém entraria nunca, porque cadastrar exige já ser RH ou TI.
  if rede_vazia then
    insert into public.colaboradores (
      id, auth_user_id, nome, login, cargo, setor, loja, nivel,
      foto, presenca, ativo, precisa_trocar_senha
    )
    values (
      'colab-' || replace(new.id::text, '-', ''),
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), login_informado),
      login_informado,
      'Administrador Geral', 'TI', 'Pirassununga', 5,
      '/logo-malachias.svg', 'disponivel', true, true
    );
    return new;
  end if;

  select * into ficha
    from public.colaboradores
   where lower(trim(login)) = login_informado
   limit 1;

  if ficha.id is null then
    raise exception 'Login nao cadastrado na rede. Procure o RH.'
      using errcode = 'P0001';
  end if;

  -- Ficha já ativada: a conta é de outra sessão de autenticação. Adotar de
  -- novo entregaria o cadastro de alguém a quem chegasse depois.
  if ficha.auth_user_id is not null then
    raise exception 'Este login ja tem acesso ativado. Use a senha dele ou procure o RH.'
      using errcode = 'P0001';
  end if;

  -- SÓ A SENHA DA FICHA (senha-de-ativacao-aleatoria.sql). Não existe mais
  -- senha padrão: sem senha guardada, ninguém ativa — o RH gera uma.
  select s.senha into senha_da_ficha
    from public.senhas_de_ativacao s
   where s.colaborador_id = ficha.id;

  if senha_da_ficha is null or senha_informada is distinct from senha_da_ficha then
    raise exception 'Senha de primeiro acesso incorreta. Procure o RH.'
      using errcode = 'P0001';
  end if;

  -- A ficha é ADOTADA: nivel, loja, setor, cargo, CNPJ e organograma que
  -- vieram da planilha continuam exatamente como estão
  update public.colaboradores
     set auth_user_id        = new.id,
         senha_ativacao      = null,
         precisa_trocar_senha = true
   where id = ficha.id;

  -- Usada, a senha de primeiro acesso deixa de existir
  delete from public.senhas_de_ativacao where colaborador_id = ficha.id;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. O RESET PELO RH/ADM GERA UMA SENHA NOVA, ALEATÓRIA
--
-- As três travas continuam: só quem cuida de pessoas; ninguém reseta
-- alguém de nível acima; ninguém reseta a si mesmo.
-- ------------------------------------------------------------
create or replace function public.resetar_senha_inicial(colaborador_alvo text)
returns table (nome text, login text, senha text)
language plpgsql
security definer
set search_path = public
as $$
declare
  ficha     public.colaboradores%rowtype;
  conta     record;
  quantas   integer := 0;
  sorteada  text := public.senha_aleatoria();
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

  -- A ficha volta a poder ser adotada, com uma senha nova sorteada
  update public.colaboradores
     set auth_user_id         = null,
         senha_ativacao       = null,
         precisa_trocar_senha = true
   where id = ficha.id;

  insert into public.senhas_de_ativacao (colaborador_id, senha)
    values (ficha.id, sorteada)
    on conflict (colaborador_id) do update set senha = excluded.senha, gerada_em = now();

  -- Fica registrado QUEM resetou o acesso de QUEM — sem a senha
  insert into public.auditoria (id, usuario_nome, acao, categoria, detalhes)
  select
    gen_random_uuid()::text,
    eu.nome,
    'Senha inicial resetada',
    'seguranca',
    eu.nome || ' devolveu o acesso de ' || ficha.nome ||
      ' ao primeiro acesso, com uma senha nova (' || quantas || ' conta(s) removida(s)).'
  from public.colaboradores eu
  where eu.id = public.meu_colaborador_id();

  return query select ficha.nome, ficha.login, sorteada;
end;
$$;

-- Quem não entrou não chama: a função apaga conta de acesso
revoke execute on function public.resetar_senha_inicial(text) from public, anon;
grant  execute on function public.resetar_senha_inicial(text) to authenticated;

-- ------------------------------------------------------------
-- 6. OS CUPONS: login e senha de quem ainda não ativou
--
-- Roda com a permissão de quem chama: a tabela das senhas só entrega a
-- quem cuida de pessoas, e para os outros a lista volta vazia.
-- ------------------------------------------------------------
create or replace function public.senhas_para_entregar()
returns table (colaborador_id text, nome text, login text, loja text, setor text, senha text, gerada_em timestamptz)
language sql
stable
set search_path = public
as $$
  select c.id, c.nome, c.login, c.loja, c.setor, s.senha, s.gerada_em
    from public.senhas_de_ativacao s
    join public.colaboradores c on c.id = s.colaborador_id
   where c.auth_user_id is null
     and c.ativo
   order by c.loja, c.nome;
$$;

revoke all on function public.senhas_para_entregar() from public, anon;
grant execute on function public.senhas_para_entregar() to authenticated;

-- ------------------------------------------------------------
-- 7. A CARGA: quem ainda não ativou passa a ter a sua senha
--
-- A individual que o RH já tinha definido é preservada; as demais (as que
-- valiam "123456") são sorteadas. Quem já ativou não entra aqui.
-- ------------------------------------------------------------
insert into public.senhas_de_ativacao (colaborador_id, senha)
select c.id, trim(c.senha_ativacao)
  from public.colaboradores c
 where c.auth_user_id is null
   and trim(coalesce(c.senha_ativacao, '')) not in ('', '123456')
   and length(trim(c.senha_ativacao)) >= 6
on conflict (colaborador_id) do nothing;

insert into public.senhas_de_ativacao (colaborador_id, senha)
select c.id, public.senha_aleatoria()
  from public.colaboradores c
 where c.auth_user_id is null
   and not exists (select 1 from public.senhas_de_ativacao s where s.colaborador_id = c.id);

-- A coluna da ficha que todo logado lê fica vazia
update public.colaboradores set senha_ativacao = null where senha_ativacao is not null;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — uma linha. O esperado:
--   senha_padrao_aceita ......... false
--   coluna_da_ficha_vazia ....... 0
--   nao_ativadas_sem_senha ...... 0
--   ativadas_com_senha_guardada . 0   (quem já entrou não foi tocado)
--   senhas_para_entregar ........ o número de pessoas que ainda não entraram
-- ============================================================
select
  (select prosrc like '%123456%' from pg_proc where proname = 'criar_colaborador_do_usuario')   as senha_padrao_aceita,
  (select count(*) from public.colaboradores where senha_ativacao is not null)                    as coluna_da_ficha_vazia,
  (select count(*) from public.colaboradores c
    where c.auth_user_id is null
      and not exists (select 1 from public.senhas_de_ativacao s where s.colaborador_id = c.id))  as nao_ativadas_sem_senha,
  (select count(*) from public.senhas_de_ativacao s
     join public.colaboradores c on c.id = s.colaborador_id
    where c.auth_user_id is not null)                                                             as ativadas_com_senha_guardada,
  (select count(*) from public.senhas_de_ativacao s
     join public.colaboradores c on c.id = s.colaborador_id
    where c.auth_user_id is null and c.ativo)                                                     as senhas_para_entregar;
