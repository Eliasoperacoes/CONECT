# Spec: estacao

Módulo 2 do [MAPA.md](MAPA.md). Depende de `banco-cotacao`, que está pronto
no local. Mora em dois lugares: a extensão (`C:\Users\malac\ef\cotador-b2b`)
e uma parte pequena do CONECTA.

## Objetivo

O PC de compras atende a fila sozinho. A pessoa de Compras só precisa
deixar abertos o CONECTA (logado) e as abas dos B2Bs (logadas):

1. O CONECTA percebe a extensão e passa a ser **estação**.
2. A cada minuto, dá o sinal (`sinal_da_estacao`) com a situação de cada
   site: `ok`, `deslogado` ou `fora` (aba fechada).
3. Quando há pedido na fila, pega (`pegar_proxima_cotacao`), entrega o
   código à extensão, recebe o resultado e grava (`gravar_cotacao`).

A extensão **não fala com o banco** e não guarda credencial do CONECTA
(decisão do Elias, 19/10). Quem grava é a página, com o login de quem está
ali.

**Sucesso:** o balconista pede a OC90 no banco local; em menos de 30 s, sem
ninguém clicar nada no PC de compras, o pedido fica `pronta` com os preços
dos 3 B2Bs.

## Como as duas partes conversam

```
CONECTA (aba logada)                  Extensão
  estacaoCotacao.ts  ──postMessage──▶  conecta-ponte.js (content script)
                     ◀──postMessage──        │ chrome.runtime
                                             ▼
                                       servico.js ──executeScript──▶ abas dos B2Bs
                                       (cotacao.js: o "cotar" que hoje
                                        mora no painel, compartilhado)
```

- **`conecta-ponte.js`**: content script só nas origens do CONECTA
  (`https://conectamalachias.vercel.app/*` e `http://localhost:3000/*`).
  Aceita só mensagens da própria janela (`event.source === window`) com a
  marca `cotador-b2b`, e repassa ao service worker.
- **Mensagens** (página → extensão; a resposta volta com o mesmo `id`):

| Tipo | Ida | Volta |
|---|---|---|
| `ola` | — | `{ versao, sites: { roles, pellegrino, dpk } }` com `ok`, `deslogado` ou `fora` |
| `cotar` | `{ codigo, incluirSimilares }` | `{ resultados: [...] }` no formato de `gravar_cotacao`, um item por fornecedor |

- **`cotacao.js`** (novo, na extensão): o `cotarSite` e o `lerNaPagina` saem
  do `cotar.js` do painel para um arquivo que o painel e o service worker
  usam. Uma regra, um lugar: o botão "Cotar" do painel continua igual.
- **Fornecedor = chave do banco.** Cada site da lista ganha `fornecedor`
  (`roles`, `pellegrino`, `dpk`), igual a `fornecedores_b2b.chave`.
- **Situação do site:** `fora` se não há aba aberta; `deslogado` se a última
  leitura deu "sem sessão" e nenhuma deu certo depois; senão `ok`.

## O laço no CONECTA

`src/servicos/estacaoCotacao.ts`, ligado no `App.tsx`, roda só quando as
duas coisas são verdade: `podeAtenderFila(colaborador)` e a extensão
respondeu ao `ola`. Em qualquer outro PC, ou para qualquer outra pessoa,
não faz nada (nem chamada ao banco).

- **Sinal:** a cada 60 s.
- **Fila:** o pedido chega pelo tempo real na hora; de reserva, a cada 30 s
  (era 5 s: 17 mil chamadas por dia, quase todas de fila vazia), se não está
  cotando, chama `pegar_proxima_cotacao`.
  Um pedido por vez.
- **Prazo:** a extensão tem 90 s para responder. Sem resposta, grava erro
  em todos os fornecedores, e o pedido fica `erro`. O balconista pode pedir
  de novo.
- **Nome da estação:** `compras` (fixo por enquanto).
- **Tela:** nenhuma neste módulo. Um aviso discreto ("Estação de cotação
  ativa · 3 sites ok") no topo para quem atende a fila. A tela de cotar é do
  módulo `orcamento`.

## Similares com preço (ajuste no banco)

O leitor já devolve cada similar com as suas ofertas (`{ peca, ofertas }`).
O balconista precisa do preço do similar quando a peça não tem em SP.
Proposta: a estação manda os similares com as ofertas, e o `gravar_cotacao`
grava esse preço em `precos_b2b` com o código do próprio similar (e liga os
dois em `similares_b2b`). É um ajuste pequeno no módulo `banco-cotacao`,
com teste.

## Comandos

```bash
# extensão
cd C:\Users\malac\ef\cotador-b2b && bun test
# CONECTA
bun test src/servicos/estacaoCotacao.test.ts && bun run test && bun run lint
```

## Estrutura

- Extensão: `cotacao.js` (novo), `conecta-ponte.js` (novo), `servico.js`,
  `cotar.js` (passa a usar `cotacao.js`), `manifest.json`,
  `teste/cotacao.test.js`, `teste/conecta-ponte.test.js`.
- CONECTA: `src/servicos/estacaoCotacao.ts` + teste, `src/App.tsx` (liga o
  laço), `supabase/cotador-banco.sql` (similares com preço).

## Estratégia de testes

- **Extensão (bun + linkedom):**
  - o resultado de cada leitor vira o formato do banco, inclusive "sem peça",
    sessão vencida e similares;
  - a ponte ignora mensagem de outra janela ou sem a marca.
- **CONECTA (bun, sem banco):** o laço com um banco falso e uma extensão
  falsa. Sem extensão, nada é chamado. Um pedido por vez. 90 s sem resposta
  grava erro. Quem não atende a fila não liga o laço.
- **Ponta a ponta no local:** Docker + `bun run dev` + extensão carregada +
  abas dos B2Bs logadas. A Bia pede a OC90 e o pedido fica pronto sozinho.

## Limites

- **Sempre:** a extensão só conversa com as origens do CONECTA; a resposta
  só volta para a janela que perguntou.
- **Perguntar antes:** pôr o endereço da produção para valer (o content
  script já o lista, mas o banco de produção não tem as tabelas).
- **Nunca:** a extensão guardar o login do CONECTA ou falar com o Supabase;
  token, cookie ou chave de B2B sair da aba do site; cotar sem pedido na
  fila (nada de varredura sozinha).

## Critérios de pronto

- [ ] Com o CONECTA local aberto como Caio (Compras) e a extensão
  carregada, `estacoes_cotacao` mostra `compras` no ar, com os 3 sites.
- [ ] Fechar a aba da DPK: em até 60 s, `dpk` aparece como `fora`.
- [ ] A Bia pede a OC90: em até 30 s o pedido fica `pronta`, e o Gil vê os
  preços.
- [ ] Logado como Bia (Balcão) com a extensão no mesmo navegador: nenhuma
  chamada de fila nem de sinal.
- [ ] O botão "Cotar" do painel continua funcionando igual.
- [ ] Testes passando e mordendo nos dois repositórios.

## Perguntas em aberto

1. **Similares com preço:** gravar o preço do similar com o código dele
   (proposta acima)? Sem isso o balconista vê só "similar: W712/2 (MANN)",
   sem preço.
2. **Uma estação ou mais:** começo com uma, chamada `compras`. Se um dia
   houver dois PCs de compras, cada um ganha um nome, e o banco já aguenta
   os dois (`skip locked`).
3. **Pedido sem resposta em 90 s vira `erro`:** ou prefere deixar voltar
   para a fila sozinho depois de 5 min (já existe)? Sugiro `erro`, para o
   balconista saber logo.
