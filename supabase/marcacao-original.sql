-- ============================================================
-- A MARCAÇÃO ORIGINAL — o registro legal do ponto (07/10/2026)
--
-- Etapa 1 da homologação (Portaria MTP 671/2021, ponto por programa —
-- REP-P). A Portaria proíbe ALTERAR ou ELIMINAR o que a pessoa marcou,
-- e proíbe RESTRINGIR a marcação. Até aqui a batida morava numa tabela
-- só (`registros_ponto`), que o RH corrigia e apagava, e o apagar de um
-- colaborador levava as batidas junto.
--
-- O QUE ESTE SCRIPT FAZ — só acrescenta; nada do que funciona muda:
--
--   1. `marcacoes_originais`: a marcação como foi feita. Nasce junto da
--      batida, dentro do gatilho da própria tabela de batidas — então
--      QUALQUER versão de `bater_ponto` a gera. Não se altera, não se
--      apaga, e o colaborador que a tem não pode ser excluído.
--   2. NSR sem buracos: um contador próprio, que volta atrás junto com a
--      batida que falha. Correção, lançamento e preenchimento pelo turno
--      NÃO ganham NSR: são tratamento, não marcação.
--   3. `registros_ponto` continua sendo o que as telas, a apuração e o
--      espelho usam — passa a ser o TRATAMENTO. O RH segue corrigindo ali,
--      com justificativa; a original fica intacta ao lado.
--   4. `registrar_marcacao`: a batida que nunca é recusada. Domingo,
--      quinta batida, fora de ordem, repetida: a original é registrada e
--      vai para o RH tratar; a jornada não muda sozinha.
--   5. Só batida do servidor entra como QR: o RH não grava marcação com
--      método de batida, nem transforma correção em batida.
--
-- Pode rodar de novo: tudo é "se não existe" ou "substitui".
-- Termina com a conferência.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A TABELA DA MARCAÇÃO ORIGINAL
-- ------------------------------------------------------------
create table if not exists public.marcacoes_originais (
  nsr                 bigint primary key,
  -- RESTRICT, e não cascade: colaborador com marcação não se exclui, se desativa
  colaborador_id      text not null references public.colaboradores(id) on delete restrict,
  registrado_em       timestamptz not null,
  -- O dia em Brasília, como o da batida
  data                date not null,
  loja                text not null,
  metodo              text not null check (metodo in ('qrcode', 'codigo_manual')),
  cnpj_empregador     text not null default '',
  codigo_verificacao  text not null,
  -- A linha do tratamento criada junto; vazio quando ficou fora da jornada.
  -- Sem chave estrangeira: o tratamento pode ser removido, a original não.
  registro_id         text,
  -- A marcação que o aplicativo esperava (entrada, saída...), se havia
  tipo_pedido         text,
  -- Por que não entrou na jornada: domingo, jornada_completa, fora_de_ordem,
  -- repetida. Vazio quando entrou.
  fora_da_jornada     text check (fora_da_jornada in ('domingo', 'jornada_completa', 'fora_de_ordem', 'repetida'))
);

create index if not exists marcacoes_originais_por_pessoa
  on public.marcacoes_originais (colaborador_id, data);
create unique index if not exists marcacoes_originais_por_registro
  on public.marcacoes_originais (registro_id) where registro_id is not null;

alter table public.marcacoes_originais enable row level security;

-- Lê quem lê o ponto: a própria pessoa, o RH e quem responde por ela.
-- Nenhuma política de gravação: só as funções do banco gravam aqui.
drop policy if exists originais_leitura on public.marcacoes_originais;
create policy originais_leitura on public.marcacoes_originais
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.cuido_de_pessoas()
    or public.posso_decidir_jornada(colaborador_id)
  );

-- ------------------------------------------------------------
-- 2. O CONTADOR DO NSR, SEM BURACOS
--
-- A sequência do Postgres gasta o número mesmo quando a gravação falha
-- (a batida repetida, por exemplo). Este contador é uma linha travada na
-- mesma transação: falhou, o número volta. Começa depois do maior NSR já
-- dado, para nenhum comprovante emitido repetir número.
-- ------------------------------------------------------------
create table if not exists public.contador_nsr (
  id      int primary key default 1 check (id = 1),
  ultimo  bigint not null
);
alter table public.contador_nsr enable row level security;

insert into public.contador_nsr (id, ultimo)
values (1, (select coalesce(max(nsr), 0) from public.registros_ponto))
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3. A TRAVA: original não se altera nem se apaga
--
-- Vale até para a chave de serviço. A única troca aceita é a de DONO,
-- feita pela fusão de cadastro repetido (esquema.sql): o mesmo horário,
-- o mesmo NSR, o mesmo código — só a ficha certa no lugar da fantasma.
-- ------------------------------------------------------------
create or replace function public.marcacao_original_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'Marcação original não se apaga (Portaria 671/2021). A correção é feita no tratamento do ponto.'
      using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'colaborador_id') is distinct from (to_jsonb(old) - 'colaborador_id') then
    raise exception 'Marcação original não se altera (Portaria 671/2021). A correção é feita no tratamento do ponto.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists marcacao_original_imutavel on public.marcacoes_originais;
create trigger marcacao_original_imutavel
  before update or delete on public.marcacoes_originais
  for each row execute function public.marcacao_original_imutavel();

drop trigger if exists marcacao_original_sem_truncate on public.marcacoes_originais;
create trigger marcacao_original_sem_truncate
  before truncate on public.marcacoes_originais
  for each statement execute function public.marcacao_original_imutavel();

-- ------------------------------------------------------------
-- 4. UMA MARCAÇÃO ORIGINAL NOVA — escrita UMA vez, aqui
-- ------------------------------------------------------------
create or replace function public.nova_marcacao_original(
  p_colaborador text,
  p_registrado  timestamptz,
  p_loja        text,
  p_metodo      text,
  p_registro_id text,
  p_tipo_pedido text,
  p_fora        text
) returns public.marcacoes_originais
language plpgsql security definer set search_path = public as $$
declare
  v_nsr   bigint;
  v_cnpj  text;
  v_data  date := (p_registrado at time zone 'America/Sao_Paulo')::date;
  nova    public.marcacoes_originais;
begin
  update public.contador_nsr set ultimo = ultimo + 1 where id = 1 returning ultimo into v_nsr;
  if v_nsr is null then
    raise exception 'Contador do NSR ausente. Rode marcacao-original.sql.' using errcode = 'P0001';
  end if;

  select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') into v_cnpj
    from public.colaboradores where id = p_colaborador;

  insert into public.marcacoes_originais
    (nsr, colaborador_id, registrado_em, data, loja, metodo, cnpj_empregador,
     codigo_verificacao, registro_id, tipo_pedido, fora_da_jornada)
  values
    (v_nsr, p_colaborador, p_registrado, v_data, p_loja, p_metodo, coalesce(v_cnpj, ''),
     public.codigo_da_batida(v_nsr, v_cnpj, v_data, p_registrado, p_colaborador),
     p_registro_id, p_tipo_pedido, p_fora)
  returning * into nova;

  return nova;
end;
$$;

revoke all on function public.nova_marcacao_original(text, timestamptz, text, text, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. O CARIMBO DA BATIDA — agora a original nasce aqui
--
--   · Batida de QR (ou código digitado): cria a original e copia o NSR,
--     a hora e o código para a linha do tratamento — o comprovante de
--     hoje continua lendo dali, sem mudar.
--   · Correção, lançamento e preenchimento: tratamento. Sem NSR e sem
--     código; a hora registrada é a da correção, e não a informada.
--   · Alteração: o carimbo de antes volta (como já era), e uma linha não
--     vira — nem continua — "batida de QR" com outro dia, hora ou tipo.
-- ------------------------------------------------------------
create or replace function public.carimbar_batida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cnpj text;
  o      public.marcacoes_originais;
begin
  if tg_op = 'UPDATE' then
    new.nsr := old.nsr;
    new.registrado_em := old.registrado_em;
    new.cnpj_empregador := old.cnpj_empregador;
    new.codigo_verificacao := old.codigo_verificacao;
    if new.metodo in ('qrcode', 'codigo_manual') and (
      old.metodo not in ('qrcode', 'codigo_manual')
      or new.horario is distinct from old.horario
      or new.tipo is distinct from old.tipo
      or new.data is distinct from old.data
    ) then
      raise exception 'Batida corrigida é correção: grave como ajuste, nunca como batida do QR.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.metodo in ('qrcode', 'codigo_manual') then
    o := public.nova_marcacao_original(
      new.colaborador_id, coalesce(new.horario, now()), new.loja, new.metodo, new.id, new.tipo, null);
    new.nsr := o.nsr;
    new.registrado_em := o.registrado_em;
    new.cnpj_empregador := o.cnpj_empregador;
    new.codigo_verificacao := o.codigo_verificacao;
    return new;
  end if;

  select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') into v_cnpj
    from public.colaboradores where id = new.colaborador_id;
  new.nsr := null;
  new.codigo_verificacao := null;
  new.cnpj_empregador := v_cnpj;
  new.registrado_em := now();
  return new;
end;
$$;

drop trigger if exists carimbar_batida on public.registros_ponto;
create trigger carimbar_batida
  before insert or update on public.registros_ponto
  for each row execute function public.carimbar_batida();

-- ------------------------------------------------------------
-- 6. SÓ A BATIDA DO SERVIDOR ENTRA COMO QR
--
-- O RH lançava marcação com qualquer método — inclusive "qrcode", que é
-- o da batida. Agora quem grava direto na tabela grava só correção ou
-- preenchimento; a batida entra pela `bater_ponto`, que roda como dona.
-- ------------------------------------------------------------
drop policy if exists ponto_batida on public.registros_ponto;
create policy ponto_batida on public.registros_ponto
  for insert to authenticated
  with check (
    (
      public.cuido_de_pessoas()
      and metodo in ('ajuste_rh', 'ajuste_lider', 'preenchimento_turno')
    )
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo in ('ajuste_lider', 'preenchimento_turno')
    )
  );

-- ------------------------------------------------------------
-- 7. A BATIDA QUE NUNCA É RECUSADA
--
-- A Portaria proíbe restringir a marcação. Domingo, a quinta batida do
-- dia, a fora de ordem e a repetida eram recusadas; agora a original é
-- registrada, com o comprovante, e o motivo vai junto para o RH tratar.
-- O código da loja continua conferido: sem ele não há local nem prova.
--
-- `bater_ponto` continua existindo, igual, para o aplicativo aberto antes
-- desta publicação; o aplicativo novo chama esta.
-- ------------------------------------------------------------
create or replace function public.registrar_marcacao(p_codigo text, p_loja text, p_tipo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  eu public.colaboradores;
  agora timestamptz := now();
  em_brasilia timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  ordem text[] := array['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
  codigo_lido text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  v_tipo text := case when p_tipo = any (array['entrada', 'saida_almoco', 'retorno_almoco', 'saida']) then p_tipo end;
  v_loja text;
  v_metodo text;
  v_motivo text;
  novo public.registros_ponto;
  o public.marcacoes_originais;
begin
  select * into eu from public.colaboradores where id = public.meu_colaborador_id();
  if eu.id is null then
    raise exception 'Sessão sem cadastro. Saia e entre de novo para bater o ponto.' using errcode = 'P0001';
  end if;
  if not eu.ativo then
    raise exception 'Esta conta está desativada. Procure o RH.' using errcode = 'P0001';
  end if;

  if coalesce(p_loja, '') <> '' then
    select c.loja into v_loja from public.codigos_ponto_loja c
     where c.loja = p_loja and upper(c.codigo) = codigo_lido;
    v_metodo := 'qrcode';
  else
    select c.loja into v_loja from public.codigos_ponto_loja c
     where upper(c.codigo) = codigo_lido
     limit 1;
    v_metodo := 'codigo_manual';
  end if;
  if v_loja is null then
    raise exception 'Código não reconhecido. Use o QR afixado na sua loja.' using errcode = 'P0001';
  end if;

  v_motivo := case
    when extract(dow from em_brasilia) = 0 then 'domingo'
    when v_tipo is null then 'jornada_completa'
    when exists (
      select 1 from public.registros_ponto r
       where r.colaborador_id = eu.id and r.data = hoje and r.tipo = v_tipo
    ) then 'repetida'
    when exists (
      select 1 from public.registros_ponto r
       where r.colaborador_id = eu.id and r.data = hoje
         and array_position(ordem, r.tipo) > array_position(ordem, v_tipo)
    ) or (
      v_tipo <> 'entrada' and not exists (
        select 1 from public.registros_ponto r
         where r.colaborador_id = eu.id and r.data = hoje and r.tipo = 'entrada'
      )
    ) then 'fora_de_ordem'
  end;

  if v_motivo is null then
    -- Entra na jornada; o gatilho cria a original junto
    insert into public.registros_ponto
      (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja, criado_em)
    values
      ('ponto-' || replace(gen_random_uuid()::text, '-', ''), eu.id, hoje, v_tipo, agora,
       to_char(em_brasilia, 'HH24:MI'), v_metodo, v_loja, agora)
    returning * into novo;
    select * into o from public.marcacoes_originais where registro_id = novo.id;
  else
    o := public.nova_marcacao_original(eu.id, agora, v_loja, v_metodo, null, v_tipo, v_motivo);
  end if;

  return jsonb_build_object(
    'registro', case when novo.id is null then null else to_jsonb(novo) end,
    'original', to_jsonb(o),
    'fora_da_jornada', v_motivo
  );
end;
$$;

revoke all on function public.registrar_marcacao(text, text, text) from public, anon;
grant execute on function public.registrar_marcacao(text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Conferência: tudo true, e o contador no maior NSR já dado
-- ------------------------------------------------------------
select
  to_regclass('public.marcacoes_originais') is not null as tabela_original,
  exists (select 1 from pg_trigger where tgname = 'marcacao_original_imutavel') as trava_alterar_apagar,
  exists (select 1 from pg_trigger where tgname = 'marcacao_original_sem_truncate') as trava_truncate,
  (select confdeltype = 'r' from pg_constraint
    where conrelid = 'public.marcacoes_originais'::regclass and contype = 'f') as colaborador_restrito,
  exists (select 1 from pg_proc where proname = 'registrar_marcacao') as batida_sem_recusa,
  (select ultimo from public.contador_nsr) as contador_nsr,
  (select coalesce(max(nsr), 0) from public.registros_ponto) as maior_nsr_dado;
