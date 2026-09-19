-- ============================================================
-- QUEM É A EQUIPE DA FERNANDA — UMA CONSULTA SÓ
-- CONECTA / Malachias Autopeças
--
-- Não altera nada.
--
-- A conferência anterior mostrou o banco inteiro correto e duas coisas de
-- CADASTRO em aberto:
--
--   1. não existe ninguém com "Livia" no nome;
--   2. quantas pessoas respondem à Fernanda ficou cortado na tela.
--
-- A segunda decide tudo. Se ninguém responde a ela, a correção continua
-- falhando por mais certo que o banco esteja — e o conserto seria no
-- Organograma, não em SQL.
-- ============================================================

with gente as (

  select
    1 as ordem,
    'RESPONDEM À FERNANDA' as grupo,
    pessoa.nome,
    pessoa.nivel::text as nivel,
    pessoa.setor,
    pessoa.loja,
    case when pessoa.ativo then 'ativo' else 'DESLIGADO' end as situacao
  from public.colaboradores pessoa
  where pessoa.responsavel_id in (
    select id from public.colaboradores where nome ilike '%fernanda%'
  )

  union all

  -- O setor inteiro, para achar a pessoa pelo lugar quando o nome não bate
  select
    2,
    'SETOR GARANTIA',
    pessoa.nome,
    pessoa.nivel::text,
    pessoa.setor,
    pessoa.loja,
    case
      when pessoa.responsavel_id is null then 'SEM RESPONSÁVEL'
      else 'responde a ' || coalesce(
        (select nome from public.colaboradores where id = pessoa.responsavel_id), '?'
      )
    end
  from public.colaboradores pessoa
  where pessoa.setor ilike '%garantia%'

  union all

  -- Nomes parecidos, caso "Lívia" esteja grafada de outro jeito
  select
    3,
    'NOMES PARECIDOS COM LÍVIA',
    pessoa.nome,
    pessoa.nivel::text,
    pessoa.setor,
    pessoa.loja,
    case
      when pessoa.responsavel_id is null then 'SEM RESPONSÁVEL'
      else 'responde a ' || coalesce(
        (select nome from public.colaboradores where id = pessoa.responsavel_id), '?'
      )
    end
  from public.colaboradores pessoa
  where pessoa.nome ilike '%liv%'
     or pessoa.nome ilike '%lív%'
     or pessoa.nome ilike '%lív%'
     or pessoa.nome ilike '%lid%'
     or pessoa.nome ilike '%lyv%'

  union all

  -- E o total, para o caso de os três grupos acima virem vazios
  select
    4,
    'CONTAGEM',
    'Fernanda responde por ' || (
      select count(*) from public.colaboradores sub
      where sub.responsavel_id in (
        select id from public.colaboradores where nome ilike '%fernanda%'
      )
    )::text || ' pessoa(s)',
    '',
    '',
    '',
    'se for 0, o conserto é no Organograma'
)

select grupo, nome, nivel, setor, loja, situacao
from gente
order by ordem, nome;
