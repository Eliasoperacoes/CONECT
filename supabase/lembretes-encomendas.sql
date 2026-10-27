-- ============================================================
-- LEMBRETES DAS ENCOMENDAS (SPEC-comunicacao-recebimento, 26/10/2026)
--
-- AINDA NÃO RODAR NA PRODUÇÃO: sobe junto com o resto do cotador, DEPOIS
-- de publicar de novo a função `lembrar-pendencias` (o arquivo
-- supabase/functions/lembrar-pendencias/index.ts, colado inteiro).
--
-- Rode em DUAS vezes, separadas por uns segundos:
--
--   1) só o bloco "SIMULAR" — pede à função o que ela lembraria agora,
--      sem lembrar ninguém;
--   2) o resto — mostra a resposta da simulação (precisa ter "encomendas"
--      sem "erro"; se vier erro, PARE: não agende) e liga o agendamento.
--
-- O agendamento: de hora em hora, das 07:00 às 19:00 de Brasília
-- (10–22 UTC), de segunda a sábado. Cada lembrete tem a janela de 1 hora
-- dele, então ninguém recebe o mesmo lembrete duas vezes no dia. O resumo
-- de Compras sai na chamada das 9h.
--
-- Pode rodar de novo: troca o agendamento antigo pelo novo.
-- ============================================================

-- 1) SIMULAR
select net.http_post(
  url := 'URL_DO_PROJETO/functions/v1/lembrar-pendencias?encomendas=1&simular=1',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as pedido;

-- 2) CONFERIR A SIMULAÇÃO E AGENDAR
select
  r.status_code,
  r.content::jsonb ->> 'encomendas' as encomendas_em_andamento,
  r.content::jsonb ->> 'lembretes' as lembretes_agora,
  r.content::jsonb ->> 'erro' as erro,
  r.created
from net._http_response r
order by r.created desc
limit 1;

select cron.unschedule('lembrar-encomendas')
 where exists (select 1 from cron.job where jobname = 'lembrar-encomendas');

select cron.schedule(
  'lembrar-encomendas',
  '0 10-22 * * 1-6',
  $$
  select net.http_post(
    url := 'URL_DO_PROJETO/functions/v1/lembrar-pendencias?encomendas=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Conferência: o agendamento existe e está ativo
select jobname, schedule, active
from cron.job
where jobname in ('lembrar-encomendas', 'alertar-sem-bater', 'lembrar-pendencias')
order by jobname;
