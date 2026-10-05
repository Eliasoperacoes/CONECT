-- ============================================================
-- O SÁBADO DO ESTÁGIO QUE ENTROU COMO HORA EXTRA — CONECTA
--
-- Relato do Elias (05/10/2026): o sábado 03/10 dos estagiários de 5h
-- contou como hora extra — e foi aprovado. Os turnos E2 e E3 diziam que
-- o estagiário não vem ao sábado, então o sábado previa zero e as 4h
-- trabalhadas viravam 4h de extra. Corrigido na regra (o turno de 5h vem
-- ao sábado, 4h previstas); isto acerta o que já tinha sido lançado.
--
-- Dia aprovado não reabre sozinho, por isso o acerto é aqui. Medido com a
-- regra do sistema, cada um desses sábados fecha com saldo ZERO (todos
-- dentro da tolerância): a linha é reescrita com zero minutos, aprovada —
-- reescrever, e não apagar, guarda o histórico de que o dia teve outro
-- número (ver apuracao-pode-zerar.sql).
--
-- Só toca o sábado de estagiário E2/E3, lançado como hora extra com
-- previsto zero, a partir de 01/10, e com o trabalhado a até 10 minutos
-- das 4h: um sábado com hora extra de verdade não é apagado por engano.
-- Rodar de novo não muda nada.
-- ============================================================

update public.ajustes_jornada a
   set minutos           = 0,
       minutos_previstos = 240,
       observacao        = 'Sábado do estágio de 5h: previsto 4h (era 0, lançado como hora extra). Reapurado em 05/10/2026.'
  from public.colaboradores c
 where c.id = a.colaborador_id
   and c.turno in ('E2', 'E3')
   and c.trabalha_sabado is distinct from false
   and extract(isodow from a.data) = 6
   and a.data >= date '2026-10-01'
   and a.tipo = 'hora_extra'
   and a.minutos_previstos = 0
   and abs(a.minutos_trabalhados - 240) <= 10;

-- ============================================================
-- CONFERÊNCIA — o que esperar
--
-- Devilin, Dexter, Isaac e João Felipe, sábado 03/10:
-- minutos 0 · previstos 240 · estado aprovado · a observação acima.
-- Nenhuma linha com previsto 0.
-- ============================================================
select c.nome, c.turno, a.data, a.tipo, a.minutos,
       a.minutos_trabalhados, a.minutos_previstos, a.estado, a.observacao
  from public.ajustes_jornada a
  join public.colaboradores c on c.id = a.colaborador_id
 where c.turno in ('E2', 'E3')
   and extract(isodow from a.data) = 6
   and a.data >= date '2026-10-01'
 order by a.data, c.nome;
