-- ============================================================
-- CONFERIR as duas funções de nível que estavam duplicadas no esquema
-- (02/10/2026). Só leitura: não muda nada.
--
-- O esperado:
--   sou_admin         ...meu_nivel() >= 5
--   cuido_de_pessoas  ...meu_nivel() >= 4 or public.meu_setor() = 'RH'
--
-- Se aparecer "= 4" em qualquer uma, a versão do modelo antigo está no ar.
-- ============================================================
select
  p.proname as funcao,
  regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g') as definicao_no_ar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('sou_admin', 'cuido_de_pessoas')
order by 1;
