-- ============================================================
-- CONECTA — ORGANOGRAMA E ALÇADA DE APROVAÇÃO
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.
--
-- É a parte NOVA do esquema desde a última vez que você rodou. Pode rodar
-- mais de uma vez sem medo: tudo aqui é "if not exists" ou "create or
-- replace". O esquema completo continua em supabase/esquema.sql.
-- ============================================================

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
    -- Ninguém decide sobre a própria hora, em nível nenhum
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
    );
$$;

-- ============================================================
-- CONFERÊNCIA — o que ficou valendo, com os próprios olhos
-- ============================================================
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'colaboradores'
       and column_name = 'responsavel_id'
  ) as coluna_responsavel_id_existe,
  exists (
    select 1 from pg_proc where proname = 'estou_na_cadeia_de'
  ) as funcao_da_cadeia_existe,
  exists (
    select 1 from pg_trigger where tgname = 'colaboradores_organograma_protegido'
  ) as gatilho_de_protecao_ativo;
