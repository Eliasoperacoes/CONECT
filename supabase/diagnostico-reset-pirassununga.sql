-- ============================================================
-- DIAGNÓSTICO: QUEM ENTRA NO RESET DE PIRASSUNUNGA (15/10/2026)
--
-- O Elias quer zerar as horas de quem está sem bater ponto em
-- Pirassununga e responde ao Fabio (gerente) ou à Dani (RH), para o
-- ponto começar de verdade com a loja inteira. Antes de apagar qualquer
-- coisa, esta lista mostra QUEM seria atingido e O QUE cada um tem hoje.
--
-- Só leitura. Não mexe em nada.
-- ============================================================
select
  c.nome,
  r.nome                                                            as responde_a,
  (select count(*) from public.registros_ponto p
    where p.colaborador_id = c.id and p.data >= '2026-10-01')       as batidas_desde_01_10,
  (select max(p.data) from public.registros_ponto p
    where p.colaborador_id = c.id)                                  as ultima_batida,
  (select count(*) from public.ajustes_jornada a
    where a.colaborador_id = c.id and a.estado = 'pendente')        as pendencias_na_fila,
  (select coalesce(sum(case when a.tipo = 'hora_extra' then a.minutos else -a.minutos end), 0)
     from public.ajustes_jornada a
    where a.colaborador_id = c.id and a.estado = 'aprovado')         as saldo_aprovado_minutos
from public.colaboradores c
join public.colaboradores r on r.id = c.responsavel_id
where c.ativo
  and c.loja = 'Pirassununga'
  and (r.nome ilike 'fabio%' or r.nome ilike 'dani%')
order by r.nome, c.nome;
