-- ============================================================
-- CONECTA — O RECADO DO CHAT LEVA A PUBLICAÇÃO JUNTO
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Uma coluna em `mensagens`: qual publicação da Central aquele recado
-- anuncia.
--
-- POR QUE ELA PRECISA EXISTIR
--
-- Quando alguém publica um comunicado, o grupo de avisos recebe um
-- recado curto — o que é, de quem, de que categoria — com um botão que
-- abre a publicação inteira.
--
-- Sem o id, o botão só conseguiria levar à Central e deixar a pessoa
-- procurar qual das publicações era. Com dez avisos numa semana, isso
-- é procurar, e um botão que obriga a procurar não é um atalho.
--
-- `on delete set null`: publicação apagada não apaga a mensagem. O
-- recado vira texto comum, o botão some, e o histórico da conversa
-- continua inteiro — mensagem sumindo do meio de uma conversa é o tipo
-- de coisa que faz as pessoas desconfiarem do sistema.
-- ============================================================

alter table public.mensagens
  add column if not exists publicacao_id text
    references public.avisos_rede(id) on delete set null;

-- O chat carrega as mensagens da conversa e precisa do botão já pronto
create index if not exists mensagens_por_publicacao
  on public.mensagens (publicacao_id)
  where publicacao_id is not null;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- coluna_existe .......... true
-- indice_existe .......... true
-- apagar_nao_apaga ....... SET NULL   (e não CASCADE)
-- ============================================================
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mensagens'
       and column_name = 'publicacao_id'
  ) as coluna_existe,

  exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'mensagens_por_publicacao'
  ) as indice_existe,

  coalesce((
    select case c.confdeltype
             when 'n' then 'SET NULL'
             when 'c' then 'CASCADE (ERRADO — apagaria a mensagem)'
             when 'a' then 'NO ACTION'
             else c.confdeltype::text
           end
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.conrelid = 'public.mensagens'::regclass
       and c.contype = 'f'
       and a.attname = 'publicacao_id'
     limit 1
  ), '(sem vínculo)') as apagar_nao_apaga;
