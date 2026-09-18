-- ============================================================
-- CONECTA — HOLERITES E ADVERTÊNCIAS
--
-- Duas tabelas para a tela de RH. As duas guardam DOCUMENTO DE PESSOA, e
-- por isso a regra de leitura é mais apertada que a do resto do sistema:
--
--   o colaborador vê SÓ OS DELE;
--   RH, Diretoria e TI veem todos;
--   ninguém mais vê nada — nem o gerente da loja, nem o líder do setor.
--
-- Isso é de propósito e não é detalhe. Holerite e advertência não são
-- assunto de quem aprova hora: são assunto da pessoa e de quem cuida de
-- pessoas. Um gerente que enxerga o salário da equipe muda a relação de
-- trabalho inteira.
--
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

-- ------------------------------------------------------------
-- HOLERITES
-- ------------------------------------------------------------
create table if not exists public.holerites (
  id                text primary key,
  colaborador_id    text not null references public.colaboradores(id) on delete cascade,
  -- Competência no formato AAAA-MM. Texto, e não data: holerite é de um MÊS,
  -- não de um dia, e guardar "2026-09-01" convida alguém a exibir o dia 1º.
  competencia       text not null,
  arquivo_caminho   text not null,
  arquivo_nome      text not null,
  enviado_por_id    text,
  enviado_por_nome  text,
  criado_em         timestamptz not null default now(),
  -- Um holerite por pessoa por mês: reenviar SUBSTITUI, em vez de empilhar
  -- duas versões e deixar a pessoa adivinhar qual vale
  unique (colaborador_id, competencia)
);

create index if not exists holerites_por_colaborador
  on public.holerites (colaborador_id, competencia desc);

-- ------------------------------------------------------------
-- ADVERTÊNCIAS
-- ------------------------------------------------------------
create table if not exists public.advertencias (
  id                text primary key,
  colaborador_id    text not null references public.colaboradores(id) on delete cascade,
  tipo              text not null check (tipo in ('verbal', 'escrita', 'suspensao')),
  data              date not null,
  motivo            text not null,
  -- Dias de suspensão, quando for o caso
  dias_suspensao    integer,
  arquivo_caminho   text,
  arquivo_nome      text,
  -- A ciência do colaborador: quando ele confirmou que leu
  ciencia_em        timestamptz,
  aplicada_por_id   text,
  aplicada_por_nome text,
  criado_em         timestamptz not null default now()
);

create index if not exists advertencias_por_colaborador
  on public.advertencias (colaborador_id, data desc);

-- ------------------------------------------------------------
-- SEGURANÇA POR LINHA
--
-- As quatro operações, explicitamente. Faltar uma não dá erro: o comando
-- encontra zero linhas e devolve sucesso — foi assim que fixar e excluir
-- conversa ficaram sem gravar por semanas.
-- ------------------------------------------------------------
alter table public.holerites    enable row level security;
alter table public.advertencias enable row level security;

-- HOLERITES
drop policy if exists holerites_leitura on public.holerites;
create policy holerites_leitura on public.holerites
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

drop policy if exists holerites_insercao on public.holerites;
create policy holerites_insercao on public.holerites
  for insert to authenticated with check (public.cuido_de_pessoas());

drop policy if exists holerites_atualizacao on public.holerites;
create policy holerites_atualizacao on public.holerites
  for update to authenticated
  using (public.cuido_de_pessoas())
  with check (public.cuido_de_pessoas());

drop policy if exists holerites_remocao on public.holerites;
create policy holerites_remocao on public.holerites
  for delete to authenticated using (public.cuido_de_pessoas());

-- ADVERTÊNCIAS
drop policy if exists advertencias_leitura on public.advertencias;
create policy advertencias_leitura on public.advertencias
  for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

drop policy if exists advertencias_insercao on public.advertencias;
create policy advertencias_insercao on public.advertencias
  for insert to authenticated with check (public.cuido_de_pessoas());

/**
 * A ATUALIZAÇÃO TEM DOIS DONOS, e por um motivo.
 *
 * O RH corrige o registro. E o COLABORADOR dá ciência — é ele quem confirma
 * que leu, e essa confirmação é dele, não de quem aplicou. Sem esta linha,
 * a ciência teria de ser gravada pelo RH dizendo "ele leu", que é o oposto
 * do que uma ciência significa.
 */
drop policy if exists advertencias_atualizacao on public.advertencias;
create policy advertencias_atualizacao on public.advertencias
  for update to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas())
  with check (colaborador_id = public.meu_colaborador_id() or public.cuido_de_pessoas());

drop policy if exists advertencias_remocao on public.advertencias;
create policy advertencias_remocao on public.advertencias
  for delete to authenticated using (public.cuido_de_pessoas());

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- Tem que aparecer OITO linhas: quatro de cada tabela.
-- ============================================================
select tablename as tabela, cmd as operacao, policyname as regra
from pg_policies
where tablename in ('holerites', 'advertencias')
order by tablename, cmd;
