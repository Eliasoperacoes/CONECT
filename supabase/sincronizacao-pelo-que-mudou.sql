-- ============================================================
-- A SINCRONIZAÇÃO PELO QUE MUDOU (30/10/2026)
--
-- O aparelho baixava tabelas inteiras a cada carga: o chat todo, 62 dias
-- de batidas, todas as apurações desde o começo. Medido em 29/10, com as
-- 89 pessoas: 287 MB de tráfego num dia útil, a caminho de estourar os
-- 5 GB do plano gratuito.
--
-- Este script dá ao banco o que falta para o aparelho pedir só o que mudou:
--
--   1. `alterado_em` em cada tabela que o aparelho guarda, carimbado pelo
--      próprio banco em toda inserção e alteração. Ninguém precisa lembrar
--      de preencher.
--   2. `resumo_da_sincronizacao(tabela, inicio, fim)`: quantas linhas a
--      pessoa enxerga, a alteração mais recente e a assinatura dos ids —
--      poucos bytes. Igual ao da última vez, o aparelho não baixa nada.
--      Diferente, baixa só o que mudou; se ainda divergir, foi remoção ou
--      mudança de quem enxerga o quê, e ele acerta pelos ids.
--
-- O resumo roda com a permissão de quem pergunta (security invoker): a RLS
-- de cada tabela vale igual, e só entra nele o que já chegaria à pessoa.
--
-- Os cadastros (colaboradores) ficam para depois: têm leitura por coluna
-- (travar_colunas_da_ficha) e pedem cuidado próprio.
--
-- Pode rodar de novo: nada é recriado duas vezes.
-- ============================================================

-- 1. O CARIMBO

create or replace function public.carimbar_alteracao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- clock_timestamp, e não now(): now() é o início da transação, e uma
  -- transação longa carimbaria no passado o que gravou no fim
  new.alterado_em := clock_timestamp();
  return new;
end;
$$;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'registros_ponto', 'ajustes_jornada', 'justificativas_ausencia', 'afastamentos',
    'mensagens', 'leituras_mensagem', 'participantes', 'conversas'
  ]
  loop
    -- now() como padrão, e não clock_timestamp(): padrão estável não reescreve
    -- a tabela; as linhas que já existem nascem com a hora deste script
    execute format(
      'alter table public.%I add column if not exists alterado_em timestamptz not null default now()',
      tabela);
    -- O nome começa com "ultimo" de propósito: gatilhos BEFORE do mesmo
    -- momento rodam em ordem alfabética, e o carimbo vem depois das guardas
    -- (só o autor edita, só o admin muda o grupo, a batida não muda)
    execute format('drop trigger if exists ultimo_carimbo_de_alteracao on public.%I', tabela);
    execute format(
      'create trigger ultimo_carimbo_de_alteracao before insert or update on public.%I '
      'for each row execute function public.carimbar_alteracao()',
      tabela);
    execute format('create index if not exists %I on public.%I (alterado_em)', tabela || '_por_alteracao', tabela);
  end loop;
end
$$;

-- 2. O RESUMO

create or replace function public.resumo_da_sincronizacao(
  p_tabela text,
  p_inicio date default null,
  p_fim    date default null
)
returns table (quantidade bigint, marca timestamptz, assinatura text)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  -- Nome desconhecido não pode virar "zero linhas": o aparelho apagaria tudo
  if p_tabela is null or p_tabela not in (
    'registros_ponto', 'ajustes_jornada', 'justificativas_ausencia', 'afastamentos',
    'mensagens', 'leituras_mensagem', 'participantes', 'conversas'
  ) then
    raise exception 'Tabela fora da sincronização: %', p_tabela;
  end if;

  return query
  with chaves (chave, alterado_em) as (
    select t.id, t.alterado_em from public.registros_ponto t
     where p_tabela = 'registros_ponto'
       and (p_inicio is null or t.data >= p_inicio) and (p_fim is null or t.data <= p_fim)
    union all
    select t.id, t.alterado_em from public.ajustes_jornada t
     where p_tabela = 'ajustes_jornada'
       and (p_inicio is null or t.data >= p_inicio) and (p_fim is null or t.data <= p_fim)
    union all
    select t.id, t.alterado_em from public.justificativas_ausencia t
     where p_tabela = 'justificativas_ausencia'
    union all
    select t.id, t.alterado_em from public.afastamentos t
     where p_tabela = 'afastamentos'
    union all
    select t.id, t.alterado_em from public.mensagens t
     where p_tabela = 'mensagens'
    union all
    select t.mensagem_id || '|' || t.colaborador_id, t.alterado_em from public.leituras_mensagem t
     where p_tabela = 'leituras_mensagem'
    union all
    select t.conversa_id || '|' || t.colaborador_id, t.alterado_em from public.participantes t
     where p_tabela = 'participantes'
    union all
    select t.id, t.alterado_em from public.conversas t
     where p_tabela = 'conversas'
  )
  -- A assinatura é o SHA-256 dos ids em ordem de byte (collate "C"), a mesma
  -- ordem do sort() do JavaScript: o aparelho consegue refazer a conta
  select count(*),
         max(c.alterado_em),
         encode(sha256(convert_to(coalesce(string_agg(c.chave, ',' order by c.chave collate "C"), ''), 'UTF8')), 'hex')
    from chaves c;
end;
$$;

revoke all on function public.resumo_da_sincronizacao(text, date, date) from public, anon;
grant execute on function public.resumo_da_sincronizacao(text, date, date) to authenticated;

notify pgrst, 'reload schema';

-- CONFERÊNCIA: uma linha por tabela. "sim / sim" e o total de linhas
-- (aqui, sem RLS, é a tabela inteira; no aparelho, só o que a pessoa enxerga)
select t.tabela,
       case when exists (
         select 1 from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = t.tabela and c.column_name = 'alterado_em'
       ) then 'sim' else 'NÃO' end as tem_alterado_em,
       case when exists (
         select 1 from pg_trigger g
          where g.tgrelid = ('public.' || t.tabela)::regclass and g.tgname = 'ultimo_carimbo_de_alteracao'
       ) then 'sim' else 'NÃO' end as tem_carimbo,
       r.quantidade as linhas
  from unnest(array[
    'registros_ponto', 'ajustes_jornada', 'justificativas_ausencia', 'afastamentos',
    'mensagens', 'leituras_mensagem', 'participantes', 'conversas'
  ]) as t(tabela)
  cross join lateral public.resumo_da_sincronizacao(t.tabela) r
 order by t.tabela;
