-- ============================================================
-- OS ERROS DO APLICATIVO (20/10/2026) — SÓ LEITURA
--
-- Os erros que as telas registraram (erros-do-app.sql), agrupados: o mesmo
-- erro na mesma tela vira uma linha, com quantas vezes, em quantas pessoas e
-- quando foi a última. A primeira linha é a que mais aconteceu.
-- ============================================================

select tela,
       mensagem,
       count(*)                         as vezes,
       count(distinct colaborador_id)   as pessoas,
       max(ocorrido_em)                 as ultima_vez,
       max(versao)                      as versao,
       (array_agg(left(pilha, 300) order by ocorrido_em desc))[1] as inicio_da_pilha
  from public.erros_do_app
 where ocorrido_em > now() - interval '7 days'
 group by tela, mensagem
 order by vezes desc, ultima_vez desc
 limit 50;
