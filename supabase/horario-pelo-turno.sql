-- ============================================================
-- O HORÁRIO VOLTA A SAIR DO TURNO
--
-- O Painel ADM gravava "carga própria" ao abrir e salvar a ficha (8h00
-- por padrão). Com carga própria, o previsto deixa de ser o do turno e o
-- sistema não conhece o horário de cada batida — a tolerância por
-- marcação não vale para a pessoa. Levantado em 29/09/2026:
--
--   Aline, Fernanda ....... 8h10, igual ao turno A (redundante)
--   Raphael ............... 8h00 (Diretoria)
--   Maria Clara, Vinicius . 8h00 — previsto errado, a rede não tem 8h00
--   Lyvia ................. 8h10 sendo ESTAGIÁRIA: cobrada como integral
--
-- Limpar a carga própria faz o turno voltar a mandar. A Lyvia vai para o
-- turno de estágio da tarde (E3, 13:00 às 18:00), confirmado pelo Elias.
--
-- Os dias já apurados só mudam com "Reapurar período" de cada pessoa.
-- ============================================================

update public.colaboradores
   set carga_horaria_diaria_minutos = null
 where ativo
   and carga_horaria_diaria_minutos is not null
   and nome in (
     'Aline Karoline Boldrim Delphine',
     'Raphael Malachias Ferreira',
     'Lyvia Aparecida Souza Gonçalves',
     'Maria Clara Mafra De Oliveira',
     'Vinicius André De Carli Serrador',
     'Fernanda Metzner Ceccarelli'
   );

update public.colaboradores
   set turno = 'E3'
 where ativo
   and nome = 'Lyvia Aparecida Souza Gonçalves';

-- Conferência: as seis sem carga própria, e a Lyvia no E3
select nome, setor, turno, carga_horaria_diaria_minutos
  from public.colaboradores
 where ativo
   and nome in (
     'Aline Karoline Boldrim Delphine',
     'Raphael Malachias Ferreira',
     'Lyvia Aparecida Souza Gonçalves',
     'Maria Clara Mafra De Oliveira',
     'Vinicius André De Carli Serrador',
     'Fernanda Metzner Ceccarelli'
   )
 order by nome;
