# Spec: cotar

Módulo 4 do [MAPA.md](MAPA.md) (era `orcamento`). Depende de `banco-cotacao`
e `precificacao`, prontos no local.

## Objetivo

O balconista digita o código da peça que não tem na loja e, em segundos,
sabe **por quanto vender, de onde vem e em quantos dias chega**, sem ver o
custo.

Decisões do Elias (20/10/2026):

- **Não existe orçamento no CONECTA**, nem dados do cliente. Só a cotação
  das peças.
- Depois de cotar, o próximo passo é o botão **"Pedir à Compras"**, que é do
  módulo seguinte (`pedidos-compras`). Neste módulo, o lugar dele fica
  reservado, sem funcionar.
- **"Minhas cotações do dia":** a lista do que a pessoa cotou hoje, para
  reabrir sem cotar de novo.
- **Computador e celular**, igualmente bons.
- **Prazo:** CD em SP → 2–3 dias para Pirassununga e 3–4 para as outras
  lojas; fora de SP → 7–10 dias. Vale a loja de quem cota.
- **Similares sempre** (Elias, 20/10): "caso o cliente peça outra opção
  mais barata, o vendedor já terá essa solução". Toda cotação busca os
  similares; não há caixa "incluir similares".
- **Seção "Ferramentas"** (Elias, 20/10): um lugar no CONECTA onde ficam os
  aplicativos internos, como blocos. Tocar no bloco abre a ferramenta.
  "Cotar" é a primeira; "Margens por marca" vai junto, e as próximas entram
  ali.

**Sucesso:** a Bia digita "oc90" no celular e, sem sair da tela, vê:
1. "Cotando…";
2. em até 30 s, a DPK por R$ 15,90 (RIB PRETO, 2–3 dias), o Roles por
   R$ 16,90 e a Pellegrino por R$ 18,90;
3. os similares, quando a peça não tem em SP ou quando ela pediu.

O Gil vê o mesmo, com o custo ao lado, em outra cor.

## A seção "Ferramentas"

Os aplicativos internos do CONECTA, num lugar só:

- **No computador:** o item "Ferramentas" na barra lateral, no lugar do
  "Cotação B2B" de agora. Ele abre uma grade de blocos (ícone, nome e uma
  linha do que faz).
- **No celular:** o item "Ferramentas" na barra de baixo, com a mesma grade.
- **Cada bloco aparece só para quem tem a permissão daquela ferramenta.**
  Quem não tem nenhuma não vê a seção. A permissão continua no catálogo de
  ferramentas, editável no painel ADM, e o banco continua sendo a trava.
- **Tocar no bloco abre a ferramenta em tela cheia**, com "voltar" para a
  grade.
- **Um bloco por sistema, e as partes dele em abas** (Elias, 21/10/2026:
  "é tudo dentro do mesmo lugar, de maneira organizada"). Sistema novo = um
  bloco; parte nova de um sistema = uma aba dele. Cada pessoa vê só as
  abas que pode usar; bloco sem aba não aparece.

O cotador é **um bloco só, "Cotação de peças"**, com as abas **Cotar** (quem
cota), **Fretes** (Compras e TI) e **Margens** (Gerente para cima); a
cotação humana entra como mais uma aba (**Solicitações**).

## A tela "Cotar"

Quem vê: quem cota (`podeCotar`: Balcão, Callcenter, nível ≥ 3). Abre pelo
bloco "Cotar" da seção Ferramentas.

```
┌ Cotar ─────────────────────────────────────────────────┐
│ [ oc90, hg5170                                ] [Cotar]  │
│ Estação de compras: no ar · 3 sites ok                    │
├──────────────────────────────────────────────────────────┤
│ OC90 · MAHLE · FILTRO OLEO          [Atualizar agora]     │
│  ● DPK         R$ 15,90   RIB PRETO · 228 un · 2–3 dias   │
│                (custo 8,69 · fator 1,80)  ← só quem vê    │
│  ● Roles       R$ 16,90   Ribeirão Preto · 3–4 dias       │
│  ● Pellegrino  R$ 18,90   Ribeirão Preto · 3–4 dias       │
│  ▸ Similares (6)                                          │
│                                     [Pedir à Compras] (em breve) │
├──────────────────────────────────────────────────────────┤
│ HG5170 · cotando… (na fila há 12 s)                       │
└──────────────────────────────────────────────────────────┘
  Minhas cotações do dia: OC90 · HG5170 · W7122 …
```

- **Vários códigos de uma vez**, separados por espaço, vírgula ou Enter.
  Cada código vira um cartão.
- **Andamento ao vivo** por cartão:
  - já tem preço de hoje → aparece na hora;
  - "na fila" ou "cotando…" → a tela confere a cada 3 s até ficar pronto;
  - "erro" → mostra o motivo e o botão de tentar de novo.
- **Estação fora do ar** (sem sinal há mais de 3 min) → o aviso
  "Estação de compras fora do ar: a peça fica aguardando cotação". Se houver
  preço de hoje, ele aparece.
- **Ordem dos fornecedores:** em SP pelo menor preço de venda; depois os de
  fora, com o selo **FORA DO ESTADO**; depois **SEM ESTOQUE**.
- **Similares sempre**, abertos, do mais barato para o mais caro, cada um
  com marca, venda, local e prazo. Toda cotação pede os similares
  (`incluir_similares` sempre ligado). Custo disso: a cotação demora um
  pouco mais, porque a estação consulta também os similares.
- **Marca com fator por tipo de peça** (ISAPA…): o aviso "o preço depende do
  tipo" e os preços de cada tipo, com o tipo citado na descrição marcado.
- **Custo e fator** só para quem vê custo, em cor diferente da venda.
- **Atualizar agora:** cota de novo, mesmo com preço de hoje (`forcar`).
- **Minhas cotações do dia:** os códigos que a pessoa cotou hoje, do mais
  recente para o mais antigo. Tocar reabre o cartão.

## O que muda no banco

- **Prazo num lugar só:** `prazo_de_entrega(em_sp, loja)` devolve "2–3
  dias", "3–4 dias" ou "7–10 dias". O `resultado_da_cotacao` passa a trazer
  o prazo, pela loja de quem pergunta.
- **Histórico do dia:** `cotacoes_do_dia` (colaborador, código, dia, hora).
  O `pedir_cotacao` registra cada código ali, inclusive quando já havia
  preço de hoje e nenhum pedido foi criado. Cada um lê só o próprio.
- **Andamento:** `andamento_da_cotacao(codigos[])` devolve, por código, a
  situação (pronta / na fila / cotando / erro, e o erro) e se a estação está
  no ar. É o que a tela confere a cada 3 s.

## Comandos

```bash
cd C:\Users\malac\antigravity\CONECTA-cotador
bun test src/servicos/cotarNoBanco.test.ts src/servicos/cotar.test.ts
bun run test && bun run lint
```

## Estrutura

- `supabase/cotador-cotar.sql`: prazo, histórico do dia e andamento.
- `src/servicos/cotar.ts`: separar os códigos, ordenar os fornecedores,
  decidir quando mostrar os similares, e conferir o andamento até ficar
  pronto. Sem tela, testável.
- `src/componentes/TelaCotar.tsx`: a tela, nos dois tamanhos.
- `src/servicos/ferramentasInternas.ts`: a lista dos blocos (chave de
  permissão, nome, ícone, descrição); `src/componentes/TelaFerramentas.tsx`:
  a grade e a ferramenta aberta.
- Ligações: `ferramentas.ts` (catálogo: `cotar_b2b`), `telasPorAssunto.ts`
  (a tela `ferramentas` no lugar do assunto "Cotação B2B"), ícones,
  `ConteudoWeb.tsx` e a barra de baixo do celular (`App.tsx`).

## Estratégia de testes

Todos precisam falhar quando a regra for quebrada de propósito:
1. **Prazo:** SP + Pirassununga = 2–3; SP + Descalvado = 3–4; fora = 7–10.
2. **Histórico:** quem pede vê só os próprios códigos do dia, inclusive os
   que já tinham preço.
3. **Andamento:** pronta / na fila / cotando, e a estação fora do ar.
4. **`cotar.ts`:** "oc-90, hg5170  w712/2" vira três códigos; a ordem SP →
   fora → sem estoque; o pedido sai sempre com similares; a conferência para
   quando todos ficam prontos ou dão erro.
5. **Ferramentas:** a Bia (Balcão) vê só o bloco "Cotar"; o Gil vê "Cotar" e
   "Margens"; o Edu (Estoque) não vê a seção; desligar a permissão no
   catálogo tira o bloco.

## Limites

- **Sempre:** venda, custo e prazo vêm do banco; a tela só desenha.
- **Perguntar antes:** mudar a regra de prazo ou a dos similares.
- **Nunca:** custo na resposta de quem não vê custo; dados do cliente;
  commit sem autorização; nada na produção.

## Critérios de pronto

- [ ] A Bia cota "oc90" no **celular** e no **computador** e vê a venda, o
  local e o prazo de cada fornecedor, sem custo.
- [ ] Uma peça sem preço de hoje mostra "cotando…" e fica pronta sozinha, sem
  recarregar.
- [ ] Com a estação fora (aba do Caio fechada), aparece o aviso.
- [ ] O Gil vê o custo em outra cor.
- [ ] "Minhas cotações do dia" lista o que a Bia cotou e reabre.
- [ ] Testes passando e mordendo.

- [ ] A seção Ferramentas aparece no computador e no celular, com os blocos
  certos para cada pessoa.

## Perguntas respondidas (Elias, 20/10)

1. **Onde fica "Cotar":** numa seção "Ferramentas" de aplicativos internos,
   no computador e no celular.
2. **Similares:** sempre, para o vendedor já ter a opção mais barata.
