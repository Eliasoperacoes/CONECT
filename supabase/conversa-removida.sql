-- ============================================================
-- CONECTA — REMOVER CONVERSA DA LISTA
--
-- Acrescenta a marca que separa ARQUIVAR de REMOVER.
--
--   Arquivar  -> sai da lista e VOLTA na próxima mensagem do colega.
--   Remover   -> sai da lista e NÃO volta sozinha. Só reaparece quando a
--                própria pessoa chamar o colega de novo.
--
-- NADA é apagado nos dois casos. Nenhuma mensagem é tocada por este script:
-- a marca é por PESSOA, na tabela de participantes, e vale só para a lista
-- de quem pediu. O colega do outro lado continua vendo a conversa dele.
--
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

alter table public.participantes
  add column if not exists removida boolean not null default false;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- Tem que aparecer UMA linha: removida / boolean / NO / false.
-- "aceita_vazio = NO" importa: a coluna nasce com valor para todo mundo que
-- já está cadastrado, então ninguém fica com a lista em estado indefinido.
-- ============================================================
select
  column_name     as coluna,
  data_type       as tipo,
  is_nullable     as aceita_vazio,
  column_default  as valor_padrao
from information_schema.columns
where table_schema = 'public'
  and table_name = 'participantes'
  and column_name = 'removida';
