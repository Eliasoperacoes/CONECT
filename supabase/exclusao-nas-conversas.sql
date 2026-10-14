-- ============================================================
-- EXCLUIR NAS CONVERSAS, DE VERDADE (14/10/2026)
--
-- Auditoria pedida pelo Elias ("essas funções devem estar 100% funcionais").
-- Duas lacunas:
--
--  1. O ARQUIVO DA MENSAGEM APAGADA FICAVA NO ARMAZENAMENTO. Só o TI podia
--     apagar anexo de conversa; quem apagava a própria foto tirava a
--     mensagem e deixava o arquivo órfão, ocupando o plano para sempre.
--     Agora quem ENVIOU o arquivo também o apaga (o dono que o próprio
--     armazenamento grava no envio). Holerite e advertência continuam só
--     do RH.
--
--  2. NÃO HAVIA COMO EXCLUIR UM CANAL OU GRUPO. A Administração só tinha
--     "Abrir". `excluir_conversa` é do TI: confere quem pede, recusa os
--     canais oficiais, apaga a conversa (mensagens e participantes caem
--     junto) e devolve SÓ os caminhos dos arquivos, para o aplicativo
--     tirá-los do armazenamento. O TI não lê as mensagens de quem ele
--     apaga — a função não as devolve.
--
-- Pode rodar de novo.
-- ============================================================

-- 1. Quem enviou o arquivo apaga o arquivo
drop policy if exists anexos_remocao on storage.objects;
create policy anexos_remocao on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and (
      case
        when split_part(name, '/', 1) in ('holerites', 'advertencias')
          then public.cuido_de_pessoas()
        else public.sou_admin()
          -- O dono do arquivo, nas duas colunas que o armazenamento já usou
          or owner_id = (select auth.uid())::text
          or owner = (select auth.uid())
      end
    )
  );

-- 2. O TI exclui um canal ou grupo, com os arquivos
create or replace function public.excluir_conversa(p_conversa text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo record;
  caminhos text[];
begin
  if not public.sou_admin() then
    raise exception 'Excluir canal ou grupo é do TI.' using errcode = '42501';
  end if;

  select id, eh_sistema_padrao into alvo from public.conversas where id = p_conversa;
  if not found then
    raise exception 'Conversa não encontrada.' using errcode = 'P0002';
  end if;
  if alvo.eh_sistema_padrao then
    raise exception 'Canal oficial da rede não se exclui.' using errcode = '42501';
  end if;

  select coalesce(array_agg(anexo_caminho), '{}')
    into caminhos
    from public.mensagens
   where conversa_id = p_conversa
     and anexo_caminho is not null;

  -- Participantes, mensagens e leituras caem junto (on delete cascade)
  delete from public.conversas where id = p_conversa;
  return caminhos;
end;
$$;
revoke all on function public.excluir_conversa(text) from public, anon;
grant execute on function public.excluir_conversa(text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   dono_apaga_o_arquivo ....... true
--   funcao_existe .............. true
--   arquivos_com_dono .......... igual ou perto de arquivos_de_conversa
--     (os enviados antes de hoje também têm dono: o armazenamento sempre
--      gravou; se vier 0, me avise — aí o dono não está sendo gravado)
-- ============================================================
select
  (select pg_get_expr(polqual, polrelid) like '%owner_id%'
     from pg_policy where polname = 'anexos_remocao'
      and polrelid = 'storage.objects'::regclass)                               as dono_apaga_o_arquivo,
  exists (select 1 from pg_proc where proname = 'excluir_conversa'
           and pronamespace = 'public'::regnamespace)                           as funcao_existe,
  (select count(*) from storage.objects
    where bucket_id = 'anexos'
      and split_part(name, '/', 1) not in ('holerites', 'advertencias', 'central', 'perfil')) as arquivos_de_conversa,
  (select count(*) from storage.objects
    where bucket_id = 'anexos'
      and split_part(name, '/', 1) not in ('holerites', 'advertencias', 'central', 'perfil')
      and (owner_id is not null or owner is not null))                         as arquivos_com_dono;
