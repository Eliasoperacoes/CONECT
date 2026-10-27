# Tarefas: pedidos-compras

Especificação: [docs/cotador/SPEC-pedidos-compras.md](../docs/cotador/SPEC-pedidos-compras.md),
aprovada pelo Elias em 21/10/2026 (com os palpites das perguntas em aberto:
Compras cancela com motivo; mínimo sobre o custo; Compras também vê
"Encomendas"). 100% local. Commit só local e só com autorização.

## P1: Banco
- [x] `supabase/cotador-encomendas.sql`: `encomendas`, `pedido_minimo` em `fornecedores_b2b`
  (carga da tabela do Elias), `config_compras.horario_corte`, `mensagens.encomenda_id`, realtime.
- [x] Funções: `encomendar` (B2B, custo do banco), `encomendar_resposta` (do comprador),
  `cancelar_encomenda` (vendedor até o corte; Compras com motivo), `marcar_pedido_realizado`,
  `marcar_em_conferencia`, `confirmar_recebimento`, `minhas_encomendas`, `encomendas_de_compras`,
  `alterar_pedido_minimo`, `alterar_horario_corte`, `prazo_de_cancelamento`.
- Verificação: `encomendasNoBanco.test.ts` mordendo (quem, custo, corte, ordem das situações).
  Aplicar no Docker.

## P2: Serviço `encomendas.ts`
- [x] Colunas por fornecedor com a conta do mínimo (verde/vermelho/neutro), mensagens do chat
  (sem custo e sem observação), chamadas ao banco, ouvir em tempo real.
- Verificação: `encomendas.test.ts` mordendo.

## P3: Vendedor
- [x] "Encomendar" no cartão (peça, similares, resposta do comprador) + `JanelaEncomendar`.
- [x] Aba "Encomendas": situação, Cancelar até o corte, Recebi.
- [x] Cartão da encomenda no chat com o botão Recebi.

## P4: Compras
- [x] Aba "Pedidos": Montar pedidos (colunas), Aguardando chegada, Em conferência, Configurações.
- [x] Mensagens automáticas no chat ao marcar pedido realizado / em conferência / cancelar.

### Checkpoint com o Elias
- [ ] Os critérios de pronto da especificação no local (Bia e Caio), computador e celular.
