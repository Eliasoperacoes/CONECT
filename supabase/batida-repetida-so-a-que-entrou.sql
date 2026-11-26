-- ============================================================
-- OS 2 MINUTOS CONTAM SÓ A BATIDA QUE ENTROU NA JORNADA (26/11/2026)
--
-- A janela de 2 minutos (batida-repetida-em-2-minutos.sql, caso do Yan)
-- contava QUALQUER marcação anterior — até a que ficou fora da jornada.
-- O Renan, na saída para o almoço de 26/11:
--
--   11:09:58  o celular pediu "entrada" (já havia a das 07:27): repetida
--   11:10:35  pediu "saída para almoço", a certa — repetida, 37 s depois
--             da tentativa errada
--   11:10:44  de novo — repetida, 9 s depois
--
-- A tentativa que não entrou travou a certa, e cada nova tentativa
-- reabria os 2 minutos. Agora a janela conta só a anterior que AVANÇOU a
-- jornada (`registro_id` preenchido). O Yan continua barrado: a entrada
-- dele entrou, e a segunda batida 19 s depois segue "repetida".
--
-- Substitui a função inteira; só a janela muda. Rodar depois de
-- registrador-por-estabelecimento.sql. Pode rodar de novo.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'registrar_marcacao' and p.pronargs = 4
  ) then
    raise exception 'Rode antes registrador-por-estabelecimento.sql: a batida com o coletor não existe neste banco.';
  end if;
end $$;

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
    -- MENOS DE 2 MINUTOS DEPOIS DA ANTERIOR NÃO AVANÇA A JORNADA
    -- (batida-repetida-em-2-minutos.sql, 08/10/2026). O Yan bateu a
    -- entrada às 08:23:35, achou que não tinha batido e bateu de novo às
    -- 08:23:54 — e a jornada ganhou uma saída para almoço às 08:23.
    -- Ninguém sai para o almoço 19 s depois de entrar: a marcação fica
    -- registrada, com NSR e comprovante, e o RH decide o que ela é.
    -- SÓ CONTA A ANTERIOR QUE ENTROU NA JORNADA (26/11/2026): a tentativa
    -- que ficou de fora não avançou nada, e contá-la travou a saída para
    -- almoço do Renan três vezes seguidas.
    when exists (
      -- "anterior", e não "o": a função já tem a variável "o" (a original nova)
      select 1 from public.marcacoes_originais anterior
       where anterior.colaborador_id = eu.id
         and anterior.data = hoje
         and anterior.registro_id is not null
         and anterior.registrado_em > agora - interval '2 minutes'
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

notify pgrst, 'reload schema';

-- Conferência: uma função só, com a janela de 2 minutos, contando só a
-- batida que entrou. O esperado: 1, true, true.
select
  (select count(*) from pg_proc where proname = 'registrar_marcacao')                          as funcoes_de_batida,
  (select prosrc like '%interval ''2 minutes''%' from pg_proc where proname = 'registrar_marcacao') as janela_de_2_minutos,
  (select prosrc like '%anterior.registro_id is not null%' from pg_proc where proname = 'registrar_marcacao') as so_conta_a_que_entrou;
