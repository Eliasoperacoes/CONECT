-- ============================================================
-- CONECTA — CONSERTO DO LOGIN
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Pode rodar mais de uma vez sem medo.
--
-- O QUE ESTAVA ERRADO
--
-- A função que trata o primeiro acesso existia em DOIS arquivos, com
-- comportamentos opostos: um adotava a ficha que veio da planilha, o outro
-- criava uma ficha nova. Em Postgres vale a última versão executada — e o
-- esquema, rodado várias vezes depois, deixava a errada valendo.
--
-- Por isso o gerente entrava e nascia um segundo cadastro dele, nível 1,
-- Balcão, sem CNPJ nem matrícula; a ficha boa ficava órfã, sem acesso.
--
-- Este arquivo desfaz o estrago e põe a versão certa no lugar. Já faz parte
-- do esquema.sql — está separado aqui só para ser mais curto de colar.
-- ============================================================

-- ============================================================
-- ATIVAÇÃO DE ACESSO
--
-- REGRA: ninguém cria conta pela tela de login. Todo colaborador é
-- cadastrado dentro do sistema (pelo RH ou pela planilha de carga) e só
-- então consegue ATIVAR o acesso. O gatilho não CRIA ficha — ele LIGA a
-- conta de autenticação a uma ficha que já existe, casando pelo login.
--
-- Por que isto está escrito aqui, e não num arquivo à parte: esta função
-- já existiu em dois arquivos ao mesmo tempo, com comportamentos opostos.
-- O outro arquivo criava uma ficha nova a cada primeiro acesso, e quem
-- rodasse os dois na ordem errada ficava com ele valendo — o gerente
-- entrava e nascia um segundo cadastro dele, nível 1, sem nada configurado.
-- Uma função, um lugar.
-- ============================================================

-- Quem ainda está com a senha de primeiro acesso e precisa definir a dele
alter table public.colaboradores
  add column if not exists precisa_trocar_senha boolean not null default true;

/**
 * Senha que libera a PRIMEIRA entrada daquela pessoa.
 *
 * Em branco = vale a padrão da rede. O RH pode definir uma individual para
 * quem preferir entregar em mão. É consumida na ativação: depois de usada,
 * volta a ficar em branco e quem manda é a senha que a pessoa escolheu.
 *
 * Sem isto, QUALQUER senha ativava a conta — quem descobrisse a URL e
 * chutasse um login viraria aquela pessoa, com o nível dela.
 */
alter table public.colaboradores
  add column if not exists senha_ativacao text;

-- ------------------------------------------------------------
-- CONSERTO DO CADASTRO REPETIDO
--
-- Enquanto o gatilho antigo esteve valendo, quem entrou pela primeira vez
-- ganhou uma ficha NOVA em vez de assumir a que veio da planilha: nível 1,
-- Balcão, sem CNPJ nem matrícula — e a ficha boa ficou órfã, sem acesso.
--
-- Este bloco desfaz isso. A ficha fantasma é reconhecível pelo id, que o
-- gatilho antigo montava a partir do próprio usuário de autenticação
-- ('colab-' + o uuid sem hífen). Para cada fantasma que tenha uma ficha de
-- planilha com o mesmo login, o acesso volta para a ficha boa e o que a
-- pessoa produziu no meio tempo vai junto.
-- ------------------------------------------------------------
do $$
declare
  fantasma record;
begin
  for fantasma in
    select g.id as id_fantasma, g.auth_user_id, r.id as id_real
      from public.colaboradores g
      join public.colaboradores r
        on lower(trim(r.login)) = lower(trim(g.login))
       and r.id <> g.id
       and r.auth_user_id is null
     where g.auth_user_id is not null
       and g.id = 'colab-' || replace(g.auth_user_id::text, '-', '')
  loop
    -- O que a pessoa fez logada como fantasma passa para a ficha boa.
    -- 'on conflict do nothing' onde há chave composta: se os dois lados
    -- tiverem a mesma linha, fica a que já estava.
    update public.participantes    set colaborador_id = fantasma.id_real
      where colaborador_id = fantasma.id_fantasma
        and not exists (
          select 1 from public.participantes p2
           where p2.conversa_id = participantes.conversa_id
             and p2.colaborador_id = fantasma.id_real);
    update public.mensagens        set remetente_id   = fantasma.id_real
      where remetente_id = fantasma.id_fantasma;
    update public.registros_ponto  set colaborador_id = fantasma.id_real
      where colaborador_id = fantasma.id_fantasma
        and not exists (
          select 1 from public.registros_ponto r2
           where r2.colaborador_id = fantasma.id_real
             and r2.data = registros_ponto.data
             and r2.tipo = registros_ponto.tipo);
    update public.ajustes_jornada  set colaborador_id = fantasma.id_real
      where colaborador_id = fantasma.id_fantasma
        and not exists (
          select 1 from public.ajustes_jornada a2
           where a2.colaborador_id = fantasma.id_real
             and a2.data = ajustes_jornada.data);

    -- O acesso muda de dono ANTES de apagar: a coluna é unique, e as duas
    -- fichas não podem apontar para o mesmo usuário nem por um instante
    update public.colaboradores set auth_user_id = null  where id = fantasma.id_fantasma;
    update public.colaboradores
       set auth_user_id = fantasma.auth_user_id,
           precisa_trocar_senha = true
     where id = fantasma.id_real;

    delete from public.colaboradores where id = fantasma.id_fantasma;

    raise notice 'Cadastro repetido desfeito: % virou %', fantasma.id_fantasma, fantasma.id_real;
  end loop;
end $$;

-- Login é identidade, e " Fabio " não pode ser outra pessoa que "fabio".
-- O índice antigo já ignorava a caixa; este ignora também o espaço sobrando,
-- que é como o gatilho compara.
drop index if exists public.colaboradores_login_minusculo;
create unique index if not exists colaboradores_login_unico
  on public.colaboradores (lower(trim(login)));

create or replace function public.criar_colaborador_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  login_informado  text;
  senha_informada  text;
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

  if senha_informada is distinct from coalesce(nullif(ficha.senha_ativacao, ''), '123456') then
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

  return new;
end;
$$;

-- A senha digitada viajou dentro do cadastro do usuário; não pode ficar
-- guardada lá em texto puro depois de conferida
create or replace function public.limpar_senha_de_ativacao()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  update auth.users
     set raw_user_meta_data = raw_user_meta_data - 'ativacao'
   where id = new.id
     and raw_user_meta_data ? 'ativacao';
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_colaborador_do_usuario();

-- Roda depois da adoção (ordem alfabética do nome do gatilho), para apagar
-- a senha de ativação só depois de ela ter sido conferida
drop trigger if exists ao_criar_usuario_limpar_senha on auth.users;
create trigger ao_criar_usuario_limpar_senha
  after insert on auth.users
  for each row execute function public.limpar_senha_de_ativacao();

-- ============================================================
-- CONFERÊNCIA
--
-- fichas_no_banco ....... deve bater com a sua planilha de carga
-- fantasmas_restantes ... tem que ser 0
-- gatilho_correto ....... tem que ser true
-- ============================================================
select
  (select count(*) from public.colaboradores)                                as fichas_no_banco,
  (select count(*) from public.colaboradores where auth_user_id is not null) as acessos_ja_ativados,
  (select count(*) from public.colaboradores c
    where c.auth_user_id is not null
      and c.id = 'colab-' || replace(c.auth_user_id::text, '-', ''))         as fantasmas_restantes,
  exists (
    select 1 from pg_proc
     where proname = 'criar_colaborador_do_usuario'
       and prosrc ilike '%Login nao cadastrado na rede%'
  )                                                                          as gatilho_correto;
