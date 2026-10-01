-- ============================================================
-- EM QUE DIAS CADA PESSOA BATEU, uma linha por pessoa (01/10/2026)
--
-- O espelho incompleto contava só os dias que começaram e não fecharam.
-- Quem bateu uma vez em setembro aparecia com "1 dia", e os outros 28
-- dias de trabalho sem batida nenhuma não entravam. O Elias viu.
--
-- Para contar o dia vazio o aplicativo precisa saber em que dias cada um
-- bateu. Baixar as batidas da rede de dois meses seria dezenas de milhares
-- de linhas; aqui volta uma linha por pessoa, com a lista de dias. Quais
-- dias ESPERAVAM batida (turno, folga, feriado, ausência) o aplicativo
-- decide. SECURITY INVOKER: a segurança de registros_ponto vale.
--
-- Este arquivo é o delta; o esquema inteiro está em esquema.sql.
-- ============================================================

create or replace function public.dias_com_batida(inicio date, fim date)
returns table (colaborador_id text, dias date[])
language sql
stable
security invoker
set search_path = public
as $$
  select r.colaborador_id,
         array_agg(distinct r.data order by r.data)
    from public.registros_ponto r
   where r.data between inicio and fim
   group by r.colaborador_id;
$$;

grant execute on function public.dias_com_batida(date, date) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: a função existe, e quantas pessoas bateram em setembro
select
  (select count(*) from pg_proc where proname = 'dias_com_batida') as funcao_criada,
  (select count(*) from public.dias_com_batida('2026-09-01', '2026-09-30')) as pessoas_que_bateram_em_setembro;
