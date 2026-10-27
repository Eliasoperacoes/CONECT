# Mapa de módulos: cotador B2B no CONECTA

Aprovado pelo Elias em 2026-10-19 e corrigido em 2026-10-20. Intenção
confirmada em `ef/cotador-b2b/docs/intent/cotador-conecta.md`. Cada módulo
tem a sua especificação nesta pasta (`SPEC-<módulo>.md`); este mapa é o índice.

| Módulo | O que faz | Onde mora | Depende de |
|---|---|---|---|
| `banco-cotacao` ✅ | Fornecedores (liga/desliga), fila de cotações, preço do dia, histórico | CONECTA `supabase/` | — |
| `estacao` ✅ | O CONECTA aberto no PC de compras, logado por Compras, com a extensão: escuta a fila, cota com os leitores, grava, informa se está no ar e quais sites estão logados. Sem login próprio (Elias, 19/10) | `ef/cotador-b2b` + CONECTA | banco-cotacao |
| `precificacao` ✅ | Venda = custo × fator **da marca** (Elias, 20/10: não é por grupo); apelidos da marca em cada B2B; fator padrão 1,80; arredonda para cima em ,90; tela de margens | CONECTA `supabase/` + tela | banco-cotacao |
| `cotar` | Tela "Cotar" (computador e celular): códigos, andamento ao vivo, venda (custo em outra cor para quem vê), similares, prazo, Atualizar agora, estação fora do ar, "Minhas cotações do dia". **Sem orçamento e sem dados do cliente** (Elias, 20/10). Era `orcamento` | CONECTA tela + serviço | banco-cotacao, precificacao |
| `cotacao-humana` | Quando o B2B não tem a peça ou o cliente não quer o similar: "Pedir ao comprador" (código, veículo, observação); Compras responde fornecedor, preço e prazo; avisos "Nova solicitação de cotação" e "Cotação respondida" (Elias, 21/10) | CONECTA tela + serviço + tabelas | cotar |
| `historico-cotacao` | Aba "Histórico": tudo o que foi cotado (B2B, com a foto do preço da hora) e pedido ao comprador, guardado para sempre; o vendedor vê o dele, Compras e Gerência veem todos; filtros (Elias, 21/10) | CONECTA tela + serviço + tabela | cotar, cotacao-humana |
| `pedidos-compras` ✅ (local) | "Encomendar" na cotação (peça ou similar, qualquer fornecedor, quantidade, observação, confirmação; cancela até o corte). Painel de Compras: colunas por fornecedor com custo × pedido mínimo (verde/vermelho), pedido realizado, em conferência; o vendedor confirma "Recebi" pelo chat (Elias, 21/10) | CONECTA tela + serviço + tabela | cotar, cotacao-humana |
| `insights-cotacao` ✅ (local) | Quem cota e encomenda mais, valores, peças mais pedidas, tempo de resposta do comprador (Elias, 21/10); o tempo de cada etapa da encomenda e onde está o gargalo, a partir de `jornada_das_encomendas` (Elias, 22/10) | CONECTA tela + consultas | historico-cotacao, pedidos-compras |
| `avisos-cotacao` | "Peça X chegou" e mudanças de estado ao vendedor; estação caiu / site deslogado a compras e ao Elias | CONECTA `src/servicos/` (central de notificações e push existentes) | pedidos-compras, estacao |

Ordem: `banco-cotacao` → `estacao` e `precificacao` → `cotar` →
`cotacao-humana` → `historico-cotacao` → `pedidos-compras` →
`insights-cotacao` e `avisos-cotacao`.

Tudo é construído **100% no local** (pasta `CONECTA-cotador`, ramo `cotador`)
e sobe para a produção de uma vez, quando a estrutura completa estiver pronta
(Elias, 20/10).

**B2B novo:** só o `estacao` conhece os sites. Novo fornecedor = ficha +
leitor + uma linha em `fornecedores_b2b`. Nenhum outro módulo muda. A linha
leva também o **frete por peça** (R$ 10 para quem não dá frete grátis; 0 para
quem dá; Compras ajusta depois na ferramenta "Fretes") e as **lojas com
entrega direta** (prazo 2–3 dias; padrão: só Pirassununga). A tabela de
fretes, prazos e pedido mínimo dos fornecedores, enviada pelo Elias em
21/10/2026, está em [fretes-fornecedores.json](fretes-fornecedores.json);
quem ali é do WhatsApp fica de fora até virar B2B.

## Decisões de acesso (aprovadas junto com o mapa)

1. Cotam: setor **Balcão**, setor **Callcenter** e nível **Gerente (3) para cima**.
2. Veem custo: setor **Callcenter**, setor **Compras** e nível **Gerente para cima**. Balcão só a venda.
3. Pedidos: quem recebe e atualiza é o setor **Compras**.
4. O custo nunca chega ao navegador de quem não pode vê-lo: a trava é no banco.
5. Regras da casa (CLAUDE.md do CONECTA): português, testes ao lado, `esquema.sql` + delta.
