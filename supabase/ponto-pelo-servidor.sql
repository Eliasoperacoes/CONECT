-- ============================================================
-- O APARELHO SÓ MARCA: A HORA E O CÓDIGO SÃO DO SERVIDOR (01/10/2026)
--
-- Até aqui a batida chegava pronta do aparelho — dia, hora e loja — e o
-- banco conferia só se era da própria pessoa. Pela API dava para gravar
-- "entrada 07:30" às 09:00. E o código do cartaz era conferido no app,
-- que para isso podia LER os códigos das cinco lojas.
--
-- Agora:
--   1. `bater_ponto` é o único caminho da batida da própria pessoa. Ela
--      confere o código da loja e carimba dia e hora com o relógio do
--      banco (horário de Brasília). O aparelho manda o que leu no cartaz
--      e qual batida é a próxima — nada mais.
--   2. A política de INSERT deixa de aceitar batida própria direto na
--      tabela. Correções de RH e do líder continuam como estavam: elas
--      escrevem um horário de propósito, com justificativa e auditoria.
--   3. Os códigos das lojas só são lidos por quem cuida do cartaz
--      (`cuido_do_qr_da_loja`): o gerente, a da loja dele; RH, Diretoria
--      e TI, todas.
--
-- RODE DEPOIS de a versão nova do sistema estar no ar, e fora do horário
-- de entrada e saída: quem estiver com o sistema antigo aberto precisa
-- recarregar a página para bater.
--
-- Este arquivo é o delta; o esquema inteiro está em esquema.sql.
-- ============================================================

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

-- A batida própria só pela função. Ficam as correções de RH e do líder.
drop policy if exists ponto_batida on public.registros_ponto;
create policy ponto_batida on public.registros_ponto
  for insert to authenticated
  with check (
    public.cuido_de_pessoas()
    -- O responsável lança a batida que faltou, na fila de aprovação, e
    -- preenche os dias vazios da equipe pelo turno, como o RH.
    or (
      public.posso_decidir_jornada(colaborador_id)
      and metodo in ('ajuste_lider', 'preenchimento_turno')
    )
  );

-- O código do cartaz só para quem cuida dele
drop policy if exists codigos_leitura on public.codigos_ponto_loja;
create policy codigos_leitura on public.codigos_ponto_loja
  for select to authenticated using (public.cuido_do_qr_da_loja(loja));

notify pgrst, 'reload schema';

-- Conferência: a função existe, a política nova está no lugar e a hora do
-- banco em Brasília (compare com o relógio da parede)
select
  (select count(*) from pg_proc where proname = 'bater_ponto') as funcao_criada,
  (select pg_get_expr(polwithcheck, polrelid) not like '%meu_colaborador_id%'
     from pg_policy where polname = 'ponto_batida') as batida_direta_fechada,
  to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as hora_do_banco_em_brasilia;
