-- ============================================================
-- CPF DO COLABORADOR E COMPROVANTE DE CADA BATIDA — CONECTA
--
-- Pedido do Elias (06/10/2026), a partir da análise da Portaria MTP
-- 671/2021:
--   1. no primeiro acesso a pessoa informa o CPF, obrigatoriamente;
--   3. cada batida tem comprovante: NSR, empregador (CNPJ), trabalhador
--      (CPF), data, hora e código de verificação.
--
-- O CPF MORA NUMA TABELA PRÓPRIA. A de colaboradores é lida por todos (é
-- a lista de contatos); o CPF só pela própria pessoa e por quem cuida de
-- pessoas. Ninguém grava nela direto: a pessoa registra o dela por
-- `registrar_meu_cpf`, o RH corrige por `corrigir_cpf` — os dois conferem
-- os dígitos verificadores aqui, onde a trava vale.
--
-- O COMPROVANTE É CARIMBADO NA HORA, PELO BANCO: o NSR (sequência única da
-- rede), a hora registrada, o CNPJ do empregador naquele momento e o
-- código de verificação (SHA-256 desses dados). Uma correção
-- posterior do horário NÃO apaga o comprovante: o gatilho devolve o NSR,
-- a hora registrada e o código originais em todo UPDATE.
--
-- Pode rodar de novo: nada é recriado por cima do que já existe.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. O CPF
-- ------------------------------------------------------------
create table if not exists public.cpf_colaborador (
  colaborador_id  text primary key references public.colaboradores(id) on delete cascade,
  -- Onze dígitos e nada mais (sem regex com cifrão: o teste dos delimitadores o cobra)
  cpf             text not null unique check (length(cpf) = 11 and cpf !~ '[^0-9]'),
  registrado_em   timestamptz not null default now(),
  registrado_por  text references public.colaboradores(id) on delete set null
);

alter table public.cpf_colaborador enable row level security;

-- Lê o próprio; quem cuida de pessoas lê todos. Nenhuma regra de escrita:
-- só as funções abaixo gravam.
drop policy if exists cpf_leitura on public.cpf_colaborador;
create policy cpf_leitura on public.cpf_colaborador
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

-- A conta dos dígitos verificadores — a mesma de src/servicos/cpf.ts
create or replace function public.cpf_valido(p_cpf text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  soma int;
  resto int;
  i int;
begin
  -- Onze dígitos, e não todos iguais (111.111.111-11 passa na conta e não é de ninguém)
  if length(d) <> 11 or d = repeat(substr(d, 1, 1), 11) then
    return false;
  end if;
  soma := 0;
  for i in 1..9 loop
    soma := soma + substr(d, i, 1)::int * (11 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  if resto <> substr(d, 10, 1)::int then
    return false;
  end if;
  soma := 0;
  for i in 1..10 loop
    soma := soma + substr(d, i, 1)::int * (12 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  return resto = substr(d, 11, 1)::int;
end;
$$;

-- A pessoa registra o PRÓPRIO CPF, uma vez. Corrigir depois é com o RH.
create or replace function public.registrar_meu_cpf(p_cpf text)
returns text language plpgsql security definer set search_path = public as $$
declare
  eu text := public.meu_colaborador_id();
  d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if eu is null then
    raise exception 'Sessão sem cadastro. Saia e entre de novo.' using errcode = 'P0001';
  end if;
  if not public.cpf_valido(d) then
    raise exception 'CPF inválido. Confira os números.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cpf_colaborador where colaborador_id = eu) then
    raise exception 'Seu CPF já está cadastrado. Para corrigir, procure o RH.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cpf_colaborador where cpf = d) then
    raise exception 'Este CPF já está cadastrado para outra pessoa. Procure o RH.' using errcode = 'P0001';
  end if;
  insert into public.cpf_colaborador (colaborador_id, cpf, registrado_por) values (eu, d, eu);
  return d;
end;
$$;

-- O RH corrige o CPF de alguém (digitado errado no primeiro acesso)
create or replace function public.corrigir_cpf(p_colaborador text, p_cpf text)
returns text language plpgsql security definer set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if not public.cuido_de_pessoas() then
    raise exception 'Só quem cuida de pessoas corrige CPF.' using errcode = 'P0001';
  end if;
  if not public.cpf_valido(d) then
    raise exception 'CPF inválido. Confira os números.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cpf_colaborador where cpf = d and colaborador_id <> p_colaborador) then
    raise exception 'Este CPF já está cadastrado para outra pessoa.' using errcode = 'P0001';
  end if;
  insert into public.cpf_colaborador (colaborador_id, cpf, registrado_por)
  values (p_colaborador, d, public.meu_colaborador_id())
  on conflict (colaborador_id) do update
    set cpf = excluded.cpf, registrado_em = now(), registrado_por = excluded.registrado_por;
  return d;
end;
$$;

revoke all on function public.registrar_meu_cpf(text) from public, anon;
revoke all on function public.corrigir_cpf(text, text) from public, anon;
grant execute on function public.registrar_meu_cpf(text) to authenticated;
grant execute on function public.corrigir_cpf(text, text) to authenticated;

-- ------------------------------------------------------------
-- 2. O COMPROVANTE DE CADA BATIDA
-- ------------------------------------------------------------
create sequence if not exists public.registros_ponto_nsr_seq;

alter table public.registros_ponto add column if not exists nsr bigint;
alter table public.registros_ponto add column if not exists registrado_em timestamptz;
alter table public.registros_ponto add column if not exists cnpj_empregador text;
alter table public.registros_ponto add column if not exists codigo_verificacao text;

-- O código: SHA-256 de "NSR|CNPJ|data|hora registrada (UTC)|colaborador".
-- Escrito UMA vez, aqui, e usado pelo gatilho e pela numeração das antigas.
-- SEM O CPF, de propósito: as batidas de antes do CPF teriam outra fórmula
-- que as de depois. O CPF vem do cadastro, ligado ao colaborador.
create or replace function public.codigo_da_batida(
  p_nsr bigint, p_cnpj text, p_data date, p_registrado timestamptz, p_colaborador text
) returns text language sql immutable set search_path = public as $$
  select encode(
    extensions.digest(
      concat_ws('|',
        p_nsr::text,
        coalesce(p_cnpj, ''),
        to_char(p_data, 'YYYY-MM-DD'),
        to_char(p_registrado at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        p_colaborador
      ),
      'sha256'
    ),
    'hex'
  );
$$;

-- As batidas que já existem ganham NSR na ordem em que foram gravadas
with ordem as (
  select id, row_number() over (order by criado_em, id) as n
    from public.registros_ponto
   where nsr is null
)
update public.registros_ponto r
   set nsr = (select coalesce(max(nsr), 0) from public.registros_ponto) + o.n,
       registrado_em = coalesce(r.registrado_em, r.horario)
  from ordem o
 where r.id = o.id;

select setval('public.registros_ponto_nsr_seq', greatest((select coalesce(max(nsr), 0) from public.registros_ponto), 1));

update public.registros_ponto r
   set cnpj_empregador = coalesce(r.cnpj_empregador, regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g')),
       codigo_verificacao = public.codigo_da_batida(
         r.nsr, regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), r.data, r.registrado_em, r.colaborador_id)
  from public.colaboradores c
 where c.id = r.colaborador_id
   and r.codigo_verificacao is null;

-- O carimbo: na batida nova, tudo; em qualquer alteração, o original volta
create or replace function public.carimbar_batida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cnpj text;
begin
  if tg_op = 'UPDATE' then
    new.nsr := old.nsr;
    new.registrado_em := old.registrado_em;
    new.cnpj_empregador := old.cnpj_empregador;
    new.codigo_verificacao := old.codigo_verificacao;
    return new;
  end if;

  select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') into v_cnpj
    from public.colaboradores where id = new.colaborador_id;

  new.nsr := nextval('public.registros_ponto_nsr_seq');
  new.registrado_em := coalesce(new.horario, now());
  new.cnpj_empregador := v_cnpj;
  new.codigo_verificacao := public.codigo_da_batida(
    new.nsr, v_cnpj, new.data, new.registrado_em, new.colaborador_id);
  return new;
end;
$$;

drop trigger if exists carimbar_batida on public.registros_ponto;
create trigger carimbar_batida
  before insert or update on public.registros_ponto
  for each row execute function public.carimbar_batida();

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o que esperar
--
-- tabela_cpf ............. true
-- gatilho ................ true
-- batidas_sem_nsr ........ 0
-- batidas_sem_codigo ..... 0
-- ultimo_nsr ............. o número da última batida (igual ao total, se
--                          ninguém apagou batida)
-- quem_bate_sem_cnpj ..... quantos colaboradores ativos estão sem o CNPJ do
--                          empregador na ficha (o comprovante deles sai sem
--                          CNPJ até o RH preencher)
-- ============================================================
select
  to_regclass('public.cpf_colaborador') is not null as tabela_cpf,
  exists (select 1 from pg_trigger where tgname = 'carimbar_batida') as gatilho,
  (select count(*) from public.registros_ponto where nsr is null) as batidas_sem_nsr,
  (select count(*) from public.registros_ponto where codigo_verificacao is null) as batidas_sem_codigo,
  (select max(nsr) from public.registros_ponto) as ultimo_nsr,
  (select count(*) from public.colaboradores where ativo and coalesce(cnpj, '') = '') as quem_bate_sem_cnpj;
