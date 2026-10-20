# Tarefas: banco-cotacao

Plano: [plan.md](plan.md). Tudo provado no Supabase local antes da produção.

Comandos de verificação (abreviados abaixo):
- **teste**: `bun test src/servicos/cotadorNoBanco.test.ts` (Postgres em memória, entrando como cada pessoa) e depois `bun run test`
- **local**: aplicar `supabase/cotador-banco.sql` no contêiner `supabase_db_CONECTA`

## Tarefa 1: Quem cota, quem vê custo, quem atende a fila ✅
- [x] `posso_cotar()`: Balcão, Callcenter ou nível ≥ 3. `posso_ver_custo()`: Callcenter, Compras ou nível ≥ 3. `posso_atender_fila()`: Compras ou nível 5. Todas `security definer`, com `search_path` fixo e sem acesso anônimo.
- [x] `podeCotar`, `podeVerCusto` e `podeAtenderFila` em `tipos.ts`. O teste compara as listas com o SQL e morde se uma delas mudar.
- Verificação: teste. No local, um colaborador de cada setor responde certo.
- Arquivos: `supabase/cotador-banco.sql`, `src/tipos.ts`, `src/servicos/cotadorNoBanco.test.ts`, `supabase/conferir-cotador-local.sql`. **P**

## Tarefa 2: Fornecedores ✅
- [x] `fornecedores_b2b` com `roles`, `pellegrino` e `dpk` ligados. Lê quem cota. Grava só TI.
- Verificação: teste. No local, o balconista lê as 3 linhas e não consegue desligar nenhuma.
- Depende de: 1. **P**

## Tarefa 3: Preços, similares e histórico fechados ✅
- [x] `precos_b2b`, `similares_b2b` e `historico_precos_b2b`, com as chaves únicas da especificação.
- [x] Lê só quem vê custo. Ninguém grava direto.
- [x] O teste morde se uma regra de leitura deixar passar quem só cota.
- Verificação: teste. No local, com uma linha semeada, o balconista recebe **vazio** e o gerente recebe a linha.
- Depende de: 1. **P**

## Tarefa 4: Estação ✅
- [x] `estacoes_cotacao` e `sinal_da_estacao(estacao, sites, versao)`: grava `visto_em`, os sites e quem está atendendo. Mais de 3 min sem sinal conta como fora (`estacao_online`).
- [x] Só quem atende a fila dá sinal. Quem cota lê se a estação está online.
- Verificação: teste. No local: o usuário de Compras dá sinal, o balconista vê "online" e recebe erro ao tentar dar sinal.
- Depende de: 1. **P**

### Checkpoint A (Elias)
- [ ] `bun run test` e `bun run lint` passando.
- [ ] Conferência local mostrando balconista, gerente e compras, cada um com o seu acesso.

## Tarefa 5: Fila e pedido ✅
- [x] `cotacoes_b2b` e `pedir_cotacao(codigos, incluir_similares, forcar)`, com código normalizado. Reaproveita pedido igual que ainda está na fila. Não cria pedido se todos os fornecedores ligados têm preço de hoje, a menos que `forcar` seja verdadeiro.
- [x] Quem pede vê o próprio pedido; quem vê custo vê todos.
- [x] Adiantados da tarefa 7, porque o pedido depende deles: `hoje_brasilia()`, `normalizar_codigo()` e `preco_de_hoje()`.
- [ ] Pendente: apagar pedidos com mais de 90 dias (entra na tarefa 7).
- Verificação: teste. No local: pedir duas vezes cria 1 pedido; com preço de hoje, 0; com `forcar`, 1.
- Depende de: 4. **P**

## Tarefa 6: Pegar o próximo pedido
- [ ] `pegar_proxima_cotacao`: o mais antigo `na_fila` vira `cotando`, com `for update skip locked`. Pedido `cotando` há mais de 5 minutos volta para a fila.
- [ ] Só quem atende a fila chama.
- Verificação: teste (morde sem o `skip locked`). No local: duas sessões ao mesmo tempo pegam pedidos diferentes, e o balconista recebe erro de permissão.
- Depende de: 5. **P**

## Tarefa 7: Gravar e "preço de hoje"
- [ ] `gravar_cotacao(id, resultado)` no formato da especificação. Numa transação: troca preços e similares, grava o histórico do dia (o melhor preço) e marca o pedido `pronta` ou `erro`. Peça que o fornecedor não tem também é gravada.
- [ ] `preco_de_hoje(codigo)` em `America/Sao_Paulo`, por uma função única de "hoje".
- Verificação: teste. No local, gravar o JSON da OC90 (DPK, RIB PRETO, R$ 9,65): o gerente vê o preço, o pedido fica pronto e `preco_de_hoje` diz sim.
- Depende de: 6. **M**

### Checkpoint B
- [ ] Todos os critérios de pronto da especificação provados no local.
- [ ] Elias viu e decide subir para a produção.

## Tarefa 8: Levar à produção
- [ ] Mesmo conteúdo no `esquema.sql`, delta final revisado, `select` de conferência no fim e `notify pgrst`.
- [ ] Delta na área de transferência, só quando o Elias pedir.
- Verificação: teste dos delimitadores `.sql`, `bun run test` e `bun run lint`. Elias roda e o `select` mostra os 3 fornecedores.
- Depende de: checkpoint B. **P**
