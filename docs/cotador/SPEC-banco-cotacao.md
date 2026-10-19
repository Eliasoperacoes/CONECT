# Spec: banco-cotacao

Módulo 1 do [MAPA.md](MAPA.md). Só o banco: tabelas, regras de acesso e
funções. Nenhuma tela. Quem consome: `estacao` (grava), `precificacao`,
`orcamento` e `pedidos-compras` (leem).

## Objetivo

Guardar no Supabase do CONECTA, com segurança, o que a estação de compras
consulta nos B2Bs, e organizar os pedidos de cotação numa fila:

- **Fornecedores:** quais B2Bs existem e quais estão ligados.
- **Fila:** quem pediu cotação de que código, e em que pé está.
- **Preço do dia:** o resultado mais recente de cada fornecedor, peça e local
  (CD/filial). Vale o dia todo, no horário de Brasília. No dia seguinte é
  consultado de novo.
- **Similares:** a lista de similares que cada fornecedor informa para a peça.
- **Histórico:** uma linha por dia, fornecedor e peça, com o melhor preço,
  para a comparação ao longo do tempo.
- **Estação:** se está online e quais sites estão logados.

## Tabelas

Nomes e campos definitivos saem na implementação; isto é o contrato.

| Tabela | Uma linha é | Campos principais | Chave única |
|---|---|---|---|
| `fornecedores_b2b` | um B2B | `chave` (`roles`, `pellegrino`, `dpk`), `nome`, `ativo`, `ordem` | `chave` |
| `estacoes_cotacao` | um PC de compras | `nome` (ex.: `compras-matriz`), `atendida_por` (colaborador logado no CONECTA daquele PC), `visto_em`, `sites` (jsonb: chave → `ok`, `deslogado` ou `fora`), `versao_extensao` | `nome` |
| `cotacoes_b2b` | um pedido de cotação de um código | `id`, `codigo` (normalizado), `codigo_digitado`, `incluir_similares`, `pedida_por` (colaborador), `loja`, `situacao` (`na_fila`, `cotando`, `pronta`, `erro`), `estacao` (nome), `pegada_por` (colaborador), `criada_em`, `pegada_em`, `pronta_em`, `erro` | `id` |
| `precos_b2b` | o preço do dia de uma peça num local de um fornecedor | `fornecedor`, `codigo`, `local`, `em_sp`, `custo`, `quantidade` (nulo se o site não informa), `disponivel`, `proximidade`, `marca`, `descricao`, `grupo_fornecedor`, `consultado_em` | (`fornecedor`, `codigo`, `local`) |
| `similares_b2b` | um similar de uma peça num fornecedor | `fornecedor`, `codigo`, `codigo_similar`, `marca_similar`, `consultado_em` | (`fornecedor`, `codigo`, `codigo_similar`) |
| `historico_precos_b2b` | o melhor preço do dia | `dia`, `fornecedor`, `codigo`, `local`, `custo`, `situacao` (`SP`, `FORA DO ESTADO`, `SEM ESTOQUE`) | (`dia`, `fornecedor`, `codigo`) |

**Volume.** `precos_b2b` e `similares_b2b` são sobrescritos: só guardam o
último preço, sem crescer com o tempo. Quem cresce é o
`historico_precos_b2b` (uma linha por dia, fornecedor e peça cotada) e a
fila. Estimativa: 200 cotações por dia × 3 fornecedores = ~600 linhas por
dia, menos de 50 MB por ano. A fila apaga pedidos com mais de 90 dias.
Conferir em [LIMITES-SUPABASE.md](../LIMITES-SUPABASE.md) após 1 mês.

## Quem acessa o quê (RLS)

Três regras novas, com par em `tipos.ts` (tela) e no banco (vale):

- `posso_cotar()`: setor Balcão, setor Callcenter ou nível ≥ 3.
- `posso_ver_custo()`: setor Callcenter, setor Compras ou nível ≥ 3.
- `posso_atender_fila()`: setor Compras ou nível TI (5).

| Tabela | Ler | Gravar |
|---|---|---|
| `fornecedores_b2b` | quem cota, quem atende a fila | só TI (liga/desliga) |
| `estacoes_cotacao` | quem cota (online/sites), quem atende a fila | quem atende a fila, pela função de sinal |
| `cotacoes_b2b` | quem pediu, quem vê custo | só pelas funções abaixo |
| `precos_b2b`, `similares_b2b` | **quem vê custo** | só pela função de gravar |
| `historico_precos_b2b` | quem vê custo | só pela função de gravar |

**O custo não chega a quem não pode vê-lo.** O balconista **não lê** `precos_b2b`
direto. Ele verá preço de venda por uma função do módulo `precificacao`, que
lê o custo do lado do banco e devolve só a venda. Este módulo garante a
metade dele: a tabela fechada.

**Não existe login da estação** (decisão do Elias, 2026-10-19). O PC de
compras fica com o CONECTA aberto e logado por alguém de Compras. A página
do CONECTA pega o pedido na fila, entrega o código à extensão, recebe o
resultado e grava com o login de quem está ali. A extensão não fala com o
banco e não guarda credencial do CONECTA. Consequência: com o CONECTA
fechado ou deslogado no PC de compras, a fila espera e conta como estação
fora.

## Funções

| Função | Quem chama | O que faz |
|---|---|---|
| `pedir_cotacao(codigos text[], incluir_similares bool, forcar bool)` | quem cota | Para cada código: se todos os fornecedores ligados já têm preço de hoje e `forcar` é falso, não faz nada (já está pronto); senão cria um pedido na fila, ou reaproveita um igual que já esteja na fila. Devolve os ids |
| `pegar_proxima_cotacao(estacao text)` | quem atende a fila | Pega o pedido mais antigo `na_fila`, marca `cotando` e devolve. Dois pegadores nunca pegam o mesmo (`for update skip locked`). Pedido `cotando` há mais de 5 min volta para a fila |
| `gravar_cotacao(id, resultado jsonb)` | quem atende a fila | Numa transação: troca as linhas de `precos_b2b` e `similares_b2b` daquele código e fornecedor, grava o histórico do dia e marca o pedido `pronta` (ou `erro`, com a mensagem) |
| `sinal_da_estacao(estacao text, sites jsonb, versao text)` | quem atende a fila, a cada 1 min | Atualiza `visto_em` e `sites`. Estação sem sinal há mais de 3 min conta como **fora** |
| `preco_de_hoje(codigo)` | `precificacao` | Diz se cada fornecedor ligado tem preço de hoje (Brasília) para o código |

## Formato que a estação grava (contrato com o módulo `estacao`)

É o formato comum que os leitores já devolvem hoje (`escolha.js`), por fornecedor:

```json
{
  "fornecedor": "dpk",
  "peca": { "codigo": "OC90", "marca": "MAHLE METAL LEVE", "descricao": "...", "grupo": "FILTRO" },
  "ofertas": [{ "local": "RIB PRETO", "emSP": true, "preco": 9.65, "quantidade": 228, "disponivel": true, "proximidade": 1 }],
  "similares": [{ "codigo": "W7122", "marca": "MANN" }],
  "erro": null
}
```

Peça que o fornecedor não tem: `peca: null`, `ofertas: []`, e isso também é
gravado ("hoje a DPK não tem"), para não perguntar de novo no mesmo dia.

## Comandos

```bash
bun run test     # inclui os testes deste módulo
bun run lint
```

SQL: delta `supabase/cotador-banco.sql`, colado pelo Elias no SQL Editor
(regras do CLAUDE.md: só o delta, área de transferência com `-Encoding utf8`,
`select` de conferência no fim, `notify pgrst, 'reload schema'`).
`esquema.sql` atualizado junto.

## Estrutura

- `supabase/cotador-banco.sql`: delta.
- `supabase/esquema.sql`: as mesmas tabelas, funções e regras.
- `src/tipos.ts`: `podeCotar()` e `podeVerCusto()`, pares das funções do banco.
- `src/servicos/cotadorNoBanco.test.ts`: testes estruturais (lendo o SQL),
  no padrão de `alcadaNoBanco.test.ts`.

## Estratégia de testes

Estruturais, lendo o SQL, como o CONECTA já faz. Cada um precisa morder:

1. `precos_b2b`, `similares_b2b` e `historico_precos_b2b` **não têm** regra de
   leitura que deixe passar quem só cota (Balcão).
2. Ninguém grava direto em `precos_b2b`, `similares_b2b` e `historico_precos_b2b`: só a função de gravar, que exige `posso_atender_fila()`.
3. `pegar_proxima_cotacao` usa `skip locked`.
4. "Hoje" é sempre calculado em `America/Sao_Paulo`.
5. `podeCotar` / `posso_cotar` e `podeVerCusto` / `posso_ver_custo` aceitam os
   mesmos setores e níveis (o teste compara as listas nos dois lados).
6. As funções `security definer` têm `set search_path` e `revoke ... from public, anon`.

Conferência no banco real (Elias roda o `select` no fim do delta): as 3
linhas de `fornecedores_b2b` ligadas e as funções criadas.

## Limites

- **Sempre:** delta + `esquema.sql` juntos; regra nova com par em `tipos.ts`;
  função `security definer` com `search_path` fixo.
- **Perguntar antes:** mudar quem cota ou quem vê custo; guardar mais que o
  melhor preço por dia no histórico.
- **Nunca:** guardar senha, cookie ou chave de B2B; abrir `precos_b2b` para
  leitura de quem só cota; criar login à parte para a estação.

## Critérios de pronto

- [ ] Delta rodado pelo Elias; o `select` final mostra Roles, Pellegrino e DPK ligados.
- [ ] Um balconista logado consulta `precos_b2b` direto e recebe **vazio**.
- [ ] Um gerente consulta `precos_b2b` e vê as linhas.
- [ ] Dois `pegar_proxima_cotacao` ao mesmo tempo nunca devolvem o mesmo pedido.
- [ ] `pedir_cotacao` de um código com preço de hoje não cria pedido; com `forcar`, cria.
- [ ] Testes estruturais passando e mordendo.

## Perguntas em aberto

1. **Preço guardado com o horário de ontem às 23h:** "o dia todo" é o dia do
   calendário em Brasília (vira à meia-noite). Fica assim?
2. ~~Usuário da estação~~: não existe; quem atende é o login de Compras
   no CONECTA (decidido em 2026-10-19).
3. **Pedido parado:** pedido `cotando` há mais de 5 minutos volta para a fila
   (a estação caiu no meio). 5 minutos é razoável?
