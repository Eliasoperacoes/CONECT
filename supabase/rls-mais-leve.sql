-- ============================================================================
-- AS REGRAS DE LEITURA DO PONTO, SEM REFAZER A CONTA A CADA LINHA (16/10/2026)
--
-- O Elias sentiu tudo lento um dia depois de o ponto entrar para mais gente.
-- medir-lentidao.sql mostrou: ler `registros_ponto` levava 1,4 s em média,
-- `ajustes_jornada` 0,6 s — para pouco mais de mil linhas.
--
-- A causa: a política perguntava `posso_decidir_jornada(colaborador_id)` em
-- CADA LINHA, e essa função sobe a cadeia do organograma (recursiva) a cada
-- pergunta. Mil batidas, mil subidas. E `meu_colaborador_id()` e
-- `cuido_de_pessoas()` também rodavam por linha.
--
-- Agora:
--   · `(select f())` — o banco calcula UMA vez por consulta;
--   · `minha_alcada_de_jornada()` — a lista de quem eu alcanço, montada uma
--     vez perguntando a MESMA `posso_decidir_jornada` para cada pessoa da
--     rede (~90), e não para cada batida. A regra continua num lugar só.
--
-- O que cada um vê NÃO muda. Onde a política antiga não citava
-- `cuido_de_pessoas()` (ajustes, compensação), ela entra explícita: para
-- quem cuida de pessoas `posso_decidir_jornada` já dizia sim a todos os
-- outros, e a própria linha já vinha pela primeira condição.
-- ============================================================================

create or replace function public.minha_alcada_de_jornada()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select c.id from public.colaboradores c where public.posso_decidir_jornada(c.id);
$$;

revoke execute on function public.minha_alcada_de_jornada() from public, anon;
grant execute on function public.minha_alcada_de_jornada() to authenticated;

drop policy if exists ponto_leitura on public.registros_ponto;
create policy ponto_leitura on public.registros_ponto
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or (select public.cuido_de_pessoas())
    or colaborador_id in (select public.minha_alcada_de_jornada())
  );

drop policy if exists ajustes_leitura on public.ajustes_jornada;
create policy ajustes_leitura on public.ajustes_jornada
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or (select public.cuido_de_pessoas())
    or colaborador_id in (select public.minha_alcada_de_jornada())
  );

drop policy if exists compensacao_leitura on public.compensacao_sabado;
create policy compensacao_leitura on public.compensacao_sabado
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or (select public.cuido_de_pessoas())
    or colaborador_id in (select public.minha_alcada_de_jornada())
  );

drop policy if exists originais_leitura on public.marcacoes_originais;
create policy originais_leitura on public.marcacoes_originais
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or (select public.cuido_de_pessoas())
    or colaborador_id in (select public.minha_alcada_de_jornada())
  );

drop policy if exists tratamento_leitura on public.tratamento_marcacao;
create policy tratamento_leitura on public.tratamento_marcacao
  for select to authenticated
  using (
    exists (
      select 1 from public.marcacoes_originais o
       where o.nsr = tratamento_marcacao.nsr
         and (
           o.colaborador_id = (select public.meu_colaborador_id())
           or (select public.cuido_de_pessoas())
           or o.colaborador_id in (select public.minha_alcada_de_jornada())
         )
    )
  );

drop policy if exists justificativas_leitura on public.justificativas_ausencia;
create policy justificativas_leitura on public.justificativas_ausencia
  for select to authenticated
  using (
    colaborador_id = (select public.meu_colaborador_id())
    or (select public.cuido_de_pessoas())
    or (
      tipo in ('folga_sabado', 'ferias')
      and colaborador_id in (select public.minha_alcada_de_jornada())
    )
  );

notify pgrst, 'reload schema';

-- Zera as estatísticas de consulta (não mexe em dado nenhum): assim o
-- medir-lentidao.sql de amanhã mostra o tempo com as regras novas, e não a
-- média arrastada desde o começo
do $$
begin
  perform extensions.pg_stat_statements_reset();
exception when others then
  null; -- sem a extensão (banco de teste), não há o que zerar
end;
$$;

-- Conferência: as duas `true`
select
  exists (select 1 from pg_proc where proname = 'minha_alcada_de_jornada')       as funcao_existe,
  (select pg_get_expr(polqual, polrelid) like '%minha_alcada_de_jornada%'
     from pg_policy where polname = 'ponto_leitura'
      and polrelid = 'public.registros_ponto'::regclass)                          as ponto_usa_a_lista;
