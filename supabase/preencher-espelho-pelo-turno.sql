-- ===================================================================
-- O MÉTODO "PREENCHIMENTO_TURNO"
-- ===================================================================
--
-- O ERRO na tela, ao preencher os dias vazios:
--
--   new row for relation "registros_ponto" violates check constraint
--   "registros_ponto_metodo_check"
--
-- A coluna `metodo` só aceitava quatro valores. O preenchimento usa um
-- QUINTO, de propósito: `preenchimento_turno` é o único horário que não
-- veio de gente — o sistema o deduziu do contrato num dia em que ninguém
-- bateu.
--
-- POR QUE UM VALOR NOVO, E NÃO 'ajuste_rh'
--
-- Seria mais fácil reaproveitar o do RH e não mexer no banco. Seria
-- errado. Correção tem autor: uma pessoa AFIRMOU aquele horário.
-- Preenchimento é dedução. Quem confere o espelho — e quem fiscalizar
-- amanhã — precisa separar as duas coisas sem depender de saber quem
-- mexeu, e é o banco que tem de guardar essa diferença, não só a tela.
--
-- No espelho ele sai em azul itálico, e a Auditoria registra quem mandou
-- e por quê.
--
-- Roda quantas vezes quiser.
-- ===================================================================

alter table public.registros_ponto
  drop constraint if exists registros_ponto_metodo_check;

alter table public.registros_ponto
  add constraint registros_ponto_metodo_check
  check (
    metodo in (
      'qrcode',
      'codigo_manual',
      'ajuste_rh',
      'ajuste_lider',
      'preenchimento_turno'
    )
  );

-- ------------------------------------------------------------
-- 2. QUEM PODE ESCREVER UM PREENCHIMENTO
-- ------------------------------------------------------------
--
-- A regra de criação dizia: a própria pessoa grava qualquer método
-- MENOS 'ajuste_rh' e 'ajuste_lider'. Com o valor novo isso abria um
-- buraco — o colaborador poderia gravar `preenchimento_turno` para si
-- mesmo e fechar o próprio espelho com o horário do turno, sem ninguém
-- decidir nada. A lista de exclusão precisa crescer junto.
--
-- E o outro lado: a liderança só podia gravar 'ajuste_lider'. Como
-- `preencherEspelhoPeloTurno` aceita quem responde pela pessoa, sem esta
-- linha o preenchimento do líder seria recusado pelo banco enquanto o do
-- RH funcionava — o tipo de diferença que vira "não funciona" sem causa.
drop policy if exists ponto_criacao on public.registros_ponto;
create policy ponto_criacao on public.registros_ponto
  for insert to authenticated
  with check (
    (
      colaborador_id = public.meu_colaborador_id()
      and metodo not in ('ajuste_rh', 'ajuste_lider', 'preenchimento_turno')
    )
    or public.cuido_de_pessoas()
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo in ('ajuste_lider', 'preenchimento_turno')
    )
  );

notify pgrst, 'reload schema';

-- ===================================================================
-- CONFERÊNCIA
-- ===================================================================
--
-- Precisa dizer "sim". "Success" aparece igual ao rodar arquivo antigo.
-- As TRÊS linhas precisam dizer "sim".
select
  'metodo aceita preenchimento_turno' as o_que,
  case
    when pg_get_constraintdef(oid) like '%preenchimento_turno%' then 'sim'
    else 'NÃO — a restrição antiga ficou'
  end as situacao
from pg_constraint
where conname = 'registros_ponto_metodo_check'

union all

select
  'a liderança consegue preencher',
  case
    when coalesce(with_check, '') like '%preenchimento_turno%' then 'sim'
    else 'NÃO — a política antiga ficou'
  end
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
  and policyname = 'ponto_criacao'

union all

select
  'ninguém preenche o PRÓPRIO espelho',
  case
    when coalesce(with_check, '') like
      '%not in (%ajuste_rh%ajuste_lider%preenchimento_turno%'
      then 'sim'
    else 'NÃO — confira a política ponto_criacao'
  end
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
  and policyname = 'ponto_criacao';
