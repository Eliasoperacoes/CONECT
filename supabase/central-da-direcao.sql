-- ============================================================
-- CONECTA — A CENTRAL DA DIREÇÃO VIRA PRATELEIRA
--
-- O QUE MUDA
--
-- `avisos_rede` guardava só recado: título, texto, prioridade e uma
-- loja de destino. O que chega à loja não é só recado — é a tabela de
-- preço, o passo a passo do fechamento de caixa, o formulário de férias.
-- Essas coisas viviam no grupo do WhatsApp e sumiam na rolagem.
--
-- A tabela ganha:
--
--   tipo ................ aviso | documento | tutorial
--   categoria ........... a gaveta: operacional, rh, comercial...
--   destinos ............ para quem vai, em JSON (ver abaixo)
--   anexo_caminho/nome .. o arquivo, que é o que faz documento ser documento
--   exige_confirmacao ... ciência assinada, não só leitura
--
-- NADA É REMOVIDO. `loja_destino` fica: são 24 publicações gravadas só
-- com ele, e trocá-lo por `destinos` deixaria todas sem destino nenhum
-- — ou seja, invisíveis para todo mundo no dia em que isto rodar.
--
-- POR QUE `destinos` É JSONB, E NÃO UMA TABELA
--
-- Uma publicação tem de um a cinco destinos, lidos sempre junto com ela
-- e nunca sozinhos. Uma tabela filha custaria um `join` em toda leitura
-- da central para nunca responder uma pergunta que a coluna não responda.
--
-- A forma é uma lista de objetos:
--   [{"alcance":"loja","valor":"Descalvado"},{"alcance":"setor","valor":"RH"}]
--
-- Os alcances: `rede` (todos, valor vazio), `loja`, `setor`, `pessoa`
-- (o valor é o id do colaborador). Eles SOMAM: loja + setor chega a
-- quem está na loja E a quem é do setor em qualquer loja.
-- ============================================================

alter table public.avisos_rede
  add column if not exists tipo              text,
  add column if not exists categoria         text,
  add column if not exists destinos          jsonb,
  add column if not exists anexo_caminho     text,
  add column if not exists anexo_nome        text,
  add column if not exists exige_confirmacao boolean not null default false;

-- ------------------------------------------------------------
-- AS LISTAS FECHADAS
--
-- Sem isto, "RH", "Rh", "Recursos Humanos" e "rh " viram quatro gavetas
-- e nenhuma busca acha as quatro. A checagem aceita NULL de propósito:
-- as publicações antigas não têm valor, e a tradução delas acontece na
-- leitura — pôr um `default` aqui seria escrever a mesma decisão em dois
-- lugares, e o código já a tem.
-- ------------------------------------------------------------
alter table public.avisos_rede drop constraint if exists avisos_rede_tipo_check;
alter table public.avisos_rede
  add constraint avisos_rede_tipo_check
  check (tipo is null or tipo in ('aviso', 'documento', 'tutorial'));

alter table public.avisos_rede drop constraint if exists avisos_rede_categoria_check;
alter table public.avisos_rede
  add constraint avisos_rede_categoria_check
  check (
    categoria is null
    or categoria in ('operacional', 'rh', 'comercial', 'institucional', 'seguranca')
  );

-- ------------------------------------------------------------
-- QUEM LÊ O QUÊ
--
-- A política antiga deixava qualquer sessão ler qualquer aviso: o
-- filtro de loja acontecia na tela. Com publicação dirigida a PESSOA
-- isso deixa de servir — um comunicado sobre a advertência de alguém
-- não pode depender de a tela lembrar de escondê-lo.
--
-- A regra, no banco, é a mesma de `alcanca()` no código:
--   sou o autor, OU administro, OU um dos destinos me inclui.
-- ------------------------------------------------------------
-- `minha_loja` ainda não existia: as políticas de aviso liam pela tela
create or replace function public.minha_loja()
returns text language sql stable security definer set search_path = public as $$
  select loja from public.colaboradores where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.aviso_me_alcanca(destinos jsonb, loja_destino text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Publicação antiga: sem `destinos`, vale a loja
    case
      when destinos is null or jsonb_array_length(destinos) = 0 then
        loja_destino = 'Todas' or loja_destino = public.minha_loja()
      else exists (
        select 1
          from jsonb_array_elements(destinos) d
         where (d->>'alcance') = 'rede'
            or ((d->>'alcance') = 'loja'   and (d->>'valor') = public.minha_loja())
            or ((d->>'alcance') = 'setor'  and (d->>'valor') = public.meu_setor())
            or ((d->>'alcance') = 'pessoa' and (d->>'valor') = public.meu_colaborador_id())
      )
    end;
$$;


drop policy if exists avisos_leitura on public.avisos_rede;
create policy avisos_leitura on public.avisos_rede
  for select to authenticated
  using (
    public.sou_admin()
    or autor_id = public.meu_colaborador_id()
    or public.aviso_me_alcanca(destinos, loja_destino)
  );

-- ------------------------------------------------------------
-- QUEM VISUALIZOU
--
-- `avisos_leitura` já existia, e já guardava `confirmado` e `lido_em`.
-- O que faltava era quem PODE VER essa lista: a leitura era de cada um
-- sobre si, então "12 de 24 leram" não tinha como ser contado.
--
-- Quem publicou vê quem leu o que ele publicou. É o mínimo para o
-- comunicado servir de prova — e o máximo que faz sentido: a leitura de
-- terceiros sobre publicação alheia não é assunto de ninguém.
-- ------------------------------------------------------------
drop policy if exists avisos_leitura_consulta on public.avisos_leitura;
create policy avisos_leitura_consulta on public.avisos_leitura
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador_id()
    or public.sou_admin()
    or exists (
      select 1 from public.avisos_rede a
       where a.id = avisos_leitura.aviso_id
         and a.autor_id = public.meu_colaborador_id()
    )
  );

-- Registrar a PRÓPRIA leitura, e só a própria: marcar que outro leu
-- seria assinar ciência no lugar dele
drop policy if exists avisos_leitura_registro on public.avisos_leitura;
create policy avisos_leitura_registro on public.avisos_leitura
  for insert to authenticated
  with check (colaborador_id = public.meu_colaborador_id());

drop policy if exists avisos_leitura_atualiza on public.avisos_leitura;
create policy avisos_leitura_atualiza on public.avisos_leitura
  for update to authenticated
  using (colaborador_id = public.meu_colaborador_id())
  with check (colaborador_id = public.meu_colaborador_id());

alter table public.avisos_leitura enable row level security;

-- A central ordena por tipo e data o tempo todo
create index if not exists avisos_por_tipo on public.avisos_rede (tipo, criado_em desc);

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- colunas_novas ............ 6
-- checagem_tipo ............ true
-- checagem_categoria ....... true
-- politica_de_alcance ...... true   (o banco filtra, não só a tela)
-- leitura_tem_rls .......... true
-- publicacoes_orfas ........ 0      (nenhuma ficou sem destino)
-- ============================================================
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'avisos_rede'
      and column_name in ('tipo','categoria','destinos','anexo_caminho','anexo_nome','exige_confirmacao')
  ) as colunas_novas,

  exists (select 1 from pg_constraint where conname = 'avisos_rede_tipo_check')      as checagem_tipo,
  exists (select 1 from pg_constraint where conname = 'avisos_rede_categoria_check') as checagem_categoria,

  exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'avisos_rede' and policyname = 'avisos_leitura'
  ) as politica_de_alcance,

  coalesce((
    select relrowsecurity from pg_class
     where oid = 'public.avisos_leitura'::regclass
  ), false) as leitura_tem_rls,

  -- Publicação sem destino nenhum: nem `destinos`, nem `loja_destino`
  (select count(*) from public.avisos_rede
    where (destinos is null or jsonb_array_length(destinos) = 0)
      and (loja_destino is null or loja_destino = '')
  ) as publicacoes_orfas;
