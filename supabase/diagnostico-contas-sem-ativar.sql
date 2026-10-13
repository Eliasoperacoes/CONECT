-- ============================================================
-- DIAGNÓSTICO: CONTAS QUE AINDA NÃO FIZERAM O PRIMEIRO ACESSO (13/10/2026)
--
-- Só leitura, só contagem — nenhum nome, nenhuma senha.
--
-- A ativação (criar_colaborador_do_usuario, esquema.sql) aceita a senha
-- individual da ficha ou, sem ela, a padrão "123456". Quem sabe o login de
-- uma ficha ainda não ativada consegue ativá-la. Esta consulta mede o
-- tamanho da exposição hoje.
-- ============================================================
select
  count(*) filter (where ativo and auth_user_id is null)                                       as nao_ativadas,
  count(*) filter (where ativo and auth_user_id is null and coalesce(senha_ativacao, '') = '')  as com_senha_padrao_123456,
  count(*) filter (where ativo and auth_user_id is null and coalesce(senha_ativacao, '') <> '') as com_senha_individual,
  count(*) filter (where ativo and auth_user_id is not null)                                   as ja_ativadas
from public.colaboradores;
