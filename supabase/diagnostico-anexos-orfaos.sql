-- ============================================================
-- DIAGNÓSTICO: ARQUIVOS DE CONVERSA SEM MENSAGEM (14/10/2026)
--
-- Até exclusao-nas-conversas.sql, apagar a própria foto tirava a mensagem
-- e deixava o arquivo no armazenamento. Isto CONTA quantos ficaram
-- órfãos e quanto ocupam. Só leitura: não apaga nada.
-- ============================================================
select
  count(*)                                                         as arquivos_orfaos,
  coalesce(round(sum((metadata->>'size')::bigint) / 1024.0 / 1024.0, 2), 0) as megabytes
from storage.objects o
where o.bucket_id = 'anexos'
  and split_part(o.name, '/', 1) not in ('holerites', 'advertencias', 'central', 'perfil')
  and not exists (select 1 from public.mensagens m where m.anexo_caminho = o.name);
