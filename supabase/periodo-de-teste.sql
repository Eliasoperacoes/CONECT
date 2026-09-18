-- ============================================================
-- CONECTA — PERÍODO DE TESTE
--
-- Uma faixa no alto da tela de todo mundo, dizendo que o sistema está em
-- teste e com um botão para avisar quem cuida dele.
--
-- POR QUE ISTO EXISTE: quem encontra um defeito e não sabe que é teste
-- conclui que "é assim mesmo", para de tentar e volta para o grupo do
-- WhatsApp. O defeito continua lá, e ninguém fica sabendo dele.
--
-- Liga e desliga no painel ADM, em Parâmetros. Nasce DESLIGADO — ligar é
-- uma decisão, não um padrão.
--
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

alter table public.configuracoes
  add column if not exists em_periodo_de_teste boolean not null default false;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- Tem que aparecer UMA linha: em_periodo_de_teste / boolean / NO / false.
-- ============================================================
select
  column_name     as coluna,
  data_type       as tipo,
  is_nullable     as aceita_vazio,
  column_default  as valor_padrao
from information_schema.columns
where table_schema = 'public'
  and table_name = 'configuracoes'
  and column_name = 'em_periodo_de_teste';
