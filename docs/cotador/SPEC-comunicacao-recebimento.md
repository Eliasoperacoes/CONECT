# SPEC — Comunicação das encomendas e recebimento

Elias, 26/10/2026: "antes de irmos para produção falta a organização da
comunicação, as mensagens nos chats, e a finalização (o recebimento da
peça)". Todos os pontos levantados foram aceitos; tudo entra **antes da
produção**.

## Objetivo

Toda encomenda chega até o cliente sem se perder: cada passo avisa quem
precisa saber (chat **e** notificação no celular), nada fica parado sem
alguém ver, e cada problema tem um caminho que não seja "cancelar".

## O caminho da encomenda (novo)

```
encomendada ──"Pedido realizado"──▶ pedido_realizado
     │                                   │ "Chegou" (em Pirassununga)
     │                                   ▼
     │                    loja = Pirassununga? ── não ──▶ em_transferencia ──"Chegou na loja"──┐
     │                                   │ sim                                                  │
     │                                   ▼                                                      │
     │                            em_conferencia ◀─────────────────────────────────────────────┘
     │                                   │ "Recebi" (vendedor; depois de 1 dia, o Gerente da loja)
     │                                   ▼
     │                               recebida ──"Entregue ao cliente"──▶ entregue
     │
     ├── cancelada (vendedor antes do corte; Compras com motivo)
     └── qualquer passo depois do pedido: "Problema" (errada/faltou/avariada/preço) · "Cliente desistiu"
```

## Decisões (Elias, 26/10/2026)

| # | Decisão |
|---|---|
| Mínimo | É só métrica visual para o comprador. O "Pedido realizado" já não depende do mínimo (conferido em TelaPedidos.tsx) — continua assim. |
| Validade | O preço vale **24 h** depois da cotação. Encomendar com cotação mais velha pede cotar de novo; no "Pedido realizado", a encomenda com cotação vencida aparece marcada. |
| Corte | Encomenda depois do horário de corte entra no pedido do dia seguinte — a janela de encomendar avisa antes de confirmar. |
| Cliente | O aviso de **em conferência** leva a observação que o vendedor digitou (cliente/telefone), para ele avisar o cliente. Decisão do Elias, revogando a regra antiga "nunca a observação no chat". Os demais avisos continuam sem ela, e nenhum leva custo. |
| Margem | Controlada pelo ERP e pelos relatórios daqui; sem alerta novo. |
| Filiais | Normalmente tudo chega em Pirassununga e é redistribuído: encomenda de outra loja passa por **em transferência**. Quem marca "Chegou na loja" é o **comprador**. |
| Notificação | "De extrema importância": todo passo avisa no chat **e** no celular (FCM), inclusive com o app fechado. |
| Tempos | Lembrete do "Recebi": 4 h · Gerente da loja pode confirmar: 1 dia · recebida e não entregue: 7 dias · parada sem pedido: 3 dias (alerta só para Compras). |

## O que muda

1. **O aviso nasce no banco.** A mudança de situação e a mensagem são uma
   coisa só (mesma transação). Hoje a tela do comprador manda uma por uma e
   pode parar no meio sem ninguém saber.
2. **Uma conversa por vendedor com Compras** ("Compras · nome"): o vendedor,
   todo o pessoal de Compras e quem fez o passo. Tudo vai por ela, nos dois
   sentidos: a cotação pedida e a resposta, e cada passo da encomenda —
   inclusive os do vendedor (encomendou, cancelou, Recebi, Entregue, problema,
   desistência). Chat, celular e Windows saem pelo caminho de qualquer
   mensagem; o recado avisa no Windows mesmo com o CONECTA à vista.
3. **Uma mensagem por vendedor e por passo.** Oito peças no mesmo pedido = um
   recado com as oito, cada uma com o seu "Recebi" e um "Recebi tudo".
4. **Previsão no aviso de pedido realizado** ("até qui, 30/10"), pelo prazo
   já gravado; passou do prazo, alerta para Compras.
5. **Lembretes por horário** (a função agendada que já lembra pendências do
   ponto): "Recebi" esquecido, recebida não entregue, encomenda parada.
6. **Problema na conferência** e **Cliente desistiu**: avisam Compras e o
   vendedor; a encomenda fica marcada até alguém resolver.
7. **Entregue ao cliente**: o fim de verdade do caminho, e o tempo total nos
   relatórios.
8. **Painel de Compras**: os alertas novos entram no "Precisa de você".

## Já feito nesta rodada

- Na tela de cotar, só as solicitações de quem cota (Compras via todas como
  "aguardando comprador") — `soAsMinhas`, com teste.

## Etapas (cada uma testável sozinha)

1. Banco: situações novas (`em_transferencia`, `entregue`, problema,
   desistência), as transições e quem pode cada uma — testes PGlite.
2. Banco: o aviso nasce na transição (remetente Compras, um por vendedor e
   passo, observação só no de conferência) — testes PGlite.
3. Notificação no celular para os avisos do banco — conferida num aparelho.
4. Chat: o cartão agrupado com "Recebi" por peça e "Recebi tudo".
5. Telas: transferência, problema, desistência, entregue; validade de 24 h e
   aviso de corte na janela de encomendar.
6. Lembretes agendados e alertas no Painel de Compras.

## Situação (26/10/2026)

As 6 etapas estão no código, no local, com testes no banco montado (PGlite)
e nos lembretes. Na produção, junto com o resto do cotador:

1. `cotador-banco.sql` (a conversa com Compras e os recados) e
   `cotador-encomendas.sql` (estrutura nova, funções e recados).
2. Publicar de novo `lembrar-pendencias` (o arquivo gerado, colado inteiro).
3. `lembretes-encomendas.sql`, em duas vezes (simular, depois agendar).
4. Conferir a notificação no celular com um pedido de verdade.

Decisões de implementação:

- A previsão é em dias corridos: o maior número do prazo do fornecedor
  ("2–3 dias" → 3), gravada no pedido (`previsao_chegada`).
- O lembrete de Compras não abre uma tela específica; o do vendedor abre a
  conversa dele com Compras.
- Revisão de 26/10 (segundo benchmark): os avisos paralelos do navegador
  (AvisosDeCotacao) saíram. Não chegavam ao app Android, o toque não levava a
  lugar nenhum e um aviso apagava o outro; os recados os substituem.

### Benchmarks de 26/10/2026 (revisão de código em 4 rodadas)

Decidido ou corrigido nas rodadas:

- A resposta do comprador **sempre** vai ao vendedor pelo chat (a caixa
  "mandar pelo chat" saiu): é o único aviso dela.
- As colunas do recado só o banco grava (gatilho `recado_so_pelo_banco`):
  ninguém forja um "Em conferência" pela API.
- "No ar" é a regra do banco, lida pela coluna calculada `no_ar`.
- Os Relatórios leem em páginas de 1000 linhas (o teto da API) e avisam
  quando o período passa do teto das funções.

Limites conhecidos, para depois da produção:

- Cada página do relatório executa a função do período de novo, e o
  relatório aberto relê a cada rajada de mudanças: só pesa acima de alguns
  milhares de linhas no período.
- Duas contas existem dos dois lados DE PROPÓSITO, cada uma com teste que
  compara: o preço com o fator do Callcenter (`precoComFator` × `preco_de_venda`,
  3000 pares) e as aberturas dos recados (`ABERTURA` × `texto_do_aviso`).

Resolvido na 5ª rodada: a opção do comprador que já virou encomenda ativa
não pode ser apagada (corrigir para "não encontrei" ou responder de novo):
Compras cancela a encomenda antes, e o motivo avisa o vendedor.

## Devoluções ao fornecedor (Elias, 26/10/2026)

"Precisamos metrificar as devoluções, assim tendo maior controle e
qualidade nos procedimentos." Decidido: só as das encomendas; só registrar
que devolveu (sem acompanhar crédito); a visão é por fornecedor.

- Conta como devolução: problema resolvido com **Troca** (vem outra peça) ou
  **Devolvida** (sem reposição; a encomenda é cancelada), e o cliente que
  desistiu com a peça **devolvida ao fornecedor**. "Aceita como está" e
  "vai para o estoque" não contam.
- Grava `devolvida_em` e `motivo_devolucao` (o problema, ou `desistencia`).
- Relatórios: "Devoluções por fornecedor" — devolvidas ÷ pedidas no
  período, com os motivos; a tabela e o Excel de Fornecedores levam as
  mesmas colunas.

## A extensão para o comprador (Elias, 26/10/2026)

Decidido: baixar pelo CONECTA, com passo a passo (sem Chrome Web Store).

- Página: `/extensao.html` — baixar o `.zip`, extrair em `C:\Malachias`,
  "Carregar sem compactação"; e como atualizar (extrair por cima e ↻).
- O Painel de Compras mostra "Instalar a extensão" com a estação fora do ar,
  e "Extensão desatualizada (x → y) · atualizar" quando a versão do sinal é
  mais velha que `public/extensao/versao.json`.
- **Publicar uma versão nova:** suba o `version` do `manifest.json` da
  extensão, rode `bun scripts/empacotar.ts` na pasta da extensão (gera o
  `.zip` e o `versao.json` em `public/extensao/` do CONECTA) e publique o
  CONECTA. Sem subir a versão, o aviso de desatualizada não aparece.

## Fora do escopo

- Devolução ao fornecedor e garantia (o "Problema" só registra e avisa).
- Avisar o cliente direto (WhatsApp): o vendedor avisa, com a observação.
