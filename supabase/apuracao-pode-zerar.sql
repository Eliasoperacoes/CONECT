-- ============================================================
-- CONECTA — A APURAÇÃO PODE SER ZERADA
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Solta uma trava: `ajustes_jornada.minutos` aceitava só valor MAIOR
-- que zero. Agora aceita zero.
--
-- POR QUE ELA PRECISA CAIR
--
-- Quando um dia é corrigido e passa a fechar exatamente na carga, o
-- sistema REESCREVE a apuração daquele dia com zero minutos, aprovada.
-- Reescrever, e não apagar: apagar exigiria dar permissão de remoção a
-- quem bate o ponto, e aí bastaria apagar a linha para um débito sumir.
--
-- Só que zero era justamente o que a trava proibia. O efeito foi calado
-- e caro:
--
--   · o banco recusava a reescrita
--   · o sistema guardava o motivo no console
--   · a tela dizia "0 dias mudaram de valor" — que é o que ela também
--     diz quando não havia nada a mudar
--
-- Então quem reapurava um saldo errado concluía que o saldo estava
-- certo. Foi por aqui que os −47h50 da Lyvia não saíam de lá por
-- caminho nenhum: o número estava errado, a correção era recusada, e
-- nada na tela dizia isso.
--
-- O `>= 0` não afrouxa o que importa. O que impede número negativo
-- continua de pé: o SINAL vem do campo `tipo` (`hora_extra` ou
-- `debito`), e nunca do sinal de `minutos` — é assim para não haver
-- dois jeitos de ler a mesma linha.
--
-- Uma apuração de zero minutos aprovada quer dizer "este dia fechou
-- certo, e alguém conferiu". Ela não soma nada ao banco de horas, e
-- guarda o histórico de que o dia já teve outro número.
-- ============================================================

alter table public.ajustes_jornada
  drop constraint if exists ajustes_jornada_minutos_check;

alter table public.ajustes_jornada
  add constraint ajustes_jornada_minutos_check check (minutos >= 0);

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o que esperar
--
-- aceita_zero ............ true
-- recusa_negativo ........ true    (a trava que importa segue de pé)
-- ============================================================
select
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.ajustes_jornada'::regclass
       and conname = 'ajustes_jornada_minutos_check'
       and pg_get_constraintdef(oid) like '%minutos >= 0%'
  ) as aceita_zero,

  not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.ajustes_jornada'::regclass
       and conname = 'ajustes_jornada_minutos_check'
       and pg_get_constraintdef(oid) like '%minutos > 0%'
  ) as recusa_negativo;

-- ============================================================
-- O TAMANHO DO ESTRAGO, antes de reapurar qualquer coisa
--
-- Lista quem tem apuração com cara de débito da PAUSA: débito de 15
-- minutos ou menos em que o que faltou no dia é exatamente o valor do
-- débito. É a assinatura do defeito — a pausa paga do estágio sendo
-- cobrada como falta.
--
-- Isto NÃO muda nada. É para saber de quantas pessoas e de quantos dias
-- se está falando antes de mexer no saldo de alguém.
-- ============================================================
select
  c.nome,
  c.turno,
  c.setor,
  count(*)                                        as dias_com_debito_de_pausa,
  sum(a.minutos)                                  as minutos_somados,
  (sum(a.minutos) / 60) || 'h' ||
    lpad((sum(a.minutos) % 60)::text, 2, '0')     as em_horas,
  min(a.data)                                     as primeiro_dia,
  max(a.data)                                     as ultimo_dia,
  count(*) filter (where a.estado = 'aprovado')   as ja_aprovados,
  count(*) filter (where a.estado = 'pendente')   as ainda_pendentes
  from public.ajustes_jornada a
  join public.colaboradores c on c.id = a.colaborador_id
 where a.tipo = 'debito'
   and a.minutos <= 15
   and a.minutos = a.minutos_previstos - a.minutos_trabalhados
 group by c.nome, c.turno, c.setor
 order by sum(a.minutos) desc;
