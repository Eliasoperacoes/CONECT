-- ============================================================
-- QUEM É O "FANTASMA" QUE SOBROU
--
-- O bloco de limpeza só funde um cadastro repetido quando existe OUTRA
-- ficha com o mesmo login esperando acesso. Se sobrou um, é porque:
--   a) é o seu próprio cadastro, que nasceu pelo gatilho quando o banco
--      estava vazio — tem o mesmo formato de id e é legítimo; ou
--   b) o login dele não bate com nenhuma ficha da planilha.
--
-- A coluna "diagnostico" responde qual dos dois é.
-- ============================================================
select
  c.id,
  c.nome,
  c.login,
  c.cargo,
  c.setor,
  c.loja,
  c.nivel,
  c.criado_em,
  case
    when c.nivel >= 5 then 'LEGITIMO: e o administrador, criado no banco vazio'
    when exists (
      select 1 from public.colaboradores o
       where o.id <> c.id
         and lower(trim(o.login)) = lower(trim(c.login))
    ) then 'REPETIDO: ha outra ficha com este login'
    else 'ORFAO: o login nao bate com nenhuma ficha da planilha'
  end as diagnostico
from public.colaboradores c
where c.auth_user_id is not null
  and c.id = 'colab-' || replace(c.auth_user_id::text, '-', '');

-- E como ficaram as duas contas ja ativadas
select id, nome, login, cargo, nivel, loja, precisa_trocar_senha
  from public.colaboradores
 where auth_user_id is not null
 order by nivel desc;
