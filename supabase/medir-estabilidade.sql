-- ============================================================
-- CONECTA — O BANCO AGUENTA TODO MUNDO? (30/10/2026)
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- A primeira medição depois de as 89 pessoas entrarem (28/10) e das etapas
-- 1 e 2 do tráfego (26/10, b7d7984: o laço dos grupos oficiais e a carga
-- completa ao trocar de aba). A linha de base é a de medir-trafego.sql, de
-- 21 a 26/10, com 47 pessoas:
--
--   1. JANELA      desde quando o banco está contando e quantas pessoas
--                  usaram por dia. É o divisor das contas abaixo.
--   2. CARGAS      quantas vezes por pessoa por dia cada tabela foi lida,
--                  contra a base. A base contava só a consulta principal de
--                  cada tabela; aqui entram todas. Igual ou menor é ganho.
--   3. CAMPEÃS     as 5 consultas que mais rodaram. Uma que dispara sozinha,
--                  como o laço dos grupos (14 mil vezes), aparece aqui.
--   4. TEMPO REAL  aparelhos ouvindo agora (limite de 200), a estimativa das
--                  mensagens de tempo real que o chat gera (limite de 2
--                  milhões por mês, uns 66 mil por dia) e quanto do tempo do
--                  banco vai para o tempo real.
--   5. BANCO       desde quando está ligado, conexões, memória, travamentos
--                  e consultas lentas.
--   6. DIAS        por dia: pessoas, batidas, mensagens, leituras e erros.
--
-- O tempo real do chat é estimado: cada leitura e cada mensagem vão a todos
-- os participantes da conversa, e só chegam a quem está com o app aberto. É
-- o teto. O número real, com o ponto incluído, fica no painel:
-- Organization → Usage → Realtime Messages.
-- ============================================================

with
  janela as (
    select i.stats_reset as desde,
           greatest(extract(epoch from now() - i.stats_reset) / 86400.0, 0.01) as dias
      from extensions.pg_stat_statements_info i
  ),
  dias as (
    select d::date as dia
      from janela,
           generate_series((janela.desde at time zone 'America/Sao_Paulo')::date,
                           (now() at time zone 'America/Sao_Paulo')::date,
                           interval '1 day') d
  ),
  inicio as (
    select min(dia) as dia, (min(dia)::timestamp at time zone 'America/Sao_Paulo') as em from dias
  ),
  -- Quem usou em cada dia: bateu ponto, mandou ou leu mensagem
  uso as (
    select data as dia, colaborador_id as quem, 'batida' as o_que
      from public.registros_ponto, inicio
     where metodo in ('qrcode', 'codigo_manual')
       and data >= inicio.dia
    union all
    select (criado_em at time zone 'America/Sao_Paulo')::date, remetente_id, 'mensagem'
      from public.mensagens, inicio
     where criado_em >= inicio.em
    union all
    select (lida_em at time zone 'America/Sao_Paulo')::date, colaborador_id, 'leitura'
      from public.leituras_mensagem, inicio
     where lida_em >= inicio.em
  ),
  por_dia as (
    select dias.dia,
           count(distinct uso.quem)                          as pessoas,
           count(*) filter (where uso.o_que = 'batida')      as batidas,
           count(*) filter (where uso.o_que = 'mensagem')    as mensagens,
           count(*) filter (where uso.o_que = 'leitura')     as leituras
      from dias
      left join uso on uso.dia = dias.dia
     group by dias.dia
  ),
  pessoas as (
    select greatest(coalesce(avg(pessoas) filter (where pessoas > 0), 1), 1) as media from por_dia
  ),
  -- Cada leitura e cada mensagem do chat vão a todos os participantes da conversa
  participantes_por_conversa as (
    select conversa_id, count(*) as n
      from public.participantes
     where saiu_em is null
     group by conversa_id
  ),
  entregas as (
    select dia, sum(n) as entregas
      from (
        select (l.lida_em at time zone 'America/Sao_Paulo')::date as dia, p.n
          from public.leituras_mensagem l
          join public.mensagens m on m.id = l.mensagem_id
          join participantes_por_conversa p on p.conversa_id = m.conversa_id
          cross join inicio
         where l.lida_em >= inicio.em
        union all
        select (m.criado_em at time zone 'America/Sao_Paulo')::date, p.n
          from public.mensagens m
          join participantes_por_conversa p on p.conversa_id = m.conversa_id
          cross join inicio
         where m.criado_em >= inicio.em
      ) e
     group by dia
  ),
  erros as (
    select (ocorrido_em at time zone 'America/Sao_Paulo')::date as dia,
           count(*) as vezes,
           count(distinct colaborador_id) as pessoas
      from public.erros_do_app, inicio
     where ocorrido_em >= inicio.em
     group by 1
  ),
  -- O que a API mandou ao banco. O PostgREST cola o parêntese tanto na
  -- função ("public"."f"($1)) quanto na lista de colunas da gravação
  -- (INSERT INTO "public"."t"("a", "b")): o que separa é a palavra antes
  consultas as (
    select regexp_replace(s.query, '\s+', ' ', 'g') as texto,
           s.calls,
           s.total_exec_time,
           s.mean_exec_time,
           coalesce((regexp_match(s.query, 'into\s+"public"\."(\w+)"', 'i'))[1],
                    (regexp_match(s.query, '(?:from|update)\s+"public"\."(\w+)"(?!\()', 'i'))[1]) as tabela,
           (regexp_match(s.query, '(?:select|from)\s+"public"\."(\w+)"\(', 'i'))[1]                as funcao,
           case
             when s.query ~* 'insert\s+into\s+"public"'  then 'grava'
             when s.query ~* 'update\s+"public"'         then 'altera'
             when s.query ~* 'delete\s+from\s+"public"'  then 'apaga'
             else 'lê'
           end as operacao
      from extensions.pg_stat_statements s
     where s.query ~* '"public"\."\w+"'
  ),
  -- Por pessoa por dia, de 21 a 26/10: vezes ÷ 5 dias ÷ 47 pessoas.
  -- Participantes soma a carga (2.189) e as conferências do laço (14.143)
  base(ordem, tabela, antes, esperado) as (values
    (1, 'conversas',         9.3,  'carga do chat: esperado 2 a 3'),
    (2, 'mensagens',         8.3,  'carga do chat: esperado 2 a 3'),
    (3, 'leituras_mensagem', 9.3,  'carga do chat: esperado 2 a 3'),
    (4, 'participantes',     69.5, 'era o laço dos grupos: esperado 2 a 3'),
    (5, 'registros_ponto',   13.3, 'carga do ponto: esperado 3 a 4'),
    (6, 'ajustes_jornada',   8.2,  'carga das apurações: esperado 2 a 3'),
    (7, 'colaboradores',     6.4,  'carga dos cadastros: esperado 2 a 3')
  ),
  banco as (
    select d.deadlocks, d.temp_bytes, d.xact_commit, d.xact_rollback,
           coalesce(d.stats_reset, pg_postmaster_start_time()) as contando_desde
      from pg_stat_database d
     where d.datname = current_database()
  ),
  tempo as (
    select sum(total_exec_time)                                                   as total,
           sum(total_exec_time) filter (where query ilike '%realtime.list_changes%') as tempo_real
      from extensions.pg_stat_statements
  ),
  -- Quem está inscrito no tempo real. Pelo texto, para a falta de permissão
  -- de ler a tabela do Supabase virar um aviso, e não derrubar a consulta
  ouvindo as (
    select case when has_table_privilege('realtime.subscription', 'select') then
             query_to_xml(
               'select count(*) filter (where entity = ''public.mensagens''::regclass) as conexoes,
                       count(distinct claims ->> ''sub'') as pessoas
                  from realtime.subscription', false, false, '')::text
           end as xml
  )

select secao, item, valor, comparacao, o_que_olhar from (

  -- 1. JANELA
  select 1 as ordem, 1 as pos, '1. JANELA' as secao, 'Medindo desde' as item,
         to_char(janela.desde at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as valor,
         round(janela.dias::numeric, 1) || ' dias' as comparacao,
         'a última limpeza (zerar-medicao.sql); outra data é reinício no meio' as o_que_olhar
    from janela
  union all
  select 1, 2, '1. JANELA', 'Pessoas por dia (média)',
         round(pessoas.media)::text, 'antes: 47',
         'quem bateu ponto, mandou ou leu mensagem; o detalhe está em 6. DIAS'
    from pessoas

  -- 2. CARGAS
  union all
  select 2, base.ordem, '2. CARGAS', base.tabela,
         round((coalesce(sum(c.calls), 0) / (janela.dias * pessoas.media))::numeric, 1) || ' por pessoa/dia',
         'antes: ' || base.antes || ' (' ||
           to_char(round(100 * (coalesce(sum(c.calls), 0) / (janela.dias * pessoas.media) / base.antes - 1)), 'FMSG99999') || ' %)',
         base.esperado
    from base
    cross join janela
    cross join pessoas
    left join consultas c on c.tabela = base.tabela and c.operacao = 'lê'
   group by base.ordem, base.tabela, base.antes, base.esperado, janela.dias, pessoas.media

  -- 3. CAMPEÃS
  union all
  select * from (
    select 3, (row_number() over (order by c.calls desc))::int, '3. CAMPEÃS',
           c.operacao || ' ' || coalesce(c.tabela, 'função ' || c.funcao, '?'),
           round(c.calls / janela.dias) || ' por dia',
           round((c.calls / (janela.dias * pessoas.media))::numeric, 1) || ' por pessoa/dia',
           case when strpos(upper(c.texto), ' WHERE ') > 0
             then 'onde ' || left(replace(regexp_replace(
                    substr(c.texto, strpos(upper(c.texto), ' WHERE ') + 7),
                    '"public"\."\w+"\.', '', 'g'), '"', ''), 110)
             else 'sem filtro'
           end
      from consultas c, janela, pessoas
     order by c.calls desc
     limit 5
  ) campeas

  -- 4. TEMPO REAL
  union all
  select 4, 1, '4. TEMPO REAL', 'Aparelhos ouvindo agora',
         coalesce(substring(ouvindo.xml from '<conexoes>([^<]*)</conexoes>') || ' conexões', 'sem acesso pelo SQL'),
         coalesce(substring(ouvindo.xml from '<pessoas>([^<]*)</pessoas>') || ' pessoas', ''),
         'limite do gratuito: 200 conexões ao mesmo tempo; o pico fica em Realtime → Reports'
    from ouvindo
  union all
  select 4, 2, '4. TEMPO REAL', 'Chat: mensagens de tempo real no dia mais cheio',
         coalesce(max(entregas)::text, '0'),
         coalesce(round(100.0 * max(entregas) / 66000) || ' % do limite diário', ''),
         'teto estimado (todos os participantes com o app aberto); o real está em Usage → Realtime Messages'
    from entregas
  union all
  select 4, 3, '4. TEMPO REAL', 'Tempo do banco gasto com o tempo real',
         coalesce(round((100 * tempo.tempo_real / nullif(tempo.total, 0))::numeric, 1) || ' %', '0 %'),
         round((coalesce(tempo.tempo_real, 0) / janela.dias / 60000)::numeric, 1) || ' min por dia',
         'é a conferência de permissão de cada aviso para cada aparelho; acima de 50 % ele domina o banco'
    from tempo, janela

  -- 5. BANCO
  union all
  select 5, 1, '5. BANCO', 'Ligado desde',
         to_char(pg_postmaster_start_time() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
         round((extract(epoch from now() - pg_postmaster_start_time()) / 86400)::numeric, 1) || ' dias',
         'reinício que ninguém pediu (o Supabase avisa manutenção por e-mail) é sinal de memória estourando'
  union all
  select 5, 2, '5. BANCO', 'Conexões agora',
         count(*) || ' de ' || current_setting('max_connections'),
         count(*) filter (where state = 'active') || ' ativas · '
           || count(*) filter (where state like 'idle in transaction%') || ' paradas no meio de uma transação',
         'atenção acima de 80 %; parada no meio de transação segura a tabela'
    from pg_stat_activity
  union all
  select 5, 3, '5. BANCO', 'Achado na memória',
         round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) || ' %',
         '', 'abaixo de 99 % o disco entra no caminho e tudo fica lento'
    from pg_statio_user_tables
  union all
  select 5, 4, '5. BANCO', 'Travamentos entre transações (deadlock)',
         banco.deadlocks::text,
         'desde ' || to_char(banco.contando_desde at time zone 'America/Sao_Paulo', 'DD/MM'),
         'o esperado é 0; acima disso, duas gravações brigaram e uma foi desfeita'
    from banco
  union all
  select 5, 5, '5. BANCO', 'Transações desfeitas',
         round(100.0 * banco.xact_rollback / nullif(banco.xact_commit + banco.xact_rollback, 0), 1) || ' %',
         banco.xact_rollback || ' de ' || (banco.xact_commit + banco.xact_rollback),
         'inclui o "já existe" que o aparelho trata como sucesso; acima de 5 % vale olhar'
    from banco
  union all
  select 5, 6, '5. BANCO', 'Arquivos temporários',
         pg_size_pretty(banco.temp_bytes), '',
         'consulta grande demais para a memória vai ao disco; o esperado é perto de 0'
    from banco
  union all
  select * from (
    select 5, 7, '5. BANCO', 'Consulta que mais ocupa o banco',
           round((s.total_exec_time / janela.dias / 1000)::numeric) || ' s por dia',
           round(s.mean_exec_time::numeric, 1) || ' ms em média · ' || s.calls || ' vezes',
           left(regexp_replace(s.query, '\s+', ' ', 'g'), 140)
      from extensions.pg_stat_statements s, janela
     order by s.total_exec_time desc
     limit 1
  ) mais_pesada
  union all
  select 5, 8, '5. BANCO', 'Consultas lentas (média acima de 1 s)',
         count(*)::text,
         coalesce(sum(calls), 0) || ' vezes no total',
         'o aparelho espera cada uma; o detalhe está em medir-lentidao.sql'
    from extensions.pg_stat_statements
   where mean_exec_time > 1000 and calls > 10
  union all
  select 5, 9, '5. BANCO', 'Tamanho do banco',
         pg_size_pretty(pg_database_size(current_database())), '', 'de 500 MB no gratuito'

  -- 6. DIAS
  union all
  select 6, (row_number() over (order by por_dia.dia))::int, '6. DIAS',
         to_char(por_dia.dia, 'DD/MM'),
         por_dia.pessoas || ' pessoas',
         por_dia.batidas || ' batidas · ' || por_dia.mensagens || ' mensagens · ' || por_dia.leituras || ' leituras',
         'erros das telas: ' || coalesce(erros.vezes, 0) || ' (' || coalesce(erros.pessoas, 0) || ' pessoas)'
           || ' · tempo real do chat ≈ ' || coalesce(entregas.entregas, 0)
    from por_dia
    left join erros    on erros.dia = por_dia.dia
    left join entregas on entregas.dia = por_dia.dia

) r
order by ordem, pos;
