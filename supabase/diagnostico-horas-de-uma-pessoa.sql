-- ============================================================
-- QUEM DECIDIU AS HORAS DE UMA PESSOA (26/10/2026) — SÓ LEITURA
--
-- Cada dia apurado dos últimos 60 dias: hora extra, débito ou dia
-- incompleto, o estado, de onde veio (fila ou correção de batida) e quem
-- decidiu, com data e hora. Troque o nome no `ilike` para outra pessoa.
-- ============================================================

select c.nome,
       a.data,
       a.tipo,
       a.minutos,
       a.estado,
       a.origem,
       coalesce(a.aprovador_nome, '—')                                as quem_decidiu,
       to_char(a.decidido_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando
  from public.ajustes_jornada a
  join public.colaboradores c on c.id = a.colaborador_id
 where (c.nome ilike '%maria%clar%' or c.nome ilike '%maria%claro%')
   and a.data >= current_date - 60
 order by c.nome, a.data desc;
