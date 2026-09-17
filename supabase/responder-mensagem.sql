-- ============================================================
-- CONECTA — RESPONDER MENSAGEM
--
-- Acrescenta a coluna que liga uma resposta à mensagem respondida.
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

alter table public.mensagens
  add column if not exists responde_a text;

-- A ligação é conferida pelo banco: id de resposta que não existe seria uma
-- citação apontando para o nada, e a tela não teria o que mostrar.
--
-- `on delete set null`: quem apaga a mensagem original NÃO apaga as
-- respostas dela. A conversa continua legível; só a citação some, e a tela
-- mostra "mensagem apagada" no lugar. Apagar em cascata levaria junto o que
-- as outras pessoas escreveram.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mensagens_responde_a_fkey'
  ) then
    alter table public.mensagens
      add constraint mensagens_responde_a_fkey
      foreign key (responde_a) references public.mensagens(id) on delete set null;
  end if;
end $$;

-- Abrir uma conversa monta as citações de uma vez; sem índice cada uma
-- viraria uma varredura na tabela inteira.
create index if not exists idx_mensagens_responde_a
  on public.mensagens (responde_a)
  where responde_a is not null;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- Tem que aparecer UMA linha, com a coluna responde_a.
-- ============================================================
select
  column_name   as coluna,
  data_type     as tipo,
  is_nullable   as aceita_vazio
from information_schema.columns
where table_schema = 'public'
  and table_name = 'mensagens'
  and column_name = 'responde_a';
