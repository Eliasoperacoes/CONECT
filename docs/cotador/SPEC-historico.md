# Spec: historico-cotacao

Módulo novo do [MAPA.md](MAPA.md), pedido pelo Elias em 21/10/2026: "se eu
perder a notificação acabo sem ter a opção de visualizar o resultado. Não tem
um painel onde possa ser consultado o armazenado, tanto para o vendedor quanto
para o comprador". É também a base dos insights (quem encomenda mais,
valores), que vêm num módulo próprio depois do `pedidos-compras`.

## Decisões do Elias (21/10/2026)

- **Guardar para sempre**, porque os insights precisam do tempo. O volume é
  pequeno; conferir no `medir-consumo.sql` depois de 1 mês.
- **Quem vê:** o vendedor vê o dele; **Compras e Gerência** (nível ≥ 3) veem
  o de todos.
- **O que entra:** as cotações nos B2Bs, com o preço visto na hora, e as
  solicitações ao comprador, com a resposta.

## A aba "Histórico" (bloco "Cotação de peças")

Para todos que usam o cotador. Cada linha é uma consulta:

| Quando | Peça | Tipo | Resultado | Quem |
|---|---|---|---|---|
| 21/10 14:32 | HG5170 | Pedido ao comprador | Barros R$ 89,90 · 2 dias | Bia · Pirassununga |
| 21/10 14:30 | HG5170 | B2B | Sem estoque nos 3 | Bia · Pirassununga |
| 21/10 10:05 | OC90 | B2B | Roles R$ 16,90 · 2–3 dias (+5 similares) | Bia · Pirassununga |

- **Filtros:** período (hoje, 7 dias, 30 dias, um intervalo), código,
  tipo (B2B / pedido ao comprador), situação (aguardando / respondida / não
  encontrada / sem estoque) e, para quem vê todos, vendedor e loja.
- **Tocar na linha reabre o cartão completo**, com o resultado **como estava
  na hora** e o botão para cotar de novo (preço de hoje).
- **Aguardando o comprador** em destaque no topo, para nada ficar esquecido.
- O custo continua só para quem vê custo.

## A foto do resultado

Hoje o banco guarda o **preço do dia**, sobrescrito a cada cotação. Para o
histórico mostrar o que o vendedor viu, mesmo que a margem ou o frete mudem
depois:

- **Quando a cotação de um código fica pronta para o vendedor**, o banco
  guarda uma foto: o melhor fornecedor, a venda, o custo, o prazo, a situação
  (SP / fora / sem estoque) e quantos similares havia.
- **Quem calcula a foto é o banco**, com a mesma conta do
  `resultado_da_cotacao`, e não a tela: a tela não pode inventar preço.
- **Uma foto por pessoa, código e cotação.** Cotar de novo (Atualizar agora)
  gera uma foto nova; a antiga fica.
- As solicitações ao comprador já ficam guardadas com a resposta. Sai só o
  corte de 7 dias da consulta.

## No banco

- `consultas_cotacao`: quem, quando, código, loja, e a foto (fornecedor,
  venda, custo, prazo, situação, similares). Lida pelas regras acima; o custo
  só por quem vê custo.
- `historico_de_cotacao(filtros)`: devolve as consultas B2B e as solicitações
  numa lista só, já filtrada por quem pode ver o quê.
- `posso_ver_historico_de_todos()`: Compras ou nível ≥ 3, com par em
  `tipos.ts`.

## Estratégia de testes

Todos precisam falhar quando a regra for quebrada de propósito:
1. O vendedor vê só o dele; outro vendedor não; Compras e o Gerente veem todos.
2. O custo da foto e da resposta não chega ao Balcão.
3. A foto guarda o preço da hora: mudar o fator depois não muda a foto.
4. Os filtros (período, código, tipo, situação, vendedor, loja) devolvem o certo.
5. Nada é apagado por idade.

## Limites

- **Sempre:** preço e foto calculados pelo banco; custo só para quem vê custo.
- **Perguntar antes:** apagar histórico, mudar quem vê de todos.
- **Nunca:** commit sem autorização; nada na produção (100% local).

## Critérios de pronto

- [ ] A Bia perde o aviso, abre Histórico e acha a resposta do comprador.
- [ ] O Caio vê todas as solicitações, filtra por vendedor e loja.
- [ ] O Gil vê o histórico de todos, com custo.
- [ ] Reabrir uma consulta de ontem mostra o preço de ontem.
- [ ] Testes passando e mordendo.
