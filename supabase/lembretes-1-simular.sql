-- ============================================================
-- LEMBRETES DO DIA — PASSO 1: SIMULAR (02/10/2026)
--
-- Antes de rodar: a função `lembrar-pendencias` publicada (Edge Functions
-- → Deploy via Editor, "Verify JWT" desligado) e a `enviar-aviso`
-- publicada de novo (ela ganhou a entrega agendada).
--
-- O segredo é o MESMO da apuração da madrugada, que já está no cofre
-- (`apurar_segredo`) e nos Secrets das funções (APURAR_SEGREDO).
--
-- Chama a função em modo SIMULAÇÃO: ela diz quem seria lembrado de quê e
-- NÃO envia nada. A resposta é lida no passo 2.
--
-- O valor em MAIÚSCULAS é trocado na hora de entregar.
-- ============================================================

select net.http_post(
  url := 'URL_DO_PROJETO/functions/v1/lembrar-pendencias?simular=1',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as pedido;
