-- ============================================================
-- LÍDERES PUBLICAM NA CENTRAL
--
-- Pedido do Elias: "líderes também poderão publicar avisos, conteúdos".
--
-- A tela e a regra (`publicaComunicado`, tipos.ts) já diziam "do líder
-- de setor para cima" (nível 2). O banco ainda exigia nível 4 (Diretoria
-- e TI), desde a migração dos cinco níveis: o líder via o botão, montava
-- a publicação e era recusado no fim.
--
-- Editar continua com o autor ou quem administra (`podeEditarPublicacao`),
-- e remover segue como estava. Só a inserção muda.
-- ============================================================

drop policy if exists avisos_insercao on public.avisos_rede;
create policy avisos_insercao on public.avisos_rede
  for insert to authenticated with check (public.meu_nivel() >= 2);

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "(meu_nivel() >= 2)"
select policyname, cmd, with_check
  from pg_policies
 where tablename = 'avisos_rede' and policyname = 'avisos_insercao';
