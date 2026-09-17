-- ============================================================
-- CONECTA — FOLGA DE SÁBADO NA LISTA DE TIPOS DO BANCO
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--
-- O QUE ESTAVA ERRADO
--
-- A tabela `justificativas_ausencia` nasceu com a lista de tipos fechada:
--
--   check (tipo in ('atestado','falta_justificada','comparecimento','outro'))
--
-- A folga de sábado entrou no aplicativo depois, e o banco recusou:
-- "violates check constraint justificativas_ausencia_tipo_check".
--
-- Lista fechada em dois lugares — o tipo no código e o `check` aqui — é a
-- mesma armadilha que já mordeu este sistema com os setores e com a função
-- de primeiro acesso. Agora há teste comparando as duas listas.
-- ============================================================

alter table public.justificativas_ausencia
  drop constraint if exists justificativas_ausencia_tipo_check;

alter table public.justificativas_ausencia
  add constraint justificativas_ausencia_tipo_check
  check (
    tipo in (
      'atestado',
      'falta_justificada',
      'comparecimento',
      'folga_sabado',
      'outro'
    )
  );

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — aceita_folga_sabado tem que ser true
-- ============================================================
select
  exists (
    select 1
      from pg_constraint
     where conname = 'justificativas_ausencia_tipo_check'
       and pg_get_constraintdef(oid) ilike '%folga_sabado%'
  ) as aceita_folga_sabado,
  (
    select pg_get_constraintdef(oid)
      from pg_constraint
     where conname = 'justificativas_ausencia_tipo_check'
  ) as regra_em_vigor;
