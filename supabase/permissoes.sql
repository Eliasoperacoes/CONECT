-- ============================================================
-- CONECTA — PERMISSÕES DE TELA
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--
-- Uma coluna só. O painel do ADM grava aqui quais ferramentas cada nível
-- enxerga, e a configuração passa a valer em todos os aparelhos da rede.
--
-- ISTO CONTROLA PORTA, NÃO CONTEÚDO. Ligar uma ferramenta para o gerente
-- não mostra a rede inteira para ele: o que aparece dentro continua preso
-- à alçada (posso_decidir_jornada) e às políticas de cada tabela. A
-- separação é o que impede um interruptor de virar vazamento.
--
-- Nulo = vale o padrão que está no aplicativo. Nunca "ninguém vê nada" nem
-- "todo mundo vê tudo".
-- ============================================================

alter table public.configuracoes
  add column if not exists permissoes_ferramentas jsonb;

-- ============================================================
-- CONFERÊNCIA — coluna_existe tem que ser true
-- ============================================================
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'configuracoes'
       and column_name = 'permissoes_ferramentas'
  ) as coluna_existe,
  (select permissoes_ferramentas from public.configuracoes limit 1)
    as configuracao_atual;
