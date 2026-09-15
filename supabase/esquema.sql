-- ============================================================
-- CONECTA — Malachias Autopeças
-- Estrutura do banco de dados (Supabase / PostgreSQL)
--
-- Como aplicar:
--   1. Abra o projeto no supabase.com
--   2. Vá em SQL Editor > New query
--   3. Cole este arquivo inteiro e clique em Run
--
-- Pode ser executado mais de uma vez sem quebrar nada.
-- ============================================================

-- ------------------------------------------------------------
-- TABELAS
-- ------------------------------------------------------------

create table if not exists public.colaboradores (
  id                              text primary key,
  auth_user_id                    uuid unique references auth.users(id) on delete set null,
  nome                            text not null,
  login                           text not null unique,
  cargo                           text not null default 'Colaborador',
  setor                           text not null,
  loja                            text not null,
  nivel                           smallint not null default 1 check (nivel between 1 and 4),
  foto                            text,
  presenca                        text not null default 'desconectado',
  visto_por_ultimo                text default 'Agora',
  ramal                           text,
  telefone                        text,
  email                           text,
  matricula                       text,
  departamento                    text,
  data_admissao                   text,
  observacoes                     text,
  carga_horaria_diaria_minutos    integer not null default 480,
  ativo                           boolean not null default true,
  criado_em                       timestamptz not null default now()
);

-- O login é comparado sem diferenciar maiúsculas ("Elias" = "elias")
create unique index if not exists colaboradores_login_minusculo
  on public.colaboradores (lower(login));

create table if not exists public.conversas (
  id                        text primary key,
  tipo                      text not null check (tipo in ('individual', 'grupo')),
  nome                      text not null,
  foto                      text,
  descricao                 text,
  criado_por_id             text references public.colaboradores(id) on delete set null,
  apenas_gestores_publicam  boolean not null default false,
  eh_sistema_padrao         boolean not null default false,
  atualizado_em             timestamptz not null default now(),
  criado_em                 timestamptz not null default now()
);

-- Participação em tabela própria: no navegador era uma lista dentro da
-- conversa, o que impedia o banco de filtrar por quem participa.
create table if not exists public.participantes (
  conversa_id     text not null references public.conversas(id) on delete cascade,
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  entrou_em       timestamptz not null default now(),
  primary key (conversa_id, colaborador_id)
);

create index if not exists participantes_por_colaborador
  on public.participantes (colaborador_id);

create table if not exists public.mensagens (
  id                text primary key,
  conversa_id       text not null references public.conversas(id) on delete cascade,
  remetente_id      text not null references public.colaboradores(id) on delete cascade,
  tipo              text not null check (tipo in ('texto', 'recado_voz', 'arquivo', 'imagem')),
  texto             text,
  audio_url         text,
  audio_duracao     integer,
  arquivo_nome      text,
  arquivo_tamanho   text,
  arquivo_url       text,
  imagem_url        text,
  legenda           text,
  eh_encaminhada    boolean not null default false,
  eh_aviso_direcao  boolean not null default false,
  reacoes           jsonb not null default '{}'::jsonb,
  -- Preenchido só quando o autor reescreve a mensagem; é o que sustenta o
  -- selo "Editada" ao lado do horário
  editada_em        timestamptz,
  criado_em         timestamptz not null default now()
);

-- A coluna nasceu depois da tabela: quem já rodou este arquivo antes não a tem
alter table public.mensagens add column if not exists editada_em timestamptz;

create index if not exists mensagens_por_conversa
  on public.mensagens (conversa_id, criado_em);

-- Leitura por pessoa: é o que faz o contador de não lidas ser individual
create table if not exists public.leituras_mensagem (
  mensagem_id     text not null references public.mensagens(id) on delete cascade,
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  lida_em         timestamptz not null default now(),
  primary key (mensagem_id, colaborador_id)
);

create index if not exists leituras_por_colaborador
  on public.leituras_mensagem (colaborador_id);

create table if not exists public.avisos_rede (
  id              text primary key,
  titulo          text not null,
  conteudo        text not null,
  prioridade      text not null default 'geral' check (prioridade in ('geral', 'atencao', 'urgente')),
  autor_id        text references public.colaboradores(id) on delete set null,
  autor_nome      text not null,
  autor_cargo     text not null,
  loja_destino    text not null default 'Todas',
  fixado_no_topo  boolean not null default false,
  criado_em       timestamptz not null default now()
);

create table if not exists public.avisos_leitura (
  aviso_id        text not null references public.avisos_rede(id) on delete cascade,
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,
  confirmado      boolean not null default false,
  lido_em         timestamptz not null default now(),
  primary key (aviso_id, colaborador_id)
);

-- ------------------------------------------------------------
-- PONTO E BANCO DE HORAS
-- ------------------------------------------------------------

create table if not exists public.codigos_ponto_loja (
  loja                  text primary key,
  codigo                text not null,
  atualizado_por_nome   text,
  atualizado_em         timestamptz not null default now()
);

create table if not exists public.registros_ponto (
  id                  text primary key,
  colaborador_id      text not null references public.colaboradores(id) on delete cascade,
  data                date not null,
  tipo                text not null check (tipo in ('entrada', 'saida_almoco', 'retorno_almoco', 'saida')),
  horario             timestamptz not null,
  hora_formatada      text not null,
  metodo              text not null check (metodo in ('qrcode', 'codigo_manual', 'ajuste_rh')),
  loja                text not null,
  ajustado_por_id     text references public.colaboradores(id) on delete set null,
  ajustado_por_nome   text,
  justificativa       text,
  criado_em           timestamptz not null default now(),
  -- Uma marcação de cada tipo por dia: impede batida duplicada no banco,
  -- não só na tela
  unique (colaborador_id, data, tipo)
);

create index if not exists registros_ponto_por_data
  on public.registros_ponto (data, colaborador_id);

-- ------------------------------------------------------------
-- SISTEMA
-- ------------------------------------------------------------

create table if not exists public.configuracoes (
  id                                    boolean primary key default true check (id),
  nome_empresa                          text not null default 'Malachias Autopeças',
  bipe_radio_ativo                      boolean not null default true,
  tempo_maximo_radio_segundos           integer not null default 60,
  modo_manutencao                       boolean not null default false,
  permitir_criacao_grupos_por_operadores boolean not null default false
);

insert into public.configuracoes (id) values (true) on conflict (id) do nothing;

create table if not exists public.auditoria (
  id            text primary key,
  data_hora     timestamptz not null default now(),
  usuario_nome  text not null,
  acao          text not null,
  categoria     text not null,
  detalhes      text not null
);

create index if not exists auditoria_por_data on public.auditoria (data_hora desc);

-- ------------------------------------------------------------
-- FUNÇÕES DE APOIO ÀS REGRAS DE ACESSO
--
-- security definer para poderem ler colaboradores sem cair na própria
-- política e criar recursão infinita.
-- ------------------------------------------------------------

create or replace function public.meu_colaborador_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.colaboradores where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.meu_nivel()
returns smallint language sql stable security definer set search_path = public as $$
  select coalesce((select nivel from public.colaboradores where auth_user_id = auth.uid() limit 1), 0);
$$;

create or replace function public.meu_setor()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select setor from public.colaboradores where auth_user_id = auth.uid() limit 1), '');
$$;

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_nivel() = 4;
$$;

create or replace function public.cuido_de_pessoas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_nivel() = 4 or public.meu_setor() = 'RH';
$$;

create or replace function public.participo_da_conversa(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participantes
    where conversa_id = alvo and colaborador_id = public.meu_colaborador_id()
  );
$$;

-- ------------------------------------------------------------
-- REGRAS DE ACESSO (RLS)
-- Espelham as permissões que já existiam na tela, agora impostas pelo
-- banco: mesmo que alguém chame a API direto, as regras valem.
-- ------------------------------------------------------------

alter table public.colaboradores       enable row level security;
alter table public.conversas           enable row level security;
alter table public.participantes       enable row level security;
alter table public.mensagens           enable row level security;
alter table public.leituras_mensagem   enable row level security;
alter table public.avisos_rede         enable row level security;
alter table public.avisos_leitura      enable row level security;
alter table public.codigos_ponto_loja  enable row level security;
alter table public.registros_ponto     enable row level security;
alter table public.configuracoes       enable row level security;
alter table public.auditoria           enable row level security;

-- Apaga TODA política destas tabelas antes de recriá-las.
--
-- Cada regra abaixo é removida pelo nome antes de ser criada, mas isso só
-- alcança o nome que este arquivo conhece: uma política de uma versão
-- anterior, com outro nome, continuaria valendo ao lado da nova. Pior ainda
-- quando a versão antiga era mais restritiva — o sistema passa a recusar
-- gravações sem nenhum erro visível na hora de rodar este arquivo.
--
-- Varrer tudo primeiro é o que garante que o banco fique exatamente com o
-- que está escrito aqui, não importa o que havia antes.
do $$
declare
  regra record;
begin
  for regra in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'colaboradores', 'conversas', 'participantes', 'mensagens',
        'leituras_mensagem', 'avisos_rede', 'avisos_leitura',
        'codigos_ponto_loja', 'registros_ponto', 'configuracoes', 'auditoria'
      )
  loop
    execute format('drop policy %I on public.%I', regra.policyname, regra.tablename);
  end loop;
end $$;

-- COLABORADORES: todos se enxergam (é a agenda interna).
-- Editar: o próprio, o RH e o Administrador.
drop policy if exists colaboradores_leitura on public.colaboradores;
create policy colaboradores_leitura on public.colaboradores
  for select to authenticated using (true);

drop policy if exists colaboradores_insercao on public.colaboradores;
create policy colaboradores_insercao on public.colaboradores
  for insert to authenticated with check (public.cuido_de_pessoas());

drop policy if exists colaboradores_edicao on public.colaboradores;
create policy colaboradores_edicao on public.colaboradores
  for update to authenticated
  using (public.cuido_de_pessoas() or id = public.meu_colaborador_id());

drop policy if exists colaboradores_remocao on public.colaboradores;
create policy colaboradores_remocao on public.colaboradores
  for delete to authenticated using (public.sou_admin());

-- CONVERSAS: só as que a pessoa participa. Canais da rede ficam visíveis
-- para quem for inscrito neles.
drop policy if exists conversas_leitura on public.conversas;
create policy conversas_leitura on public.conversas
  for select to authenticated using (public.participo_da_conversa(id));

drop policy if exists conversas_insercao on public.conversas;
create policy conversas_insercao on public.conversas
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists conversas_edicao on public.conversas;
create policy conversas_edicao on public.conversas
  for update to authenticated using (public.participo_da_conversa(id) or public.sou_admin());

drop policy if exists conversas_remocao on public.conversas;
create policy conversas_remocao on public.conversas
  for delete to authenticated using (public.sou_admin());

-- PARTICIPANTES
drop policy if exists participantes_leitura on public.participantes;
create policy participantes_leitura on public.participantes
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.participo_da_conversa(conversa_id));

drop policy if exists participantes_insercao on public.participantes;
create policy participantes_insercao on public.participantes
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists participantes_remocao on public.participantes;
create policy participantes_remocao on public.participantes
  for delete to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.sou_admin());

-- MENSAGENS: ler só de conversa que participa; enviar só como você mesmo;
-- apagar a própria, ou qualquer uma se Administrador.
drop policy if exists mensagens_leitura on public.mensagens;
create policy mensagens_leitura on public.mensagens
  for select to authenticated using (public.participo_da_conversa(conversa_id));

drop policy if exists mensagens_insercao on public.mensagens;
create policy mensagens_insercao on public.mensagens
  for insert to authenticated
  with check (
    remetente_id = public.meu_colaborador_id()
    and public.participo_da_conversa(conversa_id)
  );

drop policy if exists mensagens_edicao on public.mensagens;
create policy mensagens_edicao on public.mensagens
  for update to authenticated using (public.participo_da_conversa(conversa_id));

-- A política acima precisa liberar o UPDATE para todo participante, porque
-- REAGIR a uma mensagem altera a linha dela. Só que reagir não é reescrever:
-- sem o gatilho abaixo, qualquer um da conversa poderia trocar o texto da
-- fala de outra pessoa pela API, mantendo o nome dela embaixo. O gatilho
-- deixa passar a reação e barra a troca de texto de quem não é o autor.
create or replace function public.apenas_autor_reescreve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.texto is distinct from old.texto)
     or (new.legenda is distinct from old.legenda)
     or (new.editada_em is distinct from old.editada_em) then
    if old.remetente_id is distinct from public.meu_colaborador_id() then
      raise exception 'Apenas o autor pode editar a propria mensagem';
    end if;
  end if;

  -- Remetente, conversa e data de envio não mudam nunca
  new.id           := old.id;
  new.conversa_id  := old.conversa_id;
  new.remetente_id := old.remetente_id;
  new.criado_em    := old.criado_em;

  return new;
end;
$$;

drop trigger if exists mensagens_edicao_somente_autor on public.mensagens;
create trigger mensagens_edicao_somente_autor
  before update on public.mensagens
  for each row execute function public.apenas_autor_reescreve();

drop policy if exists mensagens_remocao on public.mensagens;
create policy mensagens_remocao on public.mensagens
  for delete to authenticated
  using (remetente_id = public.meu_colaborador_id() or public.sou_admin());

-- LEITURAS: cada um marca as próprias
drop policy if exists leituras_leitura on public.leituras_mensagem;
create policy leituras_leitura on public.leituras_mensagem
  for select to authenticated using (true);

drop policy if exists leituras_insercao on public.leituras_mensagem;
create policy leituras_insercao on public.leituras_mensagem
  for insert to authenticated with check (colaborador_id = public.meu_colaborador_id());

-- AVISOS: todos leem; publicar a partir do nível 2; remover o autor ou N3+
drop policy if exists avisos_leitura_todos on public.avisos_rede;
create policy avisos_leitura_todos on public.avisos_rede
  for select to authenticated using (true);

drop policy if exists avisos_insercao on public.avisos_rede;
create policy avisos_insercao on public.avisos_rede
  for insert to authenticated with check (public.meu_nivel() >= 2);

drop policy if exists avisos_edicao on public.avisos_rede;
create policy avisos_edicao on public.avisos_rede
  for update to authenticated using (public.meu_nivel() >= 2);

drop policy if exists avisos_remocao on public.avisos_rede;
create policy avisos_remocao on public.avisos_rede
  for delete to authenticated
  using (public.meu_nivel() >= 3 or autor_id = public.meu_colaborador_id());

drop policy if exists avisos_leitura_marcacao on public.avisos_leitura;
create policy avisos_leitura_marcacao on public.avisos_leitura
  for select to authenticated using (true);

drop policy if exists avisos_leitura_registro on public.avisos_leitura;
create policy avisos_leitura_registro on public.avisos_leitura
  for insert to authenticated with check (colaborador_id = public.meu_colaborador_id());

drop policy if exists avisos_leitura_atualizacao on public.avisos_leitura;
create policy avisos_leitura_atualizacao on public.avisos_leitura
  for update to authenticated using (colaborador_id = public.meu_colaborador_id());

-- CÓDIGOS DE PONTO: todos precisam ler para validar a batida;
-- só RH e Administrador geram um novo.
drop policy if exists codigos_leitura on public.codigos_ponto_loja;
create policy codigos_leitura on public.codigos_ponto_loja
  for select to authenticated using (true);

drop policy if exists codigos_escrita on public.codigos_ponto_loja;
create policy codigos_escrita on public.codigos_ponto_loja
  for all to authenticated using (public.cuido_de_pessoas()) with check (public.cuido_de_pessoas());

-- PONTO: cada um vê e bate o próprio; RH, Administrador e gestores
-- enxergam a equipe; só RH e Administrador corrigem.
drop policy if exists ponto_leitura on public.registros_ponto;
create policy ponto_leitura on public.registros_ponto
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas() or public.meu_nivel() >= 3);

drop policy if exists ponto_batida on public.registros_ponto;
create policy ponto_batida on public.registros_ponto
  for insert to authenticated
  with check (
    (colaborador_id = public.meu_colaborador_id() and metodo <> 'ajuste_rh')
    or public.cuido_de_pessoas()
  );

drop policy if exists ponto_ajuste on public.registros_ponto;
create policy ponto_ajuste on public.registros_ponto
  for update to authenticated using (public.cuido_de_pessoas()) with check (public.cuido_de_pessoas());

drop policy if exists ponto_remocao on public.registros_ponto;
create policy ponto_remocao on public.registros_ponto
  for delete to authenticated using (public.cuido_de_pessoas());

-- CONFIGURAÇÕES: todos leem, só o Administrador altera
drop policy if exists config_leitura on public.configuracoes;
create policy config_leitura on public.configuracoes
  for select to authenticated using (true);

drop policy if exists config_escrita on public.configuracoes;
create policy config_escrita on public.configuracoes
  for update to authenticated using (public.sou_admin()) with check (public.sou_admin());

-- AUDITORIA: quem administra lê; qualquer sessão registra o que fez.
-- Não há política de update nem delete: o registro é imutável.
drop policy if exists auditoria_leitura on public.auditoria;
create policy auditoria_leitura on public.auditoria
  for select to authenticated using (public.sou_admin() or public.meu_setor() = 'RH');

drop policy if exists auditoria_registro on public.auditoria;
create policy auditoria_registro on public.auditoria
  for insert to authenticated with check (auth.uid() is not null);

-- ------------------------------------------------------------
-- TEMPO REAL
-- É o que faz a mensagem aparecer na tela do colega sem atualizar a página.
-- ------------------------------------------------------------

do $$
declare
  tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- Adicionar uma tabela que já está na publicação é erro, então cada uma é
  -- conferida antes. É o que permite rodar este arquivo quantas vezes quiser.
  foreach tabela in array array[
    'mensagens',
    'conversas',
    'participantes',
    'colaboradores',
    'avisos_rede',
    'registros_ponto',
    'codigos_ponto_loja',
    'leituras_mensagem',
    'avisos_leitura',
    'configuracoes',
    'auditoria'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end $$;

-- ============================================================
-- PRIMEIRO ACESSO
--
-- Com as regras acima ligadas, cadastrar colaborador exige já ser RH ou
-- Administrador — e no banco vazio não existe nenhum dos dois. Sem isto,
-- ninguém conseguiria entrar na primeira vez.
--
-- A solução é um gatilho: quando um usuário é criado na autenticação, a
-- ficha do colaborador nasce junto. O PRIMEIRO a entrar vira Administrador
-- (nível 4); todos os seguintes entram como operadores, e o RH ajusta
-- depois pelo painel.
-- ============================================================

create or replace function public.criar_colaborador_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ja_existe_alguem boolean;
  nivel_inicial    smallint;
  login_novo       text;
begin
  select exists (select 1 from public.colaboradores) into ja_existe_alguem;
  nivel_inicial := case when ja_existe_alguem then 1 else 4 end;

  -- O login vem do cadastro feito na tela; sem ele, usa a parte antes do @
  login_novo := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'login'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.colaboradores (
    id, auth_user_id, nome, login, cargo, setor, loja, nivel, foto, presenca, ativo
  )
  values (
    'colab-' || replace(new.id::text, '-', ''),
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), login_novo),
    login_novo,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'cargo'), ''),
             case when ja_existe_alguem then 'Colaborador' else 'Administrador Geral' end),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'setor'), ''),
             case when ja_existe_alguem then 'Balcão' else 'TI' end),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'loja'), ''), 'Pirassununga'),
    nivel_inicial,
    '/logo-malachias.svg',
    'disponivel',
    true
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_colaborador_do_usuario();

-- ------------------------------------------------------------
-- CÓDIGOS DE PONTO DAS LOJAS
--
-- Semeados aqui porque a criação exige ser RH ou Administrador: se ficassem
-- para o aplicativo gerar, um operador nunca conseguiria bater o ponto na
-- primeira vez. O RH troca qualquer um deles pelo painel quando quiser.
-- ------------------------------------------------------------

insert into public.codigos_ponto_loja (loja, codigo)
values
  ('Pirassununga',   upper(substr(md5(random()::text), 1, 6))),
  ('Porto Ferreira', upper(substr(md5(random()::text), 1, 6))),
  ('Palmeiras',      upper(substr(md5(random()::text), 1, 6))),
  ('Descalvado',     upper(substr(md5(random()::text), 1, 6))),
  ('Santa Rita',     upper(substr(md5(random()::text), 1, 6)))
on conflict (loja) do nothing;

-- ============================================================
-- ARQUIVOS DAS MENSAGENS
--
-- Foto, documento e recado de voz iam embutidos como texto na própria linha
-- da mensagem. Funcionava, mas uma foto de 200 KB vira quase 270 KB de texto
-- dentro da tabela: o banco cresce depressa, cada consulta de conversa
-- carrega tudo junto, e apagar histórico depois exige mexer nas linhas.
--
-- Aqui os arquivos passam a viver no armazenamento do Supabase, e a mensagem
-- guarda só o caminho. A tabela fica leve e o expurgo do histórico apaga os
-- arquivos junto.
-- ============================================================

alter table public.mensagens add column if not exists anexo_caminho text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 5242880)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- O balde é privado: nada é servido por link aberto. Quem está autenticado na
-- rede lê, e o caminho de cada arquivo leva o id da mensagem, que é aleatório
-- — não dá para percorrer os arquivos dos outros por tentativa.
do $$
declare
  regra record;
begin
  for regra in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'anexos_%'
  loop
    execute format('drop policy %I on storage.objects', regra.policyname);
  end loop;
end $$;

create policy anexos_leitura on storage.objects
  for select to authenticated using (bucket_id = 'anexos');

create policy anexos_envio on storage.objects
  for insert to authenticated with check (bucket_id = 'anexos');

-- Apagar é parte do expurgo de histórico, e isso é decisão da administração
create policy anexos_remocao on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos' and public.sou_admin());

-- ============================================================
-- LIMPEZA DE IMAGENS ANTIGAS
--
-- O que ocupa espaço é o arquivo, não o registro. Por isso a limpeza apaga
-- A IMAGEM e preserva a mensagem: quem enviou, quando, em qual conversa e a
-- legenda continuam na conversa, com o balão marcado como imagem removida.
-- O histórico segue servindo de controle; só o peso sai.
--
-- NADA MAIS É TOCADO. Ponto, banco de horas, colaboradores, avisos e
-- auditoria não entram aqui em hipótese alguma — esta função não conhece
-- essas tabelas.
--
-- Devolve os caminhos que ficaram órfãos, porque apagar a referência não
-- alcança o armazenamento: o sistema apaga os arquivos em seguida.
-- ============================================================

-- A limpeza apagou a imagem desta mensagem? É o que faz o balão dizer
-- "imagem removida" em vez de mostrar uma foto quebrada.
alter table public.mensagens add column if not exists anexo_limpo_em timestamptz;

create or replace function public.limpar_imagens_ate(data_corte date)
returns table (limpas integer, caminhos text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  arquivos text[];
  total    integer;
begin
  if not public.sou_admin() then
    raise exception 'Apenas o Administrador pode limpar as imagens antigas';
  end if;

  select coalesce(array_agg(anexo_caminho), '{}')
    into arquivos
    from public.mensagens
   where tipo = 'imagem'
     and criado_em < data_corte
     and anexo_caminho is not null;

  with limpas_agora as (
    update public.mensagens
       set anexo_caminho     = null,
           imagem_url        = null,
           anexo_limpo_em    = now()
     where tipo = 'imagem'
       and criado_em < data_corte
       and anexo_caminho is not null
    returning 1
  )
  select count(*) into total from limpas_agora;

  return query select total, arquivos;
end;
$$;

-- Meses de imagem que ficam guardados, e quando a limpeza rodou pela última
-- vez. Ficam nas configurações da rede porque a regra é da empresa, não do
-- aparelho de quem abriu o sistema.
alter table public.configuracoes
  add column if not exists meses_historico_imagens integer not null default 2;
alter table public.configuracoes
  add column if not exists ultima_limpeza_imagens timestamptz;

-- ============================================================
-- CONFERÊNCIA
--
-- "Success" no editor não diz o que ficou valendo: um arquivo antigo também
-- termina com sucesso. Esta consulta mostra a regra de gravação de cada
-- tabela, para dar para ver com os próprios olhos o que o banco aceita.
--
-- O esperado é `auth.uid() IS NOT NULL` em conversas, participantes,
-- leituras_mensagem e auditoria: gravar ali depende apenas de estar
-- autenticado. Se alguma delas aparecer exigindo sou_admin(), nivel ou
-- participo_da_conversa(), é uma versão anterior deste arquivo que ficou no
-- banco — e é ela que faz o envio de mensagem ser recusado.
-- ============================================================

select
  tablename  as tabela,
  policyname as regra,
  with_check as exige_para_gravar
from pg_policies
where schemaname = 'public'
  and cmd = 'INSERT'
  and tablename in (
    'conversas', 'participantes', 'mensagens', 'leituras_mensagem',
    'avisos_rede', 'registros_ponto', 'auditoria'
  )
order by tablename;
