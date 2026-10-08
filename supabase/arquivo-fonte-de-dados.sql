-- ============================================================
-- O ARQUIVO FONTE DE DADOS — AFD (07/10/2026)
--
-- Homologação, etapa 2c. Fonte: leiaute do AFD vigente (gov.br,
-- 31/07/2026), versão "004". Depende de registrador-por-estabelecimento.sql
-- e de identificacao-do-rep.sql.
--
-- O arquivo é montado AQUI, com as mesmas funções `afd_*` que calculam o
-- hash da marcação: a linha do registro tipo "7" que vai para o arquivo é
-- a mesma que entrou no hash. Um lugar só.
--
--   1 (cabeçalho) · 2, 5 e 7 na ordem do NSR · 9 (trailer) · assinatura
--
-- Por estabelecimento (CNPJ) e por período (Anexo IX, item 12). Só quem
-- cuida de pessoas gera. A assinatura vai num .p7s à parte (CAdES, ICP-
-- Brasil) — até o certificado chegar, a última linha é a do leiaute e o
-- .p7s não existe; o número do INPI sai em branco até o registro sair.
--
-- Campos vazios (CNO/CAEPF, INPI ainda não registrado, modelo do REP-C,
-- CPF do responsável quando foi o próprio sistema): espaços, como manda o
-- item 7 do leiaute ("posições não utilizadas devem ser preenchidas com
-- espaço").
--
-- Pode rodar de novo. Termina com a conferência.
-- ============================================================

-- O texto só com o que o ISO 8859-1 representa: o resto vira "?" (aspas
-- curvas, travessão colado de outro programa) — o arquivo é ISO 8859-1
create or replace function public.afd_latin1(p_texto text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(p_texto, ''), '[^\x01-\xff]', '?', 'g');
$$;

-- ------------------------------------------------------------
-- 1. O CRC-16/KERMIT (CCITT-TRUE) — registros 1 a 5
--
-- Pergunta 35 do Ministério: "123456789" gera 0x2189, gravado "2189".
-- Calculado sobre os bytes do registro em ISO 8859-1, sem o próprio CRC.
-- Os textos já passaram por `afd_latin1`: todo caractere está na tabela
-- ISO 8859-1, onde o código do caractere É o byte — então lê-se o código
-- (`ascii`), sem conversão de codificação.
-- ------------------------------------------------------------
create or replace function public.afd_crc16(p_registro text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v_texto text := public.afd_latin1(p_registro);
  v_crc int := 0;
  i int;
  j int;
begin
  for i in 1 .. length(v_texto) loop
    v_crc := v_crc # ascii(substr(v_texto, i, 1));
    for j in 1 .. 8 loop
      if (v_crc & 1) = 1 then
        v_crc := (v_crc >> 1) # 33800;  -- 0x8408, o polinômio 0x1021 refletido
      else
        v_crc := v_crc >> 1;
      end if;
    end loop;
  end loop;
  return upper(lpad(to_hex(v_crc), 4, '0'));
end;
$$;

-- ------------------------------------------------------------
-- 2. O AFD
-- ------------------------------------------------------------
create or replace function public.gerar_afd(p_cnpj text, p_inicio date, p_fim date)
returns table (ordem int, linha text)
language plpgsql stable security definer set search_path = public as $$
declare
  e        public.estabelecimentos;
  rep      public.identificacao_rep;
  v_cnpj   text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_cabeca text;
  v_n2     int;
  v_n5     int;
  v_n7     int;
begin
  if not public.cuido_de_pessoas() then
    raise exception 'Só quem cuida de pessoas gera o AFD.' using errcode = 'P0001';
  end if;
  select * into e from public.estabelecimentos where cnpj = v_cnpj;
  if e.cnpj is null then
    raise exception 'Este CNPJ não é um estabelecimento cadastrado.' using errcode = 'P0001';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Período inválido.' using errcode = 'P0001';
  end if;
  select * into rep from public.identificacao_rep;
  if rep.desenvolvedor_documento is null then
    raise exception 'Falta a identificação do REP (desenvolvedor). Rode identificacao-do-rep.sql.' using errcode = 'P0001';
  end if;

  -- Registro tipo "1": o cabeçalho (302 posições)
  v_cabeca :=
       '000000000'
    || '1'
    || '1'
    || public.afd_texto(e.cnpj, 14)
    || case when e.cno_caepf is null then repeat(' ', 14) else public.afd_numero(e.cno_caepf, 14) end
    || public.afd_texto(public.afd_latin1(e.razao_social), 150)
    || case when rep.inpi is null then repeat(' ', 17) else public.afd_numero(rep.inpi, 17) end
    || to_char(p_inicio, 'YYYY-MM-DD')
    || to_char(p_fim, 'YYYY-MM-DD')
    || public.afd_data_hora(now())
    || '004'
    || rep.desenvolvedor_tipo
    || public.afd_texto(rep.desenvolvedor_documento, 14)
    || repeat(' ', 30);
  ordem := 0;
  linha := v_cabeca || public.afd_crc16(v_cabeca);
  return next;

  -- Registros 2, 5 e 7 do período, na ordem do NSR
  return query
  with registros as (
    -- Tipo "2": inclusão ou alteração do empregador (331 posições)
    select v.nsr,
           public.afd_numero(v.nsr::text, 9) || '2'
        || public.afd_data_hora(v.gravado_em)
        || case when v.responsavel_cpf = '' then repeat(' ', 14) else public.afd_numero(v.responsavel_cpf, 14) end
        || '1'
        || public.afd_texto(v.cnpj, 14)
        || case when v.cno_caepf is null then repeat(' ', 14) else public.afd_numero(v.cno_caepf, 14) end
        || public.afd_texto(public.afd_latin1(v.razao_social), 150)
        || public.afd_texto(public.afd_latin1(v.local), 100) as sem_crc,
           true as tem_crc
      from public.eventos_rep v
     where v.cnpj = v_cnpj and v.tipo = 2
       and (v.gravado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    union all
    -- Tipo "5": inclusão, alteração ou exclusão de empregado (118 posições)
    select v.nsr,
           public.afd_numero(v.nsr::text, 9) || '5'
        || public.afd_data_hora(v.gravado_em)
        || v.operacao
        || public.afd_numero(v.cpf, 12)
        || public.afd_texto(public.afd_latin1(v.nome), 52)
        || repeat(' ', 4)
        || case when v.responsavel_cpf = '' then repeat(' ', 11) else public.afd_numero(v.responsavel_cpf, 11) end,
           true
      from public.eventos_rep v
     where v.cnpj = v_cnpj and v.tipo = 5
       and (v.gravado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    union all
    -- Tipo "7": a marcação (137 posições) — os campos 1 a 7 são os do hash
    select o.nsr,
           public.afd_marcacao_sem_hash(o.nsr, o.registrado_em, o.cpf, o.registrado_em, o.coletor, o.offline)
        || o.codigo_verificacao,
           false
      from public.marcacoes_originais o
     where o.cnpj_empregador = v_cnpj and o.data between p_inicio and p_fim
  )
  select (row_number() over (order by r.nsr))::int,
         case when r.tem_crc then r.sem_crc || public.afd_crc16(r.sem_crc) else r.sem_crc end
    from registros r
   order by r.nsr;

  -- Registro tipo "9": o trailer, com a contagem de cada tipo (64 posições)
  select count(*) into v_n2 from public.eventos_rep v
   where v.cnpj = v_cnpj and v.tipo = 2 and (v.gravado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;
  select count(*) into v_n5 from public.eventos_rep v
   where v.cnpj = v_cnpj and v.tipo = 5 and (v.gravado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;
  select count(*) into v_n7 from public.marcacoes_originais o
   where o.cnpj_empregador = v_cnpj and o.data between p_inicio and p_fim;

  ordem := 1000000000;
  linha := '999999999'
    || lpad(v_n2::text, 9, '0')
    || lpad('0', 9, '0')
    || lpad('0', 9, '0')
    || lpad(v_n5::text, 9, '0')
    || lpad('0', 9, '0')
    || lpad(v_n7::text, 9, '0')
    || '9';
  return next;

  -- A assinatura: no REP-P, o texto literal e o .p7s à parte (100 posições)
  ordem := 1000000001;
  linha := rpad('ASSINATURA_DIGITAL_EM_ARQUIVO_P7S', 100, ' ');
  return next;
end;
$$;

revoke all on function public.gerar_afd(text, date, date) from public, anon;
grant execute on function public.gerar_afd(text, date, date) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: o CRC do exemplo oficial, e o AFD do mês corrente de cada
-- estabelecimento (quantas linhas; o gerador exige sessão de RH, então
-- aqui só se confere que as funções existem)
select
  public.afd_crc16('123456789') = '2189' as crc_do_exemplo_oficial,
  exists (select 1 from pg_proc where proname = 'gerar_afd') as gerador,
  (select count(*) from public.estabelecimentos) as estabelecimentos,
  (select count(*) from public.identificacao_rep) as identificacao;
