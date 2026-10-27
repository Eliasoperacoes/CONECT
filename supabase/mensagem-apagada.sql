-- ============================================================================
-- "ESTA MENSAGEM FOI APAGADA" (21/10/2026)
--
-- Elias: "ao apagar a mensagem não fica nenhum 'mensagem apagada'". Apagar
-- tirava a linha do banco, e a mensagem sumia da conversa dos outros sem
-- deixar rastro — quem já tinha visto ficava sem saber o que houve.
--
-- Agora, como no WhatsApp, a linha fica e o CONTEÚDO sai: texto, legenda,
-- anexo, reações, fixação. Fica o lugar, com a hora, e a tela escreve "Esta
-- mensagem foi apagada". Quem apaga continua sendo o autor ou o TI.
--
-- O conteúdo é limpo AQUI, no gatilho, e não no aparelho: o banco é que
-- garante que o texto apagado não fica guardado para quem souber pedir.
-- E a apagada não volta nem ganha reação: qualquer alteração nela é ignorada.
-- ============================================================================

alter table public.mensagens add column if not exists apagada_em timestamptz;

create or replace function public.apenas_autor_reescreve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A apagada fica como está: não volta, não ganha reação, não é editada
  if old.apagada_em is not null then
    return old;
  end if;

  -- APAGAR: só o autor ou o TI, e o conteúdo sai junto
  if new.apagada_em is not null then
    if old.remetente_id is distinct from public.meu_colaborador_id() and not public.sou_admin() then
      raise exception 'Apenas o autor apaga a propria mensagem';
    end if;
    new.apagada_em      := now();
    new.texto           := null;
    new.legenda         := null;
    new.audio_url       := null;
    new.audio_duracao   := null;
    new.arquivo_nome    := null;
    new.arquivo_tamanho := null;
    new.arquivo_url     := null;
    new.imagem_url      := null;
    new.anexo_caminho   := null;
    new.responde_a      := null;
    new.eh_encaminhada  := false;
    new.reacoes         := '{}'::jsonb;
    new.editada_em      := null;
    new.fixada_em       := null;
    new.fixada_por_id   := null;
  elsif (new.texto is distinct from old.texto)
     or (new.legenda is distinct from old.legenda)
     or (new.editada_em is distinct from old.editada_em) then
    if old.remetente_id is distinct from public.meu_colaborador_id() then
      raise exception 'Apenas o autor pode editar a propria mensagem';
    end if;
  end if;

  -- Remetente, conversa e data de envio não mudam nunca
  new.id           := old.id;
  new.conversa_id  := old.conversa_id;
  new.remetente_id := old.remetente_id;
  new.criado_em    := old.criado_em;

  return new;
end;
$$;

-- O caminho do aparelho. Pela política de edição, só quem ainda participa
-- altera a linha; apagar vale também para o autor que saiu do grupo e para
-- o TI, como valia o DELETE. Devolve o caminho do anexo, que o aparelho tira
-- do armazenamento (exclusao-nas-conversas.sql deixa quem enviou apagar).
create or replace function public.apagar_mensagem(p_mensagem text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo public.mensagens%rowtype;
begin
  select * into alvo from public.mensagens where id = p_mensagem;
  if not found then
    raise exception 'Mensagem nao encontrada' using errcode = 'P0002';
  end if;
  if alvo.remetente_id is distinct from public.meu_colaborador_id() and not public.sou_admin() then
    raise exception 'Apenas o autor apaga a propria mensagem' using errcode = '42501';
  end if;
  update public.mensagens set apagada_em = now() where id = p_mensagem;
  return alvo.anexo_caminho;
end;
$$;

revoke execute on function public.apagar_mensagem(text) from public, anon;
grant execute on function public.apagar_mensagem(text) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: as três `true`
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'mensagens'
             and column_name = 'apagada_em')                                as coluna_existe,
  exists (select 1 from pg_proc where proname = 'apagar_mensagem')            as funcao_existe,
  (select prosrc like '%apagada_em%' from pg_proc
    where proname = 'apenas_autor_reescreve')                                 as gatilho_novo;
