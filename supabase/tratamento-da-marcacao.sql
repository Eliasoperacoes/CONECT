-- ============================================================
-- SUBSTITUÍDO por registrador-por-estabelecimento.sql (07/10/2026).
--
-- Este script redefine peças do ponto (a batida, o carimbo, a marcação
-- original ou a fila) numa versão anterior. Rodado depois do registrador
-- novo, ele criaria uma segunda versão das funções — e a batida pararia.
-- A trava abaixo para o script antes de ele mudar qualquer coisa.
-- ============================================================
do $$
begin
  if to_regclass('public.contador_nsr_estabelecimento') is not null then
    raise exception 'tratamento-da-marcacao.sql foi substituído por registrador-por-estabelecimento.sql. Não rode este arquivo de novo.';
  end if;
end $$;

-- ============================================================
-- O TRATAMENTO DA MARCAÇÃO FORA DA JORNADA (07/10/2026)
--
-- Etapa 1 da homologação, parte final. Depende de marcacao-original.sql.
--
-- A marcação que não coube na jornada (domingo, quinta batida, fora de
-- ordem, repetida) fica registrada como original e espera quem responde
-- pela pessoa. Quem decide escolhe, com justificativa:
--
--   · INCLUIR NA JORNADA como entrada, saída...: vira uma correção no
--     tratamento (`registros_ponto`), com a hora DA ORIGINAL. A apuração
--     segue o caminho de sempre — o domingo trabalhado vira hora extra
--     para aprovar (medido na apuração da madrugada, 07/10/2026).
--   · DESCONSIDERAR: fica registrado que foi vista e não conta.
--
-- A decisão é uma linha própria, que não se altera nem se apaga — é dela
-- que o AEJ (etapa 2) lê o tratamento. A original continua intocada.
-- A alçada é a do banco, e só ela: o RH e quem responde pela pessoa
-- (`posso_decidir_jornada` — que deixa o líder decidir a própria jornada,
-- como na fila de aprovação). Uma segunda regra aqui divergiria dela.
--
-- Pode rodar de novo. Termina com a conferência.
-- ============================================================

create table if not exists public.tratamento_marcacao (
  nsr                bigint primary key references public.marcacoes_originais(nsr) on delete restrict,
  decisao            text not null check (decisao in ('incluida', 'desconsiderada')),
  -- Como entrou na jornada; vazio quando desconsiderada
  tipo               text check (tipo in ('entrada', 'saida_almoco', 'retorno_almoco', 'saida')),
  -- A correção criada no tratamento, quando incluída
  registro_id        text,
  justificativa      text not null check (length(trim(justificativa)) > 0),
  decidido_por_id    text references public.colaboradores(id) on delete set null,
  decidido_por_nome  text not null,
  decidido_em        timestamptz not null default now(),
  check ((decisao = 'incluida') = (tipo is not null))
);

alter table public.tratamento_marcacao enable row level security;

-- Lê quem lê a original: a pessoa (vê o que fizeram da marcação dela), o
-- RH e quem responde por ela. Grava só a função abaixo.
drop policy if exists tratamento_leitura on public.tratamento_marcacao;
create policy tratamento_leitura on public.tratamento_marcacao
  for select to authenticated
  using (
    exists (
      select 1 from public.marcacoes_originais o
       where o.nsr = tratamento_marcacao.nsr
         and (
           o.colaborador_id = public.meu_colaborador_id()
           or public.cuido_de_pessoas()
           or public.posso_decidir_jornada(o.colaborador_id)
         )
    )
  );

-- A decisão não se altera nem se apaga, como a original
create or replace function public.decisao_do_tratamento_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'A decisão sobre a marcação não se altera nem se apaga. Se precisar, corrija a jornada no Banco de horas.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists tratamento_marcacao_imutavel on public.tratamento_marcacao;
create trigger tratamento_marcacao_imutavel
  before update or delete on public.tratamento_marcacao
  for each row execute function public.decisao_do_tratamento_imutavel();

drop trigger if exists tratamento_marcacao_sem_truncate on public.tratamento_marcacao;
create trigger tratamento_marcacao_sem_truncate
  before truncate on public.tratamento_marcacao
  for each statement execute function public.decisao_do_tratamento_imutavel();

-- ------------------------------------------------------------
-- AS QUE ESPERAM DECISÃO, para quem pode decidir
--
-- Roda como quem chama: a RLS da original diz o que ela enxerga, e a
-- alçada do banco diz o que ela decide.
-- ------------------------------------------------------------
create or replace function public.marcacoes_para_tratar()
returns setof public.marcacoes_originais
language sql stable set search_path = public as $$
  select o.*
    from public.marcacoes_originais o
   where o.fora_da_jornada is not null
     and (public.cuido_de_pessoas() or public.posso_decidir_jornada(o.colaborador_id))
     and not exists (select 1 from public.tratamento_marcacao t where t.nsr = o.nsr)
   order by o.registrado_em;
$$;

revoke all on function public.marcacoes_para_tratar() from public, anon;
grant execute on function public.marcacoes_para_tratar() to authenticated;

-- ------------------------------------------------------------
-- A DECISÃO
-- ------------------------------------------------------------
create or replace function public.tratar_marcacao(
  p_nsr bigint,
  p_decisao text,
  p_tipo text,
  p_justificativa text
) returns public.tratamento_marcacao
language plpgsql volatile security definer set search_path = public as $$
declare
  eu public.colaboradores;
  o public.marcacoes_originais;
  v_registro text;
  t public.tratamento_marcacao;
begin
  select * into eu from public.colaboradores where id = public.meu_colaborador_id();
  if eu.id is null then
    raise exception 'Sessão sem cadastro. Saia e entre de novo.' using errcode = 'P0001';
  end if;

  select * into o from public.marcacoes_originais where nsr = p_nsr;
  if o.nsr is null then
    raise exception 'Marcação não encontrada.' using errcode = 'P0001';
  end if;
  if o.fora_da_jornada is null then
    raise exception 'Esta marcação já está na jornada.' using errcode = 'P0001';
  end if;
  if not (public.cuido_de_pessoas() or public.posso_decidir_jornada(o.colaborador_id)) then
    raise exception 'Você não responde pela jornada desta pessoa.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tratamento_marcacao where nsr = p_nsr) then
    raise exception 'Esta marcação já foi tratada.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_justificativa, ''))) = 0 then
    raise exception 'Informe a justificativa.' using errcode = 'P0001';
  end if;

  if p_decisao = 'incluida' then
    if p_tipo is null or not (p_tipo = any (array['entrada', 'saida_almoco', 'retorno_almoco', 'saida'])) then
      raise exception 'Escolha como a marcação entra na jornada.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.registros_ponto r
       where r.colaborador_id = o.colaborador_id and r.data = o.data and r.tipo = p_tipo
    ) then
      raise exception 'Já existe essa marcação neste dia. Para trocar o horário, corrija a jornada no Banco de horas.'
        using errcode = 'P0001';
    end if;

    v_registro := 'ponto-' || replace(gen_random_uuid()::text, '-', '');
    -- Uma correção como as do RH: sem NSR (o gatilho cuida), com a hora da original
    insert into public.registros_ponto
      (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja,
       ajustado_por_id, ajustado_por_nome, justificativa, criado_em)
    values
      (v_registro, o.colaborador_id, o.data, p_tipo, o.registrado_em,
       to_char(o.registrado_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
       case when public.cuido_de_pessoas() then 'ajuste_rh' else 'ajuste_lider' end,
       o.loja, eu.id, eu.nome,
       'Marcação NSR ' || o.nsr || ' incluída: ' || trim(p_justificativa), now());
  elsif p_decisao <> 'desconsiderada' then
    raise exception 'Decisão desconhecida.' using errcode = 'P0001';
  end if;

  insert into public.tratamento_marcacao
    (nsr, decisao, tipo, registro_id, justificativa, decidido_por_id, decidido_por_nome)
  values
    (o.nsr, p_decisao, case when p_decisao = 'incluida' then p_tipo end, v_registro,
     trim(p_justificativa), eu.id, eu.nome)
  returning * into t;

  return t;
end;
$$;

revoke all on function public.tratar_marcacao(bigint, text, text, text) from public, anon;
grant execute on function public.tratar_marcacao(bigint, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Conferência: tudo true, e quantas esperam decisão hoje
-- ------------------------------------------------------------
select
  to_regclass('public.tratamento_marcacao') is not null as tabela_tratamento,
  exists (select 1 from pg_trigger where tgname = 'tratamento_marcacao_imutavel') as trava_da_decisao,
  exists (select 1 from pg_proc where proname = 'tratar_marcacao') as funcao_decidir,
  exists (select 1 from pg_proc where proname = 'marcacoes_para_tratar') as funcao_listar,
  (select count(*) from public.marcacoes_originais o
    where o.fora_da_jornada is not null
      and not exists (select 1 from public.tratamento_marcacao t where t.nsr = o.nsr)) as esperando_decisao;
