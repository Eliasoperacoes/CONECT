-- ============================================================
-- POR QUE O RECADO DE COMPRAS NÃO VIROU NOTIFICAÇÃO (27/10/2026) — SÓ LEITURA
--
-- A Juliana confirmou o pedido; o recado apareceu no chat do Werique, mas
-- o celular dele não avisou. O recado nasce no banco (escrever_recado) e o
-- aviso é pedido depois, pelo aparelho de quem fez o passo, à função
-- enviar-aviso, que só entrega a quem tem aparelho registrado.
--
-- Uma linha por recado dos últimos 2 dias nas conversas com Compras de quem
-- tem "weri" no nome (troque no `ilike`): quem mandou, o passo, e — repetido
-- em toda linha — os aparelhos da pessoa e se ela segue na conversa.
-- `aparelhos = 0` → o aviso não tem para onde ir: falta o aplicativo
-- Android aberto ao menos uma vez com o login dele.
-- ============================================================

with pessoa as (
  select id, nome from public.colaboradores where nome ilike '%weri%'
)
select p.nome                                                        as vendedor,
       to_char(m.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
       r.nome                                                        as quem_mandou,
       m.aviso_encomenda                                             as passo,
       left(m.texto, 80)                                             as recado,
       (select count(*) from public.aparelhos a where a.colaborador_id = p.id)  as aparelhos,
       (select string_agg(a.plataforma || ' ' || coalesce(a.modelo, '?') || ' visto ' ||
               to_char(a.visto_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), ' | ')
          from public.aparelhos a where a.colaborador_id = p.id)    as quais_aparelhos,
       (select to_jsonb(pa) ->> 'removida' from public.participantes pa
         where pa.conversa_id = m.conversa_id and pa.colaborador_id = p.id) as tirou_da_lista,
       (select to_jsonb(pa) ->> 'saiu_em' from public.participantes pa
         where pa.conversa_id = m.conversa_id and pa.colaborador_id = p.id) as saiu_em
  from pessoa p
  join public.mensagens m on m.conversa_id = 'compras-' || p.id
  left join public.colaboradores r on r.id = m.remetente_id
 where m.criado_em > now() - interval '2 days'
 order by m.criado_em desc;
