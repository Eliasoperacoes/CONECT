-- ===================================================================
-- QUEM CORRIGE A BATIDA JÁ DECIDIU O DIA
-- ===================================================================
--
-- O DEFEITO: o Elias corrigiu o espelho pelo RH e o sistema mandou o
-- resultado para o LÍDER DO SETOR aprovar.
--
-- Além de inverter a hierarquia, isso enche a fila de quem não tem o que
-- julgar ali: o líder não sabe por que o RH mudou a batida, e a única
-- informação que ele teria é a justificativa que o próprio RH escreveu.
--
-- Quem corrige a marcação com autoridade sobre a pessoa já decidiu. O
-- dia passa a nascer APROVADO em nome de quem corrigiu, com a origem
-- `correcao_manual` para o espelho saber dizer de onde aquilo veio.
--
-- DUAS COISAS PRECISAM MUDAR NO BANCO:
--
--   1. A restrição da coluna `origem` só aceitava dois valores. Sem este
--      script, a gravação é RECUSADA — e a recusa da apuração só aparece
--      no console do navegador, então o sintoma seria "corrigi e o saldo
--      não mudou".
--
--   2. A política de criação só deixava a liderança inserir linha
--      PENDENTE. O RH já passava por `cuido_de_pessoas`; o líder, não —
--      e a correção dele falharia enquanto a do RH funcionava.
--
-- Roda quantas vezes quiser.
-- ===================================================================

-- ------------------------------------------------------------
-- 1. A ORIGEM NOVA
-- ------------------------------------------------------------
alter table public.ajustes_jornada
  drop constraint if exists ajustes_jornada_origem_check;

alter table public.ajustes_jornada
  add constraint ajustes_jornada_origem_check
  check (origem in ('pendencia', 'tolerancia_automatica', 'correcao_manual'));

-- ------------------------------------------------------------
-- 2. CRIAÇÃO — a correção nasce decidida por quem corrigiu
-- ------------------------------------------------------------
--
-- A liderança continua NÃO podendo abrir uma pendência já aprovada do
-- nada: o estado 'aprovado' só passa junto de `correcao_manual` e
-- assinado por quem está gravando. É a diferença entre decidir o dia que
-- você acabou de corrigir e carimbar um dia qualquer.
drop policy if exists ajustes_abertura on public.ajustes_jornada;
create policy ajustes_abertura on public.ajustes_jornada
  for insert to authenticated
  with check (
    -- A própria pessoa: pendência, ou o carimbo automático da tolerância
    (
      colaborador_id = public.meu_colaborador_id()
      and (
        estado = 'pendente'
        or (estado = 'aprovado' and origem = 'tolerancia_automatica' and aprovador_id is null)
      )
    )
    or public.cuido_de_pessoas()
    or (
      public.posso_decidir_jornada(colaborador_id)
      and (
        -- A liderança levanta o dia da equipe, sempre pendente
        estado = 'pendente'
        -- ...ou decide o dia que ela mesma acabou de corrigir
        or (
          estado = 'aprovado'
          and origem = 'correcao_manual'
          and aprovador_id = public.meu_colaborador_id()
        )
      )
    )
  );

notify pgrst, 'reload schema';

-- ===================================================================
-- CONFERÊNCIA
-- ===================================================================
--
-- "Success" aparece igual ao rodar um arquivo antigo. O que vale é isto:
-- as duas linhas precisam dizer "sim".
select
  'origem aceita correcao_manual' as o_que,
  case
    when pg_get_constraintdef(oid) like '%correcao_manual%' then 'sim'
    else 'NÃO — a restrição antiga ficou'
  end as situacao
from pg_constraint
where conname = 'ajustes_jornada_origem_check'

union all

select
  'a liderança decide o dia que corrigiu',
  case
    when coalesce(with_check, '') like '%correcao_manual%' then 'sim'
    else 'NÃO — a política antiga ficou'
  end
from pg_policies
where schemaname = 'public'
  and tablename = 'ajustes_jornada'
  and policyname = 'ajustes_abertura';
