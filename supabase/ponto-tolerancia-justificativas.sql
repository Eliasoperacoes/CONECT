-- ============================================================
-- CONECTA — TOLERÂNCIA, MOTIVO NA BATIDA E AUSÊNCIA JUSTIFICADA
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--
-- O QUE MUDA
--
-- 1. A apuração ganha ORIGEM: o que entrou pela tolerância diária não teve
--    aprovador humano, e o espelho precisa conseguir dizer isso.
-- 2. A apuração ganha o MOTIVO e o ANEXO que o colaborador informou no ato
--    da batida — sem eles o aprovador decide vendo só um número.
-- 3. Nasce a tabela de AUSÊNCIA JUSTIFICADA: atestado, falta e
--    comparecimento, que não passam por batida nenhuma.
-- 4. A tolerância vira parâmetro da rede, editável pelo TI sem deploy.
-- ============================================================

-- ------------------------------------------------------------
-- 1 e 2. APURAÇÃO
-- ------------------------------------------------------------
alter table public.ajustes_jornada
  add column if not exists origem             text not null default 'pendencia',
  add column if not exists motivo_colaborador text,
  add column if not exists anexo_caminho      text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ajustes_jornada_origem_check'
  ) then
    alter table public.ajustes_jornada
      add constraint ajustes_jornada_origem_check
      check (origem in ('pendencia', 'tolerancia_automatica'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. PARÂMETROS DO PONTO
--
-- Na tabela de configuração que já existe, e não numa nova: é configuração
-- da rede, do mesmo tipo das que já moram lá, e uma tabela a mais seria um
-- segundo lugar para procurar a mesma coisa.
-- ------------------------------------------------------------
alter table public.configuracoes
  add column if not exists tolerancia_ponto_minutos        integer not null default 10,
  add column if not exists horario_entrada_padrao          text    not null default '08:00',
  add column if not exists intervalo_almoco_padrao_minutos integer not null default 60;

-- Tolerância negativa faria TODO dia virar pendência — o oposto do que ela
-- existe para fazer. O banco recusa antes de a tela precisar se preocupar.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'configuracoes_tolerancia_check'
  ) then
    alter table public.configuracoes
      add constraint configuracoes_tolerancia_check
      check (tolerancia_ponto_minutos between 0 and 120);
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. AUSÊNCIA JUSTIFICADA
--
-- Um atestado de 3 dias é UMA solicitação com início e fim, não três
-- pedidos — quem aprova decide uma vez, sobre o documento inteiro.
-- ------------------------------------------------------------
create table if not exists public.justificativas_ausencia (
  id              text primary key,
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  data_inicio     date not null,
  data_fim        date not null,
  tipo            text not null check (
                    tipo in ('atestado', 'falta_justificada', 'comparecimento', 'outro')
                  ),
  observacao      text,
  anexo_caminho   text,
  anexo_nome      text,
  estado          text not null default 'pendente' check (
                    estado in ('pendente', 'aprovada', 'recusada')
                  ),
  aprovador_id    text references public.colaboradores(id) on delete set null,
  aprovador_nome  text,
  decidido_em     timestamptz,
  motivo_recusa   text,
  criado_em       timestamptz not null default now(),
  -- Fim antes do início seria um período negativo, e o abono de dias
  -- percorreria o intervalo ao contrário
  constraint justificativas_periodo_valido check (data_fim >= data_inicio)
);

create index if not exists justificativas_por_colaborador
  on public.justificativas_ausencia (colaborador_id, data_inicio desc);

alter table public.justificativas_ausencia enable row level security;

-- LEITURA — protege a invariante 5: quem aprova é quem acompanha.
-- A própria pessoa vê as dela; quem responde por ela vê as dela; RH,
-- Diretoria e TI veem a rede. Ninguém mais.
drop policy if exists justificativas_leitura on public.justificativas_ausencia;
create policy justificativas_leitura on public.justificativas_ausencia
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.posso_decidir_jornada(colaborador_id)
  );

-- CRIAÇÃO — protege a invariante 3: a solicitação nasce da própria pessoa,
-- sempre pendente. Ninguém abre solicitação já aprovada, nem em nome de
-- outro. O RH também cria, porque às vezes o atestado chega na mão dele.
drop policy if exists justificativas_abertura on public.justificativas_ausencia;
create policy justificativas_abertura on public.justificativas_ausencia
  for insert to authenticated
  with check (
    (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
    or public.cuido_de_pessoas()
  );

-- DECISÃO — protege as invariantes 1 e 4: só quem responde pela pessoa
-- decide, e a regra vale no BANCO, não só no botão da tela.
-- `posso_decidir_jornada` já recusa a si mesmo, então ninguém aprova a
-- própria justificativa nem sendo Diretoria ou TI.
drop policy if exists justificativas_decisao on public.justificativas_ausencia;
create policy justificativas_decisao on public.justificativas_ausencia
  for update to authenticated
  using (
    public.posso_decidir_jornada(colaborador_id)
    -- O dono corrige a própria solicitação enquanto ninguém decidiu
    or (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
  )
  with check (
    public.posso_decidir_jornada(colaborador_id)
    or (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
  );

-- REMOÇÃO — atestado recusado vira histórico, não lixo. Só o RH apaga.
drop policy if exists justificativas_remocao on public.justificativas_ausencia;
create policy justificativas_remocao on public.justificativas_ausencia
  for delete to authenticated using (public.cuido_de_pessoas());

-- Realtime: a decisão do gestor precisa chegar no aparelho de quem pediu
-- sem a pessoa ficar recarregando a tela
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'justificativas_ausencia'
  ) then
    alter publication supabase_realtime add table public.justificativas_ausencia;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — tudo true, e politicas_da_tabela = 4
-- ============================================================
select
  exists (
    select 1 from information_schema.columns
     where table_name = 'ajustes_jornada' and column_name = 'origem'
  ) as apuracao_tem_origem,
  exists (
    select 1 from information_schema.columns
     where table_name = 'ajustes_jornada' and column_name = 'motivo_colaborador'
  ) as apuracao_tem_motivo,
  exists (
    select 1 from information_schema.columns
     where table_name = 'configuracoes' and column_name = 'tolerancia_ponto_minutos'
  ) as tolerancia_configuravel,
  exists (
    select 1 from information_schema.tables
     where table_name = 'justificativas_ausencia'
  ) as tabela_de_ausencia,
  (
    select relrowsecurity from pg_class where relname = 'justificativas_ausencia'
  ) as ausencia_com_rls_ligada,
  (
    select count(*) from pg_policies where tablename = 'justificativas_ausencia'
  ) as politicas_da_tabela;
