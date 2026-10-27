-- ============================================================
-- COTADOR — ENCOMENDAS E O PAINEL DE PEDIDOS DE COMPRAS
-- (docs/cotador/SPEC-pedidos-compras.md, Elias 21/10/2026)
--
-- AINDA NÃO RODAR NA PRODUÇÃO: sobe junto com o resto do cotador.
-- Depende de cotador-banco.sql e cotador-precificacao.sql.
-- Delta. Pode ser executado mais de uma vez.
--
-- O vendedor encomenda pelo cartão da cotação; Compras monta os pedidos
-- do dia por fornecedor; o vendedor confirma o "Recebi". O sistema só
-- mostra a conta: não decide, não junta, não troca fornecedor.
--
--   encomendada → pedido_realizado → (em_transferencia) → em_conferencia → recebida → entregue
--        └──────────── cancelada (vendedor até o corte; Compras com motivo)
--   Em qualquer passo depois do pedido: "Problema" e "Cliente desistiu"
--   (docs/cotador/SPEC-comunicacao-recebimento.md, Elias 26/10/2026).
-- ============================================================

-- ------------------------------------------------------------
-- PEDIDO MÍNIMO DE CADA FORNECEDOR E O HORÁRIO DE CORTE
-- ------------------------------------------------------------

alter table public.fornecedores_b2b
  add column if not exists pedido_minimo numeric(10,2) not null default 0 check (pedido_minimo between 0 and 100000),
  add column if not exists pedido_minimo_atualizado_em timestamptz;

-- A tabela do Elias (docs/cotador/fretes-fornecedores.json), uma vez só:
-- quem Compras já ajustou não volta
update public.fornecedores_b2b set pedido_minimo = 150, pedido_minimo_atualizado_em = now()
 where chave in ('roles', 'dpk', 'pellegrino') and pedido_minimo_atualizado_em is null;

-- Uma linha só: a configuração do painel de Compras
create table if not exists public.config_compras (
  id             boolean primary key default true check (id),
  horario_corte  time not null default '15:59',
  atualizado_em  timestamptz,
  atualizado_por text references public.colaboradores(id) on delete set null
);
alter table public.config_compras enable row level security;
insert into public.config_compras (id) values (true) on conflict (id) do nothing;

-- Até quando uma encomenda feita em `feita` pode ser cancelada pelo
-- vendedor: o PRIMEIRO corte depois dela, no horário de Brasília. Feita às
-- 10h, até 15h59 do dia; feita às 17h, até 15h59 do dia seguinte.
create or replace function public.prazo_de_cancelamento(feita timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  with c as (
    select (feita at time zone 'America/Sao_Paulo') as local,
           ((feita at time zone 'America/Sao_Paulo')::date + (select horario_corte from public.config_compras)) as corte
  )
  select (case when c.local < c.corte then c.corte else c.corte + interval '1 day' end) at time zone 'America/Sao_Paulo'
    from c;
$$;
revoke all on function public.prazo_de_cancelamento(timestamptz) from public, anon;
grant execute on function public.prazo_de_cancelamento(timestamptz) to authenticated;

-- ------------------------------------------------------------
-- AS ENCOMENDAS
--
-- O que foi escolhido fica CONGELADO na hora (peça, fornecedor, venda,
-- custo, prazo): o preço de amanhã não muda a encomenda de hoje.
-- O custo vem do banco, nunca da tela: o Balcão encomenda sem vê-lo.
-- ------------------------------------------------------------

create table if not exists public.encomendas (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null check (codigo ~ '^[A-Z0-9]+$'),  -- a peça encomendada (pode ser o similar)
  codigo_cotado       text not null,                                   -- o código que o vendedor cotou
  origem              text not null check (origem in ('b2b', 'comprador')),
  fornecedor_chave    text references public.fornecedores_b2b(chave),  -- vazio: fornecedor de fora do B2B
  fornecedor_nome     text not null check (btrim(fornecedor_nome) <> ''),
  resposta_id         uuid references public.respostas_cotacao(id) on delete set null,
  marca               text,
  descricao           text,
  local               text,
  variante            text,
  venda               numeric(12,2),
  custo               numeric(12,2),
  prazo               text,
  quantidade          integer not null check (quantidade between 1 and 999),
  observacao          text,  -- nome ou telefone do cliente: nunca vai pelo chat
  vendedor_id         text references public.colaboradores(id) on delete set null,
  loja                text,
  situacao            text not null default 'encomendada'
                      check (situacao in ('encomendada', 'cancelada', 'pedido_realizado', 'em_conferencia', 'recebida')),
  criada_em           timestamptz not null default now(),
  cancelavel_ate      timestamptz not null,
  cancelada_em        timestamptz,
  cancelada_por       text references public.colaboradores(id) on delete set null,
  motivo_cancelamento text,
  pedido_em           timestamptz,
  pedido_por          text references public.colaboradores(id) on delete set null,
  conferencia_em      timestamptz,
  conferencia_por     text references public.colaboradores(id) on delete set null,
  recebida_em         timestamptz
);
alter table public.encomendas enable row level security;
create index if not exists encomendas_situacao on public.encomendas (situacao, criada_em);
create index if not exists encomendas_vendedor on public.encomendas (vendedor_id, criada_em desc);
-- A trava da resposta do comprador (resposta_com_encomenda_fica) sem varrer as encomendas
create index if not exists encomendas_da_resposta on public.encomendas (resposta_id) where resposta_id is not null;

-- DE ONDE A ENCOMENDA NASCEU (Elias, 22/10/2026: "precisaremos metrificar
-- todo o processo — desde a cotação ao fechamento até a entrega para o
-- vendedor"). Com isto, cada encomenda carrega o caminho inteiro:
--   cotada_em → (solicitação ao comprador) → criada_em → pedido_em →
--   conferencia_em → recebida_em (ou cancelada_em).
alter table public.encomendas
  add column if not exists consulta_id    uuid references public.consultas_cotacao(id) on delete set null,
  add column if not exists solicitacao_id uuid references public.solicitacoes_cotacao(id) on delete set null,
  add column if not exists cotada_em      timestamptz;

-- ATÉ O CLIENTE (SPEC-comunicacao-recebimento, Elias 26/10/2026)
--   · Filiais: tudo chega em Pirassununga e é redistribuído. A encomenda de
--     outra loja passa por em_transferencia; o comprador marca "Chegou na loja".
--   · "Recebi" não é o fim: o cliente ainda busca. entregue fecha o caminho.
--   · Problema (errada, faltou, avariada, preço) e Cliente desistiu: marcas
--     que avisam e esperam Compras resolver — não são "cancelar".
alter table public.encomendas drop constraint if exists encomendas_situacao_check;
alter table public.encomendas add constraint encomendas_situacao_check check (situacao in (
  'encomendada', 'cancelada', 'pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida', 'entregue'));
alter table public.encomendas
  add column if not exists transferencia_em       timestamptz,
  add column if not exists transferencia_por      text references public.colaboradores(id) on delete set null,
  add column if not exists recebida_por           text references public.colaboradores(id) on delete set null,
  add column if not exists entregue_em            timestamptz,
  add column if not exists entregue_por           text references public.colaboradores(id) on delete set null,
  add column if not exists problema               text check (problema in ('errada', 'faltou', 'avariada', 'preco', 'outro')),
  add column if not exists problema_detalhe       text,
  add column if not exists problema_em            timestamptz,
  add column if not exists problema_por           text references public.colaboradores(id) on delete set null,
  add column if not exists problema_resolvido_em  timestamptz,
  add column if not exists problema_resolvido_por text references public.colaboradores(id) on delete set null,
  add column if not exists problema_resolucao     text,
  add column if not exists desistiu_em            timestamptz,
  add column if not exists desistiu_por           text references public.colaboradores(id) on delete set null,
  add column if not exists destino_da_peca        text check (destino_da_peca in ('devolver', 'estoque', 'nao_pedida')),
  -- Quando o preço foi consultado no fornecedor: vale 24 h (Compras vê o vencido ao fazer o pedido)
  add column if not exists preco_consultado_em    timestamptz,
  -- O dia previsto de chegada, gravado no pedido (dia_previsto): o lembrete de atraso cobra por ele
  add column if not exists previsao_chegada       date,
  -- AS DEVOLUÇÕES AO FORNECEDOR (Elias, 26/10/2026): a troca e a devolução de um
  -- problema, e a peça do cliente que desistiu. Só o registro, para a métrica
  add column if not exists desfecho_problema      text check (desfecho_problema in ('troca', 'devolvida', 'aceita')),
  add column if not exists devolvida_em           timestamptz,
  add column if not exists motivo_devolucao       text check (motivo_devolucao in ('errada', 'faltou', 'avariada', 'preco', 'outro', 'desistencia')),
  -- O frete por peça do fornecedor, congelado com o custo: a margem é venda − (custo + frete) × quantidade (Elias, 26/10/2026)
  add column if not exists frete                  numeric(10,2);

-- As lojas onde o fornecedor entrega: as outras recebem por transferência
alter table public.config_compras
  add column if not exists lojas_que_recebem text[] not null default '{Pirassununga}';

-- Leitura direta só para Compras e TI, que veem o custo de qualquer jeito
-- — é o que deixa o painel deles mudar sozinho (tempo real). O vendedor lê
-- pelas funções abaixo, que escondem o custo de quem não vê custo.
drop policy if exists encomendas_leitura on public.encomendas;
create policy encomendas_leitura on public.encomendas
  for select to authenticated using (public.posso_atender_fila());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'encomendas') then
    alter publication supabase_realtime add table public.encomendas;
  end if;
end $$;

-- ------------------------------------------------------------
-- OS AVISOS NASCEM NO BANCO (SPEC-comunicacao-recebimento, Elias 26/10/2026)
--
-- Antes, a tela do comprador mudava a situação e depois mandava os recados
-- um por um: caiu a internet no meio, a encomenda mudou e o vendedor nunca
-- soube. Agora a mudança e o recado são a mesma transação, na conversa do
-- vendedor com Compras (escrever_recado, em cotador-banco.sql).
--
-- Nos dois sentidos: Compras avisa o vendedor de cada passo, e o vendedor
-- avisa Compras do que fez (encomendou, cancelou, recebeu, entregou, problema,
-- desistência). Um recado por vendedor e por passo, com todas as peças dele
-- (encomenda_ids). Nenhum leva custo; só o de conferência leva a observação
-- (o cliente), decisão do Elias.
-- ------------------------------------------------------------

-- A conversa só de encomendas virou a conversa do vendedor com Compras (cotador-banco.sql)
drop function if exists conversa_de_encomendas(text);

-- "2–3 dias" depois do pedido → "qui, 30/10" (o maior número do prazo, em dias corridos)
-- O dia previsto: um lugar só. Gravado na encomenda no "Pedido realizado"
-- (previsao_chegada), é o que o recado mostra e o que o lembrete de atraso cobra.
create or replace function public.dia_previsto(pedido timestamptz, prazo text)
returns date language sql immutable set search_path = public as $$
  -- Só prazo em DIAS ("2–3 dias", "1 dia"), até 60: o prazo do comprador é
  -- texto livre ("48h", "chega 15/11"), e chutar dias dali dava previsão
  -- absurda — ou um número que estourava o int e travava o lote do pedido.
  select (pedido at time zone 'America/Sao_Paulo')::date + n
    from (select (substring(lower(prazo) from '(\d{1,2})\s*dias?'))::int as n) x
   where n <= 60;
$$;

create or replace function public.previsao_de_chegada(pedido timestamptz, prazo text)
returns text language sql stable security definer set search_path = public as $$
  select case when d is null then null
              else (array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[extract(dow from d)::int + 1] || ', ' || to_char(d, 'DD/MM') end
    from (select public.dia_previsto(pedido, prazo) as d) x;
$$;
revoke all on function public.previsao_de_chegada(timestamptz, text) from public, anon;
grant execute on function public.previsao_de_chegada(timestamptz, text) to authenticated;

-- O texto do recado: a abertura de cada passo e uma linha por peça. As
-- aberturas de pedido, conferência e cancelamento são as que a tela lê
-- (avisoDaMensagem em encomendas.ts) — mudou aqui, mude lá.
create or replace function public.texto_do_aviso(aviso text, ids uuid[], extra text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  abertura text;
  linhas   text;
begin
  abertura := case aviso
    when 'pedido_realizado'   then 'Sua encomenda foi realizada:'
    when 'em_transferencia'   then 'Sua peça chegou em ' || (select c.lojas_que_recebem[1] from public.config_compras c) || ' e segue para a sua loja:'
    when 'em_conferencia'     then 'Sua peça chegou e está em conferência no estoque:'
    when 'cancelada'          then 'Sua encomenda foi cancelada por Compras:'
    when 'problema'           then 'Problema na encomenda:'
    when 'problema_resolvido' then 'Problema resolvido:'
    when 'desistencia'        then 'Cliente desistiu da encomenda:'
    -- Do vendedor para Compras
    when 'nova_encomenda'          then 'Nova encomenda:'
    when 'cancelada_pelo_vendedor' then 'Encomenda cancelada pelo vendedor:'
    when 'recebida'                then 'Peça recebida na loja:'
    when 'entregue'                then 'Peça entregue ao cliente:'
  end;
  select string_agg(
           e.quantidade || '× ' || e.codigo || coalesce(' (' || e.marca || ')', '') || ' · ' || e.fornecedor_nome
           || case when aviso = 'pedido_realizado' and public.previsao_de_chegada(e.pedido_em, e.prazo) is not null
                   then ' · previsão até ' || public.previsao_de_chegada(e.pedido_em, e.prazo) else '' end
           || case when aviso = 'em_conferencia' and e.observacao is not null then E'\n   Obs.: ' || e.observacao else '' end,
           E'\n' order by e.criada_em)
    into linhas
    from public.encomendas e where e.id = any(ids);
  return abertura || E'\n' || linhas
         || case when aviso = 'em_conferencia' then E'\nConfirme quando receber.' else '' end
         || coalesce(E'\n' || extra, '');
end;
$$;
revoke all on function public.texto_do_aviso(text, uuid[], text) from public, anon, authenticated;

-- Um recado por vendedor, com as peças dele. Quem escreve é quem fez o
-- passo (o comprador, ou o vendedor no problema e na desistência).
-- Devolve o recado de cada vendedor: a tela pede a notificação no celular.
create or replace function public.avisar_encomendas(ids uuid[], aviso text, extra text default null)
returns table (vendedor_id text, mensagem_id text) language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  for v in
    select e.vendedor_id as vendedor, array_agg(e.id order by e.criada_em) as dele
      from public.encomendas e
     where e.id = any(ids) and e.vendedor_id is not null
     group by e.vendedor_id
  loop
    vendedor_id := v.vendedor;
    mensagem_id := public.escrever_recado(v.vendedor, public.texto_do_aviso(aviso, v.dele, extra), aviso, null, v.dele);
    return next;
  end loop;
end;
$$;

-- O recado de UMA encomenda (os passos do vendedor): devolve o id dele
create or replace function public.avisar_encomenda(encomenda uuid, aviso text, extra text default null)
returns text language sql security definer set search_path = public as $$
  select a.mensagem_id from public.avisar_encomendas(array[encomenda], aviso, extra) a;
$$;
revoke all on function public.avisar_encomenda(uuid, text, text) from public, anon, authenticated;
revoke all on function public.avisar_encomendas(uuid[], text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- ENCOMENDAR (o vendedor, pelo cartão da cotação)
-- ------------------------------------------------------------

-- O FATOR DO VENDEDOR (Elias, 26/10/2026): o Callcenter vê o custo e põe a
-- margem em cima. A venda da encomenda é recalculada AQUI, com a mesma
-- preco_de_venda — o preço da tela nunca é aceito. Guardado para Compras e
-- a Gerência saberem com que margem a peça foi vendida.
alter table public.encomendas
  add column if not exists fator_do_vendedor numeric(4,2) check (fator_do_vendedor between 1 and 5);

-- De um B2B: a peça ou um similar, pela mesma conta da tela
-- (resultado_sem_mascara). Sem `variante`, a de menor venda. Com `fator`
-- (só quem vê custo), a venda é (custo + frete) × esse fator.
-- A assinatura antiga (sem fator) sai, senão ficam duas "encomendar".
-- Sem o "public." de propósito: o conferidor de ordem (ordemDoSql.test.ts)
-- leria o drop como uso antes da criação.
drop function if exists encomendar(text, text, text, text, integer, text);
create or replace function public.encomendar(
  codigo_cotado text, codigo_peca text, fornecedor text, variante text, quantidade integer, observacao text,
  fator numeric default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  eu   text := public.meu_colaborador_id();
  loja text := (select c.loja from public.colaboradores c where c.id = public.meu_colaborador_id());
  r    record;
  consulta record;
  consultado timestamptz;
  nova uuid;
begin
  if not public.posso_cotar() then
    raise exception 'Só Balcão, Callcenter e Gerente encomendam' using errcode = '42501';
  end if;
  if quantidade is null or quantidade < 1 or quantidade > 999 then
    raise exception 'Quantidade de 1 a 999';
  end if;
  if encomendar.fator is not null then
    if not public.posso_ver_custo() then
      raise exception 'Só quem vê o custo põe a margem' using errcode = '42501';
    end if;
    if encomendar.fator <> round(encomendar.fator, 2) or encomendar.fator < 1 or encomendar.fator > 5 then
      raise exception 'Fator de 1,00 a 5,00, com até duas casas';
    end if;
  end if;

  select * into r
    from public.resultado_sem_mascara(encomendar.codigo_cotado, loja) x
   where x.codigo_peca = public.normalizar_codigo(encomendar.codigo_peca)
     and x.fornecedor = encomendar.fornecedor
     and x.venda is not null
     and (encomendar.variante is null or x.variante = encomendar.variante)
   order by x.venda
   limit 1;
  if not found then
    raise exception 'Este fornecedor não tem a peça hoje. Cote de novo antes de encomendar.';
  end if;

  -- O preço vale 24 h depois de consultado no fornecedor (Elias, 26/10/2026)
  consultado := (select p.consultado_em from public.precos_b2b p
                  where p.fornecedor = r.fornecedor and p.codigo = r.codigo_peca and p.local is not distinct from r.local);
  if consultado is not null and consultado < now() - interval '24 hours' then
    raise exception 'O preço deste fornecedor tem mais de 24 h. Cote de novo antes de encomendar.';
  end if;

  -- A cotação que deu origem: a última foto desta peça cotada por este
  -- vendedor; sem foto (aberta pelo chat), a última vez que ele a pediu hoje
  select c.id, c.criada_em into consulta
    from public.consultas_cotacao c
   where c.colaborador_id = eu and c.codigo = public.normalizar_codigo(encomendar.codigo_cotado)
   order by c.criada_em desc
   limit 1;

  insert into public.encomendas (
    codigo, codigo_cotado, origem, fornecedor_chave, fornecedor_nome, marca, descricao, local, variante,
    venda, custo, prazo, quantidade, observacao, vendedor_id, loja, cancelavel_ate, consulta_id, cotada_em,
    fator_do_vendedor, preco_consultado_em, frete
  ) values (
    r.codigo_peca, public.normalizar_codigo(encomendar.codigo_cotado), 'b2b', r.fornecedor,
    (select f.nome from public.fornecedores_b2b f where f.chave = r.fornecedor),
    -- Com o fator do vendedor o tipo de peça não muda o preço: fica sem variante
    r.marca, r.descricao, r.local, case when encomendar.fator is null then nullif(r.variante, '') end,
    coalesce(public.preco_de_venda(r.custo + coalesce(r.frete, 0), encomendar.fator), r.venda),
    r.custo, r.prazo, encomendar.quantidade, nullif(btrim(encomendar.observacao), ''),
    eu, loja, public.prazo_de_cancelamento(now()),
    consulta.id,
    coalesce(consulta.criada_em,
             (select d.ultima from public.cotacoes_do_dia d
               where d.colaborador_id = eu and d.codigo = public.normalizar_codigo(encomendar.codigo_cotado)
                 and d.dia = public.hoje_brasilia()),
             now()),
    encomendar.fator, consultado, coalesce(r.frete, 0)
  ) returning id into nova;
  -- Compras fica sabendo pela conversa (chat e celular), não só pela coluna do fornecedor
  perform public.avisar_encomenda(nova, 'nova_encomenda');
  return nova;
end;
$$;
revoke all on function public.encomendar(text, text, text, text, integer, text, numeric) from public, anon;
grant execute on function public.encomendar(text, text, text, text, integer, text, numeric) to authenticated;

-- A OPÇÃO QUE JÁ VIROU ENCOMENDA NÃO SAI. Corrigir para "não encontrei", ou
-- responder de novo, apaga as opções: a encomenda feita por uma delas seguiria
-- por um fornecedor que o comprador disse não ter, e perderia o vínculo com a
-- resposta. Compras cancela a encomenda antes (o motivo avisa o vendedor).
create or replace function public.resposta_com_encomenda_fica()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.encomendas e where e.resposta_id = old.id and e.situacao <> 'cancelada') then
    raise exception 'Já há encomenda feita por esta resposta: cancele a encomenda em Pedidos antes de mudar a resposta';
  end if;
  return old;
end;
$$;
drop trigger if exists respostas_cotacao_com_encomenda_fica on public.respostas_cotacao;
create trigger respostas_cotacao_com_encomenda_fica
  before delete on public.respostas_cotacao
  for each row execute function public.resposta_com_encomenda_fica();

-- De uma resposta do comprador (fora do B2B): venda e custo da resposta
create or replace function public.encomendar_resposta(resposta uuid, quantidade integer, observacao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  eu   text := public.meu_colaborador_id();
  r    record;
  nova uuid;
begin
  if not public.posso_cotar() then
    raise exception 'Só Balcão, Callcenter e Gerente encomendam' using errcode = '42501';
  end if;
  if quantidade is null or quantidade < 1 or quantidade > 999 then
    raise exception 'Quantidade de 1 a 999';
  end if;
  select rc.*, s.codigo as cod, s.pedida_por, s.id as sol_id, s.criada_em as sol_em, s.situacao as sit into r
    from public.respostas_cotacao rc
    join public.solicitacoes_cotacao s on s.id = rc.solicitacao_id
   where rc.id = encomendar_resposta.resposta;
  -- Só a resposta da própria solicitação (Compras encomenda qualquer uma)
  if not found or (r.pedida_por is distinct from eu and not public.posso_atender_fila()) then
    raise exception 'Resposta não encontrada';
  end if;
  -- Só a resposta que vale: o comprador pode ter corrigido para "não encontrei"
  if r.sit <> 'respondida' then
    raise exception 'O comprador mudou a resposta: veja a cotação de novo';
  end if;

  -- A origem é a solicitação ao comprador: o caminho começa quando o vendedor pediu
  insert into public.encomendas (
    codigo, codigo_cotado, origem, fornecedor_nome, resposta_id, marca, venda, custo, prazo,
    quantidade, observacao, vendedor_id, loja, cancelavel_ate, solicitacao_id, cotada_em
  ) values (
    r.cod, r.cod, 'comprador', btrim(r.fornecedor), r.id, r.marca, r.venda, r.custo, r.prazo,
    encomendar_resposta.quantidade, nullif(btrim(encomendar_resposta.observacao), ''),
    eu, (select c.loja from public.colaboradores c where c.id = eu), public.prazo_de_cancelamento(now()),
    r.sol_id, r.sol_em
  ) returning id into nova;
  -- Compras fica sabendo pela conversa (chat e celular), não só pela coluna do fornecedor
  perform public.avisar_encomenda(nova, 'nova_encomenda');
  return nova;
end;
$$;
revoke all on function public.encomendar_resposta(uuid, integer, text) from public, anon;
grant execute on function public.encomendar_resposta(uuid, integer, text) to authenticated;

-- ------------------------------------------------------------
-- MUDAR DE SITUAÇÃO: cada passo só a partir do passo certo
-- ------------------------------------------------------------

-- Cancelar: o vendedor, a dele, ainda encomendada e antes do corte.
-- Compras, qualquer uma ainda não chegada, com o motivo (o fornecedor não
-- tinha a peça) — e aí o vendedor recebe o recado; cancelou o vendedor,
-- quem recebe é Compras. Devolve o recado (a notificação no celular).
drop function if exists public.cancelar_encomenda(uuid, text);
create or replace function public.cancelar_encomenda(encomenda uuid, motivo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.encomendas%rowtype;
  compras boolean := public.posso_atender_fila();
begin
  select * into e from public.encomendas where id = encomenda for update;
  if e.id is null or (e.vendedor_id is distinct from public.meu_colaborador_id() and not compras) then
    raise exception 'Encomenda não encontrada';
  end if;

  if e.vendedor_id = public.meu_colaborador_id() and e.situacao = 'encomendada' and now() <= e.cancelavel_ate then
    null;  -- o vendedor, dentro do prazo
  elsif compras and e.situacao in ('encomendada', 'pedido_realizado') then
    if nullif(btrim(motivo), '') is null then
      raise exception 'Informe o motivo do cancelamento';
    end if;
  elsif e.situacao <> 'encomendada' then
    raise exception 'Esta encomenda já foi pedida ao fornecedor: fale com Compras';
  else
    raise exception 'Passou do horário de cancelamento: fale com Compras';
  end if;

  update public.encomendas
     set situacao = 'cancelada', cancelada_em = now(), cancelada_por = public.meu_colaborador_id(),
         motivo_cancelamento = nullif(btrim(motivo), '')
   where id = e.id;
  if e.vendedor_id is distinct from public.meu_colaborador_id() then
    return public.avisar_encomenda(e.id, 'cancelada', 'Motivo: ' || btrim(motivo));
  end if;
  return public.avisar_encomenda(e.id, 'cancelada_pelo_vendedor');
end;
$$;
revoke all on function public.cancelar_encomenda(uuid, text) from public, anon;
grant execute on function public.cancelar_encomenda(uuid, text) to authenticated;

-- O que um passo em lote devolve: cada encomenda que mudou, a situação nova
-- e o recado do vendedor dela (a tela pede a notificação no celular).
drop function if exists mudaram_e_avisos(uuid[], text[], text[]);
create or replace function public.mudaram_e_avisos(mudaram uuid[], recados text[])
returns table (id uuid, vendedor_id text, situacao text, mensagem_id text)
language sql stable security definer set search_path = public as $$
  select e.id, e.vendedor_id, e.situacao,
         (select m.id from public.mensagens m where m.id = any(recados) and e.id = any(m.encomenda_ids) limit 1)
    from public.encomendas e where e.id = any(mudaram);
$$;
revoke all on function public.mudaram_e_avisos(uuid[], text[]) from public, anon, authenticated;

-- Compras fecha o pedido: as encomendas marcadas, que ainda estavam
-- encomendadas. Mesmo abaixo do mínimo: o mínimo é só a conta para o
-- comprador se organizar (Elias, 26/10/2026).
drop function if exists public.marcar_pedido_realizado(uuid[]);
create or replace function public.marcar_pedido_realizado(ids uuid[])
returns table (id uuid, vendedor_id text, situacao text, mensagem_id text) language plpgsql security definer set search_path = public as $$
declare
  mudaram uuid[];
  ms text[];
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI fecham pedidos' using errcode = '42501';
  end if;
  with u as (
    update public.encomendas e
       set situacao = 'pedido_realizado', pedido_em = now(), pedido_por = public.meu_colaborador_id(),
           previsao_chegada = public.dia_previsto(now(), e.prazo)
     where e.id = any(ids) and e.situacao = 'encomendada'
    returning e.id
  ) select array_agg(u.id) into mudaram from u;
  select array_agg(a.mensagem_id) into ms from public.avisar_encomendas(mudaram, 'pedido_realizado') a;
  return query select * from public.mudaram_e_avisos(mudaram, ms);
end;
$$;
revoke all on function public.marcar_pedido_realizado(uuid[]) from public, anon;
grant execute on function public.marcar_pedido_realizado(uuid[]) to authenticated;

-- A peça chegou do fornecedor. Na loja que recebe direto: em conferência,
-- até o vendedor confirmar. Nas outras: em transferência, até o comprador
-- marcar "Chegou na loja". Devolve a situação nova de cada uma (os avisos).
drop function if exists public.marcar_em_conferencia(uuid[]);
create or replace function public.marcar_em_conferencia(ids uuid[])
returns table (id uuid, vendedor_id text, situacao text, mensagem_id text) language plpgsql security definer set search_path = public as $$
declare
  diretas text[] := (select c.lojas_que_recebem from public.config_compras c);
  mudaram uuid[];
  ms text[];
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI marcam a chegada' using errcode = '42501';
  end if;
  with u as (
    update public.encomendas e
       set situacao        = case when e.loja is null or e.loja = any(diretas) then 'em_conferencia' else 'em_transferencia' end,
           conferencia_em  = case when e.loja is null or e.loja = any(diretas) then now() end,
           conferencia_por = case when e.loja is null or e.loja = any(diretas) then public.meu_colaborador_id() end,
           transferencia_em  = case when e.loja is null or e.loja = any(diretas) then null else now() end,
           transferencia_por = case when e.loja is null or e.loja = any(diretas) then null else public.meu_colaborador_id() end
     where e.id = any(ids) and e.situacao = 'pedido_realizado'
    returning e.id
  ) select array_agg(u.id) into mudaram from u;
  -- Um recado por passo: quem está em conferência e quem segue em transferência
  select array_agg(a.mensagem_id) into ms
    from (select * from public.avisar_encomendas(
                          array(select x.id from public.encomendas x where x.id = any(mudaram) and x.situacao = 'em_conferencia'), 'em_conferencia')
          union all
          select * from public.avisar_encomendas(
                          array(select x.id from public.encomendas x where x.id = any(mudaram) and x.situacao = 'em_transferencia'), 'em_transferencia')) a;
  return query select * from public.mudaram_e_avisos(mudaram, ms);
end;
$$;
revoke all on function public.marcar_em_conferencia(uuid[]) from public, anon;
grant execute on function public.marcar_em_conferencia(uuid[]) to authenticated;

-- O comprador: a transferência chegou na loja do vendedor → em conferência
drop function if exists public.marcar_chegou_na_loja(uuid[]);
create or replace function public.marcar_chegou_na_loja(ids uuid[])
returns table (id uuid, vendedor_id text, situacao text, mensagem_id text) language plpgsql security definer set search_path = public as $$
declare
  mudaram uuid[];
  ms text[];
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI marcam a chegada' using errcode = '42501';
  end if;
  with u as (
    update public.encomendas e
       set situacao = 'em_conferencia', conferencia_em = now(), conferencia_por = public.meu_colaborador_id()
     where e.id = any(ids) and e.situacao = 'em_transferencia'
    returning e.id
  ) select array_agg(u.id) into mudaram from u;
  select array_agg(a.mensagem_id) into ms from public.avisar_encomendas(mudaram, 'em_conferencia') a;
  return query select * from public.mudaram_e_avisos(mudaram, ms);
end;
$$;
revoke all on function public.marcar_chegou_na_loja(uuid[]) from public, anon;
grant execute on function public.marcar_chegou_na_loja(uuid[]) to authenticated;

-- Quem fala pelo vendedor quando ele não está: o Gerente da mesma loja,
-- depois de 1 dia esperando (vendedor de folga, de férias, desligado).
create or replace function public.posso_agir_pelo_vendedor(e public.encomendas, desde timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  -- coalesce: encomenda sem vendedor (colaborador apagado) daria NULL, e o
  -- "not NULL" de quem chama não barraria ninguém
  select coalesce(
           e.vendedor_id = public.meu_colaborador_id()
           or (public.meu_nivel() >= 3
               and e.loja is not distinct from (select c.loja from public.colaboradores c where c.id = public.meu_colaborador_id())
               and desde <= now() - interval '1 day'),
           false);
$$;
revoke all on function public.posso_agir_pelo_vendedor(public.encomendas, timestamptz) from public, anon;
grant execute on function public.posso_agir_pelo_vendedor(public.encomendas, timestamptz) to authenticated;

-- "Recebi" (pelo chat ou pela aba Encomendas): o vendedor; passado 1 dia, o Gerente da loja.
-- Compras recebe o recado; devolve o id dele.
drop function if exists public.confirmar_recebimento(uuid);
create or replace function public.confirmar_recebimento(encomenda uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.encomendas%rowtype;
begin
  select * into e from public.encomendas where id = encomenda for update;
  if e.id is null or not public.posso_agir_pelo_vendedor(e, coalesce(e.conferencia_em, now())) then
    raise exception 'Encomenda não encontrada';
  end if;
  if e.situacao in ('recebida', 'entregue') then
    return null;  -- tocou duas vezes: já está, sem outro recado
  end if;
  if e.situacao <> 'em_conferencia' then
    raise exception 'A peça ainda não chegou à loja';
  end if;
  update public.encomendas set situacao = 'recebida', recebida_em = now(), recebida_por = public.meu_colaborador_id() where id = e.id;
  return public.avisar_encomenda(e.id, 'recebida');
end;
$$;
revoke all on function public.confirmar_recebimento(uuid) from public, anon;
grant execute on function public.confirmar_recebimento(uuid) to authenticated;

-- "Entregue ao cliente": o fim do caminho. O vendedor; passado 1 dia, o Gerente da loja.
-- Compras recebe o recado; devolve o id dele.
drop function if exists public.marcar_entregue(uuid);
create or replace function public.marcar_entregue(encomenda uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.encomendas%rowtype;
begin
  select * into e from public.encomendas where id = encomenda for update;
  if e.id is null or not public.posso_agir_pelo_vendedor(e, coalesce(e.recebida_em, now())) then
    raise exception 'Encomenda não encontrada';
  end if;
  if e.situacao = 'entregue' then
    return null;
  end if;
  if e.situacao <> 'recebida' then
    raise exception 'Confirme o "Recebi" antes de entregar';
  end if;
  update public.encomendas set situacao = 'entregue', entregue_em = now(), entregue_por = public.meu_colaborador_id() where id = e.id;
  return public.avisar_encomenda(e.id, 'entregue');
end;
$$;
revoke all on function public.marcar_entregue(uuid) from public, anon;
grant execute on function public.marcar_entregue(uuid) to authenticated;

-- "Problema": peça errada, faltou, avariada, preço diferente. O vendedor
-- (a dele) ou Compras, depois do pedido. Não muda a situação: marca e espera
-- Compras resolver (trocar, devolver, aceitar) — ou cancelar.
create or replace function public.marcar_problema(encomenda uuid, tipo text, detalhe text)
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.encomendas%rowtype;
begin
  select * into e from public.encomendas where id = encomenda for update;
  if e.id is null or (e.vendedor_id is distinct from public.meu_colaborador_id() and not public.posso_atender_fila()) then
    raise exception 'Encomenda não encontrada';
  end if;
  if e.situacao not in ('pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida') then
    raise exception 'Problema só depois do pedido feito e antes da entrega';
  end if;
  if tipo is null or tipo not in ('errada', 'faltou', 'avariada', 'preco', 'outro') then
    raise exception 'Escolha o problema: errada, faltou, avariada, preço ou outro';
  end if;
  if tipo = 'outro' and nullif(btrim(detalhe), '') is null then
    raise exception 'Descreva o problema';
  end if;
  update public.encomendas
     set problema = tipo, problema_detalhe = nullif(btrim(detalhe), ''), problema_em = now(), problema_por = public.meu_colaborador_id(),
         problema_resolvido_em = null, problema_resolvido_por = null, problema_resolucao = null
   where id = e.id;
  return public.avisar_encomenda(e.id, 'problema',
            (select case tipo when 'errada' then 'Peça errada' when 'faltou' then 'Faltou peça' when 'avariada' then 'Avariada'
                              when 'preco' then 'Preço diferente' else 'Outro' end)
            || coalesce(' — ' || nullif(btrim(detalhe), ''), ''));
end;
$$;
revoke all on function public.marcar_problema(uuid, text, text) from public, anon;
grant execute on function public.marcar_problema(uuid, text, text) to authenticated;

-- Compras resolve o problema: o DESFECHO e o que foi feito, em texto.
--   troca     — a peça volta e o fornecedor manda outra: a encomenda segue;
--   devolvida — a peça volta e não vem outra: a encomenda termina cancelada;
--   aceita    — fica como está (o preço, a peça): a encomenda segue.
-- Troca e devolvida são DEVOLUÇÕES ao fornecedor (Elias, 26/10/2026:
-- "metrificar as devoluções"): marcam devolvida_em e o motivo.
drop function if exists public.resolver_problema(uuid, text);
create or replace function public.resolver_problema(encomenda uuid, resolucao text, desfecho text)
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.encomendas%rowtype;
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI resolvem problemas' using errcode = '42501';
  end if;
  select * into e from public.encomendas where id = encomenda for update;
  -- Só o problema ABERTO, e só de encomenda em andamento: um segundo clique
  -- não pode cancelar a entregue nem contar a devolução duas vezes
  if e.id is null or e.problema is null or e.problema_resolvido_em is not null
     or e.situacao not in ('pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida') then
    raise exception 'Esta encomenda não tem problema aberto';
  end if;
  if desfecho is null or desfecho not in ('troca', 'devolvida', 'aceita') then
    raise exception 'Escolha o desfecho: troca, devolvida ou aceita';
  end if;
  if nullif(btrim(resolucao), '') is null then
    raise exception 'Conte o que foi feito';
  end if;
  update public.encomendas
     set problema_resolvido_em = now(), problema_resolvido_por = public.meu_colaborador_id(), problema_resolucao = btrim(resolucao),
         desfecho_problema = desfecho,
         devolvida_em      = case when desfecho in ('troca', 'devolvida') then now() else devolvida_em end,
         motivo_devolucao  = case when desfecho in ('troca', 'devolvida') then e.problema else motivo_devolucao end,
         situacao          = case when desfecho = 'devolvida' then 'cancelada' else situacao end,
         cancelada_em      = case when desfecho = 'devolvida' then now() else cancelada_em end,
         cancelada_por     = case when desfecho = 'devolvida' then public.meu_colaborador_id() else cancelada_por end,
         motivo_cancelamento = case when desfecho = 'devolvida' then 'Peça devolvida ao fornecedor' else motivo_cancelamento end
   where id = e.id;
  return public.avisar_encomenda(e.id, 'problema_resolvido',
            case desfecho when 'troca' then 'Troca: ' when 'devolvida' then 'Devolvida ao fornecedor (encomenda cancelada): ' else 'Aceita como está: ' end
            || btrim(resolucao));
end;
$$;
revoke all on function public.resolver_problema(uuid, text, text) from public, anon;
grant execute on function public.resolver_problema(uuid, text, text) to authenticated;

-- "Cliente desistiu": o vendedor (a dele) ou Compras, a qualquer momento
-- antes da entrega. Não cancela: a peça já pode estar a caminho, e Compras
-- decide o destino dela.
create or replace function public.cliente_desistiu(encomenda uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.encomendas%rowtype;
begin
  select * into e from public.encomendas where id = encomenda for update;
  if e.id is null or (e.vendedor_id is distinct from public.meu_colaborador_id() and not public.posso_atender_fila()) then
    raise exception 'Encomenda não encontrada';
  end if;
  if e.situacao not in ('encomendada', 'pedido_realizado', 'em_transferencia', 'em_conferencia', 'recebida') then
    raise exception 'Esta encomenda já terminou';
  end if;
  if e.desistiu_em is not null then
    return null;  -- tocou duas vezes: já está, sem outro recado
  end if;
  update public.encomendas set desistiu_em = now(), desistiu_por = public.meu_colaborador_id() where id = e.id;
  return public.avisar_encomenda(e.id, 'desistencia', 'Compras decide o destino da peça.');
end;
$$;
revoke all on function public.cliente_desistiu(uuid) from public, anon;
grant execute on function public.cliente_desistiu(uuid) to authenticated;

-- Compras decide a peça do cliente que desistiu, e a encomenda termina
-- cancelada: ainda não pedida, só cancela; pedida, devolver ou estoque.
create or replace function public.destinar_desistencia(encomenda uuid, destino text)
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.encomendas%rowtype;
  final text;
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI decidem a peça' using errcode = '42501';
  end if;
  select * into e from public.encomendas where id = encomenda for update;
  if e.id is null or e.desistiu_em is null or e.situacao in ('cancelada', 'entregue') then
    raise exception 'Não há desistência esperando decisão';
  end if;
  final := case when e.situacao = 'encomendada' then 'nao_pedida' else destino end;
  if final is null or final not in ('devolver', 'estoque', 'nao_pedida') then
    raise exception 'Escolha: devolver ao fornecedor ou mandar para o estoque';
  end if;
  update public.encomendas
     set situacao = 'cancelada', cancelada_em = now(), cancelada_por = public.meu_colaborador_id(),
         destino_da_peca = final,
         devolvida_em     = case when final = 'devolver' then now() else devolvida_em end,
         motivo_devolucao = case when final = 'devolver' then 'desistencia' else motivo_devolucao end,
         motivo_cancelamento = 'Cliente desistiu' || case final when 'devolver' then ' · peça devolvida ao fornecedor'
                                                               when 'estoque' then ' · peça foi para o estoque' else '' end
   where id = e.id;
  return public.avisar_encomenda(e.id, 'cancelada',
            'Motivo: ' || (select x.motivo_cancelamento from public.encomendas x where x.id = e.id));
end;
$$;
revoke all on function public.destinar_desistencia(uuid, text) from public, anon;
grant execute on function public.destinar_desistencia(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- LER
-- ------------------------------------------------------------

-- As do vendedor: as em andamento (até entregar) e as dos últimos 30 dias.
-- O custo só para quem vê custo. Mudar as colunas pede o drop.
drop function if exists public.minhas_encomendas();
create or replace function public.minhas_encomendas()
returns table (
  id uuid, codigo text, codigo_cotado text, origem text, fornecedor_nome text, marca text, descricao text,
  venda numeric, custo numeric, prazo text, quantidade integer, observacao text, situacao text,
  criada_em timestamptz, cancelavel_ate timestamptz, cancelada_em timestamptz, motivo_cancelamento text,
  pedido_em timestamptz, conferencia_em timestamptz, recebida_em timestamptz,
  transferencia_em timestamptz, entregue_em timestamptz,
  problema text, problema_detalhe text, problema_em timestamptz, problema_resolvido_em timestamptz, problema_resolucao text,
  desistiu_em timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  ve_custo boolean := public.posso_ver_custo();
begin
  return query
    select e.id, e.codigo, e.codigo_cotado, e.origem, e.fornecedor_nome, e.marca, e.descricao,
           e.venda, case when ve_custo then e.custo end, e.prazo, e.quantidade, e.observacao, e.situacao,
           e.criada_em, e.cancelavel_ate, e.cancelada_em, e.motivo_cancelamento,
           e.pedido_em, e.conferencia_em, e.recebida_em,
           e.transferencia_em, e.entregue_em,
           e.problema, e.problema_detalhe, e.problema_em, e.problema_resolvido_em, e.problema_resolucao,
           e.desistiu_em
      from public.encomendas e
     where e.vendedor_id = public.meu_colaborador_id()
       and (e.situacao not in ('cancelada', 'entregue') or e.criada_em > now() - interval '30 days')
     order by e.criada_em desc;
end;
$$;
revoke all on function public.minhas_encomendas() from public, anon;
grant execute on function public.minhas_encomendas() to authenticated;

-- O GERENTE DA LOJA: as peças que esperam o vendedor (Recebi ou Entregue).
-- Só as da loja dele; ele age por quem passou de 1 dia (posso_agir_pelo_vendedor).
create or replace function public.encomendas_da_loja()
returns table (
  id uuid, codigo text, fornecedor_nome text, marca text, quantidade integer, observacao text, situacao text,
  vendedor_id text, nome_do_vendedor text, conferencia_em timestamptz, recebida_em timestamptz, pode_agir boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  minha_loja text := (select c.loja from public.colaboradores c where c.id = public.meu_colaborador_id());
begin
  if public.meu_nivel() < 3 then
    raise exception 'Só o Gerente vê as encomendas da loja' using errcode = '42501';
  end if;
  return query
    select e.id, e.codigo, e.fornecedor_nome, e.marca, e.quantidade, e.observacao, e.situacao,
           e.vendedor_id, c.nome, e.conferencia_em, e.recebida_em,
           public.posso_agir_pelo_vendedor(e, case when e.situacao = 'em_conferencia' then e.conferencia_em else e.recebida_em end)
      from public.encomendas e
      left join public.colaboradores c on c.id = e.vendedor_id
     where e.loja is not distinct from minha_loja
       and e.situacao in ('em_conferencia', 'recebida')
     order by coalesce(e.recebida_em, e.conferencia_em);
end;
$$;
revoke all on function public.encomendas_da_loja() from public, anon;
grant execute on function public.encomendas_da_loja() to authenticated;

-- O painel de Compras: as encomendas das situações pedidas, com o
-- vendedor e o pedido mínimo do fornecedor (vazio para quem é de fora).
-- As terminadas (canceladas e recebidas), só as de hoje: a atividade do dia
-- no Painel de Compras (Elias, 22/10: "não existe notificação, principalmente
-- de excluir peça") — quem perdeu o aviso ainda vê. Mudar as colunas pede o drop.
drop function if exists public.encomendas_de_compras(text[]);
create or replace function public.encomendas_de_compras(situacoes text[])
returns table (
  id uuid, codigo text, origem text, fornecedor_chave text, fornecedor_nome text, pedido_minimo numeric,
  marca text, descricao text, local text, venda numeric, custo numeric, prazo text, quantidade integer,
  observacao text, situacao text, vendedor_id text, nome_do_vendedor text, loja text,
  criada_em timestamptz, pedido_em timestamptz, conferencia_em timestamptz,
  cancelada_em timestamptz, cancelada_pelo_vendedor boolean, motivo_cancelamento text, recebida_em timestamptz,
  transferencia_em timestamptz, entregue_em timestamptz,
  problema text, problema_detalhe text, problema_em timestamptz, problema_resolvido_em timestamptz, problema_resolucao text,
  desistiu_em timestamptz, cotada_em timestamptz, preco_consultado_em timestamptz, previsao_chegada date
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI veem os pedidos' using errcode = '42501';
  end if;
  return query
    select e.id, e.codigo, e.origem, e.fornecedor_chave, e.fornecedor_nome, f.pedido_minimo,
           e.marca, e.descricao, e.local, e.venda, e.custo, e.prazo, e.quantidade,
           e.observacao, e.situacao, e.vendedor_id, c.nome, e.loja,
           e.criada_em, e.pedido_em, e.conferencia_em,
           e.cancelada_em, e.cancelada_por is not distinct from e.vendedor_id, e.motivo_cancelamento, e.recebida_em,
           e.transferencia_em, e.entregue_em,
           e.problema, e.problema_detalhe, e.problema_em, e.problema_resolvido_em, e.problema_resolucao,
           e.desistiu_em, e.cotada_em, e.preco_consultado_em, e.previsao_chegada
      from public.encomendas e
      left join public.fornecedores_b2b f on f.chave = e.fornecedor_chave
      left join public.colaboradores c on c.id = e.vendedor_id
     where e.situacao = any(situacoes)
       -- As que terminaram só as de hoje; recebida ainda não terminou (falta entregar)
       and (e.situacao not in ('cancelada', 'entregue')
            or coalesce(e.cancelada_em, e.entregue_em) >= (public.hoje_brasilia()::timestamp at time zone 'America/Sao_Paulo'))
     order by e.criada_em;
end;
$$;
revoke all on function public.encomendas_de_compras(text[]) from public, anon;
grant execute on function public.encomendas_de_compras(text[]) to authenticated;

-- ------------------------------------------------------------
-- CONFIGURAÇÕES (Compras e TI)
-- ------------------------------------------------------------

create or replace function public.configuracao_de_compras()
returns table (horario_corte time, fornecedores jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI cuidam do painel de pedidos' using errcode = '42501';
  end if;
  return query
    select cc.horario_corte,
           (select coalesce(jsonb_agg(jsonb_build_object('chave', f.chave, 'nome', f.nome, 'pedido_minimo', f.pedido_minimo)
                                      order by f.ordem), '[]'::jsonb)
              from public.fornecedores_b2b f where f.ativo)
      from public.config_compras cc;
end;
$$;
revoke all on function public.configuracao_de_compras() from public, anon;
grant execute on function public.configuracao_de_compras() to authenticated;

create or replace function public.alterar_pedido_minimo(fornecedor text, valor numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI cuidam do pedido mínimo' using errcode = '42501';
  end if;
  if valor is null or valor < 0 or valor > 100000 then
    raise exception 'Pedido mínimo de R$ 0,00 a R$ 100.000,00';
  end if;
  update public.fornecedores_b2b
     set pedido_minimo = round(valor, 2), pedido_minimo_atualizado_em = now()
   where chave = alterar_pedido_minimo.fornecedor;
  if not found then
    raise exception 'Fornecedor desconhecido: %', alterar_pedido_minimo.fornecedor;
  end if;
end;
$$;
revoke all on function public.alterar_pedido_minimo(text, numeric) from public, anon;
grant execute on function public.alterar_pedido_minimo(text, numeric) to authenticated;

-- Vale para as encomendas feitas daqui em diante: a que já foi feita
-- guarda o próprio prazo (o vendedor viu "cancelar até 15h59" ao encomendar)
create or replace function public.alterar_horario_corte(horario time)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_atender_fila() then
    raise exception 'Só Compras ou TI cuidam do horário de corte' using errcode = '42501';
  end if;
  if horario is null then
    raise exception 'Informe o horário';
  end if;
  update public.config_compras
     set horario_corte = horario, atualizado_em = now(), atualizado_por = public.meu_colaborador_id();
end;
$$;
revoke all on function public.alterar_horario_corte(time) from public, anon;
grant execute on function public.alterar_horario_corte(time) to authenticated;

-- ------------------------------------------------------------
-- A JORNADA DE CADA ENCOMENDA — a base das métricas (insights-cotacao)
--
-- Elias, 22/10/2026: "metrificar todo o processo, entendendo quanto tempo
-- leva, onde tem gargalo"; "ligar os dados de cada vendedor: quantidade de
-- peças, quais as mais compradas". Uma linha por encomenda, com cada etapa
-- no tempo:
--   cotada → (pedida ao comprador → respondida) → encomendada →
--   pedido realizado → chegou (conferência) → recebida | cancelada
-- Quem vê: o vendedor, as dele; Compras e Gerência (nível ≥ 3), todas.
-- O custo só para quem vê custo.
-- ------------------------------------------------------------

drop function if exists public.jornada_das_encomendas(timestamptz, timestamptz);
create or replace function public.jornada_das_encomendas(de timestamptz, ate timestamptz)
returns table (
  id uuid, vendedor_id text, nome_do_vendedor text, loja text,
  codigo text, codigo_cotado text, origem text, fornecedor_nome text, marca text,
  quantidade integer, venda numeric, custo numeric, situacao text,
  cotada_em timestamptz, solicitada_em timestamptz, respondida_em timestamptz,
  encomendada_em timestamptz, pedido_em timestamptz, conferencia_em timestamptz,
  recebida_em timestamptz, cancelada_em timestamptz, cancelada_pelo_vendedor boolean,
  transferencia_em timestamptz, entregue_em timestamptz, problema text, desistiu_em timestamptz,
  devolvida_em timestamptz, motivo_devolucao text, frete numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  eu text := public.meu_colaborador_id();
  todos boolean := public.posso_ver_historico_de_todos();
  ve_custo boolean := public.posso_ver_custo();
begin
  if not (public.posso_cotar() or todos) then
    raise exception 'Sem permissão para ver as encomendas' using errcode = '42501';
  end if;
  return query
    select e.id, e.vendedor_id, c.nome, e.loja,
           -- O nome de HOJE do fornecedor: a encomenda antiga guardou "Dpk", a nova "DPK", e o relatório agrupa pelo nome
           e.codigo, e.codigo_cotado, e.origem, coalesce(fb.nome, e.fornecedor_nome), e.marca,
           e.quantidade, e.venda, case when ve_custo then e.custo end, e.situacao,
           e.cotada_em, s.criada_em, s.respondida_em,
           e.criada_em, e.pedido_em, e.conferencia_em,
           e.recebida_em, e.cancelada_em,
           case when e.cancelada_em is null then null else e.cancelada_por is not distinct from e.vendedor_id end,
           e.transferencia_em, e.entregue_em, e.problema, e.desistiu_em,
           e.devolvida_em, e.motivo_devolucao, case when ve_custo then e.frete end
      from public.encomendas e
      left join public.colaboradores c on c.id = e.vendedor_id
      left join public.solicitacoes_cotacao s on s.id = e.solicitacao_id
      left join public.fornecedores_b2b fb on fb.chave = e.fornecedor_chave
     where (todos or e.vendedor_id = eu)
       and e.criada_em >= coalesce(de, '-infinity') and e.criada_em < coalesce(ate, 'infinity')
     order by e.criada_em desc
     limit 5000;
end;
$$;
revoke all on function public.jornada_das_encomendas(timestamptz, timestamptz) from public, anon;
grant execute on function public.jornada_das_encomendas(timestamptz, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- O CARTÃO DA ENCOMENDA NO CHAT ("Pedido realizado", "Em conferência"
-- com o botão Recebi). Como `cotacao_codigo`: só a mensagem da encomenda
-- manda a coluna (nuvemComunicacao.ts) — sem ela, falha só o cartão.
-- ------------------------------------------------------------

alter table public.mensagens
  add column if not exists encomenda_id uuid;

notify pgrst, 'reload schema';

-- Conferência: as funções e a configuração
select 'encomendas' as item, count(*)::text as valor from public.encomendas
union all select 'horario_corte', horario_corte::text from public.config_compras
union all select 'pedido_minimo roles', pedido_minimo::text from public.fornecedores_b2b where chave = 'roles'
union all select 'mensagens.encomenda_id', count(*)::text from information_schema.columns
 where table_schema = 'public' and table_name = 'mensagens' and column_name = 'encomenda_id';
