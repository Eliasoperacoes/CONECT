-- ============================================================
-- APURAÇÃO NO SERVIDOR — PASSO 1: preparar e SIMULAR (01/10/2026)
--
-- Antes de rodar: a função `apurar-ponto` publicada (Edge Functions →
-- Deploy via Editor, "Verify JWT" desligado) e o segredo APURAR_SEGREDO
-- gravado em Edge Functions → Secrets — o MESMO valor que vai abaixo.
--
-- Este passo:
--   1. liga o agendador (pg_cron) e as chamadas de saída (pg_net);
--   2. guarda o segredo no cofre do banco, para o agendador usar;
--   3. chama a função em modo SIMULAÇÃO: ela calcula o que gravaria nos
--      últimos 35 dias e NÃO grava nada. A resposta chega em alguns
--      segundos e é lida no passo 2.
--
-- Os dois valores em MAIÚSCULAS são trocados na hora de entregar: o
-- arquivo do repositório não guarda o segredo.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from vault.secrets where name = 'apurar_segredo') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'apurar_segredo'),
      'COLE_O_SEGREDO'
    );
  else
    perform vault.create_secret('COLE_O_SEGREDO', 'apurar_segredo', 'Chave da função apurar-ponto');
  end if;
end
$$;

select net.http_post(
  url := 'URL_DO_PROJETO/functions/v1/apurar-ponto?simular=1',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
);

-- Conferência: as duas extensões ligadas e o segredo no cofre
select
  (select count(*) from pg_extension where extname in ('pg_cron', 'pg_net')) as extensoes_ligadas,
  (select count(*) from vault.secrets where name = 'apurar_segredo') as segredo_guardado;
