-- ============================================================
-- APURAÇÃO NO SERVIDOR — PASSO 3: ligar a madrugada (01/10/2026)
--
-- Rode só depois de conferir a simulação (passo 2). A partir daqui, todo
-- dia às 03:00 de Brasília (06:00 UTC) a função apura os últimos 35 dias
-- da rede: cria a falta do dia sem batida, reapura o dia que se resolveu,
-- e transforma em pedido o dia fechado que nunca chegou à fila.
--
-- Pode rodar de novo: troca o agendamento antigo pelo novo.
-- ============================================================

select cron.unschedule('apurar-ponto')
 where exists (select 1 from cron.job where jobname = 'apurar-ponto');

select cron.schedule(
  'apurar-ponto',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'URL_DO_PROJETO/functions/v1/apurar-ponto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Conferência: o agendamento existe, ativo, às 06:00 UTC (03:00 em Brasília)
select jobname, schedule, active
from cron.job
where jobname = 'apurar-ponto';
