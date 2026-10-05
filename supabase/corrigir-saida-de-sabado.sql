-- ============================================================
-- A SAÍDA DO SÁBADO QUE ENTROU COMO "SAÍDA PARA ALMOÇO" — CONECTA
--
-- Relato do Elias (05/10/2026): estagiários vieram no sábado 03/10 e o
-- espelho pôs o meio-dia em "Saída alm.", com trabalhado 0h00.
--
-- O sábado não é dia de estágio, e o aplicativo, num dia que não espera
-- batida, seguia a ordem das quatro: a segunda batida virava saída para
-- almoço. Corrigido no aplicativo (`sequenciaDoDia`); isto acerta as
-- batidas que já entraram.
--
-- Sábado não tem intervalo para ninguém: toda "saída para almoço" de
-- sábado sem retorno nem saída no mesmo dia é a saída do dia. Rodar de
-- novo não muda nada (a segunda vez não encontra o que corrigir).
--
-- Depois de rodar, rode a `apuracao-rodar-agora.sql` para o dia entrar
-- no banco de horas.
-- ============================================================

update public.registros_ponto r
   set tipo = 'saida'
 where r.tipo = 'saida_almoco'
   and extract(dow from r.data) = 6
   and not exists (
     select 1 from public.registros_ponto o
      where o.colaborador_id = r.colaborador_id
        and o.data = r.data
        and o.tipo in ('retorno_almoco', 'saida')
   );

-- Conferência: os sábados com batida desde setembro. Nenhuma linha deve
-- ter "saida_almoco"; os estagiários de 03/10 aparecem com entrada e saída.
select c.nome, c.setor, r.data,
       string_agg(r.tipo || ' ' || r.hora_formatada, ' · ' order by r.horario) as batidas
  from public.registros_ponto r
  join public.colaboradores c on c.id = r.colaborador_id
 where extract(dow from r.data) = 6
   and r.data >= date '2026-09-01'
   and (c.setor = 'Estágio' or exists (
     select 1 from public.registros_ponto x
      where x.colaborador_id = r.colaborador_id and x.data = r.data and x.tipo = 'saida_almoco'))
 group by c.nome, c.setor, r.data
 order by r.data desc, c.nome;
