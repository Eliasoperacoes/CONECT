-- ============================================================
-- LEMBRETES DO DIA — PASSO 3: ligar (02/10/2026)
--
-- Rode só depois de conferir a simulação (passo 2). A partir daqui, todo
-- dia às 09:00 de Brasília (12:00 UTC) a função lembra, até resolver:
-- o holerite não assinado, o documento do RH sem ciência e a publicação
-- que pede confirmação. Um aviso por assunto por pessoa.
--
-- Pode rodar de novo: troca o agendamento antigo pelo novo.
-- ============================================================

select cron.unschedule('lembrar-pendencias')
 where exists (select 1 from cron.job where jobname = 'lembrar-pendencias');

select cron.schedule(
  'lembrar-pendencias',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'URL_DO_PROJETO/functions/v1/lembrar-pendencias',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Conferência: o agendamento existe, ativo, às 12:00 UTC (09:00 em Brasília)
select jobname, schedule, active
from cron.job
where jobname = 'lembrar-pendencias';
