# Spec: cotacao-humana

Módulo novo do [MAPA.md](MAPA.md), entre `cotar` e `pedidos-compras`
(Elias, 21/10/2026).

## Objetivo

Quando os B2Bs **não têm a peça**, ou o cliente **não quer o similar**, o
vendedor pede ao **comprador** que cote por fora (WhatsApp, telefone, outros
fornecedores). O comprador recebe **"Nova solicitação de cotação"**, responde
com fornecedor, preço e prazo, e o vendedor recebe **"Cotação respondida:
peça X"**.

Decisões do Elias (21/10/2026):

- **O vendedor manda:** o código (já preenchido da cotação), o veículo ou
  aplicação, e uma observação livre ("cliente não quer o similar", "precisa
  ser marca X").
- **O comprador responde:** fornecedor, preço e prazo. **Fora do B2B, o
  comprador já soma o frete e a margem**: ele informa direto o **preço de
  venda**. Para o "com ou sem margem, conforme o vendedor", ele pode informar
  também o **custo** (opcional), que só quem vê custo enxerga (Callcenter,
  Compras, Gerente+). O Balcão vê só a venda.
- **Prazo:** texto livre ("2 dias", "amanhã à tarde").
- **Os dois são avisados:** o comprador de cada solicitação nova; o vendedor
  de cada resposta.
- **Tudo no mesmo lugar** (Elias, 21/10: "foi um absurdo criar uma nova
  ferramenta de algo que faz parte do mesmo ecossistema"): não há bloco
  novo. As solicitações são uma **aba do bloco "Cotação de peças"**, ao
  lado de Cotar, Fretes e Margens.

**Sucesso:** a Bia cota uma peça que nenhum B2B tem, toca **"Pedir ao
comprador"**, informa "Gol 1.0 2012" e manda. O Caio recebe o aviso na hora,
responde "Barros, venda R$ 89,90, custo R$ 45,00, 2 dias", e a Bia recebe
"Cotação respondida: peça X" e vê **R$ 89,90**, sem o custo.

## Como funciona

**Na tela Cotar (vendedor):**
- Em todo cartão, o botão **"Pedir ao comprador"**: abre o código (já
  preenchido), o veículo/aplicação e a observação, e envia.
- O cartão mostra a situação da solicitação: aguardando o comprador /
  respondida / não encontrada.
- A resposta aparece no próprio cartão, como mais uma linha de fornecedor,
  com o selo **COTADO PELO COMPRADOR**: a venda que o comprador informou,
  e o custo só para quem vê custo.
- "Minhas cotações do dia" mostra também as solicitações.

**Aba "Solicitações" no bloco "Cotação de peças" (Compras e TI):**
- O **número de pendentes** na própria aba e no bloco da seção Ferramentas.
- A lista do que está aberto, da mais antiga para a mais nova: código,
  veículo, observação, vendedor, loja e há quanto tempo.
- **Responder:** uma ou mais opções (fornecedor, marca, **preço de venda**,
  custo opcional, prazo, observação). Ou **"Não encontrei"**, com o motivo.

**A conta da venda:** não há conta. O comprador informa a venda já com
frete e margem; o banco só guarda e mostra.

## O chat do CONECTA (Elias, 21/10/2026)

- **A solicitação aparece no painel do comprador** (a aba Solicitações),
  organizada: código, veículo, observação, vendedor, loja.
- **Ao responder, o comprador tem a opção de mandar a resposta pelo chat,
  automaticamente**: o CONECTA escreve na conversa direta comprador ↔
  vendedor uma mensagem pronta ("Cotação da peça X: Barros, R$ 89,90, 2
  dias"), sem o comprador digitar de novo. A conversa segue ali se
  precisarem trocar ideia.
- **A resposta sai no painel de cotação do vendedor** (o cartão, com o selo
  COTADO PELO COMPRADOR). A mensagem no chat é o **mecanismo contra o
  esquecimento**: o aviso do chat já chega no celular, mesmo com o app
  fechado.
- **"Vista":** quando o vendedor abre o resultado, a solicitação fica
  marcada como vista. **Lembretes até o vendedor ver** (a outra ideia do
  Elias) ficam para o módulo `avisos-cotacao`, que já trata dos lembretes;
  aqui a marca de "vista" já fica pronta para eles.
- **O custo nunca vai no chat:** a mensagem automática leva só a venda, o
  fornecedor e o prazo. Conversa de chat pode ser lida por qualquer um
  dos dois lados e encaminhada.

## Avisos

- **Para o comprador:** "Nova solicitação de cotação: peça X — Bia
  (Pirassununga)".
- **Para o vendedor:** "Cotação respondida: peça X" (ou "não encontrada").
- **Como chegam:**
  - **com o CONECTA aberto:** na hora, pelo banco em tempo real, como a
    estação, e com notificação do navegador;
  - **com o app fechado:** pelo caminho que o CONECTA já usa
    (`enviar-aviso`, push no celular), com dois tipos novos de aviso.
- **No local:** a função `enviar-aviso` não roda no Supabase do Docker,
  então lá só dá para provar o aviso com o CONECTA aberto. O push com o app
  fechado só dá para provar na produção.

## No banco

- `solicitacoes_cotacao`: código, veículo, observação, quem pediu, loja,
  situação (aberta / respondida / não encontrada), quem respondeu, quando,
  e **quando o vendedor viu** a resposta.
- `respostas_cotacao`: a solicitação, o fornecedor (texto livre, porque é
  quem não é B2B), a marca, a venda, o custo (opcional), o prazo e a
  observação.
- **Quem lê:** o vendedor vê as próprias solicitações; Compras e TI veem
  todas.
- **O custo da resposta não chega a quem não vê custo:** a resposta é lida
  por uma função que devolve a venda para todos e o custo só para quem pode,
  igual ao `resultado_da_cotacao`.
- **Quem responde:** só Compras e TI (`posso_atender_fila`).

## Comandos

```bash
cd C:\Users\malac\antigravity\CONECTA-cotador
bun test src/servicos/cotacaoHumanaNoBanco.test.ts src/servicos/cotacaoHumana.test.ts
bun run test && bun run lint
```

## Estrutura

- `supabase/cotador-banco.sql`: as tabelas, as regras e as funções.
- `src/servicos/cotacaoHumana.ts`: pedir, listar, responder e ouvir em tempo real.
- `src/componentes/TelaSolicitacoes.tsx`: a aba de Compras, dentro de "Cotação de peças".
- `TelaCotar.tsx`: o botão, o formulário curto e a resposta no cartão.
- `ferramentasInternas.ts`: a parte nova do bloco do cotador; `ferramentas.ts`: a chave de permissão dela.
- `envioDeAviso.ts` e a função `enviar-aviso`: os dois tipos de aviso.

## Estratégia de testes

Todos precisam falhar quando a regra for quebrada de propósito:
1. Quem cota pede; o Estoque não pede.
2. O vendedor vê só as próprias solicitações; Compras vê todas.
3. Só Compras e TI respondem.
4. A Bia vê a venda da resposta sem o custo; o Gil vê os dois.
5. O aviso vai para Compras na solicitação e para quem pediu na resposta,
   e para mais ninguém.

## Limites

- **Sempre:** a venda vem do banco; o custo nunca chega a quem não vê custo.
- **Perguntar antes:** mudar quem responde ou quem é avisado.
- **Nunca:** commit sem autorização; nada na produção (100% local).

## Critérios de pronto

- [ ] A Bia pede ao comprador a partir de um cartão, com veículo e observação.
- [ ] O Caio, com o CONECTA aberto, recebe o aviso na hora e vê a solicitação.
- [ ] O Caio responde, e a Bia recebe "Cotação respondida" e vê a venda, sem custo.
- [ ] Com a opção marcada, a resposta chega também na conversa Caio ↔ Bia no
  chat, sem o custo.
- [ ] Quando a Bia abre o resultado, a solicitação fica marcada como vista.
- [ ] "Não encontrei" também avisa a Bia.
- [ ] Testes passando e mordendo.

## Perguntas respondidas (Elias, 21/10/2026)

1. **Frete:** o comprador já soma no valor.
2. **Margem:** fora do B2B, o comprador já soma a margem — informa a venda.
3. **Prazo:** texto livre.
4. **Onde fica:** dentro do bloco "Cotação de peças", como aba; nada de bloco novo.
