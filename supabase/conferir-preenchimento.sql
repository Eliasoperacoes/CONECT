-- ===================================================================
-- A POLÍTICA DE CRIAÇÃO DO PONTO, LIDA COMO O BANCO A GUARDOU
-- ===================================================================
--
-- A conferência do `preencher-espelho-pelo-turno.sql` acusou "NÃO" na
-- terceira linha. Era ERRO DA CONFERÊNCIA, não da política: o Postgres
-- reescreve `metodo not in ('a','b','c')` como
-- `metodo <> ALL (ARRAY['a','b','c'])` ao guardar, e o `LIKE` que eu
-- escrevi procurava a forma original.
--
-- Este arquivo não altera nada. Ele confere de um jeito que não depende
-- de como o banco reescreveu, e ainda mostra o texto inteiro para você
-- ver com os próprios olhos.
-- ===================================================================

-- 1. A CONFERÊNCIA, sem depender da forma
--
-- `preenchimento_turno` tem de aparecer DUAS vezes na regra: uma na
-- lista do que a própria pessoa NÃO pode gravar, outra na do que a
-- liderança PODE. Uma só quer dizer que falta uma das duas metades.
select
  'preenchimento_turno aparece na regra' as o_que,
  (length(coalesce(with_check, '')) -
   length(replace(coalesce(with_check, ''), 'preenchimento_turno', ''))
  ) / length('preenchimento_turno')                    as quantas_vezes,
  case
    when (length(coalesce(with_check, '')) -
          length(replace(coalesce(with_check, ''), 'preenchimento_turno', ''))
         ) / length('preenchimento_turno') >= 2
      then 'sim — as duas metades estão lá'
    else 'NÃO — rode preencher-espelho-pelo-turno.sql de novo'
  end                                                   as situacao
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
  and policyname = 'ponto_criacao';

-- 2. O TEXTO INTEIRO, para leitura
--
-- Procure duas coisas:
--   - na parte da própria pessoa: `<> ALL (ARRAY[...'preenchimento_turno'...])`
--   - na parte da liderança:      `= ANY (ARRAY[...'preenchimento_turno'...])`
select policyname, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
  and policyname = 'ponto_criacao';
