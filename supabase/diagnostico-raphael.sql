-- ============================================================
-- POR QUE O RAPHAEL NÃO ENTRA
--
-- Só leitura: não altera nada.
--
-- Duas causas possíveis, e esta consulta separa as duas:
--
--   a) a ficha NÃO CHEGOU ao banco. O painel grava no aparelho e manda para
--      o banco sem esperar resposta — se a gravação falhou, o cadastro
--      existe só naquele navegador, e o login não acha ninguém.
--
--   b) a ficha está lá, mas a SENHA esperada é outra. A senha digitada no
--      painel nunca chegou ao banco: o primeiro acesso exige a padrão.
-- ============================================================

select
  c.nome,
  c.login,
  c.nivel,
  c.loja,
  c.criado_em,
  (c.auth_user_id is null)                        as pronto_para_primeiro_acesso,
  coalesce(nullif(c.senha_ativacao, ''), '123456') as senha_que_o_sistema_espera,
  lower(regexp_replace(trim(c.login), '[^a-zA-Z0-9._-]', '', 'g'))
    || '@conecta.malachias.local'                  as email_do_app
from public.colaboradores c
where c.nome ilike '%raphael%' or c.login ilike '%raphael%';

-- Se a consulta acima vier VAZIA, a ficha não chegou ao banco: é a causa (a).
-- Neste caso, veja quem foi cadastrado hoje — para conferir se outros
-- cadastros recentes também se perderam.
select
  nome,
  login,
  nivel,
  loja,
  criado_em
from public.colaboradores
where criado_em >= current_date - interval '2 days'
order by criado_em desc;
