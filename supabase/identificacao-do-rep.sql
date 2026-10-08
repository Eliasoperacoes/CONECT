-- ============================================================
-- A IDENTIFICAÇÃO DO REP-P (07/10/2026)
--
-- Homologação, etapa 2. O que o AFD (cabeçalho, campos 7, 12 e 13) e o
-- AEJ (registros "02" e "08") pedem sobre o PRÓPRIO SISTEMA, e não sobre
-- o empregador: o número de registro no INPI, quem desenvolveu e o nome e
-- a versão do programa.
--
-- O documento do desenvolvedor é dado pessoal quando é CPF: fica aqui,
-- legível só por quem cuida de pessoas — nunca no repositório. O
-- preenchimento vai num arquivo à parte, fora do git.
--
-- Uma linha só. Pode rodar de novo. Termina com a conferência.
-- ============================================================

create table if not exists public.identificacao_rep (
  id                       boolean primary key default true check (id),
  -- Só os dígitos do registro no INPI (pergunta 49 do Ministério); vazio até sair
  inpi                     text check (inpi is null or inpi !~ '[^0-9]'),
  -- "1": CNPJ; "2": CPF
  desenvolvedor_tipo       text not null check (desenvolvedor_tipo in ('1', '2')),
  desenvolvedor_documento  text not null check (desenvolvedor_documento !~ '[^0-9]'
                             and length(desenvolvedor_documento) in (11, 14)),
  desenvolvedor_nome       text not null check (length(trim(desenvolvedor_nome)) > 0),
  desenvolvedor_email      text,
  programa_nome            text not null default 'CONECTA',
  programa_versao          text not null default '1.0',
  atualizado_em            timestamptz not null default now(),
  check ((desenvolvedor_tipo = '2') = (length(desenvolvedor_documento) = 11))
);

alter table public.identificacao_rep enable row level security;

drop policy if exists identificacao_rep_leitura on public.identificacao_rep;
create policy identificacao_rep_leitura on public.identificacao_rep
  for select to authenticated using (public.cuido_de_pessoas());

drop policy if exists identificacao_rep_escrita on public.identificacao_rep;
create policy identificacao_rep_escrita on public.identificacao_rep
  for all to authenticated using (public.sou_admin()) with check (public.sou_admin());

notify pgrst, 'reload schema';

-- Conferência: a tabela existe, e se já tem a identificação (sem mostrar o documento)
select
  to_regclass('public.identificacao_rep') is not null as tabela,
  (select count(*) from public.identificacao_rep) as preenchida,
  (select inpi is not null from public.identificacao_rep) as tem_inpi,
  (select desenvolvedor_email is not null from public.identificacao_rep) as tem_email;
