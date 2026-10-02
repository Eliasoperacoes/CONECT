-- ============================================================
-- GRUPOS DE TODOS — PASSO 2 (03/10/2026). Só o que mudou.
--
-- O que ficou em aberto no passo 1, achado revisando os casos:
--   - quem ENTRA num grupo lia todo o histórico anterior. Agora lê só do
--     momento em que entrou, como no WhatsApp;
--   - quem SAI E VOLTA lia o que se disse enquanto estava fora. Agora
--     guarda a passagem anterior e vê o depois da volta, sem o intervalo;
--   - quem é REMOVIDO não via "Fulano removeu você": a mensagem era
--     gravada depois de ele perder o acesso. Agora sai antes;
--   - admin DESLIGADO da empresa contava como admin, e o grupo podia ficar
--     sem quem administre. Agora não conta, e um ativo assume.
--
-- Conversa individual e canal oficial não mudam. Pode rodar mais de uma vez.
-- ============================================================

-- Quem saiu e foi adicionado de novo: até quando vai o histórico da passagem anterior
alter table public.participantes
  add column if not exists historico_ate timestamptz;


-- O grupo criado por gente (e não conversa individual nem canal oficial)
create or replace function public.eh_grupo_de_pessoas(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversas where id = alvo and tipo = 'grupo' and not eh_sistema_padrao);
$$;

/*
  LÊ A MENSAGEM QUEM:
    - participa agora, ou ela é de ANTES de a pessoa sair;
    - no GRUPO DE PESSOAS, além disso, ela é de DEPOIS de a pessoa entrar
      — como no WhatsApp, quem entra não lê o que se disse antes dele —, ou
      é da passagem anterior de quem saiu e voltou (`historico_ate`): o
      intervalo em que esteve fora não aparece.
  Conversa individual e canal oficial seguem com o histórico inteiro.
*/
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

revoke all on function public.garantir_admin_no_grupo(text) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- CONFERÊNCIA: a coluna nova, e as funções na versão nova (as quatro saem 1)
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'participantes' and column_name = 'historico_ate') as coluna_1,
  (select count(*) from pg_proc where proname = 'eh_grupo_de_pessoas') as funcao_nova_1,
  (select count(*) from pg_proc where proname = 'posso_ler_mensagem'
     and pg_get_functiondef(oid) like '%historico_ate%') as leitura_nova_1,
  (select count(*) from pg_proc where proname = 'remover_do_grupo'
     and pg_get_functiondef(oid) like '%sai ANTES da remoção%') as remocao_nova_1;
