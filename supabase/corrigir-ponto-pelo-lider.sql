-- ============================================================
-- O RESPONSÁVEL CORRIGE A MARCAÇÃO ANTES DE APROVAR
-- CONECTA / Malachias Autopeças
--
-- RODE `aprovar-jornada-lider.sql` ANTES DESTE. Ele cria a versão de
-- `posso_decidir_jornada` que as regras abaixo usam.
--
-- ------------------------------------------------------------
-- O QUE MUDA, E POR QUE
-- ------------------------------------------------------------
--
-- Corrigir marcação era só do RH. Na prática isso deixava a fila de
-- aprovação sem saída: o responsável via o dia fechado errado, sabia o
-- horário certo, e só podia aprovar o errado ou recusar — e recusar não
-- conserta o espelho de ninguém.
--
-- Agora quem responde pela pessoa também corrige. O alcance é o MESMO do
-- aprovar (`posso_decidir_jornada`), e não uma regra nova: duas regras
-- divergiriam, e alguém acabaria podendo corrigir o dia de quem não
-- aprova.
--
-- ------------------------------------------------------------
-- ISTO AFROUXA UMA TRAVA. O QUE SEGURA NO LUGAR
-- ------------------------------------------------------------
--
-- Marcação de ponto é registro trabalhista, e passa a ser gravável por
-- mais gente. O que continua valendo:
--
--   * A correção nasce com AUTOR e MOTIVO no próprio registro, e o
--     espelho a marca como corrigida.
--   * O método diz QUEM classe corrigiu: `ajuste_rh` ou `ajuste_lider`.
--   * O horário anterior vai para a Auditoria, que a limpeza de
--     histórico não apaga.
--   * APAGAR marcação continua só do RH. Corrigir horário e remover
--     batida são decisões diferentes.
--   * Ninguém corrige o próprio ponto por aqui: quem responde por
--     alguém decide a própria JORNADA, mas a marcação segue a mesma
--     cadeia, e `posso_decidir_jornada` só devolve verdadeiro para si
--     mesmo — o que é intencional e está coberto pelo item acima.
-- ============================================================

-- ------------------------------------------------------------
-- 1. O MÉTODO NOVO
--
-- Sem soltar a restrição, o banco recusa a linha com
-- "violates check constraint" e a correção do líder não grava.
-- ------------------------------------------------------------
alter table public.registros_ponto
  drop constraint if exists registros_ponto_metodo_check;

alter table public.registros_ponto
  add constraint registros_ponto_metodo_check
  check (metodo in ('qrcode', 'codigo_manual', 'ajuste_rh', 'ajuste_lider'));

-- ------------------------------------------------------------
-- 2. LANÇAR MARCAÇÃO QUE NÃO EXISTIA
--
-- Esquecer de bater a saída é o caso mais comum da fila. Corrigir isso é
-- CRIAR a linha, não alterar — por isso a regra de inserção precisa
-- conhecer o responsável.
--
-- A pessoa continua sem poder carimbar a própria batida como corrigida:
-- é o que impede alguém de lançar a si mesmo um horário que não bateu.
-- ------------------------------------------------------------
drop policy if exists ponto_batida on public.registros_ponto;
create policy ponto_batida on public.registros_ponto
  for insert to authenticated
  with check (
    (
      colaborador_id = public.meu_colaborador_id()
      and metodo not in ('ajuste_rh', 'ajuste_lider')
    )
    or public.cuido_de_pessoas()
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo = 'ajuste_lider'
    )
  );

-- ------------------------------------------------------------
-- 3. CORRIGIR MARCAÇÃO EXISTENTE
-- ------------------------------------------------------------
drop policy if exists ponto_ajuste on public.registros_ponto;
create policy ponto_ajuste on public.registros_ponto
  for update to authenticated
  using (
    public.cuido_de_pessoas()
    or public.posso_decidir_jornada(colaborador_id)
  )
  with check (
    public.cuido_de_pessoas()
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo = 'ajuste_lider'
    )
  );

-- APAGAR segue só do RH: de propósito, e não por esquecimento. Remover
-- batida não é corrigir horário — é dizer que ela nunca existiu.
drop policy if exists ponto_remocao on public.registros_ponto;
create policy ponto_remocao on public.registros_ponto
  for delete to authenticated using (public.cuido_de_pessoas());

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
-- "Success" aparece igual ao rodar um arquivo antigo.
-- ============================================================

-- 1. O método novo é aceito pela restrição
select
  case
    when pg_get_constraintdef(oid) like '%ajuste_lider%'
      then 'OK — o banco aceita a correção do líder'
    else 'AINDA NÃO — a restrição é a antiga'
  end as situacao
from pg_constraint
where conrelid = 'public.registros_ponto'::regclass
  and conname = 'registros_ponto_metodo_check';

-- 2. As duas regras de gravação conhecem o responsável
select
  policyname as politica,
  cmd as operacao,
  case
    when coalesce(with_check, '') like '%posso_decidir_jornada%'
      then 'OK — o responsável corrige'
    else 'AINDA NÃO'
  end as situacao
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
  and cmd in ('INSERT', 'UPDATE')
order by cmd;

-- 3. Apagar continua restrito ao RH
select
  case
    when qual like '%cuido_de_pessoas%' and qual not like '%posso_decidir_jornada%'
      then 'OK — apagar segue só do RH'
    else 'ATENÇÃO — a remoção mudou, confira'
  end as situacao
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
  and cmd = 'DELETE';
