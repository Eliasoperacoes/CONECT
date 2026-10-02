-- ============================================================
-- CONFERIR as duas funções de nível que estavam duplicadas no esquema
-- (02/10/2026). Só leitura: não muda nada.
--
-- Responde em uma linha, com true/false — a definição inteira não cabe na
-- coluna do editor (02/10/2026: saiu cortada antes da parte que importa).
-- As quatro colunas precisam sair true.
-- ============================================================
select
  pg_get_functiondef('public.sou_admin()'::regprocedure) like '%meu_nivel() >= 5%' as admin_e_nivel_5,
  pg_get_functiondef('public.sou_admin()'::regprocedure) not like '%meu_nivel() = 4%' as admin_sem_regra_antiga,
  pg_get_functiondef('public.cuido_de_pessoas()'::regprocedure) like '%meu_nivel() >= 4%' as rh_e_diretoria_4_ou_mais,
  pg_get_functiondef('public.cuido_de_pessoas()'::regprocedure) like '%''RH''%' as rh_pelo_setor;
