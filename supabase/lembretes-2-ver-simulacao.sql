-- ============================================================
-- LEMBRETES DO DIA — PASSO 2: ler a simulação (02/10/2026)
--
-- Só leitura. Rode uns 10 segundos depois do passo 1. Mostra o que a
-- função leu do banco e a lista de quem seria lembrado
-- (nome · assunto · texto do aviso).
--
-- status_code 200 = a simulação rodou. 401 = o segredo do cofre não bate
-- com o da função. 404 = a função `lembrar-pendencias` não foi publicada.
-- Sem linha nenhuma = ainda não respondeu: espere e rode de novo.
-- ============================================================

select
  r.status_code,
  r.content::jsonb -> 'lidos' as lidos,
  r.content::jsonb ->> 'semAssinaturas' as sem_assinaturas,
  r.content::jsonb ->> 'lembretes' as lembretes,
  r.content::jsonb -> 'seriaEnviado' as seria_enviado,
  r.content::jsonb ->> 'erro' as erro,
  r.created
from net._http_response r
order by r.created desc
limit 1;
