-- ============================================================
-- COTADOR — RELATÓRIOS E INSIGHTS (docs/cotador/SPEC-insights-cotacao.md)
-- ============================================================
-- AINDA NÃO RODAR NA PRODUÇÃO: sobe junto com o resto do cotador.
-- Depende de cotador-banco.sql e cotador-encomendas.sql.
-- Delta. Pode ser executado mais de uma vez.
--
-- Elias, 22/10/2026: "metrificar todo o processo — quanto tempo leva, onde
-- tem gargalo"; "ligar os dados de cada vendedor: quantidade de peças,
-- quais as mais compradas"; "se eu precisar tirar um relatório, não existe".
--
-- As encomendas vêm de `jornada_das_encomendas` (cotador-encomendas.sql).
-- Aqui: o que foi COTADO e o que foi PEDIDO AO COMPRADOR no período — o
-- começo do funil e a demanda que não virou encomenda.
-- Quem vê: Compras e Gerência (nível ≥ 3), os de todos
-- (posso_ver_historico_de_todos). Nada de custo aqui.
-- ============================================================

-- As cotações do período: uma linha por vendedor, peça e dia (quantas
-- vezes cotou no dia, e o resultado da última vez).
create or replace function public.cotacoes_do_periodo(de timestamptz, ate timestamptz)
returns table (
  colaborador_id text, nome text, loja text, codigo text, dia date, vezes integer,
  situacao text, fornecedor text, venda numeric, similares integer, ultima timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_ver_historico_de_todos() then
    raise exception 'Só Compras e Gerência veem os relatórios' using errcode = '42501';
  end if;
  return query
    select distinct on (c.colaborador_id, c.codigo, (c.criada_em at time zone 'America/Sao_Paulo')::date)
           c.colaborador_id, col.nome, c.loja, c.codigo,
           (c.criada_em at time zone 'America/Sao_Paulo')::date,
           (count(*) over (partition by c.colaborador_id, c.codigo, (c.criada_em at time zone 'America/Sao_Paulo')::date))::integer,
           c.situacao, c.fornecedor, c.venda, c.similares, c.criada_em
      from public.consultas_cotacao c
      left join public.colaboradores col on col.id = c.colaborador_id
     where c.criada_em >= coalesce(de, '-infinity') and c.criada_em < coalesce(ate, 'infinity')
     order by c.colaborador_id, c.codigo, (c.criada_em at time zone 'America/Sao_Paulo')::date, c.criada_em desc
     limit 20000;
end;
$$;
revoke all on function public.cotacoes_do_periodo(timestamptz, timestamptz) from public, anon;
grant execute on function public.cotacoes_do_periodo(timestamptz, timestamptz) to authenticated;

-- As solicitações ao comprador do período: o tempo de resposta de Compras
-- e o que nem o comprador encontrou (demanda não atendida).
create or replace function public.solicitacoes_do_periodo(de timestamptz, ate timestamptz)
returns table (
  id uuid, codigo text, pedida_por text, nome text, loja text, situacao text,
  criada_em timestamptz, respondida_em timestamptz, nome_de_quem_respondeu text, opcoes integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_ver_historico_de_todos() then
    raise exception 'Só Compras e Gerência veem os relatórios' using errcode = '42501';
  end if;
  return query
    select s.id, s.codigo, s.pedida_por, p.nome, s.loja, s.situacao,
           s.criada_em, s.respondida_em, r.nome,
           (select count(*)::integer from public.respostas_cotacao rc where rc.solicitacao_id = s.id)
      from public.solicitacoes_cotacao s
      left join public.colaboradores p on p.id = s.pedida_por
      left join public.colaboradores r on r.id = s.respondida_por
     where s.criada_em >= coalesce(de, '-infinity') and s.criada_em < coalesce(ate, 'infinity')
     order by s.criada_em desc
     limit 20000;
end;
$$;
revoke all on function public.solicitacoes_do_periodo(timestamptz, timestamptz) from public, anon;
grant execute on function public.solicitacoes_do_periodo(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: as duas funções
select proname from pg_proc
 where pronamespace = 'public'::regnamespace and proname in ('cotacoes_do_periodo', 'solicitacoes_do_periodo')
 order by proname;
