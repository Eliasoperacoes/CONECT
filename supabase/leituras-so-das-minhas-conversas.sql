-- ============================================================
-- QUEM LEU CADA MENSAGEM: SÓ PARA QUEM VÊ A MENSAGEM (13/10/2026)
--
-- Laudo de 13/10/2026, item 8. A regra de leitura de `leituras_mensagem`
-- era `using (true)`: qualquer logado via quem leu cada mensagem de toda
-- conversa da rede — quem fala com quem, e quando. E o aplicativo baixa a
-- tabela inteira, então todo aparelho recebia isso, e o tráfego crescia
-- com a rede inteira em vez de com as conversas da pessoa.
--
-- A regra nova não inventa critério: vê a leitura quem pode ver a
-- mensagem. O `exists` sobre `mensagens` passa pela regra que já protege
-- as mensagens (`posso_ler_mensagem`: participante, entrada e saída do
-- grupo, histórico). Uma regra, um lugar.
--
-- A gravação não muda: cada um registra só a própria leitura.
--
-- Pode rodar de novo.
-- ============================================================

drop policy if exists leituras_leitura on public.leituras_mensagem;
create policy leituras_leitura on public.leituras_mensagem
  for select to authenticated
  using (
    exists (select 1 from public.mensagens m where m.id = leituras_mensagem.mensagem_id)
  );

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   regra_aberta ......... false
--   segue_a_mensagem ..... true
-- ============================================================
select
  (select coalesce(qual, '') = 'true' from pg_policies
    where tablename = 'leituras_mensagem' and policyname = 'leituras_leitura')   as regra_aberta,
  (select coalesce(qual, '') like '%mensagens%' from pg_policies
    where tablename = 'leituras_mensagem' and policyname = 'leituras_leitura')   as segue_a_mensagem;
