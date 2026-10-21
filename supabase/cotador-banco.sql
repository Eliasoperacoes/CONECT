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

-- FRETE E ENTREGA (Elias, 21/10/2026):
--   frete_por_peca: valor fixo somado ao custo antes do fator, para quem
--     não dá frete grátis (DPK e Pellegrino: R$ 10; Roles: grátis). Compras
--     muda pela ferramenta "Fretes" (alterar_frete).
--   lojas_entrega_direta: onde o fornecedor entrega sem transferência
--     interna, e o prazo é o da matriz (2–3 dias). A Pellegrino entrega
--     direto em Palmeiras.
alter table public.fornecedores_b2b
  add column if not exists frete_por_peca numeric(8,2) not null default 0 check (frete_por_peca between 0 and 500),
  add column if not exists lojas_entrega_direta text[] not null default '{Pirassununga}',
  add column if not exists frete_atualizado_em timestamptz,
  add column if not exists frete_atualizado_por text references public.colaboradores(id) on delete set null;

-- Os valores de partida, uma vez só: quem já foi ajustado não volta
update public.fornecedores_b2b set frete_por_peca = 10, frete_atualizado_em = now()
 where chave in ('dpk', 'pellegrino') and frete_atualizado_em is null;
update public.fornecedores_b2b set frete_atualizado_em = now()
 where chave = 'roles' and frete_atualizado_em is null;
update public.fornecedores_b2b set lojas_entrega_direta = '{Pirassununga,Palmeiras}'
 where chave = 'pellegrino' and lojas_entrega_direta = '{Pirassununga}';

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
    public.meu_colaborador_id(),
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

-- ------------------------------------------------------------
-- "HOJE" E O CÓDIGO DA PEÇA, cada um num lugar só
--
-- O preço vale o dia todo no calendário de Brasília. Em UTC o dia viraria
-- às 21h e a cotação da tarde "venceria" antes de a loja fechar.
-- ------------------------------------------------------------

create or replace function public.hoje_brasilia()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- O PRAZO, num lugar só (Elias, 20 e 21/10/2026): CD em SP chega em 2–3
-- dias onde o fornecedor entrega direto (a matriz; a Pellegrino também em
-- Palmeiras) e em 3–4 nas outras lojas, que recebem por transferência
-- interna; fora de SP, 7–10 dias. Sem oferta disponível, sem prazo.
-- (Antes era só por loja: a versão de 2 parâmetros sai, para não haver duas.)
drop function if exists public.prazo_de_entrega(boolean, text);
create or replace function public.prazo_de_entrega(em_sp boolean, loja text, lojas_entrega_direta text[] default '{Pirassununga}')
returns text language sql immutable set search_path = public as $$
  select case
    when em_sp is null then null
    when not em_sp then '7–10 dias'
    when loja = any (coalesce(lojas_entrega_direta, '{Pirassununga}')) then '2–3 dias'
    else '3–4 dias'
  end;
$$;

-- O mesmo da extensão (correspondencia.js): maiúsculas, só letras e números
create or replace function public.normalizar_codigo(codigo text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Cada fornecedor ligado já foi consultado hoje para este código? Não
-- devolve custo: quem só cota pode perguntar.
create or replace function public.preco_de_hoje(codigo text)
returns table (fornecedor text, tem_preco boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.posso_cotar() or public.posso_atender_fila()) then
    raise exception 'Sem permissão para cotar' using errcode = '42501';
  end if;
  return query
    select f.chave, exists (
      select 1 from public.historico_precos_b2b h
       where h.dia = public.hoje_brasilia()
         and h.fornecedor = f.chave
         and h.codigo = public.normalizar_codigo(preco_de_hoje.codigo)
    )
    from public.fornecedores_b2b f
   where f.ativo
   order by f.ordem;
end;
$$;
revoke all on function public.preco_de_hoje(text) from public, anon;
grant execute on function public.preco_de_hoje(text) to authenticated;

-- ------------------------------------------------------------
-- FILA DE COTAÇÃO: um pedido por código
-- ------------------------------------------------------------

create table if not exists public.cotacoes_b2b (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null check (codigo ~ '^[A-Z0-9]+$'),
  codigo_digitado    text not null,
  incluir_similares  boolean not null default false,
  pedida_por         text references public.colaboradores(id) on delete set null,
  loja               text,
  situacao           text not null default 'na_fila' check (situacao in ('na_fila', 'cotando', 'pronta', 'erro')),
  estacao            text references public.estacoes_cotacao(nome) on delete set null,
  pegada_por         text references public.colaboradores(id) on delete set null,
  criada_em          timestamptz not null default now(),
  pegada_em          timestamptz,
  pronta_em          timestamptz,
  erro               text
);
alter table public.cotacoes_b2b enable row level security;
create index if not exists cotacoes_b2b_fila on public.cotacoes_b2b (situacao, criada_em);

-- TEMPO REAL: a estação é avisada na hora em que um pedido entra na fila.
-- Medido em 21/10/2026: só com o relógio de 5 s, a aba da estação em
-- segundo plano foi desacelerada pelo Chrome e um pedido esperou 7 min.
-- (Num Postgres sem o Supabase não há a publicação: nada a fazer.)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cotacoes_b2b') then
    alter publication supabase_realtime add table public.cotacoes_b2b;
  end if;
end $$;

-- Quem pediu vê o próprio pedido; quem vê custo e quem atende a fila veem
-- todos. Ninguém grava direto: só as funções da fila.
drop policy if exists cotacoes_b2b_leitura on public.cotacoes_b2b;
create policy cotacoes_b2b_leitura on public.cotacoes_b2b
  for select to authenticated using (
    pedida_por = public.meu_colaborador_id() or public.posso_ver_custo() or public.posso_atender_fila()
  );

-- "MINHAS COTAÇÕES DO DIA" (SPEC-cotar): cada código que a pessoa pediu
-- hoje, inclusive o que já tinha preço e não gerou pedido. Cada um lê só os
-- próprios; quem grava é o pedir_cotacao.
create table if not exists public.cotacoes_do_dia (
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  codigo          text not null,
  dia             date not null,
  ultima          timestamptz not null default now(),
  primary key (colaborador_id, codigo, dia)
);
alter table public.cotacoes_do_dia enable row level security;

drop policy if exists cotacoes_do_dia_leitura on public.cotacoes_do_dia;
create policy cotacoes_do_dia_leitura on public.cotacoes_do_dia
  for select to authenticated using (colaborador_id = public.meu_colaborador_id());

-- O que a pessoa cotou hoje, do mais recente ao mais antigo (roda como quem
-- chama: a regra de leitura acima vale)
create or replace function public.minhas_cotacoes_do_dia()
returns table (codigo text, ultima timestamptz)
language sql stable set search_path = public as $$
  select d.codigo, d.ultima from public.cotacoes_do_dia d
   where d.colaborador_id = public.meu_colaborador_id() and d.dia = public.hoje_brasilia()
   order by d.ultima desc;
$$;
revoke all on function public.minhas_cotacoes_do_dia() from public, anon;
grant execute on function public.minhas_cotacoes_do_dia() to authenticated;

-- Os nomes dos fornecedores ligados, para a tela (roda como quem chama)
create or replace function public.fornecedores_para_cotar()
returns table (chave text, nome text)
language sql stable set search_path = public as $$
  select f.chave, f.nome from public.fornecedores_b2b f where f.ativo order by f.ordem;
$$;
revoke all on function public.fornecedores_para_cotar() from public, anon;
grant execute on function public.fornecedores_para_cotar() to authenticated;

-- O frete por peça de cada fornecedor, para a ferramenta "Fretes" de
-- Compras. Quem altera é quem atende a fila (Compras e TI), como pediu o
-- Elias: "uma opção para Compras alterar esse valor".
create or replace function public.fretes_dos_fornecedores()
returns table (chave text, nome text, frete_por_peca numeric, atualizado_em timestamptz, atualizado_por text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI cuidam do frete' using errcode = '42501';
  end if;
  return query
    select f.chave, f.nome, f.frete_por_peca, f.frete_atualizado_em,
           (select c.nome from public.colaboradores c where c.id = f.frete_atualizado_por)
      from public.fornecedores_b2b f where f.ativo order by f.ordem;
end;
$$;
revoke all on function public.fretes_dos_fornecedores() from public, anon;
grant execute on function public.fretes_dos_fornecedores() to authenticated;

create or replace function public.alterar_frete(fornecedor text, valor numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI cuidam do frete' using errcode = '42501';
  end if;
  if valor is null or valor < 0 or valor > 500 then
    raise exception 'Frete de R$ 0,00 a R$ 500,00';
  end if;
  update public.fornecedores_b2b
     set frete_por_peca = round(valor, 2), frete_atualizado_em = now(),
         frete_atualizado_por = public.meu_colaborador_id()
   where chave = alterar_frete.fornecedor;
  if not found then
    raise exception 'Fornecedor desconhecido: %', alterar_frete.fornecedor;
  end if;
end;
$$;
revoke all on function public.alterar_frete(text, numeric) from public, anon;
grant execute on function public.alterar_frete(text, numeric) to authenticated;

-- Pede a cotação de uma lista de códigos. Para cada um: se todo fornecedor
-- ligado já tem preço de hoje (e não é para forçar), não cria nada; se já
-- há um pedido igual esperando, reaproveita; senão, entra na fila.
create or replace function public.pedir_cotacao(codigos text[], incluir_similares boolean default false, forcar boolean default false)
returns table (codigo text, cotacao_id uuid, ja_tem_preco boolean)
language plpgsql security definer set search_path = public as $$
declare
  digitado text;
  normal   text;
  pronto   boolean;
  id_achado uuid;
begin
  if not public.posso_cotar() then
    raise exception 'Só Balcão, Callcenter e Gerente cotam' using errcode = '42501';
  end if;

  foreach digitado in array coalesce(codigos, '{}') loop
    normal := public.normalizar_codigo(digitado);
    continue when normal = '';

    insert into public.cotacoes_do_dia (colaborador_id, codigo, dia, ultima)
    values (public.meu_colaborador_id(), normal, public.hoje_brasilia(), now())
    on conflict on constraint cotacoes_do_dia_pkey do update set ultima = now();

    select bool_and(p.tem_preco) into pronto from public.preco_de_hoje(normal) p;
    pronto := coalesce(pronto, false);

    if pronto and not forcar then
      codigo := normal; cotacao_id := null; ja_tem_preco := true;
      return next;
      continue;
    end if;

    select c.id into id_achado
      from public.cotacoes_b2b c
     where c.codigo = normal and c.situacao in ('na_fila', 'cotando')
     order by c.criada_em
     limit 1;

    if id_achado is null then
      insert into public.cotacoes_b2b (codigo, codigo_digitado, incluir_similares, pedida_por, loja)
      values (normal, trim(digitado), pedir_cotacao.incluir_similares, public.meu_colaborador_id(),
              (select loja from public.colaboradores where id = public.meu_colaborador_id()))
      returning id into id_achado;
    elsif pedir_cotacao.incluir_similares then
      -- Quem chegou depois pediu similares: o pedido que espera passa a trazê-los
      update public.cotacoes_b2b set incluir_similares = true where id = id_achado and situacao = 'na_fila';
    end if;

    codigo := normal; cotacao_id := id_achado; ja_tem_preco := pronto;
    return next;
  end loop;
end;
$$;
revoke all on function public.pedir_cotacao(text[], boolean, boolean) from public, anon;
grant execute on function public.pedir_cotacao(text[], boolean, boolean) to authenticated;

-- O ANDAMENTO que a tela de cotar confere a cada 3 s: para cada código, o
-- pedido mais recente de hoje (de qualquer pessoa: o pedido é reaproveitado)
-- ou, sem pedido, se já há preço de hoje. E se a estação está no ar, para a
-- tela avisar "fica aguardando" em vez de girar à toa.
create or replace function public.andamento_da_cotacao(codigos text[])
returns table (codigo text, situacao text, erro text, desde timestamptz, estacao_no_ar boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  no_ar boolean;
begin
  if not (public.posso_cotar() or public.posso_atender_fila()) then
    raise exception 'Sem permissão para cotar' using errcode = '42501';
  end if;
  select coalesce(bool_or(public.estacao_online(e.visto_em)), false) into no_ar from public.estacoes_cotacao e;

  return query
    select n.cod,
           coalesce(c.situacao,
                    case when (select bool_and(p.tem_preco) from public.preco_de_hoje(n.cod) p) then 'pronta' else 'sem_pedido' end),
           c.erro,
           c.criada_em,
           no_ar
      from (select distinct public.normalizar_codigo(x) as cod from unnest(coalesce(codigos, '{}')) x) n
      left join lateral (
        select c2.situacao, c2.erro, c2.criada_em
          from public.cotacoes_b2b c2
         where c2.codigo = n.cod
           and (c2.criada_em at time zone 'America/Sao_Paulo')::date = public.hoje_brasilia()
         order by c2.criada_em desc
         limit 1
      ) c on true
     where n.cod <> '';
end;
$$;
revoke all on function public.andamento_da_cotacao(text[]) from public, anon;
grant execute on function public.andamento_da_cotacao(text[]) to authenticated;

-- A estação pega o pedido mais antigo da fila. Duas abas pegando ao mesmo
-- tempo nunca levam o mesmo (skip locked). Pedido "cotando" há mais de 5
-- minutos é de uma estação que caiu no meio: volta para a fila.
create or replace function public.pegar_proxima_cotacao(estacao text)
returns setof public.cotacoes_b2b
language plpgsql security definer set search_path = public as $$
declare
  alvo uuid;
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI atendem a fila de cotação' using errcode = '42501';
  end if;

  update public.cotacoes_b2b
     set situacao = 'na_fila', pegada_em = null, pegada_por = null, estacao = null
   where situacao = 'cotando' and pegada_em < now() - interval '5 minutes';

  select c.id into alvo
    from public.cotacoes_b2b c
   where c.situacao = 'na_fila'
   order by c.criada_em
   limit 1
   for update skip locked;

  if alvo is null then
    return;
  end if;

  return query
    update public.cotacoes_b2b c
       set situacao = 'cotando',
           pegada_em = now(),
           pegada_por = public.meu_colaborador_id(),
           estacao = (select e.nome from public.estacoes_cotacao e where e.nome = pegar_proxima_cotacao.estacao)
     where c.id = alvo
    returning c.*;
end;
$$;
revoke all on function public.pegar_proxima_cotacao(text) from public, anon;
grant execute on function public.pegar_proxima_cotacao(text) to authenticated;

-- Troca o preço do dia de UM código num fornecedor e grava o melhor do dia
-- no histórico. Serve à peça pedida e a cada similar, para a regra de
-- gravar não existir duas vezes. Interna: só gravar_cotacao chama (roda
-- como quem chama, e quem está logado não grava nestas tabelas).
create or replace function public.gravar_ofertas(forn text, cod text, peca jsonb, ofertas jsonb)
returns void
language plpgsql set search_path = public as $$
declare
  melhor record;
begin
  delete from public.precos_b2b where fornecedor = forn and codigo = cod;
  insert into public.precos_b2b (fornecedor, codigo, local, em_sp, custo, quantidade, disponivel, proximidade,
                                 marca, descricao, grupo_fornecedor, consultado_em)
  select forn, cod, o ->> 'local', coalesce((o ->> 'emSP')::boolean, false),
         (o ->> 'preco')::numeric, (o ->> 'quantidade')::integer, coalesce((o ->> 'disponivel')::boolean, false),
         (o ->> 'proximidade')::smallint,
         peca ->> 'marca', peca ->> 'descricao', peca ->> 'grupo', now()
    from jsonb_array_elements(coalesce(ofertas, '[]'::jsonb)) o
   where nullif(o ->> 'local', '') is not null
  on conflict (fornecedor, codigo, local) do update
    set em_sp = excluded.em_sp, custo = excluded.custo, quantidade = excluded.quantidade,
        disponivel = excluded.disponivel, proximidade = excluded.proximidade, marca = excluded.marca,
        descricao = excluded.descricao, grupo_fornecedor = excluded.grupo_fornecedor, consultado_em = excluded.consultado_em;

  -- O melhor do dia: o menor preço em SP; sem SP, o menor de fora; sem
  -- nada disponível, SEM ESTOQUE. (A regra completa, com empate por
  -- proximidade, é a da extensão: escolha.js. Aqui só o custo importa.)
  -- Preço zero é peça sem preço (WEGA WO130 na DPK, 20/10): não vale.
  select p.local, p.custo, case when p.em_sp then 'SP' else 'FORA DO ESTADO' end as situacao
    into melhor
    from public.precos_b2b p
   where p.fornecedor = forn and p.codigo = cod and p.disponivel and p.custo > 0
   order by p.em_sp desc, p.custo, p.proximidade nulls last, p.quantidade desc nulls last
   limit 1;

  insert into public.historico_precos_b2b (dia, fornecedor, codigo, local, custo, situacao)
  values (public.hoje_brasilia(), forn, cod, melhor.local, melhor.custo, coalesce(melhor.situacao, 'SEM ESTOQUE'))
  on conflict (dia, fornecedor, codigo) do update
    set local = excluded.local, custo = excluded.custo, situacao = excluded.situacao;
end;
$$;
revoke all on function public.gravar_ofertas(text, text, jsonb, jsonb) from public, anon, authenticated;

-- Grava o que a estação cotou. `resultados` é uma lista, um item por
-- fornecedor, no formato dos leitores da extensão:
--   {"fornecedor":"dpk","peca":{"codigo","marca","descricao","grupo"}|null,
--    "ofertas":[{"local","emSP","preco","quantidade","disponivel","proximidade"}],
--    "similares":[{"codigo","marca","descricao","ofertas":[...]}],"erro":null}
-- O similar que vem com `ofertas` ganha preço com o próprio código, para o
-- balconista ver quanto custa quando a peça não tem em SP.
-- Numa transação: troca o preço do dia e os similares daquele código e
-- fornecedor, grava o histórico do dia e fecha o pedido. Peça que o
-- fornecedor não tem também é gravada (SEM ESTOQUE), para não perguntar de
-- novo no mesmo dia. Fornecedor que deu erro mantém o preço anterior.
create or replace function public.gravar_cotacao(cotacao uuid, resultados jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  pedido   public.cotacoes_b2b%rowtype;
  item     jsonb;
  forn     text;
  falhas   text[] := '{}';
  gravados int := 0;
  sim      jsonb;
  cod_sim  text;
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI atendem a fila de cotação' using errcode = '42501';
  end if;

  select * into pedido from public.cotacoes_b2b where id = cotacao for update;
  if pedido.id is null then
    raise exception 'Cotação % não existe', cotacao;
  end if;
  if pedido.situacao <> 'cotando' then
    raise exception 'Cotação % não está sendo cotada (situação: %)', cotacao, pedido.situacao;
  end if;
  if jsonb_typeof(resultados) is distinct from 'array' then
    raise exception 'resultados precisa ser uma lista, um item por fornecedor';
  end if;

  for item in select * from jsonb_array_elements(resultados) loop
    forn := item ->> 'fornecedor';
    if not exists (select 1 from public.fornecedores_b2b where chave = forn) then
      raise exception 'Fornecedor desconhecido: %', forn;
    end if;

    if nullif(item ->> 'erro', '') is not null then
      falhas := falhas || (forn || ': ' || (item ->> 'erro'));
      continue;
    end if;

    perform public.gravar_ofertas(forn, pedido.codigo, item -> 'peca', item -> 'ofertas');

    -- Similares só quando vieram (o pedido pode ter sido sem eles)
    if item ? 'similares' then
      delete from public.similares_b2b where fornecedor = forn and codigo = pedido.codigo;
      for sim in select * from jsonb_array_elements(coalesce(item -> 'similares', '[]'::jsonb)) loop
        cod_sim := public.normalizar_codigo(sim ->> 'codigo');
        continue when cod_sim = '' or cod_sim = pedido.codigo;
        insert into public.similares_b2b (fornecedor, codigo, codigo_similar, marca_similar, consultado_em)
        values (forn, pedido.codigo, cod_sim, sim ->> 'marca', now())
        on conflict do nothing;
        if sim ? 'ofertas' then
          perform public.gravar_ofertas(forn, cod_sim, sim, sim -> 'ofertas');
        end if;
      end loop;
    end if;

    gravados := gravados + 1;
  end loop;

  update public.cotacoes_b2b
     set situacao = case when gravados = 0 then 'erro' else 'pronta' end,
         pronta_em = now(),
         erro = nullif(array_to_string(falhas, ' | '), '')
   where id = cotacao;

  -- A fila não cresce para sempre: pedido com mais de 90 dias sai
  delete from public.cotacoes_b2b where criada_em < now() - interval '90 days';

  return case when gravados = 0 then 'erro' else 'pronta' end;
end;
$$;
revoke all on function public.gravar_cotacao(uuid, jsonb) from public, anon;
grant execute on function public.gravar_cotacao(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: as funções criadas (9) e os fornecedores ligados
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('posso_cotar', 'posso_ver_custo', 'posso_atender_fila', 'sinal_da_estacao', 'hoje_brasilia',
                   'preco_de_hoje', 'pedir_cotacao', 'pegar_proxima_cotacao', 'gravar_cotacao')
 order by proname;
select chave, nome, ativo from public.fornecedores_b2b order by ordem;
