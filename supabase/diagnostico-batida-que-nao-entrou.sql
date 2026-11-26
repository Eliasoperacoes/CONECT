-- ============================================================
-- A BATIDA NÃO ENTROU: FOI O SISTEMA OU O APARELHO? (26/11/2026)
-- SÓ LEITURA
--
-- Toda batida que CHEGA ao servidor com o QR da loja vira marcação
-- original, com NSR — até a que fica fora da jornada (registrar_marcacao;
-- a Portaria 671 proíbe recusar). O servidor só recusa três coisas: sessão
-- sem cadastro, conta desativada e código do QR não reconhecido.
--
-- Então, numa linha do tempo de hoje:
--   * as tentativas da pessoa que chegaram ao servidor, e o que viraram;
--   * os erros que a tela dela registrou (erros_do_app);
--   * se os COLEGAS da mesma loja conseguiram bater hoje, e a última vez;
--   * quando o código do QR da loja foi trocado pela última vez.
--
-- Leitura: nenhuma tentativa dela no horário + colegas batendo normal =
-- o pedido não saiu do aparelho (internet, câmera, app). Erro na tela dela
-- = a mensagem diz qual. Ninguém da loja batendo desde certa hora, ou QR
-- trocado hoje = sistema.
--
-- Troque 'renan%' pelo começo do nome.
-- Uma consulta só, de propósito: o SQL Editor mostra apenas a última.
-- ============================================================
with hoje as (
  select (now() at time zone 'America/Sao_Paulo')::date as dia
),
pessoa as (
  select c.id, c.nome, c.loja, c.ativo, c.turno
    from public.colaboradores c
   where c.nome ilike 'renan%'
),
eventos as (
  -- 0. Quem é, e se a conta está ativa
  select pe.nome, null::timestamptz as quando, '0. ficha' as o_que,
         'loja ' || pe.loja || ', turno ' || coalesce(pe.turno, '—')
           || case when pe.ativo then ', ativo' else ', DESATIVADO' end as detalhe
    from pessoa pe
  union all
  -- 1. Cada tentativa que chegou ao servidor
  select pe.nome, m.registrado_em, '1. chegou ao servidor',
         'NSR ' || m.nsr || ', pedida como ' || coalesce(m.tipo_pedido, '?')
           || ', na loja ' || m.loja
           || case when m.fora_da_jornada is not null then ' — FORA DA JORNADA: ' || m.fora_da_jornada
                   when m.registro_id is null then ' — sem lugar na jornada'
                   else ' — entrou na jornada' end
    from public.marcacoes_originais m
    join pessoa pe on pe.id = m.colaborador_id
    cross join hoje h
   where m.data = h.dia
  union all
  -- 2. A jornada dela hoje, como está
  select pe.nome, r.horario, '2. na jornada',
         r.tipo || ' ' || r.hora_formatada || ' (' || r.metodo || ')'
    from public.registros_ponto r
    join pessoa pe on pe.id = r.colaborador_id
    cross join hoje h
   where r.data = h.dia
  union all
  -- 3. Erros que a tela dela registrou hoje
  select pe.nome, e.ocorrido_em, '3. erro na tela',
         e.tela || ': ' || e.mensagem || coalesce(' — ' || e.versao, '') || coalesce(' — ' || left(e.navegador, 80), '')
    from public.erros_do_app e
    join pessoa pe on pe.id = e.colaborador_id
    cross join hoje h
   where (e.ocorrido_em at time zone 'America/Sao_Paulo')::date = h.dia
  union all
  -- 4. Os colegas da mesma loja: conseguiram bater hoje?
  select pe.nome, max(m.registrado_em), '4. colegas da loja',
         count(*) || ' batidas de ' || count(distinct m.colaborador_id)
           || ' pessoas hoje na loja ' || pe.loja || '; a última no horário ao lado'
    from pessoa pe
    cross join hoje h
    join public.marcacoes_originais m
      on m.loja = pe.loja and m.data = h.dia and m.colaborador_id <> pe.id
   group by pe.nome, pe.loja
  union all
  -- 5. O código do QR da loja: trocado quando?
  select pe.nome, q.atualizado_em, '5. QR da loja trocado',
         'por ' || coalesce(q.atualizado_por_nome, '—')
    from pessoa pe
    join public.codigos_ponto_loja q on q.loja = pe.loja
)
select nome,
       to_char(quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       o_que,
       detalhe
  from eventos
 order by nome, eventos.quando nulls first, o_que;
