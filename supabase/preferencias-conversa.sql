-- ============================================================
-- CONECTA — FIXAR E OCULTAR CONVERSA VALEM EM TODOS OS APARELHOS
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--
-- ANTES: fixar e ocultar ficavam guardados no navegador. Fixar no
-- computador não refletia no celular, e ocultar no celular deixava a
-- conversa lá no computador. Eram duas listas com preferências diferentes
-- para a mesma pessoa.
--
-- AGORA vivem em `participantes`, que já é a linha "esta pessoa nesta
-- conversa" — o lugar exato de uma preferência de cada um sobre cada
-- conversa. Ninguém vê a do outro.
--
-- OCULTAR CONTINUA NÃO SENDO APAGAR. Guardamos o INSTANTE em que a pessoa
-- ocultou, não um sim/não: mensagem posterior a ele traz a conversa de
-- volta. Sem isso, alguém seria chamado numa conversa invisível e nunca
-- saberia. As mensagens seguem no banco; quem apaga é a limpeza dos 3 meses.
-- ============================================================

alter table public.participantes
  add column if not exists fixada        boolean not null default false,
  add column if not exists oculta_desde  timestamptz;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — as duas colunas têm que vir true
-- ============================================================
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'participantes'
       and column_name = 'fixada'
  ) as coluna_fixada,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'participantes'
       and column_name = 'oculta_desde'
  ) as coluna_oculta_desde;
