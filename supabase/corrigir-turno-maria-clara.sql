-- ============================================================
-- A MARIA CLARA É DO TURNO B (01/10/2026)
--
-- A ficha estava no Turno A (entrada 07:30), confirmado em 30/09. Ela
-- entrou às 08:15 — cinco minutos antes das 08:20 do turno B — e o
-- sistema, medindo contra 07:30, cobrou 45 minutos de atraso.
--
-- Só dado; pode rodar de novo sem efeito. O gatilho
-- `turno_escolhido_uma_vez` aceita a troca vinda do SQL Editor e grava
-- a nova confirmação.
-- ============================================================

update public.colaboradores
   set turno = 'B'
 where nome ilike '%maria clara mafra%';

-- Conferência: turno B, confirmado agora
select nome, turno, turno_confirmado_em
from public.colaboradores
where nome ilike '%maria clara mafra%';
