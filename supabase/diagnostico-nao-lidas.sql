-- ============================================================
-- DE ONDE VÊM AS NÃO LIDAS DE UMA CONTA (29/10/2026) — SÓ LEITURA
--
-- O balão do chat mostrava 5 na conta ADM, e a lista aberta não mostrava
-- mensagem nova nenhuma. Desde 28/10 o balão soma os grupos também
-- (naoLidasDaLista em App.tsx): esta consulta diz em que conversas estão as
-- não lidas, de quem e de que tipo — "sistema" é a linha cinza do grupo
-- ("Fulano entrou"), "apagadas" é mensagem apagada.
--
-- Uma linha por conversa com não lida. Troque o id se for outra pessoa.
-- `tirou_da_lista` ou `saiu_em` preenchido: a conversa não aparece na lista,
-- e o balão também não deveria contá-la.
-- ============================================================

with eu as (select 'colab-admin-elias'::text as id)
select c.nome                                                      as conversa,
       c.tipo,
       count(*)                                                    as nao_lidas,
       count(*) filter (where m.tipo = 'sistema')                  as de_sistema,
       count(*) filter (where m.apagada_em is not null)            as apagadas,
       to_char(max(m.criado_em) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima,
       string_agg(distinct coalesce(r.nome, m.remetente_id), ', ') as quem_mandou,
       (select to_jsonb(pa) ->> 'removida' from public.participantes pa
         where pa.conversa_id = c.id and pa.colaborador_id = eu.id) as tirou_da_lista,
       (select to_jsonb(pa) ->> 'saiu_em' from public.participantes pa
         where pa.conversa_id = c.id and pa.colaborador_id = eu.id) as saiu_em
  from eu
  join public.participantes p on p.colaborador_id = eu.id
  join public.conversas c     on c.id = p.conversa_id
  join public.mensagens m     on m.conversa_id = c.id and m.remetente_id <> eu.id
  left join public.colaboradores r on r.id = m.remetente_id
 where not exists (select 1 from public.leituras_mensagem l
                    where l.mensagem_id = m.id and l.colaborador_id = eu.id)
 group by c.id, c.nome, c.tipo, eu.id
 order by max(m.criado_em) desc;
