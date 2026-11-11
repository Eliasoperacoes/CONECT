-- ============================================================
-- COTADOR — A VESPOR PRO (Elias, 11/11/2026)
-- ============================================================
-- RODAR ANTES de a estação receber a extensão 1.1.1: o gravar_cotacao
-- recusa a cotação inteira quando chega um fornecedor que o banco não
-- conhece ("Fornecedor desconhecido").
--
-- Entra ligada: o leitor foi conferido pelo Elias no painel da extensão
-- ("Vespor ok", 11/11/2026). Frete grátis, pedido mínimo R$ 2.000, entrega
-- só em Pirassununga (as outras lojas recebem por transferência).
-- Pode ser executado mais de uma vez: quem já existe não é tocado (o que
-- Compras ajustou em Fretes e no pedido mínimo não volta ao valor daqui).
-- ============================================================

insert into public.fornecedores_b2b
  (chave, nome, ativo, ordem, frete_por_peca, pedido_minimo, lojas_entrega_direta, frete_atualizado_em, pedido_minimo_atualizado_em)
values
  ('vespor', 'Vespor Pro', true, 14, 0, 2000, '{Pirassununga}', now(), now())
on conflict (chave) do nothing;

notify pgrst, 'reload schema';

-- Conferência: a Vespor ligada, frete 0, mínimo 2000, só Pirassununga
select chave, nome, ativo, frete_por_peca, pedido_minimo, lojas_entrega_direta
  from public.fornecedores_b2b where chave = 'vespor';
