-- ============================================================
-- O SALDO DE COMPENSAÇÃO DO SÁBADO, MÊS A MÊS (01/10/2026)
--
-- A jornada é de 8h (CLT); os 10 minutos diários do turno integral são a
-- compensação com que a pessoa paga a folga de sábado. Até aqui ela só
-- existia dentro do mês: a Fernanda combinou com o Raphael de não folgar
-- em setembro e folgar em outubro, e as 3h30 de setembro não tinham como
-- chegar a outubro.
--
-- Uma linha por pessoa por mês FECHADO, gravada pela apuração da
-- madrugada (`apurar-ponto`, com a chave de serviço):
--
--   saldo_final = anterior + juntada − consumida
--   consumida   = o menor entre (anterior + juntada) e 4h × folgas
--
-- O saldo final de um mês é o "anterior" do seguinte. Ninguém grava pelo
-- aplicativo: não há política de escrita, só de leitura — a mesma de quem
-- enxerga as apurações (a própria pessoa e quem decide a jornada dela).
--
-- Este arquivo é o delta; o esquema inteiro está em esquema.sql.
-- ============================================================

create table if not exists public.compensacao_sabado (
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  -- AAAA-MM
  -- Sem cifrão na expressão: o conferidor de delimitadores o lê como corpo quebrado
  mes             text not null check (length(mes) = 7 and mes ~ '^[0-9]{4}-[0-9]{2}'),
  anterior        integer not null default 0 check (anterior >= 0),
  juntada         integer not null default 0 check (juntada >= 0),
  folgas          integer not null default 0 check (folgas >= 0),
  consumida       integer not null default 0 check (consumida >= 0),
  saldo_final     integer not null default 0 check (saldo_final >= 0),
  atualizado_em   timestamptz not null default now(),
  primary key (colaborador_id, mes)
);

alter table public.compensacao_sabado enable row level security;

drop policy if exists compensacao_leitura on public.compensacao_sabado;
create policy compensacao_leitura on public.compensacao_sabado
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.posso_decidir_jornada(colaborador_id)
  );

notify pgrst, 'reload schema';

-- Conferência: a tabela existe, com a segurança ligada e uma política
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'compensacao_sabado') as tabela_criada,
  (select relrowsecurity from pg_class where relname = 'compensacao_sabado') as seguranca_ligada,
  (select count(*) from pg_policies where tablename = 'compensacao_sabado') as politicas;
