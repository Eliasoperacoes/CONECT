-- ============================================================
-- QUANTO CUSTA UMA SINCRONIZAÇÃO DO CHAT
--
-- Só leitura: não altera nada.
--
-- Hoje, a cada rajada de eventos, TODO aparelho conectado baixa tudo o que
-- estas consultas mostram. Elas dizem se isso ainda cabe ou se já passou da
-- hora de ler só o que mudou.
-- ============================================================

-- 1. O TAMANHO DO QUE SE BAIXA A CADA SINCRONIZAÇÃO
select
  (select count(*) from public.mensagens)           as mensagens,
  (select count(*) from public.leituras_mensagem)   as marcacoes_de_leitura,
  (select count(*) from public.conversas)           as conversas,
  (select count(*) from public.participantes)       as participantes,
  (select count(*) from public.mensagens
    where anexo_caminho is not null)                as anexos_a_assinar,
  pg_size_pretty(pg_total_relation_size('public.mensagens'))
                                                    as peso_das_mensagens,
  pg_size_pretty(pg_total_relation_size('public.leituras_mensagem'))
                                                    as peso_das_leituras;

-- 2. O RITMO: quantos eventos de tempo real por dia, nos últimos 7 dias.
--    Cada linha destas é uma sincronização completa em CADA aparelho ligado.
select
  date(criado_em)  as dia,
  count(*)         as mensagens_no_dia
from public.mensagens
where criado_em >= current_date - interval '7 days'
group by 1
order by 1 desc;

-- 3. O MULTIPLICADOR. As marcações de leitura são o que mais dispara evento,
--    e ninguém as vê. Se este número for muito maior que o de mensagens, é
--    aqui que está o custo.
select
  count(*)                                          as marcacoes,
  round(
    count(*)::numeric
    / nullif((select count(*) from public.mensagens), 0),
    1
  )                                                 as marcacoes_por_mensagem
from public.leituras_mensagem;

-- 4. Quanto do histórico é RECENTE. Se a conversa viva for uma fatia pequena
--    do total, baixar tudo é desperdício quase puro.
select
  count(*) filter (where criado_em >= now() - interval '7 days')   as ultimos_7_dias,
  count(*) filter (where criado_em >= now() - interval '30 days')  as ultimos_30_dias,
  count(*)                                                        as tudo
from public.mensagens;
