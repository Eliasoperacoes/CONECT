# Spec: insights-cotacao (Relatórios)

Módulo do [MAPA.md](MAPA.md), depois de `pedidos-compras`. Construído em
22/10/2026, a partir do pedido do Elias:

> "Precisaremos metrificar todo o processo, entendendo quanto tempo leva,
> onde tem gargalo. Ligar os dados de cada vendedor para mapear a quantidade
> de peças, quais as peças mais compradas, tendo insights inteligentes para
> complementar as tarefas da empresa." — "Tudo está registrado em HOJE, porém
> se eu precisar tirar um relatório ou ver insights, não existe."

## Objetivo

Uma aba **Relatórios** no bloco "Cotação de peças", para **Compras e
Gerência** (nível ≥ 3), que responde por período:

1. **Onde está o gargalo?** O tempo de cada etapa, da cotação à entrega.
2. **Quem vende, e quanto?** Cada vendedor: cotações, encomendas, peças,
   valor, conversão, cancelamentos, tempo de retirada.
3. **O que sai mais?** As peças mais encomendadas, com o alerta de "candidata
   a estoque".
4. **O que escapa?** A peça procurada que não virou encomenda, porque o B2B
   não tinha, o comprador não achou ou o cliente desistiu.
5. **Quem entrega bem?** Fornecedores: valor, custo, prazo real do pedido à
   chegada, cancelamentos.
6. **E agora?** Os insights escritos ("O que os números dizem"), cada um com o
   botão que leva à tela para agir.

Tudo exporta para **Excel**: uma aba por tabela e a jornada de cada
encomenda, com as horas de cada etapa.

## O caminho que é medido

Cada encomenda guarda de onde nasceu (`cotador-encomendas.sql`) e cada etapa
no tempo:

| Etapa | De → até | Quem |
|---|---|---|
| Decisão | cotada → encomendada (ou resposta do comprador → encomendada) | vendedor com o cliente (não conta como gargalo) |
| Resposta do comprador | pedida ao comprador → respondida | Compras |
| Espera pelo pedido | encomendada → pedido realizado | Compras |
| Entrega do fornecedor | pedido → chegou (conferência) | fornecedor |
| Retirada | chegou → "Recebi" | vendedor |

Para cada etapa: **mediana** (o caso típico, sem se deixar levar por um caso
estranho), **"9 em 10 levam até"** (percentil 90) e quantas estão **paradas
agora**: encomendada há mais de 1 dia, pedida há mais de 5 dias, chegou há
mais de 2 dias.

**Gargalo** = a etapa operacional com a maior mediana.

## A tela (de cima para baixo: do que pede ação ao detalhe)

1. **Período:** Hoje · 7 dias · 30 dias · Este mês · Mês passado · Datas.
   **Filtros:** loja, vendedor, fornecedor. Botão **Exportar Excel**.
2. **Números:** cotações, encomendas (peças, canceladas), valor encomendado,
   margem bruta (só quem vê custo), conversão, da cotação à entrega, pedidos
   ao comprador, gargalo.
3. **O que os números dizem:** os 6 primeiros insights e "ver todos":
   - gargalo;
   - peças paradas sem retirada;
   - encomendas esperando pedido;
   - candidatas a estoque (encomendada 3+ vezes);
   - procurada e nunca encomendada;
   - fornecedor lento (50% acima da média);
   - cancelamentos acima de 15%;
   - tempo de resposta do comprador;
   - vendedor que se destaca na conversão (só 20% ou mais acima da média).
4. **O caminho das peças:** o funil cotadas → encomendadas → pedidas →
   chegaram → entregues, com quanto segue de um passo para o outro.
5. **Quanto tempo leva cada etapa:** barras com a mediana, traço no
   "9 em 10", o gargalo em vermelho, selo das paradas.
6. **Tabelas** (ordenáveis tocando no título da coluna; no celular rolam de
   lado com a 1ª coluna presa): vendedores, peças mais encomendadas,
   procuradas e não encomendadas, fornecedores, lojas.
7. **Linha do tempo do período** (não só de hoje), com "mostrar mais".

O **Painel** de Compras continua sendo o "agora"; ganhou o link **Relatório
completo**.

## No banco (`cotador-relatorios.sql`)

- `cotacoes_do_periodo(de, ate)`: uma linha por vendedor, peça e dia, com
  quantas vezes cotou e o resultado da última.
- `solicitacoes_do_periodo(de, ate)`: os pedidos ao comprador, com tempo de
  resposta e quantas opções.
- `jornada_das_encomendas(de, ate)` (em `cotador-encomendas.sql`).
- Quem lê: Compras e Gerência (`posso_ver_historico_de_todos`). O custo só
  para quem vê custo.

## Definições

- **Cotação** = um vendedor cotou uma peça num dia. Cotar a mesma peça 3
  vezes no mesmo dia conta 1.
- **Conversão** = das cotações, as que viraram encomenda do mesmo vendedor,
  da mesma peça, no mesmo dia.
- **Valor** = venda × quantidade das encomendas não canceladas.
  **Margem bruta** = valor − custo × quantidade.
- Com **filtro de fornecedor**, as contas de cotação saem: a cotação não tem
  fornecedor escolhido.

## Testes

- `relatoriosNoBanco.test.ts`: as funções do período e quem lê.
- `relatorios.test.ts`:
  - período em Brasília;
  - tempos e gargalo;
  - conversão;
  - ranking;
  - candidata a estoque;
  - demanda;
  - paradas;
  - filtros;
  - planilha sem custo para quem não vê custo.
- Todos mordem.

## Próximos passos possíveis

- **Comparar com o período anterior** (setas ↑↓ nos números).
- **"Meus números" para o vendedor:** as dele, sem ver os colegas.
- **Relatório agendado** no e-mail ou chat da gerência toda segunda.
- **Ligar com o estoque/ERP** para confirmar a "candidata a estoque".
