-- ============================================================
-- DIAGNÓSTICO: José Eduardo não consegue bater na própria loja (01/10/2026)
--
-- Só leitura. A mensagem "Use o QR afixado na sua loja" vem de
-- `bater_ponto`: o código lido não bate com o código ATUAL da loja. Esta
-- consulta mostra, numa linha só (o editor mostra só o último resultado):
--   - a ficha dele: loja, se está ativo e se tem login ligado;
--   - o código atual da loja dele, quando e por quem foi trocado;
--   - se ele e a loja dele bateram hoje — se a loja bateu e ele não, o
--     problema é dele; se ninguém da loja bateu, é o cartaz.
-- ============================================================

select c.nome,
       c.loja,
       c.ativo,
       c.auth_user_id is not null as tem_login,
       k.codigo as codigo_atual_da_loja,
       to_char(k.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as codigo_trocado_em,
       k.atualizado_por_nome as trocado_por,
       (select count(*) from public.registros_ponto r
         where r.colaborador_id = c.id
           and r.data = (now() at time zone 'America/Sao_Paulo')::date) as batidas_dele_hoje,
       (select count(*) from public.registros_ponto r
         where r.loja = c.loja and r.metodo in ('qrcode', 'codigo_manual')
           and r.data = (now() at time zone 'America/Sao_Paulo')::date) as batidas_da_loja_hoje,
       (select string_agg(loja, ', ' order by loja) from public.codigos_ponto_loja) as lojas_com_codigo
from public.colaboradores c
left join public.codigos_ponto_loja k on k.loja = c.loja
where c.nome ilike '%jos%eduardo%';
