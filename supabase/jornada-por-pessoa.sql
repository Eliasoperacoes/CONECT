-- ============================================================
-- CONECTA — A JORNADA DE CADA PESSOA
--
-- POR QUE ISTO EXISTE
--
-- A rede não tem uma jornada só:
--
--   colaborador    8h10 por dia + 4h de sábado   = 44h50 na semana
--   estagiário A   6h por dia, NÃO vem ao sábado = 30h na semana
--   estagiário B   menos por dia, VEM ao sábado  = 30h na semana
--
-- O sistema cobrava de todo mundo quatro batidas e um sábado, então os dois
-- estagiários eram reprovados todo dia sem que nada estivesse errado.
--
-- VAZIO SIGNIFICA "SIGA O PADRÃO DO SETOR", e não zero. Por isso as colunas
-- aceitam nulo: quem não tem jornada própria segue o padrão, e mudar o
-- padrão depois alcança essa pessoa.
--
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

alter table public.colaboradores
  add column if not exists carga_semanal_minutos integer,
  add column if not exists trabalha_sabado boolean,
  add column if not exists tem_intervalo boolean;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- Tem que aparecer TRÊS linhas, todas com aceita_vazio = YES.
-- "YES" é o que faz o padrão do setor continuar valendo para quem não tem
-- jornada própria cadastrada.
-- ============================================================
select
  column_name   as coluna,
  data_type     as tipo,
  is_nullable   as aceita_vazio
from information_schema.columns
where table_schema = 'public'
  and table_name = 'colaboradores'
  and column_name in ('carga_semanal_minutos', 'trabalha_sabado', 'tem_intervalo')
order by column_name;
