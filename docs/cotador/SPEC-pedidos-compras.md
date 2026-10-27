# Spec: pedidos-compras

Módulo do [MAPA.md](MAPA.md), depois de `historico-cotacao`. Intenção
confirmada pelo Elias em 21/10/2026, numa entrevista pergunta a pergunta.

## Objetivo

Hoje a encomenda vive no "lembra de pedir". Com este módulo:

1. O vendedor **encomenda pelo próprio cartão da cotação**.
2. Compras **monta os pedidos do dia por fornecedor**, olhando uma tela só.
3. O vendedor **acompanha a peça até receber**, sem perguntar a ninguém.

**O sistema não decide nada** (Elias): ele mostra a conta e as cores, e
quem resolve é o comprador. A parte comercial (o cliente aprovou, pagou)
fica fora.

**Sucesso:**
1. A Bia cota a OC90, escolhe a Roles, informa qtd 2 e "João 99999-0000", e
   confirma "Você tem certeza que deseja encomendar?".
2. O Caio vê na coluna da Roles "Bia · OC90 · 2 un." e a soma do custo
   ficando verde ao passar do mínimo de R$ 150.
3. O Caio fecha o pedido, e a Bia recebe no chat "Sua encomenda foi
   realizada".
4. A peça chega. O Caio marca "Em conferência", e a Bia recebe o cartão com
   o botão **"Recebi"**. Ela toca nele e a encomenda termina.

## O ciclo da encomenda

| Situação | Quem muda | O que acontece |
|---|---|---|
| **Encomendada** | Vendedor: "Encomendar" + confirmação | Aparece na coluna do fornecedor, para Compras, na hora |
| **Cancelada** | Vendedor, **até o horário de corte** (15h59, configurável) | Sai da coluna |
| **Pedido realizado** | Compras, ao fechar o pedido do fornecedor | Vendedor: mensagem no chat + notificação "Sua encomenda foi realizada" |
| **Em conferência** | Compras, quando a peça chega ao estoque | Vendedor: cartão no chat "Sua peça X chegou e está em conferência", com o botão **Recebi** |
| **Recebida** | Vendedor, pelo botão do chat (ou pela aba Encomendas) | Fim |

**Corte do cancelamento:** a encomenda pode ser cancelada até o **primeiro
horário de corte depois de ser feita**. Feita às 10h, até as 15h59 do mesmo
dia; feita às 17h, até as 15h59 do dia seguinte. Depois do corte, só Compras
mexe nela.

## O vendedor (Balcão, Callcenter, Gerente+)

**No cartão da cotação (aba Cotar):**
- Cada bloco de fornecedor ganha **"Encomendar"** na peça e em cada similar.
- A resposta do comprador (fora do B2B) também ganha **"Encomendar"** em
  cada opção.
- Encomendar abre uma janela curta:
  - mostra o que foi escolhido (peça, marca, fornecedor, venda, prazo);
  - **quantidade**, começando em 1;
  - **observação**, para o nome ou o telefone do cliente;
  - a confirmação **"Você tem certeza que deseja encomendar?"**.
- O cartão mostra o que já foi encomendado daquela peça, para ninguém
  encomendar duas vezes sem perceber.

**Aba nova "Encomendas"** (no bloco "Cotação de peças"):
- As minhas encomendas e a situação de cada uma.
- **Cancelar**, enquanto o corte não passou, mostrando até quando dá.
- **Recebi**, quando estiver em conferência.

## Compras: o painel de pedidos

Uma aba **"Pedidos"** no bloco "Cotação de peças", dividida em partes para
não poluir a tela:

1. **Montar pedidos** (a tela do dia a dia):
   - **Uma coluna por fornecedor**, com as encomendas: vendedor, loja, peça,
     marca, quantidade, custo e há quanto tempo.
   - No topo da coluna, a conta: **soma do custo × pedido mínimo**.
     - **Verde** quando fecha o mínimo.
     - **Vermelho** com quanto falta ("faltam R$ 60").
   - **"Pedido realizado"** na coluna: o comprador marca as encomendas que
     entraram (todas vêm marcadas) e confirma. Cada vendedor é avisado.
   - Encomenda que não entra no pedido **fica na coluna** para o dia
     seguinte. O sistema mostra há quantos dias ela espera; não faz mais nada.
2. **Aguardando chegada:** os pedidos realizados, por fornecedor e dia.
   **"Em conferência"** por peça, quando ela chega.
3. **Em conferência:** o que espera o "Recebi" do vendedor, e há quanto tempo.
4. **Configurações:**
   - **Pedido mínimo** de cada fornecedor. Começa com a tabela que o Elias
     mandou (`fretes-fornecedores.json`): Roles R$ 150, DPK R$ 150,
     Pellegrino R$ 150.
   - O **horário de corte** do cancelamento (15h59).

O número de encomendas novas aparece na aba, como nas Solicitações.

## O chat (o mesmo caminho do cartão da cotação respondida)

- **"Pedido realizado"** e **"Em conferência"** chegam ao vendedor como
  **cartão** na conversa direta com o comprador, mandados **automaticamente**
  ao marcar.
- O cartão de "Em conferência" tem o botão **"Recebi"**, que encerra a
  encomenda **sem sair do chat**.
- A notificação com o app fechado é a do próprio chat.
- **O que o cartão leva:**
  - peça, marca, fornecedor e quantidade;
  - **nunca o custo**;
  - **nunca a observação**, que tem o nome ou o telefone do cliente.
    Conversa de chat se encaminha. A observação aparece na aba Encomendas.
- **No banco:** a mensagem ganha uma coluna `encomenda_id`. Como
  `cotacao_codigo`, ela só vai na mensagem que tem encomenda: se faltar no
  banco, falha só o cartão, e o chat continua.

## No banco

- `encomendas`:
  - **o que foi escolhido, congelado na hora:** código, marca, descrição,
    fornecedor (a chave do B2B, ou o nome, para quem é de fora), local,
    venda, **custo** e prazo;
  - quantidade e observação;
  - vendedor e loja;
  - situação, e quem mudou e quando, em cada etapa.
- **O custo é lido no banco, não mandado pela tela:**
  - a encomenda de B2B pega o custo do preço do dia;
  - a do comprador pega o da resposta (pode não ter: a coluna mostra "sem
    custo").
  - O Balcão encomenda sem nunca ter visto o custo.
- **Quem lê:**
  - o vendedor, as dele, **sem o custo** se não vê custo;
  - Compras e TI, todas.
  - Lê por funções, como o `resultado_da_cotacao`; a tabela não tem leitura
    direta.
- **Quem muda:**
  - o vendedor: cancelar (até o corte) e Recebi, só nas dele;
  - Compras: pedido realizado e em conferência.
  - Cada mudança só vale a partir da situação certa: não se marca "Em
    conferência" no que não foi pedido.
- **A jornada de cada encomenda (22/10/2026, base das métricas):** a encomenda
  guarda de onde nasceu — a foto da cotação (`consulta_id`) ou a solicitação
  ao comprador (`solicitacao_id`) — e quando foi cotada (`cotada_em`).
  `jornada_das_encomendas(de, ate)` devolve uma linha por encomenda com cada
  etapa no tempo: cotada → pedida ao comprador → respondida → encomendada →
  pedido → chegou → recebida/cancelada. O vendedor vê as dele; Compras e
  Gerência, todas; o custo só para quem vê custo. É o que o módulo
  `insights-cotacao` vai medir.
- `fornecedores_b2b` ganha `pedido_minimo`. Para os fornecedores de fora, a
  coluna aparece sem mínimo.
- Uma linha de configuração de Compras com o `horario_corte`.
- `encomendas` em tempo real, para a coluna de Compras se mexer sozinha.

## Comandos

```bash
cd C:\Users\malac\antigravity\CONECTA-cotador
bun test src/servicos/encomendasNoBanco.test.ts src/servicos/encomendas.test.ts
bun run test && bun run lint
```

## Estrutura

- `supabase/cotador-encomendas.sql`: tabela, regras, funções, pedido mínimo,
  corte e `mensagens.encomenda_id`.
- `src/servicos/encomendas.ts`: encomendar, cancelar, as colunas com a conta
  do mínimo, o prazo de cancelamento, as mudanças de situação, ouvir em
  tempo real e as mensagens do chat.
- `src/componentes/cotador/JanelaEncomendar.tsx`: a janela de encomendar.
- `src/componentes/TelaEncomendas.tsx`: a aba do vendedor.
- `src/componentes/TelaPedidos.tsx`: o painel de Compras, com as quatro partes.
- `CartaoDaCotacao.tsx`: os botões "Encomendar".
- `TelaConversa.tsx`: o cartão da encomenda e o botão Recebi.
- `ferramentasInternas.ts` e `ferramentas.ts`: as abas novas e as permissões.

## Estratégia de testes

Todos precisam falhar quando a regra for quebrada de propósito:

1. **Quem encomenda e quem muda o quê:**
   - quem cota encomenda; o Estoque, não;
   - só Compras marca pedido realizado e em conferência;
   - só o dono cancela e confirma o Recebi.
2. **O custo:**
   - a encomenda guarda o custo do banco, mesmo feita pela Bia;
   - a Bia não o lê; o Caio lê.
3. **O corte:**
   - feita às 10h cancela até as 15h59;
   - feita às 17h, até as 15h59 do dia seguinte;
   - depois disso, recusa;
   - o horário muda pela configuração.
4. **A ordem das situações:** recusa "em conferência" no que não foi pedido,
   e "Recebi" no que não chegou.
5. **A conta da coluna:**
   - soma do custo × quantidade contra o mínimo;
   - verde e vermelho com quanto falta;
   - o fornecedor sem mínimo fica neutro.
6. **O chat:** nunca leva o custo nem a observação; `encomenda_id` só vai na
   mensagem da encomenda.

## Limites

- **Sempre:**
  - o custo vem do banco e nunca chega a quem não vê custo;
  - o sistema só mostra: não junta, não troca fornecedor e não fecha pedido
    sozinho.
- **Perguntar antes:** mudar quem muda cada situação; mandar a observação
  pelo chat.
- **Nunca:** commit sem autorização; nada na produção (100% local).

## Critérios de pronto

- [ ] A Bia encomenda pela cotação, de B2B e de resposta do comprador, com
  quantidade e observação, depois de confirmar.
- [ ] O Caio vê a encomenda chegar na coluna, na hora, com a conta verde ou
  vermelha.
- [ ] A Bia cancela antes do corte e não consegue depois.
- [ ] O Caio fecha o pedido da coluna, e a Bia recebe a mensagem e a
  notificação.
- [ ] O Caio marca "Em conferência", e a Bia toca em "Recebi" no chat.
- [ ] Pedido mínimo e corte mudam pela aba Configurações.
- [ ] Celular e computador igualmente bons.
- [ ] Testes passando e mordendo.

## Perguntas em aberto (com o meu palpite)

1. **Compras pode cancelar uma encomenda** (o fornecedor não tinha a peça)?
   Palpite: sim, com o motivo obrigatório e o vendedor avisado no chat.
2. **O pedido mínimo é sobre o custo**, sem o frete? Palpite: sim, é o que o
   fornecedor cobra.
3. **As abas:** "Encomendas" para o vendedor e "Pedidos" para Compras, no
   mesmo bloco "Cotação de peças". Compras também vê "Encomendas" (as
   próprias, se encomendar)? Palpite: sim.
