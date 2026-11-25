-- ============================================================
-- SALDO DO BANCO DE HORAS DE UMA PESSOA (25/11/2026) — SÓ LEITURA
--
-- A mesma conta da tela (obterSaldoAcumulado, ponto.ts): soma só o que foi
-- APROVADO; débito entra negativo, dia incompleto conta zero. O pendente
-- vem à parte — ainda não é saldo, espera alguém decidir.
--
-- Para outra pessoa, troque 'l_via%' pelo começo do nome. O '_' aceita
-- qualquer letra: pega Lyvia, Livia e Lívia.
--
-- Uma consulta só, de propósito: o SQL Editor mostra apenas a última.
-- ============================================================
with lancamentos as (
  select a.colaborador_id,
         a.estado,
         a.data,
         case
           when a.tipo = 'dia_incompleto' then 0
           when a.tipo = 'debito'         then -a.minutos
           else a.minutos
         end as minutos_com_sinal
    from public.ajustes_jornada a
),
por_pessoa as (
  select c.nome,
         c.loja,
         c.ativo,
         coalesce(sum(l.minutos_com_sinal) filter (where l.estado = 'aprovado'), 0) as saldo_min,
         coalesce(sum(l.minutos_com_sinal) filter (where l.estado = 'pendente'), 0) as pendente_min,
         count(*) filter (where l.estado = 'aprovado' and l.minutos_com_sinal > 0) as dias_credito,
         count(*) filter (where l.estado = 'aprovado' and l.minutos_com_sinal < 0) as dias_debito,
         count(*) filter (where l.estado = 'pendente')                              as dias_pendentes,
         min(l.data) filter (where l.estado = 'aprovado')                           as desde
    from public.colaboradores c
    left join lancamentos l on l.colaborador_id = c.id
   where c.nome ilike 'l_via%'
   group by c.id, c.nome, c.loja, c.ativo
)
select nome,
       loja,
       ativo,
       case when saldo_min < 0 then '-' else '+' end
         || (abs(saldo_min) / 60) || 'h' || lpad((abs(saldo_min) % 60)::text, 2, '0')   as saldo_banco_de_horas,
       saldo_min                                                                         as saldo_em_minutos,
       case when pendente_min < 0 then '-' else '+' end
         || (abs(pendente_min) / 60) || 'h' || lpad((abs(pendente_min) % 60)::text, 2, '0') as esperando_decisao,
       dias_credito,
       dias_debito,
       dias_pendentes,
       desde
  from por_pessoa
 order by ativo desc, nome;
