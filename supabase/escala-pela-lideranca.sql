-- ============================================================
-- A LIDERANÇA MONTA A ESCALA, SEM ESPERAR PEDIDO
-- CONECTA / Malachias Autopeças
--
-- RODE `ponto-do-lider-completo.sql` ANTES DESTE: as regras abaixo usam
-- `posso_decidir_jornada`, que é criada lá.
--
-- ------------------------------------------------------------
-- O QUE MUDA
-- ------------------------------------------------------------
--
-- Até agora uma ausência só nascia de UM PEDIDO DO COLABORADOR: ele abria
-- a solicitação e a liderança decidia. Serve para atestado e folga, que
-- realmente partem da pessoa.
--
-- Não serve para PLANEJAR. Montar a escala de férias do semestre, ou
-- fechar os sábados do mês, é trabalho de quem organiza a equipe — e
-- ficava impossível, porque a liderança não tinha como CRIAR a linha.
--
-- Duas mudanças, as duas pequenas:
--
--   1. FÉRIAS entra como tipo. Antes teria de ser lançada como "outro",
--      e aí some de qualquer contagem de férias que se queira fazer
--      depois.
--
--   2. Quem responde pela pessoa passa a ABRIR a ausência dela — já
--      aprovada, porque quem lança é quem aprovaria mesmo. Pedir que ele
--      crie pendente e aprove em seguida seria teatro.
--
-- O colaborador continua abrindo o pedido dele, e continua nascendo
-- PENDENTE. Isso não muda: pedido que nasce aprovado não é pedido.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FÉRIAS COMO TIPO
-- ------------------------------------------------------------
alter table public.justificativas_ausencia
  drop constraint if exists justificativas_ausencia_tipo_check;

alter table public.justificativas_ausencia
  add constraint justificativas_ausencia_tipo_check
  check (
    tipo in (
      'atestado',
      'falta_justificada',
      'comparecimento',
      'folga_sabado',
      'ferias',
      'outro'
    )
  );

-- ------------------------------------------------------------
-- 2. A LIDERANÇA ABRE A AUSÊNCIA DA EQUIPE
--
-- Sem `and estado = 'pendente'` no caso do responsável, de propósito: é
-- justamente ele que lança já aprovado. A trava que importa continua de
-- pé — ele só alcança quem responde a ele, pela mesma função que decide
-- quem aprova jornada.
-- ------------------------------------------------------------
drop policy if exists justificativas_abertura on public.justificativas_ausencia;
create policy justificativas_abertura on public.justificativas_ausencia
  for insert to authenticated
  with check (
    -- O pedido da própria pessoa nasce pendente, como sempre
    (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
    or public.cuido_de_pessoas()
    -- E a liderança monta a escala de quem responde a ela
    or public.posso_decidir_jornada(colaborador_id)
  );

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — UMA CONSULTA SÓ
--
-- O editor mostra apenas o resultado da última consulta do arquivo.
-- ============================================================
with conferencia as (
  select
    1 as ordem,
    'Férias é um tipo aceito pelo banco' as verificacao,
    coalesce(
      (select case
         when pg_get_constraintdef(oid) like '%ferias%' then 'OK'
         else 'FALTA · a restrição é a antiga'
       end
       from pg_constraint
       where conrelid = 'public.justificativas_ausencia'::regclass
         and conname = 'justificativas_ausencia_tipo_check'),
      'FALTA · a restrição não existe'
    ) as situacao

  union all
  select
    2,
    'A liderança abre ausência da equipe',
    coalesce(
      (select case
         when coalesce(with_check, '') like '%posso_decidir_jornada%'
           then 'OK · conhece o responsável'
         else 'FALTA · ainda só a própria pessoa e o RH'
       end
       from pg_policies
       where schemaname = 'public'
         and tablename = 'justificativas_ausencia'
         and cmd = 'INSERT'),
      'FALTA · a regra não existe'
    )

  union all
  select
    3,
    'O pedido do colaborador continua nascendo pendente',
    coalesce(
      (select case
         when coalesce(with_check, '') like '%estado = ''pendente''%'
           then 'OK · a trava do pedido segue de pé'
         else 'ATENÇÃO · pedido pode nascer aprovado'
       end
       from pg_policies
       where schemaname = 'public'
         and tablename = 'justificativas_ausencia'
         and cmd = 'INSERT'),
      'FALTA · a regra não existe'
    )

  union all
  select
    4,
    'Decidir e ler seguem pela cadeia',
    coalesce(
      (select string_agg(
         cmd || ': ' || case
           when coalesce(qual, '') || coalesce(with_check, '') like '%posso_decidir_jornada%'
             then 'OK'
           else 'FALTA'
         end, ' · ' order by cmd)
       from pg_policies
       where schemaname = 'public'
         and tablename = 'justificativas_ausencia'
         and cmd in ('SELECT', 'UPDATE')),
      'FALTA · sem regras'
    )
)
select verificacao, situacao from conferencia order by ordem;
