-- ============================================================
-- CONECTA — POR QUE A PUBLICAÇÃO NÃO SAI
--
-- NÃO ALTERA NADA. Só responde.
--
-- Publicar na Central falhou. São três causas possíveis, e cada uma tem
-- um conserto diferente:
--
--   1. As colunas novas não existem — `central-da-direcao.sql` não foi
--      rodado. O banco recusa a linha inteira por causa de `tipo`.
--   2. A política de INSERT recusa quem está publicando.
--   3. A pessoa não tem o nível que a política exige.
--
-- Uma consulta só, de propósito: o SQL Editor mostra apenas o resultado
-- da última, e conferência em vários `select` entrega resposta
-- invisível.
-- ============================================================

select
  -- 1. AS COLUNAS. Tem que ser 6.
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'avisos_rede'
      and column_name in
        ('tipo','categoria','destinos','anexo_caminho','anexo_nome','exige_confirmacao')
  ) as colunas_novas_de_6,

  -- 2. A POLÍTICA DE INSERT, como o banco a guardou
  coalesce((
    select string_agg(policyname || ': ' || coalesce(with_check, qual), ' | ')
      from pg_policies
     where schemaname = 'public' and tablename = 'avisos_rede' and cmd = 'INSERT'
  ), '(NENHUMA — ninguém publica)') as regra_de_publicacao,

  -- 3. QUEM SOU EU para o banco, agora
  coalesce((select nome  from public.colaboradores where auth_user_id = auth.uid()), '(sem ficha)') as eu,
  coalesce((select nivel from public.colaboradores where auth_user_id = auth.uid()), 0)             as meu_nivel,

  -- 4. A RESPOSTA DIRETA: o banco me deixa publicar?
  (select coalesce(nivel, 0) >= 4 from public.colaboradores where auth_user_id = auth.uid())
    as passo_na_regra_de_nivel,

  -- 5. Quantas publicações já existem, e quantas são das novas
  (select count(*) from public.avisos_rede)                      as publicacoes,
  (select count(*) from public.avisos_rede where tipo is not null) as ja_com_tipo;
