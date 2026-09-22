-- ===================================================================
-- A JORNADA DIÁRIA VOLTA A SER OPCIONAL
-- ===================================================================
--
-- O DEFEITO, visto no espelho da Lyvia: estagiária do turno da tarde,
-- 4h45 por dia, com o cabeçalho dizendo "jornada diária: 8h10" e −3h25
-- todo santo dia. Acumulou −47h50 em três semanas.
--
-- A CAUSA tinha duas metades que se protegiam:
--
--   1. O cálculo era `cargaHorariaDiariaMinutos ?? minutosDoTurno(...)`.
--      A ideia sempre foi "a ficha vence o turno QUANDO preenchida".
--
--   2. Só que a coluna é `not null default 480`, e o cadastro ainda
--      gravava `?? 490` em toda ficha nova. Ela NUNCA vinha vazia — então
--      o `??` jamais caía para o turno, e a metade direita da linha era
--      código morto desde o começo.
--
-- Resultado: todo mundo carregava uma jornada diária que ninguém
-- escolheu, e ela mandava mais que o turno da pessoa.
--
-- O QUE ESTE SCRIPT FAZ
--
--   - Deixa a coluna aceitar NULL, que passa a querer dizer "vale o
--     turno" — o certo para quase todo mundo.
--   - Limpa os 480 e 490 que o sistema distribuiu sozinho.
--
-- O QUE ELE NÃO FAZ: mexer em quem tem OUTRO número. 4h00, 6h00, 6h36 e
-- 7h20 foram escolhidos por alguém, e continuam valendo. Meio período é
-- contrato real e tem de vencer a escala da rede.
--
-- ATENÇÃO: se alguém escolheu 8h00 ou 8h10 DE PROPÓSITO, essa escolha é
-- limpa junto — não há como distinguir do padrão automático. Na prática
-- não muda nada: quem está no turno A ou B recebe 8h10 do próprio turno.
--
-- Roda quantas vezes quiser.
-- ===================================================================

alter table public.colaboradores
  alter column carga_horaria_diaria_minutos drop not null;

alter table public.colaboradores
  alter column carga_horaria_diaria_minutos drop default;

update public.colaboradores
   set carga_horaria_diaria_minutos = null
 where carga_horaria_diaria_minutos in (480, 490);

notify pgrst, 'reload schema';

-- ===================================================================
-- CONFERÊNCIA
-- ===================================================================
--
-- `com_jornada_propria` deve ficar BAIXO: só quem tem contrato
-- individual de verdade. Se vier alto, alguém escolheu um número fora
-- dos dois padrões e vale conferir quem.
select
  count(*)                                                        as ativos,
  count(*) filter (where carga_horaria_diaria_minutos is null)    as seguem_o_turno,
  count(*) filter (where carga_horaria_diaria_minutos is not null) as com_jornada_propria
from public.colaboradores
where ativo is true;

-- E quem sobrou com jornada própria, um por linha, para conferir
select nome, cargo, setor, turno, carga_horaria_diaria_minutos as jornada_propria
from public.colaboradores
where ativo is true
  and carga_horaria_diaria_minutos is not null
order by nome;
