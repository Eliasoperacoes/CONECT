-- ============================================================
-- DELTA: A ASSINATURA DO RESPONSÁVEL — CONECTA
--
-- Pedido do Elias (05/10/2026): o RH assina como responsável, de uma vez,
-- os holerites e espelhos que os colaboradores já assinaram.
--
-- Só o que mudou desde `assinatura-espelho.sql` (a fonte, com tudo, é
-- `assinatura-holerite.sql`): a tabela e a função do responsável, e a
-- leitura de `assinaturas`, para o colaborador ver a assinatura do
-- responsável no próprio documento.
--
-- Rode depois de `assinatura-espelho.sql`. Pode rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- A ASSINATURA DO RESPONSÁVEL — o outro lado do papel
--
-- Pedido do Elias (05/10/2026): o RH assina como responsável os holerites
-- e espelhos que os colaboradores já assinaram — de uma vez, não um por
-- um. Uma senha, um lote.
--
-- Só entra o documento que o colaborador JÁ assinou: o responsável assina
-- por cima do que a pessoa reconheceu, nunca antes. E ninguém assina como
-- responsável o próprio documento — esse fica para outra pessoa do RH.
--
-- O código guardado é o que o colaborador assinou, tirado AQUI das
-- tabelas, e não mandado pelo aparelho.
-- ============================================================
create table if not exists public.assinaturas_do_responsavel (
  documento         text not null check (documento in ('holerite', 'espelho')),
  -- holerite: o id dele; espelho: "colaborador_id|AAAA-MM"
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
  p_holerites text[],
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
  holerites  integer := 0;
  espelhos   integer := 0;
begin
  if eu is null then
    return jsonb_build_object('ok', false, 'motivo', 'sessao');
  end if;
  if not public.cuido_de_pessoas() then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;
  if coalesce(cardinality(p_holerites), 0) + coalesce(cardinality(p_espelhos), 0) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'vazio');
  end if;
  if coalesce(cardinality(p_holerites), 0) + coalesce(cardinality(p_espelhos), 0) > 2000 then
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

  -- Holerite: só o que tem recebimento, e não é de quem assina
  insert into public.assinaturas_do_responsavel
    (documento, referencia, colaborador_id, mes, responsavel_id, responsavel_nome, assinatura_id, documento_hash)
  select 'holerite', r.holerite_id, r.colaborador_id, h.competencia, eu, meu_nome, vigente, r.arquivo_hash
    from public.recebimentos_holerite r
    join public.holerites h on h.id = r.holerite_id
   where r.holerite_id = any (coalesce(p_holerites, '{}'))
     and r.colaborador_id <> eu
  on conflict (documento, referencia) do nothing;
  get diagnostics holerites = row_count;

  -- Espelho: só o que o colaborador assinou, e não é de quem assina
  insert into public.assinaturas_do_responsavel
    (documento, referencia, colaborador_id, mes, responsavel_id, responsavel_nome, assinatura_id, documento_hash)
  select 'espelho', e.colaborador_id || '|' || e.mes, e.colaborador_id, e.mes, eu, meu_nome, vigente, e.conteudo_hash
    from public.espelhos_assinados e
   where (e.colaborador_id || '|' || e.mes) = any (coalesce(p_espelhos, '{}'))
     and e.colaborador_id <> eu
  on conflict (documento, referencia) do nothing;
  get diagnostics espelhos = row_count;

  return jsonb_build_object('ok', true, 'holerites', holerites, 'espelhos', espelhos, 'assinado_em', now());
end;
$$;

revoke all on function public.assinar_como_responsavel(text, text[], text[]) from public, anon;
grant execute on function public.assinar_como_responsavel(text, text[], text[]) to authenticated;

notify pgrst, 'reload schema';

-- CONFERÊNCIA: a tabela, a função, e a leitura nova de `assinaturas`
-- (as três colunas precisam sair 1, 1 e true)
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'assinaturas_do_responsavel') as tabela_1,
  (select count(*) from pg_proc where proname = 'assinar_como_responsavel') as funcao_1,
  (select qual like '%assinaturas_do_responsavel%' from pg_policies
    where tablename = 'assinaturas' and policyname = 'assinaturas_leitura') as colaborador_ve_o_responsavel;
