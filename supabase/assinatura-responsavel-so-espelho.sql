-- ============================================================================
-- A ASSINATURA DO RESPONSÁVEL QUE FALTOU NO BANCO (16/10/2026)
--
-- A Dani foi assinar 8 espelhos como responsável e ouviu "A assinatura do
-- responsável ainda não foi ligada no banco. Avise o TI".
--
-- Medido: em produção está a PRIMEIRA versão de assinatura-responsavel.sql,
-- a de 05/10 com três parâmetros (senha, holerites, espelhos). No mesmo dia
-- o holerite saiu do lote do responsável — o recibo leva só a assinatura do
-- funcionário — e a função passou a ter dois (senha, espelhos). O sistema
-- chama a de dois, que nunca chegou ao banco.
--
-- Aqui: sai a de três, entra a de dois — o mesmo texto de
-- assinatura-responsavel.sql, sem mudança. Tabela e regras de leitura não
-- mudaram entre as versões. Pode rodar mais de uma vez.
-- ============================================================================

drop function if exists public.assinar_como_responsavel(text, text[], text[]);

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

-- Conferência: as duas `true`
select
  exists (select 1 from pg_proc p where p.proname = 'assinar_como_responsavel'
           and pg_get_function_identity_arguments(p.oid) = 'p_senha text, p_espelhos text[]') as funcao_de_dois_existe,
  not exists (select 1 from pg_proc p where p.proname = 'assinar_como_responsavel'
           and pg_get_function_identity_arguments(p.oid) like '%p_holerites%')                as funcao_antiga_saiu;
