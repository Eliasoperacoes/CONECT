-- ============================================================
-- COTADOR B2B — banco (docs/cotador/SPEC-banco-cotacao.md)
--
-- Delta. Pode ser executado mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- QUEM COTA, QUEM VÊ CUSTO, QUEM ATENDE A FILA
--
-- Pares em tipos.ts: podeCotar, podeVerCusto, podeAtenderFila.
-- A do banco é a que vale. Mudou uma, mude a outra.
-- ------------------------------------------------------------

-- Cotam: Balcão, Callcenter e Gerente para cima
create or replace function public.posso_cotar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_setor() in ('Balcão', 'Callcenter') or public.meu_nivel() >= 3;
$$;
revoke all on function public.posso_cotar() from public, anon;
grant execute on function public.posso_cotar() to authenticated;

-- Veem o custo do fornecedor: Callcenter, Compras e Gerente para cima.
-- O Balcão vê só o preço de venda.
create or replace function public.posso_ver_custo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_setor() in ('Callcenter', 'Compras') or public.meu_nivel() >= 3;
$$;
revoke all on function public.posso_ver_custo() from public, anon;
grant execute on function public.posso_ver_custo() to authenticated;

-- Atende a fila (o CONECTA aberto no PC de compras): Compras e TI.
-- Não existe login próprio da estação.
create or replace function public.posso_atender_fila()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_setor() = 'Compras' or public.meu_nivel() >= 5;
$$;
revoke all on function public.posso_atender_fila() from public, anon;
grant execute on function public.posso_atender_fila() to authenticated;

-- ------------------------------------------------------------
-- FORNECEDORES (os B2Bs)
--
-- B2B novo = ficha + leitor na extensão + uma linha aqui. Ligar e
-- desligar é do TI; o cadastro é feito com o Claude.
-- ------------------------------------------------------------

create table if not exists public.fornecedores_b2b (
  chave   text primary key check (chave ~ '^[a-z0-9-]+$'),
  nome    text not null,
  ativo   boolean not null default true,
  ordem   smallint not null default 0
);
alter table public.fornecedores_b2b enable row level security;

insert into public.fornecedores_b2b (chave, nome, ordem) values
  ('roles', 'Roles', 1),
  ('pellegrino', 'Pellegrino', 2),
  ('dpk', 'DPK', 3)
on conflict (chave) do nothing;

drop policy if exists fornecedores_b2b_leitura on public.fornecedores_b2b;
create policy fornecedores_b2b_leitura on public.fornecedores_b2b
  for select to authenticated using (public.posso_cotar() or public.posso_atender_fila());

drop policy if exists fornecedores_b2b_escrita on public.fornecedores_b2b;
create policy fornecedores_b2b_escrita on public.fornecedores_b2b
  for all to authenticated using (public.sou_admin()) with check (public.sou_admin());

-- ------------------------------------------------------------
-- PREÇO DO DIA, SIMILARES E HISTÓRICO
--
-- O CUSTO DO FORNECEDOR NÃO CHEGA A QUEM SÓ VENDE. Lê só quem vê custo;
-- o Balcão recebe vazio e verá a venda por uma função de `precificacao`.
-- Ninguém grava direto: só `gravar_cotacao` (security definer), que exige
-- quem atende a fila. Por isso não há regra de escrita nestas tabelas.
-- ------------------------------------------------------------

-- O último preço de cada fornecedor, peça e local (CD/filial). Sobrescrito.
create table if not exists public.precos_b2b (
  fornecedor        text not null references public.fornecedores_b2b(chave),
  codigo            text not null,
  local             text not null,
  em_sp             boolean not null,
  custo             numeric(12,2),
  quantidade        integer,            -- nulo quando o site não informa
  disponivel        boolean not null,
  proximidade       smallint,
  marca             text,
  descricao         text,
  grupo_fornecedor  text,
  consultado_em     timestamptz not null default now(),
  primary key (fornecedor, codigo, local)
);
alter table public.precos_b2b enable row level security;

create table if not exists public.similares_b2b (
  fornecedor      text not null references public.fornecedores_b2b(chave),
  codigo          text not null,
  codigo_similar  text not null,
  marca_similar   text,
  consultado_em   timestamptz not null default now(),
  primary key (fornecedor, codigo, codigo_similar)
);
alter table public.similares_b2b enable row level security;

-- O melhor preço do dia (Brasília), uma linha por dia, fornecedor e peça
create table if not exists public.historico_precos_b2b (
  dia         date not null,
  fornecedor  text not null references public.fornecedores_b2b(chave),
  codigo      text not null,
  local       text,
  custo       numeric(12,2),
  situacao    text not null check (situacao in ('SP', 'FORA DO ESTADO', 'SEM ESTOQUE')),
  primary key (dia, fornecedor, codigo)
);
alter table public.historico_precos_b2b enable row level security;

drop policy if exists precos_b2b_leitura on public.precos_b2b;
create policy precos_b2b_leitura on public.precos_b2b
  for select to authenticated using (public.posso_ver_custo());
drop policy if exists similares_b2b_leitura on public.similares_b2b;
create policy similares_b2b_leitura on public.similares_b2b
  for select to authenticated using (public.posso_ver_custo());

drop policy if exists historico_precos_b2b_leitura on public.historico_precos_b2b;
create policy historico_precos_b2b_leitura on public.historico_precos_b2b
  for select to authenticated using (public.posso_ver_custo());

-- ------------------------------------------------------------
-- ESTAÇÃO (o PC de compras)
--
-- Não tem login próprio: é o CONECTA aberto no PC de compras, logado por
-- alguém que atende a fila. A cada minuto a página dá sinal com os sites
-- logados. Mais de 3 minutos sem sinal = fora (estacao_online).
-- ------------------------------------------------------------

create table if not exists public.estacoes_cotacao (
  nome             text primary key check (nome ~ '^[a-z0-9-]+$'),
  atendida_por     text references public.colaboradores(id) on delete set null,
  visto_em         timestamptz not null default now(),
  sites            jsonb not null default '{}'::jsonb check (jsonb_typeof(sites) = 'object'),
  versao_extensao  text
);
alter table public.estacoes_cotacao enable row level security;

-- Quem cota vê se a estação está no ar; ninguém grava direto (só o sinal)
drop policy if exists estacoes_cotacao_leitura on public.estacoes_cotacao;
create policy estacoes_cotacao_leitura on public.estacoes_cotacao
  for select to authenticated using (public.posso_cotar() or public.posso_atender_fila());

-- A regra de "no ar", num lugar só
create or replace function public.estacao_online(visto timestamptz)
returns boolean language sql stable set search_path = public as $$
  select visto > now() - interval '3 minutes';
$$;

create or replace function public.sinal_da_estacao(estacao text, sites jsonb, versao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI atendem a fila de cotação' using errcode = '42501';
  end if;

  insert into public.estacoes_cotacao (nome, atendida_por, visto_em, sites, versao_extensao)
  values (
    estacao,
    (select id from public.colaboradores where auth_user_id = auth.uid() limit 1),
    now(), coalesce(sites, '{}'::jsonb), versao
  )
  on conflict (nome) do update
    set atendida_por = excluded.atendida_por,
        visto_em = excluded.visto_em,
        sites = excluded.sites,
        versao_extensao = excluded.versao_extensao;
end;
$$;
revoke all on function public.sinal_da_estacao(text, jsonb, text) from public, anon;
grant execute on function public.sinal_da_estacao(text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: as três regras criadas e os fornecedores ligados
select proname from pg_proc
 where proname in ('posso_cotar', 'posso_ver_custo', 'posso_atender_fila')
 order by proname;
select chave, nome, ativo from public.fornecedores_b2b order by ordem;
