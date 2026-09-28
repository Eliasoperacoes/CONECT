-- ============================================================
-- CONECTA — OS APARELHOS QUE RECEBEM AVISO COM O APP FECHADO
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Cria a tabela `aparelhos`: um registro por aplicativo instalado, com
-- o endereço que o Firebase usa para acordar aquele aparelho.
--
-- ------------------------------------------------------------
-- POR QUE UMA TABELA, E NÃO UMA COLUNA NA FICHA
-- ------------------------------------------------------------
--
-- A mesma pessoa tem mais de um aparelho — o celular dela e o do
-- balcão, por exemplo. Uma coluna guardaria um só, e o aviso chegaria
-- no último que ela abriu. Quem instalasse no celular deixaria o
-- aparelho do balcão mudo sem saber.
--
-- ------------------------------------------------------------
-- O ENDEREÇO DO FIREBASE VENCE
-- ------------------------------------------------------------
--
-- O `token` é gerado pelo Firebase, e ele MUDA: quando o aplicativo é
-- reinstalado, quando o aparelho é restaurado de um backup, e de vez em
-- quando por conta própria. Um token velho não dá erro — ele
-- simplesmente não entrega, calado.
--
-- Por isso o token é a CHAVE, e não o aparelho: quando o mesmo token
-- reaparece para outra pessoa (o celular trocou de dono, ou alguém
-- entrou com outro login no mesmo aparelho), a linha passa a ser dela.
-- Sem isso, o aviso de uma pessoa chegaria no bolso da outra.
--
-- ------------------------------------------------------------
-- QUEM LÊ O QUÊ
-- ------------------------------------------------------------
--
-- Cada um enxerga e mexe SÓ nos próprios aparelhos. Um token é um
-- endereço de entrega: com ele na mão, quem tiver a chave do Firebase
-- manda o que quiser para a tela de bloqueio daquela pessoa.
--
-- Quem ENVIA é a função do servidor, com a chave de serviço, que passa
-- por cima da RLS. Ninguém no aplicativo precisa ler o token de
-- ninguém.
-- ============================================================

create table if not exists public.aparelhos (
  -- O token do Firebase é a identidade: mesmo token, mesma linha
  token           text primary key,
  colaborador_id  text not null references public.colaboradores(id) on delete cascade,

  -- 'android' hoje; 'ios' no dia em que o iPhone sair do PWA
  plataforma      text not null default 'android'
                    check (plataforma in ('android', 'ios', 'web')),

  -- Serve para limpar o que não aparece há meses, e para o suporte
  -- saber de qual aparelho a pessoa está falando
  modelo          text,
  visto_em        timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

-- O envio busca por pessoa: "todos os aparelhos da Ana"
create index if not exists aparelhos_por_colaborador
  on public.aparelhos (colaborador_id);

alter table public.aparelhos enable row level security;

-- ------------------------------------------------------------
-- LER: só os próprios
-- ------------------------------------------------------------
drop policy if exists aparelhos_leitura on public.aparelhos;
create policy aparelhos_leitura on public.aparelhos
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id());

-- ------------------------------------------------------------
-- REGISTRAR: só para si mesmo
--
-- Sem o `with check`, uma pessoa poderia registrar o token DELA no
-- nome de outra e passar a receber os avisos daquela pessoa — as
-- mensagens de chat inclusive.
-- ------------------------------------------------------------
drop policy if exists aparelhos_registro on public.aparelhos;
create policy aparelhos_registro on public.aparelhos
  for insert to authenticated
  with check (colaborador_id = public.meu_colaborador_id());

-- ------------------------------------------------------------
-- ATUALIZAR: o `visto_em` de cada abertura, e a troca de dono
--
-- O token é a chave primária, e um insert de token repetido é recusado
-- com 23505. O aplicativo trata isso atualizando a linha — é o caminho
-- de "este aparelho agora é de outra pessoa".
--
-- SEM POLÍTICA DE UPDATE, esse caminho falharia CALADO: o update
-- afetaria zero linhas e devolveria sucesso. O aparelho seguiria
-- entregando os avisos para o dono anterior, e ninguém descobriria.
-- ------------------------------------------------------------
drop policy if exists aparelhos_atualizacao on public.aparelhos;
create policy aparelhos_atualizacao on public.aparelhos
  for update to authenticated
  using (colaborador_id = public.meu_colaborador_id())
  with check (colaborador_id = public.meu_colaborador_id());

-- ------------------------------------------------------------
-- APAGAR: quem sai do aplicativo tira o aparelho dele
-- ------------------------------------------------------------
drop policy if exists aparelhos_remocao on public.aparelhos;
create policy aparelhos_remocao on public.aparelhos
  for delete to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.sou_admin());

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- tabela_existe ........ true
-- rls_ligada ........... true
-- tem_insert ........... true
-- tem_update ........... true   (sem ela, a troca de dono falha calada)
-- tem_select ........... true
-- tem_delete ........... true
-- ============================================================
select
  exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'aparelhos'
  ) as tabela_existe,

  (select relrowsecurity from pg_class
    where relname = 'aparelhos' and relnamespace = 'public'::regnamespace)
    as rls_ligada,

  count(*) filter (where p.polcmd in ('a', '*')) > 0 as tem_insert,
  count(*) filter (where p.polcmd in ('w', '*')) > 0 as tem_update,
  count(*) filter (where p.polcmd in ('r', '*')) > 0 as tem_select,
  count(*) filter (where p.polcmd in ('d', '*')) > 0 as tem_delete

  from pg_policy p
  join pg_class c on c.oid = p.polrelid
 where c.relname = 'aparelhos'
   and c.relnamespace = 'public'::regnamespace;
