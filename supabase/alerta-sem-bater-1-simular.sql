-- ============================================================
-- "VOCÊ AINDA NÃO BATEU O PONTO" — PASSO 1: simular (07/10/2026)
--
-- Antes: publicar de novo a função `lembrar-pendencias` (o arquivo
-- supabase/functions/lembrar-pendencias/index.ts, colado inteiro).
--
-- Pede à função o que ela AVISARIA AGORA, sem avisar ninguém. Num minuto
-- qualquer, o normal é "alertas": 0 — o alerta de cada marcação só sai
-- nos 5 minutos depois da tolerância. O que conta é a função responder
-- com "hoje" e o número de batidas do dia (passo 2).
-- ============================================================

select net.http_post(
  url := 'URL_DO_PROJETO/functions/v1/lembrar-pendencias?semBater=1&simular=1',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as pedido;
