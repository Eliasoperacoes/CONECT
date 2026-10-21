# Tarefas: cotar (e a seção Ferramentas)

Especificação: [docs/cotador/SPEC-cotar.md](../docs/cotador/SPEC-cotar.md), aprovada pelo Elias em 20/10/2026.
100% local, na pasta `CONECTA-cotador`. Commit só local e só com autorização.

## C1: Banco ✅
- [x] `prazo_de_entrega(em_sp, loja)`: 2–3, 3–4 ou 7–10 dias. O `resultado_da_cotacao` traz o prazo pela loja de quem pergunta.
- [x] `cotacoes_do_dia`: o `pedir_cotacao` registra cada código pedido, mesmo quando já havia preço; cada um lê só os próprios.
- [x] `andamento_da_cotacao(codigos)`: pronta / na fila / cotando / erro / sem pedido, mais se a estação está no ar.
- As funções mudam onde já moram (`cotador-banco.sql`, `cotador-precificacao.sql`), sem segunda cópia.
- Verificação: `cotarNoBanco.test.ts` mordendo. Aplicar no Docker.

## C2: Serviço `cotar.ts` ✅
- [x] Separar os códigos digitados; pedir sempre com similares; montar os cartões a partir do resultado (fornecedores SP → fora → sem estoque, similares do mais barato ao mais caro, tipos de peça); conferir o andamento a cada 3 s até todos ficarem prontos ou com erro.
- Verificação: `cotar.test.ts` com banco falso, mordendo.

## C3: Seção Ferramentas ✅
- [x] `ferramentasInternas.ts` (os blocos: Cotar, Margens) + `TelaFerramentas.tsx` (a grade e a ferramenta aberta).
- [x] Computador: "Ferramentas" na barra lateral, no lugar de "Cotação B2B". Celular: "Ferramentas" na barra de baixo, só para quem tem algum bloco.
- Verificação: teste de quem vê cada bloco; conferir o celular numa tela pequena.

## C4: Tela Cotar ✅
- [x] Os códigos, os cartões ao vivo, o aviso de estação fora do ar, custo em outra cor, Atualizar agora, Minhas cotações do dia, e o "Pedir à Compras" reservado.
- Verificação: lint; na mão, no computador e no celular.

- Também: `minhas_cotacoes_do_dia()` e `fornecedores_para_cotar()` no banco (a tela não lê tabela direto); 'ferramentas' entrou na lista de abas sem chave de catálogo (`ABAS_SEM_FERRAMENTA`); funções do servidor regeradas.

### Checkpoint com o Elias
- [ ] Os critérios de pronto da especificação no local, com a estação do Caio no ar.
