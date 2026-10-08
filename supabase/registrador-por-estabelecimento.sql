-- ============================================================
-- O REGISTRADOR POR ESTABELECIMENTO (07/10/2026)
--
-- Homologação, etapa 2a. Depende de marcacao-original.sql e de
-- tratamento-da-marcacao.sql. Fonte: leiaute do AFD vigente (gov.br,
-- 31/07/2026) e Anexo IX da Portaria 671/2021 (compilada em 21/07/2026).
--
-- O QUE MUDA, E POR QUÊ:
--
--   1. O NSR É POR ESTABELECIMENTO (CNPJ), começando em 1 — Anexo IX e a
--      pergunta 41 do Ministério. Era um contador só, para a rede toda.
--      O NSR também numera os eventos do registrador (abaixo), não só as
--      marcações.
--   2. O CÓDIGO DA MARCAÇÃO É O HASH DO AFD: SHA-256 dos campos 1 a 7 do
--      registro tipo "7", como saem no arquivo, mais o hash da marcação
--      anterior do mesmo CNPJ. É o mesmo código do comprovante (art. 79).
--      A formatação mora em UM lugar (`afd_*`), para ser trocada num lugar
--      só se a leitura oficial for outra.
--   3. A MARCAÇÃO GUARDA O CPF E O COLETOR (app, navegador), como pede o
--      Anexo IX, item 6.5.
--   4. OS EVENTOS DO REGISTRADOR (Anexo IX, 6.1 e 6.3): os dados do
--      estabelecimento (tipo "2") e a inclusão, alteração e exclusão de
--      empregado (tipo "5"), com o CPF de quem fez. Não se alteram nem se
--      apagam, como a marcação.
--
-- O que já funciona continua: a batida de hoje, a fila do RH, a correção
-- e o comprovante. Quem ainda não tem CPF ou CNPJ continua batendo — a
-- marcação é registrada, e a conferência lista o que falta no cadastro.
--
-- As marcações de ANTES deste script ficam como estão (o código delas é
-- da fórmula antiga). O reset de início oficial começa tudo do 1.
--
-- Pode rodar de novo. Termina com a conferência.
-- ============================================================

-- ------------------------------------------------------------
-- 1. O FORMATO DO AFD — escrito UMA vez, aqui
--
-- Campos N: só dígitos, zeros à esquerda. Campos A: texto à esquerda,
-- espaços à direita. DH: "AAAA-MM-ddThh:mm:00-0300", no fuso de Brasília,
-- segundos fixos em 00. O registro tipo "7", campos 1 a 7, ocupa as
-- posições 001 a 073.
-- ------------------------------------------------------------
create or replace function public.afd_numero(p_valor text, p_tamanho int)
returns text language sql immutable set search_path = public as $$
  select lpad(right(regexp_replace(coalesce(p_valor, ''), '\D', '', 'g'), p_tamanho), p_tamanho, '0');
$$;

create or replace function public.afd_texto(p_valor text, p_tamanho int)
returns text language sql immutable set search_path = public as $$
  select rpad(left(coalesce(p_valor, ''), p_tamanho), p_tamanho, ' ');
$$;

create or replace function public.afd_data_hora(p timestamptz)
returns text language sql stable set search_path = public as $$
  with d as (
    select extract(epoch from ((p at time zone 'America/Sao_Paulo') - (p at time zone 'UTC')))::int as segundos
  )
  select to_char(p at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') || ':00'
      || case when d.segundos < 0 then '-' else '+' end
      || lpad((abs(d.segundos) / 3600)::text, 2, '0')
      || lpad(((abs(d.segundos) % 3600) / 60)::text, 2, '0')
    from d;
$$;

-- Registro tipo "7", campos 1 a 7 (posições 001 a 073)
create or replace function public.afd_marcacao_sem_hash(
  p_nsr bigint, p_marcacao timestamptz, p_cpf text, p_gravacao timestamptz, p_coletor text, p_offline boolean
) returns text language sql stable set search_path = public as $$
  select public.afd_numero(p_nsr::text, 9)
      || '7'
      || public.afd_data_hora(p_marcacao)
      || public.afd_numero(p_cpf, 12)
      || public.afd_data_hora(p_gravacao)
      || public.afd_numero(p_coletor, 2)
      || case when p_offline then '1' else '0' end;
$$;

-- Campo 8: SHA-256 dos campos 1 a 7 mais o hash da marcação anterior (vazio na primeira)
create or replace function public.afd_hash_marcacao(p_sem_hash text, p_hash_anterior text)
returns text language sql immutable set search_path = public as $$
  select encode(extensions.digest(p_sem_hash || coalesce(p_hash_anterior, ''), 'sha256'), 'hex');
$$;

-- ------------------------------------------------------------
-- 2. OS ESTABELECIMENTOS — quem é o empregador de cada CNPJ
--
-- Preenchidos pelo administrador (os dados chegam do Elias). Cada
-- inclusão ou alteração vira evento tipo "2" (seção 5).
-- ------------------------------------------------------------
create table if not exists public.estabelecimentos (
  cnpj           text primary key check (length(cnpj) = 14 and cnpj !~ '[^0-9]'),
  razao_social   text not null check (length(trim(razao_social)) > 0),
  -- Local da prestação do serviço ou endereço do estabelecimento
  local          text not null check (length(trim(local)) > 0),
  -- CNO ou CAEPF, quando existir
  cno_caepf      text,
  atualizado_em  timestamptz not null default now()
);

alter table public.estabelecimentos enable row level security;

drop policy if exists estabelecimentos_leitura on public.estabelecimentos;
create policy estabelecimentos_leitura on public.estabelecimentos
  for select to authenticated using (true);

drop policy if exists estabelecimentos_escrita on public.estabelecimentos;
create policy estabelecimentos_escrita on public.estabelecimentos
  for all to authenticated using (public.sou_admin()) with check (public.sou_admin());

-- ------------------------------------------------------------
-- 3. O NSR POR ESTABELECIMENTO, SEM BURACOS
--
-- Uma linha por CNPJ, travada na transação: falhou, o número volta. Guarda
-- também o hash da última marcação do CNPJ, que entra no hash da próxima.
-- Começa depois do maior NSR que o CNPJ já teve, para nenhum comprovante
-- emitido repetir número; o reset de início oficial o zera.
-- ------------------------------------------------------------
create table if not exists public.contador_nsr_estabelecimento (
  cnpj         text primary key,
  ultimo       bigint not null default 0,
  ultimo_hash  text
);
alter table public.contador_nsr_estabelecimento enable row level security;

insert into public.contador_nsr_estabelecimento (cnpj, ultimo)
select cnpj, max(nsr) from (
  select coalesce(cnpj_empregador, '') as cnpj, nsr from public.marcacoes_originais
  union all
  select coalesce(cnpj_empregador, ''), nsr from public.registros_ponto where nsr is not null
) t
group by cnpj
on conflict (cnpj) do nothing;

-- O próximo NSR do estabelecimento (uso interno das funções do banco)
create or replace function public.proximo_nsr(p_cnpj text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_nsr bigint;
begin
  insert into public.contador_nsr_estabelecimento (cnpj) values (p_cnpj) on conflict (cnpj) do nothing;
  update public.contador_nsr_estabelecimento set ultimo = ultimo + 1 where cnpj = p_cnpj returning ultimo into v_nsr;
  return v_nsr;
end;
$$;
revoke all on function public.proximo_nsr(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. OS EVENTOS DO REGISTRADOR (tipos "2" e "5" do AFD)
-- ------------------------------------------------------------
create table if not exists public.eventos_rep (
  cnpj             text not null,
  nsr              bigint not null,
  tipo             smallint not null check (tipo in (2, 5)),
  gravado_em       timestamptz not null default now(),
  -- CPF de quem fez; vazio quando foi o próprio sistema (a carga inicial)
  responsavel_cpf  text not null default '',
  -- Tipo "2": o estabelecimento
  razao_social     text,
  local            text,
  cno_caepf        text,
  -- Tipo "5": o empregado. I = inclusão, A = alteração, E = exclusão
  operacao         text check (operacao in ('I', 'A', 'E')),
  cpf              text,
  nome             text,
  primary key (cnpj, nsr)
);

alter table public.eventos_rep enable row level security;

drop policy if exists eventos_rep_leitura on public.eventos_rep;
create policy eventos_rep_leitura on public.eventos_rep
  for select to authenticated using (public.cuido_de_pessoas());

-- O registro do REP não se altera nem se apaga (Anexo IX, item 7)
create or replace function public.registro_do_rep_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Registro do REP não se altera nem se apaga (Portaria 671/2021).' using errcode = 'P0001';
end;
$$;

drop trigger if exists eventos_rep_imutavel on public.eventos_rep;
create trigger eventos_rep_imutavel
  before update or delete on public.eventos_rep
  for each row execute function public.registro_do_rep_imutavel();

drop trigger if exists eventos_rep_sem_truncate on public.eventos_rep;
create trigger eventos_rep_sem_truncate
  before truncate on public.eventos_rep
  for each statement execute function public.registro_do_rep_imutavel();

-- O CPF de quem está fazendo a operação; vazio sem sessão (o próprio sistema)
create or replace function public.cpf_de_quem_faz()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select cpf from public.cpf_colaborador where colaborador_id = public.meu_colaborador_id()), '');
$$;
revoke all on function public.cpf_de_quem_faz() from public, anon;

create or replace function public.registrar_evento_empregado(p_colaborador text, p_operacao text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.colaboradores;
  v_cpf text;
  v_cnpj text;
begin
  select * into c from public.colaboradores where id = p_colaborador;
  select cpf into v_cpf from public.cpf_colaborador where colaborador_id = p_colaborador;
  -- Sem CPF não há empregado no REP: ele entra quando o CPF chegar
  if c.id is null or v_cpf is null then return; end if;
  v_cnpj := regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g');
  insert into public.eventos_rep (cnpj, nsr, tipo, responsavel_cpf, operacao, cpf, nome)
  values (v_cnpj, public.proximo_nsr(v_cnpj), 5, public.cpf_de_quem_faz(), p_operacao, v_cpf, c.nome);
end;
$$;
revoke all on function public.registrar_evento_empregado(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. QUANDO OS EVENTOS NASCEM
--
--   · CPF cadastrado: o empregado entra no REP ("I"); CPF corrigido: "A".
--   · Nome alterado: "A". Desativado: "E"; reativado: "I".
--   · Mudou de CNPJ: sai de um estabelecimento ("E") e entra no outro ("I").
--   · Estabelecimento incluído ou alterado: tipo "2".
--
-- O gatilho de colaboradores só RODA quando nome, ativo ou CNPJ mudam
-- (cláusula WHEN): a presença, a foto e o resto, gravados a toda hora,
-- nem chamam a função.
-- ------------------------------------------------------------
create or replace function public.evento_do_cpf()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.registrar_evento_empregado(new.colaborador_id, case when tg_op = 'INSERT' then 'I' else 'A' end);
  return new;
end;
$$;

drop trigger if exists evento_do_cpf on public.cpf_colaborador;
create trigger evento_do_cpf
  after insert or update of cpf on public.cpf_colaborador
  for each row execute function public.evento_do_cpf();

create or replace function public.evento_do_empregado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cpf text;
  v_cnpj_antigo text := regexp_replace(coalesce(old.cnpj, ''), '\D', '', 'g');
begin
  select cpf into v_cpf from public.cpf_colaborador where colaborador_id = new.id;
  if v_cpf is null then return new; end if;

  if v_cnpj_antigo is distinct from regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g') then
    -- A saída fica no estabelecimento antigo, com os dados de antes
    if old.ativo then
      insert into public.eventos_rep (cnpj, nsr, tipo, responsavel_cpf, operacao, cpf, nome)
      values (v_cnpj_antigo, public.proximo_nsr(v_cnpj_antigo), 5, public.cpf_de_quem_faz(), 'E', v_cpf, old.nome);
    end if;
    if new.ativo then perform public.registrar_evento_empregado(new.id, 'I'); end if;
  elsif old.ativo is distinct from new.ativo then
    perform public.registrar_evento_empregado(new.id, case when new.ativo then 'I' else 'E' end);
  elsif old.nome is distinct from new.nome and new.ativo then
    perform public.registrar_evento_empregado(new.id, 'A');
  end if;
  return new;
end;
$$;

drop trigger if exists evento_do_empregado on public.colaboradores;
create trigger evento_do_empregado
  after update on public.colaboradores
  for each row
  when (old.nome is distinct from new.nome or old.ativo is distinct from new.ativo or old.cnpj is distinct from new.cnpj)
  execute function public.evento_do_empregado();

create or replace function public.evento_do_estabelecimento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.eventos_rep (cnpj, nsr, tipo, responsavel_cpf, razao_social, local, cno_caepf)
  values (new.cnpj, public.proximo_nsr(new.cnpj), 2, public.cpf_de_quem_faz(), new.razao_social, new.local, new.cno_caepf);
  return new;
end;
$$;

drop trigger if exists evento_do_estabelecimento on public.estabelecimentos;
create trigger evento_do_estabelecimento
  after insert or update on public.estabelecimentos
  for each row execute function public.evento_do_estabelecimento();

-- A carga inicial: quem tem CPF e está ativo entra no REP do seu CNPJ
-- (uma vez — quem já tem evento não ganha outro)
do $$
declare
  r record;
begin
  for r in
    select c.id from public.colaboradores c
      join public.cpf_colaborador p on p.colaborador_id = c.id
     where c.ativo
       and not exists (select 1 from public.eventos_rep e where e.tipo = 5 and e.cpf = p.cpf)
     order by p.registrado_em, c.id
  loop
    perform public.registrar_evento_empregado(r.id, 'I');
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6. A MARCAÇÃO GUARDA CPF E COLETOR, E O NSR VIRA POR CNPJ
--
-- Colunas novas com padrão: as marcações de antes ficam com CPF vazio e
-- coletor "05" (não especificado) — e com o código da fórmula antiga.
-- A chave passa a ser (CNPJ, NSR); a decisão do tratamento aponta para
-- ela. A cópia do CNPJ nas decisões já gravadas é feita uma vez, aqui,
-- com a trava delas suspensa só durante esta cópia.
-- ------------------------------------------------------------
alter table public.marcacoes_originais add column if not exists cpf text not null default '';
alter table public.marcacoes_originais add column if not exists coletor text not null default '05'
  check (coletor in ('01', '02', '03', '04', '05'));
alter table public.marcacoes_originais add column if not exists offline boolean not null default false;

alter table public.tratamento_marcacao add column if not exists cnpj text;
alter table public.tratamento_marcacao disable trigger tratamento_marcacao_imutavel;
update public.tratamento_marcacao t
   set cnpj = o.cnpj_empregador
  from public.marcacoes_originais o
 where o.nsr = t.nsr and t.cnpj is null;
alter table public.tratamento_marcacao enable trigger tratamento_marcacao_imutavel;

alter table public.tratamento_marcacao drop constraint if exists tratamento_marcacao_nsr_fkey;
alter table public.tratamento_marcacao drop constraint if exists tratamento_marcacao_original_fkey;
alter table public.tratamento_marcacao drop constraint if exists tratamento_marcacao_pkey;
alter table public.marcacoes_originais drop constraint if exists marcacoes_originais_pkey;
alter table public.marcacoes_originais add constraint marcacoes_originais_pkey primary key (cnpj_empregador, nsr);
alter table public.tratamento_marcacao alter column cnpj set not null;
alter table public.tratamento_marcacao add constraint tratamento_marcacao_pkey primary key (cnpj, nsr);
alter table public.tratamento_marcacao add constraint tratamento_marcacao_original_fkey
  foreign key (cnpj, nsr) references public.marcacoes_originais (cnpj_empregador, nsr) on delete restrict;

-- O contador antigo, de um número só para a rede, sai de cena (a função
-- antiga que o usava sai depois do carimbo novo, na seção 8)
drop table if exists public.contador_nsr;

-- ------------------------------------------------------------
-- 7. UMA MARCAÇÃO ORIGINAL NOVA
-- ------------------------------------------------------------
create or replace function public.nova_marcacao_original(
  p_colaborador text,
  p_registrado  timestamptz,
  p_loja        text,
  p_metodo      text,
  p_registro_id text,
  p_tipo_pedido text,
  p_fora        text,
  p_coletor     text
) returns public.marcacoes_originais
language plpgsql security definer set search_path = public as $$
declare
  v_cnpj      text;
  v_cpf       text;
  v_nsr       bigint;
  v_anterior  text;
  v_coletor   text := case when p_coletor in ('01', '02', '03', '04', '05') then p_coletor else '05' end;
  v_data      date := (p_registrado at time zone 'America/Sao_Paulo')::date;
  v_hash      text;
  nova        public.marcacoes_originais;
begin
  select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') into v_cnpj
    from public.colaboradores where id = p_colaborador;
  v_cnpj := coalesce(v_cnpj, '');
  select cpf into v_cpf from public.cpf_colaborador where colaborador_id = p_colaborador;

  v_nsr := public.proximo_nsr(v_cnpj);
  -- A linha do contador já está travada por esta transação
  select ultimo_hash into v_anterior from public.contador_nsr_estabelecimento where cnpj = v_cnpj;
  v_hash := public.afd_hash_marcacao(
    public.afd_marcacao_sem_hash(v_nsr, p_registrado, v_cpf, p_registrado, v_coletor, false),
    v_anterior
  );
  update public.contador_nsr_estabelecimento set ultimo_hash = v_hash where cnpj = v_cnpj;

  insert into public.marcacoes_originais
    (nsr, colaborador_id, registrado_em, data, loja, metodo, cnpj_empregador,
     codigo_verificacao, registro_id, tipo_pedido, fora_da_jornada, cpf, coletor, offline)
  values
    (v_nsr, p_colaborador, p_registrado, v_data, p_loja, p_metodo, v_cnpj,
     v_hash, p_registro_id, p_tipo_pedido, p_fora, coalesce(v_cpf, ''), v_coletor, false)
  returning * into nova;

  return nova;
end;
$$;

revoke all on function public.nova_marcacao_original(text, timestamptz, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. O CARIMBO DA BATIDA — o coletor chega pela transação
--
-- `registrar_marcacao` diz qual é o coletor (app ou navegador) antes de
-- gravar; a `bater_ponto` antiga não diz, e fica "05" (não especificado).
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
      new.colaborador_id, coalesce(new.horario, now()), new.loja, new.metodo, new.id, new.tipo, null,
      current_setting('conecta.coletor', true));
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

-- Só agora a versão antiga da original sai: o carimbo antigo a chamava
drop function if exists public.nova_marcacao_original(text, timestamptz, text, text, text, text, text);

-- ------------------------------------------------------------
-- 9. A BATIDA QUE NUNCA É RECUSADA — agora com o coletor
--
-- O quarto parâmetro é opcional: o aplicativo aberto antes desta
-- publicação chama com três, e continua funcionando.
-- ------------------------------------------------------------
drop function if exists public.registrar_marcacao(text, text, text);

create or replace function public.registrar_marcacao(p_codigo text, p_loja text, p_tipo text, p_coletor text default null)
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
  v_coletor text := case when p_coletor in ('01', '02', '03', '04', '05') then p_coletor else '05' end;
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
    -- O coletor viaja até o gatilho, que cria a original junto
    perform set_config('conecta.coletor', v_coletor, true);
    insert into public.registros_ponto
      (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja, criado_em)
    values
      ('ponto-' || replace(gen_random_uuid()::text, '-', ''), eu.id, hoje, v_tipo, agora,
       to_char(em_brasilia, 'HH24:MI'), v_metodo, v_loja, agora)
    returning * into novo;
    select * into o from public.marcacoes_originais where registro_id = novo.id;
  else
    o := public.nova_marcacao_original(eu.id, agora, v_loja, v_metodo, null, v_tipo, v_motivo, v_coletor);
  end if;

  return jsonb_build_object(
    'registro', case when novo.id is null then null else to_jsonb(novo) end,
    'original', to_jsonb(o),
    'fora_da_jornada', v_motivo
  );
end;
$$;

revoke all on function public.registrar_marcacao(text, text, text, text) from public, anon;
grant execute on function public.registrar_marcacao(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 10. A FILA E A DECISÃO, com a chave (CNPJ, NSR)
--
-- O CNPJ é opcional na decisão: o aplicativo aberto antes desta
-- publicação manda só o NSR, e enquanto ele for único, vale.
-- ------------------------------------------------------------
create or replace function public.marcacoes_para_tratar()
returns setof public.marcacoes_originais
language sql stable set search_path = public as $$
  select o.*
    from public.marcacoes_originais o
   where o.fora_da_jornada is not null
     and (public.cuido_de_pessoas() or public.posso_decidir_jornada(o.colaborador_id))
     and not exists (
       select 1 from public.tratamento_marcacao t
        where t.cnpj = o.cnpj_empregador and t.nsr = o.nsr
     )
   order by o.registrado_em;
$$;

drop function if exists public.tratar_marcacao(bigint, text, text, text);

create or replace function public.tratar_marcacao(
  p_nsr bigint,
  p_decisao text,
  p_tipo text,
  p_justificativa text,
  p_cnpj text default null
) returns public.tratamento_marcacao
language plpgsql volatile security definer set search_path = public as $$
declare
  eu public.colaboradores;
  o public.marcacoes_originais;
  v_achadas int;
  v_registro text;
  t public.tratamento_marcacao;
begin
  select * into eu from public.colaboradores where id = public.meu_colaborador_id();
  if eu.id is null then
    raise exception 'Sessão sem cadastro. Saia e entre de novo.' using errcode = 'P0001';
  end if;

  select count(*) into v_achadas from public.marcacoes_originais
   where nsr = p_nsr and (p_cnpj is null or cnpj_empregador = p_cnpj);
  if v_achadas = 0 then
    raise exception 'Marcação não encontrada.' using errcode = 'P0001';
  end if;
  if v_achadas > 1 then
    raise exception 'Mais de um estabelecimento tem este NSR. Atualize o aplicativo e tente de novo.' using errcode = 'P0001';
  end if;
  select * into o from public.marcacoes_originais
   where nsr = p_nsr and (p_cnpj is null or cnpj_empregador = p_cnpj);

  if o.fora_da_jornada is null then
    raise exception 'Esta marcação já está na jornada.' using errcode = 'P0001';
  end if;
  if not (public.cuido_de_pessoas() or public.posso_decidir_jornada(o.colaborador_id)) then
    raise exception 'Você não responde pela jornada desta pessoa.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tratamento_marcacao where cnpj = o.cnpj_empregador and nsr = o.nsr) then
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
    (cnpj, nsr, decisao, tipo, registro_id, justificativa, decidido_por_id, decidido_por_nome)
  values
    (o.cnpj_empregador, o.nsr, p_decisao, case when p_decisao = 'incluida' then p_tipo end, v_registro,
     trim(p_justificativa), eu.id, eu.nome)
  returning * into t;

  return t;
end;
$$;

revoke all on function public.tratar_marcacao(bigint, text, text, text, text) from public, anon;
grant execute on function public.tratar_marcacao(bigint, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Conferência: as travas e funções true; e o que falta no cadastro para
-- o AFD sair completo (estabelecimentos, CNPJ e CPF de quem bate ponto)
-- ------------------------------------------------------------
select
  exists (select 1 from pg_trigger where tgname = 'eventos_rep_imutavel') as eventos_imutaveis,
  exists (select 1 from pg_trigger where tgname = 'evento_do_empregado') as evento_do_empregado,
  (select count(*) from pg_constraint where conname = 'marcacoes_originais_pkey'
     and array_length(conkey, 1) = 2) = 1 as nsr_por_cnpj,
  to_regclass('public.contador_nsr') is null as contador_unico_saiu,
  (select count(*) from public.eventos_rep where tipo = 5) as empregados_no_rep,
  (select count(*) from public.estabelecimentos) as estabelecimentos_cadastrados,
  (select count(*) from public.colaboradores where ativo and coalesce(regexp_replace(cnpj, '\D', '', 'g'), '') = '') as ativos_sem_cnpj,
  (select count(*) from public.colaboradores c where ativo
     and not exists (select 1 from public.cpf_colaborador p where p.colaborador_id = c.id)) as ativos_sem_cpf;
