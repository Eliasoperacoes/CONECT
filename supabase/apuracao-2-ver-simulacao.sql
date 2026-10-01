-- ============================================================
-- APURAÇÃO NO SERVIDOR — PASSO 2: ler a simulação (01/10/2026)
--
-- Só leitura. Rode uns 20 segundos depois do passo 1. Mostra a resposta
-- da função: quantas pessoas e dias revisou, quantas faltas e apurações
-- GRAVARIA, e a lista (quem · dia · tipo minutos · estado).
--
-- status_code 200 = a simulação rodou. 401 = o segredo do cofre não bate
-- com o da função. Sem linha nenhuma = ainda não respondeu: espere e rode
-- de novo.
-- ============================================================

select
  r.status_code,
  r.content::jsonb ->> 'revisados' as revisados,
  r.content::jsonb ->> 'pessoas' as pessoas,
  r.content::jsonb ->> 'faltas' as faltas,
  r.content::jsonb ->> 'apurados' as apurados,
  r.content::jsonb ->> 'novosNaFila' as novos_na_fila,
  r.content::jsonb -> 'seriaGravado' as seria_gravado,
  r.content::jsonb ->> 'erro' as erro,
  r.created
from net._http_response r
order by r.created desc
limit 1;
