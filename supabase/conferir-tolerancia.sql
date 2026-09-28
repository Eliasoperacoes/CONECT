-- ============================================================
-- CONECTA — QUANTO DO BANCO DE HORAS VEIO DA TOLERÂNCIA
--
-- ESTE ARQUIVO NÃO ALTERA NADA. São duas consultas.
--
-- O QUE SE ESTÁ PROCURANDO
--
-- O art. 58 §1º da CLT: variações de até 5 minutos por marcação,
-- observado o limite de 10 minutos diários, "NÃO SERÃO DESCONTADAS NEM
-- COMPUTADAS como jornada extraordinária".
--
-- O sistema conhece a regra — ela está escrita no código, com o artigo
-- citado — e faz o contrário: quando a variação cabe na tolerância, ele
-- grava o valor CHEIO como ajuste já APROVADO, e esse valor entra no
-- saldo da pessoa.
--
-- Medido em código: quem sai 3 minutos mais cedo todo dia acumula
-- −0h15 por semana. Em 190 dias úteis, −9h30. São minutos que a lei
-- proíbe descontar.
--
-- Estas consultas dizem de quanto se está falando na rede real, e
-- quanto do saldo de cada pessoa sumiria se essa parte não existisse.
-- ============================================================

-- ============================================================
-- 1. POR PESSOA — quem tem saldo, e quanto dele veio da tolerância
--
-- `saldo_aprovado` é o que a pessoa vê hoje no banco de horas.
-- `da_tolerancia` é a parte que a lei manda não contar.
-- `saldo_sem_tolerancia` é como ficaria.
-- ============================================================
with sinal as (
  select
    a.colaborador_id,
    a.origem,
    a.estado,
    case when a.tipo = 'debito' then -a.minutos else a.minutos end as com_sinal
    from public.ajustes_jornada a
)
select
  c.nome,
  c.setor,
  c.loja,
  c.turno,

  coalesce(sum(s.com_sinal) filter (where s.estado = 'aprovado'), 0)
    as saldo_aprovado_min,

  coalesce(sum(s.com_sinal) filter (
    where s.estado = 'aprovado' and s.origem = 'tolerancia_automatica'
  ), 0) as da_tolerancia_min,

  coalesce(sum(s.com_sinal) filter (
    where s.estado = 'aprovado' and s.origem is distinct from 'tolerancia_automatica'
  ), 0) as saldo_sem_tolerancia_min,

  count(*) filter (
    where s.estado = 'aprovado' and s.origem = 'tolerancia_automatica'
  ) as dias_de_tolerancia

  from public.colaboradores c
  join sinal s on s.colaborador_id = c.id
 group by c.nome, c.setor, c.loja, c.turno
having coalesce(sum(s.com_sinal) filter (where s.estado = 'aprovado'), 0) <> 0
 order by coalesce(sum(s.com_sinal) filter (where s.estado = 'aprovado'), 0) asc
 limit 40;

-- ============================================================
-- 2. A REDE INTEIRA, em uma linha
--
-- Se `da_tolerancia_horas` for uma fatia grande de `saldo_total_horas`,
-- o banco de horas da rede está medindo, em boa parte, minutos que a
-- lei manda ignorar.
-- ============================================================
with sinal as (
  select
    a.origem,
    a.estado,
    case when a.tipo = 'debito' then -a.minutos else a.minutos end as com_sinal
    from public.ajustes_jornada a
   where a.estado = 'aprovado'
)
select
  count(*)                                              as ajustes_aprovados,
  count(*) filter (where origem = 'tolerancia_automatica')
                                                        as pela_tolerancia,

  (sum(com_sinal) / 60) || 'h' ||
    lpad(abs(sum(com_sinal) % 60)::text, 2, '0')        as saldo_total_horas,

  (coalesce(sum(com_sinal) filter (where origem = 'tolerancia_automatica'), 0) / 60)
    || 'h' || lpad(
      abs(coalesce(sum(com_sinal) filter (where origem = 'tolerancia_automatica'), 0) % 60)::text,
      2, '0')                                           as da_tolerancia_horas,

  (coalesce(sum(com_sinal) filter (where origem is distinct from 'tolerancia_automatica'), 0) / 60)
    || 'h' || lpad(
      abs(coalesce(sum(com_sinal) filter (where origem is distinct from 'tolerancia_automatica'), 0) % 60)::text,
      2, '0')                                           as saldo_sem_tolerancia_horas
  from sinal;
