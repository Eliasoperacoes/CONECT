-- ============================================================
-- A BATIDA PASSOU PELO SERVIDOR? (01/10/2026)
--
-- Só leitura. Depois de `ponto-pelo-servidor.sql`, toda batida da própria
-- pessoa entra por `bater_ponto`, que carimba a hora com o relógio do
-- banco. Dá para ver na linha:
--
--   pelo servidor ... id = 'ponto-' + 32 caracteres hexadecimais, e o
--                     horário IGUAL ao instante da gravação (o mesmo now())
--   pelo aparelho ... id com o relógio do aparelho ('ponto-1759...-abc12'),
--                     e o horário diferente da gravação
--
-- Se aparecer alguém "pelo aparelho" hoje, o sistema dela estava aberto
-- na versão antiga — e o banco, que já recusa esse caminho, não deveria
-- ter aceitado. É o caso a investigar.
-- ============================================================

select c.nome,
       r.tipo,
       r.hora_formatada,
       r.metodo,
       case
         when r.id ~ '^ponto-[0-9a-f]{32}$' and r.horario = r.criado_em then 'pelo servidor'
         when r.metodo in ('qrcode', 'codigo_manual') then 'PELO APARELHO'
         else 'correção (' || r.metodo || ')'
       end as caminho,
       to_char(r.criado_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as gravada_em
from public.registros_ponto r
join public.colaboradores c on c.id = r.colaborador_id
where r.data = (now() at time zone 'America/Sao_Paulo')::date
  and r.criado_em >= now() - interval '6 hours'
order by r.criado_em desc;
