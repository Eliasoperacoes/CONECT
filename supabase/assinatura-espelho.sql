-- ============================================================
-- DELTA: O ESPELHO DE PONTO ASSINADO — CONECTA
--
-- Pedido do Elias (05/10/2026): assinar o espelho de ponto do mesmo jeito
-- que o holerite, com a mesma assinatura e a mesma senha.
--
-- Só o que mudou desde `assinatura-holerite.sql` (que continua sendo a
-- fonte, com tudo): a conferência da senha virou uma função só, usada
-- pelo holerite e pelo espelho; e a tabela e a função do espelho.
--
-- Rode depois de `assinatura-holerite.sql`. Pode rodar mais de uma vez.
-- ============================================================

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

revoke all on function public.assinar_holerite(text, text, text, text) from public, anon;
grant execute on function public.assinar_holerite(text, text, text, text) to authenticated;

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

notify pgrst, 'reload schema';

-- CONFERÊNCIA: a tabela nova, as três funções, e o holerite já usando a
-- conferência única (as três colunas precisam sair 1, 3 e true)
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'espelhos_assinados') as tabela_1,
  (select count(*) from pg_proc
    where proname in ('assinar_holerite', 'conferir_senha_de_quem_assina', 'assinar_espelho')) as funcoes_3,
  (select prosrc like '%conferir_senha_de_quem_assina%'
     from pg_proc where proname = 'assinar_holerite') as holerite_usa_a_mesma_senha;
