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
  tipo              text not null check (tipo in ('texto', 'recado_voz', 'arquivo', 'imagem', 'sistema')),
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

-- GRUPOS DE TODOS (grupos-de-todos.sql): quem administra o grupo, e quando
-- a pessoa saiu — a linha fica, e com ela o histórico até a saída
alter table public.participantes
  add column if not exists papel text not null default 'membro';
alter table public.participantes
  add column if not exists saiu_em timestamptz;
-- Quem saiu e foi adicionado de novo: até quando vai o histórico da passagem anterior
alter table public.participantes
  add column if not exists historico_ate timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'participantes_papel_check') then
    alter table public.participantes
      add constraint participantes_papel_check check (papel in ('admin', 'membro'));
  end if;
end
$$;

alter table public.mensagens drop constraint if exists mensagens_tipo_check;
alter table public.mensagens
  add constraint mensagens_tipo_check
  check (tipo in ('texto', 'recado_voz', 'arquivo', 'imagem', 'sistema'));


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

-- Administrar o sistema é do TI, e só dele (nível 5)
create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_nivel() >= 5;
$$;

-- Cuidar de pessoas — cadastrar, ajustar ponto dos outros, holerite — é do
-- RH, da Diretoria (4) e do TI (5). Gerente responde pela loja, mas não
-- mexe em ficha. A mesma regra da tela é `cuidaDePessoas` em `tipos.ts`.
--
-- Estas duas moravam aqui E na seção dos níveis, mais abaixo, com regras
-- diferentes (aqui ainda "= 4", do modelo antigo em que o 4 era o
-- administrador). Valia a de baixo só por ser rodada por último.
create or replace function public.cuido_de_pessoas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_nivel() >= 4 or public.meu_setor() = 'RH';
$$;

create or replace function public.participo_da_conversa(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participantes
    where conversa_id = alvo and colaborador_id = public.meu_colaborador_id()
  );
$$;

-- Participa AGORA (não saiu): é o que deixa escrever
create or replace function public.participo_ativamente(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participantes
    where conversa_id = alvo and colaborador_id = public.meu_colaborador_id() and saiu_em is null
  );
$$;

-- Lê a mensagem: participa agora, ou ela é de ANTES de a pessoa sair
-- O grupo criado por gente (e não conversa individual nem canal oficial)
create or replace function public.eh_grupo_de_pessoas(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversas where id = alvo and tipo = 'grupo' and not eh_sistema_padrao);
$$;

create or replace function public.posso_ler_mensagem(alvo text, quando timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participantes p
    where p.conversa_id = alvo and p.colaborador_id = public.meu_colaborador_id()
      and (p.saiu_em is null or quando <= p.saiu_em)
      and (
        not public.eh_grupo_de_pessoas(alvo)
        or quando >= p.entrou_em
        or (p.historico_ate is not null and quando <= p.historico_ate)
      )
  );
$$;

-- Canal oficial (das lojas, Avisos da Rede). Com a permissão do banco: a
-- regra de inscrição pergunta isto de quem AINDA NÃO enxerga a conversa
create or replace function public.eh_canal_oficial(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversas where id = alvo and eh_sistema_padrao);
$$;

create or replace function public.sou_admin_do_grupo(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participantes
    where conversa_id = alvo and colaborador_id = public.meu_colaborador_id()
      and papel = 'admin' and saiu_em is null
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

  -- A ficha funcional (ficha-propria-protegida.sql, 07/10/2026): com o app
  -- gravando por UPDATE, a regra de editar a própria linha passou a valer
  -- de verdade, e o que é do RH volta ao que era
  new.nome           := old.nome;
  new.login          := old.login;
  new.matricula      := old.matricula;
  new.cnpj           := old.cnpj;
  new.departamento   := old.departamento;
  new.data_admissao  := old.data_admissao;
  new.ativo          := old.ativo;

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
--
-- A ASSINATURA DO HOLERITE (tabelas `assinaturas`, `recebimentos_holerite`,
-- `tentativas_de_assinatura`, as funções `cadastrar_assinatura` e
-- `assinar_holerite`, e a trava de holerite assinado) mora inteira em
-- `assinatura-holerite.sql`, pelo mesmo motivo: depende de `holerites`.
-- Não copie para cá — duas definições divergem.
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

/*
  QUEM PODE INSCREVER QUEM:
    - o TI, em qualquer conversa;
    - na conversa INDIVIDUAL, só as duas pessoas dela, e só uma delas faz;
    - no CANAL OFICIAL, como hoje (o canal da loja se monta sozinho);
    - no GRUPO criado por alguém, ninguém direto: só pelas funções abaixo.
*/
drop policy if exists participantes_insercao on public.participantes;
create policy participantes_insercao on public.participantes
  for insert to authenticated
  with check (
    public.sou_admin()
    -- A outra pessoa da conversa individual: o id é "conv-ind-<um>-<outro>"
    or (
      conversa_id in (
        'conv-ind-' || public.meu_colaborador_id() || '-' || colaborador_id,
        'conv-ind-' || colaborador_id || '-' || public.meu_colaborador_id()
      )
    )
    -- A própria inscrição na conversa individual dela, que vem primeiro.
    -- Começo e fim do id comparados direto, e não com LIKE: um "_" no id
    -- viraria curinga
    or (
      colaborador_id = public.meu_colaborador_id()
      and left(conversa_id, 9) = 'conv-ind-'
      and (
        left(conversa_id, length('conv-ind-' || colaborador_id || '-')) = 'conv-ind-' || colaborador_id || '-'
        or right(conversa_id, length('-' || colaborador_id)) = '-' || colaborador_id
      )
    )
    or public.eh_canal_oficial(conversa_id)
  );

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
  for select to authenticated using (public.posso_ler_mensagem(conversa_id, criado_em));

drop policy if exists mensagens_insercao on public.mensagens;
create policy mensagens_insercao on public.mensagens
  for insert to authenticated
  with check (
    remetente_id = public.meu_colaborador_id()
    and public.participo_ativamente(conversa_id)
    -- A mensagem de sistema só sai das funções abaixo
    and tipo <> 'sistema'
  );

-- Reagir (e editar a própria): só quem ainda está na conversa
drop policy if exists mensagens_edicao on public.mensagens;
create policy mensagens_edicao on public.mensagens
  for update to authenticated using (public.participo_ativamente(conversa_id));

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
    --
    -- E o RH grava só CORREÇÃO ou PREENCHIMENTO, nunca com o método da
    -- batida (qrcode, codigo_manual): batida é marcação original, e só o
    -- servidor a cria (marcacao-original.sql, 07/10/2026).
    (
      public.cuido_de_pessoas()
      and metodo in ('ajuste_rh', 'ajuste_lider', 'preenchimento_turno')
    )
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
    -- A MARCAÇÃO ORIGINAL vai inteira para a ficha boa (marcacao-original.sql):
    -- ela não se apaga, e a fantasma com marcação não poderia ser excluída.
    -- A trava aceita só esta troca, de dono. A tabela nasce mais abaixo neste
    -- arquivo; num banco novo ela ainda não existe aqui, e não há o que mover.
    if to_regclass('public.marcacoes_originais') is not null then
      update public.marcacoes_originais set colaborador_id = fantasma.id_real
        where colaborador_id = fantasma.id_fantasma;
    end if;

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
-- A MIGRAÇÃO do modelo antigo (o 4 era o administrador e subiu para 5) já
-- foi aplicada e SAIU daqui (02/10/2026): o `update ... set nivel = 5
-- where nivel = 4` rodava de novo a cada execução deste arquivo, e
-- promoveria a TI toda a Diretoria cadastrada desde então.
--
-- `sou_admin()` e `cuido_de_pessoas()` estão definidas uma vez só, junto
-- das outras funções de quem-sou-eu, no começo do arquivo.
-- ============================================================

alter table public.colaboradores drop constraint if exists colaboradores_nivel_check;
alter table public.colaboradores
  add constraint colaboradores_nivel_check check (nivel between 1 and 5);

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

-- A origem, o motivo e o anexo da apuração (ponto-tolerancia-justificativas.sql).
-- Estavam só no delta: o esquema, rodado num banco vazio, parava na regra
-- `ajustes_abertura`, que usa `origem` (medido no Postgres local, 07/10/2026).
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

alter table public.ajustes_jornada enable row level security;


-- O SALDO DE COMPENSAÇÃO DO SÁBADO, mês a mês (compensacao-sabado.sql). Os
-- 10 min diários do turno integral pagam a folga de sábado; o que sobra
-- passa ao mês seguinte. Gravado só pela apuração da madrugada (chave de
-- serviço): não há política de escrita.
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

-- ============================================================
-- GRUPOS DE TODOS (03/10/2026) — as travas e as funções do grupo.
-- O mesmo texto de `grupos-de-todos.sql`; há teste conferindo.
-- ============================================================

/*
  A PRÓPRIA LINHA DE PARTICIPANTE: a pessoa mexe nas preferências dela
  (fixar, silenciar, tirar da lista) — e NÃO no papel nem na saída. Sem
  isto, quem foi removido voltava sozinho apagando o `saiu_em`, e
  qualquer um virava administrador mudando o `papel`.
*/
create or replace function public.participante_so_preferencias()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- O SQL Editor, o TI, e as funções do grupo (que conferem quem pode)
  if auth.uid() is null or public.sou_admin()
     or current_setting('conecta.funcao_do_grupo', true) = 'sim' then
    return new;
  end if;
  new.papel := old.papel;
  new.saiu_em := old.saiu_em;
  return new;
end;
$$;

drop trigger if exists participantes_so_preferencias on public.participantes;
create trigger participantes_so_preferencias
  before update on public.participantes
  for each row execute function public.participante_so_preferencias();

/*
  O NOME, A DESCRIÇÃO, A FOTO E QUEM PUBLICA, num grupo criado por
  alguém: só os administradores dele mudam. O resto da linha (a hora da
  última mensagem) segue mudando por qualquer participante.
*/
create or replace function public.grupo_so_admin_edita()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.sou_admin() or new.tipo <> 'grupo' or new.eh_sistema_padrao then
    return new;
  end if;
  if (new.nome, new.descricao, new.foto, new.apenas_gestores_publicam)
     is distinct from (old.nome, old.descricao, old.foto, old.apenas_gestores_publicam)
     and not public.sou_admin_do_grupo(old.id) then
    raise exception 'Só os administradores do grupo mudam o nome, a descrição e a foto.';
  end if;
  return new;
end;
$$;

drop trigger if exists conversas_grupo_so_admin_edita on public.conversas;
create trigger conversas_grupo_so_admin_edita
  before update on public.conversas
  for each row execute function public.grupo_so_admin_edita();

-- A mensagem de sistema e a hora do grupo, num lugar só
create or replace function public.registrar_no_grupo(alvo text, texto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.mensagens (id, conversa_id, remetente_id, tipo, texto)
  values ('sis-' || gen_random_uuid(), alvo, public.meu_colaborador_id(), 'sistema', texto);
  update public.conversas set atualizado_em = now() where id = alvo;
end;
$$;

-- Os nomes, para a mensagem de sistema: "Bia, Caio e Davi"
create or replace function public.nomes_em_lista(ids text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare
  nomes text[];
  n     integer;
begin
  select array_agg(nome order by nome) into nomes from public.colaboradores where id = any(ids);
  n := coalesce(array_length(nomes, 1), 0);
  if n = 0 then return ''; end if;
  if n = 1 then return nomes[1]; end if;
  return array_to_string(nomes[1:n - 1], ', ') || ' e ' || nomes[n];
end;
$$;

-- O grupo que pode ser mexido por gente: existe, é grupo, e não é canal oficial
create or replace function public.exigir_grupo_de_pessoas(alvo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.conversas where id = alvo and tipo = 'grupo' and not eh_sistema_padrao
  ) then
    raise exception 'Este grupo é um canal oficial: quem cuida dele é o TI.';
  end if;
end;
$$;

create or replace function public.criar_grupo(p_nome text, p_descricao text, p_ids text[])
returns text language plpgsql security definer set search_path = public as $$
declare
  eu   text := public.meu_colaborador_id();
  novo text := 'grupo-' || gen_random_uuid();
begin
  if eu is null then raise exception 'Sessão sem colaborador.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do grupo.'; end if;

  insert into public.conversas (id, tipo, nome, descricao, criado_por_id)
  values (novo, 'grupo', left(trim(p_nome), 80), nullif(trim(coalesce(p_descricao, '')), ''), eu);

  insert into public.participantes (conversa_id, colaborador_id, papel)
  values (novo, eu, 'admin');

  -- Só quem existe e está ativo; quem cria já entrou acima
  insert into public.participantes (conversa_id, colaborador_id, papel)
  select novo, c.id, 'membro'
    from public.colaboradores c
   where c.id = any(coalesce(p_ids, '{}')) and c.id <> eu and c.ativo
  on conflict do nothing;

  perform public.registrar_no_grupo(novo, (select nome from public.colaboradores where id = eu) || ' criou o grupo');
  return novo;
end;
$$;

create or replace function public.adicionar_ao_grupo(p_conversa text, p_ids text[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  novos text[];
begin
  perform set_config('conecta.funcao_do_grupo', 'sim', true);
  perform public.exigir_grupo_de_pessoas(p_conversa);
  if not (public.sou_admin_do_grupo(p_conversa) or public.sou_admin()) then
    raise exception 'Só os administradores do grupo adicionam pessoas.';
  end if;

  select array_agg(c.id) into novos
    from public.colaboradores c
   where c.id = any(coalesce(p_ids, '{}')) and c.ativo
     and not exists (
       select 1 from public.participantes p
       where p.conversa_id = p_conversa and p.colaborador_id = c.id and p.saiu_em is null
     );
  if novos is null then return 0; end if;

  -- Quem tinha saído volta: a linha é reaproveitada, sem o `saiu_em`, e o
  -- histórico da passagem anterior fica guardado até a saída de então
  insert into public.participantes (conversa_id, colaborador_id, papel)
  select p_conversa, unnest(novos), 'membro'
  on conflict (conversa_id, colaborador_id)
  do update set
    historico_ate = greatest(participantes.historico_ate, participantes.saiu_em),
    saiu_em = null, papel = 'membro', entrou_em = now(), removida = false;

  perform public.registrar_no_grupo(
    p_conversa,
    (select nome from public.colaboradores where id = public.meu_colaborador_id())
      || ' adicionou ' || public.nomes_em_lista(novos)
  );
  return coalesce(array_length(novos, 1), 0);
end;
$$;

/*
  QUANDO O ÚLTIMO ADMINISTRADOR SAI, o participante mais antigo assume —
  como no WhatsApp. Sem isto o grupo ficaria sem ninguém que adicione.
*/
create or replace function public.garantir_admin_no_grupo(alvo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  herdeiro text;
begin
  perform set_config('conecta.funcao_do_grupo', 'sim', true);
  -- Admin desligado da empresa não conta: o grupo ficaria sem quem administre
  if exists (
    select 1 from public.participantes p join public.colaboradores c on c.id = p.colaborador_id
    where p.conversa_id = alvo and p.papel = 'admin' and p.saiu_em is null and c.ativo
  ) then
    return;
  end if;
  select p.colaborador_id into herdeiro
    from public.participantes p join public.colaboradores c on c.id = p.colaborador_id
   where p.conversa_id = alvo and p.saiu_em is null and c.ativo
   order by p.entrou_em, p.colaborador_id
   limit 1;
  if herdeiro is null then return; end if;
  update public.participantes set papel = 'admin' where conversa_id = alvo and colaborador_id = herdeiro;
  perform public.registrar_no_grupo(alvo, (select nome from public.colaboradores where id = herdeiro) || ' agora é administrador');
end;
$$;

create or replace function public.remover_do_grupo(p_conversa text, p_colaborador text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('conecta.funcao_do_grupo', 'sim', true);
  perform public.exigir_grupo_de_pessoas(p_conversa);
  if not (public.sou_admin_do_grupo(p_conversa) or public.sou_admin()) then
    raise exception 'Só os administradores do grupo removem pessoas.';
  end if;
  if p_colaborador = public.meu_colaborador_id() then
    raise exception 'Para sair, use "Sair do grupo".';
  end if;

  if not exists (
    select 1 from public.participantes
    where conversa_id = p_conversa and colaborador_id = p_colaborador and saiu_em is null
  ) then
    return;
  end if;

  -- A mensagem sai ANTES da remoção: quem foi removido também a vê
  perform public.registrar_no_grupo(
    p_conversa,
    (select nome from public.colaboradores where id = public.meu_colaborador_id())
      || ' removeu ' || (select nome from public.colaboradores where id = p_colaborador)
  );
  update public.participantes
     set saiu_em = now(), papel = 'membro'
   where conversa_id = p_conversa and colaborador_id = p_colaborador and saiu_em is null;
  perform public.garantir_admin_no_grupo(p_conversa);
end;
$$;

create or replace function public.sair_do_grupo(p_conversa text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('conecta.funcao_do_grupo', 'sim', true);
  perform public.exigir_grupo_de_pessoas(p_conversa);
  if not public.participo_ativamente(p_conversa) then return; end if;

  -- A mensagem sai ANTES da saída: ela ainda é de quem participa
  perform public.registrar_no_grupo(
    p_conversa,
    (select nome from public.colaboradores where id = public.meu_colaborador_id()) || ' saiu'
  );
  update public.participantes
     set saiu_em = now(), papel = 'membro'
   where conversa_id = p_conversa and colaborador_id = public.meu_colaborador_id();
  perform public.garantir_admin_no_grupo(p_conversa);
end;
$$;

create or replace function public.definir_admin_do_grupo(p_conversa text, p_colaborador text, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('conecta.funcao_do_grupo', 'sim', true);
  perform public.exigir_grupo_de_pessoas(p_conversa);
  if not (public.sou_admin_do_grupo(p_conversa) or public.sou_admin()) then
    raise exception 'Só os administradores do grupo mudam quem administra.';
  end if;

  update public.participantes
     set papel = case when p_admin then 'admin' else 'membro' end
   where conversa_id = p_conversa and colaborador_id = p_colaborador and saiu_em is null
     and papel <> case when p_admin then 'admin' else 'membro' end;
  if not found then return; end if;

  perform public.registrar_no_grupo(
    p_conversa,
    (select nome from public.colaboradores where id = p_colaborador)
      || case when p_admin then ' agora é administrador' else ' não é mais administrador' end
  );
  perform public.garantir_admin_no_grupo(p_conversa);
end;
$$;

revoke all on function public.criar_grupo(text, text, text[]) from public, anon;
revoke all on function public.adicionar_ao_grupo(text, text[]) from public, anon;
revoke all on function public.remover_do_grupo(text, text) from public, anon;
revoke all on function public.sair_do_grupo(text) from public, anon;
revoke all on function public.definir_admin_do_grupo(text, text, boolean) from public, anon;
-- As peças internas não são chamadas de fora
revoke all on function public.registrar_no_grupo(text, text) from public, anon, authenticated;
revoke all on function public.garantir_admin_no_grupo(text) from public, anon, authenticated;
grant execute on function public.criar_grupo(text, text, text[]) to authenticated;
grant execute on function public.adicionar_ao_grupo(text, text[]) to authenticated;
grant execute on function public.remover_do_grupo(text, text) to authenticated;
grant execute on function public.sair_do_grupo(text) to authenticated;
grant execute on function public.definir_admin_do_grupo(text, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- CPF DO COLABORADOR E COMPROVANTE DE CADA BATIDA (cpf-e-comprovante.sql,
-- 06/10/2026): o CPF numa tabela que só a pessoa e o RH leem; NSR, hora
-- registrada, CNPJ e código de verificação carimbados pelo banco na batida.
-- ------------------------------------------------------------
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

-- ============================================================
-- A MARCAÇÃO ORIGINAL (marcacao-original.sql, 07/10/2026) — o mesmo texto
-- do delta; há teste conferindo. Substitui o carimbo antigo.
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

-- O carimbo da batida e o gatilho dele: no bloco do registrador por
-- estabelecimento, no fim deste arquivo.
-- ------------------------------------------------------------

-- ============================================================
-- O TRATAMENTO DA MARCAÇÃO FORA DA JORNADA (tratamento-da-marcacao.sql,
-- 07/10/2026) — o mesmo texto do delta; há teste conferindo.
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

-- ------------------------------------------------------------
-- A DECISÃO
-- ------------------------------------------------------------

-- ============================================================
-- O REGISTRADOR POR ESTABELECIMENTO (registrador-por-estabelecimento.sql,
-- 07/10/2026) — o mesmo texto do delta; há teste conferindo. Substitui o
-- contador único, a original, o carimbo, a batida sem recusa, a fila e a
-- decisão das etapas anteriores.
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

-- ============================================================
-- A IDENTIFICAÇÃO DO REP-P (identificacao-do-rep.sql, 07/10/2026) — o
-- mesmo texto do delta; há teste conferindo. O preenchimento (com o
-- documento do desenvolvedor) fica fora do repositório.
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
