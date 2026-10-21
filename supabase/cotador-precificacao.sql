-- ============================================================
-- COTADOR B2B — PRECIFICAÇÃO (docs/cotador/SPEC-precificacao.md)
--
-- Venda = custo × fator da marca, arredondada para cima em ,90
-- (Elias, 20/10/2026: "R$ 100 × 1,80 = R$ 180"). Depende de
-- cotador-banco.sql. Delta; pode ser executado mais de uma vez.
--
-- O CUSTO NÃO CHEGA A QUEM SÓ VENDE: o fator junto com a venda revelaria o
-- custo, então as tabelas de fator também são fechadas. O balconista lê o
-- preço por resultado_da_cotacao, que devolve custo e fator nulos para ele.
-- ------------------------------------------------------------

-- A marca comparada sem acento, espaço nem pontuação: "Mann-filter" e
-- "MANN FILTER" são a mesma
create or replace function public.normalizar_marca(marca text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
    translate(upper(coalesce(marca, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
    '[^A-Z0-9]', '', 'g');
$$;

-- Uma linha por marca, ou por marca e tipo de peça quando a mesma marca tem
-- fatores diferentes (ISAPA pistão 2,55; ISAPA sapata 1,97). A linha
-- '(PADRÃO)' é o fator de marca sem cadastro.
create table if not exists public.margens_por_marca (
  marca          text not null check (btrim(marca) <> ''),
  variante       text not null default '',
  fator          numeric(4,2) not null check (fator between 1 and 5),
  atualizado_por text references public.colaboradores(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  primary key (marca, variante)
);
alter table public.margens_por_marca enable row level security;

insert into public.margens_por_marca (marca, variante, fator)
values ('(PADRÃO)', '', 1.80)
on conflict (marca, variante) do nothing;

-- Como cada B2B escreve a marca → a marca da lista. "MAHLE METAL LEVE" → METAL LEVE.
create table if not exists public.apelidos_de_marca (
  apelido  text primary key check (apelido ~ '^[A-Z0-9]+$'),  -- já normalizado
  marca    text not null
);
alter table public.apelidos_de_marca enable row level security;

drop policy if exists margens_por_marca_leitura on public.margens_por_marca;
create policy margens_por_marca_leitura on public.margens_por_marca
  for select to authenticated using (public.posso_ver_custo());
drop policy if exists margens_por_marca_escrita on public.margens_por_marca;
create policy margens_por_marca_escrita on public.margens_por_marca
  for all to authenticated using (public.meu_nivel() >= 3) with check (public.meu_nivel() >= 3);

drop policy if exists apelidos_de_marca_leitura on public.apelidos_de_marca;
create policy apelidos_de_marca_leitura on public.apelidos_de_marca
  for select to authenticated using (public.posso_ver_custo());
drop policy if exists apelidos_de_marca_escrita on public.apelidos_de_marca;
create policy apelidos_de_marca_escrita on public.apelidos_de_marca
  for all to authenticated using (public.meu_nivel() >= 3) with check (public.meu_nivel() >= 3);

-- Os fatores de uma marca como o B2B a escreve: direto pelo nome, ou pelo
-- apelido. Sem cadastro, uma linha só com o fator padrão (`padrao`).
-- Interna: só as funções desta página chamam.
create or replace function public.fatores_da_marca(marca text)
returns table (variante text, fator numeric, padrao boolean)
language plpgsql stable set search_path = public as $$
declare
  chave text := public.normalizar_marca(marca);
  alvo  text;
begin
  select m.marca into alvo from public.margens_por_marca m
   where public.normalizar_marca(m.marca) = chave and m.marca <> '(PADRÃO)' limit 1;
  if alvo is null then
    select a.marca into alvo from public.apelidos_de_marca a where a.apelido = chave;
  end if;
  if alvo is not null and exists (select 1 from public.margens_por_marca m where m.marca = alvo) then
    return query select m.variante, m.fator, false from public.margens_por_marca m
                  where m.marca = alvo order by m.variante;
  else
    return query select ''::text, m.fator, true from public.margens_por_marca m
                  where m.marca = '(PADRÃO)' and m.variante = '';
  end if;
end;
$$;
revoke all on function public.fatores_da_marca(text) from public, anon, authenticated;

-- A tela de margens grava por estas duas: a validação e a normalização
-- moram aqui, e não numa cópia em TypeScript. Rodam como quem chama, então
-- a regra de escrita (nível ≥ 3) vale.
create or replace function public.salvar_fator(marca text, variante text, fator numeric)
returns void language plpgsql set search_path = public as $$
begin
  if public.meu_nivel() < 3 then
    raise exception 'Só Gerente para cima cuida das margens' using errcode = '42501';
  end if;
  if btrim(coalesce(marca, '')) = '' then
    raise exception 'Informe a marca';
  end if;
  insert into public.margens_por_marca (marca, variante, fator, atualizado_por, atualizado_em)
  values (upper(btrim(marca)), upper(btrim(coalesce(variante, ''))), round(fator, 2), public.meu_colaborador_id(), now())
  on conflict on constraint margens_por_marca_pkey do update
    set fator = excluded.fator, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$$;
revoke all on function public.salvar_fator(text, text, numeric) from public, anon;
grant execute on function public.salvar_fator(text, text, numeric) to authenticated;

-- "Wix Filters" (como o B2B escreve) é a WIX FILTROS da lista
create or replace function public.apontar_apelido(marca_do_b2b text, marca text)
returns void language plpgsql set search_path = public as $$
begin
  if public.meu_nivel() < 3 then
    raise exception 'Só Gerente para cima cuida das margens' using errcode = '42501';
  end if;
  if not exists (select 1 from public.margens_por_marca m where m.marca = apontar_apelido.marca) then
    raise exception 'A marca % não está na lista de fatores', apontar_apelido.marca;
  end if;
  insert into public.apelidos_de_marca (apelido, marca)
  values (public.normalizar_marca(marca_do_b2b), apontar_apelido.marca)
  on conflict (apelido) do update set marca = excluded.marca;
end;
$$;
revoke all on function public.apontar_apelido(text, text) from public, anon;
grant execute on function public.apontar_apelido(text, text) to authenticated;

-- O preço de venda, num lugar só: custo × fator, para cima em ,90.
-- 13,42 → 13,90; 13,90 → 13,90; 13,95 → 14,90; 180,00 → 180,90.
create or replace function public.preco_de_venda(custo numeric, fator numeric)
returns numeric language sql immutable set search_path = public as $$
  select case when custo is null or custo <= 0 or fator is null then null
              else ceil(round(custo * fator, 2) - 0.90) + 0.90 end;
$$;

-- ------------------------------------------------------------
-- O RESULTADO PARA A TELA
--
-- A peça e cada similar, por fornecedor, com o melhor local (a mesma ordem
-- do histórico: SP primeiro, menor custo, mais perto, mais unidades).
-- Uma linha por tipo de peça quando a marca tem fatores diferentes: a tela
-- avisa e mostra todas as possibilidades (`variantes` > 1); a que a
-- descrição cita vem marcada `variante_provavel`.
--
-- custo e fator só para quem vê custo. Para os outros, nulos.
-- ------------------------------------------------------------

create or replace function public.resultado_da_cotacao(codigo text)
returns table (
  tipo text, codigo_peca text, fornecedor text, marca text, descricao text,
  local text, em_sp boolean, quantidade integer, situacao text,
  variante text, variantes integer, variante_provavel boolean, fator_padrao boolean,
  venda numeric, custo numeric, fator numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  alvo text := public.normalizar_codigo(codigo);
  ve_custo boolean := public.posso_ver_custo();
begin
  if not (public.posso_cotar() or public.posso_atender_fila() or ve_custo) then
    raise exception 'Sem permissão para cotar' using errcode = '42501';
  end if;

  return query
  with pecas as (
    select 'peca'::text as tipo, alvo as cod
    union all
    select distinct 'similar', s.codigo_similar
      from public.similares_b2b s where s.codigo = alvo
  ),
  -- Fornecedores que já responderam por cada código hoje (tem histórico)
  consultados as (
    select p.tipo, p.cod, h.fornecedor, h.situacao
      from pecas p
      join public.historico_precos_b2b h on h.codigo = p.cod and h.dia = public.hoje_brasilia()
  ),
  melhor as (
    select distinct on (c.cod, c.fornecedor)
           c.tipo, c.cod, c.fornecedor, c.situacao,
           pr.marca, pr.descricao, pr.local, pr.em_sp, pr.quantidade, pr.custo
      from consultados c
      left join public.precos_b2b pr
        on pr.fornecedor = c.fornecedor and pr.codigo = c.cod and pr.disponivel and pr.custo > 0
     order by c.cod, c.fornecedor, pr.em_sp desc nulls last, pr.custo nulls last,
              pr.proximidade nulls last, pr.quantidade desc nulls last
  )
  select m.tipo, m.cod, m.fornecedor,
         coalesce(m.marca, (select p2.marca from public.precos_b2b p2
                             where p2.fornecedor = m.fornecedor and p2.codigo = m.cod limit 1)),
         coalesce(m.descricao, (select p2.descricao from public.precos_b2b p2
                                 where p2.fornecedor = m.fornecedor and p2.codigo = m.cod limit 1)),
         m.local, m.em_sp, m.quantidade, m.situacao,
         f.variante,
         (count(*) over (partition by m.cod, m.fornecedor))::integer,
         f.variante <> '' and position(public.normalizar_marca(f.variante) in public.normalizar_marca(m.descricao)) > 0,
         f.padrao,
         public.preco_de_venda(m.custo, f.fator),
         case when ve_custo then m.custo end,
         case when ve_custo then f.fator end
    from melhor m
    cross join lateral public.fatores_da_marca(
      coalesce(m.marca, (select p2.marca from public.precos_b2b p2
                          where p2.fornecedor = m.fornecedor and p2.codigo = m.cod limit 1))
    ) f
   order by (m.tipo <> 'peca'), m.cod, public.preco_de_venda(m.custo, f.fator) nulls last, m.fornecedor, f.variante;
end;
$$;
revoke all on function public.resultado_da_cotacao(text) from public, anon;
grant execute on function public.resultado_da_cotacao(text) to authenticated;

-- Marcas que apareceram nas cotações e não têm fator nem apelido: a lista
-- da tela de margens, para o gerente cadastrar ou apontar o apelido.
create or replace function public.marcas_sem_margem()
returns table (marca text, vezes bigint, ultima timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.meu_nivel() < 3 then
    raise exception 'Só Gerente para cima cuida das margens' using errcode = '42501';
  end if;
  return query
    select min(p.marca), count(*), max(p.consultado_em)
      from public.precos_b2b p
     where nullif(btrim(p.marca), '') is not null
       and (select bool_and(fm.padrao) from public.fatores_da_marca(p.marca) fm)
     group by public.normalizar_marca(p.marca)
     order by count(*) desc;
end;
$$;
revoke all on function public.marcas_sem_margem() from public, anon;
grant execute on function public.marcas_sem_margem() to authenticated;

notify pgrst, 'reload schema';

-- Conferência: o fator padrão
select marca, fator from public.margens_por_marca where marca = '(PADRÃO)';
