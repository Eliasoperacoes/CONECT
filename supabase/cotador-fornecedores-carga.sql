-- ============================================================
-- COTADOR — OS B2Bs NOVOS (tabela do Elias, 21/10/2026:
-- docs/cotador/fretes-fornecedores.json)
-- ============================================================
-- AINDA NÃO RODAR NA PRODUÇÃO: sobe junto com o resto do cotador.
-- Depende de cotador-banco.sql e cotador-encomendas.sql.
-- Pode ser executado mais de uma vez: quem já existe não é tocado (o que
-- Compras ajustou em Fretes e no pedido mínimo não volta ao valor daqui).
--
-- TODOS ENTRAM DESLIGADOS (ativo = false). B2B novo = ficha + leitor + esta
-- linha (MAPA.md); a estação só cota quem está ligado. Cada um é ligado
-- quando o leitor dele for validado pelo Elias:
--   update public.fornecedores_b2b set ativo = true where chave = '<chave>';
--
-- Frete por peça (regra do Elias, 21/10/2026): R$ 10 para quem não dá frete
-- grátis; 0 para quem dá. Sky Peças dá grátis só acima de R$ 500: entra com
-- R$ 10 (o caso comum de uma ou duas peças) — Compras ajusta em Fretes.
-- Prazo: 2 dias Pirassununga, 3 as outras lojas (o padrão da casa).
-- ============================================================

insert into public.fornecedores_b2b (chave, nome, ativo, ordem, frete_por_peca, pedido_minimo, frete_atualizado_em, pedido_minimo_atualizado_em) values
  ('barros',  'Barros',     false, 4,  0,  0,   now(), now()),
  ('disape',  'Disape',     false, 5,  10, 150, now(), now()),
  ('furacao', 'Furacão',    false, 6,  0,  200, now(), now()),
  ('haifer',  'Haifer',     false, 7,  10, 250, now(), now()),
  ('lucios',  'Lucios',     false, 8,  10, 0,   now(), now()),
  ('rolemar', 'Rolemar',    false, 9,  10, 600, now(), now()),
  ('sky',     'Sky Peças',  false, 10, 10, 500, now(), now()),
  -- CHG Automotiva: acessórios e eletrônicos (Elias, 23/10/2026): frete R$ 4
  -- por peça, prazo 2–3 dias, pedido mínimo R$ 1.500
  ('chg',     'CHG Automotiva', false, 11, 4, 1500, now(), now()),
  -- Universal Automotive (Elias, 23/10/2026): frete R$ 2,50 por peça, prazo
  -- 5 dias, um estoque só, pedido mínimo R$ 1.500
  ('universal', 'Universal Automotive', false, 12, 2.5, 1500, now(), now()),
  -- RMP (Elias, 24/10/2026): o padrão da casa (frete R$ 10 por peça, prazo
  -- 2–3 dias); pedido mínimo a definir: Compras ajusta em Fretes
  ('rmp',     'Real',       false, 13, 10, 0,   now(), now())
on conflict (chave) do nothing;

notify pgrst, 'reload schema';

-- Conferência: os 13, quem está ligado, frete e pedido mínimo
select chave, nome, ativo, frete_por_peca, pedido_minimo, lojas_entrega_direta
  from public.fornecedores_b2b order by ordem;
