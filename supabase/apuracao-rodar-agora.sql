-- ============================================================
-- APURAÇÃO DO PONTO — RODAR AGORA, sem esperar a madrugada
--
-- ALTERA o que a madrugada alteraria: apura os últimos 35 dias da rede
-- (falta do dia sem batida, dia que se resolveu, dia fechado que não
-- chegou à fila) e fecha a compensação do sábado do mês anterior. É a
-- MESMA chamada do agendamento (apuracao-3-agendar.sql), com o segredo
-- que já está no cofre — só que agora.
--
-- Serve depois de publicar uma regra nova em `apurar-ponto`: o efeito
-- aparece na hora, e não às 03:00. Rodar duas vezes não duplica nada — a
-- apuração só grava o que mudou.
--
-- A RESPOSTA CHEGA DEPOIS: o pedido sai quando este script termina. Espere
-- uns 30 segundos e rode o `select` do fim do arquivo SOZINHO (selecione
-- só ele e rode) — ele mostra o que a função respondeu.
-- ============================================================

select net.http_post(
  url := 'URL_DO_PROJETO/functions/v1/apurar-ponto',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-apurar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'apurar_segredo')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) as pedido_enviado;

-- ------------------------------------------------------------
-- DEPOIS DE ~30 SEGUNDOS, rode só isto: a resposta da função
-- (status 200 e o resumo: pessoas, dias, faltas, apurados).
-- ------------------------------------------------------------
-- select id, status_code, left(content::text, 400) as resposta, created
--   from net._http_response
--  order by id desc
--  limit 1;
