-- ============================================================
-- CADA UM VÊ DA FICHA DOS COLEGAS SÓ O QUE PRECISA (13/10/2026)
--
-- Laudo de 13/10/2026, item 6. A leitura de `colaboradores` era aberta a
-- todo logado, e o app lia `select *`: telefone, e-mail, observações do
-- RH, matrícula, CNPJ e turno de todos os 89 iam para todo celular. E o
-- canal ao vivo mandava a LINHA INTEIRA de quem mudasse qualquer coisa a
-- todo aparelho conectado.
--
-- OS TRÊS NÍVEIS (decisão do Elias):
--
--   1. DIRETÓRIO — todos: id, nome, cargo, setor, loja, nível, foto,
--      presença, visto por último, ramal, a quem responde, ativo.
--   2. FICHA DE TRABALHO — a pessoa, quem responde por ela e o RH:
--      matrícula, CNPJ, admissão, departamento, jornada e turno. O espelho
--      que o líder imprime traz matrícula, CNPJ e admissão, e a apuração
--      do ponto da equipe precisa do turno.
--   3. FICHA PESSOAL — a pessoa e o RH: telefone, e-mail, observações,
--      login, "precisa trocar senha".
--   Nunca pela API: a conta de acesso e a senha de ativação.
--
-- COMO:
--   · a leitura direta da tabela vira só as colunas do nível 1 (permissão
--     por coluna, no banco — não na tela);
--   · `minha_ficha()` devolve a ficha inteira da própria pessoa;
--   · `fichas_reservadas()` devolve os níveis 2 e 3 de quem a pessoa pode
--     ver (o 3 só dela mesma e para o RH);
--   · o canal ao vivo deixa de transmitir a ficha: transmite só um número
--     que muda (`colaboradores_versao`), e o aparelho busca de novo o que
--     pode ver.
--
-- Medido antes (Postgres local): com a trava por coluna o `upsert` do RH é
-- recusado — por isso o app passa a gravar com insert e, se já existir,
-- update. As funções do servidor usam a chave de serviço e não mudam.
--
-- Pode rodar de novo.
-- ============================================================

-- As três colunas que a produção tem e o esquema não tinha
alter table public.colaboradores
  add column if not exists carga_semanal_minutos integer,
  add column if not exists trabalha_sabado       boolean,
  add column if not exists tem_intervalo         boolean;

-- ------------------------------------------------------------
-- 1. A FICHA INTEIRA DE QUEM PERGUNTA
-- ------------------------------------------------------------
create or replace function public.minha_ficha()
returns setof public.colaboradores
language sql
stable
security definer
set search_path = public
as $$
  select * from public.colaboradores where id = public.meu_colaborador_id();
$$;

-- ------------------------------------------------------------
-- 2. OS NÍVEIS 2 E 3 DE QUEM A PESSOA PODE VER
--
-- Nível 2: a própria pessoa, quem ela pode decidir (a mesma alçada do
-- ponto, `posso_decidir_jornada`) e, para o RH, todos. Nível 3: só a
-- própria pessoa e o RH — para o líder, essas colunas voltam vazias.
-- ------------------------------------------------------------
create or replace function public.fichas_reservadas()
returns table (
  id                            text,
  matricula                     text,
  cnpj                          text,
  data_admissao                 text,
  departamento                  text,
  carga_horaria_diaria_minutos  integer,
  carga_semanal_minutos         integer,
  trabalha_sabado               boolean,
  tem_intervalo                 boolean,
  turno                         text,
  turno_confirmado_em           timestamptz,
  telefone                      text,
  email                         text,
  observacoes                   text,
  login                         text,
  precisa_trocar_senha          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select public.meu_colaborador_id() as id, public.cuido_de_pessoas() as rh)
  select c.id,
         c.matricula, c.cnpj, c.data_admissao, c.departamento,
         c.carga_horaria_diaria_minutos, c.carga_semanal_minutos, c.trabalha_sabado, c.tem_intervalo,
         c.turno, c.turno_confirmado_em,
         case when c.id = eu.id or eu.rh then c.telefone end,
         case when c.id = eu.id or eu.rh then c.email end,
         case when c.id = eu.id or eu.rh then c.observacoes end,
         case when c.id = eu.id or eu.rh then c.login end,
         case when c.id = eu.id or eu.rh then c.precisa_trocar_senha end
    from public.colaboradores c, eu
   where eu.id is not null
     and (c.id = eu.id or eu.rh or public.posso_decidir_jornada(c.id));
$$;

revoke all on function public.minha_ficha() from public, anon;
grant execute on function public.minha_ficha() to authenticated;
revoke all on function public.fichas_reservadas() from public, anon;
grant execute on function public.fichas_reservadas() to authenticated;

-- ------------------------------------------------------------
-- 3. A TRAVA POR COLUNA
--
-- Numa função, para o banco local dos testes reaplicá-la depois de dar
-- acesso a tudo (scripts/bancoLocal.ts): assim a suíte inteira roda com
-- a trava, e o que dependesse de coluna travada apareceria lá.
-- ------------------------------------------------------------
create or replace function public.travar_colunas_da_ficha()
returns void
language plpgsql
set search_path = public
as $$
begin
  revoke select on public.colaboradores from authenticated, anon;
  grant select (
    id, nome, cargo, setor, loja, nivel, foto, presenca, visto_por_ultimo,
    ramal, responsavel_id, ativo, criado_em
  ) on public.colaboradores to authenticated;
end;
$$;

revoke all on function public.travar_colunas_da_ficha() from public, anon, authenticated;

select public.travar_colunas_da_ficha();

-- ------------------------------------------------------------
-- 4. O CANAL AO VIVO TRANSMITE UM NÚMERO, NÃO A FICHA
-- ------------------------------------------------------------
create table if not exists public.colaboradores_versao (
  id          boolean primary key default true check (id),
  versao      bigint not null default 0,
  alterado_em timestamptz not null default now()
);
insert into public.colaboradores_versao (id) values (true) on conflict (id) do nothing;

alter table public.colaboradores_versao enable row level security;
drop policy if exists colaboradores_versao_leitura on public.colaboradores_versao;
create policy colaboradores_versao_leitura on public.colaboradores_versao
  for select to authenticated using (true);

create or replace function public.sinalizar_mudanca_nas_fichas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.colaboradores_versao set versao = versao + 1, alterado_em = now() where id;
  return null;
end;
$$;

drop trigger if exists colaboradores_sinalizar_mudanca on public.colaboradores;
create trigger colaboradores_sinalizar_mudanca
  after insert or update or delete on public.colaboradores
  for each statement
  execute function public.sinalizar_mudanca_nas_fichas();

do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'colaboradores'
  ) then
    alter publication supabase_realtime drop table public.colaboradores;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'colaboradores_versao'
  ) then
    alter publication supabase_realtime add table public.colaboradores_versao;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. OS CUPONS CONTINUAM LENDO O LOGIN
--
-- (Esta seção repete, para a produção, a versão de
-- senha-de-ativacao-aleatoria.sql — é lá que ela mora no esquema.)
-- A lista dos cupons rodava com a permissão de quem chama e lia o login,
-- que agora sai da leitura direta: o RH ficaria sem cupons. Roda como dono
-- e confere quem chama.
-- ------------------------------------------------------------
create or replace function public.senhas_para_entregar()
returns table (colaborador_id text, nome text, login text, loja text, setor text, senha text, gerada_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nome, c.login, c.loja, c.setor, s.senha, s.gerada_em
    from public.senhas_de_ativacao s
    join public.colaboradores c on c.id = s.colaborador_id
   where public.cuido_de_pessoas()
     and c.auth_user_id is null
     and c.ativo
   order by c.loja, c.nome;
$$;

revoke all on function public.senhas_para_entregar() from public, anon;
grant execute on function public.senhas_para_entregar() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   le_telefone_direto ........ false   (a coluna pessoal saiu da leitura direta)
--   le_nome_direto ............ true    (o diretório continua)
--   funcoes_da_ficha .......... 2
--   ficha_no_canal_ao_vivo .... false   (o canal não transmite mais a ficha)
--   sinal_no_canal_ao_vivo .... true
-- ============================================================
select
  has_column_privilege('authenticated', 'public.colaboradores', 'telefone', 'select')       as le_telefone_direto,
  has_column_privilege('authenticated', 'public.colaboradores', 'nome', 'select')           as le_nome_direto,
  (select count(*) from pg_proc where proname in ('minha_ficha', 'fichas_reservadas'))     as funcoes_da_ficha,
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
           and tablename = 'colaboradores')                                                 as ficha_no_canal_ao_vivo,
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
           and tablename = 'colaboradores_versao')                                          as sinal_no_canal_ao_vivo;
