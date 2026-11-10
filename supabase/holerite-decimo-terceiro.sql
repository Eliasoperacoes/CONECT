-- ============================================================
-- HOLERITE DO 13º SALÁRIO — o terceiro documento do mês (10/11/2026)
--
-- Em novembro (e em dezembro) a rede recebe três documentos: adiantamento,
-- folha e 13º. O banco só aceitava os dois primeiros tipos. A regra de um
-- documento por pessoa, mês e tipo continua: reenviar o 13º substitui só o
-- 13º, sem tocar no adiantamento nem na folha.
--
-- A trava antiga é procurada pelo conteúdo, e não pelo nome: ela nasceu sem
-- nome escrito, e um nome errado deixaria a antiga recusando o 13º.
--
-- Não mexe em nenhum holerite publicado. Pode rodar mais de uma vez.
-- ============================================================
do $$
declare
  trava record;
begin
  for trava in
    select conname
      from pg_constraint
     where conrelid = 'public.holerites'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.holerites drop constraint %I', trava.conname);
  end loop;
end
$$;

alter table public.holerites
  add constraint holerites_tipo_check
  check (tipo in ('folha', 'adiantamento', 'decimo_terceiro'));

notify pgrst, 'reload schema';

-- CONFERÊNCIA: uma trava só, com os três tipos, e os documentos de cada tipo
-- (os números de antes não mudam).
select
  (select count(*)
     from pg_constraint
    where conrelid = 'public.holerites'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%') as travas_de_tipo_1,
  (select count(*)
     from pg_constraint
    where conrelid = 'public.holerites'::regclass
      and conname = 'holerites_tipo_check'
      and pg_get_constraintdef(oid) ilike '%decimo_terceiro%') as aceita_13_1,
  (select count(*) filter (where tipo = 'adiantamento') from public.holerites) as adiantamentos,
  (select count(*) filter (where tipo = 'folha') from public.holerites) as folhas,
  (select count(*) filter (where tipo = 'decimo_terceiro') from public.holerites) as decimos_terceiros;
