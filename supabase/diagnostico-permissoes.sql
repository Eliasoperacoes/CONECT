-- ============================================================
-- DIAGNÓSTICO: AS PERMISSÕES DE FERRAMENTA EM PRODUÇÃO (14/10/2026)
--
-- Para os manuais de líderes/gerentes e do RH: quais níveis enxergam
-- cada ferramenta, como está gravado no painel ADM › Permissões. Vazio
-- (null) quer dizer "o padrão do catálogo" (src/servicos/ferramentas.ts).
--
-- Só leitura. Não mexe em nada, e não traz dado de pessoa.
-- ============================================================
select
  chave       as ferramenta,
  niveis      as niveis_que_enxergam
from public.configuracoes c,
     lateral jsonb_each(coalesce(c.permissoes_ferramentas::jsonb, '{}'::jsonb)) as p(chave, niveis)
order by chave;
