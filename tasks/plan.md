# Plano: banco-cotacao (cotador B2B)

Especificação: [docs/cotador/SPEC-banco-cotacao.md](../docs/cotador/SPEC-banco-cotacao.md).
Mapa: [docs/cotador/MAPA.md](../docs/cotador/MAPA.md). Tarefas: [todo.md](todo.md).

## Visão geral

Só banco: tabelas, regras de acesso e funções do cotador. Tudo é feito e
provado primeiro no **Supabase local** (Docker). A produção só recebe o
delta depois de o Elias ver funcionando no local e mandar subir.

## Decisões

- **Um arquivo de delta**, `supabase/cotador-banco.sql`, crescendo tarefa a
  tarefa. Ao fim, o mesmo conteúdo entra no `esquema.sql`, como manda o
  CLAUDE.md.
- **Duas provas por regra.**
  - *Estrutural* (`bun run test`): lê o SQL, no padrão de
    `alcadaNoBanco.test.ts`. Não fala com banco nenhum.
  - *Comportamental*: `cotadorNoBanco.test.ts` monta o esquema inteiro num
    Postgres em memória (`scripts/bancoLocal.ts`, PGlite, já usado na casa)
    e entra no papel de cada pessoa (`como(uid)`). Roda no `bun run test`.
  - O Supabase do Docker recebe o mesmo delta, para ver nas telas.
- **Par tela × banco.** `podeCotar` e `podeVerCusto` ficam em `tipos.ts`. O
  teste compara as listas de setores e níveis dos dois lados. Vale o banco.
- **Sem login da estação** (Elias, 2026-10-19). Quem atende a fila é o
  colaborador de Compras logado no CONECTA do PC de compras
  (`posso_atender_fila()`: Compras ou TI). A extensão não fala com o banco.

## Ordem (cada tarefa deixa o banco funcionando)

1. Regras de quem cota, quem vê custo e quem atende a fila (+ par em `tipos.ts`)
2. Fornecedores (`fornecedores_b2b` + as 3 linhas)
3. Preços, similares e histórico com a leitura fechada (só quem vê custo)
4. Estação: `estacoes_cotacao` + `sinal_da_estacao` (online e sites logados)
   — *checkpoint com o Elias*
5. Fila: `cotacoes_b2b` + `pedir_cotacao`
6. `pegar_proxima_cotacao` (skip locked, volta após 5 min)
7. `gravar_cotacao` + `preco_de_hoje`
   — *checkpoint: todos os critérios de pronto no local*
8. Levar ao `esquema.sql`, gerar o delta final para a produção

## Riscos

| Risco | Impacto | Como reduzir |
|---|---|---|
| Alguém de Compras fora do PC de compras atender a fila sem a extensão | Baixo | A página só pega pedido se a extensão responder (módulo `estacao`) |
| Balconista ler custo por outro caminho (view, função, RPC do PostgREST) | Alto | Teste estrutural nas regras + conferência local por perfil; funções `security definer` sem `grant` a quem só cota |
| "Hoje" virar em UTC (21h de Brasília) | Médio | Uma função só para "hoje" em `America/Sao_Paulo`; teste lendo o SQL |
| `esquema.sql` fora de ordem para instalação do zero (a 1ª passada no local deu erro em `configuracoes`) | Baixo | O delta do cotador não depende disso; anotar para outra hora |

## Fora deste módulo

Telas, extensão (`estacao`), margem e preço de venda (`precificacao`).
