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

notify pgrst, 'reload schema';

-- Conferência: as três regras criadas e os fornecedores ligados
select proname from pg_proc
 where proname in ('posso_cotar', 'posso_ver_custo', 'posso_atender_fila')
 order by proname;
select chave, nome, ativo from public.fornecedores_b2b order by ordem;
