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
  nivel                           smallint not null default 1 check (nivel between 1 and 5),
  foto                            text,
  presenca                        text not null default 'desconectado',
  visto_por_ultimo                text default 'Agora',
  ramal                           text,
  telefone                        text,
  email                           text,
  matricula                       text,
  cnpj                            text,
  departamento                    text,
  data_admissao                   text,
  observacoes                     text,
  -- NULO quer dizer "vale o turno da pessoa", que é o certo para quase
  -- todo mundo. Era `not null default 480`, e o efeito foi silencioso: a
  -- coluna nunca vinha vazia, então a jornada da ficha vencia o turno
  -- SEMPRE — inclusive para os estagiários, que passaram a dever 3h25
  -- por dia contra uma jornada que ninguém tinha escolhido.
  -- Preenchida, é contrato individual (meio período) e manda mesmo.
  carga_horaria_diaria_minutos    integer,
  ativo                           boolean not null default true,
  criado_em                       timestamptz not null default now()
);

-- O TURNO DA ESCALA: decide o previsto do dia, o horário de cada batida e
-- quantas batidas fecham o dia. Nasceu em `escala-turnos.sql` só com A e
-- B — e o sistema oferecia também os turnos de estágio, que o banco
-- recusava: nenhum estagiário conseguiu gravar o dele (29/09/2026). A lista
-- é a de `TURNOS` (tipos.ts); um teste confere que as duas batem.
alter table public.colaboradores
  add column if not exists turno text not null default 'A';
alter table public.colaboradores drop constraint if exists colaboradores_turno_check;
alter table public.colaboradores
  add constraint colaboradores_turno_check
  check (turno in ('A', 'B', 'E0', 'E1', 'E2', 'E3'));

-- Quando o turno foi confirmado. Nulo = ainda vale o padrão que ninguém
-- escolheu, e a primeira batida pergunta. Quem grava é o gatilho
-- `turno_escolhido_uma_vez` (turno-escolhido-uma-vez.sql).
alter table public.colaboradores
  add column if not exists turno_confirmado_em timestamptz;

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

-- Colunas que nasceram depois das tabelas: quem já rodou este arquivo antes
-- não as tem, e "create table if not exists" não volta para criá-las
alter table public.mensagens add column if not exists editada_em timestamptz;
alter table public.colaboradores add column if not exists cnpj text;

-- MENSAGEM FIXADA: fica no alto da conversa, à vista de todos, até alguém
-- desafixar. Guardamos quem fixou porque, num grupo de 30 pessoas, "quem pôs
-- isso aqui" é a primeira pergunta — e sem autoria ninguém sabe a quem pedir
-- para tirar.
alter table public.mensagens
  add column if not exists fixada_em      timestamptz,
  add column if not exists fixada_por_id  text references public.colaboradores(id) on delete set null;

create index if not exists mensagens_fixadas_por_conversa
  on public.mensagens (conversa_id, fixada_em desc)
  where fixada_em is not null;

-- ORGANOGRAMA: o responsável direto de cada pessoa.
--
-- É esta coluna que decide quem aprova hora de quem. Preenchida, manda; em
-- branco, vale a regra automática de setor/loja (ver posso_decidir_jornada).
--
-- `on delete set null`: desligar alguém não pode apagar os subordinados dele
-- junto. Eles voltam a ficar sem responsável — e a regra automática os cobre
-- até o RH reposicionar.
alter table public.colaboradores
  add column if not exists responsavel_id text references public.colaboradores(id) on delete set null;

create index if not exists colaboradores_por_responsavel
  on public.colaboradores (responsavel_id);

-- PERMISSÕES DE FERRAMENTA: qual nível enxerga qual tela.
--
-- Fica na configuração porque é configuração da REDE, não do aparelho: o
-- administrador muda num lugar e vale em todos. Nulo = vale o padrão do
-- catálogo no aplicativo, nunca "ninguém vê nada" nem "todo mundo vê tudo".
--
-- ISTO CONTROLA PORTA, NÃO CONTEÚDO. Ligar uma ferramenta para o gerente
-- não mostra a rede inteira para ele: o que aparece dentro continua preso à
-- alçada (posso_decidir_jornada) e às políticas de cada tabela.
alter table public.configuracoes
  add column if not exists permissoes_ferramentas jsonb;

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
  -- 'preenchimento_turno' e o unico que nao veio de gente: o sistema
  -- deduziu o horario do turno num dia em que ninguem bateu. Valor
  -- proprio de proposito, para o banco guardar a diferenca entre o que
  -- foi batido, o que foi corrigido e o que foi suposto.
  metodo              text not null check (metodo in ('qrcode', 'codigo_manual', 'ajuste_rh', 'ajuste_lider', 'preenchimento_turno')),
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

-- As duas funções abaixo moram AQUI, e não junto da tabela de jornada,
-- porque as regras de registros_ponto — bem acima no arquivo — passaram a
-- citá-las. Função citada antes de existir faz o create policy falhar, e
-- só numa base nova, que é o pior lugar para descobrir.
/**
 * Posso decidir sobre a jornada desta pessoa?
 *
 * A regra da casa: ninguém aprova a própria hora, e a decisão sobe um
 * degrau. O líder responde pelo SETOR dele — inclusive em outras lojas,
 * porque a liderança de Compras atua nas cinco. O gerente responde pela
 * LOJA dele, de ponta a ponta, e é ele quem decide sobre os líderes.
 * RH, Diretoria e TI decidem em qualquer caso, porque é deles o controle do
 * banco de horas.
 */
/**
 * Subo a cadeia do organograma a partir de `alvo` até o topo e digo se
 * estou nela.
 *
 * A alçada vale para a cadeia INTEIRA, não só para o responsável direto: se
 * o balconista responde ao líder e o líder responde ao gerente, o gerente
 * também responde pelo balconista.
 *
 * O `depth < 20` é trava contra ciclo. A tela impede criar um (A responde a
 * B que responde a A), mas se um aparecer no dado, a recursão sem limite
 * travaria a consulta — e com ela o banco de horas da rede inteira.
 */
create or replace function public.estou_na_cadeia_de(alvo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive acima as (
    select c.responsavel_id as id, 1 as depth
      from public.colaboradores c
     where c.id = alvo
       and c.responsavel_id is not null
    union all
    select c.responsavel_id, a.depth + 1
      from acima a
      join public.colaboradores c on c.id = a.id
     where c.responsavel_id is not null
       and a.depth < 20
  )
  select exists (
    select 1 from acima where id = public.meu_colaborador_id()
  );
$$;

create or replace function public.posso_decidir_jornada(alvo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- O LÍDER DECIDE A PRÓPRIA JORNADA.
    -- Condicionado a responder por alguém: sem isso, qualquer pessoa
    -- aprovaria as próprias horas e a fila deixaria de existir.
    (
      alvo = public.meu_colaborador_id()
      and exists (
        select 1 from public.colaboradores
         where responsavel_id = public.meu_colaborador_id()
      )
    )

    or (
    -- Quem não responde por ninguém não decide sobre a própria hora
    alvo is distinct from public.meu_colaborador_id()
    and (
      -- RH, Diretoria e TI seguem por fora da cadeia: o controle é deles
      public.cuido_de_pessoas()

      -- POSICIONADO NO ORGANOGRAMA: só a cadeia dele decide. O alcance
      -- automático por setor e por loja deixa de valer para esta pessoa —
      -- é isto que faz o organograma ser regra, e não desenho.
      or (
        exists (
          select 1 from public.colaboradores
           where id = alvo and responsavel_id is not null
        )
        and public.estou_na_cadeia_de(alvo)
      )

      -- AINDA NÃO POSICIONADO: a regra automática de antes, que impede as
      -- horas de quem falta posicionar de ficarem paradas na fila
      or exists (
        select 1
          from public.colaboradores solicitante,
               public.colaboradores eu
         where solicitante.id = alvo
           and solicitante.responsavel_id is null
           and eu.id = public.meu_colaborador_id()
           -- A decisão sobe: quem está no mesmo degrau não aprova o colega
           and eu.nivel > solicitante.nivel
           and (
             -- Gerente responde pela loja inteira
             (eu.nivel >= 3 and eu.loja = solicitante.loja)
             -- O alcance por setor é do líder, e só dele: se valesse acima,
             -- um gerente de outra loja decidiria sobre quem não é dele só
             -- por partilharem o setor
             or (eu.nivel = 2 and eu.setor = solicitante.setor)
           )
      )
    ));
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
        'codigos_ponto_loja',
    'ajustes_jornada', 'registros_ponto', 'configuracoes', 'auditoria'
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

/**
 * A pessoa edita a própria linha (foto, presença, contato) — mas há campos
 * que ela não pode mexer em si mesma, porque são exatamente os que decidem
 * o que ela pode fazer no sistema:
 *
 *   responsavel_id → quem aprova a hora dela. Sem esta trava, bastaria
 *                    apontar o próprio responsável para um colega de
 *                    confiança e a hora sairia aprovada por fora da linha.
 *   nivel          → a autorização. Subir para 5 daria o sistema inteiro.
 *   loja / setor   → o alcance da regra automática, para quem ainda não
 *                    está posicionado no organograma.
 *
 * A política de UPDATE sozinha não resolve: ela deixa a pessoa gravar na
 * própria linha, e é dentro da linha que estão estes campos. A checagem tem
 * que ser por coluna, e por isso é gatilho.
 */
create or replace function public.apenas_rh_move_o_organograma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.cuido_de_pessoas() then
    return new;
  end if;

  -- Devolve o valor antigo em vez de recusar a gravação inteira, como o
  -- gatilho das mensagens já faz com remetente e conversa.
  --
  -- Recusar seria pior na prática: o app grava a LINHA TODA ao salvar
  -- qualquer coisa, então uma pessoa trocando a própria foto manda junto o
  -- setor que tem em cache. Se o RH tivesse acabado de movê-la, o cache
  -- estaria velho e a troca de foto morreria com um erro sobre organograma.
  -- Assim o campo protegido simplesmente não muda, e o resto grava.
  new.responsavel_id := old.responsavel_id;
  new.nivel          := old.nivel;
  new.loja           := old.loja;
  new.setor          := old.setor;

  return new;
end;
$$;

drop trigger if exists colaboradores_organograma_protegido on public.colaboradores;
create trigger colaboradores_organograma_protegido
  before update on public.colaboradores
  for each row execute function public.apenas_rh_move_o_organograma();

-- O HORÁRIO, ESCOLHIDO UMA VEZ.
--
-- Todas as fichas nasceram no Turno A, e o turno B era cobrado como
-- atrasado todo dia. A pessoa diz o próprio horário na primeira batida —
-- uma vez, e só entre os do perfil dela; depois, só RH e TI mudam.
--
-- E a jornada inteira fica fora do alcance da própria pessoa: turno,
-- cargas, sábado, intervalo e cargo (que decide se ela é de estágio). A
-- política de UPDATE deixa cada um gravar a própria linha, e sem isto
-- bastava encurtar a própria carga para nunca mais dever hora.
--
-- Como no organograma, o campo protegido volta ao valor antigo em vez de
-- recusar: o app grava a linha inteira ao trocar a foto.
--
-- O perfil (estágio ou integral) repete `ehDeEstagio` e os turnos repetem
-- `turnosParaEscolher` (tipos.ts). Mudou lá, mude aqui.
create or replace function public.turno_escolhido_uma_vez()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  estagio boolean;
begin
  -- Sem usuário (`auth.uid()` nulo) é o SQL Editor do TI: sem isto, a
  -- correção de turno feita por script voltaria ao valor antigo calada
  if auth.uid() is null or public.cuido_de_pessoas() then
    -- RH e TI escolhendo o turno de alguém: está confirmado
    if tg_op = 'INSERT' then
      if new.turno <> 'A' then
        new.turno_confirmado_em := coalesce(new.turno_confirmado_em, now());
      end if;
    elsif new.turno is distinct from old.turno then
      new.turno_confirmado_em := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  new.cargo                        := old.cargo;
  new.carga_horaria_diaria_minutos := old.carga_horaria_diaria_minutos;
  new.carga_semanal_minutos        := old.carga_semanal_minutos;
  new.trabalha_sabado              := old.trabalha_sabado;
  new.tem_intervalo                := old.tem_intervalo;

  estagio := lower(old.setor) like '%está%'
          or lower(old.setor) like '%esta%'
          or lower(old.cargo) like '%estagi%';

  -- A única troca aceita: quem nunca confirmou, confirmando agora um
  -- turno do próprio perfil. Qualquer outra coisa volta ao que era.
  if old.turno_confirmado_em is null
     and new.turno_confirmado_em is not null
     and (
       (estagio and new.turno in ('E1', 'E2', 'E3'))
       or (not estagio and new.turno in ('A', 'B'))
     )
  then
    new.turno_confirmado_em := now();
  else
    new.turno               := old.turno;
    new.turno_confirmado_em := old.turno_confirmado_em;
  end if;

  return new;
end;
$$;

drop trigger if exists colaboradores_turno_escolhido_uma_vez on public.colaboradores;
create trigger colaboradores_turno_escolhido_uma_vez
  before insert or update on public.colaboradores
  for each row execute function public.turno_escolhido_uma_vez();

-- A CIÊNCIA DA ADVERTÊNCIA: a pessoa só assina, uma vez.
--
-- A política de UPDATE deixa quem recebeu a advertência gravar na linha
-- dela — é assim que a ciência entra. Só que deixava a linha INTEIRA: o
-- motivo, o tipo, a data, e até apagar a ciência já dada. Advertência que
-- o advertido reescreve não é registro de nada.
--
-- Fora do RH e do TI (e do SQL Editor, sem usuário), tudo volta ao que
-- era, menos a ciência — e ela só entra se ainda não havia, com a hora do
-- banco, não a do aparelho.
--
-- A tabela nasce em `rh-holerite-advertencia.sql`; por isso o gatilho só
-- é ligado quando ela existe.
create or replace function public.advertido_so_da_ciencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ciencia timestamptz;
begin
  if auth.uid() is null or public.cuido_de_pessoas() then
    return new;
  end if;

  ciencia := case
    when old.ciencia_em is null and new.ciencia_em is not null then now()
    else old.ciencia_em
  end;

  new := old;
  new.ciencia_em := ciencia;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.advertencias') is not null then
    drop trigger if exists advertencias_so_ciencia on public.advertencias;
    create trigger advertencias_so_ciencia
      before update on public.advertencias
      for each row execute function public.advertido_so_da_ciencia();
  end if;
end;
$$;

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

-- FALTAVA ESTA, e a falta era silenciosa.
--
-- A tabela tinha regra de ler, inserir e apagar — e nenhuma de ATUALIZAR.
-- Com a seguranca por linha ligada, um update sem regra NAO e recusado com
-- erro: ele encontra ZERO linhas e devolve sucesso. Entao fixar conversa,
-- arquivar e excluir NUNCA chegaram ao banco — valiam so no navegador de
-- quem clicou, e a sincronizacao seguinte trazia tudo de volta.
--
-- So a propria linha, nos dois lados: o using decide quais linhas a pessoa
-- alcanca, e o with check impede que ela entregue a linha para outra pessoa
-- ao gravar. Sem o segundo, daria para mexer na lista do colega.
drop policy if exists participantes_atualizacao on public.participantes;
create policy participantes_atualizacao on public.participantes
  for update to authenticated
  using (colaborador_id = public.meu_colaborador_id())
  with check (colaborador_id = public.meu_colaborador_id());

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

-- CÓDIGOS DE PONTO: só quem cuida do cartaz lê e gera (a função está logo
-- abaixo). Quem bate não precisa ler: `bater_ponto` confere o código no
-- servidor. Antes todos liam os códigos das cinco lojas para o app
-- validar, e o código deixava de ser segredo de quem está na loja.
drop policy if exists codigos_leitura on public.codigos_ponto_loja;

/**
 * O cartaz de ponto de uma loja é cuidado pelo GERENTE dela, além de RH,
 * Diretoria e TI.
 *
 * Preso à loja de propósito: trocar o código de outra unidade derrubaria o
 * ponto de gente por quem o gerente não responde — o QR antigo para de valer
 * no instante em que o novo nasce.
 *
 * O líder de setor fica de fora: o cartaz é da loja, não do setor, e a
 * liderança de Compras atua nas cinco.
 */
create or replace function public.cuido_do_qr_da_loja(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.cuido_de_pessoas()
    or exists (
      select 1 from public.colaboradores
       where id = public.meu_colaborador_id()
         and nivel >= 3
         and loja = alvo
    );
$$;

create policy codigos_leitura on public.codigos_ponto_loja
  for select to authenticated using (public.cuido_do_qr_da_loja(loja));

drop policy if exists codigos_escrita on public.codigos_ponto_loja;
create policy codigos_escrita on public.codigos_ponto_loja
  for all to authenticated
  using (public.cuido_do_qr_da_loja(loja))
  with check (public.cuido_do_qr_da_loja(loja));

-- PONTO: cada um vê e bate o próprio; RH, Administrador e gestores
-- enxergam a equipe; só RH e Administrador corrigem.
-- Os dias com batida faltando, para "Pontos incompletos" e o aviso do
-- espelho, perguntados ao banco e não ao cache (pontos-incompletos.sql).
-- SECURITY INVOKER: valem as regras de leitura logo abaixo.
create or replace function public.dias_com_batida_incompleta(inicio date, fim date)
returns table (colaborador_id text, data date, tipos text[], horas text[])
language sql
stable
security invoker
set search_path = public
as $$
  select r.colaborador_id,
         r.data,
         array_agg(r.tipo order by r.horario),
         array_agg(r.hora_formatada order by r.horario)
    from public.registros_ponto r
   where r.data between inicio and fim
   group by r.colaborador_id, r.data
  having count(*) < 4;
$$;

grant execute on function public.dias_com_batida_incompleta(date, date) to authenticated;

-- Em que dias cada pessoa bateu, uma linha por pessoa: o aplicativo conta
-- os dias de trabalho vazios do espelho (dias-com-batida.sql)
create or replace function public.dias_com_batida(inicio date, fim date)
returns table (colaborador_id text, dias date[])
language sql
stable
security invoker
set search_path = public
as $$
  select r.colaborador_id,
         array_agg(distinct r.data order by r.data)
    from public.registros_ponto r
   where r.data between inicio and fim
   group by r.colaborador_id;
$$;

grant execute on function public.dias_com_batida(date, date) to authenticated;


drop policy if exists ponto_leitura on public.registros_ponto;
create policy ponto_leitura on public.registros_ponto
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.cuido_de_pessoas()
    -- Quem responde pela pessoa enxerga o ponto dela.
    --
    -- Aqui havia `meu_nivel() >= 3`, que dava a QUALQUER gerente o ponto de
    -- QUALQUER pessoa da rede, inclusive de outra loja. A tela filtrava; o
    -- banco não. Trava que mora só na tela não é trava.
    --
    -- O gerente continua alcançando a loja dele: quem está posicionado no
    -- organograma vem pela cadeia, e quem não está cai na regra automática
    -- de loja, que é parte desta mesma função.
    or public.posso_decidir_jornada(colaborador_id)
  );

drop policy if exists ponto_batida on public.registros_ponto;
create policy ponto_batida on public.registros_ponto
  for insert to authenticated
  with check (
    -- A batida da PRÓPRIA pessoa não entra por aqui: só por `bater_ponto`,
    -- que confere o código e carimba a hora no servidor
    -- (ponto-pelo-servidor.sql). Antes o aparelho mandava dia e hora
    -- prontos, e o banco aceitava qualquer horário.
    public.cuido_de_pessoas()
    -- O responsável lança a batida que faltou, na fila de aprovação. Sem
    -- isto ele só podia aprovar o dia errado ou recusar — e recusar não
    -- conserta o espelho de ninguém.
    -- E preenche os dias vazios da equipe pelo turno, como o RH: sem o
    -- segundo valor, o preenchimento do líder seria recusado pelo banco
    -- enquanto o do RH funcionava.
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo in ('ajuste_lider', 'preenchimento_turno')
    )
  );

-- A BATIDA DE QUEM ESTÁ NA LOJA: o aparelho manda o que leu no cartaz e
-- qual batida é a próxima; o banco confere o código e carimba dia e hora
-- pelo relógio dele, em Brasília (ponto-pelo-servidor.sql).
create or replace function public.bater_ponto(p_codigo text, p_loja text, p_tipo text)
returns public.registros_ponto
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
  v_loja text;
  v_metodo text;
  novo public.registros_ponto;
begin
  select * into eu from public.colaboradores where id = public.meu_colaborador_id();
  if eu.id is null then
    raise exception 'Sessão sem cadastro. Saia e entre de novo para bater o ponto.' using errcode = 'P0001';
  end if;
  if not eu.ativo then
    raise exception 'Esta conta está desativada. Procure o RH.' using errcode = 'P0001';
  end if;
  if p_tipo is null or not (p_tipo = any (ordem)) then
    raise exception 'Marcação desconhecida.' using errcode = 'P0001';
  end if;

  -- O código do cartaz: pela loja do QR, ou só pelo código digitado
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

  -- Domingo não tem jornada (RECUSA_DE_DOMINGO, ponto.ts). A tela recusa
  -- antes; aqui é a trava que vale
  if extract(dow from em_brasilia) = 0 then
    raise exception 'Domingo não tem jornada: o ponto não registra horário no domingo.' using errcode = 'P0001';
  end if;

  -- A ordem do dia: nada depois de uma batida que vem mais adiante, e nada
  -- sem a entrada. Qual é a próxima (sábado e estágio pulam o almoço) quem
  -- sabe é o aplicativo; o banco só impede batida fora de ordem.
  if exists (
    select 1 from public.registros_ponto r
     where r.colaborador_id = eu.id and r.data = hoje
       and array_position(ordem, r.tipo) > array_position(ordem, p_tipo)
  ) or (
    p_tipo <> 'entrada' and not exists (
      select 1 from public.registros_ponto r
       where r.colaborador_id = eu.id and r.data = hoje and r.tipo = 'entrada'
    )
  ) then
    raise exception 'Batida fora de ordem. Atualize a tela e tente de novo.' using errcode = 'P0001';
  end if;

  -- A repetida cai na restrição única (23505), que o app já trata
  insert into public.registros_ponto
    (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja, criado_em)
  values
    ('ponto-' || replace(gen_random_uuid()::text, '-', ''), eu.id, hoje, p_tipo, agora,
     to_char(em_brasilia, 'HH24:MI'), v_metodo, v_loja, agora)
  returning * into novo;

  return novo;
end;
$$;

revoke all on function public.bater_ponto(text, text, text) from public, anon;
grant execute on function public.bater_ponto(text, text, text) to authenticated;

drop policy if exists ponto_ajuste on public.registros_ponto;
create policy ponto_ajuste on public.registros_ponto
  for update to authenticated
  using (
    public.cuido_de_pessoas()
    or public.posso_decidir_jornada(colaborador_id)
  )
  with check (
    public.cuido_de_pessoas()
    -- O responsável só grava marcação carimbada como correção dele: é o
    -- que impede a correção de se passar por batida da própria pessoa
    or (public.posso_decidir_jornada(colaborador_id) and metodo = 'ajuste_lider')
  );

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
-- ATIVAÇÃO DE ACESSO
--
-- REGRA: ninguém cria conta pela tela de login. Todo colaborador é
-- cadastrado dentro do sistema (pelo RH ou pela planilha de carga) e só
-- então consegue ATIVAR o acesso. O gatilho não CRIA ficha — ele LIGA a
-- conta de autenticação a uma ficha que já existe, casando pelo login.
--
-- Por que isto está escrito aqui, e não num arquivo à parte: esta função
-- já existiu em dois arquivos ao mesmo tempo, com comportamentos opostos.
-- O outro arquivo criava uma ficha nova a cada primeiro acesso, e quem
-- rodasse os dois na ordem errada ficava com ele valendo — o gerente
-- entrava e nascia um segundo cadastro dele, nível 1, sem nada configurado.
-- Uma função, um lugar.
-- ============================================================

-- Quem ainda está com a senha de primeiro acesso e precisa definir a dele
alter table public.colaboradores
  add column if not exists precisa_trocar_senha boolean not null default true;

/**
 * Senha que libera a PRIMEIRA entrada daquela pessoa.
 *
 * Em branco = vale a padrão da rede. O RH pode definir uma individual para
 * quem preferir entregar em mão. É consumida na ativação: depois de usada,
 * volta a ficar em branco e quem manda é a senha que a pessoa escolheu.
 *
 * Sem isto, QUALQUER senha ativava a conta — quem descobrisse a URL e
 * chutasse um login viraria aquela pessoa, com o nível dela.
 */
alter table public.colaboradores
  add column if not exists senha_ativacao text;

-- ------------------------------------------------------------
-- CONSERTO DO CADASTRO REPETIDO
--
-- Enquanto o gatilho antigo esteve valendo, quem entrou pela primeira vez
-- ganhou uma ficha NOVA em vez de assumir a que veio da planilha: nível 1,
-- Balcão, sem CNPJ nem matrícula — e a ficha boa ficou órfã, sem acesso.
--
-- Este bloco desfaz isso. A ficha fantasma é reconhecível pelo id, que o
-- gatilho antigo montava a partir do próprio usuário de autenticação
-- ('colab-' + o uuid sem hífen). Para cada fantasma que tenha uma ficha de
-- planilha com o mesmo login, o acesso volta para a ficha boa e o que a
-- pessoa produziu no meio tempo vai junto.
-- ------------------------------------------------------------
do $$
declare
  fantasma record;
begin
  for fantasma in
    select g.id as id_fantasma, g.auth_user_id, r.id as id_real
      from public.colaboradores g
      join public.colaboradores r
        on lower(trim(r.login)) = lower(trim(g.login))
       and r.id <> g.id
       and r.auth_user_id is null
     where g.auth_user_id is not null
       and g.id = 'colab-' || replace(g.auth_user_id::text, '-', '')
  loop
    -- O que a pessoa fez logada como fantasma passa para a ficha boa.
    -- 'on conflict do nothing' onde há chave composta: se os dois lados
    -- tiverem a mesma linha, fica a que já estava.
    update public.participantes    set colaborador_id = fantasma.id_real
      where colaborador_id = fantasma.id_fantasma
        and not exists (
          select 1 from public.participantes p2
           where p2.conversa_id = participantes.conversa_id
             and p2.colaborador_id = fantasma.id_real);
    update public.mensagens        set remetente_id   = fantasma.id_real
      where remetente_id = fantasma.id_fantasma;
    update public.registros_ponto  set colaborador_id = fantasma.id_real
      where colaborador_id = fantasma.id_fantasma
        and not exists (
          select 1 from public.registros_ponto r2
           where r2.colaborador_id = fantasma.id_real
             and r2.data = registros_ponto.data
             and r2.tipo = registros_ponto.tipo);
    update public.ajustes_jornada  set colaborador_id = fantasma.id_real
      where colaborador_id = fantasma.id_fantasma
        and not exists (
          select 1 from public.ajustes_jornada a2
           where a2.colaborador_id = fantasma.id_real
             and a2.data = ajustes_jornada.data);

    -- O acesso muda de dono ANTES de apagar: a coluna é unique, e as duas
    -- fichas não podem apontar para o mesmo usuário nem por um instante
    update public.colaboradores set auth_user_id = null  where id = fantasma.id_fantasma;
    update public.colaboradores
       set auth_user_id = fantasma.auth_user_id,
           precisa_trocar_senha = true
     where id = fantasma.id_real;

    delete from public.colaboradores where id = fantasma.id_fantasma;

    raise notice 'Cadastro repetido desfeito: % virou %', fantasma.id_fantasma, fantasma.id_real;
  end loop;
end $$;

-- Login é identidade, e " Fabio " não pode ser outra pessoa que "fabio".
-- O índice antigo já ignorava a caixa; este ignora também o espaço sobrando,
-- que é como o gatilho compara.
drop index if exists public.colaboradores_login_minusculo;
create unique index if not exists colaboradores_login_unico
  on public.colaboradores (lower(trim(login)));

create or replace function public.criar_colaborador_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  login_informado  text;
  senha_informada  text;
  ficha            public.colaboradores%rowtype;
  rede_vazia       boolean;
begin
  login_informado := lower(trim(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'login'), ''),
    split_part(new.email, '@', 1)
  )));
  senha_informada := coalesce(new.raw_user_meta_data ->> 'ativacao', '');

  select not exists (select 1 from public.colaboradores) into rede_vazia;

  -- BANCO VAZIO: o primeiro a entrar vira o Administrador. Sem esta saída
  -- ninguém entraria nunca, porque cadastrar exige já ser RH ou TI.
  if rede_vazia then
    insert into public.colaboradores (
      id, auth_user_id, nome, login, cargo, setor, loja, nivel,
      foto, presenca, ativo, precisa_trocar_senha
    )
    values (
      'colab-' || replace(new.id::text, '-', ''),
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), login_informado),
      login_informado,
      'Administrador Geral', 'TI', 'Pirassununga', 5,
      '/logo-malachias.svg', 'disponivel', true, true
    );
    return new;
  end if;

  select * into ficha
    from public.colaboradores
   where lower(trim(login)) = login_informado
   limit 1;

  if ficha.id is null then
    raise exception 'Login nao cadastrado na rede. Procure o RH.'
      using errcode = 'P0001';
  end if;

  -- Ficha já ativada: a conta é de outra sessão de autenticação. Adotar de
  -- novo entregaria o cadastro de alguém a quem chegasse depois.
  if ficha.auth_user_id is not null then
    raise exception 'Este login ja tem acesso ativado. Use a senha dele ou procure o RH.'
      using errcode = 'P0001';
  end if;

  if senha_informada is distinct from coalesce(nullif(ficha.senha_ativacao, ''), '123456') then
    raise exception 'Senha de primeiro acesso incorreta. Procure o RH.'
      using errcode = 'P0001';
  end if;

  -- A ficha é ADOTADA: nivel, loja, setor, cargo, CNPJ e organograma que
  -- vieram da planilha continuam exatamente como estão
  update public.colaboradores
     set auth_user_id        = new.id,
         senha_ativacao      = null,
         precisa_trocar_senha = true
   where id = ficha.id;

  return new;
end;
$$;

-- A senha digitada viajou dentro do cadastro do usuário; não pode ficar
-- guardada lá em texto puro depois de conferida
create or replace function public.limpar_senha_de_ativacao()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  update auth.users
     set raw_user_meta_data = raw_user_meta_data - 'ativacao'
   where id = new.id
     and raw_user_meta_data ? 'ativacao';
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_colaborador_do_usuario();

-- Roda depois da adoção (ordem alfabética do nome do gatilho), para apagar
-- a senha de ativação só depois de ela ter sido conferida
drop trigger if exists ao_criar_usuario_limpar_senha on auth.users;
create trigger ao_criar_usuario_limpar_senha
  after insert on auth.users
  for each row execute function public.limpar_senha_de_ativacao();

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
-- HIERARQUIA DA REDE
--
--   5  TI             administra o sistema e os cadastros
--   4  Diretoria      enxerga a rede e publica comunicado oficial
--   3  Gerente        responde pela loja inteira
--   2  Líder de setor acompanha o próprio setor
--   1  Colaborador    conversa e bate o próprio ponto
--
-- Na matriz existem líderes de setor além do gerente; nas filiais o gerente
-- acumula. Mas o nível vale em qualquer loja, porque há exceção real: a
-- liderança de Compras atua nas cinco.
--
-- MIGRAÇÃO: quem estava no 4 sobe para 5. No modelo antigo o 4 era o
-- administrador único, com o painel inteiro na mão — deixá-lo no 4 novo
-- (Diretoria) tiraria em silêncio um acesso que a pessoa já usa. Quem for
-- Diretoria e não TI, o administrador rebaixa pelo painel, de propósito.
-- ============================================================

alter table public.colaboradores drop constraint if exists colaboradores_nivel_check;
update public.colaboradores set nivel = 5 where nivel = 4;
alter table public.colaboradores
  add constraint colaboradores_nivel_check check (nivel between 1 and 5);

-- Administrar o sistema é do TI, e só dele
create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_nivel() >= 5;
$$;

-- Cuidar de pessoas — cadastrar, ajustar ponto dos outros — é do RH, da
-- Diretoria e do TI. Gerente responde pela loja, mas não mexe em ficha.
create or replace function public.cuido_de_pessoas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_nivel() >= 4 or public.meu_setor() = 'RH';
$$;

-- Publicar na Central: do líder de setor para cima. É `publicaComunicado`
-- (tipos.ts) — e esta é a trava que vale. Estava em 4 (Diretoria e TI)
-- desde a migração dos cinco níveis, enquanto a tela já liberava o líder:
-- ele montava a publicação inteira e o banco recusava no fim. Pedido do
-- Elias: "líderes também poderão publicar avisos, conteúdos".
drop policy if exists avisos_insercao on public.avisos_rede;
create policy avisos_insercao on public.avisos_rede
  for insert to authenticated with check (public.meu_nivel() >= 2);

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

-- DOCUMENTO PESSOAL: so o dono e quem cuida de pessoas.
--
-- A regra era so `bucket_id`, e isso deixava QUALQUER autenticado ler
-- QUALQUER arquivo. Para anexo de conversa passava, porque o caminho leva
-- o id aleatorio da mensagem. Para holerite nao: o caminho e
-- `holerites/<id-do-colaborador>/2026-09.pdf`, e os ids aparecem na lista
-- de equipe. Bastava montar o endereco.
create policy anexos_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos'
    and (
      case
        when split_part(name, '/', 1) in ('holerites', 'advertencias') then
          split_part(name, '/', 2) = public.meu_colaborador_id()
          or public.cuido_de_pessoas()
        else true
      end
    )
  );

-- Documento pessoal so e publicado por quem cuida de pessoas: senao
-- qualquer um poderia subir um arquivo na pasta de outra pessoa, e o
-- holerite que ela abrisse seria o que o invasor pos la.
create policy anexos_envio on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and (
      case
        when split_part(name, '/', 1) in ('holerites', 'advertencias')
          then public.cuido_de_pessoas()
        else true
      end
    )
  );

-- Apagar é parte do expurgo de histórico, e isso é decisão da administração
create policy anexos_remocao on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and (
      case
        when split_part(name, '/', 1) in ('holerites', 'advertencias')
          then public.cuido_de_pessoas()
        else public.sou_admin()
      end
    )
  );

-- ============================================================
-- LIMPEZA DO HISTÓRICO DE CONVERSAS
--
-- Passado o prazo de guarda, a mensagem antiga sai por inteiro: texto,
-- foto, áudio e documento. É o que libera espaço de verdade — o arquivo
-- pesa, mas a linha também ocupa, e meia mensagem na conversa não serve
-- para nada.
--
-- O QUE ESTA FUNÇÃO NÃO ALCANÇA, por construção: ponto e banco de horas,
-- colaboradores, comunicados da rede, códigos das lojas, configurações e
-- auditoria. Ela só conhece a tabela de mensagens. As leituras saem junto
-- pelo `on delete cascade`, porque leitura de mensagem que não existe mais
-- não é informação, é resto.
--
-- Devolve os caminhos dos arquivos que ficaram órfãos: apagar a linha não
-- alcança o armazenamento, e sem isso o espaço continuaria ocupado por
-- anexos que nenhuma mensagem mais aponta.
-- ============================================================

create or replace function public.limpar_conversas_ate(data_corte date)
returns table (removidas integer, caminhos text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  arquivos text[];
  total    integer;
begin
  if not public.sou_admin() then
    raise exception 'Apenas o Administrador pode limpar o historico de conversas';
  end if;

  select coalesce(array_agg(anexo_caminho), '{}')
    into arquivos
    from public.mensagens
   where criado_em < data_corte
     and anexo_caminho is not null;

  with apagadas as (
    delete from public.mensagens
     where criado_em < data_corte
    returning 1
  )
  select count(*) into total from apagadas;

  return query select total, arquivos;
end;
$$;

-- A função anterior limpava só a imagem e mantinha a mensagem. A regra da
-- casa passou a apagar a mensagem inteira, então ela não vale mais.
drop function if exists public.limpar_imagens_ate(date);
alter table public.mensagens drop column if exists anexo_limpo_em;
-- Números do banco para o painel de administração.
--
-- Precisa ser `security definer` porque a contagem tem que ser da REDE
-- inteira: o Administrador não participa de toda conversa, e uma contagem
-- filtrada pela RLS mostraria menos do que existe — o que, num painel que
-- serve para decidir sobre espaço, seria pior do que não mostrar nada.
-- A assinatura mudou junto com a regra; trocar o retorno exige remover antes
drop function if exists public.uso_do_banco();

create or replace function public.uso_do_banco()
returns table (
  mensagens            bigint,
  com_arquivo          bigint,
  imagens              bigint,
  audios               bigint,
  registros_ponto      bigint,
  mensagem_mais_antiga timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.mensagens),
    (select count(*) from public.mensagens where anexo_caminho is not null),
    (select count(*) from public.mensagens where tipo = 'imagem'),
    (select count(*) from public.mensagens where tipo = 'recado_voz'),
    (select count(*) from public.registros_ponto),
    (select min(criado_em) from public.mensagens)
  where public.sou_admin();
$$;

-- Meses de conversa que ficam guardados, e quando a limpeza rodou pela
-- última vez. Ficam nas configurações da rede porque a regra é da empresa,
-- não do aparelho de quem abriu o sistema.
alter table public.configuracoes
  add column if not exists meses_historico_conversas integer not null default 2;
alter table public.configuracoes
  add column if not exists ultima_limpeza_conversas timestamptz;

-- Aproveita o que já estava configurado antes de a regra passar a valer
-- para a conversa inteira, para o prazo escolhido não voltar ao padrão.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'configuracoes'
      and column_name = 'meses_historico_imagens'
  ) then
    update public.configuracoes
       set meses_historico_conversas = meses_historico_imagens,
           ultima_limpeza_conversas  = ultima_limpeza_imagens;

    alter table public.configuracoes drop column meses_historico_imagens;
    alter table public.configuracoes drop column ultima_limpeza_imagens;
  end if;
end $$;

-- ============================================================
-- APURAÇÃO DO DIA E APROVAÇÃO
--
-- A jornada fechada que não bate com a carga contratada não vira saldo
-- sozinha. O sistema levanta a diferença e o responsável decide: a hora
-- extra foi autorizada? a saída mais cedo foi combinada?
--
-- O caminho é sempre o mesmo, sem atalho:
--   colaborador bate o ponto -> líder ou gerente decide -> banco de horas
--
-- Um ajuste por pessoa por dia. Se o RH corrigir uma marcação depois, a
-- apuração daquele dia é reescrita em vez de virar um segundo lançamento
-- concorrendo com o primeiro.
-- ============================================================

create table if not exists public.ajustes_jornada (
  id                   text primary key,
  colaborador_id       text not null references public.colaboradores(id) on delete cascade,
  data                 date not null,
  -- 'dia_incompleto': o dia pela metade e a FALTA, esperando o líder decidir
  -- (falta-na-fila.sql). Sem ele o banco recusava e a fila ficava vazia.
  tipo                 text not null check (tipo in ('hora_extra', 'debito', 'dia_incompleto')),
  -- Nunca negativo: o sinal vem do tipo, para não haver dois jeitos de ler.
  -- ZERO vale (apuracao-pode-zerar.sql): é como a reapuração desfaz um
  -- lançamento errado — o +8h13 da Fernanda no atestado de 25/09, por ex.
  minutos              integer not null check (minutos >= 0),
  minutos_trabalhados  integer not null,
  minutos_previstos    integer not null,
  estado               text not null default 'pendente'
                         check (estado in ('pendente', 'aprovado', 'recusado')),
  aprovador_id         text references public.colaboradores(id) on delete set null,
  aprovador_nome       text,
  decidido_em          timestamptz,
  observacao           text,
  criado_em            timestamptz not null default now(),
  unique (colaborador_id, data)
);

create index if not exists ajustes_por_estado
  on public.ajustes_jornada (estado, data);

alter table public.ajustes_jornada enable row level security;


-- LEITURA: cada um vê a própria apuração; quem decide vê a de quem responde
drop policy if exists ajustes_leitura on public.ajustes_jornada;
create policy ajustes_leitura on public.ajustes_jornada
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.posso_decidir_jornada(colaborador_id)
  );

-- CRIAÇÃO: nasce do ponto da própria pessoa, sempre pendente. O RH também
-- cria, porque corrigir uma marcação reescreve a apuração do dia.
--
-- E o LÍDER, sempre pendente: ao abrir "Aprovar jornadas" ele levanta os
-- dias que fecharam pela metade, e essa linha é de outra pessoa. Sem este
-- terceiro caso a aba mostrava "new row violates row-level security
-- policy" — a leitura e a decisão já sabiam de líder, só a criação não.
--
-- Pela MESMA função das outras duas, de propósito: escrita à mão outra
-- vez, ela voltaria a divergir.
drop policy if exists ajustes_abertura on public.ajustes_jornada;
create policy ajustes_abertura on public.ajustes_jornada
  for insert to authenticated
  with check (
    -- A própria pessoa: pendência, ou o carimbo automático da tolerância.
    -- Sem o segundo caso, todo dia que fechava DENTRO da tolerância era
    -- recusado pelo banco e existia só no aparelho de quem bateu.
    (
      colaborador_id = public.meu_colaborador_id()
      and (
        estado = 'pendente'
        or (estado = 'aprovado' and origem = 'tolerancia_automatica' and aprovador_id is null)
      )
    )
    or public.cuido_de_pessoas()
    -- Só PENDENTE: levantar o dia é para decidir, não é decidir
    or (public.posso_decidir_jornada(colaborador_id) and estado = 'pendente')
  );

-- DECISÃO: só quem responde pela pessoa. É isto que impede pular etapas —
-- a regra vale no banco, não só no botão da tela.
drop policy if exists ajustes_decisao on public.ajustes_jornada;
create policy ajustes_decisao on public.ajustes_jornada
  for update to authenticated
  using (
    public.posso_decidir_jornada(colaborador_id)
    -- O dono pode reescrever a própria apuração enquanto ninguém decidiu
    or (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
  )
  with check (
    public.posso_decidir_jornada(colaborador_id)
    or (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
  );

-- APAGAR SEGUE SÓ DO RH, e de propósito.
--
-- A tentação foi deixar a pessoa remover a própria pendência quando o dia
-- passa a fechar certo. Seria um buraco: bastaria apagar a linha para o
-- débito sumir, e a apuração só é refeita quando alguém bate ou corrige.
--
-- O dia que zera é REESCRITO como aprovado pela tolerância — diferença
-- zero cabe em qualquer tolerância —, o que tira da fila sem apagar nada.
drop policy if exists ajustes_remocao on public.ajustes_jornada;
create policy ajustes_remocao on public.ajustes_jornada
  for delete to authenticated using (public.cuido_de_pessoas());

-- ============================================================
-- RECARREGAR O CACHE DA API
--
-- O Supabase conversa com o banco através do PostgREST, que guarda em
-- memória o desenho de cada tabela. Criar coluna NÃO avisa ele: até o cache
-- virar, a API responde
--
--   "Could not find the 'x' column of 'y' in the schema cache"
--
-- mesmo com a coluna já existindo. Aconteceu com permissoes_ferramentas, e
-- aconteceria de novo com a próxima. Fica no fim do arquivo, depois de toda
-- alteração de estrutura, para a releitura pegar tudo de uma vez.
-- ============================================================
notify pgrst, 'reload schema';

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
