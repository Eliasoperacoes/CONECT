-- ============================================================
-- A CARGA HORÁRIA DE CADA UM — UMA CONSULTA SÓ
-- CONECTA / Malachias Autopeças
--
-- Não altera nada. Só mostra o que está cadastrado.
--
-- ------------------------------------------------------------
-- POR QUE PRECISO DISTO ANTES DE MEXER
-- ------------------------------------------------------------
--
-- Duas perguntas em aberto, e as duas dependem do que está na ficha:
--
--   1. A Fernanda bateu 07:30 · 12:30 · 14:00 · 17:10 — que é o Turno A
--      exato, 8h10 — e o sistema acusou 33 minutos de falta. O cálculo do
--      dia está certo (saída − entrada − intervalo = 8h10), então o que
--      não bate é o PREVISTO, que sai da ficha dela.
--
--   2. Os estagiários. Uns fazem 6h de segunda a sexta e não vêm no
--      sábado; outros fazem menos e compensam no sábado. Para escrever
--      essa regra preciso saber o que já está cadastrado para cada um.
--
-- A coluna `carga_horaria_diaria_minutos` tem DEFAULT 480 no banco. Se
-- todo mundo estiver com 480, o valor não é uma escolha do RH — é o
-- banco preenchendo sozinho, e a regra não pode confiar nele.
-- ============================================================

select
  c.nome,
  c.setor,
  c.cargo,
  c.turno,

  -- O previsto do dia útil sai daqui
  c.carga_horaria_diaria_minutos as diaria_min,
  (c.carga_horaria_diaria_minutos / 60) || 'h' ||
    lpad((c.carga_horaria_diaria_minutos % 60)::text, 2, '0') as diaria,

  -- Nulo quer dizer "vale o padrão"; preenchido é escolha do RH
  c.carga_semanal_minutos as semanal_min,
  case
    when c.carga_semanal_minutos is null then '(padrão)'
    else (c.carga_semanal_minutos / 60) || 'h' ||
         lpad((c.carga_semanal_minutos % 60)::text, 2, '0')
  end as semanal,

  case
    when c.trabalha_sabado is null then '(padrão)'
    when c.trabalha_sabado then 'SIM'
    else 'não'
  end as sabado,

  case
    when c.tem_intervalo is null then '(padrão)'
    when c.tem_intervalo then 'sim'
    else 'NÃO'
  end as intervalo,

  case
    when c.carga_horaria_diaria_minutos = 480 then 'suspeito: 480 é o padrão do banco'
    when c.carga_horaria_diaria_minutos = 490 then 'ok: 8h10, o turno da rede'
    else 'próprio'
  end as observacao

from public.colaboradores c
where c.ativo
  and (
    -- A Fernanda, por causa dos 33 minutos
    c.nome ilike '%fernanda%'
    -- Os estagiários, por causa da regra nova
    or c.setor ilike '%estági%'
    or c.setor ilike '%estagi%'
    or c.cargo ilike '%estagi%'
    -- E uma amostra de quem cumpre turno inteiro, para comparar
    or c.nome ilike '%lyvia%'
    or c.nome ilike '%aline%'
    or c.nome ilike '%leigislaine%'
  )
order by
  case when c.setor ilike '%stagi%' or c.cargo ilike '%stagi%' then 0 else 1 end,
  c.nome;
