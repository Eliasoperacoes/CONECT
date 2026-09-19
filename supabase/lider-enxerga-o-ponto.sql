-- ============================================================
-- O LÍDER ENXERGA O PONTO DE QUEM RESPONDE POR ELE
-- CONECTA / Malachias Autopeças
--
-- RODE `aprovar-jornada-lider.sql` E `corrigir-ponto-pelo-lider.sql`
-- ANTES DESTE.
--
-- ------------------------------------------------------------
-- O SINTOMA
-- ------------------------------------------------------------
--
-- A líder de Garantia tentou corrigir a hora da colaboradora dela e
-- recebeu "erro ao salvar / verifique a conexão". A conexão estava boa.
--
-- ------------------------------------------------------------
-- A CAUSA
-- ------------------------------------------------------------
--
-- A regra de LEITURA do ponto conhecia três casos:
--
--     a própria pessoa   ou   RH/Diretoria/TI   ou   nível >= 3
--
-- Líder de setor é nível 2. Ela não estava em nenhum dos três, e por isso
-- não conseguia LER a marcação da equipe — só a apuração do dia, que tem
-- regra própria e já sabia de líder. Daí a fila mostrar "trabalhou 3h28"
-- e a correção não gravar.
--
-- Gravar dependia de ler: a gravação usava `upsert`, que no banco vira
-- `ON CONFLICT DO UPDATE` e precisa ENXERGAR a linha para resolver o
-- conflito. Sem enxergar, a operação inteira falha — e não com "sem
-- permissão", mas com um erro que a tela traduzia para "verifique a
-- conexão". O `upsert` já saiu do código; esta regra fecha a outra metade.
--
-- ------------------------------------------------------------
-- O QUE ISTO ABRE, EXATAMENTE
-- ------------------------------------------------------------
--
-- Só a leitura, e só da cadeia. `posso_decidir_jornada` é a MESMA função
-- que decide quem aprova a jornada: quem a líder já aprova, ela passa a
-- enxergar o ponto. Ninguém mais entra.
-- ============================================================

drop policy if exists ponto_leitura on public.registros_ponto;
create policy ponto_leitura on public.registros_ponto
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.cuido_de_pessoas()
    or public.meu_nivel() >= 3
    -- Quem responde pela pessoa enxerga o ponto dela. Sem isto o líder de
    -- setor aprovava um dia cujas marcações não conseguia ver.
    or public.posso_decidir_jornada(colaborador_id)
  );

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- "Success" aparece igual ao rodar um arquivo antigo. O que vale é o que
-- estas linhas mostram.
-- ============================================================

-- 1. As quatro regras de registros_ponto, e se conhecem o responsável
select
  cmd as operacao,
  policyname as politica,
  case
    when coalesce(qual, '') || coalesce(with_check, '') like '%posso_decidir_jornada%'
      then 'conhece o responsável'
    else 'só RH / nível 3+'
  end as alcance
from pg_policies
where schemaname = 'public'
  and tablename = 'registros_ponto'
order by cmd;

-- Esperado:
--   DELETE  ponto_remocao  só RH / nível 3+     <- correto, apagar é do RH
--   INSERT  ponto_batida   conhece o responsável
--   SELECT  ponto_leitura  conhece o responsável
--   UPDATE  ponto_ajuste   conhece o responsável

-- 2. A prova com gente de verdade: a Fernanda alcança a Lívia?
--
-- Não depende de quem está logado no editor — a pergunta é feita sobre as
-- duas fichas diretamente.
select
  lider.nome   as lider,
  lider.nivel  as nivel_do_lider,
  pessoa.nome  as colaboradora,
  pessoa.responsavel_id,
  case
    when pessoa.responsavel_id = lider.id then 'SIM — responde direto a ela'
    when pessoa.responsavel_id is null then 'NÃO POSICIONADA — cai na regra automática de setor/loja'
    else 'responde a outra pessoa: ' || coalesce(
      (select nome from public.colaboradores where id = pessoa.responsavel_id), '?'
    )
  end as situacao
from public.colaboradores lider
cross join public.colaboradores pessoa
where lider.nome ilike '%fernanda%'
  and (pessoa.nome ilike '%livia%' or pessoa.nome ilike '%lívia%')
limit 20;
