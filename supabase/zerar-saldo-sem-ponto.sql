-- ============================================================
-- CONECTA — ZERAR O SALDO DE QUEM NUNCA BATEU PONTO
--
-- ESTE ARQUIVO ALTERA DADOS. Leia antes de rodar.
--
-- ------------------------------------------------------------
-- O QUE ELE FAZ, E O QUE NÃO FAZ
-- ------------------------------------------------------------
--
-- APAGA as apurações (`ajustes_jornada`) de quem NÃO TEM NENHUMA
-- marcação de ponto registrada. Só dessas pessoas, e só as apurações.
--
-- NÃO toca em:
--   · marcação de ponto (ninguém tem, é a condição)
--   · quem já bateu ponto, nem que seja uma vez
--   · justificativas, férias, folgas, mensagens, publicações
--
-- ------------------------------------------------------------
-- POR QUE APAGAR, E NÃO REESCREVER PARA ZERO
-- ------------------------------------------------------------
--
-- No resto do sistema a regra é reescrever: apagar exigiria dar
-- permissão de remoção a quem bate o ponto, e aí bastaria apagar a
-- linha para um débito sumir.
--
-- Aqui é outra coisa. Estas linhas são de um piloto com um número
-- fechado de pessoas, e se referem a dias em que NÃO HÁ MARCAÇÃO
-- NENHUMA — não são apuração de trabalho que aconteceu, são resíduo de
-- teste. Deixá-las zeradas encheria o histórico de linhas que nunca
-- tiveram sentido, e a primeira coisa que cada pessoa veria ao entrar
-- seria uma apuração de um dia que ela não trabalhou.
--
-- Quem roda isto é o TI, no SQL Editor, uma vez, antes de abrir o
-- sistema para a loja inteira. Não vira botão em tela nenhuma.
--
-- ------------------------------------------------------------
-- DEPOIS DE RODAR
-- ------------------------------------------------------------
--
-- Os aparelhos que já estavam abertos ainda têm a lista velha em cache.
-- `sincronizarAjustes` substitui a lista local INTEIRA pela do banco a
-- cada sincronização, então some sozinho — no pior caso, fechar e abrir
-- o sistema resolve na hora.
-- ============================================================

-- ============================================================
-- A LIMPEZA, e o relatório do que saiu
--
-- O `delete ... returning` devolve as linhas removidas, e o `select`
-- de fora as agrupa por pessoa. É a conferência e a ação na mesma
-- passada: o que aparecer no resultado foi o que saiu.
--
-- NENHUMA LINHA no resultado quer dizer que não havia nada a limpar.
-- ============================================================
with removidas as (
  delete from public.ajustes_jornada a
   where not exists (
     select 1
       from public.registros_ponto r
      where r.colaborador_id = a.colaborador_id
   )
  returning a.colaborador_id, a.minutos, a.tipo, a.estado, a.data
)
select
  c.nome,
  c.setor,
  c.loja,
  count(*)                                                        as apuracoes_removidas,
  sum(case when r.tipo = 'debito' then -r.minutos else r.minutos end)
    filter (where r.estado = 'aprovado')                          as saldo_que_sumiu_min,
  min(r.data)                                                     as primeira,
  max(r.data)                                                     as ultima
  from removidas r
  join public.colaboradores c on c.id = r.colaborador_id
 group by c.nome, c.setor, c.loja
 order by count(*) desc, c.nome;

-- ============================================================
-- CONFERÊNCIA — rode DEPOIS, numa segunda passada
--
-- O resultado esperado é ZERO nas duas colunas. Se `sobraram` vier
-- maior que zero, alguma apuração de quem não bate ponto escapou.
--
-- select
--   count(*) as sobraram,
--   count(distinct a.colaborador_id) as pessoas
--   from public.ajustes_jornada a
--  where not exists (
--    select 1 from public.registros_ponto r
--     where r.colaborador_id = a.colaborador_id
--  );
-- ============================================================
