-- ============================================================
-- TIRA DA FILA OS "DIAS SEM FECHAR" QUE SÃO BATIDA A LANÇAR (01/10/2026)
--
-- Decisão do Elias: "Aprovar jornadas" fica com hora extra, débito e
-- falta. O dia que começou e não fechou foi para "Pontos incompletos",
-- onde o líder lança a batida esquecida — e o sistema não cria mais pedido
-- para ele.
--
-- Os pedidos antigos continuavam no banco. A fila tentou escondê-los
-- olhando as batidas no aparelho, e o número passou a oscilar entre 1 e 6,
-- avisando a cada subida. Este script os apaga de vez: só os PENDENTES, só
-- de dias que TÊM batida no banco. A falta (dia sem batida nenhuma) fica.
--
-- Não mexe em estrutura; pode rodar de novo sem efeito.
-- ============================================================

delete from public.ajustes_jornada a
 where a.tipo = 'dia_incompleto'
   and a.estado = 'pendente'
   and exists (
     select 1 from public.registros_ponto r
      where r.colaborador_id = a.colaborador_id
        and r.data = a.data
   );

-- Conferência: o que sobrou de "dia sem fechar" pendente deve ser só falta
-- (dia sem batida). Se aparecer alguém COM batida aqui, o delete não pegou.
select c.nome, a.data,
       (select count(*) from public.registros_ponto r
         where r.colaborador_id = a.colaborador_id and r.data = a.data) as batidas_no_dia
from public.ajustes_jornada a
join public.colaboradores c on c.id = a.colaborador_id
where a.tipo = 'dia_incompleto' and a.estado = 'pendente'
order by a.data desc, c.nome;
