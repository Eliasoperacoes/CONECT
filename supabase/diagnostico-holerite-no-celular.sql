-- ============================================================
-- POR QUE O HOLERITE NÃO ABRE (OU NÃO MOSTRA "ASSINAR") NO CELULAR
-- (21/10/2026) — SÓ LEITURA
--
-- Marcos Penteado: o arquivo não abre e não aparece a opção de assinar.
-- Accacio: o arquivo aparece, mas não a opção de assinar.
--
-- Uma linha por pessoa: se tem o aplicativo Android instalado (aparelhos),
-- o navegador do último erro registrado, os erros dos últimos 14 dias, e os
-- holerites com e sem assinatura. Troque os nomes no `ilike` se precisar.
-- ============================================================

with pessoas as (
  select id, nome
    from public.colaboradores
   where nome ilike '%penteado%' or nome ilike '%ac_cio%' or nome ilike '%acc%cio%'
)
select p.nome,
       (select count(*) from public.aparelhos a where a.colaborador_id = p.id)          as aparelhos_no_app,
       (select e.navegador from public.erros_do_app e
         where e.colaborador_id = p.id order by e.ocorrido_em desc limit 1)            as navegador,
       (select count(*) from public.erros_do_app e
         where e.colaborador_id = p.id and e.ocorrido_em > now() - interval '14 days') as erros_14_dias,
       (select string_agg(distinct left(e.tela || ': ' || e.mensagem, 160), ' | ')
          from public.erros_do_app e
         where e.colaborador_id = p.id and e.ocorrido_em > now() - interval '14 days')  as quais_erros,
       (select count(*) from public.holerites h where h.colaborador_id = p.id)          as holerites,
       (select count(*) from public.recebimentos_holerite r where r.colaborador_id = p.id) as assinados
  from pessoas p
 order by p.nome;
