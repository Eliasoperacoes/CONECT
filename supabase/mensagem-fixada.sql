-- ============================================================
-- CONECTA — FIXAR MENSAGEM NA CONVERSA
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--
-- Uma mensagem fixada fica no alto da conversa, à vista de TODOS os
-- participantes, até alguém desafixar. Serve para escala do sábado, meta do
-- dia, comunicado da loja.
--
-- É diferente de fixar CONVERSA no topo da lista, que é preferência de cada
-- pessoa e vive no navegador. Aqui é conteúdo compartilhado, então vive no
-- banco.
--
-- Guardamos QUEM fixou e QUANDO. Num grupo com 30 pessoas, "quem pôs isso
-- aqui" é a primeira pergunta — e sem autoria ninguém sabe a quem pedir
-- para tirar.
-- ============================================================

alter table public.mensagens
  add column if not exists fixada_em      timestamptz,
  add column if not exists fixada_por_id  text references public.colaboradores(id) on delete set null;

-- A consulta do banner busca "as fixadas desta conversa, mais recentes
-- primeiro". Sem o índice, isso varre a conversa inteira a cada abertura.
create index if not exists mensagens_fixadas_por_conversa
  on public.mensagens (conversa_id, fixada_em desc)
  where fixada_em is not null;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — as duas colunas têm que vir true
-- ============================================================
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mensagens'
       and column_name = 'fixada_em'
  ) as coluna_fixada_em,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mensagens'
       and column_name = 'fixada_por_id'
  ) as coluna_fixada_por;
