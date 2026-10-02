-- ============================================================
-- GRUPOS DE TODOS — CONECTA / Malachias Autopeças (03/10/2026)
--
-- Pedido do Elias, no modelo do WhatsApp: qualquer pessoa cria grupo e
-- coloca qualquer pessoa da rede, sem convite e sem limite. Quem cria é
-- ADMINISTRADOR do grupo: adiciona, remove, edita, e torna outros
-- administradores. Qualquer um SAI quando quiser — e o histórico até a
-- saída continua com ele, sem receber nada novo; depois, apaga o grupo
-- da própria lista. Só o TI apaga um grupo para todos. Os canais oficiais
-- (das lojas, Avisos da Rede) seguem com o TI, e deles ninguém sai.
--
-- E FECHA UMA PORTA: a regra de `participantes` deixava QUALQUER pessoa
-- logada se inscrever em QUALQUER conversa — e quem participa lê tudo.
-- Agora, num grupo criado por alguém, só se entra pelas funções abaixo,
-- que conferem quem é administrador. A conversa individual só aceita as
-- duas pessoas dela; o canal oficial segue aberto à inscrição, como hoje
-- (é assim que cada um entra no canal da própria loja).
--
-- Pode rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUEM É ADMINISTRADOR, E QUEM SAIU
-- ------------------------------------------------------------
alter table public.participantes
  add column if not exists papel text not null default 'membro';
alter table public.participantes
  add column if not exists saiu_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'participantes_papel_check') then
    alter table public.participantes
      add constraint participantes_papel_check check (papel in ('admin', 'membro'));
  end if;
end
$$;

-- Quem criou cada grupo que já existe vira administrador dele
update public.participantes p
   set papel = 'admin'
  from public.conversas c
 where c.id = p.conversa_id
   and c.tipo = 'grupo'
   and not c.eh_sistema_padrao
   and c.criado_por_id = p.colaborador_id
   and p.papel <> 'admin';

-- A mensagem de sistema ("Ana adicionou Bia") é um tipo de mensagem
alter table public.mensagens drop constraint if exists mensagens_tipo_check;
alter table public.mensagens
  add constraint mensagens_tipo_check
  check (tipo in ('texto', 'recado_voz', 'arquivo', 'imagem', 'sistema'));

-- ------------------------------------------------------------
-- 2. AS PERGUNTAS DE PERMISSÃO
-- ------------------------------------------------------------

-- Participa AGORA (não saiu): é o que deixa escrever
create or replace function public.participo_ativamente(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participantes
    where conversa_id = alvo and colaborador_id = public.meu_colaborador_id() and saiu_em is null
  );
$$;

-- Lê a mensagem: participa agora, ou ela é de ANTES de a pessoa sair
create or replace function public.posso_ler_mensagem(alvo text, quando timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participantes
    where conversa_id = alvo and colaborador_id = public.meu_colaborador_id()
      and (saiu_em is null or quando <= saiu_em)
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

-- ------------------------------------------------------------
-- 3. AS REGRAS DAS TABELAS
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. AS FUNÇÕES DO GRUPO
--
-- Cada uma confere quem pode, faz, e deixa no grupo a mensagem de
-- sistema ("Ana adicionou Bia") com o nome de quem fez — tirado do banco.
-- ------------------------------------------------------------

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

  -- Quem tinha saído volta: a linha é reaproveitada, sem o `saiu_em`
  insert into public.participantes (conversa_id, colaborador_id, papel)
  select p_conversa, unnest(novos), 'membro'
  on conflict (conversa_id, colaborador_id)
  do update set saiu_em = null, papel = 'membro', entrou_em = now(), removida = false;

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
  if exists (select 1 from public.participantes where conversa_id = alvo and papel = 'admin' and saiu_em is null) then
    return;
  end if;
  select colaborador_id into herdeiro
    from public.participantes
   where conversa_id = alvo and saiu_em is null
   order by entrou_em, colaborador_id
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

  update public.participantes
     set saiu_em = now(), papel = 'membro'
   where conversa_id = p_conversa and colaborador_id = p_colaborador and saiu_em is null;
  if not found then return; end if;

  perform public.registrar_no_grupo(
    p_conversa,
    (select nome from public.colaboradores where id = public.meu_colaborador_id())
      || ' removeu ' || (select nome from public.colaboradores where id = p_colaborador)
  );
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

notify pgrst, 'reload schema';

-- CONFERÊNCIA: as colunas novas, as funções e os gatilhos, e quantos
-- administradores os grupos que já existiam ganharam
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'participantes' and column_name in ('papel', 'saiu_em')) as colunas_2,
  (select count(*) from pg_proc where proname in
    ('criar_grupo', 'adicionar_ao_grupo', 'remover_do_grupo', 'sair_do_grupo', 'definir_admin_do_grupo')) as funcoes_5,
  (select count(*) from pg_trigger where tgname in
    ('participantes_so_preferencias', 'conversas_grupo_so_admin_edita')) as gatilhos_2,
  (select count(*) from public.participantes where papel = 'admin') as administradores;
