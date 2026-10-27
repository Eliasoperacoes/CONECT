-- ============================================================
-- COTADOR — O CARTÃO DA COTAÇÃO RESPONDIDA NO CHAT (21/10/2026)
-- ============================================================
-- AINDA NÃO RODAR NA PRODUÇÃO: sobe junto com o resto do cotador.
--
-- O comprador responde e o vendedor recebe no chat um cartão com a peça,
-- o valor e o botão que abre a cotação respondida (Elias: "um card
-- informativo com a peça, valor e um botão para acessar a aba de cotação
-- direto na cotação respondida").
--
-- A coluna guarda só o código da peça; o botão abre a cotação dela.
-- Só a resposta do comprador manda a coluna (nuvemComunicacao.ts,
-- linhaParaGravar): sem este script, falha só o cartão — o chat continua.
-- ============================================================

alter table public.mensagens
  add column if not exists cotacao_codigo text;

notify pgrst, 'reload schema';

-- Conferência: deve voltar 1 linha
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'mensagens' and column_name = 'cotacao_codigo';
