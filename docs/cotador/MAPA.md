# Mapa de módulos: cotador B2B no CONECTA

Aprovado pelo Elias em 2026-10-19. Intenção confirmada em
`ef/cotador-b2b/docs/intent/cotador-conecta.md`. Cada módulo tem a sua
especificação nesta pasta (`SPEC-<módulo>.md`); este mapa é o índice.

| Módulo | O que faz | Onde mora | Depende de |
|---|---|---|---|
| `banco-cotacao` | Fornecedores (liga/desliga), fila de cotações, preço do dia, histórico; acesso com usuário próprio da estação | CONECTA `supabase/` | — |
| `estacao` | Extensão no PC de compras: escuta a fila, cota com os leitores, grava, informa online e sites logados | `ef/cotador-b2b` | banco-cotacao |
| `precificacao` | Venda = custo + margem **por marca** (Elias, 20/10: não é por grupo); apelidos da marca em cada B2B; margem padrão; arredonda para cima em ,90 | CONECTA `src/servicos/` + tabelas + tela de margens | banco-cotacao |
| `orcamento` | Tela "Cotar": orçamento com peças, resultado por perfil (custo em outra cor), aguardando cotação, Atualizar agora, estado da estação | CONECTA tela + serviço | banco-cotacao, precificacao |
| `pedidos-compras` | Orçamento aprovado → pedido para compras; estados pedido feito / a caminho / chegou | CONECTA tela + serviço + tabela | orcamento |
| `avisos-cotacao` | "Peça X chegou" e mudanças de estado ao vendedor; estação caiu / site deslogado a compras e ao Elias | CONECTA `src/servicos/` (central de notificações e push existentes) | pedidos-compras, estacao |

Ordem: `banco-cotacao` → `estacao` e `precificacao` → `orcamento` →
`pedidos-compras` → `avisos-cotacao`.

**B2B novo:** só o `estacao` conhece os sites. Novo fornecedor = ficha +
leitor + uma linha em `fornecedores_b2b`. Nenhum outro módulo muda.

## Decisões de acesso (aprovadas junto com o mapa)

1. Cotam: setor **Balcão**, setor **Callcenter** e nível **Gerente (3) para cima**.
2. Veem custo: setor **Callcenter**, setor **Compras** e nível **Gerente para cima**. Balcão só a venda.
3. Pedidos: quem recebe e atualiza é o setor **Compras**.
4. O custo nunca chega ao navegador de quem não pode vê-lo: a trava é no banco.
5. Regras da casa (CLAUDE.md do CONECTA): português, testes ao lado, `esquema.sql` + delta.
