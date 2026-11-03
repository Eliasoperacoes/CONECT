-- ============================================================
-- HOLERITES POR MÊS E DIA — o que cada carga fez
--
-- Só leitura, só contagens: nenhum nome, nenhum valor. Uma linha por mês
-- e dia de publicação.
--
-- Até 03/11/2026 o sistema guardava um holerite por pessoa e mês. Publicar
-- o segundo documento do mês era recusado para quem já tinha assinado o
-- primeiro e, para quem não tinha, SOBRESCREVIA o arquivo. O arquivo
-- trocado aparece aqui por ser mais novo que a linha: o reenvio não muda
-- `criado_em`.
--
-- assinado_antes_da_troca precisa sair 0: o documento assinado não muda.
-- ============================================================
with documentos as (
  select h.competencia, h.criado_em, r.assinado_em, o.updated_at as arquivo_em
    from public.holerites h
    left join public.recebimentos_holerite r on r.holerite_id = h.id
    left join storage.objects o on o.bucket_id = 'anexos' and o.name = h.arquivo_caminho
)
select
  d.competencia,
  to_char(d.criado_em at time zone 'America/Sao_Paulo', 'DD/MM') as publicado_no_dia,
  count(*) as publicados,
  count(d.assinado_em) as assinados,
  count(*) filter (where d.assinado_em is null) as sem_assinar,
  count(*) filter (where d.arquivo_em > d.criado_em + interval '1 minute') as arquivo_trocado,
  count(*) filter (where d.arquivo_em is null) as sem_arquivo,
  count(*) filter (where d.assinado_em < d.arquivo_em - interval '1 minute') as assinado_antes_da_troca,
  to_char(min(d.criado_em) at time zone 'America/Sao_Paulo', 'HH24:MI') as primeira_hora,
  to_char(max(d.criado_em) at time zone 'America/Sao_Paulo', 'HH24:MI') as ultima_hora,
  to_char(max(d.arquivo_em) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultimo_arquivo
from documentos d
group by 1, 2
order by 1 desc, 2;
