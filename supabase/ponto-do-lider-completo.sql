-- ============================================================
-- PONTO E JORNADA DO LÍDER — ARQUIVO ÚNICO
-- CONECTA / Malachias Autopeças
--
-- Rode SÓ ESTE. Ele reúne, na ordem certa, o que estava espalhado em
-- `aprovar-jornada-lider.sql`, `corrigir-ponto-pelo-lider.sql` e
-- `lider-enxerga-o-ponto.sql`.
--
-- ------------------------------------------------------------
-- POR QUE UM ARQUIVO SÓ
-- ------------------------------------------------------------
--
-- A conferência mostrou SELECT já corrigido e INSERT/UPDATE ainda no
-- estado antigo. Isso é a assinatura de um script que ABORTOU NO MEIO: no
-- SQL Editor, um erro desfaz o que veio depois, e "Success" nunca aparece
-- — mas quem roda três arquivos seguidos pode não notar qual dos três
-- reclamou.
--
-- A causa mais provável é ordem: as regras de ponto citam
-- `posso_decidir_jornada`, e citar função que ainda não existe derruba o
-- arquivo inteiro. Aqui a função é criada ANTES de qualquer regra, e não
-- há como rodar fora de ordem.
--
-- Rodar de novo não quebra nada.
-- ============================================================

-- ============================================================
-- 1. QUEM DECIDE SOBRE A JORNADA DE QUEM
--
-- Precisa vir primeiro: todas as regras abaixo dependem dela.
-- ============================================================
create or replace function public.posso_decidir_jornada(alvo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- O LÍDER DECIDE A PRÓPRIA JORNADA.
    -- Condicionado a responder por alguém: sem isso, qualquer pessoa
    -- aprovaria as próprias horas e a fila deixaria de existir.
    (
      alvo = public.meu_colaborador_id()
      and exists (
        select 1 from public.colaboradores
         where responsavel_id = public.meu_colaborador_id()
      )
    )

    or (
      alvo is distinct from public.meu_colaborador_id()
      and (
        -- RH, Diretoria e TI seguem por fora da cadeia: o controle é deles
        public.cuido_de_pessoas()

        -- POSICIONADO NO ORGANOGRAMA: só a cadeia dele decide
        or (
          exists (
            select 1 from public.colaboradores
             where id = alvo and responsavel_id is not null
          )
          and public.estou_na_cadeia_de(alvo)
        )

        -- AINDA NÃO POSICIONADO: a regra automática, que impede as horas de
        -- quem falta posicionar de ficarem paradas na fila
        or exists (
          select 1
            from public.colaboradores solicitante,
                 public.colaboradores eu
           where solicitante.id = alvo
             and solicitante.responsavel_id is null
             and eu.id = public.meu_colaborador_id()
             -- A decisão sobe: quem está no mesmo degrau não aprova o colega
             and eu.nivel > solicitante.nivel
             and (
               -- Gerente responde pela loja inteira
               (eu.nivel >= 3 and eu.loja = solicitante.loja)
               -- O alcance por setor é do líder, e só dele
               or (eu.nivel = 2 and eu.setor = solicitante.setor)
             )
        )
      )
    );
$$;

-- ============================================================
-- 2. A FILA DE APROVAÇÃO
--
-- Ao abrir "Aprovar jornadas", o sistema ABRE uma linha de pendência para
-- cada dia que fechou pela metade. Quem grava é o líder; a linha é de
-- outra pessoa. Sem este caso, a aba mostrava "new row violates row-level
-- security policy".
-- ============================================================
drop policy if exists ajustes_abertura on public.ajustes_jornada;
create policy ajustes_abertura on public.ajustes_jornada
  for insert to authenticated
  with check (
    (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
    or public.cuido_de_pessoas()
    -- Só PENDENTE: levantar o dia é para decidir, não é decidir
    or (public.posso_decidir_jornada(colaborador_id) and estado = 'pendente')
  );

-- ============================================================
-- 3. O MÉTODO DA CORREÇÃO FEITA PELO LÍDER
--
-- Sem soltar a restrição, o banco recusa a linha com "violates check
-- constraint" e a correção não grava.
-- ============================================================
alter table public.registros_ponto
  drop constraint if exists registros_ponto_metodo_check;

alter table public.registros_ponto
  add constraint registros_ponto_metodo_check
  check (metodo in ('qrcode', 'codigo_manual', 'ajuste_rh', 'ajuste_lider'));

-- ============================================================
-- 4. LER O PONTO
--
-- Duas mudanças.
--
-- ENTRA o responsável: o líder de setor é nível 2 e não estava em caso
-- nenhum. Ele aprovava um dia cujas marcações não conseguia enxergar, e a
-- correção falhava com uma mensagem culpando a conexão.
--
-- SAI o `meu_nivel() >= 3`, que dava a QUALQUER gerente o ponto de
-- QUALQUER pessoa da rede, inclusive de outra loja. A tela filtrava; o
-- banco não. Trava que mora só na tela não é trava.
--
-- O gerente continua alcançando a loja dele: quem está posicionado no
-- organograma vem pela cadeia, e quem não está cai na regra automática de
-- loja, que é parte da mesma função.
-- ============================================================
drop policy if exists ponto_leitura on public.registros_ponto;
create policy ponto_leitura on public.registros_ponto
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.cuido_de_pessoas()
    or public.posso_decidir_jornada(colaborador_id)
  );

-- ============================================================
-- 5. LANÇAR A BATIDA QUE FALTOU
--
-- Esquecer de bater a saída é o caso mais comum da fila. Corrigir isso é
-- CRIAR a linha, não alterar.
--
-- A pessoa continua sem poder carimbar a própria batida como corrigida: é
-- o que impede alguém de lançar a si mesmo um horário que não bateu.
-- ============================================================
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

-- ============================================================
-- 6. CORRIGIR MARCAÇÃO EXISTENTE
-- ============================================================
drop policy if exists ponto_ajuste on public.registros_ponto;
create policy ponto_ajuste on public.registros_ponto
  for update to authenticated
  using (
    public.cuido_de_pessoas()
    or public.posso_decidir_jornada(colaborador_id)
  )
  with check (
    public.cuido_de_pessoas()
    -- O responsável só grava marcação carimbada como correção dele
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo = 'ajuste_lider'
    )
  );

-- APAGAR segue só do RH, de propósito. Remover batida não é corrigir
-- horário — é dizer que ela nunca existiu.
drop policy if exists ponto_remocao on public.registros_ponto;
create policy ponto_remocao on public.registros_ponto
  for delete to authenticated using (public.cuido_de_pessoas());

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- "Success" aparece igual ao rodar arquivo antigo. O que vale é isto.
-- ============================================================

-- 1. As quatro regras do ponto
select
  cmd as operacao,
  policyname as politica,
  case
    when coalesce(qual, '') || coalesce(with_check, '') like '%posso_decidir_jornada%'
      then 'conhece o responsável'
    else 'só RH'
  end as alcance
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
order by cmd;

-- ESPERADO — as três primeiras mudaram, a última NÃO:
--   DELETE  ponto_remocao  só RH
--   INSERT  ponto_batida   conhece o responsável
--   SELECT  ponto_leitura  conhece o responsável
--   UPDATE  ponto_ajuste   conhece o responsável

-- 2. A fila de aprovação
select
  policyname as politica,
  case
    when with_check like '%posso_decidir_jornada%' then 'conhece o responsável'
    else 'AINDA NÃO'
  end as alcance
from pg_policies
where schemaname = 'public'
  and tablename = 'ajustes_jornada'
  and cmd = 'INSERT';

-- 3. O método novo é aceito
select
  case
    when pg_get_constraintdef(oid) like '%ajuste_lider%' then 'OK'
    else 'AINDA NÃO'
  end as metodo_do_lider
from pg_constraint
where conrelid = 'public.registros_ponto'::regclass
  and conname = 'registros_ponto_metodo_check';

-- 4. A Fernanda alcança a Lívia?
select
  lider.nome   as lider,
  lider.nivel  as nivel_do_lider,
  pessoa.nome  as colaboradora,
  case
    when pessoa.responsavel_id = lider.id then 'SIM — responde direto a ela'
    when pessoa.responsavel_id is null then 'NÃO POSICIONADA — vale a regra automática de setor/loja'
    else 'responde a: ' || coalesce(
      (select nome from public.colaboradores where id = pessoa.responsavel_id), '?'
    )
  end as situacao
from public.colaboradores lider
cross join public.colaboradores pessoa
where lider.nome ilike '%fernanda%'
  and (pessoa.nome ilike '%livia%' or pessoa.nome ilike '%lívia%')
limit 20;
