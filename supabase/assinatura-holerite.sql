-- ============================================================
-- ASSINATURA DO HOLERITE — CONECTA / Malachias Autopeças
--
-- O papel tinha duas vias: a do colaborador e a que ele assinava e o RH
-- guardava. No sistema, a via assinada vira um REGISTRO:
--
--   - a ASSINATURA de cada pessoa é desenhada uma vez, junto com o aceite
--     do termo de adesão, e reaproveitada (decisão do Elias, 02/10/2026).
--     Nunca é alterada nem apagada: trocar é desenhar uma nova, e a antiga
--     continua valendo para o que assinou;
--   - cada holerite é assinado com a SENHA digitada de novo, conferida
--     AQUI, no banco. Conferir no aparelho não provaria nada: o banco só
--     veria "alguém disse que digitou";
--   - o RECEBIMENTO guarda quem, quando (hora do banco), com qual
--     assinatura, e o código (SHA-256) do PDF que a pessoa tinha na tela.
--     Holerite assinado não é mais alterado nem removido pelo sistema.
--
-- Rode depois de `rh-holerite-advertencia.sql`. Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.assinaturas (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  -- O desenho: PNG em data URL, fundo transparente. Fica na tabela, e não
  -- no armazenamento de arquivos: são uns 10 KB por pessoa, e assim a
  -- leitura segue a mesma regra de quem lê o recebimento
  imagem          text not null,
  -- Qual texto do termo de adesão a pessoa aceitou ao desenhar
  termo_versao    text not null,
  criada_em       timestamptz not null default now()
);

create index if not exists assinaturas_por_colaborador
  on public.assinaturas (colaborador_id, criada_em desc);

create table if not exists public.recebimentos_holerite (
  -- Um recebimento por holerite. O cascade só age pelo SQL Editor: pelo
  -- sistema, o gatilho abaixo não deixa apagar holerite assinado
  holerite_id     text primary key references public.holerites(id) on delete cascade,
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  assinatura_id   uuid not null references public.assinaturas(id),
  arquivo_hash    text not null,
  aparelho        text,
  assinado_em     timestamptz not null default now()
);

-- Senha errada na hora de assinar. Sem limite, a função de assinar viraria
-- uma porta para testar senhas
create table if not exists public.tentativas_de_assinatura (
  id              bigserial primary key,
  colaborador_id  text not null,
  em              timestamptz not null default now()
);

alter table public.assinaturas              enable row level security;
alter table public.recebimentos_holerite    enable row level security;
alter table public.tentativas_de_assinatura enable row level security;

-- Leitura: a própria pessoa e quem cuida de pessoas, como o holerite.
-- NENHUMA regra de escrita: só as funções abaixo gravam, com a hora do banco
drop policy if exists assinaturas_leitura on public.assinaturas;
create policy assinaturas_leitura on public.assinaturas
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

drop policy if exists recebimentos_leitura on public.recebimentos_holerite;
create policy recebimentos_leitura on public.recebimentos_holerite
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

-- (tentativas_de_assinatura: sem regra nenhuma — ninguém lê pela API)

-- ------------------------------------------------------------
-- CADASTRAR A ASSINATURA (e aceitar o termo)
-- ------------------------------------------------------------
create or replace function public.cadastrar_assinatura(p_imagem text, p_termo_versao text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  eu   text := public.meu_colaborador_id();
  nova uuid;
begin
  if eu is null then
    raise exception 'Sessão sem colaborador.';
  end if;
  if p_imagem is null or p_imagem not like 'data:image/png;base64,%' or length(p_imagem) > 300000 then
    raise exception 'Assinatura inválida.';
  end if;
  if coalesce(trim(p_termo_versao), '') = '' then
    raise exception 'O termo de adesão não foi aceito.';
  end if;

  insert into public.assinaturas (colaborador_id, imagem, termo_versao)
  values (eu, p_imagem, p_termo_versao)
  returning id into nova;
  return nova;
end;
$$;

-- ------------------------------------------------------------
-- ASSINAR UM HOLERITE
--
-- Devolve {ok, motivo} em vez de levantar erro no caso da senha: um erro
-- desfaria também o registro da tentativa, e o limite nunca contaria.
-- ------------------------------------------------------------
create or replace function public.assinar_holerite(
  p_holerite_id text,
  p_senha       text,
  p_hash        text,
  p_aparelho    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  eu        text := public.meu_colaborador_id();
  dono      text;
  vigente   uuid;
  senha_ok  boolean;
  quando    timestamptz;
begin
  if eu is null then
    return jsonb_build_object('ok', false, 'motivo', 'sessao');
  end if;

  select colaborador_id into dono from public.holerites where id = p_holerite_id;
  if dono is null or dono <> eu then
    return jsonb_build_object('ok', false, 'motivo', 'holerite');
  end if;

  select assinado_em into quando from public.recebimentos_holerite where holerite_id = p_holerite_id;
  if quando is not null then
    return jsonb_build_object('ok', true, 'assinado_em', quando, 'ja_estava', true);
  end if;

  if (select count(*) from public.tentativas_de_assinatura
      where colaborador_id = eu and em > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;

  select u.encrypted_password = extensions.crypt(coalesce(p_senha, ''), u.encrypted_password)
    into senha_ok
    from auth.users u
   where u.id = auth.uid();
  if not coalesce(senha_ok, false) then
    insert into public.tentativas_de_assinatura (colaborador_id) values (eu);
    return jsonb_build_object('ok', false, 'motivo', 'senha');
  end if;

  select id into vigente from public.assinaturas
   where colaborador_id = eu order by criada_em desc limit 1;
  if vigente is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_assinatura');
  end if;

  if length(coalesce(p_hash, '')) <> 64 or p_hash ~ '[^0-9a-f]' then
    return jsonb_build_object('ok', false, 'motivo', 'arquivo');
  end if;

  insert into public.recebimentos_holerite (holerite_id, colaborador_id, assinatura_id, arquivo_hash, aparelho)
  values (p_holerite_id, eu, vigente, p_hash, left(p_aparelho, 300))
  returning assinado_em into quando;

  return jsonb_build_object('ok', true, 'assinado_em', quando);
end;
$$;

revoke all on function public.cadastrar_assinatura(text, text) from public, anon;
revoke all on function public.assinar_holerite(text, text, text, text) from public, anon;
grant execute on function public.cadastrar_assinatura(text, text) to authenticated;
grant execute on function public.assinar_holerite(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- HOLERITE ASSINADO NÃO MUDA
--
-- Nem substituir (o upsert do reenvio), nem remover, nem a limpeza do mês.
-- Pelo SQL Editor (sem usuário) passa: é a saída de emergência do TI.
-- ------------------------------------------------------------
create or replace function public.holerite_assinado_nao_muda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.recebimentos_holerite where holerite_id = old.id) then
    raise exception 'Holerite já assinado pelo colaborador: não pode ser alterado nem removido.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists holerites_assinado_nao_muda on public.holerites;
create trigger holerites_assinado_nao_muda
  before update or delete on public.holerites
  for each row execute function public.holerite_assinado_nao_muda();

notify pgrst, 'reload schema';

-- CONFERÊNCIA: as três tabelas, as duas funções, o gatilho, e a conferência
-- de senha funcionando (a última coluna precisa sair "true")
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('assinaturas', 'recebimentos_holerite', 'tentativas_de_assinatura')) as tabelas_3,
  (select count(*) from pg_proc
    where proname in ('cadastrar_assinatura', 'assinar_holerite')) as funcoes_2,
  (select count(*) from pg_trigger where tgname = 'holerites_assinado_nao_muda') as gatilho_1,
  (select extensions.crypt('teste', h) = h
     from (select extensions.crypt('teste', extensions.gen_salt('bf')) as h) as gerado) as crypt_ok;
