-- ============================================================
-- OS DIAS COM BATIDA FALTANDO, PERGUNTADOS AO BANCO (01/10/2026)
--
-- "Pontos incompletos" (Equipe e ponto), o aviso de Espelhos de ponto e o
-- cartão do painel do RH liam as batidas do CACHE do aparelho — uma janela
-- que as telas trocam. A lista oscilava, e quem abria o espelho de outubro
-- não via os dias de setembro sem fechar.
--
-- Esta função devolve só os dias que têm ALGUMA batida e menos de quatro:
-- quem, quando, e quais batidas existem. O aplicativo decide o que falta
-- (o estagiário de 2 batidas não está incompleto). SECURITY INVOKER: a
-- segurança de registros_ponto vale — o RH vê a rede, o líder a equipe.
--
-- Este arquivo é o delta; o esquema inteiro está em esquema.sql.
-- ============================================================

create or replace function public.dias_com_batida_incompleta(inicio date, fim date)
returns table (colaborador_id text, data date, tipos text[], horas text[])
language sql
stable
security invoker
set search_path = public
as $$
  select r.colaborador_id,
         r.data,
         array_agg(r.tipo order by r.horario),
         array_agg(r.hora_formatada order by r.horario)
    from public.registros_ponto r
   where r.data between inicio and fim
   group by r.colaborador_id, r.data
  having count(*) < 4;
$$;

grant execute on function public.dias_com_batida_incompleta(date, date) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: a função existe, e quantos dias de setembro estão incompletos
-- (contando também os do estágio de 2 batidas, que o aplicativo descarta)
select
  (select count(*) from pg_proc where proname = 'dias_com_batida_incompleta') as funcao_criada,
  (select count(*) from public.dias_com_batida_incompleta('2026-09-01', '2026-09-30')) as dias_de_setembro;
