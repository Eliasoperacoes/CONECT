-- ============================================================
-- "VOCÊ AINDA NÃO BATEU O PONTO" — PASSO 2: conferir e ligar (07/10/2026)
--
-- Rode uns segundos depois do passo 1. A primeira consulta mostra a
-- resposta da simulação: precisa ter "hoje" com a data de hoje e
-- "batidas" com as do dia, sem "erro". Se vier erro, PARE: não agende.
--
-- O agendamento: de 5 em 5 minutos, das 06:00 às 19:55 de Brasília
-- (09:00–22:55 UTC), de segunda a sábado. O primeiro turno entra 07:30 e
-- a última saída é 18:00; o alerta sai até 10 minutos depois. Cada
-- chamada só avisa as marcações cuja janela de 5 minutos é a dela, então
-- ninguém recebe o mesmo alerta duas vezes.
--
-- Pode rodar de novo: troca o agendamento antigo pelo novo.
-- ============================================================

select
  r.status_code,
  r.content::jsonb ->> 'hoje' as hoje,
  r.content::jsonb ->> 'batidas' as batidas_de_hoje,
  r.content::jsonb ->> 'alertas' as alertas_agora,
  r.content::jsonb ->> 'erro' as erro,
  r.created
from net._http_response r
order by r.created desc
limit 1;

select cron.unschedule('alertar-sem-bater')
 where exists (select 1 from cron.job where jobname = 'alertar-sem-bater');

select cron.schedule(
  'alertar-sem-bater',
  '*/5 9-22 * * 1-6',
  $$
  select net.http_post(
    url := 'URL_DO_PROJETO/functions/v1/lembrar-pendencias?semBater=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Conferência: o agendamento existe, ativo, de 5 em 5 minutos (09–22 UTC, seg a sáb)
select jobname, schedule, active
from cron.job
where jobname in ('alertar-sem-bater', 'lembrar-pendencias')
order by jobname;
