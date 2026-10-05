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
--   - o ESPELHO DE PONTO do mês fechado é assinado do mesmo jeito, com a
--     mesma assinatura e a mesma senha (05/10/2026; seção no fim).
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
-- (a leitura de `assinaturas` é criada no fim, com a assinatura do
-- responsável: ela depende da tabela de lá)

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
-- A SENHA DE QUEM ASSINA — uma conferência só, para holerite e espelho
--
-- Devolve null quando a senha confere, ou o motivo ('bloqueado', 'senha').
-- A senha errada fica registrada como tentativa: cinco em 15 minutos
-- bloqueiam, em qualquer documento — sem isso, assinar viraria uma porta
-- para testar senhas.
--
-- Só as funções de assinar a chamam (elas rodam como dono do banco):
-- ninguém a chama pela API.
-- ------------------------------------------------------------
create or replace function public.conferir_senha_de_quem_assina(p_eu text, p_senha text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  senha_ok boolean;
begin
  if (select count(*) from public.tentativas_de_assinatura
      where colaborador_id = p_eu and em > now() - interval '15 minutes') >= 5 then
    return 'bloqueado';
  end if;

  select u.encrypted_password = extensions.crypt(coalesce(p_senha, ''), u.encrypted_password)
    into senha_ok
    from auth.users u
   where u.id = auth.uid();
  if not coalesce(senha_ok, false) then
    insert into public.tentativas_de_assinatura (colaborador_id) values (p_eu);
    return 'senha';
  end if;

  return null;
end;
$$;

revoke all on function public.conferir_senha_de_quem_assina(text, text) from public, anon, authenticated;

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
  motivo    text;
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

  motivo := public.conferir_senha_de_quem_assina(eu, p_senha);
  if motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', motivo);
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

-- ============================================================
-- O ESPELHO DE PONTO ASSINADO
--
-- Pedido do Elias (05/10/2026): o espelho assinado do mesmo jeito que o
-- holerite — a MESMA assinatura de cada pessoa, confirmada com a senha.
--
-- Um por pessoa e mês, e só de mês fechado: o espelho do mês corrente
-- muda a cada batida. O código guardado é o do CONTEÚDO que a pessoa
-- tinha na tela (as marcações, a conta de cada dia e os totais), e não do
-- papel: o papel traz a data de emissão, que muda todo dia. Se o RH
-- corrigir o mês depois, o espelho mostra que mudou desde a assinatura.
-- ============================================================
create table if not exists public.espelhos_assinados (
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  -- "2026-09": o formato inteiro, pelo tamanho e pelo começo
  mes             text not null check (length(mes) = 7 and mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])'),
  assinatura_id   uuid not null references public.assinaturas(id),
  conteudo_hash   text not null,
  aparelho        text,
  assinado_em     timestamptz not null default now(),
  primary key (colaborador_id, mes)
);

alter table public.espelhos_assinados enable row level security;

drop policy if exists espelhos_assinados_leitura on public.espelhos_assinados;
create policy espelhos_assinados_leitura on public.espelhos_assinados
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

create or replace function public.assinar_espelho(
  p_mes      text,
  p_senha    text,
  p_hash     text,
  p_aparelho text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  eu       text := public.meu_colaborador_id();
  vigente  uuid;
  motivo   text;
  quando   timestamptz;
begin
  if eu is null then
    return jsonb_build_object('ok', false, 'motivo', 'sessao');
  end if;

  -- Só mês fechado, pelo relógio do banco em Brasília
  if length(coalesce(p_mes, '')) <> 7 or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])'
     or p_mes >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') then
    return jsonb_build_object('ok', false, 'motivo', 'mes_aberto');
  end if;

  select assinado_em into quando from public.espelhos_assinados
   where colaborador_id = eu and mes = p_mes;
  if quando is not null then
    return jsonb_build_object('ok', true, 'assinado_em', quando, 'ja_estava', true);
  end if;

  motivo := public.conferir_senha_de_quem_assina(eu, p_senha);
  if motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', motivo);
  end if;

  select id into vigente from public.assinaturas
   where colaborador_id = eu order by criada_em desc limit 1;
  if vigente is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_assinatura');
  end if;

  if length(coalesce(p_hash, '')) <> 64 or p_hash ~ '[^0-9a-f]' then
    return jsonb_build_object('ok', false, 'motivo', 'arquivo');
  end if;

  insert into public.espelhos_assinados (colaborador_id, mes, assinatura_id, conteudo_hash, aparelho)
  values (eu, p_mes, vigente, p_hash, left(p_aparelho, 300))
  returning assinado_em into quando;

  return jsonb_build_object('ok', true, 'assinado_em', quando);
end;
$$;

revoke all on function public.assinar_espelho(text, text, text, text) from public, anon;
grant execute on function public.assinar_espelho(text, text, text, text) to authenticated;

-- ============================================================
-- A ASSINATURA DO RESPONSÁVEL — o outro lado do papel
--
-- Pedido do Elias (05/10/2026): o RH assina como responsável os espelhos
-- de ponto que os colaboradores já assinaram — de uma vez, não um por um.
-- Uma senha, um lote. SÓ O ESPELHO: o holerite leva apenas a assinatura do
-- funcionário (o recibo), e o responsável não assina holerite.
--
-- Só entra o documento que o colaborador JÁ assinou: o responsável assina
-- por cima do que a pessoa reconheceu, nunca antes. E ninguém assina como
-- responsável o próprio documento — esse fica para outra pessoa do RH.
--
-- O código guardado é o que o colaborador assinou, tirado AQUI das
-- tabelas, e não mandado pelo aparelho.
-- ============================================================
create table if not exists public.assinaturas_do_responsavel (
  -- Só espelho; a coluna fica para o dia em que outro documento pedir
  documento         text not null check (documento in ('espelho')),
  -- "colaborador_id|AAAA-MM"
  referencia        text not null,
  -- O dono do documento: é ele quem lê, além do RH
  colaborador_id    text not null references public.colaboradores(id) on delete cascade,
  mes               text not null,
  responsavel_id    text not null references public.colaboradores(id),
  responsavel_nome  text not null,
  assinatura_id     uuid not null references public.assinaturas(id),
  documento_hash    text not null,
  assinado_em       timestamptz not null default now(),
  primary key (documento, referencia)
);

alter table public.assinaturas_do_responsavel enable row level security;

drop policy if exists assinaturas_do_responsavel_leitura on public.assinaturas_do_responsavel;
create policy assinaturas_do_responsavel_leitura on public.assinaturas_do_responsavel
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

-- O colaborador vê a assinatura do responsável no PRÓPRIO documento, e
-- só nele: a regra da tabela de assinaturas ganha esse caso
drop policy if exists assinaturas_leitura on public.assinaturas;
create policy assinaturas_leitura on public.assinaturas
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.cuido_de_pessoas()
    or exists (
      select 1 from public.assinaturas_do_responsavel r
       where r.assinatura_id = assinaturas.id
         and r.colaborador_id = public.meu_colaborador_id()
    )
  );

create or replace function public.assinar_como_responsavel(
  p_senha     text,
  -- "colaborador_id|AAAA-MM"
  p_espelhos  text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  eu         text := public.meu_colaborador_id();
  meu_nome   text;
  vigente    uuid;
  motivo     text;
  espelhos   integer := 0;
begin
  if eu is null then
    return jsonb_build_object('ok', false, 'motivo', 'sessao');
  end if;
  if not public.cuido_de_pessoas() then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;
  if coalesce(cardinality(p_espelhos), 0) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'vazio');
  end if;
  if cardinality(p_espelhos) > 2000 then
    return jsonb_build_object('ok', false, 'motivo', 'lote');
  end if;

  motivo := public.conferir_senha_de_quem_assina(eu, p_senha);
  if motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', motivo);
  end if;

  select id into vigente from public.assinaturas
   where colaborador_id = eu order by criada_em desc limit 1;
  if vigente is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_assinatura');
  end if;
  select nome into meu_nome from public.colaboradores where id = eu;

  -- Só o que o colaborador assinou, e não é de quem assina
  insert into public.assinaturas_do_responsavel
    (documento, referencia, colaborador_id, mes, responsavel_id, responsavel_nome, assinatura_id, documento_hash)
  select 'espelho', e.colaborador_id || '|' || e.mes, e.colaborador_id, e.mes, eu, meu_nome, vigente, e.conteudo_hash
    from public.espelhos_assinados e
   where (e.colaborador_id || '|' || e.mes) = any (coalesce(p_espelhos, '{}'))
     and e.colaborador_id <> eu
  on conflict (documento, referencia) do nothing;
  get diagnostics espelhos = row_count;

  return jsonb_build_object('ok', true, 'espelhos', espelhos, 'assinado_em', now());
end;
$$;

revoke all on function public.assinar_como_responsavel(text, text[]) from public, anon;
grant execute on function public.assinar_como_responsavel(text, text[]) to authenticated;

notify pgrst, 'reload schema';

-- CONFERÊNCIA: as cinco tabelas, as cinco funções, o gatilho, e a
-- conferência de senha funcionando (a última coluna precisa sair "true")
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('assinaturas', 'recebimentos_holerite', 'tentativas_de_assinatura',
                         'espelhos_assinados', 'assinaturas_do_responsavel')) as tabelas_5,
  (select count(*) from pg_proc
    where proname in ('cadastrar_assinatura', 'assinar_holerite', 'conferir_senha_de_quem_assina',
                      'assinar_espelho', 'assinar_como_responsavel')) as funcoes_5,
  (select count(*) from pg_trigger where tgname = 'holerites_assinado_nao_muda') as gatilho_1,
  (select extensions.crypt('teste', h) = h
     from (select extensions.crypt('teste', extensions.gen_salt('bf')) as h) as gerado) as crypt_ok;
