-- ===================================================================
-- QUEM ENXERGA O QUÊ NO COTADOR — CONECTA / Malachias Autopeças
-- ===================================================================
--
-- NÃO ALTERA NADA. Uma linha por colaborador ativo, com as partes do
-- cotador que ele alcança. A regra é a mesma de posso_cotar,
-- posso_ver_custo e posso_atender_fila (cotador-banco.sql) e de
-- podeCotar, podeVerCusto e podeAtenderFila (tipos.ts):
--
--   cota (Cotar, Encomendas) ... Balcão, Callcenter, Gerente para cima (nível 3+)
--   vê custo ................... Callcenter, Compras, Gerente para cima
--   Compras (Painel, Solicitações, Pedidos, Fretes) ... Compras e TI (nível 5)
--   relatórios ................. Compras e Gerente para cima
--
-- Se alguém aparece sem acesso que deveria ter, o conserto é o SETOR na
-- ficha, não o SQL. A ordem põe primeiro quem fica de fora do cotador.

select
  c.nome,
  c.loja,
  c.setor,
  c.nivel,
  (c.setor in ('Balcão', 'Callcenter') or c.nivel >= 3) as cota,
  (c.setor in ('Callcenter', 'Compras') or c.nivel >= 3) as ve_custo,
  (c.setor = 'Compras' or c.nivel >= 5)                  as atende_compras,
  (c.setor = 'Compras' or c.nivel >= 3)                  as ve_relatorios,
  (c.auth_user_id is not null)                           as tem_login
from public.colaboradores c
where c.ativo
order by
  (c.setor in ('Balcão', 'Callcenter', 'Compras') or c.nivel >= 3),
  c.setor, c.loja, c.nome;
