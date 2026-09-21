-- ===================================================================
-- QUEM SÃO AS 9 PESSOAS "SEM RESPONSÁVEL"
-- ===================================================================
--
-- O painel do RH diz 9, o Elias diz que todo mundo já está ligado ao
-- líder ou ao gerente. Um dos dois está olhando outra coisa, e esta
-- consulta diz qual.
--
-- Não altera NADA. É só leitura.
--
-- A hipótese a confirmar ou derrubar: as 9 são o TOPO da cadeia —
-- gerentes, diretoria e TI, que não têm ninguém acima porque não existe
-- ninguém acima. Se for isso, o painel está contando uma coisa que nunca
-- vai poder ser zerada, e é o painel que precisa mudar, não o cadastro.
-- ===================================================================

-- 1. QUEM SÃO, uma linha por pessoa
select
  c.nome,
  c.cargo,
  c.nivel,
  c.loja,
  c.setor,
  case
    when c.nivel >= 3 then 'topo da cadeia (não bate ponto)'
    else 'ATENÇÃO: bate ponto e não tem aprovador'
  end as leitura
from public.colaboradores c
where c.responsavel_id is null
  and c.ativo is true
order by c.nivel desc, c.nome;

-- 2. O RESUMO, para bater com o número do painel
select
  count(*) filter (where responsavel_id is null and ativo is true) as sem_responsavel,
  count(*) filter (where responsavel_id is null and ativo is true and nivel >= 3) as sao_topo_da_cadeia,
  count(*) filter (where responsavel_id is null and ativo is true and nivel < 3) as batem_ponto_sem_aprovador,
  count(*) filter (where ativo is true) as ativos_no_total
from public.colaboradores;

-- 3. QUEM APARECE LIGADO NA TELA MAS ESTÁ SOLTO NO BANCO
--
-- Existe um gatilho (`apenas_rh_move_o_organograma`) que REVERTE
-- responsavel_id quando quem grava não cuida de pessoas. Se alguém foi
-- posicionado pela tela e a gravação voltou atrás, a pessoa aparece
-- ligada para quem acabou de mexer e solta para todo mundo — inclusive
-- aqui. Esta terceira consulta mostra o que o banco realmente guardou.
select
  c.nome                as pessoa,
  c.nivel,
  coalesce(r.nome, '— SOLTO —') as responsavel_no_banco,
  r.cargo               as cargo_do_responsavel
from public.colaboradores c
left join public.colaboradores r on r.id = c.responsavel_id
where c.ativo is true
order by (c.responsavel_id is null) desc, c.nivel desc, c.nome;
