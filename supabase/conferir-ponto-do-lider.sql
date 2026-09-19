-- ============================================================
-- CONFERÊNCIA DO PONTO DO LÍDER — UMA CONSULTA SÓ
-- CONECTA / Malachias Autopeças
--
-- Não altera nada. Só olha e responde.
--
-- É UMA CONSULTA ÚNICA DE PROPÓSITO. O SQL Editor mostra apenas o
-- resultado da ÚLTIMA consulta do arquivo: um arquivo com quatro
-- conferências entrega três respostas invisíveis, e foi o que aconteceu.
-- Aqui cada verificação é uma LINHA da mesma tabela.
-- ============================================================

with conferencia as (

  -- As quatro regras do ponto
  select
    1 as ordem,
    'SELECT · ler o ponto' as verificacao,
    coalesce(
      (select case
         when coalesce(qual, '') like '%posso_decidir_jornada%'
           then 'OK · conhece o responsável'
         else 'FALTA · ainda só RH / nível 3+'
       end
       from pg_policies
       where schemaname = 'public' and tablename = 'registros_ponto' and cmd = 'SELECT'),
      'FALTA · a regra não existe'
    ) as situacao

  union all
  select
    2,
    'INSERT · lançar batida que faltou',
    coalesce(
      (select case
         when coalesce(with_check, '') like '%posso_decidir_jornada%'
           then 'OK · conhece o responsável'
         else 'FALTA · ainda só RH'
       end
       from pg_policies
       where schemaname = 'public' and tablename = 'registros_ponto' and cmd = 'INSERT'),
      'FALTA · a regra não existe'
    )

  union all
  select
    3,
    'UPDATE · corrigir batida existente',
    coalesce(
      (select case
         when coalesce(with_check, '') like '%posso_decidir_jornada%'
           then 'OK · conhece o responsável'
         else 'FALTA · ainda só RH'
       end
       from pg_policies
       where schemaname = 'public' and tablename = 'registros_ponto' and cmd = 'UPDATE'),
      'FALTA · a regra não existe'
    )

  union all
  select
    4,
    'DELETE · apagar batida (tem de seguir só do RH)',
    coalesce(
      (select case
         when coalesce(qual, '') like '%posso_decidir_jornada%'
           then 'ATENÇÃO · o líder está apagando batida'
         else 'OK · só RH'
       end
       from pg_policies
       where schemaname = 'public' and tablename = 'registros_ponto' and cmd = 'DELETE'),
      'FALTA · a regra não existe'
    )

  -- O gerente não deve mais alcançar a rede inteira
  union all
  select
    5,
    'Gerente lê o ponto de outra loja?',
    coalesce(
      (select case
         when coalesce(qual, '') like '%meu_nivel%'
           then 'AINDA LÊ · o nível 3 ainda alcança a rede toda'
         else 'OK · fechado, agora vale a cadeia'
       end
       from pg_policies
       where schemaname = 'public' and tablename = 'registros_ponto' and cmd = 'SELECT'),
      'FALTA · a regra não existe'
    )

  -- A fila de aprovação
  union all
  select
    6,
    'Fila · abrir pendência da equipe',
    coalesce(
      (select case
         when coalesce(with_check, '') like '%posso_decidir_jornada%'
           then 'OK · conhece o responsável'
         else 'FALTA · ainda só RH'
       end
       from pg_policies
       where schemaname = 'public' and tablename = 'ajustes_jornada' and cmd = 'INSERT'),
      'FALTA · a regra não existe'
    )

  -- O método da correção do líder
  union all
  select
    7,
    'Banco aceita a correção do líder',
    coalesce(
      (select case
         when pg_get_constraintdef(oid) like '%ajuste_lider%' then 'OK'
         else 'FALTA · a restrição é a antiga'
       end
       from pg_constraint
       where conrelid = 'public.registros_ponto'::regclass
         and conname = 'registros_ponto_metodo_check'),
      'FALTA · a restrição não existe'
    )

  -- E a pergunta de gente: a Fernanda responde pela Lívia?
  union all
  select
    8,
    'Organograma · Fernanda responde pela Lívia?',
    coalesce(
      (select
         pessoa.nome || ' (nível ' || pessoa.nivel || ', ' || pessoa.setor || ') → ' ||
         case
           when pessoa.responsavel_id is null
             then 'SEM RESPONSÁVEL · vale a regra automática de setor/loja'
           else 'responde a ' || coalesce(
             (select nome from public.colaboradores where id = pessoa.responsavel_id), '?'
           )
         end
       from public.colaboradores pessoa
       where pessoa.nome ilike '%livia%' or pessoa.nome ilike '%lívia%'
       limit 1),
      'NÃO ACHEI ninguém com "Livia" no nome'
    )

  union all
  select
    9,
    'Organograma · quem é a Fernanda',
    coalesce(
      (select
         lider.nome || ' · nível ' || lider.nivel || ' · ' || lider.setor || ' · ' || lider.loja ||
         ' · responde por ' ||
         (select count(*) from public.colaboradores sub where sub.responsavel_id = lider.id) ||
         ' pessoa(s)'
       from public.colaboradores lider
       where lider.nome ilike '%fernanda%'
       limit 1),
      'NÃO ACHEI ninguém com "Fernanda" no nome'
    )
)

select verificacao, situacao
from conferencia
order by ordem;
